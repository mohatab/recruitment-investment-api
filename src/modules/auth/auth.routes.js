const express = require("express");
const controller = require("./auth.controller");
const validate = require("../../common/middleware/validate");
const schemas = require("./auth.validation");
const { authLimiter } = require("../../common/middleware/rateLimiter");

const router = express.Router();
router.use(authLimiter);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterInput' }
 *     responses:
 *       201: { description: Registered, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: Email already registered }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/register", validate(schemas.register), controller.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginInput' }
 *     responses:
 *       200: { description: Logged in, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
 *       401: { description: Invalid credentials }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/login", validate(schemas.login), controller.login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new access/refresh token pair (rotates the refresh token)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [refreshToken], properties: { refreshToken: { type: string } } }
 *     responses:
 *       200: { description: New token pair issued }
 *       401: { description: Invalid or expired refresh token }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/refresh", validate(schemas.refresh), controller.refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke a refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [refreshToken], properties: { refreshToken: { type: string } } }
 *     responses:
 *       200: { description: Logged out }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/logout", validate(schemas.refresh), controller.logout);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email (always returns 200, regardless of whether the email is registered)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [email], properties: { email: { type: string, format: email } } }
 *     responses:
 *       200: { description: Reset email sent if the account exists }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/forgot-password", validate(schemas.forgotPassword), controller.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset a password using the token emailed by forgot-password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token, password], properties: { token: { type: string }, password: { type: string, minLength: 6 } } }
 *     responses:
 *       200: { description: Password reset }
 *       401: { description: Invalid or expired token }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/reset-password", validate(schemas.resetPassword), controller.resetPassword);

module.exports = router;
