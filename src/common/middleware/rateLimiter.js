const rateLimit = require("express-rate-limit");

// Generic API-wide limiter: generous, just there to blunt abuse/scraping.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tight limiter for auth endpoints — the actual brute-force protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" } },
});

module.exports = { apiLimiter, authLimiter };
