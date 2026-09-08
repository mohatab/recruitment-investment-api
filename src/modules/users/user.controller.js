const userService = require("./user.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { ok } = require("../../common/utils/response");
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
  await userService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  ok(res, null, "Password changed");
});

const uploadCv = asyncHandler(async (req, res) => {
  if (!req.file) throw new NotFoundError("No file uploaded");
  const key = safeKey("cv", req.file.originalname);
  await storage.save(key, req.file.buffer, req.file.mimetype);
  const user = await userService.updateProfile(req.user.id, { cvUrl: storage.getUrl(key) });
  ok(res, user, "CV uploaded");
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  ok(res, user);
});

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.list(req.query);
  res.status(200).json({ success: true, data: items, meta, message: "OK" });
});

module.exports = { getMe, updateMe, changePassword, uploadCv, getById, list };
