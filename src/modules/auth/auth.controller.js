const authService = require("./auth.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { created, ok } = require("../../common/utils/response");

const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  created(res, { user, accessToken, refreshToken }, "Registered successfully");
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  ok(res, { user, accessToken, refreshToken }, "Logged in successfully");
});

const refresh = asyncHandler(async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  ok(res, tokens, "Token refreshed");
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  ok(res, null, "Logged out");
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  ok(res, null, "If that email is registered, a reset link has been sent");
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  ok(res, null, "Password reset successfully");
});

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword };
