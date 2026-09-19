// Stripe integration: signature verification (real, not mocked), event
// idempotency, verification of events against the stored investment, refunds
// and provider failures. Only Stripe's *network* calls are stubbed — the
// signing, parsing and dispatch paths are the real ones.
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_for_signature_verification";

const Stripe = require("stripe");
const { app, request, registerUser, createAdmin } = require("../helpers");
const stripeService = require("../../src/modules/payments/stripe.service");
const investmentService = require("../../src/modules/investment/investments/investment.service");
const Investment = require("../../src/modules/investment/investments/investment.model");
const Startup = require("../../src/modules/investment/startups/startup.model");
const StripeEvent = require("../../src/modules/payments/stripeEvent.model");
const logger = require("../../src/common/utils/logger");
const env = require("../../src/config/env");

const as = (who) => ({ Authorization: `Bearer ${who.accessToken}` });
const USD = (dollars) => dollars * 100;
const WEBHOOK = "/api/v1/payments/webhook";

// Stripe's own helper produces a genuine signature header for a raw body.
const sign = (payload, { secret = env.stripe.webhookSecret, timestamp } = {}) =>
  Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });

const postEvent = (event, headerOverrides = {}) => {
  const payload = JSON.stringify(event);
  // `null` means: send no signature header at all (?? would treat that as absent).
  const header = "signature" in headerOverrides ? headerOverrides.signature : sign(payload, headerOverrides);
  const req = request(app).post(WEBHOOK).set("Content-Type", "application/json");
  if (header !== null) req.set("stripe-signature", header);
  return req.send(headerOverrides.body ?? payload);
};

let eventCounter = 0;
const stripeEvent = (type, object) => ({
  id: `evt_test_${++eventCounter}_${Date.now()}`,
  type,
  api_version: stripeService.API_VERSION,
  data: { object },
});

const succeeded = (investment, overrides = {}) =>
  stripeEvent("payment_intent.succeeded", {
    id: investment.stripePaymentIntentId,
    amount: investment.amountCents,
    amount_received: investment.amountCents,
    currency: "usd",
    ...overrides,
  });

const chargeRefunded = (investment, overrides = {}) =>
  stripeEvent("charge.refunded", {
    id: "ch_test",
    payment_intent: investment.stripePaymentIntentId,
    currency: "usd",
    amount_refunded: investment.amountCents,
    refunds: { data: [{ id: "re_from_stripe" }] },
    ...overrides,
  });

let founder;
let investor;
let startup;
let createPaymentIntent;
let createRefund;
let retrievePaymentIntent;

beforeEach(async () => {
  // Stub only the outbound network calls of the Stripe SDK.
  createPaymentIntent = jest
    .spyOn(stripeService.stripe.paymentIntents, "create")
    .mockImplementation(async (params) => ({
      id: `pi_${Math.random().toString(36).slice(2)}`,
      client_secret: "cs_test_secret",
      amount: params.amount,
      currency: params.currency,
      status: "requires_payment_method",
    }));
  retrievePaymentIntent = jest
    .spyOn(stripeService.stripe.paymentIntents, "retrieve")
    .mockImplementation(async (id) => ({ id, client_secret: "cs_test_secret" }));
  createRefund = jest
    .spyOn(stripeService.stripe.refunds, "create")
    .mockImplementation(async () => ({ id: `re_${Math.random().toString(36).slice(2)}`, status: "succeeded" }));

  [founder, investor] = await Promise.all([registerUser({ role: "startup" }), registerUser({ role: "investor" })]);
  startup = (
    await request(app)
      .put("/api/v1/startups/me")
      .set(as(founder))
      .send({ name: "Acme", description: "d", totalRaisingCents: USD(1000), minInvestmentCents: USD(10) })
  ).body.data;
});

afterEach(() => jest.restoreAllMocks());

async function invest(amountCents = USD(100), who = investor) {
  const res = await request(app).post("/api/v1/investments").set(as(who)).send({ startupId: startup._id, amountCents });
  expect(res.status).toBe(201);
  return res.body.data.investment;
}

const fundingOf = async () => {
  const s = await Startup.findById(startup._id);
  return { raised: s.raisedSoFarCents, reserved: s.reservedCents };
};

