const express = require("express");
const controller = require("./experience.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./experience.validation");
const { authenticate } = require("../../common/middleware/auth");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/v1/experiences:
 *   post:
 *     tags: [Experience]
 *     summary: Add a work-experience entry to the current user's profile
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ExperienceInput' } } }
 *     responses:
 *       201: { $ref: '#/components/responses/ExperienceResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/", validate(schemas.create), controller.create);

/**
 * @swagger
 * /api/v1/experiences:
 *   get:
 *     tags: [Experience]
 *     summary: List the current user's work experience
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *     responses:
 *       200: { $ref: '#/components/responses/ExperienceListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", validate(schemas.list, "query"), controller.listMine);

/**
 * @swagger
 * /api/v1/experiences/{id}:
 *   delete:
 *     tags: [Experience]
 *     summary: Delete one of the current user's experience entries
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { $ref: '#/components/responses/NoContent' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete("/:id", controller.remove);

module.exports = router;
