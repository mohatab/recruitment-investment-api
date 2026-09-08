const express = require("express");
const controller = require("./message.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./message.validation");
const { authenticate } = require("../../common/middleware/auth");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/messages:
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
 *       201: { description: Sent }
 */
router.post("/", validate(schemas.send), controller.send);

/**
 * @swagger
 * /api/messages/conversations:
 *   get:
 *     tags: [Messaging]
 *     summary: List the current user's conversations
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get("/conversations", controller.listConversations);

/**
 * @swagger
 * /api/messages/{userId}:
 *   get:
 *     tags: [Messaging]
 *     summary: Get the message history with a specific user (only conversations you're actually part of)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get("/:userId", controller.listWith);

module.exports = router;
