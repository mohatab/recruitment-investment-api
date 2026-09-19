// Investment domain: money representation, the funding cap under concurrency,
// the state machine, and refund guards. Stripe itself is mocked at the module
// boundary — Task 8 owns that integration; these tests own the domain rules
// that Task 8 will drive.
jest.mock("../../src/modules/payments/stripe.service", () => ({
  createPaymentIntent: jest.fn(async ({ amountCents, currency }) => ({
    id: `pi_${Math.random().toString(36).slice(2)}`,
    client_secret: "cs_test",
    amount: amountCents,
    currency,
  })),
  createRefund: jest.fn(async () => ({ id: "re_test", status: "succeeded" })),
  retrievePaymentIntent: jest.fn(async (id) => ({ id, client_secret: "cs_test" })),
  constructWebhookEvent: jest.fn(),
}));

const { app, request, registerUser, createAdmin } = require("../helpers");
const stripeService = require("../../src/modules/payments/stripe.service");
const investmentService = require("../../src/modules/investment/investments/investment.service");
const Investment = require("../../src/modules/investment/investments/investment.model");
const Startup = require("../../src/modules/investment/startups/startup.model");

const as = (who) => ({ Authorization: `Bearer ${who.accessToken}` });
const USD = (dollars) => dollars * 100;

let founder;
let investor;
let startup;

async function createStartup(owner, overrides = {}) {
  const res = await request(app)
    .put("/api/v1/startups/me")
    .set(as(owner))
    .send({
      name: "Acme",
      description: "We build things",
      totalRaisingCents: USD(1000),
      minInvestmentCents: USD(10),
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

const invest = (who, startupId, amountCents) =>
  request(app).post("/api/v1/investments").set(as(who)).send({ startupId, amountCents });

const funding = async (id) => {
  const s = await Startup.findById(id);
  return { raised: s.raisedSoFarCents, reserved: s.reservedCents, remaining: s.remainingCents };
};

beforeEach(async () => {
  [founder, investor] = await Promise.all([registerUser({ role: "startup" }), registerUser({ role: "investor" })]);
  startup = await createStartup(founder);
});

describe("money representation", () => {
  test("amounts are integer minor units, in and out", async () => {
    const res = await invest(investor, startup._id, USD(25));
    expect(res.status).toBe(201);
    expect(res.body.data.investment).toMatchObject({ amountCents: 2500, currency: "usd" });
    expect(await Investment.findById(res.body.data.investment._id)).toMatchObject({ amountCents: 2500 });
  });

  test.each([
    ["a fraction of a cent", 10.005],
    ["a decimal amount", 25.5],
    ["a numeric string with decimals", "25.5"],
    ["zero", 0],
    ["a negative amount", -100],
    ["an absurd amount", 1e15],
  ])("rejects %s", async (_, amountCents) => {
    const res = await invest(investor, startup._id, amountCents);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await Investment.countDocuments()).toBe(0);
  });

  test("the amount handed to Stripe is the stored integer, unscaled", async () => {
    await invest(investor, startup._id, USD(25)).expect(201);
    expect(stripeService.createPaymentIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ amountCents: 2500, currency: "usd" })
    );
  });

  test("startup funding fields are integer cents and expose what is left", async () => {
    expect(startup).toMatchObject({
      totalRaisingCents: 100000,
      minInvestmentCents: 1000,
      raisedSoFarCents: 0,
      reservedCents: 0,
      remainingCents: 100000,
    });
  });

  test("a startup profile cannot be saved with fractional or contradictory amounts", async () => {
    const owner = await registerUser({ role: "startup" });
    const send = (body) =>
      request(app)
        .put("/api/v1/startups/me")
        .set(as(owner))
        .send({ name: "A", description: "d", totalRaisingCents: USD(100), minInvestmentCents: USD(1), ...body });

    expect((await send({ minInvestmentCents: 10.5 })).status).toBe(400);
    // A target below the minimum ticket could never be reached.
    expect((await send({ totalRaisingCents: USD(1), minInvestmentCents: USD(50) })).status).toBe(400);
    expect((await send({ raisedSoFarCents: USD(99), reservedCents: USD(99) })).body.data.raisedSoFarCents).toBe(0);
  });
});

