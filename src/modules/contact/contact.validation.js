const Joi = require("joi");
const { listQuery } = require("../../common/utils/pagination");
const { SORTABLE } = require("./contact.service");

const create = Joi.object({
  firstName: Joi.string().trim().max(80).required(),
  lastName: Joi.string().trim().max(80).required(),
  email: Joi.string().trim().lowercase().email().max(254).required(),
  phoneNumber: Joi.string().trim().max(30).required(),
  country: Joi.string().trim().max(80).allow(""),
  city: Joi.string().trim().max(80).allow(""),
});

const list = listQuery(SORTABLE);

module.exports = { create, list };
