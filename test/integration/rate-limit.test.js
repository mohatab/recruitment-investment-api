// Exercises the app's real limiters as configured (env.setup.js disables them
// for the rest of the suite). Jest gives each test file its own process.env
// copy and module registry, so this override stays local to this file.
process.env.RATE_LIMIT_ENABLED = "true";

const { app, request } = require("../helpers");

const AUTH_LIMIT = 20;
const UPLOAD_LIMIT = 20;

// Invalid body: rejected by validation before touching the DB, but still
// counted by the limiter, which runs first.
const login = (headers = {}) => request(app).post("/api/v1/auth/login").set(headers).send({});
const contact = () => request(app).post("/api/v1/contact").send({});

// Each limiter keeps one counter per client IP for the whole file, and every
// request here comes from the same client. Tests therefore do not share a
// bucket across test boundaries: each one that cares about a bucket exhausts
// it itself, so the file passes in any order (`jest --randomize`) rather than
// only in the order it happens to be written in.
describe("rate limiting", () => {
  test("auth endpoints allow the configured number of attempts, then answer 429 in the standard envelope", async () => {
    for (let i = 0; i < AUTH_LIMIT; i++) expect((await login()).status).toBe(400);

    const res = await login();
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, error: { code: "TOO_MANY_REQUESTS" } });
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);

    // Regression: `trust proxy` was hardcoded to 1, so rotating
    // X-Forwarded-For gave every request a fresh rate-limit key. Asserted here
    // rather than in its own test because it is about *this* exhausted bucket.
    const spoofed = [];
    for (let i = 0; i < 5; i++) spoofed.push((await login({ "X-Forwarded-For": `203.0.113.${i}` })).status);
    expect(spoofed).toEqual([429, 429, 429, 429, 429]);
  });

  test("health probes are never rate limited", async () => {
    // Enough requests to pass every limit in the app several times over.
    for (let i = 0; i < AUTH_LIMIT * 2; i++) expect((await request(app).get("/health")).status).toBe(200);
  });

  // The contact form is public and accepts a 5MB file, so the general
  // 300/window limit would still allow a lot of disk writes from one client.
  test("the public contact form is throttled well below the general API limit", async () => {
    for (let i = 0; i < UPLOAD_LIMIT; i++) expect((await contact()).status).toBe(400);

    const res = await contact();
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, error: { code: "TOO_MANY_REQUESTS" } });
  });
});
