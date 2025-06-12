// ./models/investor.js
const mongoose = require("mongoose");

const investorSchema = new mongoose.Schema(
  {
    investorType: {
      type: String,
      required: true,
    },
    linkedIn: {
      type: String,
      required: true,
    },
    twitter: {
      type: String,
    },
    facebook: {
      type: String,
    },
    website: {
      type: String,
    },
    aboutMe: {
      type: String,
      required: true,
    },
    areasOfExpertise: {
      type: [String],
    },
    numberOfInvestments: {
      type: Number,
    },
    companies: {
      type: [String],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("MohamedInvestor", investorSchema);
