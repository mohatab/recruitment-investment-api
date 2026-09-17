const express = require("express");
const request = require("supertest");
const rateLimit = require("express-rate-limit");
const { skip } = require("../../src/common/middleware/rateLimiter");

describe("rate limiter", () => {
  test("skip() disables rate limiting in the test environment (so the rest of the suite isn't rate-limited by its own volume)", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(skip()).toBe(true);
  });

  test("when active (skip forced off), the configured limiter actually returns 429 with our error envelope past its limit", async () => {
    // Same shape as the real authLimiter, but with skip forced off and a
    // tiny limit — proving out that our options (message shape, headers)
    // produce the response we expect once express-rate-limit actually
    // engages, without depending on/mutating the shared production limiter.
    const app = express();
    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: 2,
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => false,
        message: {
          success: false,
          error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" },
        },
      })
    );
    app.get("/", (req, res) => res.json({ success: true }));

    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);
    const throttled = await request(app).get("/");

    expect(throttled.status).toBe(429);
    expect(throttled.body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});
