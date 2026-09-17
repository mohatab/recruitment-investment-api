const Joi = require("joi");
const { listQuery } = require("../../common/utils/pagination");
const { SORTABLE } = require("./experience.service");

const create = Joi.object({
  jobTitle: Joi.string().required(),
  companyName: Joi.string().required(),
  jobCategory: Joi.string().allow(""),
  experienceType: Joi.string().allow(""),
  startDate: Joi.date().iso().required(),
  currentlyWorking: Joi.boolean().default(false),
  endDate: Joi.date().iso().when("currentlyWorking", { is: false, then: Joi.required() }),
});

const list = listQuery(SORTABLE);

module.exports = { create, list };
