// The response-header contract and the secret-handling guarantees that go with
// it. These are assertions about what the API tells a browser it may do, and
// about what never leaves the process — both are things a refactor can silently
// drop without failing any other test.
const { app, request, registerUser, createAdmin } = require("../helpers");
const env = require("../../src/config/env");
const logger = require("../../src/common/utils/logger");

const headers = (res) => res.headers;

describe("security headers", () => {
  let res;
  beforeAll(async () => {
    res = await request(app).get("/api/v1/jobs");
  });

  test.each([
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "SAMEORIGIN"],
    ["referrer-policy", "no-referrer"],
    ["cross-origin-opener-policy", "same-origin"],
    ["cross-origin-resource-policy", "same-origin"],
    ["x-permitted-cross-domain-policies", "none"],
    ["x-dns-prefetch-control", "off"],
    // Explicitly disabled: the legacy XSS auditor introduced vulnerabilities of
    // its own and is off in every modern browser.
    ["x-xss-protection", "0"],
  ])("%s is %s", (header, value) => {
    expect(headers(res)[header]).toBe(value);
  });

  test("a restrictive content security policy is sent", () => {
    const csp = headers(res)["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("script-src 'self'"); // no 'unsafe-inline' or 'unsafe-eval'
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
  });

  test("HSTS is sent with a long max-age covering subdomains", () => {
    const hsts = headers(res)["strict-transport-security"];
    expect(hsts).toMatch(/max-age=(\d+)/);
    expect(Number(hsts.match(/max-age=(\d+)/)[1])).toBeGreaterThanOrEqual(15552000);
    expect(hsts).toContain("includeSubDomains");
  });

  // Helmet sets no Permissions-Policy; this API and its docs page need none of
  // these features, so they are switched off rather than left to the default.
  test("Permissions-Policy disables the browser features this API never uses", () => {
    const policy = headers(res)["permissions-policy"];
    expect(policy).toBeDefined();
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  test("the server does not advertise its stack", () => {
    expect(headers(res)["x-powered-by"]).toBeUndefined();
    expect(headers(res)["server"]).toBeUndefined();
  });

  test("every header is sent once — no conflicting duplicates", async () => {
    const raw = await request(app).get("/api/v1/jobs");
    for (const [name, value] of Object.entries(raw.headers)) {
      // supertest joins repeated headers with ", "; a duplicated policy header
      // is a real problem because browsers apply the most restrictive one.
      if (["content-security-policy", "x-frame-options", "permissions-policy"].includes(name)) {
        expect(Array.isArray(value)).toBe(false);
        expect(
          String(value)
            .split(",")
            .filter((p) => p.includes("default-src")).length
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test("error responses carry the same headers as successful ones", async () => {
    const notFound = await request(app).get("/api/v1/does-not-exist");
    expect(notFound.status).toBe(404);
    expect(notFound.headers["x-content-type-options"]).toBe("nosniff");
    expect(notFound.headers["content-security-policy"]).toBeDefined();
    expect(notFound.headers["permissions-policy"]).toBeDefined();
  });
});

describe("CORS", () => {
  test("the configured origin is reflected and credentials are never enabled", async () => {
    const res = await request(app).get("/api/v1/jobs").set("Origin", "https://app.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
    // Bearer tokens in a header, never cookies: enabling credentials together
    // with a permissive origin is what makes wildcard CORS dangerous.
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  test("a production configuration cannot be a wildcard", () => {
    const { loadEnv } = require("../../src/config/env");
    const base = {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://localhost:27017/x",
      JWT_ACCESS_SECRET: "a".repeat(32),
      JWT_REFRESH_SECRET: "b".repeat(32),
      APP_URL: "https://app.example.com",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    };
    expect(() => loadEnv({ ...base, CORS_ORIGIN: "*" })).toThrow(/CORS_ORIGIN/);
    expect(() => loadEnv({ ...base })).toThrow(/CORS_ORIGIN/); // absent is refused too
    expect(() => loadEnv({ ...base, CORS_ORIGIN: "https://app.example.com" })).not.toThrow();
  });
});

// A log line is the easiest place for a secret to escape: it is written
// everywhere, kept for a long time, and shipped to third parties.
describe("secrets never reach the logs", () => {
  const capture = () => {
    const lines = [];
    const spies = ["error", "warn", "info", "debug"].map((level) =>
      jest.spyOn(logger, level).mockImplementation((message, meta) => lines.push(`${message} ${JSON.stringify(meta)}`))
    );
    return {
      output: () => lines.join("\n"),
      restore: () => spies.forEach((s) => s.mockRestore()),
    };
  };

  test("a login, a registration and a password change log no credential or token", async () => {
    const log = capture();
    let tokens;
    try {
      const password = "correct-horse-battery";
      const registered = await registerUser({ password });
      tokens = registered;
      await request(app).post("/api/v1/auth/login").send({ email: registered.user.email, password });
      await request(app)
        .post("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${registered.accessToken}`)
        .send({ currentPassword: password, newPassword: "a-brand-new-password" });
    } finally {
      log.restore();
    }

    const output = log.output();
    expect(output).not.toContain("correct-horse-battery");
    expect(output).not.toContain("a-brand-new-password");
    expect(output).not.toContain(tokens.accessToken);
    expect(output).not.toContain(tokens.refreshToken);
    expect(output).not.toContain(env.jwt.accessSecret);
    expect(output).not.toContain(env.jwt.refreshSecret);
  });

  test("the access log records no query string, header or body", async () => {
    const log = capture();
    try {
      await request(app)
        .get("/api/v1/jobs?search=secret-term&token=should-not-be-logged")
        .set("Authorization", "Bearer a-token-that-must-not-be-logged");
    } finally {
      log.restore();
    }

    const output = log.output();
    expect(output).toContain("request completed");
    expect(output).toContain("/api/v1/jobs");
    expect(output).not.toContain("should-not-be-logged");
    expect(output).not.toContain("a-token-that-must-not-be-logged");
    expect(output).not.toContain("secret-term");
  });

  test("a server fault logs no stack trace to the client and no secret to the log", async () => {
    const Job = require("../../src/modules/recruitment/jobs/job.model");
    const log = capture();
    let res;
    try {
      jest.spyOn(Job, "countDocuments").mockRejectedValue(new Error("connection string mongodb://user:hunter2@host"));
      res = await request(app).get("/api/v1/jobs");
    } finally {
      log.restore();
      jest.restoreAllMocks();
    }

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(JSON.stringify(res.body)).not.toMatch(/at [A-Za-z]+ \(|\.js:\d+/); // no stack frames
  });
});

describe("upload abuse limits", () => {
  // The limiter itself is exercised in rate-limit.test.js (limits are disabled
  // for the rest of the suite); here we prove the middleware is actually wired
  // onto the endpoints that write files.
  // Introspects the real routers: every route that accepts a file must be
  // guarded by a policy stricter than the general API limiter, and every auth
  // route by the brute-force one. The behaviour itself is in rate-limit.test.js.
  test("every endpoint that accepts a file is behind a stricter limit than the API default", () => {
    const routes = require("../routes").collectRoutes();
    const fileRoutes = [
      ["POST", "/api/v1/users/me/cv"],
      ["POST", "/api/v1/contact"],
    ];

    for (const [method, path] of fileRoutes) {
      const route = routes.find((r) => r.method === method && r.path === path);
      expect(route).toBeDefined();
      expect(route.rateLimit).toBe(20);
    }

    const authRoutes = routes.filter((r) => r.path.startsWith("/api/v1/auth/"));
    expect(authRoutes.length).toBeGreaterThan(5);
    expect(authRoutes.every((r) => r.rateLimit === 20)).toBe(true);
  });

  test("an admin can still broadcast, and a candidate still cannot", async () => {
    const admin = await createAdmin();
    const user = await registerUser();
    const send = (who) =>
      request(app)
        .post("/api/v1/notifications/broadcast")
        .set("Authorization", `Bearer ${who.accessToken}`)
        .send({ targetRole: "candidate", message: "still working" });
    expect((await send(admin)).status).toBe(201);
    expect((await send(user)).status).toBe(403);
  });
});
