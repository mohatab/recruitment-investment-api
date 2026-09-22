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
 * /api/v1/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: Search/list jobs that are accepting applications (open and not past their expirationDate); status=closed lists closed postings
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
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
 *     responses:
 *       200: { $ref: '#/components/responses/JobListResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.get("/", validate(schemas.list, "query"), controller.list);

/**
 * @swagger
 * /api/v1/jobs/mine:
 *   get:
 *     tags: [Jobs]
 *     summary: List the current recruiter's own postings, including closed and expired ones (which the public list hides)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [recruiter]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, closed] }
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
 *     responses:
 *       200: { $ref: '#/components/responses/JobListResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/mine", authenticate, authorize(ROLES.RECRUITER), validate(schemas.list, "query"), controller.listMine);

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get a job by id
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/JobResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", controller.getById);

/**
 * @swagger
 * /api/v1/jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Create a job posting (recruiters only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [recruiter]
 *     x-requires-verified-email: true
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/JobInput' } } }
 *     responses:
 *       201: { $ref: '#/components/responses/JobResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
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
 * /api/v1/jobs/{id}:
 *   patch:
 *     tags: [Jobs]
 *     summary: "Update a job posting (owning recruiter only). Partial updates are validated against the merged document: minSalary must stay <= maxSalary, an external applyMethod keeps a link or email, and reopening a closed job requires a future expirationDate (422 JOB_EXPIRED)."
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
 *           schema: { $ref: '#/components/schemas/JobUpdateInput' }
 *     responses:
 *       200: { $ref: '#/components/responses/JobResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/UnprocessableEntity' }
 */
router.patch("/:id", authenticate, authorize(ROLES.RECRUITER), validate(schemas.update), controller.update);

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   delete:
 *     tags: [Jobs]
 *     summary: Delete a job posting (owning recruiter only). A posting that already has applications cannot be deleted (409 JOB_HAS_APPLICATIONS) — close it instead, so candidates keep their application history.
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [recruiter]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { $ref: '#/components/responses/NoContent' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete("/:id", authenticate, authorize(ROLES.RECRUITER), controller.remove);

// /api/v1/jobs/:jobId/applications — mounted here since applications are always
// scoped to a job in the URL; see application.routes.js for the handlers.
router.use("/:jobId/applications", applicationRoutes);

module.exports = router;
