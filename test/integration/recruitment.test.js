// Recruitment domain rules: job lifecycle, expiry, salary consistency,
// deletion safety, and the application pipeline (duplicates, transitions,
// concurrency). Cross-user authorization for these resources is covered in
// authorization-ownership.test.js.
const { app, request, registerUser } = require("../helpers");
const Job = require("../../src/modules/recruitment/jobs/job.model");
const Application = require("../../src/modules/recruitment/applications/application.model");
const env = require("../../src/config/env");

const as = (who) => ({ Authorization: `Bearer ${who.accessToken}` });
const future = (days = 30) => new Date(Date.now() + days * 864e5).toISOString();

const JOB = {
  title: "Backend Engineer",
  role: "Engineering",
  description: "Build and run the API",
  responsibilities: "Ship features, review code",
  minSalary: 1000,
  maxSalary: 2000,
  salaryType: "monthly",
  expirationDate: future(),
};
const COVER_LETTER = "I would really like to join this team";
const RESUME = "https://example.com/cv.pdf";

const postJob = async (recruiter, overrides = {}) => {
  const res = await request(app)
    .post("/api/v1/jobs")
    .set(as(recruiter))
    .send({ ...JOB, ...overrides });
  expect(res.status).toBe(201);
  return res.body.data;
};

const applyTo = (candidate, jobId, body = {}) =>
  request(app)
    .post(`/api/v1/jobs/${jobId}/applications`)
    .set(as(candidate))
    .send({ coverLetter: COVER_LETTER, resumeUrl: RESUME, ...body });

const expire = (jobId) => Job.updateOne({ _id: jobId }, { expirationDate: new Date(Date.now() - 1000) });

let recruiter;
let candidate;
beforeEach(async () => {
  [recruiter, candidate] = await Promise.all([
    registerUser({ role: "recruiter" }),
    registerUser({ role: "candidate" }),
  ]);
});

