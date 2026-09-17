const express = require("express");
const stripeService = require("./stripe.service");
const investmentService = require("../investment/investments/investment.service");
const logger = require("../../common/utils/logger");

const router = express.Router();

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Stripe webhook — verifies the signature before trusting any payment status (not client-reported)
 *     security: []
 *     responses:
 *       200: { description: Event processed }
 *       400: { description: Invalid signature }
 */
// Mounted with express.raw() (see app.js) *before* the global express.json()
// parser — Stripe's signature is computed over the exact raw request body,
// so it must never be parsed/re-serialized first.
router.post("/webhook", async (req, res) => {
  let event;
  try {
    event = stripeService.constructWebhookEvent(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      await investmentService.handlePaymentIntentSucceeded(event.data.object.id);
    } else if (event.type === "payment_intent.payment_failed") {
      await investmentService.handlePaymentIntentFailed(event.data.object.id);
    }
    res.json({ received: true });
  } catch (err) {
    logger.error("Error processing Stripe webhook", { error: err.message, eventType: event.type });
    res.status(500).json({ received: false });
  }
});

module.exports = router;
