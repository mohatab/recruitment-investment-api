const mongoose = require("mongoose");
const { MAX_AMOUNT_CENTS } = require("../../../common/utils/money");

const STAGES = ["idea", "pre-seed", "seed", "series-a", "series-b", "growth"];

// All amounts are integer minor units (cents) — see common/utils/money.js.
const cents = (extra = {}) => ({
  type: Number,
  min: 0,
  max: MAX_AMOUNT_CENTS,
  validate: { validator: Number.isSafeInteger, message: "{PATH} must be an integer number of cents" },
  ...extra,
});

const startupSchema = new mongoose.Schema(
  {
    // One startup profile per startup-role account — this is what the old
    // duplicate matrix/mohamed startup collections were missing: an owner.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    pitchTitle: { type: String, default: "", maxlength: 200 },
    description: { type: String, required: true, maxlength: 10000 },
    website: { type: String, default: "" },
    location: { type: String, default: "", trim: true, maxlength: 120 },
    industries: { type: [{ type: String, trim: true, lowercase: true, maxlength: 60 }], default: [] },
    stage: { type: String, enum: STAGES, default: "idea" },
    idealInvestorRole: { type: String, default: "", maxlength: 120 },
    previousRaisedCents: cents({ default: 0 }),
    // The funding target. It is a hard cap: raised + reserved can never exceed it.
    totalRaisingCents: cents({ required: true }),
    // Credited only by a confirmed payment.
    raisedSoFarCents: cents({ default: 0 }),
    // Held by investments that are pending payment, so simultaneous investors
    // cannot each be told there is room for the same last slice of the round.
    reservedCents: cents({ default: 0 }),
    minInvestmentCents: cents({ required: true }),
  },
  { timestamps: true, id: false, toJSON: { virtuals: true } }
);

// What an investor may still commit right now.
startupSchema.virtual("remainingCents").get(function remainingCents() {
  return Math.max(0, this.totalRaisingCents - this.raisedSoFarCents - this.reservedCents);
});

startupSchema.index({ industries: 1, stage: 1 });

module.exports = mongoose.model("Startup", startupSchema);
module.exports.STAGES = STAGES;