describe("job creation and validation", () => {
  test("a posted job belongs to its recruiter, starts open and is not expired", async () => {
    const job = await postJob(recruiter);
    expect(job).toMatchObject({ recruiter: recruiter.user._id, status: "open", isExpired: false, vacancies: 1 });
  });

  test.each([
    ["maxSalary below minSalary", { minSalary: 5000, maxSalary: 1000 }],
    ["an expiration date in the past", { expirationDate: new Date(Date.now() - 864e5).toISOString() }],
    ["a negative salary", { minSalary: -1 }],
    ["a too-short title", { title: "x" }],
    ["more tags than allowed", { tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) }],
    ["an external application method with nowhere to apply", { applyMethod: "external" }],
    ["an external application method with an empty link", { applyMethod: "external", applyLink: "" }],
    ["a non-http apply link", { applyMethod: "external", applyLink: "javascript:alert(1)" }],
  ])("rejects %s", async (_, overrides) => {
    const res = await request(app)
      .post("/api/v1/jobs")
      .set(as(recruiter))
      .send({ ...JOB, ...overrides });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("accepts an external posting that says where to apply, and normalizes tags", async () => {
    const job = await postJob(recruiter, {
      applyMethod: "external",
      applyEmail: "Jobs@Example.com",
      tags: [" Node.JS ", "API"],
    });
    expect(job.applyEmail).toBe("jobs@example.com");
    expect(job.tags).toEqual(["node.js", "api"]);
  });
});

describe("job updates", () => {
  // Regression: `maxSalary` carried a Joi reference to `minSalary`, so any
  // partial update touching only one of them was rejected outright.
  test("a partial update may raise the ceiling or the floor on its own", async () => {
    const job = await postJob(recruiter);
    const raise = await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({ maxSalary: 3000 });
    expect(raise.status).toBe(200);
    expect(raise.body.data.maxSalary).toBe(3000);

    const floor = await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({ minSalary: 2500 });
    expect(floor.status).toBe(200);
  });

  // Regression: the merged document was never validated, so a partial update
  // could leave minSalary above maxSalary.
  test("a partial update cannot leave the salary range contradictory", async () => {
    const job = await postJob(recruiter);
    const res = await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({ minSalary: 99999 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("maxSalary");
    expect((await Job.findById(job._id)).minSalary).toBe(1000);
  });

  test("a partial update cannot strip the apply target from an external posting", async () => {
    const job = await postJob(recruiter, { applyMethod: "external", applyEmail: "jobs@example.com" });
    const res = await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({ applyEmail: "" });
    expect(res.status).toBe(400);
  });

  test("an empty update body is rejected", async () => {
    const job = await postJob(recruiter);
    expect((await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({})).status).toBe(400);
  });
});

describe("job status transitions", () => {
  test("open -> closed stops applications; the job is still readable by id", async () => {
    const job = await postJob(recruiter);
    await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({ status: "closed" }).expect(200);

    const res = await applyTo(candidate, job._id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("JOB_CLOSED");
    expect((await request(app).get(`/api/v1/jobs/${job._id}`)).status).toBe(200);
  });

  test("closed -> open is allowed while the posting still has time left", async () => {
    const job = await postJob(recruiter);
    const patch = (status, extra) =>
      request(app)
        .patch(`/api/v1/jobs/${job._id}`)
        .set(as(recruiter))
        .send({ status, ...extra });

    await patch("closed").expect(200);
    expect((await patch("open")).body.data.status).toBe("open");
    expect((await applyTo(candidate, job._id)).status).toBe(201);
  });

  // Regression: a closed, expired job could be reopened and would then sit in
  // the listings claiming to accept applications it would refuse.
  test("a closed, expired job cannot be reopened without a new expiration date", async () => {
    const job = await postJob(recruiter);
    await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({ status: "closed" }).expect(200);
    await expire(job._id);

    const res = await request(app).patch(`/api/v1/jobs/${job._id}`).set(as(recruiter)).send({ status: "open" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("JOB_EXPIRED");
    expect((await Job.findById(job._id)).status).toBe("closed");

    const reopened = await request(app)
      .patch(`/api/v1/jobs/${job._id}`)
      .set(as(recruiter))
      .send({ status: "open", expirationDate: future(10) });
    expect(reopened.status).toBe(200);
  });
});

describe("expired jobs", () => {
  // Regression: expiry was stored but never enforced — expired jobs stayed in
  // the public list and still accepted applications.
  test("are hidden from the public list and refuse applications", async () => {
    const job = await postJob(recruiter);
    await expire(job._id);

    const listed = await request(app).get("/api/v1/jobs?limit=100");
    expect(listed.body.data.map((j) => j._id)).not.toContain(job._id);

    const res = await applyTo(candidate, job._id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("JOB_EXPIRED");
  });

  test("are still visible to their recruiter via /jobs/mine, flagged as expired", async () => {
    const [live, stale] = [await postJob(recruiter), await postJob(recruiter, { title: "Expired Role" })];
    await expire(stale._id);

    const mine = await request(app).get("/api/v1/jobs/mine?limit=100").set(as(recruiter));
    expect(mine.status).toBe(200);
    const byId = Object.fromEntries(mine.body.data.map((j) => [j._id, j]));
    expect(Object.keys(byId).sort()).toEqual([live._id, stale._id].sort());
    expect(byId[stale._id].isExpired).toBe(true);
    expect(byId[live._id].isExpired).toBe(false);
  });

  test("/jobs/mine shows only the caller's jobs, including closed ones", async () => {
    const other = await registerUser({ role: "recruiter" });
    const mine = await postJob(recruiter);
    await postJob(other, { title: "Someone else's" });
    await request(app).patch(`/api/v1/jobs/${mine._id}`).set(as(recruiter)).send({ status: "closed" }).expect(200);

    const res = await request(app).get("/api/v1/jobs/mine?status=closed").set(as(recruiter));
    expect(res.body.data.map((j) => j._id)).toEqual([mine._id]);
    expect(res.body.pagination.total).toBe(1);
  });

  test("candidates cannot use /jobs/mine", async () => {
    expect((await request(app).get("/api/v1/jobs/mine").set(as(candidate))).status).toBe(403);
  });
});

describe("job deletion", () => {
  test("a job with no applications can be deleted", async () => {
    const job = await postJob(recruiter);
    expect((await request(app).delete(`/api/v1/jobs/${job._id}`).set(as(recruiter))).status).toBe(204);
    expect(await Job.findById(job._id)).toBeNull();
  });

  // Regression: deleting a job left its applications pointing at nothing, so
  // candidates saw `job: null` in their own application list.
  test("a job with applications is refused (409) so candidates keep their history", async () => {
    const job = await postJob(recruiter);
    await applyTo(candidate, job._id).expect(201);

    const res = await request(app).delete(`/api/v1/jobs/${job._id}`).set(as(recruiter));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("JOB_HAS_APPLICATIONS");
    expect(await Job.findById(job._id)).not.toBeNull();

    const mine = await request(app).get("/api/v1/applications/mine").set(as(candidate));
    expect(mine.body.data[0].job).toMatchObject({ _id: job._id, title: JOB.title });
  });
});

describe("applying to a job", () => {
  test("the applicant, job and status come from the server", async () => {
    const job = await postJob(recruiter);
    const res = await applyTo(candidate, job._id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ applicant: candidate.user._id, job: job._id, status: "submitted" });
  });

  test("a second application to the same job is a 409", async () => {
    const job = await postJob(recruiter);
    await applyTo(candidate, job._id).expect(201);
    const again = await applyTo(candidate, job._id);
    expect(again.status).toBe(409);
    expect(await Application.countDocuments({ job: job._id })).toBe(1);
  });

  // The unique index is what actually holds here: a check-then-insert would
  // let both requests through.
  test("concurrent duplicate submissions create exactly one application", async () => {
    const job = await postJob(recruiter);
    const results = await Promise.all(Array.from({ length: 5 }, () => applyTo(candidate, job._id)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await Application.countDocuments({ job: job._id, applicant: candidate.user._id })).toBe(1);
  });

  test("different candidates may apply to the same job", async () => {
    const job = await postJob(recruiter);
    const other = await registerUser({ role: "candidate" });
    await applyTo(candidate, job._id).expect(201);
    await applyTo(other, job._id).expect(201);
    expect(await Application.countDocuments({ job: job._id })).toBe(2);
  });

  test("falls back to the applicant's stored CV, and refuses when there is none", async () => {
    const job = await postJob(recruiter);
    const noCv = await applyTo(candidate, job._id, { resumeUrl: undefined });
    expect(noCv.status).toBe(422);
    expect(noCv.body.error.code).toBe("RESUME_REQUIRED");

    const upload = await request(app)
      .post("/api/v1/users/me/cv")
      .set(as(candidate))
      .attach("cv", Buffer.from("%PDF-1.4 cv"), { filename: "cv.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(200);

    const withCv = await applyTo(candidate, job._id, { resumeUrl: undefined });
    expect(withCv.status).toBe(201);
    // The stored CV is referenced by its authorized download route, not by a
    // public file URL.
    expect(withCv.body.data.resumeUrl).toBe(`${env.baseUrl}/api/v1/users/${candidate.user._id}/cv`);
  });

  // Regression: a `javascript:` resumeUrl was stored and later handed to the
  // recruiter's browser.
  test.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "ftp://example.com/cv.pdf"])(
    "rejects a %s resume url",
    async (resumeUrl) => {
      const job = await postJob(recruiter);
      const res = await applyTo(candidate, job._id, { resumeUrl });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  );

  test("applying to a job that does not exist is a 404", async () => {
    expect((await applyTo(candidate, "507f1f77bcf86cd799439011")).status).toBe(404);
  });

  test("a failing notification does not undo a successful application", async () => {
    const notifications = require("../../src/modules/notifications/notification.service");
    const logger = require("../../src/common/utils/logger");
    jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(notifications, "notifyUser").mockRejectedValueOnce(new Error("socket registry down"));

    const job = await postJob(recruiter);
    const res = await applyTo(candidate, job._id);
    expect(res.status).toBe(201);
    expect(await Application.countDocuments({ job: job._id })).toBe(1);
    jest.restoreAllMocks();
  });
});

describe("application pipeline", () => {
  let job;
  let application;
  beforeEach(async () => {
    job = await postJob(recruiter);
    application = (await applyTo(candidate, job._id)).body.data;
  });

  const move = (who, status) =>
    request(app).patch(`/api/v1/applications/${application._id}/status`).set(as(who)).send({ status });

  test("walks the full pipeline in order", async () => {
    for (const status of ["under_review", "shortlisted", "interview", "accepted"]) {
      const res = await move(recruiter, status);
      expect({ status, http: res.status, applicationStatus: res.body.data?.status }).toEqual({
        status,
        http: 200,
        applicationStatus: status,
      });
    }
  });

  test.each([
    ["submitted", "accepted"],
    ["submitted", "shortlisted"],
    ["submitted", "submitted"],
  ])("refuses to skip from %s to %s", async (_, target) => {
    const res = await move(recruiter, target);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect((await Application.findById(application._id)).status).toBe("submitted");
  });

  test("rejected and accepted are terminal", async () => {
    await move(recruiter, "rejected").expect(200);
    for (const status of ["under_review", "accepted"]) {
      expect((await move(recruiter, status)).status).toBe(422);
    }
  });

  test("an unknown status value is a validation error", async () => {
    expect((await move(recruiter, "hired")).status).toBe(400);
  });

  // Regression: read-then-write meant two recruiters (or two tabs) could both
  // move the same application from `submitted`, and the last write won.
  test("concurrent transitions from the same state: one wins, the other is a 409", async () => {
    const [first, second] = await Promise.all([move(recruiter, "under_review"), move(recruiter, "rejected")]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = [first, second].find((r) => r.status === 409);
    expect(conflict.body.error.code).toBe("APPLICATION_STATUS_CONFLICT");

    const winner = [first, second].find((r) => r.status === 200);
    expect((await Application.findById(application._id)).status).toBe(winner.body.data.status);
  });

  test("the owning recruiter sees the applicant's contact details; the candidate sees the job", async () => {
    const forJob = await request(app).get(`/api/v1/jobs/${job._id}/applications`).set(as(recruiter));
    expect(forJob.body.data[0].applicant).toMatchObject({
      _id: candidate.user._id,
      firstName: candidate.user.firstName,
      email: candidate.user.email,
    });

    const mine = await request(app).get("/api/v1/applications/mine").set(as(candidate));
    expect(mine.body.data[0].job).toMatchObject({ _id: job._id, title: JOB.title, status: "open" });
    // A candidate's own view must not expose other applicants.
    expect(JSON.stringify(mine.body.data)).not.toContain(recruiter.user.email);
  });

  test("applications can be filtered by status on both list endpoints", async () => {
    const other = await registerUser({ role: "candidate" });
    await applyTo(other, job._id).expect(201);
    await move(recruiter, "under_review").expect(200);

    const filtered = await request(app)
      .get(`/api/v1/jobs/${job._id}/applications?status=under_review`)
      .set(as(recruiter));
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.pagination.total).toBe(1);

    const mine = await request(app).get("/api/v1/applications/mine?status=submitted").set(as(candidate));
    expect(mine.body.data).toHaveLength(0);
  });

  test("an unknown status filter is rejected", async () => {
    expect((await request(app).get("/api/v1/applications/mine?status=hired").set(as(candidate))).status).toBe(400);
  });
});

describe("database constraints", () => {
  test("the unique index rejects a duplicate application written directly", async () => {
    const job = await postJob(recruiter);
    await Application.create({
      job: job._id,
      applicant: candidate.user._id,
      coverLetter: COVER_LETTER,
      resumeUrl: RESUME,
    });
    await Application.init(); // the unique index is the thing under test
    await expect(
      Application.create({ job: job._id, applicant: candidate.user._id, coverLetter: COVER_LETTER, resumeUrl: RESUME })
    ).rejects.toMatchObject({ code: 11000 });
  });

  test("the model refuses a salary range it cannot honour", async () => {
    await expect(
      Job.create({ ...JOB, recruiter: recruiter.user._id, minSalary: 5000, maxSalary: 10, expirationDate: future() })
    ).rejects.toThrow(/maxSalary/);
  });

  test("the indexes the list endpoints rely on exist", async () => {
    await Promise.all([Job.init(), Application.init()]); // wait for the background index build
    const jobIndexes = (await Job.collection.indexes()).map((i) => JSON.stringify(i.key));
    expect(jobIndexes).toEqual(
      expect.arrayContaining([
        JSON.stringify({ status: 1, createdAt: -1 }),
        JSON.stringify({ recruiter: 1, createdAt: -1 }),
      ])
    );

    const applicationIndexes = await Application.collection.indexes();
    const unique = applicationIndexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ job: 1, applicant: 1 }));
    expect(unique.unique).toBe(true);
    expect(applicationIndexes.map((i) => JSON.stringify(i.key))).toEqual(
      expect.arrayContaining([
        JSON.stringify({ job: 1, createdAt: -1 }),
        JSON.stringify({ applicant: 1, createdAt: -1 }),
      ])
    );
  });
});

// The status change loads the posting only to authorize the recruiter and to
// name the job in the notification, so it projects just those two fields.
// This is what proves the projection still carries everything that is used.
describe("application status notifications", () => {
  test("the candidate is told which posting moved, by title", async () => {
    const job = await postJob(recruiter, { title: "Platform Engineer" });
    const applied = await applyTo(candidate, job._id);
    expect(applied.status).toBe(201);

    const moved = await request(app)
      .patch(`/api/v1/applications/${applied.body.data._id}/status`)
      .set(as(recruiter))
      .send({ status: "under_review" });
    expect(moved.status).toBe(200);

    const notifications = await request(app).get("/api/v1/notifications").set(as(candidate));
    expect(notifications.status).toBe(200);
    expect(notifications.body.data[0].message).toBe('Your application for "Platform Engineer" is now "under_review"');
  });
});
