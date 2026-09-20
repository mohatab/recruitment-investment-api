// Exercises the app's real limiters as configured (env.setup.js disables them
// for the rest of the suite). Jest gives each test file its own process.env
// copy and module registry, so this override stays local to this file.
process.env.RATE_LIMIT_ENABLED = "true";

const { app, request } = require("../helpers");

const AUTH_LIMIT = 20;

// Invalid body: rejected by validation before touching the DB, but still
// counted by the limiter, which runs first.
const attempt = (headers = {}) => request(app).post("/api/v1/auth/login").set(headers).send({});

describe("rate limiting", () => {
  test("auth endpoints return 429 with the standard error envelope past the limit", async () => {
    for (let i = 0; i < AUTH_LIMIT; i++) expect((await attempt()).status).toBe(400);

    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, error: { code: "TOO_MANY_REQUESTS" } });
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  // Regression: `trust proxy` was hardcoded to 1, so rotating X-Forwarded-For
  // gave every request a fresh rate-limit key.
  test("a spoofed, rotating X-Forwarded-For does not reset the limit", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push((await attempt({ "X-Forwarded-For": `203.0.113.${i}` })).status);
    }
    expect(results).toEqual([429, 429, 429, 429, 429]); // same client as the test above, still limited
  });

  test("health probes are never rate limited", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
  });

  // The contact form is public and accepts a 5MB file, so the general
  // 300/window limit would still allow a lot of disk writes from one client.
  test("the public contact form is throttled well below the general API limit", async () => {
    const submit = () => request(app).post("/api/v1/contact").send({});
    for (let i = 0; i < 20; i++) expect((await submit()).status).toBe(400);

    const res = await submit();
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, error: { code: "TOO_MANY_REQUESTS" } });
  });
});
