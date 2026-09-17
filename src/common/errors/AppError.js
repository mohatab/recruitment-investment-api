const CODES = require("./errorCodes");

class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || CODES.INTERNAL_ERROR;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400: the request could not be understood as written (schema, id, JSON).
// `details` is [{ field, message }] so clients can attach messages to inputs.
class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, CODES.VALIDATION_ERROR);
    this.details = details;
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", code = CODES.UNAUTHORIZED) {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action", code = CODES.FORBIDDEN) {
    super(message, 403, code);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, CODES.NOT_FOUND);
  }
}

class ConflictError extends AppError {
  constructor(message = "Resource already exists", code = CODES.CONFLICT) {
    super(message, 409, code);
  }
}

// 422: the request is well-formed, but a business rule refuses it (a closed
// job, an illegal status transition, an investment below the minimum). Separate
// from 400 so clients can tell "you sent nonsense" from "the domain says no".
class UnprocessableEntityError extends AppError {
  constructor(message, code) {
    super(message, 422, code);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  CODES,
};
