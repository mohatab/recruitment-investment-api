const jobService = require("./job.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, created, noContent, paginated } = require("../../../common/utils/response");

const create = asyncHandler(async (req, res) => {
  const job = await jobService.create(req.user.id, req.body);
  created(res, job, "Job posted");
});

const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await jobService.list(req.query);
  paginated(res, items, pagination);
});

const listMine = asyncHandler(async (req, res) => {
  const { items, pagination } = await jobService.listMine(req.user.id, req.query);
  paginated(res, items, pagination);
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
  noContent(res);
});

module.exports = { create, list, listMine, getById, update, remove };
