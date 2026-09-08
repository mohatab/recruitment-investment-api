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

module.exports = { setIO, getIO };