describe("minimum investment and funding cap", () => {
  test("an amount below the startup's minimum is refused", async () => {
    const res = await invest(investor, startup._id, USD(9));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("MINIMUM_INVESTMENT_NOT_MET");
    expect((await funding(startup._id)).reserved).toBe(0);
  });

  test("exactly the minimum, and exactly the remaining amount, are allowed", async () => {
    expect((await invest(investor, startup._id, USD(10))).status).toBe(201);
    const second = await registerUser({ role: "investor" });
    expect((await invest(second, startup._id, USD(990))).status).toBe(201);
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 100000, remaining: 0 });
  });

  test("an amount beyond the remaining capacity is refused, and reserves nothing", async () => {
    await invest(investor, startup._id, USD(900)).expect(201);
    const second = await registerUser({ role: "investor" });

    const res = await invest(second, startup._id, USD(200));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("FUNDING_TARGET_EXCEEDED");
    expect(res.body.error.message).toMatch(/\$100\.00 left/);
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 90000, remaining: 10000 });
  });

  test("a pending investment holds capacity, and releasing it frees the capacity again", async () => {
    const res = await invest(investor, startup._id, USD(1000));
    expect((await funding(startup._id)).remaining).toBe(0);

    await investmentService.markFailed(res.body.data.investment._id);
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 0, remaining: 100000 });
    expect((await invest(await registerUser({ role: "investor" }), startup._id, USD(1000))).status).toBe(201);
  });
});

// The invariant under test: raisedSoFarCents + reservedCents <= totalRaisingCents,
// checked against the database after the dust settles — not against HTTP codes.
describe("concurrency", () => {
  test("concurrent investors cannot oversubscribe a round", async () => {
    const investors = await Promise.all(Array.from({ length: 8 }, () => registerUser({ role: "investor" })));
    // Eight investors, each wanting a fifth of a round that only fits five.
    const results = await Promise.all(investors.map((who) => invest(who, startup._id, USD(200))));

    const accepted = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 422);
    expect(accepted).toHaveLength(5);
    expect(refused).toHaveLength(3);
    expect(refused.every((r) => r.body.error.code === "FUNDING_TARGET_EXCEEDED")).toBe(true);

    const after = await funding(startup._id);
    expect(after).toEqual({ raised: 0, reserved: 100000, remaining: 0 });
    expect(await Investment.countDocuments({ startup: startup._id, status: "pending" })).toBe(5);
  });

  test("the invariant holds with a mix of investments, payments and failures", async () => {
    const investors = await Promise.all(Array.from({ length: 6 }, () => registerUser({ role: "investor" })));
    const created = await Promise.all(investors.map((who) => invest(who, startup._id, USD(150))));
    const ids = created.filter((r) => r.status === 201).map((r) => r.body.data.investment._id);

    await Promise.all(
      ids.map((id, index) => (index % 2 === 0 ? investmentService.markPaid(id) : investmentService.markFailed(id)))
    );

    const s = await Startup.findById(startup._id);
    expect(s.raisedSoFarCents + s.reservedCents).toBeLessThanOrEqual(s.totalRaisingCents);
    const paid = await Investment.find({ startup: s._id, status: "paid" });
    expect(s.raisedSoFarCents).toBe(paid.reduce((sum, i) => sum + i.amountCents, 0));
    expect(s.reservedCents).toBe(0);
  });

  test("concurrent payment confirmations for one investment credit the startup once", async () => {
    const { body } = await invest(investor, startup._id, USD(300));
    const id = body.data.investment._id;

    const results = await Promise.all(Array.from({ length: 5 }, () => investmentService.markPaid(id)));
    expect(results.filter((r) => r.credited)).toHaveLength(1);
    expect(await funding(startup._id)).toEqual({ raised: 30000, reserved: 0, remaining: 70000 });
  });

  test("concurrent refunds refund once and debit the startup once", async () => {
    const { body } = await invest(investor, startup._id, USD(300));
    const id = body.data.investment._id;
    await investmentService.markPaid(id);
    stripeService.createRefund.mockClear();

    const admin = await createAdmin();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(app).post(`/api/v1/investments/${id}/refund`).set(as(admin)))
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 422)).toHaveLength(3);
    expect(stripeService.createRefund).toHaveBeenCalledTimes(1);
    expect((await Investment.findById(id)).status).toBe("refunded");
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 0, remaining: 100000 });
  });

  test("a failed payment frees capacity for someone else immediately", async () => {
    const first = await invest(investor, startup._id, USD(1000));
    const other = await registerUser({ role: "investor" });
    expect((await invest(other, startup._id, USD(1000))).status).toBe(422);

    await investmentService.markFailed(first.body.data.investment._id);
    expect((await invest(other, startup._id, USD(1000))).status).toBe(201);
  });
});

