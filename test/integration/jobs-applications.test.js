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
    const res = await request(app).post("/api/jobs").set("Authorization", `Bearer ${accessToken}`).send(validJob);
    expect(res.status).toBe(403);
  });

  test("recruiter can create and then publicly list/get the job", async () => {
    const { accessToken } = await registerUser({ role: "recruiter" });
    const createRes = await request(app).post("/api/jobs").set("Authorization", `Bearer ${accessToken}`).send(validJob);
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get("/api/jobs");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThan(0);

    const jobId = createRes.body.data._id;
    const getRes = await request(app).get(`/api/jobs/${jobId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.title).toBe(validJob.title);
  });

  test("maxSalary below minSalary is rejected by validation", async () => {
    const { accessToken } = await registerUser({ role: "recruiter" });
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validJob, minSalary: 2000, maxSalary: 1000 });
    expect(res.status).toBe(400);
  });

  test("a recruiter cannot update another recruiter's job", async () => {
    const owner = await registerUser({ role: "recruiter" });
    const intruder = await registerUser({ role: "recruiter" });
    const createRes = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(validJob);
    const jobId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/jobs/${jobId}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({ title: "Hijacked" });
    expect(res.status).toBe(403);
  });
});

describe("applications", () => {
  async function createOpenJob() {
    const recruiter = await registerUser({ role: "recruiter" });
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${recruiter.accessToken}`)
      .send(validJob);
    return { recruiter, jobId: res.body.data._id };
  }

  test("candidate without a CV and no resumeUrl cannot apply", async () => {
    const { jobId } = await createOpenJob();
    const candidate = await registerUser({ role: "candidate" });
    const res = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send({ coverLetter: "I would love this role, truly." });
    expect(res.status).toBe(400);
  });

  test("candidate can apply with an explicit resumeUrl, and duplicate application is rejected", async () => {
    const { jobId } = await createOpenJob();
    const candidate = await registerUser({ role: "candidate" });
    const body = { coverLetter: "I would love this role, truly.", resumeUrl: "https://example.com/cv.pdf" };

    const first = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe("submitted");

    const second = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send(body);
    expect(second.status).toBe(409);
  });

  test("only the owning recruiter can list applications for a job", async () => {
    const { recruiter, jobId } = await createOpenJob();
    const otherRecruiter = await registerUser({ role: "recruiter" });
    const candidate = await registerUser({ role: "candidate" });
    await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send({ coverLetter: "I would love this role, truly.", resumeUrl: "https://example.com/cv.pdf" });

    const forbidden = await request(app)
      .get(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${otherRecruiter.accessToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .get(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${recruiter.accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.length).toBe(1);
  });

  test("valid status transition succeeds, invalid transition is rejected", async () => {
    const { recruiter, jobId } = await createOpenJob();
    const candidate = await registerUser({ role: "candidate" });
    const applyRes = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${candidate.accessToken}`)
      .send({ coverLetter: "I would love this role, truly.", resumeUrl: "https://example.com/cv.pdf" });
    const applicationId = applyRes.body.data._id;

    const invalid = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${recruiter.accessToken}`)
      .send({ status: "accepted" }); // can't skip straight from submitted to accepted
    expect(invalid.status).toBe(400);

    const valid = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${recruiter.accessToken}`)
      .send({ status: "under_review" });
    expect(valid.status).toBe(200);
    expect(valid.body.data.status).toBe("under_review");
  });
});
