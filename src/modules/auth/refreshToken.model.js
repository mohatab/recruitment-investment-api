const mongoose = require("mongoose");

// Refresh tokens are stored hashed (never the raw token) so a database leak
// alone doesn't hand out usable tokens. `revokedAt` lets logout/rotation
// invalidate a single token without needing a stateless-JWT blocklist.
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
