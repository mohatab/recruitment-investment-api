const Investment = require("./investment.model");
const Startup = require("../startups/startup.model");
const stripeService = require("../../payments/stripe.service");
const notificationService = require("../../notifications/notification.service");
const { NotFoundError, ForbiddenError, ValidationError } = require("../../../common/errors/AppError");
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
// Idempotent: a payment_intent.succeeded delivered twice (Stripe's own
// retry behavior) must not double-credit `raisedSoFar`.
async function handlePaymentIntentSucceeded(paymentIntentId) {
  const investment = await Investment.findOne({ stripePaymentIntentId: paymentIntentId });
  if (!investment) {
    logger.warn("Webhook for unknown payment intent", { paymentIntentId });
    return;
  }
  if (investment.status === "paid") return; // already processed

  investment.status = "paid";
  await investment.save();

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

async function refund(investmentId, requesterId, requesterRole) {
  const investment = await Investment.findById(investmentId);
  if (!investment) throw new NotFoundError("Investment not found");
  if (requesterRole !== "admin" && String(investment.investor) !== String(requesterId)) {
    throw new ForbiddenError("You can only refund your own investments");
  }
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
