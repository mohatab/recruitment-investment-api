const investmentService = require("./investment.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, created } = require("../../../common/utils/response");

const create = asyncHandler(async (req, res) => {
  const { investment, clientSecret } = await investmentService.create(req.user.id, req.body);
  created(res, { investment, clientSecret }, "Investment created — confirm payment with the returned clientSecret");
});

const listMine = asyncHandler(async (req, res) => {
  ok(res, await investmentService.listMine(req.user.id));
});

const listForMyStartup = asyncHandler(async (req, res) => {
  ok(res, await investmentService.listForStartupOwner(req.user.id));
});

const refund = asyncHandler(async (req, res) => {
  const investment = await investmentService.refund(req.params.id, req.user.id, req.user.role);
  ok(res, investment, "Investment refunded");
});

module.exports = { create, listMine, listForMyStartup, refund };
