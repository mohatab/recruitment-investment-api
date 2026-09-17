const startupService = require("./startup.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, created, paginated } = require("../../../common/utils/response");

const upsertMine = asyncHandler(async (req, res) => {
  const { startup, created: isNew } = await startupService.upsertMine(req.user.id, req.body);
  if (isNew) return created(res, startup, "Startup profile created");
  ok(res, startup, "Startup profile updated");
});

const getMine = asyncHandler(async (req, res) => {
  const startup = await startupService.getMine(req.user.id);
  ok(res, startup);
});

const getById = asyncHandler(async (req, res) => {
  const startup = await startupService.getById(req.params.id);
  ok(res, startup);
});

const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await startupService.list(req.query);
  paginated(res, items, pagination);
});

const matches = asyncHandler(async (req, res) => {
  const { items, pagination } = await startupService.matchesForInvestor(req.user.id, req.query);
  paginated(res, items, pagination);
});

const successAssessment = asyncHandler(async (req, res) => {
  ok(res, startupService.successAssessment(req.body));
});

module.exports = { upsertMine, getMine, getById, list, matches, successAssessment };
