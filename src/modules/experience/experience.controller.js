const experienceService = require("./experience.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { ok, created } = require("../../common/utils/response");

const create = asyncHandler(async (req, res) => {
  created(res, await experienceService.create(req.user.id, req.body));
});

const listMine = asyncHandler(async (req, res) => {
  ok(res, await experienceService.listMine(req.user.id));
});

const remove = asyncHandler(async (req, res) => {
  await experienceService.remove(req.params.id, req.user.id);
  ok(res, null, "Experience entry deleted");
});

module.exports = { create, listMine, remove };
