const express = require("express");
const controller = require("./notification.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./notification.validation");
const { authenticate, authorize } = require("../../common/middleware/auth");
const ROLES = require("../../common/constants/roles");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the current user's notifications (personal + their role's broadcasts)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", controller.listMine);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a notification as read (owner only)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.patch("/:id/read", controller.markRead);

/**
 * @swagger
 * /api/notifications/broadcast:
 *   post:
 *     tags: [Notifications]
 *     summary: Manually send a notification to a user or role (admin only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [message], properties: { message: { type: string }, userId: { type: string }, targetRole: { type: string } } }
 *     responses:
 *       200: { description: Sent }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/broadcast", authorize(ROLES.ADMIN), validate(schemas.broadcast), controller.broadcast);

module.exports = router;
