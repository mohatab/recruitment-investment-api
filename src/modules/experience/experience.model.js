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

// `__v` is Mongoose's internal version counter, not part of the API contract —
// the OpenAPI schema does not declare it and the other models already strip it.
// A schema-level transform (rather than a toJSON method) keeps any virtuals
// this schema declares.
experienceSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Experience", experienceSchema);
