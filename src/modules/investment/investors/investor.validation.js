const Joi = require("joi");
const { STAGES } = require("../startups/startup.model");

const upsert = Joi.object({
  investorType: Joi.string().allow(""),
  aboutMe: Joi.string().allow(""),
  linkedIn: Joi.string().uri().allow(""),
  twitter: Joi.string().uri().allow(""),
  facebook: Joi.string().uri().allow(""),
  website: Joi.string().uri().allow(""),
  areasOfExpertise: Joi.array().items(Joi.string()).default([]),
  numberOfInvestments: Joi.number().min(0).default(0),
  companies: Joi.array().items(Joi.string()).default([]),
  criteria: Joi.object({
    minInvestmentCents: Joi.number().integer().min(0),
    maxInvestmentCents: Joi.number().integer().min(0),
    industries: Joi.array().items(Joi.string()),
    stages: Joi.array().items(Joi.string().valid(...STAGES)),
    locations: Joi.array().items(Joi.string()),
  }),
});

module.exports = { upsert };
