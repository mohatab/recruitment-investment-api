const express = require("express");
const controller = require("./message.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./message.validation");
const { authenticate } = require("../../common/middleware/auth");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/v1/messages:
 *   post:
 *     tags: [Messaging]
 *     summary: "Send a direct message. The sender is always the authenticated user; the recipient must be a different, active account. The message is persisted first, then delivered to the recipient's socket room."
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [receiverId, body], properties: { receiverId: { type: string }, body: { type: string } } }
 *     responses:
 *       201: { $ref: '#/components/responses/MessageResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/UnprocessableEntity' }
 */
router.post("/", validate(schemas.send), controller.send);

/**
 * @swagger
 * /api/v1/messages/conversations:
 *   get:
 *     tags: [Messaging]
 *     summary: "List the current user's conversations, most recent activity first. One entry per partner, with their last message and whether they are currently online; ordering is fixed, so this endpoint takes no sort parameter."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200: { $ref: '#/components/responses/ConversationListResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/conversations", validate(schemas.conversationList, "query"), controller.listConversations);

/**
 * @swagger
 * /api/v1/messages/{userId}:
 *   get:
 *     tags: [Messaging]
 *     summary: "Get the message history with a specific user. The conversation is identified by the caller plus this user id, so a caller can only ever read a conversation they are part of. Oldest first by default; ordering is total (createdAt, then id)."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/MessageListResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/:userId", validate(schemas.partnerParams, "params"), validate(schemas.list, "query"), controller.listWith);

module.exports = router;
