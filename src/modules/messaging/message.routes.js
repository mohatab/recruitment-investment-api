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
 *     summary: Send a direct message
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [receiverId, body], properties: { receiverId: { type: string }, body: { type: string } } }
 *     responses:
 *       201: { $ref: '#/components/responses/MessageResponse' }
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
 *     summary: List the current user's conversations
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *     responses:
 *       200: { $ref: '#/components/responses/ConversationListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/conversations", validate(schemas.list, "query"), controller.listConversations);

/**
 * @swagger
 * /api/v1/messages/{userId}:
 *   get:
 *     tags: [Messaging]
 *     summary: Get the message history with a specific user (only conversations you're actually part of)
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
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/:userId", validate(schemas.list, "query"), controller.listWith);

module.exports = router;
