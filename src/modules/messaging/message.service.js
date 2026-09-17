const mongoose = require("mongoose");
const Message = require("./message.model");
const User = require("../users/user.model");
const { NotFoundError, UnprocessableEntityError, CODES } = require("../../common/errors/AppError");
const { parsePagination, buildPagination } = require("../../common/utils/pagination");

const SORTABLE = ["createdAt"];
const { getIO } = require("../../realtime/ioRegistry");
const { onlineUsers } = require("../../realtime/presence");

// Shared by REST and Socket.IO, so both apply the same recipient rules.
async function send(senderId, receiverId, body) {
  if (String(senderId) === String(receiverId)) {
    throw new UnprocessableEntityError("You cannot send a message to yourself", CODES.SELF_MESSAGE_NOT_ALLOWED);
  }
  // Deactivated accounts are indistinguishable from missing ones here.
  if (!(await User.exists({ _id: receiverId, isActive: true }))) throw new NotFoundError("Recipient not found");

  const roomId = Message.roomIdFor(senderId, receiverId);
  const message = await Message.create({
    sender: senderId,
    receiver: receiverId,
    roomId,
    body,
    delivered: onlineUsers.has(String(receiverId)),
  });
  // Delivered to the recipient's own room, not the shared conversation
  // room — see src/realtime/socket.js for why (nothing auto-joins that
  // room, so emitting there would silently deliver to no one).
  getIO()?.to(`user_${receiverId}`).emit("message", message);
  return message;
}

// Routes never take an arbitrary roomId from the client — the room is
// always recomputed from the two real user ids server-side, so a user can
// only ever read a conversation they're actually part of.
// Oldest-first by default: a chat transcript reads forwards. Page 1 is
// therefore the start of the conversation; pass sort=-createdAt for the latest.
async function listWith(userId, otherUserId, query) {
  const roomId = Message.roomIdFor(userId, otherUserId);
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: SORTABLE,
    defaultSort: { createdAt: 1 },
  });
  const [items, total] = await Promise.all([
    Message.find({ roomId }).sort(sort).skip(skip).limit(limit),
    Message.countDocuments({ roomId }),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

// One conversation per partner, newest first. Grouped in MongoDB rather than
// by loading every message of the user into the process.
async function listConversations(userId, query) {
  const { page, limit, skip } = parsePagination(query);
  const id = new mongoose.Types.ObjectId(String(userId));

  const [result] = await Message.aggregate([
    { $match: { $or: [{ sender: id }, { receiver: id }] } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { $cond: [{ $eq: ["$sender", id] }, "$receiver", "$sender"] },
        lastMessage: { $first: "$body" },
        timestamp: { $first: "$createdAt" },
      },
    },
    { $sort: { timestamp: -1 } },
    {
      $facet: {
        total: [{ $count: "count" }],
        items: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "partner" } },
          { $unwind: "$partner" },
          {
            $project: {
              _id: 0,
              userId: "$_id",
              name: { $concat: ["$partner.firstName", " ", "$partner.lastName"] },
              lastMessage: 1,
              timestamp: 1,
            },
          },
        ],
      },
    },
  ]);

  const items = result.items.map((c) => ({ ...c, isOnline: onlineUsers.has(String(c.userId)) }));
  return { items, pagination: buildPagination({ page, limit, total: result.total[0]?.count || 0 }) };
}

// Users who share a conversation with userId: the only people allowed to see
// that user's online status (same rule as isOnline in listConversations).
async function conversationPartners(userId) {
  const [received, sent] = await Promise.all([
    Message.distinct("receiver", { sender: userId }),
    Message.distinct("sender", { receiver: userId }),
  ]);
  return [...new Set([...received, ...sent].map(String))];
}

module.exports = { send, listWith, listConversations, conversationPartners, SORTABLE };
