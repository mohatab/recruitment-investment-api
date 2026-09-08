const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    recruiter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    responsibilities: { type: String, required: true },
    minSalary: { type: Number, required: true, min: 0 },
    maxSalary: { type: Number, required: true, min: 0 },
    salaryType: { type: String, enum: ["hourly", "monthly", "yearly"], required: true },
    applyMethod: { type: String, enum: ["platform", "external"], default: "platform" },
    applyLink: { type: String, default: "" },
    applyEmail: { type: String, default: "" },
    tags: { type: [String], default: [] },
    vacancies: { type: Number, default: 1, min: 1 },
    location: { type: String, default: "" },
    expirationDate: { type: Date, required: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
  },
  { timestamps: true }
);

jobSchema.index({ title: "text", role: "text", tags: "text" });
jobSchema.index({ status: 1, expirationDate: 1 });

module.exports = mongoose.model("Job", jobSchema);
