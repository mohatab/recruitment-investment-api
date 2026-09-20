const mongoose = require("mongoose");
const ROLES = require("../../common/constants/roles");

const notificationSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetRole: { type: String, enum: [...Object.values(ROLES), null], default: null },
    read: { type: Boolean, default: false }, // personal notifications only
    // Role broadcasts: who has read it. Per user, so one reader can't mark it
    // read for the whole role.
    // ponytail: array grows with the role's audience; move to a receipts
    // collection if broadcasts reach many thousands of readers.
    readBy: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

// listMine() queries `{ $or: [{ user }, { targetRole }] }` sorted by
// (createdAt, _id) — Mongo satisfies an $or by index union, running each
// branch against its own index, so each branch gets its own compound index
// with the sort keys included rather than one lone index per field. Both sort
// keys have to be in the index: with only createdAt, the tiebreak forced the
// whole audience to be sorted in memory (measured: 3,344 documents examined to
// return 20). The optional `read` filter stays a residual predicate — it only
// narrows a set that is already scoped to one user, and giving it its own
// index would cost a write on every notification to save a handful of reads.
notificationSchema.index({ user: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ targetRole: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
