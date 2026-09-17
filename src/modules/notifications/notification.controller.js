const notificationService = require("./notification.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { ok, created, paginated } = require("../../common/utils/response");

const listMine = asyncHandler(async (req, res) => {
  const { items, pagination } = await notificationService.listMine(req.user, req.query);
  paginated(res, items, pagination);
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user);
  ok(res, notification, "Notification marked as read");
});

const broadcast = asyncHandler(async (req, res) => {
  created(res, await notificationService.send(req.body), "Notification sent");
});

module.exports = { listMine, markRead, broadcast };
