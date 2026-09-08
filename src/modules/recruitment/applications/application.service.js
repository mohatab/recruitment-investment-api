const Application = require("./application.model");
const Job = require("../jobs/job.model");
const User = require("../../users/user.model");
const notificationService = require("../../notifications/notification.service");
const { NotFoundError, ForbiddenError, ConflictError, ValidationError } = require("../../../common/errors/AppError");
const { parsePagination, buildMeta } = require("../../../common/utils/pagination");

// A candidate can only ever move an application forward by withdrawing
// (not modeled here); every other transition is recruiter-driven. Terminal
// states have no outgoing transitions.
const TRANSITIONS = {
  submitted: ["under_review", "rejected"],
  under_review: ["shortlisted", "rejected"],
  shortlisted: ["interview", "rejected"],
  interview: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

async function apply(jobId, applicantId, input) {
  const job = await Job.findById(jobId);
  if (!job) throw new NotFoundError("Job not found");
  if (job.status !== "open") throw new ValidationError("This job is no longer accepting applications");

  const resumeUrl = input.resumeUrl || (await User.findById(applicantId)).cvUrl;
  if (!resumeUrl) throw new ValidationError("Upload a CV before applying, or provide a resumeUrl");

  try {
    const application = await Application.create({
      job: jobId,
      applicant: applicantId,
      coverLetter: input.coverLetter,
      resumeUrl,
    });
    await notificationService.notifyUser(job.recruiter, `New application received for "${job.title}"`);
    return application;
  } catch (err) {
    if (err.code === 11000) throw new ConflictError("You have already applied to this job");
    throw err;
  }
}

async function listForJob(jobId, recruiterId, query) {
  const job = await Job.findById(jobId);
  if (!job) throw new NotFoundError("Job not found");
  if (String(job.recruiter) !== String(recruiterId)) {
    throw new ForbiddenError("You can only view applications for your own job postings");
  }

  const { page, limit, skip, sort } = parsePagination(query);
  const filter = { job: jobId };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Application.find(filter).sort(sort).skip(skip).limit(limit).populate("applicant", "firstName lastName email"),
    Application.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function listMine(applicantId, query) {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = { applicant: applicantId };

  const [items, total] = await Promise.all([
    Application.find(filter).sort(sort).skip(skip).limit(limit).populate("job", "title role status"),
    Application.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function updateStatus(applicationId, recruiterId, nextStatus) {
  const application = await Application.findById(applicationId).populate("job");
  if (!application) throw new NotFoundError("Application not found");
  if (String(application.job.recruiter) !== String(recruiterId)) {
    throw new ForbiddenError("You can only manage applications for your own job postings");
  }

  const allowed = TRANSITIONS[application.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new ValidationError(`Cannot move an application from "${application.status}" to "${nextStatus}"`);
  }

  application.status = nextStatus;
  await application.save();
  await notificationService.notifyUser(
    application.applicant,
    `Your application for "${application.job.title}" is now "${nextStatus}"`
  );
  return application;
}

module.exports = { apply, listForJob, listMine, updateStatus, TRANSITIONS };
