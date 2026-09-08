const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Application + database health check
 *     responses:
 *       200: { description: Healthy }
 *       503: { description: Database unavailable }
 */
router.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? "ok" : "degraded",
      db: ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});

module.exports = router;
