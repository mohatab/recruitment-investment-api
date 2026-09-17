const experienceService = require("./experience.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { created, noContent, paginated } = require("../../common/utils/response");

const create = asyncHandler(async (req, res) => {
  created(res, await experienceService.create(req.user.id, req.body));
});

const listMine = asyncHandler(async (req, res) => {
  const { items, pagination } = await experienceService.listMine(req.user.id, req.query);
  paginated(res, items, pagination);
});

const remove = asyncHandler(async (req, res) => {
  await experienceService.remove(req.params.id, req.user.id);
  noContent(res);
});

module.exports = { create, listMine, remove };
