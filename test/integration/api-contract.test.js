// The API contract itself: versioning, envelopes, error shapes, status-code
// semantics and pagination. Per-resource behaviour lives in the feature suites.
const { app, request, registerUser, createAdmin } = require("../helpers");
const { MAX_LIMIT, DEFAULT_LIMIT } = require("../../src/common/utils/pagination");

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const FUTURE = () => new Date(Date.now() + 30 * 864e5).toISOString();
const JOB = {
  title: "Backend Engineer",
  role: "Engineering",
  description: "Build APIs",
  responsibilities: "Everything",
  minSalary: 1000,
  maxSalary: 2000,
  salaryType: "monthly",
  expirationDate: FUTURE(),
};

describe("versioning", () => {
  test("application routes live under /api/v1", async () => {
    expect((await request(app).get("/api/v1/jobs")).status).toBe(200);
  });

  // The move to /api/v1 is a breaking change: the unversioned paths are gone,
  // deliberately, rather than kept as silent aliases.
  test.each([
    ["GET", "/api/jobs"],
    ["POST", "/api/auth/login"],
    ["GET", "/api/users/me"],
    ["POST", "/api/payments/webhook"],
  ])("legacy %s %s is 404 with the standard error envelope", async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });

  test("health probes stay outside the version prefix", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/health/ready")).status).toBe(200);
    expect((await request(app).get("/api/v1/health")).status).toBe(404);
  });
});

describe("success envelope", () => {
  test("a single resource is { success, data, message }", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app).get("/api/v1/users/me").set(auth(accessToken));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["data", "message", "success"]);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual(expect.any(String));
    expect(res.body.data._id).toBeDefined();
  });

  test("a list adds `pagination` and never leaks the old `meta` key", async () => {
    const res = await request(app).get("/api/v1/jobs");
    expect(Object.keys(res.body).sort()).toEqual(["data", "message", "pagination", "success"]);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeUndefined();
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: DEFAULT_LIMIT,
      total: expect.any(Number),
      totalPages: expect.any(Number),
    });
  });

  test("creation answers 201, deletion answers 204 with no body", async () => {
    const recruiter = await registerUser({ role: "recruiter" });
    const posted = await request(app).post("/api/v1/jobs").set(auth(recruiter.accessToken)).send(JOB);
    expect(posted.status).toBe(201);
    expect(posted.body.data._id).toBeDefined();

    const deleted = await request(app).delete(`/api/v1/jobs/${posted.body.data._id}`).set(auth(recruiter.accessToken));
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe("");
    expect(deleted.headers["content-type"]).toBeUndefined();
  });

  test("PUT on a singleton profile creates (201) then updates (200)", async () => {
    const founder = await registerUser({ role: "startup" });
    const body = { name: "Acme", description: "d", totalRaising: 1000, minInvestment: 10 };
    expect((await request(app).put("/api/v1/startups/me").set(auth(founder.accessToken)).send(body)).status).toBe(201);
    expect((await request(app).put("/api/v1/startups/me").set(auth(founder.accessToken)).send(body)).status).toBe(200);
  });

  test("the Stripe webhook keeps Stripe's response shape, not the envelope", async () => {
    const res = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "payment_intent.succeeded" }));
    // No valid signature here, so it's a 400 — the point is that it is not our
    // JSON envelope but Stripe's plain-text error.
    expect(res.status).toBe(400);
    expect(res.body.success).toBeUndefined();
    expect(res.text).toMatch(/Webhook Error/);
  });
});

