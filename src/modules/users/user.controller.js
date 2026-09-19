const userService = require("./user.service");
const authService = require("../auth/auth.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { ok, noContent, paginated } = require("../../common/utils/response");
const { inspect } = require("../../common/middleware/upload");
const { sendFile } = require("../../common/utils/fileResponse");

const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.user.id);
  ok(res, user);
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);
  ok(res, user, "Profile updated");
});

const changePassword = asyncHandler(async (req, res) => {
  const tokens = await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  ok(res, tokens, "Password changed — all other sessions have been signed out");
});

const uploadCv = asyncHandler(async (req, res) => {
  const file = inspect(req.file, "cv");
  const user = await userService.replaceCv(req.user.id, file);
  ok(res, user, "CV uploaded");
});

const downloadMyCv = asyncHandler(async (req, res) => {
  sendFile(res, await userService.readCv(req.user.id, req.user));
});

// Same shape for someone else's CV; the service decides whether this requester
// is entitled to it (owner, admin, or the recruiter they applied to).
const downloadUserCv = asyncHandler(async (req, res) => {
  sendFile(res, await userService.readCv(req.params.id, req.user));
});

const deleteMyCv = asyncHandler(async (req, res) => {
  await userService.deleteCv(req.user.id);
  noContent(res);
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getPublicProfile(req.params.id);
  ok(res, user);
});

const setStatus = asyncHandler(async (req, res) => {
  const user = await userService.setStatus(req.params.id, req.user.id, req.body.isActive);
  ok(res, user, user.isActive ? "Account activated" : "Account deactivated");
});

const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await userService.list(req.query);
  paginated(res, items, pagination);
});

module.exports = {
  getMe,
  updateMe,
  changePassword,
  uploadCv,
  downloadMyCv,
  downloadUserCv,
  deleteMyCv,
  getById,
  list,
  setStatus,
};
