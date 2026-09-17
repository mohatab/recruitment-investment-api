const { app, request, registerUser } = require("../helpers");

function futureDate(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const validJob = {
  title: "Backend Engineer",
  role: "Software Engineer",
  description: "Build things",
  responsibilities: "Write code",
  minSalary: 1000,
  maxSalary: 2000,
  salaryType: "monthly",
  expirationDate: futureDate(),
};

describe("jobs", () => {
  test("candidate cannot create a job (403)", async () => {
    const { accessToken } = await registerUser({ role: "candidate" });
    const res = await request(app).post("/api/v1/jobs").set("Authorization", `Bearer ${accessToken}`).send(validJob);
    expect(res.status).toBe(403);
  });

  test("recruiter can create and then publicly list/get the job", async () => {
    const { accessToken } = await registerUser({ role: "recruiter" });
    const createRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validJob);
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get("/api/v1/jobs");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThan(0);

    const jobId = createRes.body.data._id;
    const getRes = await request(app).get(`/api/v1/jobs/${jobId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.title).toBe(validJob.title);
  });

  test("a regex-metacharacter search term is treated literally, not executed as a pattern (ReDoS guard)", async () => {
    const { accessToken } = await registerUser({ role: "recruiter" });
    await request(app).post("/api/v1/jobs").set("Authorization", `Bearer ${accessToken}`).send(validJob);

    const res = await request(app).get("/api/v1/jobs").query({ role: "(a+)+$" });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0); // no job literally titled "(a+)+$"
  });

  test("role filter matches case-insensitively", async () => {
    const { accessToken } = await registerUser({ role: "recruiter" });
    await request(app).post("/api/v1/jobs").set("Authorization", `Bearer ${accessToken}`).send(validJob);

    const res = await request(app).get("/api/v1/jobs").query({ role: "software engineer" });
    expect(res.status).toBe(200);
    expect(res.body.data.some((j) => j.title === validJob.title)).toBe(true);
  });

  test("maxSalary below minSalary is rejected by validation", async () => {
    const { accessToken } = await registerUser({ role: "recruiter" });
    const res = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validJob, minSalary: 2000, maxSalary: 1000 });
    expect(res.status).toBe(400);
  });

  test("a recruiter cannot update another recruiter's job", async () => {
    const owner = await registerUser({ role: "recruiter" });
    const intruder = await registerUser({ role: "recruiter" });
    const createRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(validJob);
    const jobId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({ title: "Hijacked" });
    expect(res.status).toBe(403);
  });

  test("the owning recruiter can update and then delete their own job", async () => {
    const owner = await registerUser({ role: "recruiter" });
    const createRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(validJob);
    const jobId = createRes.body.data._id;

    const updateRes = await request(app)
      .patch(`/api/v1/jobs/${jobId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "Updated Title", status: "closed" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.title).toBe("Updated Title");
    expect(updateRes.body.data.status).toBe("closed");

    const deleteRes = await request(app)
      .delete(`/api/v1/jobs/${jobId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(deleteRes.status).toBe(204);
    expect(deleteRes.body).toEqual({}); // 204 carries no body

    const getAfterDelete = await request(app).get(`/api/v1/jobs/${jobId}`);
    expect(getAfterDelete.status).toBe(404);
  });

  test("a recruiter cannot delete another recruiter's job", async () => {
    const owner = await registerUser({ role: "recruiter" });
    const intruder = await registerUser({ role: "recruiter" });
    const createRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(validJob);
    const jobId = createRes.body.data._id;

    const res = await request(app)
      .delete(`/api/v1/jobs/${jobId}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe("applications", () => {
  async function createOpenJob() {
    const recruiter = await registerUser({ role: "recruiter" });
    const res = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${recruiter.accessToken}`)
      .send(validJob);
    return { recruiter, jobId: res.body.data._id };
  }

  test("candidate without a CV and no resumeUrl cannot apply", async () => {
    const { jobId } = await createOpenJob();
    const candidate = await registerUser({ role: "candidate" });
    const res = await request(app)
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send({ coverLetter: "I would love this role, truly." });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("RESUME_REQUIRED");
  });

  test("candidate can apply with an explicit resumeUrl, and duplicate application is rejected", async () => {
    const { jobId } = await createOpenJob();
    const candidate = await registerUser({ role: "candidate" });
    const body = { coverLetter: "I would love this role, truly.", resumeUrl: "https://example.com/cv.pdf" };

    const first = await request(app)
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe("submitted");

    const second = await request(app)
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send(body);
    expect(second.status).toBe(409);
  });

  test("only the owning recruiter can list applications for a job", async () => {
    const { recruiter, jobId } = await createOpenJob();
    const otherRecruiter = await registerUser({ role: "recruiter" });
    const candidate = await registerUser({ role: "candidate" });
    await request(app)
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send({ coverLetter: "I would love this role, truly.", resumeUrl: "https://example.com/cv.pdf" });

    const forbidden = await request(app)
      .get(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${otherRecruiter.accessToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .get(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${recruiter.accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.length).toBe(1);
  });

  test("valid status transition succeeds, invalid transition is rejected", async () => {
    const { recruiter, jobId } = await createOpenJob();
    const candidate = await registerUser({ role: "candidate" });
    const applyRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send({ coverLetter: "I would love this role, truly.", resumeUrl: "https://example.com/cv.pdf" });
    const applicationId = applyRes.body.data._id;

    const invalid = await request(app)
      .patch(`/api/v1/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${recruiter.accessToken}`)
      .send({ status: "accepted" }); // can't skip straight from submitted to accepted
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const valid = await request(app)
      .patch(`/api/v1/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${recruiter.accessToken}`)
      .send({ status: "under_review" });
    expect(valid.status).toBe(200);
    expect(valid.body.data.status).toBe("under_review");
  });

  test("a candidate can list their own applications, scoped to only their own", async () => {
    const { jobId } = await createOpenJob();
    const candidateA = await registerUser({ role: "candidate" });
    const candidateB = await registerUser({ role: "candidate" });
    const body = { coverLetter: "I would love this role, truly.", resumeUrl: "https://example.com/cv.pdf" };

    await request(app)
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidateA.accessToken}`)
      .send(body);

    const mineA = await request(app)
      .get("/api/v1/applications/mine")
      .set("Authorization", `Bearer ${candidateA.accessToken}`);
    expect(mineA.status).toBe(200);
    expect(mineA.body.data.length).toBe(1);

    const mineB = await request(app)
      .get("/api/v1/applications/mine")
      .set("Authorization", `Bearer ${candidateB.accessToken}`);
    expect(mineB.status).toBe(200);
    expect(mineB.body.data.length).toBe(0);
  });
});
