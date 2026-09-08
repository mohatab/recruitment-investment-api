const messageService = require("./message.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { ok, created } = require("../../common/utils/response");

const send = asyncHandler(async (req, res) => {
  const message = await messageService.send(req.user.id, req.body.receiverId, req.body.body);
  created(res, message, "Message sent");
});

const listConversations = asyncHandler(async (req, res) => {
  ok(res, await messageService.listConversations(req.user.id));
});

const listWith = asyncHandler(async (req, res) => {
  ok(res, await messageService.listWith(req.user.id, req.params.userId));
});

module.exports = { send, listConversations, listWith };