describe("PaymentIntent creation", () => {
  test("passes the stored integer amount and an investment-derived idempotency key", async () => {
    const investment = await invest(USD(250));

    expect(createPaymentIntent).toHaveBeenCalledTimes(1);
    const [params, options] = createPaymentIntent.mock.calls[0];
    expect(params).toMatchObject({ amount: 25000, currency: "usd", metadata: { investmentId: investment._id } });
    expect(options).toEqual({ idempotencyKey: `investment-${investment._id}` });
    expect(investment.status).toBe("pending");
  });

  test("a successful PaymentIntent does not make the investment paid", async () => {
    const investment = await invest();
    expect((await Investment.findById(investment._id)).status).toBe("pending");
    expect((await fundingOf()).raised).toBe(0);
  });

  test("re-running creation for the same investment reuses the stored PaymentIntent", async () => {
    const investment = await invest();
    createPaymentIntent.mockClear();

    const again = await investmentService.ensurePaymentIntent(await Investment.findById(investment._id));
    expect(createPaymentIntent).not.toHaveBeenCalled();
    expect(again.paymentIntent.id).toBe(investment.stripePaymentIntentId);
  });

  test("concurrent creation for one investment stores a single PaymentIntent id", async () => {
    const bare = await Investment.create({
      investor: investor.user._id,
      startup: startup._id,
      amountCents: USD(10),
    });

    const results = await Promise.all(Array.from({ length: 4 }, () => investmentService.ensurePaymentIntent(bare)));
    const stored = await Investment.findById(bare._id);
    expect(stored.stripePaymentIntentId).toBeDefined();
    for (const r of results) expect(r.investment.stripePaymentIntentId).toBe(stored.stripePaymentIntentId);
    expect(await Investment.countDocuments({ stripePaymentIntentId: stored.stripePaymentIntentId })).toBe(1);
  });

  test("a provider failure is a 502 that names no Stripe internals, and frees the reservation", async () => {
    const stripeError = Object.assign(new Error("No such token: tok_secret_internal"), {
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      requestId: "req_123",
    });
    createPaymentIntent.mockRejectedValueOnce(stripeError);

    const res = await request(app)
      .post("/api/v1/investments")
      .set(as(investor))
      .send({ startupId: startup._id, amountCents: USD(100) });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("PAYMENT_PROVIDER_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/tok_secret_internal|StripeInvalidRequestError|req_123/);
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
    expect((await Investment.findOne({ investor: investor.user._id })).status).toBe("failed");
  });
});

describe("webhook signature verification", () => {
  test("a correctly signed event is accepted", async () => {
    const investment = await invest();
    const res = await postEvent(succeeded(investment));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test.each([
    ["no signature header", { signature: null }],
    ["a garbage signature", { signature: "t=1,v1=deadbeef" }],
    ["a signature from a different secret", { secret: "whsec_someone_elses_secret" }],
    ["a stale (replayed) timestamp", { timestamp: Math.floor(Date.now() / 1000) - 3600 }],
  ])("rejects %s with 400 and changes nothing", async (_, overrides) => {
    const investment = await invest();
    const res = await postEvent(succeeded(investment), overrides);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ received: false });
    expect((await Investment.findById(investment._id)).status).toBe("pending");
    expect(await StripeEvent.countDocuments()).toBe(0);
  });

  test("rejects a tampered body whose signature no longer matches", async () => {
    const investment = await invest();
    const payload = JSON.stringify(succeeded(investment));
    const header = sign(payload);
    const tampered = payload.replace(`"amount_received":${investment.amountCents}`, '"amount_received":999999');

    const res = await request(app)
      .post(WEBHOOK)
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(tampered);

    expect(res.status).toBe(400);
    expect((await fundingOf()).raised).toBe(0);
  });

  test("the signature and raw body are never logged", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const investment = await invest();
    await postEvent(succeeded(investment), { secret: "whsec_someone_elses_secret" });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toMatch(/whsec_|v1=|payment_intent/);
  });

  test("the webhook takes no user session — a bearer token neither helps nor is required", async () => {
    const investment = await invest();
    const payload = JSON.stringify(succeeded(investment));
    const res = await request(app)
      .post(WEBHOOK)
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(payload))
      .set(as(investor))
      .send(payload);
    expect(res.status).toBe(200);
  });
});

