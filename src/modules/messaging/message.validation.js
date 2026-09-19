const Joi = require("joi");
const { listQuery } = require("../../common/utils/pagination");

// Shared by POST /api/messages and the chat:message socket event.
const send = Joi.object({
  receiverId: Joi.string().hex().length(24).required(),
  body: Joi.string().trim().min(1).max(5000).required(),
});

// Message history is sortable by time; the conversation list is not (see
// listConversations) so it deliberately declares page/limit only — a query
// parameter the endpoint cannot honour has no business being accepted.
const list = listQuery(["createdAt"]);
const conversationList = listQuery([]).fork(["sort"], (schema) => schema.forbidden());

// `:userId` in the path: rejected as a 400 before it can become part of a
// room id.
const partnerParams = Joi.object({ userId: Joi.string().hex().length(24).required() });

module.exports = { send, list, conversationList, partnerParams };
