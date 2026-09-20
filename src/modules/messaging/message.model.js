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

// History is read by room, in (createdAt, _id) order — the total order Task 10
// established. `_id` belongs *in* the index: without it the server can seek by
// roomId but must still sort the whole conversation in memory to break ties
// (measured: 10,000 documents examined to return a page of 20, with a blocking
// SORT stage). The roomId-only prefix still serves countDocuments({ roomId }).
messageSchema.index({ roomId: 1, createdAt: 1, _id: 1 });
// listConversations() matches { $or: [{ sender }, { receiver }] } and sorts by
// createdAt: with the sort key in each branch's index, Mongo walks both
// branches in order instead of loading every message a user ever exchanged
// into an in-memory sort.
//
// The trailing field is what conversationPartners() projects, which makes that
// distinct() covered by the index — it reads keys and never touches a document
// (measured: 10,047 documents examined before, 0 after). It costs one more key
// field on an existing index rather than a separate index to maintain.
messageSchema.index({ sender: 1, createdAt: -1, receiver: 1 });
messageSchema.index({ receiver: 1, createdAt: -1, sender: 1 });

// Deterministic room id for a pair of users, independent of who's "sender"
// in a given message — replaces the old client-supplied `roomId` (which let
// anyone address any room) with something derived only from real user ids.
messageSchema.statics.roomIdFor = function roomIdFor(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(":");
};

// Every field is server-set: sender and receiver come from the session and the
// validated payload, roomId is derived, delivered from server-side presence.
// The internal version key is not part of the API (same as User/Notification).
messageSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Message", messageSchema);
