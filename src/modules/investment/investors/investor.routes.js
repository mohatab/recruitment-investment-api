const express = require("express");
const controller = require("./investor.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./investor.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

const router = express.Router();

/**
 * @swagger
 * /api/v1/investors/me:
 *   put:
 *     tags: [Investors]
 *     summary: Create or update the current user's investor profile + investment criteria (investor role only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [investor]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/InvestorInput' } } }
 *     responses:
 *       200: { $ref: '#/components/responses/InvestorResponse' }
 *       201: { $ref: '#/components/responses/InvestorResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.put("/me", authenticate, authorize(ROLES.INVESTOR), validate(schemas.upsert), controller.upsertMine);

/**
 * @swagger
 * /api/v1/investors/me:
 *   get:
 *     tags: [Investors]
 *     summary: Get the current user's own investor profile
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [investor]
 *     responses:
 *       200: { $ref: '#/components/responses/InvestorResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/me", authenticate, authorize(ROLES.INVESTOR), controller.getMine);

/**
 * @swagger
 * /api/v1/investors/{id}:
 *   get:
 *     tags: [Investors]
 *     summary: Get an investor's public profile by id
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/PublicInvestorProfileResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", authenticate, controller.getById);

module.exports = router;
