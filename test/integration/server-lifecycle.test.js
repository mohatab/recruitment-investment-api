const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const mongoose = require("mongoose");
const request = require("supertest");
const jsonwebtoken = require("jsonwebtoken");
const { io: ioClient } = require("socket.io-client");
const User = require("../../src/modules/users/user.model");

const SERVER = path.join(__dirname, "../../src/server.js");

const freePort = () =>
  new Promise((resolve) => {
    const srv = net.createServer().listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

// Runs the real entrypoint as a child process. Every variable the app reads
// is set explicitly (blank = unset) so a developer's local .env can't leak in.
function runServer(overrides) {
  const env = {
    ...process.env,
    NODE_ENV: "development",
    LOG_LEVEL: "info",
    JWT_ACCESS_SECRET: "lifecycle-access",
    JWT_REFRESH_SECRET: "lifecycle-refresh",
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    ...overrides,
  };
  const child = spawn(process.execPath, [SERVER], { env });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  const waitFor = async (pattern, ms = 15000) => {
    const deadline = Date.now() + ms;
    while (!pattern.test(output)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${pattern}; output:\n${output}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  return { child, exited, waitFor, output: () => output };
}

describe("process startup", () => {
  test("exits non-zero with a clear message naming every missing variable", async () => {
    const proc = runServer({ MONGODB_URI: "", JWT_ACCESS_SECRET: "", JWT_REFRESH_SECRET: "" });
    expect(await proc.exited).toBe(1);
    expect(proc.output()).toMatch(/Invalid environment configuration/);
    expect(proc.output()).toMatch(/"MONGODB_URI" is required/);
    expect(proc.output()).toMatch(/"JWT_ACCESS_SECRET" is required/);
    expect(proc.output()).toMatch(/Refusing to start/);
  });

  test("exits non-zero when production safety requirements are unmet", async () => {
    const proc = runServer({ NODE_ENV: "production", MONGODB_URI: process.env.MONGODB_URI, CORS_ORIGIN: "*" });
    expect(await proc.exited).toBe(1);
    expect(proc.output()).toMatch(/CORS_ORIGIN/);
    expect(proc.output()).toMatch(/STRIPE_SECRET_KEY/);
  });

  test("starts with a valid configuration, connects to MongoDB and reports ready", async () => {
    const port = await freePort();
    const proc = runServer({ PORT: String(port), MONGODB_URI: process.env.MONGODB_URI });
    try {
      await proc.waitFor(/Server listening on port/);
      expect(proc.output()).toMatch(/Connected to MongoDB/);
      const res = await request(`http://127.0.0.1:${port}`).get("/health/ready");
      expect(res.status).toBe(200);
    } finally {
      proc.child.kill();
      await proc.exited;
    }
  });
});

// Audit C1, end to end against the real entrypoint: before the fix, the first
// malformed event below made `node src/server.js` exit with code 1.
describe("malformed Socket.IO events against the real server process", () => {
  test("the process stays up and keeps serving HTTP and sockets", async () => {
    const port = await freePort();
    const proc = runServer({ PORT: String(port), MONGODB_URI: process.env.MONGODB_URI });
    const clients = [];
    try {
      await proc.waitFor(/Server listening on port/);
      const [alice, bob] = await User.create([
        { firstName: "A", lastName: "A", email: "a@example.com", password: "password123", emailVerifiedAt: new Date() },
        { firstName: "B", lastName: "B", email: "b@example.com", password: "password123", emailVerifiedAt: new Date() },
      ]);
      // Signed with the child process's secret (see runServer).
      const token = jsonwebtoken.sign({ sub: String(alice._id), role: "candidate", ver: 0 }, "lifecycle-access", {
        algorithm: "HS256",
        expiresIn: "5m",
      });
      const socket = ioClient(`http://127.0.0.1:${port}`, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
      });
      clients.push(socket);
      await new Promise((resolve, reject) => socket.once("connect", resolve).once("connect_error", reject));

      socket.emit("chat:message", null);
      socket.emit("chat:message");
      socket.emit("chat:message", "string");
      socket.emit("chat:message", { receiverId: { $gt: "" }, body: 1 }, "not-a-callback");
      const nullAck = await socket.timeout(3000).emitWithAck("chat:message", null);
      expect(nullAck.error.code).toBe("VALIDATION_ERROR");

      const ok = await socket.timeout(3000).emitWithAck("chat:message", { receiverId: String(bob._id), body: "hi" });
      expect(ok.ok).toBe(true);
      expect((await request(`http://127.0.0.1:${port}`).get("/health")).status).toBe(200);
      expect(proc.child.exitCode).toBeNull();
      expect(proc.output()).not.toMatch(/Unhandled promise rejection|Uncaught exception/);
    } finally {
      clients.forEach((c) => c.close());
      proc.child.kill();
      await proc.exited;
    }
  });
});

describe("graceful shutdown", () => {
  test("flips readiness to 503, closes HTTP and MongoDB, then exits 0", async () => {
    const { app, server, shutdown } = require("../../src/server");
    const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
    await new Promise((resolve) => server.listen(0, resolve));

    const draining = shutdown("SIGTERM");
    expect((await request(app).get("/health/ready")).status).toBe(503);
    await draining;

    expect(server.listening).toBe(false);
    expect(mongoose.connection.readyState).toBe(0);
    expect(exit).toHaveBeenCalledWith(0);

    exit.mockRestore();
    await mongoose.connect(process.env.MONGODB_URI); // test/setup.js tears down through this connection
  });
});
