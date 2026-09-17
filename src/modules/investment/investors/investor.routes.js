const express = require("express");
const controller = require("./investor.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./investor.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

const router = express.Router();

/**
 * @swagger
 * /api/investors/me:
 *   put:
 *     tags: [Investors]
 *     summary: Create or update the current user's investor profile + investment criteria (investor role only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [investor]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/InvestorInput' } } }
 *     responses:
 *       200: { description: Saved }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.put("/me", authenticate, authorize(ROLES.INVESTOR), validate(schemas.upsert), controller.upsertMine);

/**
 * @swagger
 * /api/investors/me:
 *   get:
 *     tags: [Investors]
 *     summary: Get the current user's own investor profile
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [investor]
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/me", authenticate, authorize(ROLES.INVESTOR), controller.getMine);

/**
 * @swagger
 * /api/investors/{id}:
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
 *       200: { description: OK }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/:id", authenticate, controller.getById);

module.exports = router;
