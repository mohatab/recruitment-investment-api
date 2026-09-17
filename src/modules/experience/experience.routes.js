const express = require("express");
const controller = require("./experience.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./experience.validation");
const { authenticate } = require("../../common/middleware/auth");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/experiences:
 *   post:
 *     tags: [Experience]
 *     summary: Add a work-experience entry to the current user's profile
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ExperienceInput' } } }
 *     responses:
 *       201: { description: Created }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/", validate(schemas.create), controller.create);

/**
 * @swagger
 * /api/experiences:
 *   get:
 *     tags: [Experience]
 *     summary: List the current user's work experience
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", controller.listMine);

/**
 * @swagger
 * /api/experiences/{id}:
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
 *       200: { description: Deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.delete("/:id", controller.remove);

module.exports = router;
