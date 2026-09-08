const mongoose = require("mongoose");

const STATUSES = ["submitted", "under_review", "shortlisted", "interview", "accepted", "rejected"];

const applicationSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    coverLetter: { type: String, required: true, minlength: 10 },
    resumeUrl: { type: String, required: true },
    status: { type: String, enum: STATUSES, default: "submitted" },
  },
  { timestamps: true }
);

// One application per candidate per job — enforced at the database level,
// not just checked-then-inserted in application code (which would still
// race under concurrent requests).
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);
module.exports.STATUSES = STATUSES;
