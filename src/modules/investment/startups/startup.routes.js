const express = require("express");
const controller = require("./startup.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./startup.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

const router = express.Router();

/**
 * @swagger
 * /api/startups:
 *   get:
 *     tags: [Startups]
 *     summary: List/browse startup fundraising profiles
 *     parameters:
 *       - in: query
 *         name: industry
 *         schema: { type: string }
 *       - in: query
 *         name: stage
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get("/", validate(schemas.list, "query"), controller.list);

/**
 * @swagger
 * /api/startups/success-assessment:
 *   post:
 *     tags: [Startups]
 *     summary: Rule-based (not ML) success-likelihood heuristic — stateless, not persisted
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SuccessAssessmentInput' }
 *     responses:
 *       200: { description: OK }
 */
router.post("/success-assessment", validate(schemas.successAssessment), controller.successAssessment);

/**
 * @swagger
 * /api/startups/matches:
 *   get:
 *     tags: [Startups]
 *     summary: Startups matching the current investor's saved criteria
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       404: { description: Investor criteria not set yet }
 */
router.get("/matches", authenticate, authorize(ROLES.INVESTOR), controller.matches);

/**
 * @swagger
 * /api/startups/me:
 *   put:
 *     tags: [Startups]
 *     summary: Create or update the current user's startup profile (startup role only)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/StartupInput' } } }
 *     responses:
 *       200: { description: Saved }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.put("/me", authenticate, authorize(ROLES.STARTUP), validate(schemas.upsert), controller.upsertMine);

/**
 * @swagger
 * /api/startups/me:
 *   get:
 *     tags: [Startups]
 *     summary: Get the current user's own startup profile
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/me", authenticate, authorize(ROLES.STARTUP), controller.getMine);

/**
 * @swagger
 * /api/startups/{id}:
 *   get:
 *     tags: [Startups]
 *     summary: Get a startup profile by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", controller.getById);

module.exports = router;
