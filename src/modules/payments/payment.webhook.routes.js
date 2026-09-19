const express = require("express");
const stripeService = require("./stripe.service");
const paymentService = require("./payment.service");
const logger = require("../../common/utils/logger");

const router = express.Router();

/**
 * @swagger
 * /api/v1/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: "Stripe webhook. Authenticates by Stripe signature over the raw body, never by a user session. Delivery is at-least-once: every event id is recorded, so duplicates are acknowledged without reprocessing. Handles payment_intent.succeeded / payment_failed / canceled and charge.refunded; dispute events are logged without changing domain state. An event whose amount or currency disagrees with the stored investment is recorded and ignored."
 *     security: []
 *     requestBody:
 *       required: true
 *       description: Raw Stripe event body (application/json), signed with the webhook secret
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/StripeWebhookAck' }
 *       400: { description: "Missing, malformed, replayed or tampered signature; nothing is processed" }
 *       500: { description: "Processing failed; Stripe retries the event" }
 */
// Mounted with express.raw() (see app.js) *before* the global express.json()
// parser — Stripe's signature is computed over the exact raw request body, so
// it must never be parsed and re-serialized first.
router.post("/webhook", async (req, res) => {
  let event;
  try {
    event = stripeService.constructWebhookEvent(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    // The signature (and the body it signs) is never logged.
    logger.warn("Stripe webhook signature verification failed", { reason: err.type || "invalid_signature" });
    return res.status(400).json({ received: false });
  }

  try {
    const result = await paymentService.handleEvent(event);
    logger.info("Stripe webhook processed", {
      eventId: event.id,
      type: event.type,
      outcome: result.duplicate ? "duplicate" : result.outcome,
    });
    res.json({ received: true });
  } catch (err) {
    // 5xx makes Stripe redeliver, which is what we want for a transient fault.
    logger.error("Stripe webhook processing failed", { eventId: event.id, type: event.type, error: err.message });
    res.status(500).json({ received: false });
  }
});

module.exports = router;
