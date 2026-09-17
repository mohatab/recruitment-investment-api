const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();
const PING_TIMEOUT_MS = 2000;

// Resolves true/false, never hangs: when the server is unreachable the driver
// would otherwise wait out serverSelectionTimeoutMS (30s) and stall the probe.
async function mongoIsUp() {
  if (mongoose.connection.readyState !== 1) return false;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
  });
  try {
    return await Promise.race([mongoose.connection.db.command({ ping: 1 }).then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe — the process is running and serving HTTP (checks no dependencies)
 *     security: []
 *     responses:
 *       200: { $ref: '#/components/responses/HealthResponse' }
 */
router.get("/health", (req, res) => {
  res.json({ success: true, data: { status: "ok", uptimeSeconds: Math.floor(process.uptime()) } });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe — MongoDB answers a ping and the server is not shutting down
 *     security: []
 *     responses:
 *       200: { $ref: '#/components/responses/ReadinessResponse' }
 *       503: { $ref: '#/components/responses/ReadinessResponse' }
 */
router.get("/health/ready", async (req, res) => {
  if (req.app.locals.shuttingDown) {
    return res.status(503).json({ success: false, data: { status: "shutting_down", checks: {} } });
  }
  const up = await mongoIsUp();
  res
    .status(up ? 200 : 503)
    .json({ success: up, data: { status: up ? "ready" : "not_ready", checks: { mongodb: up ? "up" : "down" } } });
});

module.exports = router;
