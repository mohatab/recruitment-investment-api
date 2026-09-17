const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../../config/env");

// Algorithm pinned explicitly on both sign and verify — a server that
// accepts whatever algorithm a token *claims* to use is vulnerable to
// algorithm-confusion attacks (e.g. a token crafted with "alg: none", or
// signed with a public key and presented as HMAC). Restricting verify to
// exactly what we sign with closes that off regardless of library defaults.
const ALGORITHM = "HS256";

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
    algorithm: ALGORITHM,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { algorithms: [ALGORITHM] });
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
