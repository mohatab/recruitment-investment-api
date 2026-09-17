const Joi = require("joi");
const { password } = require("../auth/auth.validation");

const updateProfile = Joi.object({
  firstName: Joi.string().min(1).max(80),
  lastName: Joi.string().min(1).max(80),
  phone: Joi.string().max(30).allow(""),
  nationality: Joi.string().max(80).allow(""),
  birthdate: Joi.date().iso(),
  location: Joi.object({
    country: Joi.string().max(80).allow(""),
    city: Joi.string().max(80).allow(""),
  }),
}).min(1);

const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: password.required().invalid(Joi.ref("currentPassword")).messages({
    "any.invalid": '"newPassword" must differ from "currentPassword"',
  }),
});

const setStatus = Joi.object({
  isActive: Joi.boolean().strict().required(),
});

module.exports = { updateProfile, changePassword, setStatus };
