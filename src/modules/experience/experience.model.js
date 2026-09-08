const mongoose = require("mongoose");

const experienceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobTitle: { type: String, required: true },
    companyName: { type: String, required: true },
    jobCategory: { type: String, default: "" },
    experienceType: { type: String, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    currentlyWorking: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Experience", experienceSchema);
