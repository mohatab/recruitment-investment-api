const Joi = require("joi");
const { STATUSES } = require("./application.model");

const create = Joi.object({
  coverLetter: Joi.string().min(10).required(),
  resumeUrl: Joi.string().uri().optional(), // falls back to the applicant's on-file CV if omitted
});

const updateStatus = Joi.object({
  status: Joi.string()
    .valid(...STATUSES)
    .required(),
});

module.exports = { create, updateStatus };
