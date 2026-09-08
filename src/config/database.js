const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../common/utils/logger");

async function connectDB() {
  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB connection error", { error: err.message });
  });

  await mongoose.connect(env.mongoUri);
  logger.info("Connected to MongoDB");
}

module.exports = connectDB;