describe("error envelope", () => {
  const shapeOf = (res) => Object.keys(res.body).sort();

  test("every error carries code, message and the requestId from the header", async () => {
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(401);
    expect(shapeOf(res)).toEqual(["error", "requestId", "success"]);
    expect(res.body.error).toMatchObject({ code: "UNAUTHORIZED", message: expect.any(String) });
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  test("validation errors list the offending fields", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "email", message: expect.any(String) })])
    );
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(["firstName", "password"]));
  });

  test.each([
    ["malformed JSON", 400, "INVALID_JSON"],
    ["oversized body", 413, "PAYLOAD_TOO_LARGE"],
  ])("%s is %i %s", async (kind, status, code) => {
    const req = request(app).post("/api/v1/auth/login").set("Content-Type", "application/json");
    const res = await (kind === "malformed JSON"
      ? req.send('{"email":')
      : req.send(JSON.stringify({ email: "a@b.co", password: "x".repeat(1024 * 1024 + 1) })));
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  test("an unparsable resource id is 400 INVALID_ID and never echoes the input", async () => {
    const res = await request(app).get(`/api/v1/jobs/${encodeURIComponent("<script>alert(1)</script>")}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
    expect(JSON.stringify(res.body)).not.toContain("script");
  });

  test("a well-formed id that matches nothing is 404 NOT_FOUND", async () => {
    const res = await request(app).get("/api/v1/jobs/507f1f77bcf86cd799439011");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("an unknown route is 404 and names the method and path only", async () => {
    const res = await request(app).get("/api/v1/nope?secret=value");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Route not found: GET /api/v1/nope");
  });

  test("a duplicate resource is 409", async () => {
    const email = "contract-duplicate@example.com";
    await registerUser({ email });
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ firstName: "A", lastName: "B", email, password: "password123" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  test("a business rule refusing a well-formed request is 422 with a specific code", async () => {
    const [recruiter, candidate] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "candidate" }),
    ]);
    const job = (await request(app).post("/api/v1/jobs").set(auth(recruiter.accessToken)).send(JOB)).body.data;
    await request(app).patch(`/api/v1/jobs/${job._id}`).set(auth(recruiter.accessToken)).send({ status: "closed" });

    const res = await request(app)
      .post(`/api/v1/jobs/${job._id}/applications`)
      .set(auth(candidate.accessToken))
      .send({ coverLetter: "I would love this role", resumeUrl: "https://example.com/cv.pdf" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("JOB_CLOSED");
  });

  test("errors never expose stack traces, internals or database detail", async () => {
    const responses = await Promise.all([
      request(app).get("/api/v1/users/me"),
      request(app).get("/api/v1/jobs/not-an-id"),
      request(app).post("/api/v1/auth/register").send({}),
      request(app).get("/api/v1/nope"),
    ]);
    for (const res of responses) {
      const body = JSON.stringify(res.body);
      expect(res.body.error.stack).toBeUndefined();
      expect(body).not.toMatch(/node_modules|at Object\.|mongodb|mongoose|E11000|Cast to/i);
    }
  });
});

describe("pagination", () => {
  let recruiter;
  beforeEach(async () => {
    recruiter = await registerUser({ role: "recruiter" });
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/v1/jobs")
        .set(auth(recruiter.accessToken))
        .send({ ...JOB, title: `Job ${i}`, minSalary: 1000 + i * 100, maxSalary: 5000 });
    }
  });

  test("page and limit slice the collection and report totals", async () => {
    const res = await request(app).get("/api/v1/jobs?page=2&limit=2");
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  test("a page past the end is an empty list, not an error", async () => {
    const res = await request(app).get("/api/v1/jobs?page=99&limit=2");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(5);
  });

  test("sorting by an allowed field works in both directions", async () => {
    const ascending = await request(app).get("/api/v1/jobs?sort=minSalary");
    const descending = await request(app).get("/api/v1/jobs?sort=-minSalary");
    expect(ascending.body.data[0].minSalary).toBe(1000);
    expect(descending.body.data[0].minSalary).toBe(1400);
  });

  // Regression: `?sort=$where` reached MongoDB and produced a 500.
  test.each(["$where", "password", "recruiter,$gt"])("sorting by %s is rejected as a 400", async (sort) => {
    const res = await request(app).get(`/api/v1/jobs?sort=${encodeURIComponent(sort)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test.each([
    ["limit above the maximum", `limit=${MAX_LIMIT + 1}`],
    ["limit of zero", "limit=0"],
    ["page zero", "page=0"],
    ["a non-numeric page", "page=abc"],
  ])("%s is rejected as a 400", async (_, query) => {
    expect((await request(app).get(`/api/v1/jobs?${query}`)).status).toBe(400);
  });

  test("the maximum limit is accepted", async () => {
    const res = await request(app).get(`/api/v1/jobs?limit=${MAX_LIMIT}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(MAX_LIMIT);
  });

  test("every list endpoint returns a pagination block", async () => {
    const [candidate, investor, founder, admin] = await Promise.all([
      registerUser({ role: "candidate" }),
      registerUser({ role: "investor" }),
      registerUser({ role: "startup" }),
      createAdmin(),
    ]);
    await request(app)
      .put("/api/v1/startups/me")
      .set(auth(founder.accessToken))
      .send({ name: "Acme", description: "d", totalRaising: 1000, minInvestment: 10 });
    await request(app).put("/api/v1/investors/me").set(auth(investor.accessToken)).send({ aboutMe: "investor" });

    const lists = [
      ["/api/v1/jobs", null],
      ["/api/v1/startups", null],
      ["/api/v1/users", admin.accessToken],
      ["/api/v1/applications/mine", candidate.accessToken],
      ["/api/v1/experiences", candidate.accessToken],
      ["/api/v1/notifications", candidate.accessToken],
      ["/api/v1/messages/conversations", candidate.accessToken],
      [`/api/v1/messages/${investor.user._id}`, candidate.accessToken],
      ["/api/v1/investments/mine", investor.accessToken],
      ["/api/v1/investments/startup", founder.accessToken],
      ["/api/v1/startups/matches", investor.accessToken],
    ];

    for (const [path, token] of lists) {
      const req = request(app).get(path);
      const res = await (token ? req.set(auth(token)) : req);
      expect({ path, status: res.status, paginated: Boolean(res.body.pagination) }).toEqual({
        path,
        status: 200,
        paginated: true,
      });
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });
});
