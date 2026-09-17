const userService = require("./user.service");
const authService = require("../auth/auth.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { ok, paginated } = require("../../common/utils/response");
const storage = require("../../common/storage");
const { safeKey } = require("../../common/middleware/upload");
const { NotFoundError } = require("../../common/errors/AppError");

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
  if (!req.file) throw new NotFoundError("No file uploaded");
  const key = safeKey("cv", req.file.originalname);
  await storage.save(key, req.file.buffer, req.file.mimetype);
  const user = await userService.updateProfile(req.user.id, { cvUrl: storage.getUrl(key) });
  ok(res, user, "CV uploaded");
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
  const { items, meta } = await userService.list(req.query);
  paginated(res, items, meta);
});

module.exports = { getMe, updateMe, changePassword, uploadCv, getById, list, setStatus };
