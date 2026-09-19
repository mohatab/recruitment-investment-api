const mongoose = require("mongoose");
const { SUPPORTED_CURRENCIES, MAX_AMOUNT_CENTS } = require("../../../common/utils/money");

// pending  — created, capacity reserved on the startup, awaiting payment
// paid     — payment confirmed; the amount is credited to the startup
// failed   — payment attempt failed; the reservation is released
// refunded — a paid investment was reversed (admin only); terminal
const STATUSES = ["pending", "paid", "failed", "refunded"];

// Legal moves. `failed -> paid` exists because Stripe lets a customer retry the
// same PaymentIntent after a decline; without it a captured payment would stay
// recorded as failed (audit C3). Re-crediting re-checks the funding cap, so a
// late retry cannot push a startup past its target.
const TRANSITIONS = {
  pending: ["paid", "failed"],
  failed: ["paid"],
  paid: ["refunded"],
  refunded: [],
};

const investmentSchema = new mongoose.Schema(
  {
    investor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startup: { type: mongoose.Schema.Types.ObjectId, ref: "Startup", required: true },
    // Integer minor units (cents). See common/utils/money.js.
    amountCents: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_AMOUNT_CENTS,
      validate: { validator: Number.isSafeInteger, message: "amountCents must be an integer number of cents" },
    },
    currency: { type: String, enum: SUPPORTED_CURRENCIES, default: "usd" },
    status: { type: String, enum: STATUSES, default: "pending" },
    // Unique + sparse: one investment per PaymentIntent, and the field is
    // absent until Stripe hands us an id.
    stripePaymentIntentId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// The two list endpoints: an investor's own investments and the ones a startup
// received, both newest-first.
investmentSchema.index({ investor: 1, createdAt: -1 });
investmentSchema.index({ startup: 1, createdAt: -1 });

module.exports = mongoose.model("Investment", investmentSchema);
module.exports.STATUSES = STATUSES;
module.exports.TRANSITIONS = TRANSITIONS;
