const Joi = require("joi");
const ROLES = require("../../common/constants/roles");

// Registering as "admin" through the public endpoint would be a privilege
// escalation — admin accounts are provisioned out-of-band, not self-served.
const PUBLIC_ROLES = [ROLES.CANDIDATE, ROLES.RECRUITER, ROLES.INVESTOR, ROLES.STARTUP];

const email = Joi.string().trim().lowercase().email().max(254);

// NIST 800-63B style: length over composition rules. bcrypt silently ignores
// everything past 72 bytes, so longer input is rejected rather than truncated.
const password = Joi.string()
  .min(8)
  .custom((value, helpers) => (Buffer.byteLength(value, "utf8") > 72 ? helpers.error("password.bytes") : value))
  .messages({ "password.bytes": "{{#label}} must be at most 72 bytes" });

// Opaque hex tokens we generated; anything else can't match, so reject early.
const hexToken = (bytes) =>
  Joi.string()
    .hex()
    .length(bytes * 2);

const register = Joi.object({
  firstName: Joi.string().trim().min(1).max(80).required(),
  lastName: Joi.string().trim().min(1).max(80).required(),
  email: email.required(),
  password: password.required(),
  role: Joi.string()
    .valid(...PUBLIC_ROLES)
    .default(ROLES.CANDIDATE),
  phone: Joi.string().max(30).allow(""),
});

const login = Joi.object({
  email: email.required(),
  password: Joi.string().max(1024).required(), // no policy here: existing passwords predate it
});

const refresh = Joi.object({
  refreshToken: hexToken(40).required(),
});

const forgotPassword = Joi.object({
  email: email.required(),
});

const resetPassword = Joi.object({
  token: hexToken(32).required(),
  password: password.required(),
});

const verifyEmail = Joi.object({
  token: hexToken(32).required(),
});

module.exports = { password, register, login, refresh, forgotPassword, resetPassword, verifyEmail };
