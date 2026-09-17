const express = require("express");
const controller = require("./user.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./user.validation");
const { authenticate, authorize } = require("../../common/middleware/auth");
const { uploadCv } = require("../../common/middleware/upload");
const ROLES = require("../../common/constants/roles");

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the current authenticated user's profile
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/me", controller.getMe);

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update the current user's profile
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/UpdateProfileInput' } } }
 *     responses:
 *       200: { description: Updated }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.patch("/me", validate(schemas.updateProfile), controller.updateMe);

/**
 * @swagger
 * /api/users/me/password:
 *   post:
 *     tags: [Users]
 *     summary: Change the current user's password
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [currentPassword, newPassword], properties: { currentPassword: { type: string }, newPassword: { type: string, minLength: 8, description: "8+ characters, at most 72 bytes, must differ from currentPassword" } } }
 *     responses:
 *       200:
 *         description: Password changed. Every existing session (all access and refresh tokens, open sockets) is revoked; the returned pair replaces the caller's tokens.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/TokenPairResponse' } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { description: Current password incorrect }
 */
router.post("/me/password", validate(schemas.changePassword), controller.changePassword);

/**
 * @swagger
 * /api/users/me/cv:
 *   post:
 *     tags: [Users]
 *     summary: Upload/replace the current user's CV (PDF/DOC/DOCX, max 5MB)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { cv: { type: string, format: binary } } }
 *     responses:
 *       200: { description: CV uploaded }
 *       400: { description: Invalid file type/size }
 */
router.post("/me/cv", uploadCv.single("cv"), controller.uploadCv);

/**
 * @swagger
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users (admin only)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [candidate, recruiter, investor, startup, admin] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/", authorize(ROLES.ADMIN), controller.list);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get another user's limited public profile (name, role — not phone/birthdate/location; use /me for your own full profile)
 *     security: [{ BearerAuth: [] }]
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
 * /api/users/{id}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Activate or deactivate an account (admin only). Deactivation revokes all of the user's sessions immediately and blocks login.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [isActive], properties: { isActive: { type: boolean } } }
 *     responses:
 *       200: { description: Status updated }
 *       400: { description: Validation error, or an admin targeting their own account }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch("/:id/status", authorize(ROLES.ADMIN), validate(schemas.setStatus), controller.setStatus);

module.exports = router;
