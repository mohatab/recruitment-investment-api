const Joi = require("joi");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./job.service");
const { STATUSES, SALARY_TYPES, APPLY_METHODS, MAX_TAGS } = require("./job.model");

// One field table, two schemas: create requires the core fields, update makes
// everything optional. `maxSalary` deliberately carries no Joi reference to
// `minSalary` — on a partial update the sibling isn't in the payload, which
// used to reject every "raise the ceiling" PATCH. The service validates the
// merged values instead (job.service.assertSalaryRange).
const fields = {
  title: Joi.string().trim().min(3).max(200),
  role: Joi.string().trim().min(2).max(120),
  description: Joi.string().trim().min(10).max(10000),
  responsibilities: Joi.string().trim().min(10).max(10000),
  minSalary: Joi.number().min(0),
  maxSalary: Joi.number().min(0),
  salaryType: Joi.string().valid(...SALARY_TYPES),
  applyMethod: Joi.string().valid(...APPLY_METHODS),
  applyLink: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .allow(""),
  applyEmail: Joi.string().email().allow(""),
  tags: Joi.array().items(Joi.string().trim().max(40)).max(MAX_TAGS),
  vacancies: Joi.number().integer().min(1).max(1000),
  location: Joi.string().trim().max(120).allow(""),
  expirationDate: Joi.date().iso().greater("now"),
};

const REQUIRED = ["title", "role", "description", "responsibilities", "minSalary", "salaryType", "expirationDate"];

// An "external" posting is useless without somewhere to send candidates, so in
// that case one of the two must be present *and* non-empty (the branch drops
// the `allow("")` the base fields carry).
// `required()`: without it an absent applyMethod would also match the condition.
const IS_EXTERNAL = Joi.object({ applyMethod: Joi.string().valid("external").required() }).unknown();
const externalApplyRule = (schema) =>
  schema.when(IS_EXTERNAL, {
    then: Joi.object({
      applyLink: Joi.string().uri({ scheme: ["http", "https"] }),
      applyEmail: Joi.string().email(),
    })
      .or("applyLink", "applyEmail")
      .messages({ "object.missing": "applyMethod=external requires applyLink or applyEmail" }),
  });

const create = externalApplyRule(
  Joi.object({
    ...fields,
    ...Object.fromEntries(REQUIRED.map((key) => [key, fields[key].required()])),
    maxSalary: fields.maxSalary.min(Joi.ref("minSalary")).required(),
    applyMethod: fields.applyMethod.default("platform"),
    tags: fields.tags.default([]),
    vacancies: fields.vacancies.default(1),
  })
);

const update = externalApplyRule(Joi.object({ ...fields, status: Joi.string().valid(...STATUSES) }).min(1));

const list = listQuery(SORTABLE, {
  search: Joi.string().trim().max(200).allow(""),
  role: Joi.string().trim().max(120),
  location: Joi.string().trim().max(120),
  minSalary: Joi.number().min(0),
  status: Joi.string().valid(...STATUSES),
});

module.exports = { create, update, list };
