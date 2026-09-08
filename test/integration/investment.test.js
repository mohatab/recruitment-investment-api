const { app, request, registerUser } = require("../helpers");

const validStartup = {
  name: "Acme AI",
  description: "We do AI things",
  totalRaising: 100000,
  minInvestment: 1000,
  industries: ["software"],
  stage: "seed",
};

describe("startup profiles", () => {
  test("non-startup role cannot create a startup profile", async () => {
    const { accessToken } = await registerUser({ role: "candidate" });
    const res = await request(app)
      .put("/api/startups/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validStartup);
    expect(res.status).toBe(403);
  });

  test("startup role can create and fetch their own profile, publicly visible by id", async () => {
    const { accessToken } = await registerUser({ role: "startup" });
    const putRes = await request(app)
      .put("/api/startups/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validStartup);
    expect(putRes.status).toBe(200);

    const getMine = await request(app).get("/api/startups/me").set("Authorization", `Bearer ${accessToken}`);
    expect(getMine.status).toBe(200);
    expect(getMine.body.data.name).toBe(validStartup.name);

    const publicGet = await request(app).get(`/api/startups/${putRes.body.data._id}`);
    expect(publicGet.status).toBe(200);
  });
});

describe("investor profiles and matching", () => {
  test("investor can save criteria and see matching startups", async () => {
    const startupOwner = await registerUser({ role: "startup" });
    await request(app)
      .put("/api/startups/me")
      .set("Authorization", `Bearer ${startupOwner.accessToken}`)
      .send(validStartup);

    const investor = await registerUser({ role: "investor" });
    const criteriaRes = await request(app)
      .put("/api/investors/me")
      .set("Authorization", `Bearer ${investor.accessToken}`)
      .send({ criteria: { minInvestment: 500, maxInvestment: 5000, industries: ["software"], stages: ["seed"] } });
    expect(criteriaRes.status).toBe(200);

    const matches = await request(app)
      .get("/api/startups/matches")
      .set("Authorization", `Bearer ${investor.accessToken}`);
    expect(matches.status).toBe(200);
    expect(matches.body.data.length).toBe(1);
    expect(matches.body.data[0].name).toBe(validStartup.name);
  });

  test("investor without saved criteria gets 404 from matches", async () => {
    const { accessToken } = await registerUser({ role: "investor" });
    const res = await request(app).get("/api/startups/matches").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe("success assessment (public heuristic endpoint)", () => {
  test("returns a rule-based prediction without requiring auth", async () => {
    const res = await request(app)
      .post("/api/startups/success-assessment")
      .send({ isSoftwareBased: true, hasAdCampaigns: false, hasConsulting: false, totalFunding: 600000 });
    expect(res.status).toBe(200);
    expect(res.body.data.method).toBe("rule_based_heuristic");
  });
});
