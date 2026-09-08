const Joi = require("joi");

const create = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email().required(),
  phoneNumber: Joi.string().required(),
  country: Joi.string().allow(""),
  city: Joi.string().allow(""),
});

module.exports = { create };
