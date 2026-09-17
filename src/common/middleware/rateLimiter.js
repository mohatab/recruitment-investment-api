const rateLimit = require("express-rate-limit");
const env = require("../../config/env");
const { AppError } = require("../errors/AppError");

// Keyed on req.ip, which is only trustworthy because `trust proxy` comes from
// TRUST_PROXY (default off) — see config/env.js.
// ponytail: in-memory store, limits are per process. Use a shared store
// (rate-limit-redis) when running more than one instance.
function limiter({ limit, message }) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !env.rateLimitEnabled,
    // Through the central error handler, so 429s get the standard envelope + requestId.
    handler: (req, res, next) => next(new AppError(message, 429, "TOO_MANY_REQUESTS")),
  });
}

// Generic API-wide limiter: generous, just there to blunt abuse/scraping.
const apiLimiter = limiter({ limit: 300, message: "Too many requests, try again later" });

// Tight limiter for auth endpoints — the brute-force protection.
const authLimiter = limiter({ limit: 20, message: "Too many attempts, try again later" });

module.exports = { apiLimiter, authLimiter };
