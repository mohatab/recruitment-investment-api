const Joi = require("joi");

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
  newPassword: Joi.string().min(6).max(128).required(),
});

module.exports = { updateProfile, changePassword };
