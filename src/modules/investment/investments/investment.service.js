const Investment = require("./investment.model");
const Startup = require("../startups/startup.model");
const stripeService = require("../../payments/stripe.service");
const notificationService = require("../../notifications/notification.service");
const { NotFoundError, UnprocessableEntityError, CODES } = require("../../../common/errors/AppError");
const { parsePagination, buildPagination } = require("../../../common/utils/pagination");
const money = require("../../../common/utils/money");
const logger = require("../../../common/utils/logger");

const SORTABLE = ["createdAt", "amountCents", "status"];

// ---------------------------------------------------------------------------
// Funding capacity
//
// The invariant is `raisedSoFarCents + reservedCents <= totalRaisingCents`, and
// MongoDB enforces it, not this process: every capacity change is a single
// conditional update on the startup document whose filter *is* the invariant
// ($expr compares the document's own fields). Read-compare-write would let two
// concurrent investors both see room for the same last slice of a round.
// ---------------------------------------------------------------------------
const withinTarget = (amountCents, ...fields) => ({
  $expr: { $lte: [{ $add: [...fields.map((field) => `$${field}`), amountCents] }, "$totalRaisingCents"] },
});

// Holds capacity for an investment that is awaiting payment.
function reserveCapacity(startupId, amountCents) {
  return Startup.findOneAndUpdate(
    { _id: startupId, ...withinTarget(amountCents, "raisedSoFarCents", "reservedCents") },
    { $inc: { reservedCents: amountCents } },
    { new: true }
  );
}

// Releasing never drops below zero: the guard makes a double release a no-op
// rather than corrupting the counter.
async function releaseReservation(startupId, amountCents) {
  const released = await Startup.updateOne(
    { _id: startupId, reservedCents: { $gte: amountCents } },
    { $inc: { reservedCents: -amountCents } }
  );
  if (!released.modifiedCount) {
    logger.warn("Reservation release skipped: nothing reserved", { startupId: String(startupId), amountCents });
  }
}

const fundingExceeded = (startup, amountCents) =>
  new UnprocessableEntityError(
    `This round has ${money.format(startup.remainingCents)} left; ${money.format(amountCents)} would exceed the target`,
    CODES.FUNDING_TARGET_EXCEEDED
  );

// ---------------------------------------------------------------------------
// Task 7 owns the domain transitions below. Task 8 owns Stripe itself: webhook
// signature and idempotency bookkeeping, retries, and the refund API call. It
// drives this service through markPaid / markFailed / refund and never writes
// status or funding totals directly.
// ---------------------------------------------------------------------------

async function create(investorUserId, { startupId, amountCents }) {
  const startup = await Startup.findById(startupId);
  if (!startup) throw new NotFoundError("Startup not found");
  if (amountCents < startup.minInvestmentCents) {
    throw new UnprocessableEntityError(
      `Minimum investment for this startup is ${money.format(startup.minInvestmentCents)}`,
      CODES.MINIMUM_INVESTMENT_NOT_MET
    );
  }

  const reserved = await reserveCapacity(startup._id, amountCents);
  if (!reserved) throw fundingExceeded(startup, amountCents);

  const investment = await Investment.create({ investor: investorUserId, startup: startup._id, amountCents });
  try {
    const { paymentIntent, investment: withIntent } = await ensurePaymentIntent(investment);
    return { investment: withIntent, clientSecret: paymentIntent.client_secret };
  } catch (err) {
    // Without a PaymentIntent nothing can ever be collected: record the attempt
    // as failed and give the capacity back instead of holding the round hostage.
    await Investment.updateOne({ _id: investment._id, status: "pending" }, { status: "failed" });
    await releaseReservation(startup._id, amountCents);
    throw err;
  }
}

// Creates the PaymentIntent for an investment, at most once. The idempotency
// key is derived from the investment id, so a retry after a timeout returns
// Stripe's original PaymentIntent instead of charging the customer twice, and
// the id is persisted with a conditional update so a concurrent writer cannot
// overwrite it. Creating the intent says nothing about payment: the investment
// stays "pending" until a signed webhook says otherwise.
async function ensurePaymentIntent(investment) {
  if (investment.stripePaymentIntentId) {
    return { paymentIntent: await stripeService.retrievePaymentIntent(investment.stripePaymentIntentId), investment };
  }

  const paymentIntent = await stripeService.createPaymentIntent({
    amountCents: investment.amountCents,
    currency: investment.currency,
    metadata: { investmentId: String(investment._id) },
    idempotencyKey: `investment-${investment._id}`,
  });

  const claimed = await Investment.findOneAndUpdate(
    { _id: investment._id, stripePaymentIntentId: null },
    { stripePaymentIntentId: paymentIntent.id },
    { new: true }
  );
  if (claimed) return { paymentIntent, investment: claimed };

  // Someone else stored one first; theirs wins (the idempotency key means it
  // is the same PaymentIntent anyway).
  const current = await Investment.findById(investment._id);
  return {
    paymentIntent: await stripeService.retrievePaymentIntent(current.stripePaymentIntentId),
    investment: current,
  };
}

