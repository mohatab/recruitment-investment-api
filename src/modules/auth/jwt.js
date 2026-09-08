const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../../config/env");

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

// Refresh tokens are opaque random strings, not JWTs: they're stored
// (hashed) server-side in RefreshToken documents so a single token can be
// revoked on logout/rotation without needing a blocklist for stateless JWTs.
function generateRefreshToken() {
  return crypto.randomBytes(40).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