describe("event idempotency", () => {
  test("a duplicate delivery of the same event credits once", async () => {
    const investment = await invest(USD(300));
    const event = succeeded(investment);

    await postEvent(event).expect(200);
    await postEvent(event).expect(200);

    expect(await fundingOf()).toEqual({ raised: 30000, reserved: 0 });
    expect(await StripeEvent.countDocuments({ eventId: event.id })).toBe(1);
  });

  test("concurrent deliveries of the same event credit once", async () => {
    const investment = await invest(USD(300));
    const event = succeeded(investment);

    const responses = await Promise.all(Array.from({ length: 5 }, () => postEvent(event)));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(await fundingOf()).toEqual({ raised: 30000, reserved: 0 });
  });

  test("two distinct events for the same payment still credit once (domain guard)", async () => {
    const investment = await invest(USD(300));
    await postEvent(succeeded(investment)).expect(200);
    await postEvent(succeeded(investment)).expect(200); // different event id, same PaymentIntent

    expect(await fundingOf()).toEqual({ raised: 30000, reserved: 0 });
    expect(await StripeEvent.countDocuments()).toBe(2);
  });

  test("a failed processing attempt releases its claim so Stripe's retry can succeed", async () => {
    const investment = await invest(USD(300));
    const event = succeeded(investment);
    jest.spyOn(investmentService, "markPaid").mockRejectedValueOnce(new Error("database blip"));
    jest.spyOn(logger, "error").mockImplementation(() => {});

    expect((await postEvent(event)).status).toBe(500);
    expect(await StripeEvent.countDocuments({ eventId: event.id })).toBe(0);

    expect((await postEvent(event)).status).toBe(200);
    expect(await fundingOf()).toEqual({ raised: 30000, reserved: 0 });
  });

  test("events are recorded with their outcome for the audit trail", async () => {
    const investment = await invest(USD(300));
    await postEvent(succeeded(investment)).expect(200);

    const record = await StripeEvent.findOne({ investment: investment._id });
    expect(record).toMatchObject({ type: "payment_intent.succeeded", outcome: "credited" });
    expect(record.processedAt).toBeInstanceOf(Date);
  });
});

describe("event verification against the investment record", () => {
  test.each([
    ["an amount that does not match", { amount_received: 999999, amount: 999999 }],
    ["a currency that does not match", { currency: "eur" }],
  ])("ignores %s and records the mismatch", async (_, overrides) => {
    jest.spyOn(logger, "error").mockImplementation(() => {});
    const investment = await invest(USD(100));

    const res = await postEvent(succeeded(investment, overrides));
    expect(res.status).toBe(200);
    expect((await Investment.findById(investment._id)).status).toBe("pending");
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 10000 });
    expect((await StripeEvent.findOne({})).outcome).toBe("mismatch");
  });

  test("an event for an unknown PaymentIntent is acknowledged and recorded", async () => {
    const res = await postEvent(stripeEvent("payment_intent.succeeded", { id: "pi_nope", amount: 1, currency: "usd" }));
    expect(res.status).toBe(200);
    expect((await StripeEvent.findOne({})).outcome).toBe("unknown_payment");
  });

  test("an unhandled event type is acknowledged without touching the domain", async () => {
    const res = await postEvent(stripeEvent("customer.created", { id: "cus_1" }));
    expect(res.status).toBe(200);
    expect((await StripeEvent.findOne({})).outcome).toBe("no_change");
  });
});

