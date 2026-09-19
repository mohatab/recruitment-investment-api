// Holds the single Socket.IO server instance so services (e.g. notifications)
// can emit real-time events without importing server.js / creating a cycle.
// Deliberately a plain module-level variable, not a class: there is exactly
// one io instance per process.
let io = null;

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

// Realtime delivery is best-effort and always comes *after* the database
// write that it announces: the durable record already exists and is reachable
// over REST, so a transport failure must be logged rather than turned into a
// failure for an operation that actually succeeded. It also must never throw
// into a caller (or, from a socket handler, into an unhandled rejection).
function emitToRoom(room, event, payload) {
  try {
    const instance = getIO();
    if (!instance) return false;
    instance.to(room).emit(event, payload);
    return true;
  } catch (err) {
    // Lazily required: this module is loaded by services that logger does not
    // depend on, and keeping it out of the import cycle costs nothing.
    require("../common/utils/logger").error("Realtime delivery failed", { room, event, error: err.message });
    return false;
  }
}

module.exports = { setIO, getIO, emitToRoom };
