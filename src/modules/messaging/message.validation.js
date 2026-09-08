const Joi = require("joi");

const send = Joi.object({
  receiverId: Joi.string().required(),
  body: Joi.string().min(1).required(),
});

module.exports = { send };
