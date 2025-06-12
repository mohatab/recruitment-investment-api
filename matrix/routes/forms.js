require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const connectDB = require("../../shared/db");
const cors = require("cors");

const investorRoutes = require("./investorRoutes");
const startupRoutes = require("./startupRoutes");
const router = express.Router();

// Middleware
router.use(cors());
router.use(bodyParser.json());
router.use(express.json());

// Error handling middleware
router.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "حدث خطأ في السيرفر!" });
});

// Routes
router.use("/investor", investorRoutes);
router.use("/startup", startupRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

module.exports = router;
