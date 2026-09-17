const express = require("express");
const controller = require("./contact.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./contact.validation");
const { uploadImage } = require("../../common/middleware/upload");

const router = express.Router();

/**
 * @swagger
 * /api/contact:
 *   post:
 *     tags: [Contact]
 *     summary: Submit the public contact form (optionally with a profile image)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, phoneNumber]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               phoneNumber: { type: string }
 *               country: { type: string }
 *               city: { type: string }
 *               profileImage: { type: string, format: binary }
 *     responses:
 *       201: { description: Submitted }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.post("/", uploadImage.single("profileImage"), validate(schemas.create), controller.create);

module.exports = router;
