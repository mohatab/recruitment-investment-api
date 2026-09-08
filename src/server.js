const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const env = require("./config/env");
const app = require("./app");
const connectDB = require("./config/database");
const { initSocket } = require("./realtime/socket");
const { setIO } = require("./realtime/ioRegistry");
const logger = require("./common/utils/logger");

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.corsOrigin } });
initSocket(io);
setIO(io);

async function start() {
  await connectDB();
  server.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port}`, { env: env.nodeEnv });
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close();
  await mongoose.connection.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Only connect + bind a port when run directly (`node src/server.js`); when
// imported by tests via supertest, neither side effect runs.
if (require.main === module) {
  start();
}

module.exports = { app, server, io };