describe("state machine", () => {
  let investmentId;
  beforeEach(async () => {
    const res = await invest(investor, startup._id, USD(100));
    investmentId = res.body.data.investment._id;
  });

  const statusOf = async () => (await Investment.findById(investmentId)).status;

  test("a new investment starts pending with capacity reserved", async () => {
    expect(await statusOf()).toBe("pending");
    expect((await funding(startup._id)).reserved).toBe(10000);
  });

  test("pending -> paid moves the reservation into raised", async () => {
    const { credited } = await investmentService.markPaid(investmentId);
    expect(credited).toBe(true);
    expect(await statusOf()).toBe("paid");
    expect(await funding(startup._id)).toEqual({ raised: 10000, reserved: 0, remaining: 90000 });
  });

  test("pending -> failed releases the reservation", async () => {
    await investmentService.markFailed(investmentId);
    expect(await statusOf()).toBe("failed");
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 0, remaining: 100000 });
  });

  // Audit C3: a declined payment that the customer retries successfully used to
  // leave the investment recorded as failed while the money was captured.
  test("failed -> paid credits the startup when the round still has room", async () => {
    await investmentService.markFailed(investmentId);
    const { credited } = await investmentService.markPaid(investmentId);

    expect(credited).toBe(true);
    expect(await statusOf()).toBe("paid");
    expect(await funding(startup._id)).toEqual({ raised: 10000, reserved: 0, remaining: 90000 });
  });

  test("failed -> paid is refused when the round filled up meanwhile, and says why", async () => {
    await investmentService.markFailed(investmentId);
    const other = await registerUser({ role: "investor" });
    await invest(other, startup._id, USD(1000)).expect(201);

    const result = await investmentService.markPaid(investmentId);
    expect(result).toMatchObject({ credited: false, reason: "funding_target_exceeded" });
    expect(await statusOf()).toBe("failed");
    // The round is unchanged: the late payment is Task 8's to refund.
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 100000, remaining: 0 });
  });

  test("marking an already-paid investment paid again changes nothing", async () => {
    await investmentService.markPaid(investmentId);
    const again = await investmentService.markPaid(investmentId);
    expect(again).toMatchObject({ credited: false, reason: "already_paid" });
    expect((await funding(startup._id)).raised).toBe(10000);
  });

  test("a refunded investment cannot be moved back into a payable state", async () => {
    await investmentService.markPaid(investmentId);
    await investmentService.refund(investmentId);

    expect(await investmentService.markPaid(investmentId)).toMatchObject({ credited: false, reason: "refunded" });
    expect(await investmentService.markFailed(investmentId)).toMatchObject({ released: false });
    expect(await statusOf()).toBe("refunded");
    expect((await funding(startup._id)).raised).toBe(0);
  });

  test("failing an already-failed or paid investment releases nothing twice", async () => {
    await investmentService.markFailed(investmentId);
    await investmentService.markFailed(investmentId);
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 0, remaining: 100000 });
  });

  test("marking an unknown investment paid or failed is a no-op", async () => {
    const missing = "507f1f77bcf86cd799439011";
    expect(await investmentService.markPaid(missing)).toMatchObject({ credited: false, reason: "unknown" });
    expect(await investmentService.markFailed(missing)).toMatchObject({ released: false });
  });

  test("a Stripe failure during creation leaves no reservation behind", async () => {
    stripeService.createPaymentIntent.mockRejectedValueOnce(new Error("stripe is down"));
    const res = await invest(await registerUser({ role: "investor" }), startup._id, USD(500));

    expect(res.status).toBe(500);
    expect(await funding(startup._id)).toEqual({ raised: 0, reserved: 10000, remaining: 90000 }); // only the earlier pending one
    expect(await Investment.countDocuments({ status: "failed" })).toBe(1);
  });
});

