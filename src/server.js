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
  if (app.locals.shuttingDown) return; // a second signal while draining shouldn't restart the sequence
  app.locals.shuttingDown = true; // /health/ready now answers 503 while connections drain
  logger.info(`${signal} received, shutting down gracefully`);

  // Force-exit if a stuck connection (or a hung mongoose disconnect) would
  // otherwise leave the process alive forever — a graceful shutdown that
  // never completes is not actually graceful in an orchestrator that just
  // wants the container gone.
  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  // io.close() also closes the underlying HTTP server (it was created by
  // us and passed into the Server constructor), so this alone stops new
  // connections and drains existing ones — no separate server.close() call
  // needed.
  await new Promise((resolve) => io.close(resolve));
  await mongoose.connection.close();
  clearTimeout(forceExit);
  process.exit(0);
}

// Only when run directly (`node src/server.js`): tests import this module for
// app/server/shutdown and must not get process-wide signal/exit handlers.
if (require.main === module) {
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // An uncaught exception leaves the process in an unknown state — Node's own
  // docs recommend logging and exiting rather than trying to keep going.
  // Unhandled rejections get the same treatment (Node's default since v15),
  // just logged in our structured format first.
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception — exiting", { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection — exiting", {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    process.exit(1);
  });

  start().catch((err) => {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  });
}

module.exports = { app, server, io, shutdown };
