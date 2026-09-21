const { app, request, registerUser } = require("../helpers");

const validStartup = {
  name: "Acme AI",
  description: "We do AI things",
  totalRaisingCents: 10000000,
  minInvestmentCents: 100000,
  industries: ["software"],
  stage: "seed",
};

describe("startup profiles", () => {
  test("non-startup role cannot create a startup profile", async () => {
    const { accessToken } = await registerUser({ role: "candidate" });
    const res = await request(app)
      .put("/api/v1/startups/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validStartup);
    expect(res.status).toBe(403);
  });

  test("startup role can create and fetch their own profile, publicly visible by id", async () => {
    const { accessToken } = await registerUser({ role: "startup" });
    const putRes = await request(app)
      .put("/api/v1/startups/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validStartup);
    expect(putRes.status).toBe(201); // first PUT creates the profile

    const getMine = await request(app).get("/api/v1/startups/me").set("Authorization", `Bearer ${accessToken}`);
    expect(getMine.status).toBe(200);
    expect(getMine.body.data.name).toBe(validStartup.name);

    const publicGet = await request(app).get(`/api/v1/startups/${putRes.body.data._id}`);
    expect(publicGet.status).toBe(200);
  });

  test("GET /api/startups lists/browses startups publicly, filterable by industry and stage", async () => {
    const { accessToken } = await registerUser({ role: "startup" });
    await request(app).put("/api/v1/startups/me").set("Authorization", `Bearer ${accessToken}`).send(validStartup);

    const all = await request(app).get("/api/v1/startups");
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBeGreaterThan(0);

    const filtered = await request(app).get("/api/v1/startups").query({ industry: "software", stage: "seed" });
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.some((s) => s.name === validStartup.name)).toBe(true);

    const noMatch = await request(app).get("/api/v1/startups").query({ stage: "growth" });
    expect(noMatch.body.data.some((s) => s.name === validStartup.name)).toBe(false);
  });
});

describe("investor profiles and matching", () => {
  test("investor can save criteria and see matching startups", async () => {
    const startupOwner = await registerUser({ role: "startup" });
    await request(app)
      .put("/api/v1/startups/me")
      .set("Authorization", `Bearer ${startupOwner.accessToken}`)
      .send(validStartup);

    const investor = await registerUser({ role: "investor" });
    const criteriaRes = await request(app)
      .put("/api/v1/investors/me")
      .set("Authorization", `Bearer ${investor.accessToken}`)
      .send({
        criteria: { minInvestmentCents: 50000, maxInvestmentCents: 500000, industries: ["software"], stages: ["seed"] },
      });
    expect(criteriaRes.status).toBe(201);

    const matches = await request(app)
      .get("/api/v1/startups/matches")
      .set("Authorization", `Bearer ${investor.accessToken}`);
    expect(matches.status).toBe(200);
    expect(matches.body.data.length).toBe(1);
    expect(matches.body.data[0].name).toBe(validStartup.name);
  });

  test("investor without saved criteria gets 404 from matches", async () => {
    const { accessToken } = await registerUser({ role: "investor" });
    const res = await request(app).get("/api/v1/startups/matches").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  test("GET /api/investors/me and /api/investors/:id return the saved profile", async () => {
    const investor = await registerUser({ role: "investor" });
    await request(app)
      .put("/api/v1/investors/me")
      .set("Authorization", `Bearer ${investor.accessToken}`)
      .send({ aboutMe: "I invest in software", criteria: { minInvestmentCents: 10000 } });

    const mine = await request(app).get("/api/v1/investors/me").set("Authorization", `Bearer ${investor.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.aboutMe).toBe("I invest in software");

    const other = await registerUser({ role: "candidate" });
    const byId = await request(app)
      .get(`/api/v1/investors/${mine.body.data._id}`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.aboutMe).toBe("I invest in software");
  });

  test("GET /api/investors/me returns 404 before any criteria has been saved", async () => {
    const { accessToken } = await registerUser({ role: "investor" });
    const res = await request(app).get("/api/v1/investors/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe("success assessment (public heuristic endpoint)", () => {
  test("returns a rule-based prediction without requiring auth", async () => {
    const res = await request(app)
      .post("/api/v1/startups/success-assessment")
      .send({ isSoftwareBased: true, hasAdCampaigns: false, hasConsulting: false, totalFunding: 600000 });
    expect(res.status).toBe(200);
    expect(res.body.data.method).toBe("rule_based_heuristic");
  });
});

// The profile endpoints report "created" from the upsert's own result rather
// than from a separate exists() probe. These pin the distinction that result
// drives, in both directions.
describe("profile upserts report creation from the write itself", () => {
  const validStartupProfile = {
    name: "Upsert Labs",
    description: "We test upserts",
    totalRaisingCents: 1_000_000_00,
    minInvestmentCents: 1_000_00,
    industries: ["saas"],
    stage: "seed",
  };

  test("the first PUT creates (201) and the second updates in place (200)", async () => {
    const { accessToken, user } = await registerUser({ role: "startup" });
    const put = (body) =>
      request(app).put("/api/v1/startups/me").set("Authorization", `Bearer ${accessToken}`).send(body);

    const created = await put(validStartupProfile);
    expect(created.status).toBe(201);

    const updated = await put({ ...validStartupProfile, name: "Upsert Labs II" });
    expect(updated.status).toBe(200);
    expect(updated.body.data._id).toBe(created.body.data._id); // same document
    expect(updated.body.data.name).toBe("Upsert Labs II");
    expect(updated.body.data.owner).toBe(user._id);

    // And still exactly one profile for this owner.
    const Startup = require("../../src/modules/investment/startups/startup.model");
    expect(await Startup.countDocuments({ owner: user._id })).toBe(1);
  });

  test("the same holds for investor criteria", async () => {
    const { accessToken } = await registerUser({ role: "investor" });
    const put = (body) =>
      request(app).put("/api/v1/investors/me").set("Authorization", `Bearer ${accessToken}`).send(body);

    const criteria = {
      criteria: { minInvestmentCents: 1_000_00, maxInvestmentCents: 10_000_00, industries: ["saas"] },
    };
    expect((await put(criteria)).status).toBe(201);
    const second = await put({ criteria: { ...criteria.criteria, industries: ["fintech"] } });
    expect(second.status).toBe(200);
    expect(second.body.data.criteria.industries).toEqual(["fintech"]);
  });
});

describe("concurrent profile upserts", () => {
  test("simultaneous first saves create exactly one startup profile", async () => {
    const owner = await registerUser({ role: "startup" });
    const put = () =>
      request(app)
        .put("/api/v1/startups/me")
        .set({ Authorization: `Bearer ${owner.accessToken}` })
        .send(validStartup);

    const results = await Promise.all([put(), put(), put()]);
    // The owner index is unique, so a losing writer must surface as a
    // controlled response, never as a second profile or a 500.
    expect(results.every((r) => [200, 201, 409].includes(r.status))).toBe(true);

    const Startup = require("../../src/modules/investment/startups/startup.model");
    expect(await Startup.countDocuments({ owner: owner.user._id })).toBe(1);

    const mine = await request(app)
      .get("/api/v1/startups/me")
      .set({ Authorization: `Bearer ${owner.accessToken}` });
    expect(mine.status).toBe(200);
    expect(mine.body.data.name).toBe(validStartup.name);
  });

  // The concurrency test above can only ever observe the race it happens to
  // hit. What makes "one profile per account" true regardless is the unique
  // index, so that is asserted directly: a second document for the same owner
  // is refused by the database, not by the service that usually gets there
  // first.
  test.each([
    [
      "Startup",
      "../../src/modules/investment/startups/startup.model",
      { name: "Second", description: "d", totalRaisingCents: 100000, minInvestmentCents: 1000 },
    ],
    ["Investor", "../../src/modules/investment/investors/investor.model", {}],
  ])("a second %s profile for one owner is refused by the database", async (_, modulePath, fields) => {
    const Model = require(modulePath);
    await Model.init(); // the unique index is the thing under test
    const owner = new (require("mongoose").Types.ObjectId)();

    await Model.create({ owner, ...fields });
    await expect(Model.create({ owner, ...fields })).rejects.toMatchObject({ code: 11000 });
    expect(await Model.countDocuments({ owner })).toBe(1);
  });
});
