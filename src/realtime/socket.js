const authService = require("../modules/auth/auth.service");
const messageService = require("../modules/messaging/message.service");
const messageSchemas = require("../modules/messaging/message.validation");
const { AppError } = require("../common/errors/AppError");
const { markOnline, markOffline } = require("./presence");
const logger = require("../common/utils/logger");

// Identity is established once, at handshake, by the same check HTTP uses
// (signature, expiry, account active, session not revoked). Rooms derive from
// that identity only, never from event payloads.
async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (typeof token !== "string" || !token) return next(new Error("Authentication token required"));
  try {
    socket.user = await authService.authenticateAccessToken(token);
  } catch {
    return next(new Error("Invalid or expired authentication token"));
  }
  next();
}

// The only way to register a client->server event. Socket.IO ignores the
// promise an async listener returns, so any throw or rejection that escapes a
// listener becomes an unhandledRejection and terminates the process. This
// wrapper validates the payload at the boundary, catches sync and async
// failures, logs them, and answers through the ack instead.
function onEvent(socket, event, schema, handler) {
  socket.on(event, async (...args) => {
    // The ack is whatever the client sent last; only call it if it's a function.
    const ack = typeof args[args.length - 1] === "function" ? args.pop() : () => {};
    try {
      const { error, value } = schema.required().validate(args[0], { abortEarly: false, stripUnknown: true });
      if (error) {
        return ack({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: error.details.map((d) => d.message).join("; ") },
        });
      }
      ack({ ok: true, data: await handler(value) });
    } catch (err) {
      if (err instanceof AppError) {
        return ack({ ok: false, error: { code: err.code, message: err.message } });
      }
      logger.error("Socket event handler failed", {
        event,
        socketId: socket.id,
        userId: socket.user.id,
        error: err.message,
        stack: err.stack,
      });
      ack({ ok: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  });
}

// Online status goes only to users who share a conversation with this user —
// the same audience that sees isOnline in GET /api/messages/conversations.
// (It used to go to every user with the same role.) Fire-and-forget, so a
// failed lookup is logged rather than escaping the connection handler.
function announcePresence(io, userId, online) {
  messageService
    .conversationPartners(userId)
    .then((partners) => {
      if (partners.length) io.to(partners.map((id) => `user_${id}`)).emit("presence", { userId, online });
    })
    .catch((err) => logger.error("Presence broadcast failed", { userId, error: err.message }));
}

function initSocket(io) {
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const { id: userId, role, tokenExpiresAt } = socket.user;

    // A socket must not outlive the access token that opened it.
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, tokenExpiresAt - Date.now()));
    expiry.unref();

    socket.join(`user_${userId}`);
    socket.join(`role_${role}`); // receives admin broadcasts for this role (same audience as GET /notifications)
    if (markOnline(userId, socket.id)) announcePresence(io, userId, true);

    // Same service and schema as POST /api/messages; delivery to the
    // recipient's user_<id> room happens inside the service.
    onEvent(socket, "chat:message", messageSchemas.send, ({ receiverId, body }) =>
      messageService.send(userId, receiverId, body)
    );

    socket.on("disconnect", () => {
      clearTimeout(expiry);
      if (markOffline(userId, socket.id)) announcePresence(io, userId, false);
    });
  });
}

module.exports = { initSocket, authenticateSocket, onEvent };
