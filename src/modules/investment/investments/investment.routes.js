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
 * /api/v1/investments:
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
 *       201: { $ref: '#/components/responses/InvestmentCreatedResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/UnprocessableEntity' }
 */
router.post("/", authorize(ROLES.INVESTOR), requireVerifiedEmail, validate(schemas.create), controller.create);

/**
 * @swagger
 * /api/v1/investments/mine:
 *   get:
 *     tags: [Investments]
 *     summary: List the current investor's own investments
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *     x-required-roles: [investor]
 *     responses:
 *       200: { $ref: '#/components/responses/InvestmentListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/mine", authorize(ROLES.INVESTOR), validate(schemas.list, "query"), controller.listMine);

/**
 * @swagger
 * /api/v1/investments/startup:
 *   get:
 *     tags: [Investments]
 *     summary: List investments received by the current user's startup
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *     x-required-roles: [startup]
 *     responses:
 *       200: { $ref: '#/components/responses/InvestmentListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/startup", authorize(ROLES.STARTUP), validate(schemas.list, "query"), controller.listForMyStartup);

/**
 * @swagger
 * /api/v1/investments/{id}/refund:
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
 *       200: { $ref: '#/components/responses/InvestmentResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/UnprocessableEntity' }
 */
router.post("/:id/refund", authorize(ROLES.ADMIN), controller.refund);

module.exports = router;
