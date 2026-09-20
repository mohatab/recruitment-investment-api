const rateLimit = require("express-rate-limit");
const env = require("../../config/env");
const { AppError, CODES } = require("../errors/AppError");

// Keyed on req.ip, which is only trustworthy because `trust proxy` comes from
// TRUST_PROXY (default off) — see config/env.js.
// ponytail: in-memory store, limits are per process. Use a shared store
// (rate-limit-redis) when running more than one instance.
function limiter({ limit, message }) {
  const middleware = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !env.rateLimitEnabled,
    // Through the central error handler, so 429s get the standard envelope + requestId.
    handler: (req, res, next) => next(new AppError(message, 429, CODES.TOO_MANY_REQUESTS)),
  });
  // Route introspection reads this, so a test can prove which policy guards a
  // given endpoint rather than trusting that the middleware was wired on.
  middleware.limitPolicy = { limit };
  return middleware;
}

// Generic API-wide limiter: generous, just there to blunt abuse/scraping.
const apiLimiter = limiter({ limit: 300, message: "Too many requests, try again later" });

// Tight limiter for auth endpoints — the brute-force protection.
const authLimiter = limiter({ limit: 20, message: "Too many attempts, try again later" });

// Endpoints that accept a file. Every request here can write up to 5MB to
// storage and, for the contact form, insert a row — the general limiter would
// still allow 300 of those per window, which is a cheap way to fill a disk.
// Well above what a human uploading a CV or a photo does.
const uploadLimiter = limiter({ limit: 20, message: "Too many uploads, try again later" });

module.exports = { apiLimiter, authLimiter, uploadLimiter };
