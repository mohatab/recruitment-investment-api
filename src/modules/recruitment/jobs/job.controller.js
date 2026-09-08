const jobService = require("./job.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, created } = require("../../../common/utils/response");

const create = asyncHandler(async (req, res) => {
  const job = await jobService.create(req.user.id, req.body);
  created(res, job, "Job posted");
});

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await jobService.list(req.query);
  res.status(200).json({ success: true, data: items, meta, message: "OK" });
});

const getById = asyncHandler(async (req, res) => {
  const job = await jobService.getById(req.params.id);
  ok(res, job);
});

const update = asyncHandler(async (req, res) => {
  const job = await jobService.update(req.params.id, req.user.id, req.body);
  ok(res, job, "Job updated");
});

const remove = asyncHandler(async (req, res) => {
  await jobService.remove(req.params.id, req.user.id);
  ok(res, null, "Job deleted");
});

module.exports = { create, list, getById, update, remove };