describe("payment outcomes", () => {
  test("payment_intent.succeeded credits the startup once", async () => {
    const investment = await invest(USD(400));
    await postEvent(succeeded(investment)).expect(200);

    expect((await Investment.findById(investment._id)).status).toBe("paid");
    expect(await fundingOf()).toEqual({ raised: 40000, reserved: 0 });
  });

  test.each(["payment_intent.payment_failed", "payment_intent.canceled"])(
    "%s releases the reservation and leaves the investment revivable",
    async (type) => {
      const investment = await invest(USD(400));
      await postEvent(
        stripeEvent(type, { id: investment.stripePaymentIntentId, amount: investment.amountCents, currency: "usd" })
      ).expect(200);

      expect((await Investment.findById(investment._id)).status).toBe("failed");
      expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
    }
  );

  test("a declined payment that the customer retries successfully is credited (audit C3)", async () => {
    const investment = await invest(USD(400));
    await postEvent(
      stripeEvent("payment_intent.payment_failed", {
        id: investment.stripePaymentIntentId,
        amount: investment.amountCents,
        currency: "usd",
      })
    ).expect(200);
    await postEvent(succeeded(investment)).expect(200);

    expect((await Investment.findById(investment._id)).status).toBe("paid");
    expect(await fundingOf()).toEqual({ raised: 40000, reserved: 0 });
  });

  test("concurrent success and failure events cannot leave money and status disagreeing", async () => {
    const investment = await invest(USD(400));
    const failure = stripeEvent("payment_intent.payment_failed", {
      id: investment.stripePaymentIntentId,
      amount: investment.amountCents,
      currency: "usd",
    });

    await Promise.all([postEvent(succeeded(investment)), postEvent(failure)]);

    const stored = await Investment.findById(investment._id);
    const funding = await fundingOf();
    expect(funding.raised).toBe(stored.status === "paid" ? 40000 : 0);
    expect(funding.reserved).toBe(0);
  });
});

describe("late payment for a round that is already full", () => {
  async function fillRoundThenPay() {
    const late = await invest(USD(600)); // reserved, will be released
    await postEvent(
      stripeEvent("payment_intent.payment_failed", {
        id: late.stripePaymentIntentId,
        amount: late.amountCents,
        currency: "usd",
      })
    ).expect(200);

    // Someone else takes the whole round while the first investor retries.
    const other = await registerUser({ role: "investor" });
    const filling = await invest(USD(1000), other);
    await postEvent(succeeded(filling)).expect(200);

    jest.spyOn(logger, "warn").mockImplementation(() => {});
    const res = await postEvent(succeeded(late));
    return { late, res };
  }

  test("the payment is refunded automatically and never credited", async () => {
    const { late, res } = await fillRoundThenPay();
    expect(res.status).toBe(200);

    const stored = await Investment.findById(late._id);
    expect(stored.status).toBe("failed");
    expect(stored.stripeRefundId).toBeDefined();
    expect(stored.autoRefundedAt).toBeInstanceOf(Date);

    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund.mock.calls[0][0]).toMatchObject({ payment_intent: late.stripePaymentIntentId });
    expect(createRefund.mock.calls[0][1]).toEqual({ idempotencyKey: `auto-refund-${late._id}` });

    const s = await Startup.findById(startup._id);
    expect(s.raisedSoFarCents).toBe(100000);
    expect(s.raisedSoFarCents).toBeLessThanOrEqual(s.totalRaisingCents);
    expect((await StripeEvent.findOne({ investment: late._id, outcome: "auto_refunded" })).detail).toMatch(
      /fully funded/
    );
  });

  test("a redelivery of that late payment does not refund twice", async () => {
    const { late } = await fillRoundThenPay();
    createRefund.mockClear();

    await postEvent(succeeded(late)).expect(200); // new event id, same payment
    expect(createRefund).toHaveBeenCalledTimes(1); // Stripe's idempotency key covers the repeat
    const stored = await Investment.findById(late._id);
    expect(stored.status).toBe("failed");
    expect((await Startup.findById(startup._id)).raisedSoFarCents).toBe(100000);
  });
});

