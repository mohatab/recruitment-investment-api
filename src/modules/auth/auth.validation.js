const Joi = require("joi");
const ROLES = require("../../common/constants/roles");

// Registering as "admin" through the public endpoint would be a privilege
// escalation — admin accounts are provisioned out-of-band, not self-served.
const PUBLIC_ROLES = [ROLES.CANDIDATE, ROLES.RECRUITER, ROLES.INVESTOR, ROLES.STARTUP];

const register = Joi.object({
  firstName: Joi.string().min(1).max(80).required(),
  lastName: Joi.string().min(1).max(80).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(128).required(),
  role: Joi.string()
    .valid(...PUBLIC_ROLES)
    .default(ROLES.CANDIDATE),
  phone: Joi.string().max(30).allow(""),
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refresh = Joi.object({
  refreshToken: Joi.string().required(),
});

const forgotPassword = Joi.object({
  email: Joi.string().email().required(),
});

const resetPassword = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).max(128).required(),
});

module.exports = { register, login, refresh, forgotPassword, resetPassword };
