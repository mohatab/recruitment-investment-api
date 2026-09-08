const mongoose = require("mongoose");
const { STAGES } = require("../startups/startup.model");

const investorSchema = new mongoose.Schema(
  {
    // Consolidates the two previously-separate, owner-less Investor models.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    investorType: { type: String, default: "" },
    aboutMe: { type: String, default: "" },
    linkedIn: { type: String, default: "" },
    twitter: { type: String, default: "" },
    facebook: { type: String, default: "" },
    website: { type: String, default: "" },
    areasOfExpertise: { type: [String], default: [] },
    numberOfInvestments: { type: Number, default: 0, min: 0 },
    companies: { type: [String], default: [] },

    // What "the system finds relevant opportunities" (GET /startups/matches)
    // filters against.
    criteria: {
      minInvestment: { type: Number, default: 0, min: 0 },
      maxInvestment: { type: Number, default: Number.MAX_SAFE_INTEGER, min: 0 },
      industries: { type: [String], default: [] },
      stages: { type: [String], enum: STAGES, default: [] },
      locations: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Investor", investorSchema);