describe("refunds", () => {
  let admin;
  let paid;
  beforeEach(async () => {
    admin = await createAdmin();
    paid = await invest(USD(300));
    await postEvent(succeeded(paid)).expect(200);
  });

  const refundRequest = (who) => request(app).post(`/api/v1/investments/${paid._id}/refund`).set(as(who));

  test("an admin refund is keyed on the investment and reverses the funding", async () => {
    const res = await refundRequest(admin);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("refunded");

    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund.mock.calls[0][1]).toEqual({ idempotencyKey: `refund-${paid._id}` });
    expect((await Investment.findById(paid._id)).stripeRefundId).toBeDefined();
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
  });

  test("concurrent admin refunds reach Stripe once", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => refundRequest(admin)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
  });

  test("non-admins cannot refund", async () => {
    for (const who of [investor, founder]) expect((await refundRequest(who)).status).toBe(403);
    expect(createRefund).not.toHaveBeenCalled();
  });

  test("a refund issued in the Stripe dashboard is reconciled by charge.refunded", async () => {
    await postEvent(chargeRefunded(paid)).expect(200);

    const stored = await Investment.findById(paid._id);
    expect(stored.status).toBe("refunded");
    expect(stored.stripeRefundId).toBe("re_from_stripe");
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
    expect(createRefund).not.toHaveBeenCalled(); // the money already moved
  });

  test("a duplicate charge.refunded debits the startup once", async () => {
    await postEvent(chargeRefunded(paid)).expect(200);
    await postEvent(chargeRefunded(paid)).expect(200);
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
  });

  test("charge.refunded after an admin refund is a no-op", async () => {
    await refundRequest(admin).expect(200);
    await postEvent(chargeRefunded(paid)).expect(200);
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
    expect((await Investment.findById(paid._id)).status).toBe("refunded");
  });

  test("a partial refund is recorded and left alone — the domain has no partial state", async () => {
    jest.spyOn(logger, "error").mockImplementation(() => {});
    await postEvent(chargeRefunded(paid, { amount_refunded: USD(100) })).expect(200);

    expect((await Investment.findById(paid._id)).status).toBe("paid");
    expect(await fundingOf()).toEqual({ raised: 30000, reserved: 0 });
    expect((await StripeEvent.findOne({ type: "charge.refunded" })).outcome).toBe("mismatch");
  });

  test("a refunded investment cannot be paid again by a later event", async () => {
    await refundRequest(admin).expect(200);
    await postEvent(succeeded(paid)).expect(200);

    expect((await Investment.findById(paid._id)).status).toBe("refunded");
    expect(await fundingOf()).toEqual({ raised: 0, reserved: 0 });
  });

  test("if Stripe refuses the refund the investment stays paid", async () => {
    createRefund.mockRejectedValueOnce(Object.assign(new Error("charge_already_refunded"), { type: "StripeError" }));
    jest.spyOn(logger, "error").mockImplementation(() => {});

    const res = await refundRequest(admin);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("PAYMENT_PROVIDER_ERROR");
    expect((await Investment.findById(paid._id)).status).toBe("paid");
    expect(await fundingOf()).toEqual({ raised: 30000, reserved: 0 });
  });
});

describe("disputes", () => {
  test("are observed and logged without changing investment state", async () => {
    const error = jest.spyOn(logger, "error").mockImplementation(() => {});
    const paid = await invest(USD(300));
    await postEvent(succeeded(paid)).expect(200);

    const res = await postEvent(
      stripeEvent("charge.dispute.created", {
        id: "dp_1",
        payment_intent: paid.stripePaymentIntentId,
        status: "needs_response",
      })
    );

    expect(res.status).toBe(200);
    expect((await Investment.findById(paid._id)).status).toBe("paid");
    expect(await fundingOf()).toEqual({ raised: 30000, reserved: 0 });
    expect((await StripeEvent.findOne({ type: "charge.dispute.created" })).outcome).toBe("no_change");
    expect(error).toHaveBeenCalledWith("Stripe dispute event received — needs manual handling", expect.any(Object));
  });
});

describe("database constraints", () => {
  test("the processed-event log is unique on eventId and has its lookup indexes", async () => {
    await StripeEvent.create({ eventId: "evt_dup", type: "payment_intent.succeeded" });
    await expect(StripeEvent.create({ eventId: "evt_dup", type: "payment_intent.succeeded" })).rejects.toMatchObject({
      code: 11000,
    });

    const indexes = await StripeEvent.collection.indexes();
    const byKey = Object.fromEntries(indexes.map((i) => [JSON.stringify(i.key), i]));
    expect(byKey[JSON.stringify({ eventId: 1 })].unique).toBe(true);
    expect(byKey[JSON.stringify({ investment: 1, createdAt: -1 })]).toBeDefined();
    expect(byKey[JSON.stringify({ createdAt: 1 })].expireAfterSeconds).toBe(90 * 24 * 60 * 60);
  });

  test("retrievePaymentIntent is only used for already-stored intents", async () => {
    const investment = await invest();
    await investmentService.ensurePaymentIntent(await Investment.findById(investment._id));
    expect(retrievePaymentIntent).toHaveBeenCalledWith(investment.stripePaymentIntentId);
  });
});
