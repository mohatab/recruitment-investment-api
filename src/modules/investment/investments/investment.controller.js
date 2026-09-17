const investmentService = require("./investment.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, created, paginated } = require("../../../common/utils/response");

const create = asyncHandler(async (req, res) => {
  const { investment, clientSecret } = await investmentService.create(req.user.id, req.body);
  created(res, { investment, clientSecret }, "Investment created — confirm payment with the returned clientSecret");
});

const listMine = asyncHandler(async (req, res) => {
  const { items, pagination } = await investmentService.listMine(req.user.id, req.query);
  paginated(res, items, pagination);
});

const listForMyStartup = asyncHandler(async (req, res) => {
  const { items, pagination } = await investmentService.listForStartupOwner(req.user.id, req.query);
  paginated(res, items, pagination);
});

const refund = asyncHandler(async (req, res) => {
  const investment = await investmentService.refund(req.params.id);
  ok(res, investment, "Investment refunded");
});

module.exports = { create, listMine, listForMyStartup, refund };
