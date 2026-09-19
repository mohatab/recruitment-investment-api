const mongoose = require("mongoose");

// Durable record of every Stripe event this service has accepted. Stripe
// guarantees at-least-once delivery, so the same event id arrives more than
// once (its own retries, or two instances receiving the same delivery). The
// unique index on `eventId` is what makes reprocessing impossible: the second
// writer's insert fails and the webhook answers 200 without touching domain
// state.
//
// A failed processing attempt deletes its claim (see payment.service.js) so
// Stripe's retry can try again — the row means "this event was handled", not
// "this event was seen".
const OUTCOMES = [
  "credited", // payment applied to an investment
  "released", // failed/canceled payment, reservation released
  "refunded", // refund reconciled from Stripe
  "auto_refunded", // payment arrived after the round filled up and was refunded
  "no_change", // valid event that the domain deliberately ignores
  "mismatch", // event did not match the stored investment (amount/currency)
  "unknown_payment", // no investment for this PaymentIntent
];

const stripeEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    outcome: { type: String, enum: OUTCOMES },
    investment: { type: mongoose.Schema.Types.ObjectId, ref: "Investment" },
    // Short, non-sensitive note (never a payload, signature or key).
    detail: { type: String, maxlength: 300 },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

// Operational lookups ("what happened to this investment's payments?").
stripeEventSchema.index({ investment: 1, createdAt: -1 });
// Housekeeping: Stripe retries for at most a few days, so the replay window
// this log has to defend is far shorter than the retention.
stripeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("StripeEvent", stripeEventSchema);
module.exports.OUTCOMES = OUTCOMES;
