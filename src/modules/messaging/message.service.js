const mongoose = require("mongoose");
const Message = require("./message.model");
const User = require("../users/user.model");
const { AppError, NotFoundError, UnprocessableEntityError, CODES } = require("../../common/errors/AppError");
const { parsePagination, buildPagination } = require("../../common/utils/pagination");

const SORTABLE = ["createdAt"];
const { emitToRoom } = require("../../realtime/ioRegistry");
const { isOnline } = require("../../realtime/presence");

// A conversation partner is addressed by id in a path or a socket payload, so
// the id is checked here rather than in one of the two callers: an unusable id
// is a 400 with the same code a Mongo CastError produces elsewhere, not a
// silently empty result (which used to make `GET /messages/not-an-id` a 200).
function assertValidUserId(userId, field = "userId") {
  if (!mongoose.isValidObjectId(String(userId))) {
    throw new AppError(`Invalid ${field}`, 400, CODES.INVALID_ID);
  }
}

// Shared by REST and Socket.IO, so both apply the same recipient rules.
async function send(senderId, receiverId, body) {
  assertValidUserId(receiverId, "receiverId");
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
    // "Was the recipient connected at the moment this was persisted" — not a
    // read receipt, and never revised afterwards. Set from server-side
    // presence, never from the payload.
    delivered: isOnline(receiverId),
  });
  // Delivered to the recipient's own room, not the shared conversation
  // room — see src/realtime/socket.js for why (nothing auto-joins that
  // room, so emitting there would silently deliver to no one).
  emitToRoom(`user_${receiverId}`, "message", message);
  return message;
}

// Routes never take an arbitrary roomId from the client — the room is
// always recomputed from the two real user ids server-side, so a user can
// only ever read a conversation they're actually part of.
// Oldest-first by default: a chat transcript reads forwards. Page 1 is
// therefore the start of the conversation; pass sort=-createdAt for the latest.
async function listWith(userId, otherUserId, query) {
  assertValidUserId(otherUserId);
  const roomId = Message.roomIdFor(userId, otherUserId);
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: SORTABLE,
    defaultSort: { createdAt: 1 },
  });
  // Two messages can share a createdAt to the millisecond, and an unstable
  // order would silently repeat or skip a message across pages. _id is
  // monotonic within a second, which makes the order total.
  sort._id = sort.createdAt;
  const [items, total] = await Promise.all([
    Message.find({ roomId }).sort(sort).skip(skip).limit(limit),
    Message.countDocuments({ roomId }),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

// One conversation per partner, always newest-activity-first: there is no
// other meaningful order for an inbox, so this endpoint takes page/limit only
// (it used to accept and silently ignore `sort`). Grouped in MongoDB rather
// than by loading every message of the user into the process.
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

  const items = result.items.map((c) => ({ ...c, isOnline: isOnline(c.userId) }));
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

module.exports = { send, listWith, listConversations, conversationPartners, assertValidUserId, SORTABLE };
