const StripeEvent = require("./stripeEvent.model");
const stripeService = require("./stripe.service");
const Investment = require("../investment/investments/investment.model");
const investmentService = require("../investment/investments/investment.service");
const logger = require("../../common/utils/logger");

// ---------------------------------------------------------------------------
// Trust model
//
// A webhook request authenticates as Stripe by its signature (stripe.service
// verifies it over the raw body), never as a user — there is no session here.
// Nothing in the payload is trusted beyond that: the PaymentIntent id is used
// to look up *our* investment, and the event's amount and currency must match
// what we recorded before any money state moves. A client-reported "it
// succeeded" never reaches this code.
//
// Delivery is at-least-once, so every event is claimed in a durable log first
// (unique `eventId`). A duplicate claim means the event is already handled and
// the request is acknowledged without re-running anything. Domain transitions
// are individually idempotent too (Task 7), so the log is defence in depth
// rather than the only guard.
// ---------------------------------------------------------------------------

const HANDLERS = {
  "payment_intent.succeeded": onPaymentSucceeded,
  "payment_intent.payment_failed": onPaymentFailed,
  "payment_intent.canceled": onPaymentCanceled,
  "charge.refunded": onChargeRefunded,
  // Observed for the audit trail only. A dispute freezes money at Stripe but
  // the investment domain has no "disputed" state, and inventing one would be
  // a business rule this product has not defined. Logged loudly so an operator
  // can act; no domain state changes.
  "charge.dispute.created": onDisputeObserved,
  "charge.dispute.closed": onDisputeObserved,
};

async function handleEvent(event) {
  // Claim the event. A concurrent or later duplicate loses this insert.
  try {
    await StripeEvent.create({ eventId: event.id, type: event.type });
  } catch (err) {
    if (err.code === 11000) {
      logger.info("Stripe event already handled", { eventId: event.id, type: event.type });
      return { duplicate: true };
    }
    throw err;
  }

  try {
    const handler = HANDLERS[event.type];
    const result = handler
      ? await handler(event)
      : { outcome: "no_change", detail: `unhandled event type ${event.type}` };

    await StripeEvent.updateOne(
      { eventId: event.id },
      { outcome: result.outcome, investment: result.investmentId, detail: result.detail, processedAt: new Date() }
    );
    return result;
  } catch (err) {
    // Release the claim so Stripe's retry can try again — the log records
    // handled events, not merely seen ones.
    await StripeEvent.deleteOne({ eventId: event.id });
    throw err;
  }
}

// Finds the investment this event refers to and checks the event against it.
// Returns a rejection outcome instead of the investment when they disagree.
async function matchInvestment(paymentIntentId, { amountCents, currency }) {
  const investment = await Investment.findOne({ stripePaymentIntentId: paymentIntentId });
  if (!investment) {
    logger.warn("Stripe event for an unknown payment intent", { paymentIntentId });
    return { rejected: { outcome: "unknown_payment", detail: "no investment for this payment intent" } };
  }

  // Never take the event's word for what was paid: compare with the record.
  const mismatch =
    (amountCents !== undefined && amountCents !== investment.amountCents) ||
    (currency !== undefined && currency !== investment.currency);
  if (mismatch) {
    logger.error("Stripe event does not match the investment record", {
      investmentId: String(investment._id),
      expectedAmountCents: investment.amountCents,
      eventAmountCents: amountCents,
      expectedCurrency: investment.currency,
      eventCurrency: currency,
    });
    return {
      investment,
      rejected: {
        outcome: "mismatch",
        investmentId: investment._id,
        detail: `event amount/currency did not match the investment (${amountCents} ${currency})`,
      },
    };
  }
  return { investment };
}

async function onPaymentSucceeded(event) {
  const intent = event.data.object;
  // `amount_received` is what Stripe actually captured; `amount` is what was
  // requested. Compare the captured figure when it is present.
  const amountCents = intent.amount_received ?? intent.amount;
  const { investment, rejected } = await matchInvestment(intent.id, { amountCents, currency: intent.currency });
  if (rejected) return rejected;

  const result = await investmentService.markPaid(investment._id);
  if (result.credited) {
    return { outcome: "credited", investmentId: investment._id };
  }

  // The round filled up while this payment was in flight (Task 7 keeps the
  // investment uncredited rather than overshooting the target). The money is
  // real, so it goes straight back.
  if (result.reason === "funding_target_exceeded") {
    return refundUncredited(investment, "round was already fully funded");
  }

  return { outcome: "no_change", investmentId: investment._id, detail: result.reason };
}

async function onPaymentFailed(event) {
  return releasePayment(event.data.object, "payment_failed");
}

async function onPaymentCanceled(event) {
  return releasePayment(event.data.object, "payment_canceled");
}

// A failed or canceled attempt frees the capacity it was holding. The
// investment stays revivable: Stripe lets a customer retry the same
// PaymentIntent, and markPaid re-checks the cap if they do.
async function releasePayment(intent, detail) {
  const { investment, rejected } = await matchInvestment(intent.id, { currency: intent.currency });
  if (rejected) return rejected;

  const { released } = await investmentService.markFailed(investment._id);
  return {
    outcome: released ? "released" : "no_change",
    investmentId: investment._id,
    detail,
  };
}

async function onChargeRefunded(event) {
  const charge = event.data.object;
  if (!charge.payment_intent) return { outcome: "no_change", detail: "refund without a payment intent" };

  const { investment, rejected } = await matchInvestment(charge.payment_intent, { currency: charge.currency });
  if (rejected) return rejected;

  // The domain models a whole investment being refunded; a partial refund has
  // no representation, so it is recorded and left for an operator rather than
  // guessed at.
  if (charge.amount_refunded !== investment.amountCents) {
    logger.error("Partial Stripe refund has no domain representation", {
      investmentId: String(investment._id),
      amountRefundedCents: charge.amount_refunded,
      investmentAmountCents: investment.amountCents,
    });
    return { outcome: "mismatch", investmentId: investment._id, detail: "partial refund" };
  }

  // Reconciles refunds issued anywhere — this API, the Stripe dashboard, or
  // the automatic refund below — without calling Stripe again.
  const { refunded } = await investmentService.markRefunded(investment._id, {
    stripeRefundId: charge.refunds?.data?.[0]?.id,
  });
  return {
    outcome: refunded ? "refunded" : "no_change",
    investmentId: investment._id,
    detail: refunded ? undefined : "investment was not in a refundable state",
  };
}

function onDisputeObserved(event) {
  const charge = event.data.object;
  logger.error("Stripe dispute event received — needs manual handling", {
    eventType: event.type,
    paymentIntentId: charge.payment_intent,
    disputeStatus: charge.status,
  });
  return { outcome: "no_change", detail: `${event.type} observed; no domain state change` };
}

// Money captured for an investment that cannot be credited goes back
// automatically. Idempotent twice over: Stripe's idempotency key is derived
// from the investment id, and recordAutoRefund only writes once.
async function refundUncredited(investment, reason) {
  const refund = await stripeService.createRefund({
    paymentIntentId: investment.stripePaymentIntentId,
    idempotencyKey: `auto-refund-${investment._id}`,
    reason: "duplicate",
  });
  await investmentService.recordAutoRefund(investment._id, refund.id);

  logger.warn("Refunded a payment that could not be credited", {
    investmentId: String(investment._id),
    reason,
  });
  return { outcome: "auto_refunded", investmentId: investment._id, detail: reason };
}

module.exports = { handleEvent };
