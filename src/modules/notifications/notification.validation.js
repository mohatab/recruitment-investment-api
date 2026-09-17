const Joi = require("joi");
const ROLES = require("../../common/constants/roles");

const broadcast = Joi.object({
  message: Joi.string().trim().min(1).max(1000).required(),
  userId: Joi.string().hex().length(24),
  targetRole: Joi.string().valid(...Object.values(ROLES)),
})
  .xor("userId", "targetRole")
  .messages({ "object.xor": "Provide exactly one of userId or targetRole" });

module.exports = { broadcast };
