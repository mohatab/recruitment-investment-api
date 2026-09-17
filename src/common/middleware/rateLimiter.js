const rateLimit = require("express-rate-limit");
const env = require("../../config/env");

// A real client would never approach these limits in one test run's
// wall-clock window; a fast, in-process integration suite legitimately
// will (dozens of registrations/logins per file). Rate limiting is a
// production concern being verified as *present and correctly wired*
// (see the dedicated rate-limit test), not something the rest of the
// suite should have to work around by pacing itself artificially.
const skip = () => env.nodeEnv === "test";

// Generic API-wide limiter: generous, just there to blunt abuse/scraping.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

// Tight limiter for auth endpoints — the actual brute-force protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" } },
});

module.exports = { apiLimiter, authLimiter, skip };
