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
 * /api/v1/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the current user's notifications (personal + their role's broadcasts)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *     responses:
 *       200: { $ref: '#/components/responses/NotificationListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", validate(schemas.list, "query"), controller.listMine);

/**
 * @swagger
 * /api/v1/notifications/{id}/read:
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
 *       200: { $ref: '#/components/responses/NotificationResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch("/:id/read", controller.markRead);

/**
 * @swagger
 * /api/v1/notifications/broadcast:
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
 *       201: { $ref: '#/components/responses/NotificationResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post("/broadcast", authorize(ROLES.ADMIN), validate(schemas.broadcast), controller.broadcast);

module.exports = router;
