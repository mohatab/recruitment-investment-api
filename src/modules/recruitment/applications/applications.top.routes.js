const express = require("express");
const controller = require("./application.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./application.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

// Mounted at /api/applications — the handful of application operations that
// aren't scoped to a specific job in the URL.
const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/applications/mine:
 *   get:
 *     tags: [Applications]
 *     summary: List the current candidate's own applications
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [candidate]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/mine", authorize(ROLES.CANDIDATE), controller.listMine);

/**
 * @swagger
 * /api/applications/{id}/status:
 *   patch:
 *     tags: [Applications]
 *     summary: Move an application to the next status in its lifecycle (owning recruiter only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [recruiter]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [status], properties: { status: { type: string, enum: [under_review, shortlisted, interview, accepted, rejected] } } }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Invalid status transition }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.patch("/:id/status", authorize(ROLES.RECRUITER), validate(schemas.updateStatus), controller.updateStatus);

module.exports = router;
