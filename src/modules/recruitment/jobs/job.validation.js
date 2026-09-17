const Joi = require("joi");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./job.service");

const create = Joi.object({
  title: Joi.string().required(),
  role: Joi.string().required(),
  description: Joi.string().required(),
  responsibilities: Joi.string().required(),
  minSalary: Joi.number().min(0).required(),
  maxSalary: Joi.number().min(Joi.ref("minSalary")).required(),
  salaryType: Joi.string().valid("hourly", "monthly", "yearly").required(),
  applyMethod: Joi.string().valid("platform", "external").default("platform"),
  applyLink: Joi.string().uri().allow(""),
  applyEmail: Joi.string().email().allow(""),
  tags: Joi.array().items(Joi.string()).default([]),
  vacancies: Joi.number().integer().min(1).default(1),
  location: Joi.string().allow(""),
  expirationDate: Joi.date().iso().greater("now").required(),
});

const update = create
  .fork(Object.keys(create.describe().keys), (s) => s.optional())
  .append({
    status: Joi.string().valid("open", "closed"),
  });

const list = listQuery(SORTABLE, {
  search: Joi.string().max(200).allow(""),
  role: Joi.string().max(120),
  location: Joi.string().max(120),
  minSalary: Joi.number().min(0),
  status: Joi.string().valid("open", "closed"),
});

module.exports = { create, update, list };
