const express = require("express");
const controller = require("./contact.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./contact.validation");
const { uploadImage } = require("../../common/middleware/upload");
const { authenticate, authorize } = require("../../common/middleware/auth");
const ROLES = require("../../common/constants/roles");

const router = express.Router();

/**
 * @swagger
 * /api/v1/contact:
 *   post:
 *     tags: [Contact]
 *     summary: "Submit the public contact form, optionally with a photo (JPEG/PNG/WEBP, 5MB max, contents verified against the declared type). The photo is stored privately and is readable only by an admin."
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
 *       201: { $ref: '#/components/responses/ContactResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       413: { $ref: '#/components/responses/PayloadTooLarge' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/", uploadImage.single("profileImage"), validate(schemas.create), controller.create);

/**
 * @swagger
 * /api/v1/contact:
 *   get:
 *     tags: [Contact]
 *     summary: List contact-form submissions (admin only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [admin]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
 *     responses:
 *       200: { $ref: '#/components/responses/ContactListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/", authenticate, authorize(ROLES.ADMIN), validate(schemas.list, "query"), controller.list);

/**
 * @swagger
 * /api/v1/contact/{id}/image:
 *   get:
 *     tags: [Contact]
 *     summary: Download the photo attached to a submission (admin only), as an attachment
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The stored image, served as an attachment (never inline)
 *         content:
 *           image/jpeg: { schema: { type: string, format: binary } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id/image", authenticate, authorize(ROLES.ADMIN), controller.downloadImage);

module.exports = router;
