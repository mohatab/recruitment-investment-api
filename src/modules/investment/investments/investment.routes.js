const express = require("express");
const controller = require("./investment.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./investment.validation");
const { authenticate, authorize, requireVerifiedEmail } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/investments:
 *   post:
 *     tags: [Investments]
 *     summary: Start an investment (creates a Stripe PaymentIntent; confirm client-side with the returned clientSecret)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [investor]
 *     x-requires-verified-email: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [startupId, amount], properties: { startupId: { type: string }, amount: { type: number } } }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Amount below the startup's minimum investment }
 *       403: { description: "FORBIDDEN (not an investor) or EMAIL_NOT_VERIFIED" }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/", authorize(ROLES.INVESTOR), requireVerifiedEmail, validate(schemas.create), controller.create);

/**
 * @swagger
 * /api/investments/mine:
 *   get:
 *     tags: [Investments]
 *     summary: List the current investor's own investments
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [investor]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/mine", authorize(ROLES.INVESTOR), controller.listMine);

/**
 * @swagger
 * /api/investments/startup:
 *   get:
 *     tags: [Investments]
 *     summary: List investments received by the current user's startup
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [startup]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/startup", authorize(ROLES.STARTUP), controller.listForMyStartup);

/**
 * @swagger
 * /api/investments/{id}/refund:
 *   post:
 *     tags: [Investments]
 *     summary: Refund a paid investment (admin only — investors cannot reclaim money already credited to a startup)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Refunded }
 *       400: { description: Only a paid investment can be refunded }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post("/:id/refund", authorize(ROLES.ADMIN), controller.refund);

module.exports = router;
