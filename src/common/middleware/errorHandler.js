const { AppError } = require("../errors/AppError");
const logger = require("../utils/logger");
const env = require("../../config/env");

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

// Translates known Mongoose/Multer failure shapes into the same
// { code, message, statusCode } shape AppError uses, so the handler below
// has one code path for "operational" errors regardless of where they came
// from.
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err.name === "ValidationError" && err.errors) {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join("; ");
    return { statusCode: 400, code: "VALIDATION_ERROR", message, isOperational: true };
  }

  if (err.name === "CastError") {
    return { statusCode: 400, code: "INVALID_ID", message: `Invalid ${err.path}: ${err.value}`, isOperational: true };
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return { statusCode: 409, code: "DUPLICATE_KEY", message: `${field} already in use`, isOperational: true };
  }

  if (err.name === "MulterError") {
    return { statusCode: 400, code: "UPLOAD_ERROR", message: err.message, isOperational: true };
  }

  return { statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong", isOperational: false };
}

// Express identifies error-handling middleware by arity (4 params) — `next`
// must stay in the signature even though it's unused in the body.
function errorHandler(err, req, res, next) {
  const normalized = normalize(err);

  logger.error(err.message, {
    requestId: req.id,
    path: req.originalUrl,
    method: req.method,
    statusCode: normalized.statusCode,
    stack: env.nodeEnv === "production" ? undefined : err.stack,
  });

  res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
  });
}

module.exports = { errorHandler, notFound };
