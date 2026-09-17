const { app, request, registerUser } = require("../helpers");

const validExperience = {
  jobTitle: "Software Engineer",
  companyName: "Acme Corp",
  startDate: "2020-01-01",
  currentlyWorking: true,
};

describe("experience", () => {
  test("requires authentication", async () => {
    const res = await request(app).post("/api/v1/experiences").send(validExperience);
    expect(res.status).toBe(401);
  });

  test("creates an experience entry for the current user", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/v1/experiences")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validExperience);
    expect(res.status).toBe(201);
    expect(res.body.data.jobTitle).toBe(validExperience.jobTitle);
  });

  test("endDate is required unless currentlyWorking is true", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/v1/experiences")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validExperience, currentlyWorking: false });
    expect(res.status).toBe(400);
  });

  test("lists only the current user's own experience entries", async () => {
    const userA = await registerUser();
    const userB = await registerUser();
    await request(app)
      .post("/api/v1/experiences")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send(validExperience);

    const listA = await request(app).get("/api/v1/experiences").set("Authorization", `Bearer ${userA.accessToken}`);
    expect(listA.body.data.length).toBe(1);

    const listB = await request(app).get("/api/v1/experiences").set("Authorization", `Bearer ${userB.accessToken}`);
    expect(listB.body.data.length).toBe(0);
  });

  test("only the owner can delete their experience entry", async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const createRes = await request(app)
      .post("/api/v1/experiences")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(validExperience);
    const id = createRes.body.data._id;

    const forbidden = await request(app)
      .delete(`/api/v1/experiences/${id}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .delete(`/api/v1/experiences/${id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(allowed.status).toBe(204);
  });
});
