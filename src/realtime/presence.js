// Online-presence is ephemeral by nature — it doesn't need to survive a
// restart or be queried like real data, so it lives in memory instead of a
// Mongo collection (removing the old dedicated "Userchat" presence model
// and its per-connect DB write).
// ponytail: single-process Map, correct until this runs on more than one
// Node process. Move to a shared store (Redis pub/sub or Socket.IO's Redis
// adapter) if/when this is horizontally scaled.
const onlineUsers = new Map(); // userId -> Set<socketId>

// Both return true only on a real transition (first socket online, last
// socket gone), so a second tab doesn't announce "online" twice or "offline"
// while another tab is still connected.
function markOnline(userId, socketId) {
  const key = String(userId);
  if (!onlineUsers.has(key)) onlineUsers.set(key, new Set());
  const sockets = onlineUsers.get(key);
  sockets.add(socketId);
  return sockets.size === 1;
}

function markOffline(userId, socketId) {
  const key = String(userId);
  const sockets = onlineUsers.get(key);
  if (!sockets) return false;
  // Only a socket we actually counted may decrement: a duplicate disconnect
  // for the same socket id must not drop a user who still has other tabs open.
  if (!sockets.delete(socketId)) return false;
  if (sockets.size > 0) return false;
  onlineUsers.delete(key);
  return true;
}

// The one place anything outside this module asks "is this user online" —
// callers never reach into the Map, so how presence is stored stays an
// implementation detail of this file.
const isOnline = (userId) => onlineUsers.has(String(userId));
const connectionCount = (userId) => onlineUsers.get(String(userId))?.size ?? 0;

module.exports = { onlineUsers, markOnline, markOffline, isOnline, connectionCount };
