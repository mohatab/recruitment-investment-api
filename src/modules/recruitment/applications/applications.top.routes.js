const express = require("express");
const controller = require("./application.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./application.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

// Mounted at /api/v1/applications — the handful of application operations that
// aren't scoped to a specific job in the URL.
const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/v1/applications/mine:
 *   get:
 *     tags: [Applications]
 *     summary: List the current candidate's own applications
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     x-required-roles: [candidate]
 *     responses:
 *       200: { $ref: '#/components/responses/ApplicationListResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/mine", authorize(ROLES.CANDIDATE), validate(schemas.list, "query"), controller.listMine);

/**
 * @swagger
 * /api/v1/applications/{id}/status:
 *   patch:
 *     tags: [Applications]
 *     summary: Move an application to the next status in its lifecycle (owning recruiter only). Illegal transitions are 422 INVALID_STATUS_TRANSITION; if someone else moved it first the update is refused with 409 APPLICATION_STATUS_CONFLICT rather than overwriting.
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
 *       200: { $ref: '#/components/responses/ApplicationResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/UnprocessableEntity' }
 */
router.patch("/:id/status", authorize(ROLES.RECRUITER), validate(schemas.updateStatus), controller.updateStatus);

module.exports = router;
