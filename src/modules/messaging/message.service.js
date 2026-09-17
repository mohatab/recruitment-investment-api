const Message = require("./message.model");
const { getIO } = require("../../realtime/ioRegistry");
const { onlineUsers } = require("../../realtime/presence");

async function send(senderId, receiverId, body) {
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
async function listWith(userId, otherUserId) {
  const roomId = Message.roomIdFor(userId, otherUserId);
  return Message.find({ roomId }).sort({ createdAt: 1 });
}

async function listConversations(userId) {
  const messages = await Message.find({ $or: [{ sender: userId }, { receiver: userId }] })
    .sort({ createdAt: -1 })
    .populate("sender", "firstName lastName")
    .populate("receiver", "firstName lastName");

  const conversations = new Map();
  for (const msg of messages) {
    const other = String(msg.sender._id) === String(userId) ? msg.receiver : msg.sender;
    if (!conversations.has(String(other._id))) {
      conversations.set(String(other._id), {
        userId: other._id,
        name: `${other.firstName} ${other.lastName}`,
        lastMessage: msg.body,
        timestamp: msg.createdAt,
        isOnline: onlineUsers.has(String(other._id)),
      });
    }
  }
  return Array.from(conversations.values());
}

module.exports = { send, listWith, listConversations };
