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
 *     summary: "List the current user's notifications: those addressed to them personally plus the broadcasts for their role. Never anyone else's."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *       - in: query
 *         name: read
 *         required: false
 *         schema: { type: boolean }
 *         description: "Filter by this user's own read state. For a role broadcast that means their own receipt, not anyone else's."
 *     responses:
 *       200: { $ref: '#/components/responses/NotificationListResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", validate(schemas.list, "query"), controller.listMine);

/**
 * @swagger
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: "Mark a notification as read. Personal notifications: the recipient only. Role broadcasts: any member of the target role, recorded per user, so one reader never marks it read for the others. Idempotent."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/NotificationResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
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
 *     summary: "Send a notification to one user or to a whole role (admin only). Exactly one of userId or targetRole; a direct recipient must be an existing, active account."
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [message], properties: { message: { type: string }, userId: { type: string }, targetRole: { type: string } } }
 *     responses:
 *       201: { $ref: '#/components/responses/NotificationResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post("/broadcast", authorize(ROLES.ADMIN), validate(schemas.broadcast), controller.broadcast);

module.exports = router;
