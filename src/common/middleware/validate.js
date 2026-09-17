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
      // [{ field, message }] so a client can show the message next to the input.
      const details = error.details.map((d) => ({ field: d.path.join("."), message: d.message }));
      return next(new ValidationError(details.map((d) => d.message).join("; "), details));
    }
    req[property] = value;
    next();
  };
};
