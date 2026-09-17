const messageService = require("./message.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { created, paginated } = require("../../common/utils/response");

const send = asyncHandler(async (req, res) => {
  const message = await messageService.send(req.user.id, req.body.receiverId, req.body.body);
  created(res, message, "Message sent");
});

const listConversations = asyncHandler(async (req, res) => {
  const { items, pagination } = await messageService.listConversations(req.user.id, req.query);
  paginated(res, items, pagination);
});

const listWith = asyncHandler(async (req, res) => {
  const { items, pagination } = await messageService.listWith(req.user.id, req.params.userId, req.query);
  paginated(res, items, pagination);
});

module.exports = { send, listConversations, listWith };
