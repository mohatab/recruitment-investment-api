const Joi = require("joi");
const { STAGES } = require("./startup.model");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./startup.service");

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
  previousRaised: Joi.number().min(0).default(0),
  totalRaising: Joi.number().min(0).required(),
  minInvestment: Joi.number().min(0).required(),
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
