const Joi = require("joi");

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

const list = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sort: Joi.string(),
  search: Joi.string().allow(""),
  role: Joi.string(),
  location: Joi.string(),
  minSalary: Joi.number(),
  status: Joi.string().valid("open", "closed"),
});

module.exports = { create, update, list };
