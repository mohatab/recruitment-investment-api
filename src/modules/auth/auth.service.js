const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../users/user.model");
const RefreshToken = require("./refreshToken.model");
const AuthToken = require("./authToken.model");
const { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken } = require("./jwt");
const { sendEmail } = require("../../common/services/email.service");
const { getIO } = require("../../realtime/ioRegistry");
const { AppError, ConflictError, UnauthorizedError, NotFoundError } = require("../../common/errors/AppError");
const logger = require("../../common/utils/logger");
const env = require("../../config/env");

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = env.jwt.refreshExpiresInDays * DAY_MS;
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = DAY_MS;
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000; // blunts mail-bombing a victim's inbox

// Compared against when the email is unknown, so login takes the same bcrypt
// time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

const invalidSession = () => new UnauthorizedError("Invalid or expired authentication token");
const invalidToken = () => new AppError("Invalid or expired token", 400, "INVALID_TOKEN");

// ---------- sessions ----------

// The single access-token check for HTTP and Socket.IO. Reads the user so a
// deactivation or session revocation takes effect on the very next request.
// ponytail: one indexed _id lookup per authenticated request; add a short-TTL
// cache here if that ever shows up in profiles.
async function authenticateAccessToken(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw invalidSession();
  }
  const user = await User.findById(payload.sub).select("role isActive tokenVersion emailVerifiedAt").lean();
  if (!user || !user.isActive || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) throw invalidSession();

  return {
    id: String(user._id),
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    tokenExpiresAt: payload.exp * 1000,
  };
}

async function issueTokenPair(user) {
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    tokenVersion: user.tokenVersion ?? 0,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

// Kills every session of a user: the version bump invalidates outstanding
// access tokens and any refresh token issued with the old version (including
// one being issued concurrently); revoking stored tokens is bookkeeping.
async function revokeAllSessions(userId, reason) {
  const user = await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }, { new: true });
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date(), revokedReason: reason });
  getIO()?.in(`user_${userId}`).disconnectSockets(true);
  return user;
}

// ---------- one-time email tokens ----------

async function issueEmailToken(userId, purpose, ttlMs) {
  // A new link supersedes any unused one for the same purpose.
  await AuthToken.updateMany({ user: userId, purpose, usedAt: null }, { usedAt: new Date() });
  const raw = crypto.randomBytes(32).toString("hex");
  await AuthToken.create({ user: userId, purpose, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) });
  return raw;
}

// Atomic: of any number of concurrent requests with the same token, exactly
// one gets the document back.
function consumeEmailToken(raw, purpose) {
  const now = new Date();
  return AuthToken.findOneAndUpdate(
    { tokenHash: hashToken(raw), purpose, usedAt: null, expiresAt: { $gt: now } },
    { usedAt: now }
  );
}

function sentRecently(userId, purpose) {
  return AuthToken.exists({
    user: userId,
    purpose,
    createdAt: { $gt: new Date(Date.now() - EMAIL_RESEND_COOLDOWN_MS) },
  });
}

// Tokens go in the URL fragment, which browsers never send to servers, so they
// don't land in the client app's access logs or Referer headers.
async function sendVerificationEmail(user) {
  const token = await issueEmailToken(user._id, "email_verification", VERIFY_TTL_MS);
  // Not awaited: SMTP latency must not slow registration, and sendEmail never throws.
  sendEmail({
    to: user.email,
    subject: "Confirm your email address",
    text: `Confirm your email address (link valid for 24 hours): ${env.appUrl}/verify-email#token=${token}`,
  });
}

// ---------- public operations ----------

async function register(input) {
  if (await User.exists({ email: input.email })) {
    throw new ConflictError("An account with this email already exists");
  }
  const user = await User.create(input);
  await sendVerificationEmail(user);
  return { user, ...(await issueTokenPair(user)) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select("+password");
  const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !passwordOk) throw new UnauthorizedError("Invalid email or password");
  // Only disclosed after the password proved ownership of the account.
  if (!user.isActive) throw new AppError("This account has been deactivated", 403, "ACCOUNT_DISABLED");

  const tokens = await issueTokenPair(user);
  user.password = undefined;
  return { user, ...tokens };
}

// Rotation with reuse detection. Consuming the presented token is one atomic
// conditional update, so concurrent requests with the same token can never
// both succeed. Presenting a token that was already rotated means two parties
// hold it (theft, or a client bug); since the legitimate one can't be told
// apart, every session of the user is revoked.
async function refresh(rawToken) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const stored = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now, revokedReason: "rotated" }
  );

  if (!stored) {
    const known = await RefreshToken.findOne({ tokenHash, revokedReason: "rotated" });
    if (known) {
      logger.warn("Refresh token reuse detected; revoking all sessions", { userId: String(known.user) });
      await revokeAllSessions(known.user, "reuse_detected");
    }
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const user = await User.findById(stored.user);
  if (!user || !user.isActive || (stored.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
  return issueTokenPair(user);
}

async function logout(rawToken) {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { revokedAt: new Date(), revokedReason: "logout" }
  );
}

async function logoutAll(userId) {
  await revokeAllSessions(userId, "logout_all");
}

// Responds before doing any work, so neither the response nor its timing
// depends on whether the email is registered. Failures are logged, not surfaced.
function forgotPassword(email) {
  setImmediate(async () => {
    try {
      const user = await User.findOne({ email, isActive: true });
      if (!user || (await sentRecently(user._id, "password_reset"))) return;

      const token = await issueEmailToken(user._id, "password_reset", RESET_TTL_MS);
      await sendEmail({
        to: user.email,
        subject: "Password reset request",
        text:
          `Reset your password (link valid for 1 hour): ${env.appUrl}/reset-password#token=${token}\n\n` +
          "If you didn't request this, you can ignore this email.",
      });
    } catch (err) {
      logger.error("Password reset request failed", { error: err.message });
    }
  });
}

async function resetPassword(rawToken, newPassword) {
  const stored = await consumeEmailToken(rawToken, "password_reset");
  if (!stored) throw invalidToken();

  const user = await User.findById(stored.user);
  if (!user || !user.isActive) throw invalidToken();

  user.password = newPassword;
  user.emailVerifiedAt ??= new Date(); // receiving the link proves ownership of the address
  await user.save();
  await revokeAllSessions(user._id, "password_reset");
}

async function verifyEmail(rawToken) {
  const stored = await consumeEmailToken(rawToken, "email_verification");
  if (!stored) throw invalidToken();
  await User.updateOne({ _id: stored.user, emailVerifiedAt: null }, { emailVerifiedAt: new Date() });
}

async function resendVerification(userId) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  if (user.emailVerifiedAt || (await sentRecently(user._id, "email_verification"))) return;
  await sendVerificationEmail(user);
}

// Revokes every session (including the caller's), then issues a fresh pair so
// the device that changed the password stays signed in.
async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new NotFoundError("User not found");
  if (!(await user.comparePassword(currentPassword))) {
    throw new UnauthorizedError("Current password is incorrect");
  }
  user.password = newPassword;
  await user.save();
  const updated = await revokeAllSessions(user._id, "password_change");
  return issueTokenPair(updated);
}

module.exports = {
  authenticateAccessToken,
  revokeAllSessions,
  register,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  changePassword,
};
