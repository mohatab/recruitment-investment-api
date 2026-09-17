const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    roomId: { type: String, required: true },
    body: { type: String, required: true, trim: true, minlength: 1 },
    delivered: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Every query filters on roomId, most also sort by createdAt — this single
// compound index serves both (its roomId-only prefix also covers a
// roomId-alone query), so a separate single-field index on roomId would be
// pure write overhead with no query it uniquely serves.
messageSchema.index({ roomId: 1, createdAt: 1 });

// Deterministic room id for a pair of users, independent of who's "sender"
// in a given message — replaces the old client-supplied `roomId` (which let
// anyone address any room) with something derived only from real user ids.
messageSchema.statics.roomIdFor = function roomIdFor(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(":");
};

module.exports = mongoose.model("Message", messageSchema);
