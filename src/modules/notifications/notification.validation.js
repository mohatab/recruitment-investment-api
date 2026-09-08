const Joi = require("joi");
const ROLES = require("../../common/constants/roles");

const broadcast = Joi.object({
  message: Joi.string().min(1).required(),
  userId: Joi.string(),
  targetRole: Joi.string().valid(...Object.values(ROLES)),
})
  .xor("userId", "targetRole")
  .messages({ "object.xor": "Provide exactly one of userId or targetRole" });

module.exports = { broadcast };
