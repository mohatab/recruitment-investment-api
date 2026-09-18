const mongoose = require("mongoose");

const SALARY_TYPES = ["hourly", "monthly", "yearly"];
const APPLY_METHODS = ["platform", "external"];
const STATUSES = ["open", "closed"];
const MAX_TAGS = 20;

const jobSchema = new mongoose.Schema(
  {
    recruiter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    role: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 10000 },
    responsibilities: { type: String, required: true, maxlength: 10000 },
    minSalary: { type: Number, required: true, min: 0 },
    maxSalary: {
      type: Number,
      required: true,
      min: 0,
      // Last line of defence for documents saved through the model; the service
      // also checks the merged values on a partial update, where a validator
      // can only see the field being set.
      validate: {
        validator(value) {
          return this.minSalary === undefined || value >= this.minSalary;
        },
        message: "maxSalary must be greater than or equal to minSalary",
      },
    },
    salaryType: { type: String, enum: SALARY_TYPES, required: true },
    applyMethod: { type: String, enum: APPLY_METHODS, default: "platform" },
    applyLink: { type: String, default: "", trim: true },
    applyEmail: { type: String, default: "", trim: true, lowercase: true },
    // Lower-cased so tag filtering and the text index don't depend on how a
    // recruiter typed them.
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
      default: [],
      validate: { validator: (tags) => tags.length <= MAX_TAGS, message: `A job can have at most ${MAX_TAGS} tags` },
    },
    vacancies: { type: Number, default: 1, min: 1 },
    location: { type: String, default: "", trim: true, maxlength: 120 },
    expirationDate: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: "open" },
  },
  { timestamps: true, id: false, toJSON: { virtuals: true } }
);

// A job stops accepting applications either because the recruiter closed it or
// because it ran out of time; clients shouldn't have to compare dates to know.
jobSchema.virtual("isExpired").get(function isExpired() {
  return this.expirationDate instanceof Date && this.expirationDate.getTime() <= Date.now();
});

// Public search (`GET /jobs`) filters on status and sorts by createdAt; this one
// index serves both, with the expiry cut-off applied as a predicate.
jobSchema.index({ status: 1, createdAt: -1 });
// `GET /jobs/mine`: a recruiter's own postings, newest first.
jobSchema.index({ recruiter: 1, createdAt: -1 });
jobSchema.index({ title: "text", role: "text", tags: "text" });

module.exports = mongoose.model("Job", jobSchema);
module.exports.STATUSES = STATUSES;
module.exports.SALARY_TYPES = SALARY_TYPES;
module.exports.APPLY_METHODS = APPLY_METHODS;
module.exports.MAX_TAGS = MAX_TAGS;
