const Joi = require("joi");
const { listQuery } = require("../../common/utils/pagination");

// Shared by POST /api/messages and the chat:message socket event.
const send = Joi.object({
  receiverId: Joi.string().hex().length(24).required(),
  body: Joi.string().trim().min(1).max(5000).required(),
});

const list = listQuery(["createdAt"]);

module.exports = { send, list };
