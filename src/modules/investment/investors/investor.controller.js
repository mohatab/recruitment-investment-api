const investorService = require("./investor.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, created } = require("../../../common/utils/response");

const upsertMine = asyncHandler(async (req, res) => {
  const { investor, created: isNew } = await investorService.upsertMine(req.user.id, req.body);
  if (isNew) return created(res, investor, "Investor profile created");
  ok(res, investor, "Investor profile updated");
});

const getMine = asyncHandler(async (req, res) => {
  const investor = await investorService.getMine(req.user.id);
  ok(res, investor);
});

const getById = asyncHandler(async (req, res) => {
  const investor = await investorService.getById(req.params.id);
  ok(res, investor);
});

module.exports = { upsertMine, getMine, getById };
