// Cross-cutting response hygiene: rather than trusting each module's own
// tests, this walks a populated set of endpoints and inspects the bytes that
// actually come back for fields that are not part of the API contract.
// It is how the Mongoose version key was found being returned by jobs,
// applications, startups and experiences while five other models stripped it —
// an undocumented field on half the entity types.
const { app, request, registerUser, createAdmin } = require("../helpers");
const { collectRoutes } = require("../routes");
const User = require("../../src/modules/users/user.model");

const FORBIDDEN = ["password", "tokenHash", "tokenVersion", "__v", "usedAt", "revokedReason", "readBy"];
const as = (w) => ({ Authorization: `Bearer ${w.accessToken}` });

// Recursively collect every key name that appears anywhere in a payload.
function keysIn(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysIn(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysIn(v, out);
    }
  }
  return out;
}

describe("PROBE: does any response leak an internal field?", () => {
  let admin;
  let candidate;
  let recruiter;

  beforeEach(async () => {
    [admin, candidate, recruiter] = await Promise.all([
      createAdmin(),
      registerUser({ role: "candidate" }),
      registerUser({ role: "recruiter" }),
    ]);
  });

  // Regression: jobs, applications, startups and experiences used to serialize
  // the Mongoose version key while users, messages, contacts and notifications
  // stripped it — an undocumented field on half the entity types.
  test("no populated resource returns the Mongoose version key", async () => {
    await User.updateMany({}, { emailVerifiedAt: new Date() });
    const job = await request(app)
      .post("/api/v1/jobs")
      .set(as(recruiter))
      .send({
        title: "Hygiene Engineer",
        role: "Engineering",
        description: "A detailed description",
        responsibilities: "Detailed responsibilities",
        minSalary: 1000,
        maxSalary: 2000,
        salaryType: "monthly",
        expirationDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      });
    expect(job.status).toBe(201);
    await request(app)
      .post(`/api/v1/jobs/${job.body.data._id}/applications`)
      .set(as(candidate))
      .send({ coverLetter: "I would like to join this team", resumeUrl: "https://example.com/cv.pdf" })
      .expect(201);
    await request(app)
      .post("/api/v1/experiences")
      .set(as(candidate))
      .send({ jobTitle: "Dev", companyName: "Acme", startDate: "2020-01-01", currentlyWorking: true })
      .expect(201);

    const responses = {
      "POST /jobs": job.body,
      "GET /jobs": (await request(app).get("/api/v1/jobs")).body,
      "GET /jobs/:id": (await request(app).get(`/api/v1/jobs/${job.body.data._id}`)).body,
      "GET /jobs/:id/applications": (
        await request(app).get(`/api/v1/jobs/${job.body.data._id}/applications`).set(as(recruiter))
      ).body,
      "GET /applications/mine": (await request(app).get("/api/v1/applications/mine").set(as(candidate))).body,
      "GET /experiences": (await request(app).get("/api/v1/experiences").set(as(candidate))).body,
      "GET /users/me": (await request(app).get("/api/v1/users/me").set(as(candidate))).body,
    };

    const leaking = Object.entries(responses)
      .filter(([, body]) => keysIn(body).has("__v"))
      .map(([name]) => name);
    expect(leaking).toEqual([]);
  });

  // The two schemas that carry virtuals must keep them: stripping the version
  // key with a transform must not also drop `isExpired` / `remainingCents`.
  test("stripping the version key does not remove the documented virtuals", async () => {
    await User.updateMany({}, { emailVerifiedAt: new Date() });
    const job = await request(app)
      .post("/api/v1/jobs")
      .set(as(recruiter))
      .send({
        title: "Virtual Check",
        role: "Engineering",
        description: "A detailed description",
        responsibilities: "Detailed responsibilities",
        minSalary: 1000,
        maxSalary: 2000,
        salaryType: "monthly",
        expirationDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      });
    expect(job.body.data.isExpired).toBe(false);

    const founder = await registerUser({ role: "startup" });
    const startup = await request(app)
      .put("/api/v1/startups/me")
      .set(as(founder))
      .send({
        name: "Virtuals Co",
        description: "A detailed description",
        totalRaisingCents: 100000,
        minInvestmentCents: 1000,
        industries: ["saas"],
        stage: "seed",
      });
    expect(startup.body.data.remainingCents).toBe(100000);
  });

  test("a populated set of GET endpoints returns no internal field", async () => {
    // Give the lists something to return.
    await request(app)
      .post("/api/v1/notifications/broadcast")
      .set(as(admin))
      .send({ userId: candidate.user._id, message: "probe" });
    await request(app)
      .post("/api/v1/messages")
      .set(as(candidate))
      .send({ receiverId: recruiter.user._id, body: "probe" });
    await request(app)
      .post("/api/v1/contact")
      .send({ firstName: "P", lastName: "R", email: "p@example.com", phoneNumber: "+10000000000" });
    await request(app)
      .post("/api/v1/experiences")
      .set(as(candidate))
      .send({ jobTitle: "Dev", companyName: "Acme", startDate: "2020-01-01", currentlyWorking: true });

    const probes = [
      ["/api/v1/users/me", candidate],
      ["/api/v1/users", admin],
      [`/api/v1/users/${recruiter.user._id}`, candidate],
      ["/api/v1/notifications", candidate],
      ["/api/v1/messages/conversations", candidate],
      [`/api/v1/messages/${recruiter.user._id}`, candidate],
      ["/api/v1/experiences", candidate],
      ["/api/v1/contact", admin],
      ["/api/v1/jobs", null],
      ["/api/v1/startups", null],
      ["/api/v1/applications/mine", candidate],
      ["/api/v1/jobs/mine", recruiter],
    ];

    const offenders = [];
    for (const [path, who] of probes) {
      const req = request(app).get(path);
      if (who) req.set(as(who));
      const res = await req;
      expect([200, 404]).toContain(res.status);

      const keys = keysIn(res.body);
      for (const bad of FORBIDDEN) if (keys.has(bad)) offenders.push(`${path} -> ${bad}`);
      // A storage key must never appear, under any name.
      if (JSON.stringify(res.body).includes("cv/") || JSON.stringify(res.body).includes("image/")) {
        offenders.push(`${path} -> storage key`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the auth responses expose tokens but never the stored hash or version", async () => {
    const fresh = await registerUser();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: fresh.user.email, password: "password123" });
    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.body.data.refreshToken });

    for (const res of [login, refreshed]) {
      const keys = keysIn(res.body);
      for (const bad of FORBIDDEN) expect(keys.has(bad)).toBe(false);
    }
    // The stored refresh token is a hash; the raw value must not be in the DB.
    const stored = await User.findById(fresh.user._id).select("+password");
    expect(JSON.stringify(login.body)).not.toContain(stored.password);
  });

  test("every documented route lives under /api/v1 except the health probes", () => {
    const stray = collectRoutes()
      .filter((r) => !r.path.startsWith("/api/v1") && !r.path.startsWith("/health"))
      .map((r) => `${r.method} ${r.path}`);
    expect(stray).toEqual([]);
  });

  test("a 500 never carries a stack, a path or a driver message", async () => {
    const Job = require("../../src/modules/recruitment/jobs/job.model");
    const logger = require("../../src/common/utils/logger");
    jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(Job, "find").mockImplementation(() => {
      throw new Error("E11000 duplicate key error collection: app.jobs index: x dup key: { a: 1 }");
    });

    const res = await request(app).get("/api/v1/jobs");
    jest.restoreAllMocks();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      requestId: res.headers["x-request-id"],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/E11000|dup key|\.js:\d+|at \w+ \(/);
  });
});
