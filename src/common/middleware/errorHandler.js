const { AppError } = require("../errors/AppError");
const logger = require("../utils/logger");
const env = require("../../config/env");

// body-parser/raw-body failures are client errors (they carry `expose: true`
// and a 4xx `status`); without this map they fell through to a 500.
const BODY_PARSER_CODES = {
  "entity.parse.failed": { code: "INVALID_JSON", message: "Request body is not valid JSON" },
  "entity.too.large": { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
  "entity.verify.failed": { code: "BAD_REQUEST", message: "Request body could not be verified" },
  "request.aborted": { code: "BAD_REQUEST", message: "Request was aborted" },
  "request.size.invalid": { code: "BAD_REQUEST", message: "Request size did not match Content-Length" },
  "charset.unsupported": { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported request charset" },
  "encoding.unsupported": { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported content encoding" },
};

function sendError(req, res, statusCode, error) {
  res.locals.errorCode = error.code; // picked up by the access log
  res.status(statusCode).json({ success: false, error, requestId: req.id });
}

function notFound(req, res) {
  sendError(req, res, 404, { code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.path}` });
}

// Translates known Mongoose/Multer/body-parser failure shapes into the same
// { code, message, statusCode } shape AppError uses, so the handler below has
// one code path for "operational" errors regardless of where they came from.
function normalize(err) {
  if (err instanceof AppError) return err;

  const bodyError = err.expose && err.status >= 400 && err.status < 500 && BODY_PARSER_CODES[err.type];
  if (bodyError) return { statusCode: err.status, ...bodyError };

  if (err.name === "ValidationError" && err.errors) {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join("; ");
    return { statusCode: 400, code: "VALIDATION_ERROR", message };
  }

  if (err.name === "CastError") {
    return { statusCode: 400, code: "INVALID_ID", message: `Invalid ${err.path}` };
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return { statusCode: 409, code: "DUPLICATE_KEY", message: `${field} already in use` };
  }

  if (err.name === "MulterError") {
    return { statusCode: 400, code: "UPLOAD_ERROR", message: err.message };
  }

  return { statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong" };
}

// Express identifies error-handling middleware by arity (4 params) — `next`
// must stay in the signature even though it's unused in the body.
function errorHandler(err, req, res, next) {
  const normalized = normalize(err);

  // 4xx are expected client outcomes, already recorded by the access log with
  // their error code. Only server faults get an error entry with a stack.
  if (normalized.statusCode >= 500) {
    logger.error(err.message, {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      stack: env.nodeEnv === "production" ? undefined : err.stack,
    });
  }

  sendError(req, res, normalized.statusCode, {
    code: normalized.code,
    message: normalized.message,
    ...(normalized.details ? { details: normalized.details } : {}),
  });
}

module.exports = { errorHandler, notFound };
