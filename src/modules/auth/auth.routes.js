const express = require("express");
const controller = require("./auth.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./auth.validation");
const { authLimiter } = require("../../common/middleware/rateLimiter");
const { authenticate } = require("../../common/middleware/auth");

const router = express.Router();
router.use(authLimiter);

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account (sends an email-verification link)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterInput' }
 *     responses:
 *       201: { $ref: '#/components/responses/AuthSessionResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/register", validate(schemas.register), controller.register);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginInput' }
 *     responses:
 *       200: { $ref: '#/components/responses/AuthSessionResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/login", validate(schemas.login), controller.login);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new pair. The presented token is consumed; presenting an already-rotated token revokes every session of the user (reuse detection).
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [refreshToken], properties: { refreshToken: { type: string } } }
 *     responses:
 *       200: { $ref: '#/components/responses/TokenPairResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/refresh", validate(schemas.refresh), controller.refresh);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke one refresh token (this device). Outstanding access tokens expire on their own (15 min by default).
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [refreshToken], properties: { refreshToken: { type: string } } }
 *     responses:
 *       200: { $ref: '#/components/responses/EmptyResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/logout", validate(schemas.refresh), controller.logout);

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke every session of the current user (all access and refresh tokens, open sockets)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { $ref: '#/components/responses/EmptyResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/logout-all", authenticate, controller.logoutAll);

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password-reset email. Always 200 with the same body; the lookup and email happen after the response, so timing doesn't reveal whether the email is registered. At most one email per account per minute.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [email], properties: { email: { type: string, format: email } } }
 *     responses:
 *       200: { $ref: '#/components/responses/EmptyResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/forgot-password", validate(schemas.forgotPassword), controller.forgotPassword);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password with the single-use token from the reset email (link format `${APP_URL}/reset-password#token=...`, valid 1 hour). Revokes all existing sessions.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token, password], properties: { token: { type: string }, password: { type: string, minLength: 8 } } }
 *     responses:
 *       200: { $ref: '#/components/responses/EmptyResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/reset-password", validate(schemas.resetPassword), controller.resetPassword);

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Confirm an email address with the single-use token from the verification email (link format `${APP_URL}/verify-email#token=...`, valid 24 hours)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token], properties: { token: { type: string } } }
 *     responses:
 *       200: { $ref: '#/components/responses/EmptyResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/verify-email", validate(schemas.verifyEmail), controller.verifyEmail);

/**
 * @swagger
 * /api/v1/auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Send a new verification link (no-op if already verified; at most one per minute; supersedes earlier links)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { $ref: '#/components/responses/EmptyResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/resend-verification", authenticate, controller.resendVerification);

module.exports = router;
