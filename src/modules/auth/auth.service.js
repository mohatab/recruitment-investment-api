const crypto = require("crypto");
const User = require("../users/user.model");
const RefreshToken = require("./refreshToken.model");
const PasswordResetToken = require("./passwordResetToken.model");
const { signAccessToken, generateRefreshToken, hashToken } = require("./jwt");
const { sendEmail } = require("../../common/services/email.service");
const { ConflictError, UnauthorizedError } = require("../../common/errors/AppError");
const env = require("../../config/env");

const REFRESH_TTL_MS = env.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { accessToken, refreshToken };
}

async function register(input) {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new ConflictError("An account with this email already exists");

  const user = await User.create(input);
  const tokens = await issueTokenPair(user);
  return { user, ...tokens };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  const tokens = await issueTokenPair(user);
  user.password = undefined;
  return { user, ...tokens };
}

// Rotates the refresh token on every use: the old one is revoked and a new
// one issued, so a stolen-but-reused token is detectable (it will already
// be revoked) and a single leaked token has a limited window of use.
async function refresh(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  const stored = await RefreshToken.findOne({ tokenHash });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
  const user = await User.findById(stored.user);
  if (!user || !user.isActive) throw new UnauthorizedError("Invalid or expired refresh token");

  stored.revokedAt = new Date();
  await stored.save();

  return issueTokenPair(user);
}

async function logout(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
}

// Always responds the same way whether or not the email exists, so this
// endpoint can't be used to enumerate registered accounts.
async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString("hex");
  await PasswordResetToken.create({
    user: user._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  const link = `${env.baseUrl}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: "Password reset request",
    text: `Reset your password using this link (valid for 1 hour): ${link}`,
  });
}

async function resetPassword(rawToken, newPassword) {
  const tokenHash = hashToken(rawToken);
  const stored = await PasswordResetToken.findOne({ tokenHash });
  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired reset token");
  }

  const user = await User.findById(stored.user);
  if (!user) throw new UnauthorizedError("Invalid or expired reset token");

  user.password = newPassword;
  await user.save();

  // Single-use: mark the token spent and revoke every outstanding session
  // so a password reset actually locks out anyone using the old password's
  // active refresh tokens.
  stored.usedAt = new Date();
  await stored.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword };
