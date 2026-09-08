const mongoose = require("mongoose");

const STAGES = ["idea", "pre-seed", "seed", "series-a", "series-b", "growth"];

const startupSchema = new mongoose.Schema(
  {
    // One startup profile per startup-role account — this is what the old
    // duplicate matrix/mohamed startup collections were missing: an owner.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, required: true, trim: true },
    pitchTitle: { type: String, default: "" },
    description: { type: String, required: true },
    website: { type: String, default: "" },
    location: { type: String, default: "" },
    industries: { type: [String], default: [] },
    stage: { type: String, enum: STAGES, default: "idea" },
    idealInvestorRole: { type: String, default: "" },
    previousRaised: { type: Number, default: 0, min: 0 },
    totalRaising: { type: Number, required: true, min: 0 },
    raisedSoFar: { type: Number, default: 0, min: 0 },
    minInvestment: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

startupSchema.index({ industries: 1, stage: 1 });

module.exports = mongoose.model("Startup", startupSchema);
module.exports.STAGES = STAGES;
