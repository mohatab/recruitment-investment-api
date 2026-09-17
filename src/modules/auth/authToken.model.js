const mongoose = require("mongoose");

// One-time tokens sent by email (password reset, email verification). Only
// the SHA-256 hash is stored, so a leak of this collection yields no usable
// links. Consumption is a single conditional update (see auth.service.js), and
// the TTL index removes expired documents.
const authTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["password_reset", "email_verification"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

authTokenSchema.index({ user: 1, purpose: 1, createdAt: -1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AuthToken", authTokenSchema);
