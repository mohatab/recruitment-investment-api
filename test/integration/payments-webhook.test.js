// The Stripe SDK boundary is mocked here — these tests are about *our*
// webhook handling (signature check, idempotency, status transitions), not
// Stripe's own API, which we don't own and shouldn't call in a test suite.
jest.mock("../../src/modules/payments/stripe.service", () => ({
  createPaymentIntent: jest.fn(async () => ({
    id: `pi_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    client_secret: "secret_x",
  })),
  refundPaymentIntent: jest.fn(async () => ({ id: "re_test" })),
  constructWebhookEvent: jest.fn((rawBody, signature) => {
    if (signature !== "valid-test-signature") throw new Error("Invalid signature");
    return JSON.parse(rawBody.toString());
  }),
}));

const { app, request, registerUser, createAdmin } = require("../helpers");
const Startup = require("../../src/modules/investment/startups/startup.model");

async function setupInvestment(amount = 200) {
  const startupOwner = await registerUser({ role: "startup" });
  await request(app)
    .put("/api/v1/startups/me")
    .set("Authorization", `Bearer ${startupOwner.accessToken}`)
    .send({ name: "Acme", description: "desc", totalRaising: 10000, minInvestment: 100 });
  const startupId = (
    await request(app).get("/api/v1/startups/me").set("Authorization", `Bearer ${startupOwner.accessToken}`)
  ).body.data._id;

  const investor = await registerUser({ role: "investor" });
  const createRes = await request(app)
    .post("/api/v1/investments")
    .set("Authorization", `Bearer ${investor.accessToken}`)
    .send({ startupId, amount });

  return { startupId, startupOwner, investment: createRes.body.data.investment, investor };
}

function sendWebhook(event, signature = "valid-test-signature") {
  return request(app).post("/api/v1/payments/webhook").set("stripe-signature", signature).send(event);
}

describe("Stripe webhook", () => {
  test("rejects a request with an invalid signature", async () => {
    const res = await sendWebhook(
      { type: "payment_intent.succeeded", data: { object: { id: "pi_x" } } },
      "bad-signature"
    );
    expect(res.status).toBe(400);
  });

  test("marks the investment paid and credits the startup on payment_intent.succeeded", async () => {
    const { startupId, investment } = await setupInvestment(200);

    const before = await request(app).get(`/api/v1/startups/${startupId}`);
    expect(before.body.data.raisedSoFar).toBe(0);

    const webhookRes = await sendWebhook({
      type: "payment_intent.succeeded",
      data: { object: { id: investment.stripePaymentIntentId } },
    });
    expect(webhookRes.status).toBe(200);

    const after = await request(app).get(`/api/v1/startups/${startupId}`);
    expect(after.body.data.raisedSoFar).toBe(200);
  });

  test("a duplicate delivery of the same succeeded event does not double-credit the startup (idempotency)", async () => {
    const { startupId, investment } = await setupInvestment(200);
    const event = { type: "payment_intent.succeeded", data: { object: { id: investment.stripePaymentIntentId } } };

    await sendWebhook(event);
    await sendWebhook(event); // Stripe's own retry behavior can deliver a webhook more than once

    const after = await request(app).get(`/api/v1/startups/${startupId}`);
    expect(after.body.data.raisedSoFar).toBe(200); // not 400
  });

  test("payment_intent.payment_failed marks the investment failed, not paid", async () => {
    const { investment, investor } = await setupInvestment(200);
    await sendWebhook({
      type: "payment_intent.payment_failed",
      data: { object: { id: investment.stripePaymentIntentId } },
    });

    const mine = await request(app)
      .get("/api/v1/investments/mine")
      .set("Authorization", `Bearer ${investor.accessToken}`);
    expect(mine.body.data[0].status).toBe("failed");
  });

  test("an event for an unknown payment intent is accepted but has no effect", async () => {
    const res = await sendWebhook({ type: "payment_intent.succeeded", data: { object: { id: "pi_does_not_exist" } } });
    expect(res.status).toBe(200);
  });

  test("refunds are admin-only (D3): the investor cannot reclaim a paid investment; an admin can, once it is paid", async () => {
    const { investment, investor, startupId, startupOwner } = await setupInvestment(200);
    const admin = await createAdmin();
    const refund = (token) =>
      request(app).post(`/api/v1/investments/${investment._id}/refund`).set("Authorization", `Bearer ${token}`);

    // still "pending" — never confirmed by a webhook
    expect((await refund(admin.accessToken)).status).toBe(422);

    await sendWebhook({ type: "payment_intent.succeeded", data: { object: { id: investment.stripePaymentIntentId } } });

    for (const who of [investor, startupOwner]) {
      const res = await refund(who.accessToken);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect((await Startup.findById(startupId)).raisedSoFar).toBe(200); // nothing reclaimed

    const byAdmin = await refund(admin.accessToken);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.status).toBe("refunded");
  });

  test("GET /api/investments/startup lists investments received by the current user's startup, with investor details populated", async () => {
    const { startupOwner, investor } = await setupInvestment(200);

    const res = await request(app)
      .get("/api/v1/investments/startup")
      .set("Authorization", `Bearer ${startupOwner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].investor.email).toBe(investor.user.email);
  });
});
