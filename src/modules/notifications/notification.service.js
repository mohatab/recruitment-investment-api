const Notification = require("./notification.model");
const { getIO } = require("../../realtime/ioRegistry");
const { NotFoundError, ForbiddenError } = require("../../common/errors/AppError");
const { parsePagination, buildMeta } = require("../../common/utils/pagination");

async function notifyUser(userId, message) {
  const notification = await Notification.create({ message, user: userId });
  getIO()?.to(`user_${userId}`).emit("notification", notification);
  return notification;
}

async function notifyRole(role, message) {
  const notification = await Notification.create({ message, targetRole: role });
  getIO()?.to(`role_${role}`).emit("notification", notification);
  return notification;
}

async function listMine(userId, role, query) {
  const { page, limit, skip, sort } = parsePagination(query);
  // A user sees notifications addressed to them personally, plus broadcasts
  // for their role — never anyone else's.
  const filter = { $or: [{ user: userId }, { targetRole: role }] };

  const [items, total] = await Promise.all([
    Notification.find(filter).sort(sort).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function markRead(notificationId, userId) {
  const notification = await Notification.findById(notificationId);
  if (!notification) throw new NotFoundError("Notification not found");
  if (notification.user && String(notification.user) !== String(userId)) {
    throw new ForbiddenError("You can only update your own notifications");
  }
  notification.read = true;
  await notification.save();
  return notification;
}

module.exports = { notifyUser, notifyRole, listMine, markRead };
