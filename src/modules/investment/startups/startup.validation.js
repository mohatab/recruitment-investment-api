const Joi = require("joi");
const { STAGES } = require("./startup.model");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./startup.service");
const { MAX_AMOUNT_CENTS } = require("../../../common/utils/money");

// All monetary inputs are integer minor units (cents).
const cents = Joi.number().integer().min(0).max(MAX_AMOUNT_CENTS).messages({
  "number.integer": "{{#label}} must be an integer number of cents",
});

const upsert = Joi.object({
  name: Joi.string().required(),
  pitchTitle: Joi.string().allow(""),
  description: Joi.string().required(),
  website: Joi.string().uri().allow(""),
  location: Joi.string().allow(""),
  industries: Joi.array().items(Joi.string()).default([]),
  stage: Joi.string()
    .valid(...STAGES)
    .default("idea"),
  idealInvestorRole: Joi.string().allow(""),
  previousRaisedCents: cents.default(0),
  // A target below the minimum ticket would be unreachable by construction.
  totalRaisingCents: cents.min(Joi.ref("minInvestmentCents")).required(),
  minInvestmentCents: cents.min(1).required(),
});

const list = listQuery(SORTABLE, {
  industry: Joi.string().max(120),
  stage: Joi.string().valid(...STAGES),
});

const matches = listQuery(SORTABLE);

const successAssessment = Joi.object({
  isSoftwareBased: Joi.boolean().required(),
  hasAdCampaigns: Joi.boolean().required(),
  hasConsulting: Joi.boolean().required(),
  totalFunding: Joi.number().min(0).required(),
});

module.exports = { upsert, list, matches, successAssessment };
