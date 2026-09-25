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
    // Ticket sizes in integer minor units (cents), matched against a
    // startup's minInvestmentCents.
    criteria: {
      minInvestmentCents: { type: Number, default: 0, min: 0 },
      maxInvestmentCents: { type: Number, default: Number.MAX_SAFE_INTEGER, min: 0 },
      industries: { type: [String], default: [] },
      stages: { type: [String], enum: STAGES, default: [] },
      locations: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

// `__v` is Mongoose's internal version counter, not part of the API contract —
// the OpenAPI schema does not declare it and the other models already strip it.
// A schema-level transform (rather than a toJSON method) keeps any virtuals
// this schema declares.
investorSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Investor", investorSchema);