describe("refund rules", () => {
  let investmentId;
  let admin;
  beforeEach(async () => {
    const res = await invest(investor, startup._id, USD(100));
    investmentId = res.body.data.investment._id;
    admin = await createAdmin();
  });

  const refund = (who) => request(app).post(`/api/v1/investments/${investmentId}/refund`).set(as(who));

  test("only a paid investment can be refunded", async () => {
    const pending = await refund(admin);
    expect(pending.status).toBe(422);
    expect(pending.body.error.code).toBe("INVESTMENT_NOT_REFUNDABLE");

    await investmentService.markPaid(investmentId);
    expect((await refund(admin)).status).toBe(200);
  });

  test("a refunded investment cannot be refunded twice", async () => {
    await investmentService.markPaid(investmentId);
    await refund(admin).expect(200);
    stripeService.createRefund.mockClear();

    const second = await refund(admin);
    expect(second.status).toBe(422);
    expect(stripeService.createRefund).not.toHaveBeenCalled();
    expect((await funding(startup._id)).raised).toBe(0);
  });

  test("refunds stay admin-only (decision D3)", async () => {
    await investmentService.markPaid(investmentId);
    for (const who of [investor, founder]) {
      const res = await refund(who);
      expect(res.status).toBe(403);
    }
    expect((await Investment.findById(investmentId)).status).toBe("paid");
  });

  test("if Stripe refuses the refund, the investment stays paid and the startup keeps the money", async () => {
    await investmentService.markPaid(investmentId);
    stripeService.createRefund.mockRejectedValueOnce(new Error("charge already refunded"));

    const res = await refund(admin);
    expect(res.status).toBe(500);
    expect((await Investment.findById(investmentId)).status).toBe("paid");
    expect((await funding(startup._id)).raised).toBe(10000);
  });

  test("refunding an unknown investment is a 404", async () => {
    const res = await request(app).post("/api/v1/investments/507f1f77bcf86cd799439011/refund").set(as(admin));
    expect(res.status).toBe(404);
  });
});

describe("ownership, privacy and client-controlled fields", () => {
  test("status, investor and funding totals cannot be set by the client", async () => {
    const victim = await registerUser({ role: "investor" });
    const res = await invest(investor, startup._id, USD(100));
    expect(res.status).toBe(201);

    const forged = await request(app)
      .post("/api/v1/investments")
      .set(as(investor))
      .send({
        startupId: startup._id,
        amountCents: USD(100),
        status: "paid",
        investor: victim.user._id,
        stripePaymentIntentId: "pi_forged",
        currency: "eur",
      });
    expect(forged.status).toBe(201);
    expect(forged.body.data.investment).toMatchObject({
      status: "pending",
      investor: investor.user._id,
      currency: "usd",
    });
    expect((await funding(startup._id)).raised).toBe(0);
  });

  test("an investor sees only their own investments; a startup only its own round", async () => {
    const otherInvestor = await registerUser({ role: "investor" });
    const otherFounder = await registerUser({ role: "startup" });
    const otherStartup = await createStartup(otherFounder, { name: "Other" });
    await invest(investor, startup._id, USD(100)).expect(201);
    await invest(otherInvestor, otherStartup._id, USD(200)).expect(201);

    const mine = await request(app).get("/api/v1/investments/mine").set(as(investor));
    expect(mine.body.data.map((i) => i.amountCents)).toEqual([10000]);

    const received = await request(app).get("/api/v1/investments/startup").set(as(founder));
    expect(received.body.data.map((i) => i.amountCents)).toEqual([10000]);
    expect(received.body.data[0].investor.email).toBe(investor.user.email);
  });

  test("investing in a startup that does not exist is a 404", async () => {
    const res = await invest(investor, "507f1f77bcf86cd799439011", USD(100));
    expect(res.status).toBe(404);
  });
});

describe("database constraints", () => {
  test("one investment per PaymentIntent (unique, sparse)", async () => {
    const [a, b] = await Promise.all([
      Investment.create({ investor: investor.user._id, startup: startup._id, amountCents: 100 }),
      Investment.create({ investor: investor.user._id, startup: startup._id, amountCents: 100 }),
    ]);
    // Sparse: two investments without a PaymentIntent coexist.
    expect([a.status, b.status]).toEqual(["pending", "pending"]);

    await Investment.updateOne({ _id: a._id }, { stripePaymentIntentId: "pi_unique" });
    await expect(Investment.updateOne({ _id: b._id }, { stripePaymentIntentId: "pi_unique" })).rejects.toMatchObject({
      code: 11000,
    });
  });

  test("the model refuses non-integer money", async () => {
    await expect(
      Investment.create({ investor: investor.user._id, startup: startup._id, amountCents: 10.005 })
    ).rejects.toThrow(/amountCents/);
    await expect(
      Startup.findByIdAndUpdate(startup._id, { raisedSoFarCents: 1.5 }, { runValidators: true })
    ).rejects.toThrow(/integer/);
  });

  test("the indexes the investment lists rely on exist", async () => {
    const indexes = await Investment.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify({ investor: 1, createdAt: -1 }),
        JSON.stringify({ startup: 1, createdAt: -1 }),
      ])
    );
    const pi = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ stripePaymentIntentId: 1 }));
    expect(pi).toMatchObject({ unique: true, sparse: true });
  });
});
