const express = require("express");
const controller = require("./investment.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./investment.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [startupId, amount], properties: { startupId: { type: string }, amount: { type: number } } }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Amount below the startup's minimum investment }
 */
router.post("/", authorize(ROLES.INVESTOR), validate(schemas.create), controller.create);

/**
 * @swagger
 * /api/investments/mine:
 *   get:
 *     tags: [Investments]
 *     summary: List the current investor's own investments
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get("/mine", authorize(ROLES.INVESTOR), controller.listMine);

/**
 * @swagger
 * /api/investments/startup:
 *   get:
 *     tags: [Investments]
 *     summary: List investments received by the current user's startup
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get("/startup", authorize(ROLES.STARTUP), controller.listForMyStartup);

/**
 * @swagger
 * /api/investments/{id}/refund:
 *   post:
 *     tags: [Investments]
 *     summary: Refund a paid investment (the investor who made it, or an admin)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Refunded }
 *       400: { description: Only a paid investment can be refunded }
 */
router.post("/:id/refund", controller.refund);

module.exports = router;
