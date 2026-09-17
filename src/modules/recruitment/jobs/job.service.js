const Job = require("./job.model");
const { NotFoundError, ForbiddenError } = require("../../../common/errors/AppError");
const { parsePagination, buildMeta } = require("../../../common/utils/pagination");
const escapeRegex = require("../../../common/utils/escapeRegex");

async function create(recruiterId, data) {
  return Job.create({ ...data, recruiter: recruiterId });
}

async function list(query) {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = { status: query.status || "open" };
  if (query.role) filter.role = new RegExp(escapeRegex(query.role), "i");
  if (query.location) filter.location = new RegExp(escapeRegex(query.location), "i");
  if (query.minSalary) filter.minSalary = { $gte: Number(query.minSalary) };
  if (query.search) filter.$text = { $search: query.search };

  const [items, total] = await Promise.all([
    Job.find(filter).sort(sort).skip(skip).limit(limit),
    Job.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function getById(id) {
  const job = await Job.findById(id);
  if (!job) throw new NotFoundError("Job not found");
  return job;
}

function assertOwnership(job, userId) {
  if (String(job.recruiter) !== String(userId)) {
    throw new ForbiddenError("You can only manage your own job postings");
  }
}

async function update(id, userId, updates) {
  const job = await getById(id);
  assertOwnership(job, userId);
  Object.assign(job, updates);
  await job.save();
  return job;
}

async function remove(id, userId) {
  const job = await getById(id);
  assertOwnership(job, userId);
  await job.deleteOne();
}

module.exports = { create, list, getById, update, remove, assertOwnership };
