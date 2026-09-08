const Joi = require("joi");

const create = Joi.object({
  jobTitle: Joi.string().required(),
  companyName: Joi.string().required(),
  jobCategory: Joi.string().allow(""),
  experienceType: Joi.string().allow(""),
  startDate: Joi.date().iso().required(),
  currentlyWorking: Joi.boolean().default(false),
  endDate: Joi.date().iso().when("currentlyWorking", { is: false, then: Joi.required() }),
});

module.exports = { create };
