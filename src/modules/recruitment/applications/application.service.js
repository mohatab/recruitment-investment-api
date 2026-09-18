const Application = require("./application.model");
const Job = require("../jobs/job.model");
const User = require("../../users/user.model");
const notificationService = require("../../notifications/notification.service");
const { NotFoundError, ConflictError, UnprocessableEntityError, CODES } = require("../../../common/errors/AppError");
const assertOwner = require("../../../common/utils/assertOwner");
const { parsePagination, buildPagination } = require("../../../common/utils/pagination");

const SORTABLE = ["createdAt", "status"];

// The recruiter drives the pipeline; a candidate never changes status. Terminal
// states have no outgoing transitions, and `rejected` is reachable from any
// live state.
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
  if (job.status !== "open") {
    throw new UnprocessableEntityError("This job is no longer accepting applications", CODES.JOB_CLOSED);
  }
  if (job.isExpired) {
    throw new UnprocessableEntityError("This job posting has expired", CODES.JOB_EXPIRED);
  }

  const resumeUrl = input.resumeUrl || (await User.findById(applicantId).select("cvUrl").lean())?.cvUrl;
  if (!resumeUrl) {
    throw new UnprocessableEntityError("Upload a CV before applying, or provide a resumeUrl", CODES.RESUME_REQUIRED);
  }

  let application;
  try {
    // One application per candidate per job is a unique index, so two
    // simultaneous submissions can't both insert — the loser lands here.
    application = await Application.create({
      job: job._id,
      applicant: applicantId,
      coverLetter: input.coverLetter,
      resumeUrl,
    });
  } catch (err) {
    if (err.code === 11000) throw new ConflictError("You have already applied to this job");
    throw err;
  }

  await notificationService.notifyUserSafely(job.recruiter, `New application received for "${job.title}"`);
  return application;
}

async function listForJob(jobId, recruiterId, query) {
  const job = await Job.findById(jobId);
  if (!job) throw new NotFoundError("Job not found");
  assertOwner(job.recruiter, recruiterId, "You can only view applications for your own job postings");

  const filter = { job: job._id };
  if (query.status) filter.status = query.status;
  return listApplications(filter, query, ["applicant", "firstName lastName email"]);
}

async function listMine(applicantId, query) {
  const filter = { applicant: applicantId };
  if (query.status) filter.status = query.status;
  return listApplications(filter, query, ["job", "title role status expirationDate"]);
}

async function listApplications(filter, query, populate) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  const [items, total] = await Promise.all([
    Application.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate(...populate),
    Application.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

async function updateStatus(applicationId, recruiterId, nextStatus) {
  const application = await Application.findById(applicationId).populate("job");
  if (!application) throw new NotFoundError("Application not found");
  // job is null if the posting was deleted; assertOwner treats that as not owned.
  assertOwner(application.job?.recruiter, recruiterId, "You can only manage applications for your own job postings");

  const current = application.status;
  if (!TRANSITIONS[current]?.includes(nextStatus)) {
    throw new UnprocessableEntityError(
      `Cannot move an application from "${current}" to "${nextStatus}"`,
      CODES.INVALID_STATUS_TRANSITION
    );
  }

  // Conditional on the status we validated against, so two concurrent
  // transitions from the same state can't both apply (last-write-wins used to
  // let "reject" silently overwrite "under_review", or vice versa).
  const updated = await Application.findOneAndUpdate(
    { _id: applicationId, status: current },
    { status: nextStatus },
    { new: true }
  );
  if (!updated) {
    throw new ConflictError(
      "This application was updated by someone else — reload it and try again",
      CODES.APPLICATION_STATUS_CONFLICT
    );
  }

  await notificationService.notifyUserSafely(
    updated.applicant,
    `Your application for "${application.job.title}" is now "${nextStatus}"`
  );
  return updated;
}

module.exports = {
  apply,
  listForJob,
  listMine,
  updateStatus,
  TRANSITIONS,
  SORTABLE,
};
