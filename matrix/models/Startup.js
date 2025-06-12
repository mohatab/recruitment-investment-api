const mongoose = require("mongoose");

const startupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
    required: true,
  },
  pitchTitle: String,
  website: String,
  location: String,
  mobileNumber: String,
  industry1: String,
  industry2: String,
  stage: String,
  idealInvestorRole: String,
  previousRaised: Number,
  totalRaising: Number,
  raisedSoFar: Number,
  minInvestment: Number,
});

module.exports = mongoose.model("MatrixStartup", startupSchema);
