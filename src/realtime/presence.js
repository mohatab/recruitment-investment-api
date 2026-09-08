// Online-presence is ephemeral by nature — it doesn't need to survive a
// restart or be queried like real data, so it lives in memory instead of a
// Mongo collection (removing the old dedicated "Userchat" presence model
// and its per-connect DB write).
// ponytail: single-process Map, correct until this runs on more than one
// Node process. Move to a shared store (Redis pub/sub or Socket.IO's Redis
// adapter) if/when this is horizontally scaled.
const onlineUsers = new Map(); // userId -> Set<socketId>

function markOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}

function markOffline(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
}

module.exports = { onlineUsers, markOnline, markOffline };
