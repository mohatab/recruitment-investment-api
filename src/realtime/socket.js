const authService = require("../modules/auth/auth.service");
const messageService = require("../modules/messaging/message.service");
const messageSchemas = require("../modules/messaging/message.validation");
const { AppError, CODES } = require("../common/errors/AppError");
const { markOnline, markOffline } = require("./presence");
const logger = require("../common/utils/logger");

// Applied wherever the Socket.IO server is constructed (src/server.js and the
// integration tests), so the transport-level limits are not something one
// entry point can forget.
//
// maxHttpBufferSize caps a frame before any handler sees it: the largest
// legitimate event here is a 5,000-character message, so 64KB is generous
// while keeping the default 1MB — which an authenticated client could send
// on every frame — off the table.
const serverOptions = { maxHttpBufferSize: 64 * 1024, pingTimeout: 20_000 };

// Per-socket event budget. Enough for a fast typist with several tabs; a
// script hammering the connection gets TOO_MANY_REQUESTS acks instead of
// unbounded database writes. Purely in-process, like the HTTP limiter.
// ponytail: per-socket counter, so limits are per connection and per process.
// A user opening many sockets gets a multiple of this; connection-count
// limiting belongs at the proxy/infra layer (documented in SECURITY.md).
const EVENT_LIMIT = 30;
const EVENT_WINDOW_MS = 10_000;

function createEventBudget() {
  let windowStart = Date.now();
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart >= EVENT_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= EVENT_LIMIT;
  };
}

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
// wrapper rate-limits, validates the payload at the boundary, catches sync and
// async failures, logs them, and answers through the ack instead.
//
// Acks use the same error codes as the REST API: { ok: false, error: { code,
// message } }. Nothing internal (stack, driver error, query) is ever sent.
function onEvent(socket, event, schema, handler) {
  const withinBudget = socket.data.eventBudget ?? (socket.data.eventBudget = createEventBudget());

  socket.on(event, async (...args) => {
    // The ack is whatever the client sent last; only call it if it's a function.
    const ack = typeof args[args.length - 1] === "function" ? args.pop() : () => {};
    try {
      if (!withinBudget()) {
        return ack({
          ok: false,
          error: { code: CODES.TOO_MANY_REQUESTS, message: "Too many events, slow down" },
        });
      }
      const { error, value } = schema.required().validate(args[0], { abortEarly: false, stripUnknown: true });
      if (error) {
        return ack({
          ok: false,
          error: { code: CODES.VALIDATION_ERROR, message: error.details.map((d) => d.message).join("; ") },
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
      ack({ ok: false, error: { code: CODES.INTERNAL_ERROR, message: "Something went wrong" } });
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
    // recipient's user_<id> room happens inside the service, after the
    // message is persisted.
    onEvent(socket, "chat:message", messageSchemas.send, ({ receiverId, body }) =>
      messageService.send(userId, receiverId, body)
    );

    // Fires for every disconnect reason — client close, transport error,
    // token expiry above, and the forced disconnect on session revocation.
    socket.on("disconnect", () => {
      clearTimeout(expiry);
      if (markOffline(userId, socket.id)) announcePresence(io, userId, false);
    });
  });
}

module.exports = {
  initSocket,
  authenticateSocket,
  onEvent,
  createEventBudget,
  serverOptions,
  EVENT_LIMIT,
  EVENT_WINDOW_MS,
};
