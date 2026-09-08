const { verifyAccessToken } = require("../modules/auth/jwt");
const { markOnline, markOffline } = require("./presence");
const Message = require("../modules/messaging/message.model");
const logger = require("../common/utils/logger");

// Every previous vulnerability here came from trusting a client-supplied
// userId/room. The fix is structural: identity is established once, from
// the verified JWT, at handshake time — every room a socket can join is
// then derived from that identity, never from event payloads.
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication token required"));
  try {
    const payload = verifyAccessToken(token);
    socket.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new Error("Invalid or expired authentication token"));
  }
}

function initSocket(io) {
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const { id: userId, role } = socket.user;

    // A socket only ever joins rooms derived from its own verified
    // identity — never an id read out of the connection payload.
    socket.join(`user_${userId}`);
    socket.join(`role_${role}`);
    markOnline(userId, socket.id);
    io.to(`role_${role}`).emit("presence", { userId, online: true });

    socket.on("chat:message", async ({ receiverId, body }, ack) => {
      try {
        if (!receiverId || !body) return ack?.({ error: "receiverId and body are required" });
        const roomId = Message.roomIdFor(userId, receiverId);
        const message = await Message.create({ sender: userId, receiver: receiverId, roomId, body });
        io.to(roomId).emit("message", message);
        ack?.({ ok: true, message });
      } catch (err) {
        logger.error("chat:message failed", { error: err.message });
        ack?.({ error: "Failed to send message" });
      }
    });

    // Joining a conversation room is only possible for a room you're
    // actually a participant in — recomputed from your own id, not taken
    // as a raw room name from the client.
    socket.on("chat:join", ({ otherUserId }) => {
      if (!otherUserId) return;
      socket.join(Message.roomIdFor(userId, otherUserId));
    });

    socket.on("disconnect", () => {
      markOffline(userId, socket.id);
      io.to(`role_${role}`).emit("presence", { userId, online: false });
    });
  });
}

module.exports = { initSocket, authenticateSocket };
