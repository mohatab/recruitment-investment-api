const Stripe = require("stripe");
const env = require("../../config/env");
const { AppError, CODES } = require("../../common/errors/AppError");
const logger = require("../../common/utils/logger");

// Pinned: Stripe changes response shapes between API versions, and an account
// upgraded in the dashboard must not silently change what this code receives.
const API_VERSION = "2025-08-27.basil";

const stripe = new Stripe(env.stripe.secretKey || "sk_test_placeholder", { apiVersion: API_VERSION });

// Every outbound call goes through here. Stripe errors carry request payloads,
// keys and internal detail, so exactly three safe fields are logged (type, the
// error code and Stripe's request id) and the client gets a generic 502 — an
// actionable provider failure, not a bug in this service.
async function call(operation, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.error("Stripe request failed", {
      operation,
      type: err.type,
      code: err.code,
      stripeRequestId: err.requestId,
    });
    throw new AppError(
      "The payment provider is unavailable — no money moved, please retry",
      502,
      CODES.PAYMENT_PROVIDER_ERROR
    );
  }
}

// The server creates a PaymentIntent and hands the client its `client_secret`
// to confirm with Stripe.js/Elements — it never sees or transmits a raw card
// number.
//
// `amountCents` is already an integer in the currency's minor unit, exactly as
// stored and exactly as Stripe expects: nothing is scaled, rounded or parsed.
//
// `idempotencyKey` is required by this wrapper, not optional: a create request
// that times out is retried by callers (or by users), and without the key that
// is how a customer gets charged twice.
async function createPaymentIntent({ amountCents, currency = "usd", metadata, idempotencyKey }) {
  return call("paymentIntents.create", () =>
    stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency,
        metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey }
    )
  );
}

// Full refund of a PaymentIntent. Same reasoning for the idempotency key: a
// retried refund must not become two refunds.
async function createRefund({ paymentIntentId, idempotencyKey, reason }) {
  return call("refunds.create", () =>
    stripe.refunds.create({ payment_intent: paymentIntentId, ...(reason ? { reason } : {}) }, { idempotencyKey })
  );
}

function retrievePaymentIntent(paymentIntentId) {
  return call("paymentIntents.retrieve", () => stripe.paymentIntents.retrieve(paymentIntentId));
}

// Proves the request really came from Stripe: the signature is computed over
// the exact raw body with the webhook secret, and Stripe's own tolerance check
// rejects replayed (stale) signatures. Throws for a bad/missing signature —
// the caller answers 400 without touching any domain state.
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
}

module.exports = {
  stripe,
  API_VERSION,
  createPaymentIntent,
  createRefund,
  retrievePaymentIntent,
  constructWebhookEvent,
};
