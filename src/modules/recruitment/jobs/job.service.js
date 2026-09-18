const Job = require("./job.model");
const Application = require("../applications/application.model");
const {
  NotFoundError,
  ConflictError,
  ValidationError,
  UnprocessableEntityError,
  CODES,
} = require("../../../common/errors/AppError");
const assertOwner = require("../../../common/utils/assertOwner");
const { parsePagination, buildPagination } = require("../../../common/utils/pagination");
const escapeRegex = require("../../../common/utils/escapeRegex");

// Sortable fields are indexed or cheap; see job.model.js.
const SORTABLE = ["createdAt", "minSalary", "maxSalary", "expirationDate", "title"];

const OWNERSHIP_MESSAGE = "You can only manage your own job postings";

// "Accepting applications" is status *and* time: a job whose expirationDate has
// passed is closed in every way that matters, without a scheduled job to flip it.
const acceptingApplications = () => ({ status: "open", expirationDate: { $gt: new Date() } });

function assertExternalApplyTarget(applyMethod, applyLink, applyEmail) {
  if (applyMethod === "external" && !applyLink && !applyEmail) {
    throw new ValidationError("applyMethod=external requires applyLink or applyEmail", [
      { field: "applyLink", message: "applyLink or applyEmail is required when applyMethod is external" },
    ]);
  }
}

function assertSalaryRange(minSalary, maxSalary) {
  if (minSalary > maxSalary) {
    throw new ValidationError("maxSalary must be greater than or equal to minSalary", [
      { field: "maxSalary", message: `must be greater than or equal to minSalary (${minSalary})` },
    ]);
  }
}

async function create(recruiterId, data) {
  // Same merged-value rules as update(), so "external with an empty link"
  // can't slip in through create either.
  assertSalaryRange(data.minSalary, data.maxSalary);
  assertExternalApplyTarget(data.applyMethod, data.applyLink, data.applyEmail);
  return Job.create({ ...data, recruiter: recruiterId });
}

function buildFilters(query, base) {
  const filter = { ...base };
  if (query.role) filter.role = new RegExp(escapeRegex(query.role), "i");
  if (query.location) filter.location = new RegExp(escapeRegex(query.location), "i");
  if (query.minSalary) filter.minSalary = { $gte: Number(query.minSalary) };
  if (query.search) filter.$text = { $search: query.search };
  return filter;
}

// Public listing: open, unexpired jobs by default. `status=closed` lists closed
// ones; expired postings never appear here (the owner sees them via /jobs/mine).
async function list(query) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  const base = query.status === "closed" ? { status: "closed" } : acceptingApplications();

  const [items, total] = await Promise.all([
    Job.find(buildFilters(query, base)).sort(sort).skip(skip).limit(limit),
    Job.countDocuments(buildFilters(query, base)),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

// The recruiter's own postings — including closed and expired ones, which the
// public list deliberately hides.
async function listMine(recruiterId, query) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  const base = { recruiter: recruiterId };
  if (query.status) base.status = query.status;

  const [items, total] = await Promise.all([
    Job.find(buildFilters(query, base)).sort(sort).skip(skip).limit(limit),
    Job.countDocuments(buildFilters(query, base)),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

async function getById(id) {
  const job = await Job.findById(id);
  if (!job) throw new NotFoundError("Job not found");
  return job;
}

// Loads a job the caller owns, or throws 404/403.
async function getOwned(id, userId) {
  const job = await getById(id);
  assertOwner(job.recruiter, userId, OWNERSHIP_MESSAGE);
  return job;
}

async function update(id, userId, updates) {
  const job = await getOwned(id, userId);

  // Validate the *merged* document: a partial update must not be able to leave
  // the posting in a contradictory state (min above max, reopened but expired).
  const minSalary = updates.minSalary ?? job.minSalary;
  const maxSalary = updates.maxSalary ?? job.maxSalary;
  assertSalaryRange(minSalary, maxSalary);

  assertExternalApplyTarget(
    updates.applyMethod ?? job.applyMethod,
    updates.applyLink ?? job.applyLink,
    updates.applyEmail ?? job.applyEmail
  );

  const expirationDate = updates.expirationDate ?? job.expirationDate;
  if (updates.status === "open" && job.status === "closed" && expirationDate.getTime() <= Date.now()) {
    throw new UnprocessableEntityError(
      "Reopen this job with a future expirationDate — it has already expired",
      CODES.JOB_EXPIRED
    );
  }

  Object.assign(job, updates);
  await job.save();
  return job;
}

// Applications are a candidate's record of having applied, so a posting that
// has any is closed, never deleted.
async function remove(id, userId) {
  const job = await getOwned(id, userId);
  if (await Application.exists({ job: job._id })) {
    throw new ConflictError(
      "This job has applications and cannot be deleted — close it instead",
      CODES.JOB_HAS_APPLICATIONS
    );
  }
  await job.deleteOne();
}

module.exports = { create, list, listMine, getById, update, remove, SORTABLE };
