const express = require("express");
const controller = require("./startup.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./startup.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

const router = express.Router();

/**
 * @swagger
 * /api/v1/startups:
 *   get:
 *     tags: [Startups]
 *     summary: List/browse startup fundraising profiles
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *       - in: query
 *         name: industry
 *         schema: { type: string }
 *       - in: query
 *         name: stage
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/StartupListResponse' }
 */
router.get("/", validate(schemas.list, "query"), controller.list);

/**
 * @swagger
 * /api/v1/startups/success-assessment:
 *   post:
 *     tags: [Startups]
 *     summary: Rule-based (not ML) success-likelihood heuristic — stateless, not persisted
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SuccessAssessmentInput' }
 *     responses:
 *       200: { $ref: '#/components/responses/SuccessAssessmentResponse' }
 */
router.post("/success-assessment", validate(schemas.successAssessment), controller.successAssessment);

/**
 * @swagger
 * /api/v1/startups/matches:
 *   get:
 *     tags: [Startups]
 *     summary: Startups matching the current investor's saved criteria
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *     x-required-roles: [investor]
 *     responses:
 *       200: { $ref: '#/components/responses/StartupListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/matches", authenticate, authorize(ROLES.INVESTOR), validate(schemas.matches, "query"), controller.matches);

/**
 * @swagger
 * /api/v1/startups/me:
 *   put:
 *     tags: [Startups]
 *     summary: Create or update the current user's startup profile (startup role only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [startup]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/StartupInput' } } }
 *     responses:
 *       200: { $ref: '#/components/responses/StartupResponse' }
 *       201: { $ref: '#/components/responses/StartupResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.put("/me", authenticate, authorize(ROLES.STARTUP), validate(schemas.upsert), controller.upsertMine);

/**
 * @swagger
 * /api/v1/startups/me:
 *   get:
 *     tags: [Startups]
 *     summary: Get the current user's own startup profile
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [startup]
 *     responses:
 *       200: { $ref: '#/components/responses/StartupResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/me", authenticate, authorize(ROLES.STARTUP), controller.getMine);

/**
 * @swagger
 * /api/v1/startups/{id}:
 *   get:
 *     tags: [Startups]
 *     summary: Get a startup profile by id
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/StartupResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", controller.getById);

module.exports = router;
