const investorService = require("./investor.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok } = require("../../../common/utils/response");

const upsertMine = asyncHandler(async (req, res) => {
  const investor = await investorService.upsertMine(req.user.id, req.body);
  ok(res, investor, "Investor profile saved");
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
