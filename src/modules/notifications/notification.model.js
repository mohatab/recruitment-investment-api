const mongoose = require("mongoose");
const ROLES = require("../../common/constants/roles");

const notificationSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetRole: { type: String, enum: [...Object.values(ROLES), null], default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// listMine() queries `{ $or: [{ user }, { targetRole }] }` sorted by
// createdAt — Mongo satisfies an $or by index union, running each branch
// against its own index, so each branch gets its own compound index with
// the sort key included rather than one lone index per field.
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ targetRole: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
