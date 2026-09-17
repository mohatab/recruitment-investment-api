const Investment = require("./investment.model");
const Startup = require("../startups/startup.model");
const stripeService = require("../../payments/stripe.service");
const notificationService = require("../../notifications/notification.service");
const { NotFoundError, ValidationError } = require("../../../common/errors/AppError");
const logger = require("../../../common/utils/logger");

async function create(investorUserId, { startupId, amount }) {
  const startup = await Startup.findById(startupId);
  if (!startup) throw new NotFoundError("Startup not found");
  if (amount < startup.minInvestment) {
    throw new ValidationError(`Minimum investment for this startup is ${startup.minInvestment}`);
  }

  const investment = await Investment.create({ investor: investorUserId, startup: startup._id, amount });

  const paymentIntent = await stripeService.createPaymentIntent({
    amount,
    metadata: { investmentId: String(investment._id) },
  });
  investment.stripePaymentIntentId = paymentIntent.id;
  await investment.save();

  return { investment, clientSecret: paymentIntent.client_secret };
}

// Called from the Stripe webhook only, after signature verification.
// Idempotent under concurrent delivery: Stripe can and does send the same
// event more than once (its own retry behavior, or two webhook instances
// racing). The read-then-write version of this check (find, inspect
// .status, then save) has a race: two concurrent deliveries can both read
// "pending" before either writes "paid", and both would credit
// `raisedSoFar`. Making the pending->paid transition itself the atomic
// operation — via a single findOneAndUpdate filtered on the *old* status —
// means only one concurrent call can ever win it; the loser sees `null` and
// stops, exactly like an already-processed duplicate would.
async function handlePaymentIntentSucceeded(paymentIntentId) {
  const investment = await Investment.findOneAndUpdate(
    { stripePaymentIntentId: paymentIntentId, status: "pending" },
    { status: "paid" },
    { new: true }
  );
  if (!investment) {
    logger.warn("Webhook ignored: unknown payment intent or already processed", { paymentIntentId });
    return;
  }

  const startup = await Startup.findByIdAndUpdate(
    investment.startup,
    { $inc: { raisedSoFar: investment.amount } },
    { new: true }
  );
  if (startup) {
    await notificationService.notifyUser(startup.owner, `New investment of ${investment.amount} received`);
  }
}

async function handlePaymentIntentFailed(paymentIntentId) {
  await Investment.updateOne({ stripePaymentIntentId: paymentIntentId, status: "pending" }, { status: "failed" });
}

// Admin only (decision D3, enforced by the route): an investor must not be
// able to reclaim money already credited to a startup.
async function refund(investmentId) {
  const investment = await Investment.findById(investmentId);
  if (!investment) throw new NotFoundError("Investment not found");
  if (investment.status !== "paid") throw new ValidationError("Only a paid investment can be refunded");

  await stripeService.refundPaymentIntent(investment.stripePaymentIntentId);
  investment.status = "refunded";
  await investment.save();
  await Startup.findByIdAndUpdate(investment.startup, { $inc: { raisedSoFar: -investment.amount } });
  return investment;
}

async function listMine(investorUserId) {
  return Investment.find({ investor: investorUserId }).populate("startup", "name stage").sort({ createdAt: -1 });
}

async function listForStartupOwner(ownerId) {
  const startup = await Startup.findOne({ owner: ownerId });
  if (!startup) throw new NotFoundError("You haven't created a startup profile yet");
  return Investment.find({ startup: startup._id })
    .populate("investor", "firstName lastName email")
    .sort({ createdAt: -1 });
}

module.exports = {
  create,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
  refund,
  listMine,
  listForStartupOwner,
};
