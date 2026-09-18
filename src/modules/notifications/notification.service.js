const Notification = require("./notification.model");
const User = require("../users/user.model");
const { getIO } = require("../../realtime/ioRegistry");
const { NotFoundError, ForbiddenError } = require("../../common/errors/AppError");
const logger = require("../../common/utils/logger");
const { parsePagination, buildPagination } = require("../../common/utils/pagination");

const SORTABLE = ["createdAt"];

// What a given user sees: `read` is per user for role broadcasts, and the list
// of other readers (readBy) is never exposed.
function toView(notification, userId) {
  const { readBy = [], ...rest } = notification.toObject ? notification.toObject() : notification;
  const read = rest.user ? rest.read : readBy.some((id) => String(id) === String(userId));
  delete rest.__v;
  return { ...rest, read };
}

async function notifyUser(userId, message) {
  const notification = await Notification.create({ message, user: userId });
  getIO()?.to(`user_${userId}`).emit("notification", toView(notification, userId));
  return toView(notification, userId);
}

async function notifyRole(role, message) {
  const notification = await Notification.create({ message, targetRole: role });
  getIO()?.to(`role_${role}`).emit("notification", toView(notification));
  return toView(notification);
}

// For notifications raised as a side effect of another operation: the write
// that triggered it is already committed, so a failure here must be logged,
// not turned into a 500 for an action that actually succeeded.
async function notifyUserSafely(userId, message) {
  try {
    return await notifyUser(userId, message);
  } catch (err) {
    logger.error("Failed to deliver notification", { userId: String(userId), error: err.message });
    return null;
  }
}

// Admin endpoint: unlike internal callers, the target comes from the request.
async function send({ message, userId, targetRole }) {
  if (targetRole) return notifyRole(targetRole, message);
  if (!(await User.exists({ _id: userId }))) throw new NotFoundError("User not found");
  return notifyUser(userId, message);
}

async function listMine(user, query) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  // Notifications addressed to the user personally, plus broadcasts for their
  // role (from the stored user, see authenticate) — never anyone else's.
  const filter = { $or: [{ user: user.id }, { user: null, targetRole: user.role }] };

  const [items, total] = await Promise.all([
    Notification.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
  ]);
  return { items: items.map((n) => toView(n, user.id)), pagination: buildPagination({ page, limit, total }) };
}

// Each branch is a single conditional update whose filter *is* the
// authorization rule: personal -> recipient only; broadcast -> members of the
// target role, recorded per user.
async function markRead(notificationId, user) {
  const personal = await Notification.findOneAndUpdate(
    { _id: notificationId, user: user.id },
    { read: true },
    { new: true }
  );
  if (personal) return toView(personal, user.id);

  const broadcast = await Notification.findOneAndUpdate(
    { _id: notificationId, user: null, targetRole: user.role },
    { $addToSet: { readBy: user.id } },
    { new: true }
  );
  if (broadcast) return toView(broadcast, user.id);

  if (await Notification.exists({ _id: notificationId })) {
    throw new ForbiddenError("You can only update your own notifications");
  }
  throw new NotFoundError("Notification not found");
}

module.exports = { notifyUser, notifyUserSafely, notifyRole, send, listMine, markRead, SORTABLE };