// Payment confirmed. Idempotent, and safe to call for an investment that
// previously failed (Stripe lets a customer retry a declined PaymentIntent) —
// that path re-checks the funding cap, so a late success cannot overshoot the
// target. Returns { investment, credited, reason } so the caller (Task 8's
// webhook) can decide what to do when crediting is refused.
async function markPaid(investmentId) {
  const fromPending = await Investment.findOneAndUpdate(
    { _id: investmentId, status: "pending" },
    { status: "paid" },
    { new: true }
  );
  if (fromPending) {
    await Startup.updateOne(
      { _id: fromPending.startup, reservedCents: { $gte: fromPending.amountCents } },
      { $inc: { reservedCents: -fromPending.amountCents, raisedSoFarCents: fromPending.amountCents } }
    );
    await announceInvestment(fromPending);
    return { investment: fromPending, credited: true };
  }

  const investment = await Investment.findById(investmentId);
  if (!investment) return { investment: null, credited: false, reason: "unknown" };
  if (investment.status === "paid") return { investment, credited: false, reason: "already_paid" };
  if (investment.status === "refunded") return { investment, credited: false, reason: "refunded" };

  // failed -> paid: the reservation was released, so capacity must be re-taken.
  const startup = await Startup.findOneAndUpdate(
    { _id: investment.startup, ...withinTarget(investment.amountCents, "raisedSoFarCents", "reservedCents") },
    { $inc: { raisedSoFarCents: investment.amountCents } },
    { new: true }
  );
  if (!startup) {
    logger.warn("Payment succeeded but the round is full", {
      investmentId: String(investmentId),
      amountCents: investment.amountCents,
    });
    return { investment, credited: false, reason: "funding_target_exceeded" };
  }

  const revived = await Investment.findOneAndUpdate(
    { _id: investmentId, status: "failed" },
    { status: "paid" },
    { new: true }
  );
  if (!revived) {
    // Lost a race with another writer — undo the credit just made.
    await Startup.updateOne({ _id: investment.startup }, { $inc: { raisedSoFarCents: -investment.amountCents } });
    return { investment: await Investment.findById(investmentId), credited: false, reason: "conflict" };
  }
  await announceInvestment(revived);
  return { investment: revived, credited: true };
}

// Payment attempt failed: release the capacity so the round stays investable.
// Idempotent; a failed investment can still be revived by markPaid.
async function markFailed(investmentId) {
  const investment = await Investment.findOneAndUpdate(
    { _id: investmentId, status: "pending" },
    { status: "failed" },
    { new: true }
  );
  if (!investment) return { investment: await Investment.findById(investmentId), released: false };

  await releaseReservation(investment.startup, investment.amountCents);
  return { investment, released: true };
}

// Admin only (decision D3): an investor must not be able to reclaim money
// already credited to a startup. The status is claimed first, so two concurrent
// refunds cannot both reach Stripe; if Stripe then refuses, the claim is undone.
async function refund(investmentId) {
  const claimed = await Investment.findOneAndUpdate(
    { _id: investmentId, status: "paid" },
    { status: "refunded" },
    { new: true }
  );
  if (!claimed) {
    const existing = await Investment.findById(investmentId);
    if (!existing) throw new NotFoundError("Investment not found");
    throw new UnprocessableEntityError(
      `Only a paid investment can be refunded (this one is "${existing.status}")`,
      CODES.INVESTMENT_NOT_REFUNDABLE
    );
  }

  try {
    // Keyed on the investment: a retried admin refund is the same refund.
    const refund = await stripeService.createRefund({
      paymentIntentId: claimed.stripePaymentIntentId,
      idempotencyKey: `refund-${investmentId}`,
    });
    claimed.stripeRefundId = refund.id;
    await Investment.updateOne({ _id: investmentId }, { stripeRefundId: refund.id });
  } catch (err) {
    await Investment.updateOne({ _id: investmentId, status: "refunded" }, { status: "paid" });
    throw err;
  }

  await Startup.updateOne(
    { _id: claimed.startup, raisedSoFarCents: { $gte: claimed.amountCents } },
    { $inc: { raisedSoFarCents: -claimed.amountCents } }
  );
  return claimed;
}

// Reconciles a refund that already happened at Stripe (admin refund, a refund
// issued in the dashboard, or the automatic one). Never calls Stripe — the
// money has moved; this only brings the domain in line, once.
async function markRefunded(investmentId, { stripeRefundId } = {}) {
  const refunded = await Investment.findOneAndUpdate(
    { _id: investmentId, status: "paid" },
    { status: "refunded", ...(stripeRefundId ? { stripeRefundId } : {}) },
    { new: true }
  );
  if (!refunded) return { investment: await Investment.findById(investmentId), refunded: false };

  await Startup.updateOne(
    { _id: refunded.startup, raisedSoFarCents: { $gte: refunded.amountCents } },
    { $inc: { raisedSoFarCents: -refunded.amountCents } }
  );
  return { investment: refunded, refunded: true };
}

// A payment that could not be credited (the round filled up first) was
// refunded at Stripe. The investment stays "failed" — it never held capacity
// or money — but the refund is recorded so the two sides reconcile.
async function recordAutoRefund(investmentId, stripeRefundId) {
  await Investment.updateOne(
    { _id: investmentId, autoRefundedAt: null },
    { stripeRefundId, autoRefundedAt: new Date() }
  );
}

async function announceInvestment(investment) {
  const startup = await Startup.findById(investment.startup).select("owner").lean();
  if (!startup) return;
  await notificationService.notifyUserSafely(
    startup.owner,
    `New investment of ${money.format(investment.amountCents, investment.currency)} received`
  );
}

async function listMine(investorUserId, query) {
  return listFor({ investor: investorUserId }, query, ["startup", "name stage"]);
}

async function listForStartupOwner(ownerId, query) {
  const startup = await Startup.findOne({ owner: ownerId });
  if (!startup) throw new NotFoundError("You haven't created a startup profile yet");
  return listFor({ startup: startup._id }, query, ["investor", "firstName lastName email"]);
}

async function listFor(filter, query, populate) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  const [items, total] = await Promise.all([
    Investment.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate(...populate),
    Investment.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

module.exports = {
  SORTABLE,
  create,
  ensurePaymentIntent,
  markPaid,
  markFailed,
  markRefunded,
  recordAutoRefund,
  refund,
  listMine,
  listForStartupOwner,
};
