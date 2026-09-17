const express = require("express");
const controller = require("./job.controller");
const validate = require("../../../common/middleware/validate");
const schemas = require("./job.validation");
const { authenticate, authorize, requireVerifiedEmail } = require("../../../common/middleware/auth");
const ROLES = require("../../../common/constants/roles");
const applicationRoutes = require("../applications/application.routes");

const router = express.Router();

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: Search/list open jobs
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *       - in: query
 *         name: minSalary
 *         schema: { type: number }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, closed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 */
router.get("/", validate(schemas.list, "query"), controller.list);

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get a job by id
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

/**
 * @swagger
 * /api/jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Create a job posting (recruiters only)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/JobInput' } } }
 *     responses:
 *       201: { description: Created }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { description: "FORBIDDEN (not a recruiter) or EMAIL_NOT_VERIFIED" }
 */
router.post(
  "/",
  authenticate,
  authorize(ROLES.RECRUITER),
  requireVerifiedEmail,
  validate(schemas.create),
  controller.create
);

/**
 * @swagger
 * /api/jobs/{id}:
 *   patch:
 *     tags: [Jobs]
 *     summary: Update a job posting (owning recruiter only)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch("/:id", authenticate, authorize(ROLES.RECRUITER), validate(schemas.update), controller.update);

/**
 * @swagger
 * /api/jobs/{id}:
 *   delete:
 *     tags: [Jobs]
 *     summary: Delete a job posting (owning recruiter only)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.delete("/:id", authenticate, authorize(ROLES.RECRUITER), controller.remove);

// /api/jobs/:jobId/applications — mounted here since applications are always
// scoped to a job in the URL; see application.routes.js for the handlers.
router.use("/:jobId/applications", applicationRoutes);

module.exports = router;
