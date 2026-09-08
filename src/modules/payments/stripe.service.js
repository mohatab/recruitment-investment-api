const Stripe = require("stripe");
const env = require("../../config/env");

const stripe = new Stripe(env.stripe.secretKey || "sk_test_placeholder");

// Real integration shape: the server creates a PaymentIntent and hands the
// client its `client_secret` to confirm with Stripe.js/Elements — the
// server never sees or transmits a raw card number, unlike the previous
// implementation's `paymentMethods.create({card:{number:...}})` call.
async function createPaymentIntent({ amount, currency = "usd", metadata }) {
  return stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
}

async function refundPaymentIntent(paymentIntentId) {
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}

// Verifies the request actually came from Stripe (signed with the webhook
// secret) before trusting anything in the payload — the previous code had
// no webhook handling at all, so nothing verified payment outcomes
// server-side.
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
}

module.exports = { stripe, createPaymentIntent, refundPaymentIntent, constructWebhookEvent };
