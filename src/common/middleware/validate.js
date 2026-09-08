const { ValidationError } = require("../errors/AppError");

// Validates req[property] against a Joi schema and replaces it with the
// validated/coerced value. One factory shared by every route instead of
// re-implementing "if (!field) return 400" per handler.
module.exports = function validate(schema, property = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const details = error.details.map((d) => d.message);
      return next(new ValidationError(details.join("; "), details));
    }
    req[property] = value;
    next();
  };
};
