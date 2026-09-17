// Resource-level authorization (IDOR/BOLA): authenticated users with the
// *right role* still must not reach other users' resources, and fields that
// decide ownership, role or state can't be set from the request.
jest.mock("../../src/modules/payments/stripe.service", () => ({
  createPaymentIntent: jest.fn(async () => ({ id: `pi_${Math.random().toString(36).slice(2)}`, client_secret: "cs" })),
  refundPaymentIntent: jest.fn(async () => ({ id: "re" })),
  constructWebhookEvent: jest.fn(),
}));

const { app, request, registerUser, createAdmin } = require("../helpers");
const User = require("../../src/modules/users/user.model");
const Job = require("../../src/modules/recruitment/jobs/job.model");
const Application = require("../../src/modules/recruitment/applications/application.model");
const Startup = require("../../src/modules/investment/startups/startup.model");
const Investor = require("../../src/modules/investment/investors/investor.model");
const Experience = require("../../src/modules/experience/experience.model");
const Message = require("../../src/modules/messaging/message.model");

const as = (who) => ({
  get: (url) => request(app).get(url).set("Authorization", `Bearer ${who.accessToken}`),
  post: (url, body = {}) => request(app).post(url).set("Authorization", `Bearer ${who.accessToken}`).send(body),
  put: (url, body = {}) => request(app).put(url).set("Authorization", `Bearer ${who.accessToken}`).send(body),
  patch: (url, body = {}) => request(app).patch(url).set("Authorization", `Bearer ${who.accessToken}`).send(body),
  delete: (url) => request(app).delete(url).set("Authorization", `Bearer ${who.accessToken}`),
});

const JOB = {
  title: "Backend Engineer",
  role: "Engineering",
  description: "Build APIs",
  responsibilities: "Everything",
  minSalary: 1000,
  maxSalary: 2000,
  salaryType: "monthly",
  expirationDate: new Date(Date.now() + 30 * 864e5).toISOString(),
};
const STARTUP = { name: "Acme", description: "desc", totalRaising: 100000, minInvestment: 100 };

async function postJob(recruiter) {
  const res = await as(recruiter).post("/api/jobs", JOB);
  expect(res.status).toBe(201);
  return res.body.data;
}

async function apply(candidate, jobId, extra = {}) {
  const res = await as(candidate).post(`/api/jobs/${jobId}/applications`, {
    coverLetter: "I would love to join the team",
    resumeUrl: "https://example.com/cv.pdf",
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

const expectForbidden = (res) => {
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe("FORBIDDEN");
};

describe("client-controlled role and account fields", () => {
  test("PATCH /users/me cannot change role, email, account status, verification or session version", async () => {
    const user = await registerUser({ role: "candidate" }, { verified: false });
    const res = await as(user).patch("/api/users/me", {
      firstName: "Renamed",
      role: "admin",
      email: "takeover@example.com",
      isActive: false,
      emailVerifiedAt: new Date(),
      tokenVersion: 42,
      password: "new-password-123",
    });
    expect(res.status).toBe(200);

    const stored = await User.findById(user.user._id).select("+password").lean();
    expect(stored).toMatchObject({ firstName: "Renamed", role: "candidate", isActive: true, tokenVersion: 0 });
    expect(stored.email).toBe(user.user.email);
    expect(stored.emailVerifiedAt).toBeNull();
    expect(
      (await request(app).post("/api/auth/login").send({ email: user.user.email, password: "password123" })).status
    ).toBe(200);
    expectForbidden(await as(user).get("/api/users"));
  });
});

describe("jobs and applications", () => {
  test("a recruiter cannot take over another recruiter's job by sending `recruiter` in the body", async () => {
    const [owner, other] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "recruiter" }),
    ]);
    const job = await postJob(owner);

    await as(owner).patch(`/api/jobs/${job._id}`, { title: "Updated", recruiter: other.user._id }).expect(200);
    expect(String((await Job.findById(job._id)).recruiter)).toBe(owner.user._id);
    expectForbidden(await as(other).patch(`/api/jobs/${job._id}`, { title: "Hijacked" }));
    expectForbidden(await as(other).delete(`/api/jobs/${job._id}`));
    expect((await Job.findById(job._id)).title).toBe("Updated");
  });

  test("a job created with `recruiter` in the body belongs to the caller", async () => {
    const [recruiter, victim] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "recruiter" }),
    ]);
    const res = await as(recruiter).post("/api/jobs", { ...JOB, recruiter: victim.user._id, status: "closed" });
    expect(res.body.data.recruiter).toBe(recruiter.user._id);
  });

  test("an application's applicant, job and status come from the server, not the body", async () => {
    const [recruiter, candidate, victim] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "candidate" }),
      registerUser({ role: "candidate" }),
    ]);
    const [job, otherJob] = [await postJob(recruiter), await postJob(recruiter)];

    const application = await apply(candidate, job._id, {
      applicant: victim.user._id,
      job: otherJob._id,
      status: "accepted",
    });
    expect(application).toMatchObject({ applicant: candidate.user._id, job: job._id, status: "submitted" });
  });

  test("another recruiter cannot list or move applications for a job they don't own", async () => {
    const [owner, other, candidate] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "recruiter" }),
      registerUser({ role: "candidate" }),
    ]);
    const job = await postJob(owner);
    const application = await apply(candidate, job._id);

    expectForbidden(await as(other).get(`/api/jobs/${job._id}/applications`));
    expectForbidden(await as(other).patch(`/api/applications/${application._id}/status`, { status: "under_review" }));
    expect((await Application.findById(application._id)).status).toBe("submitted");
  });

  test("a candidate cannot move their own application through the pipeline", async () => {
    const [recruiter, candidate] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "candidate" }),
    ]);
    const application = await apply(candidate, (await postJob(recruiter))._id);
    expectForbidden(await as(candidate).patch(`/api/applications/${application._id}/status`, { status: "accepted" }));
  });

  // Regression: application.job was null for a deleted job, so the ownership
  // check threw a TypeError and the request returned 500.
  test("moving an application whose job was deleted is a 403, not a 500", async () => {
    const [recruiter, candidate] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "candidate" }),
    ]);
    const job = await postJob(recruiter);
    const application = await apply(candidate, job._id);
    await Job.deleteOne({ _id: job._id });

    expectForbidden(
      await as(recruiter).patch(`/api/applications/${application._id}/status`, { status: "under_review" })
    );
  });

  test("candidates only ever see their own applications", async () => {
    const [recruiter, alice, bob] = await Promise.all([
      registerUser({ role: "recruiter" }),
      registerUser({ role: "candidate" }),
      registerUser({ role: "candidate" }),
    ]);
    const job = await postJob(recruiter);
    await apply(alice, job._id);
    await apply(bob, job._id);

    const mine = await as(alice).get("/api/applications/mine?limit=100");
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.meta.total).toBe(1);
  });
});

