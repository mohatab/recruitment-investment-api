const mongoose = require("mongoose");

const investorSchema = new mongoose.Schema({
  investmentAmount: Number,
  city: String,
  country: String,
  industries: [String],
  professionalBackground: String,
});

module.exports = mongoose.model("Investor", investorSchema);
