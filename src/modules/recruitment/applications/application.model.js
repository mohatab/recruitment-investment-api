const mongoose = require("mongoose");

const STATUSES = ["submitted", "under_review", "shortlisted", "interview", "accepted", "rejected"];

const applicationSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    coverLetter: { type: String, required: true, minlength: 10, maxlength: 5000 },
    // Either the applicant's stored CV url or an http(s) link they supplied
    // (scheme-checked in application.validation.js).
    resumeUrl: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: STATUSES, default: "submitted" },
  },
  { timestamps: true }
);

// One application per candidate per job — enforced at the database level, not
// just checked-then-inserted in application code (which would still race under
// concurrent requests). Its `job` prefix also serves lookups by job.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });
// The two list endpoints: a job's applications and a candidate's own, both
// newest-first (and both filterable by status, which the sort key follows).
applicationSchema.index({ job: 1, createdAt: -1 });
applicationSchema.index({ applicant: 1, createdAt: -1 });

module.exports = mongoose.model("Application", applicationSchema);
module.exports.STATUSES = STATUSES;
