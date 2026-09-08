const Joi = require("joi");

const create = Joi.object({
  startupId: Joi.string().required(),
  amount: Joi.number().min(1).required(),
});

module.exports = { create };
