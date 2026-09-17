const authService = require("./auth.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { created, ok } = require("../../common/utils/response");

const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  created(
    res,
    { user, accessToken, refreshToken },
    "Registered successfully — check your email to verify your address"
  );
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  ok(res, { user, accessToken, refreshToken }, "Logged in successfully");
});

const refresh = asyncHandler(async (req, res) => {
  ok(res, await authService.refresh(req.body.refreshToken), "Token refreshed");
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  ok(res, null, "Logged out");
});

const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.id);
  ok(res, null, "Logged out of all sessions");
});

const forgotPassword = (req, res) => {
  authService.forgotPassword(req.body.email);
  ok(res, null, "If that email is registered, a reset link has been sent");
};

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  ok(res, null, "Password reset successfully — sign in with your new password");
});

const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body.token);
  ok(res, null, "Email verified");
});

const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.user.id);
  ok(res, null, "If your email is not yet verified, a new verification link has been sent");
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
};
