const mongoose = require("mongoose");

const REVOKE_REASONS = [
  "rotated",
  "logout",
  "logout_all",
  "password_change",
  "password_reset",
  "deactivated",
  "reuse_detected",
];

// Opaque refresh tokens, stored hashed. A token is valid only while it is
// unrevoked, unexpired, and its `tokenVersion` still matches the user's: any
// "revoke all sessions" bumps User.tokenVersion, which also invalidates tokens
// issued concurrently with the revocation.
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    tokenVersion: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    // Distinguishes rotation from other revocations: only replaying a *rotated*
    // token is treated as theft.
    revokedReason: { type: String, enum: [...REVOKE_REASONS, null], default: null },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
