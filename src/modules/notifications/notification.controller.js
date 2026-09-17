const notificationService = require("./notification.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { ok, paginated } = require("../../common/utils/response");

const listMine = asyncHandler(async (req, res) => {
  const { items, meta } = await notificationService.listMine(req.user.id, req.user.role, req.query);
  paginated(res, items, meta);
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user.id);
  ok(res, notification, "Notification marked as read");
});

const broadcast = asyncHandler(async (req, res) => {
  const { message, targetRole } = req.body;
  const notification = targetRole
    ? await notificationService.notifyRole(targetRole, message)
    : await notificationService.notifyUser(req.body.userId, message);
  ok(res, notification, "Notification sent");
});

module.exports = { listMine, markRead, broadcast };
