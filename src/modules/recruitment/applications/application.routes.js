const express = require("express");
const controller = require("./application.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./application.validation");
const { authenticate, authorize } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");

// mergeParams: this router is mounted at /api/jobs/:jobId/applications, and
// handlers need req.params.jobId from the parent route.
const router = express.Router({ mergeParams: true });
router.use(authenticate);

/**
 * @swagger
 * /api/jobs/{jobId}/applications:
 *   post:
 *     tags: [Applications]
 *     summary: Apply to a job (candidates only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [candidate]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [coverLetter], properties: { coverLetter: { type: string, minLength: 10 }, resumeUrl: { type: string } } }
 *     responses:
 *       201: { description: Submitted }
 *       409: { description: Already applied to this job }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post("/", authorize(ROLES.CANDIDATE), validate(schemas.create), controller.apply);

/**
 * @swagger
 * /api/jobs/{jobId}/applications:
 *   get:
 *     tags: [Applications]
 *     summary: List applications for a job (the owning recruiter only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [recruiter]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", authorize(ROLES.RECRUITER), controller.listForJob);

module.exports = router;
