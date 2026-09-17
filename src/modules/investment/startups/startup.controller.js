const startupService = require("./startup.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, paginated } = require("../../../common/utils/response");

const upsertMine = asyncHandler(async (req, res) => {
  const startup = await startupService.upsertMine(req.user.id, req.body);
  ok(res, startup, "Startup profile saved");
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
  const { items, meta } = await startupService.list(req.query);
  paginated(res, items, meta);
});

const matches = asyncHandler(async (req, res) => {
  const startups = await startupService.matchesForInvestor(req.user.id);
  ok(res, startups);
});

const successAssessment = asyncHandler(async (req, res) => {
  ok(res, startupService.successAssessment(req.body));
});

module.exports = { upsertMine, getMine, getById, list, matches, successAssessment };