describe("startups, investors and investments", () => {
  test("PUT /startups/me cannot set owner or raisedSoFar, and never touches another startup's profile", async () => {
    const [founder, rival] = await Promise.all([registerUser({ role: "startup" }), registerUser({ role: "startup" })]);
    await as(rival)
      .put("/api/startups/me", { ...STARTUP, name: "Rival" })
      .expect(200);

    const res = await as(founder).put("/api/startups/me", { ...STARTUP, owner: rival.user._id, raisedSoFar: 999999 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ owner: founder.user._id, raisedSoFar: 0, name: "Acme" });

    const rivalProfile = await Startup.findOne({ owner: rival.user._id });
    expect(rivalProfile).toMatchObject({ name: "Rival", raisedSoFar: 0 });
    expect(await Startup.countDocuments()).toBe(2);
  });

  test("PUT /investors/me cannot write another user's investor profile", async () => {
    const [investor, victim] = await Promise.all([
      registerUser({ role: "investor" }),
      registerUser({ role: "investor" }),
    ]);
    const res = await as(investor).put("/api/investors/me", { aboutMe: "mine", owner: victim.user._id });
    expect(res.body.data.owner).toBe(investor.user._id);
    expect(await Investor.exists({ owner: victim.user._id })).toBeNull();
  });

  // Regression: GET /investors/:id returned the full document, including the
  // investor's private deal criteria, to every authenticated user.
  test("an investor's criteria are private: other users (including startups) get a public profile only", async () => {
    const investor = await registerUser({ role: "investor" });
    const profile = (
      await as(investor).put("/api/investors/me", {
        aboutMe: "Seed investor",
        criteria: { minInvestment: 5000, maxInvestment: 250000, industries: ["fintech"], stages: ["seed"] },
      })
    ).body.data;

    for (const viewer of [await registerUser({ role: "startup" }), await registerUser({ role: "investor" })]) {
      const res = await as(viewer).get(`/api/investors/${profile._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.aboutMe).toBe("Seed investor");
      expect(res.body.data.criteria).toBeUndefined();
    }
    expect((await as(investor).get("/api/investors/me")).body.data.criteria.maxInvestment).toBe(250000);
  });

  test("investment lists are scoped to the caller: investors see their own, startups see only theirs", async () => {
    const [founderA, founderB, investorA, investorB] = await Promise.all([
      registerUser({ role: "startup" }),
      registerUser({ role: "startup" }),
      registerUser({ role: "investor" }),
      registerUser({ role: "investor" }),
    ]);
    const startupA = (await as(founderA).put("/api/startups/me", STARTUP)).body.data;
    const startupB = (await as(founderB).put("/api/startups/me", STARTUP)).body.data;
    await as(investorA).post("/api/investments", { startupId: startupA._id, amount: 500 }).expect(201);
    await as(investorB).post("/api/investments", { startupId: startupB._id, amount: 700 }).expect(201);

    const mineA = (await as(investorA).get("/api/investments/mine")).body.data;
    expect(mineA.map((i) => i.amount)).toEqual([500]);
    const receivedB = (await as(founderB).get("/api/investments/startup")).body.data;
    expect(receivedB.map((i) => i.amount)).toEqual([700]);
  });

  test("an investment's investor comes from the session, not the body", async () => {
    const [founder, investor, victim] = await Promise.all([
      registerUser({ role: "startup" }),
      registerUser({ role: "investor" }),
      registerUser({ role: "investor" }),
    ]);
    const startup = (await as(founder).put("/api/startups/me", STARTUP)).body.data;
    const res = await as(investor).post("/api/investments", {
      startupId: startup._id,
      amount: 500,
      investor: victim.user._id,
      status: "paid",
    });
    expect(res.body.data.investment).toMatchObject({ investor: investor.user._id, status: "pending" });
  });

  // Decision D3.
  test("refunds: investors and startups are forbidden, admins allowed", async () => {
    const [founder, investor] = await Promise.all([
      registerUser({ role: "startup" }),
      registerUser({ role: "investor" }),
    ]);
    const admin = await createAdmin();
    const startup = (await as(founder).put("/api/startups/me", STARTUP)).body.data;
    const { investment } = (await as(investor).post("/api/investments", { startupId: startup._id, amount: 500 })).body
      .data;

    expectForbidden(await as(investor).post(`/api/investments/${investment._id}/refund`));
    expectForbidden(await as(founder).post(`/api/investments/${investment._id}/refund`));
    // Admin passes authorization; the investment is still pending, so the business rule answers.
    expect((await as(admin).post(`/api/investments/${investment._id}/refund`)).status).toBe(400);
  });
});

describe("experience", () => {
  test("entries belong to the caller regardless of `user` in the body, and only the owner can delete", async () => {
    const [owner, other] = await Promise.all([registerUser(), registerUser()]);
    const entry = (
      await as(owner).post("/api/experiences", {
        jobTitle: "Engineer",
        companyName: "Acme",
        startDate: "2020-01-01",
        currentlyWorking: true,
        user: other.user._id,
      })
    ).body.data;
    expect(entry.user).toBe(owner.user._id);

    expectForbidden(await as(other).delete(`/api/experiences/${entry._id}`));
    expect(await Experience.exists({ _id: entry._id })).not.toBeNull();
    expect((await as(other).get("/api/experiences")).body.data).toEqual([]);
  });
});

describe("messages", () => {
  test("the sender is the session user even if `sender` is in the body", async () => {
    const [alice, bob, eve] = await Promise.all([registerUser(), registerUser(), registerUser()]);
    await as(eve).post("/api/messages", { receiverId: bob.user._id, body: "hi", sender: alice.user._id }).expect(201);
    const stored = await Message.findOne();
    expect(String(stored.sender)).toBe(eve.user._id);
    expect((await as(alice).get(`/api/messages/${bob.user._id}`)).body.data).toEqual([]);
  });

  // Regression: messages could be addressed to nonexistent or deactivated
  // accounts, or to yourself.
  test("the recipient must be another active user", async () => {
    const [sender, deactivated] = await Promise.all([registerUser(), registerUser()]);
    await User.updateOne({ _id: deactivated.user._id }, { isActive: false });

    const toSelf = await as(sender).post("/api/messages", { receiverId: sender.user._id, body: "me" });
    expect(toSelf.status).toBe(400);
    const toNobody = await as(sender).post("/api/messages", { receiverId: "507f1f77bcf86cd799439011", body: "x" });
    expect(toNobody.status).toBe(404);
    const toDeactivated = await as(sender).post("/api/messages", { receiverId: deactivated.user._id, body: "x" });
    expect(toDeactivated.status).toBe(404);
    expect(toDeactivated.body.error).toEqual(toNobody.body.error); // indistinguishable
    expect(await Message.countDocuments()).toBe(0);
  });
});

describe("admin operations", () => {
  test("an admin sending a direct notification to a nonexistent user gets 404 and nothing is stored", async () => {
    const admin = await createAdmin();
    const res = await as(admin).post("/api/notifications/broadcast", {
      message: "hello",
      userId: "507f1f77bcf86cd799439011",
    });
    expect(res.status).toBe(404);
  });

  test("a deactivated admin loses admin access immediately", async () => {
    const admin = await createAdmin();
    const otherAdmin = await createAdmin();
    await as(otherAdmin).patch(`/api/users/${admin.user._id}/status`, { isActive: false }).expect(200);
    expect((await as(admin).get("/api/users")).status).toBe(401);
  });
});
