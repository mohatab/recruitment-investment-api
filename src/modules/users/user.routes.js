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
 * /api/v1/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the current authenticated user's profile
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { $ref: '#/components/responses/UserResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/me", controller.getMe);

/**
 * @swagger
 * /api/v1/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update the current user's profile
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/UpdateProfileInput' } } }
 *     responses:
 *       200: { $ref: '#/components/responses/UserResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.patch("/me", validate(schemas.updateProfile), controller.updateMe);

/**
 * @swagger
 * /api/v1/users/me/password:
 *   post:
 *     tags: [Users]
 *     summary: Change the current user's password. Revokes every existing session (access and refresh tokens, open sockets); the returned pair replaces the caller's tokens. A wrong current password is a 401.
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [currentPassword, newPassword], properties: { currentPassword: { type: string }, newPassword: { type: string, minLength: 8, description: "8+ characters, at most 72 bytes, must differ from currentPassword" } } }
 *     responses:
 *       200: { $ref: '#/components/responses/TokenPairResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/me/password", validate(schemas.changePassword), controller.changePassword);

/**
 * @swagger
 * /api/v1/users/me/cv:
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
 *       200: { $ref: '#/components/responses/UserResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       413: { $ref: '#/components/responses/PayloadTooLarge' }
 */
router.post("/me/cv", uploadCv.single("cv"), controller.uploadCv);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     tags: [Users]
 *     summary: List users (admin only)
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [admin]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Sort'
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
 *       200: { $ref: '#/components/responses/UserListResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/", authorize(ROLES.ADMIN), validate(schemas.list, "query"), controller.list);

/**
 * @swagger
 * /api/v1/users/{id}:
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
 *       200: { $ref: '#/components/responses/PublicUserProfileResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", controller.getById);

/**
 * @swagger
 * /api/v1/users/{id}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Activate or deactivate an account (admin only). Deactivation revokes all of the user's sessions immediately and blocks login.
 *     security: [{ BearerAuth: [] }]
 *     x-required-roles: [admin]
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
 *       200: { $ref: '#/components/responses/UserResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/UnprocessableEntity' }
 */
router.patch("/:id/status", authorize(ROLES.ADMIN), validate(schemas.setStatus), controller.setStatus);

module.exports = router;
