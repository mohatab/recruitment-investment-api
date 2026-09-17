// Real Socket.IO integration tests: an actual HTTP + Socket.IO server on an
// ephemeral port and the real socket.io-client, because both vulnerability
// classes covered here (joining another user's room, crashing the process
// with a malformed event) only exist at the transport level.
const http = require("http");
const { Server } = require("socket.io");
const { io: ioClient } = require("socket.io-client");
const jsonwebtoken = require("jsonwebtoken");
const { app, request, registerUser, createAdmin } = require("../helpers");
const { initSocket } = require("../../src/realtime/socket");
const { setIO } = require("../../src/realtime/ioRegistry");
const messageService = require("../../src/modules/messaging/message.service");
const User = require("../../src/modules/users/user.model");
const logger = require("../../src/common/utils/logger");
const env = require("../../src/config/env");

let server;
let port;
const unhandled = [];
const recordUnhandled = (reason) => unhandled.push(reason);

beforeAll((done) => {
  process.on("unhandledRejection", recordUnhandled);
  process.on("uncaughtException", recordUnhandled);
  server = http.createServer(app);
  const io = new Server(server);
  initSocket(io);
  setIO(io); // as server.js does: services deliver through the registry
  server.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  process.off("unhandledRejection", recordUnhandled);
  process.off("uncaughtException", recordUnhandled);
  setIO(null);
  server.close(done);
});

afterEach(() => jest.restoreAllMocks());

const clients = [];
afterEach(() => clients.splice(0).forEach((c) => c.close()));

function connectWithToken(token) {
  const client = ioClient(`http://localhost:${port}`, {
    auth: token ? { token } : {},
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(client);
  return client;
}

const connected = (client) =>
  new Promise((resolve, reject) => client.once("connect", resolve).once("connect_error", reject));
const rejected = (client) =>
  new Promise((resolve, reject) => {
    client.once("connect_error", resolve);
    client.once("connect", () => reject(new Error("should not have connected")));
  });
const emitWithAck = (client, ...args) => client.timeout(2000).emitWithAck(...args);

describe("Socket.IO handshake authentication", () => {
  test("connecting without a token is rejected", async () => {
    const err = await rejected(connectWithToken(null));
    expect(err.message).toMatch(/token/i);
  });

  test("connecting with a garbage token is rejected", async () => {
    await rejected(connectWithToken("not-a-real-jwt"));
  });

  test("a deactivated user's token is rejected", async () => {
    const { user, accessToken } = await registerUser();
    await User.updateOne({ _id: user._id }, { isActive: false });
    await rejected(connectWithToken(accessToken));
  });

  test("a token from a revoked session (logout-all) is rejected", async () => {
    const { accessToken } = await registerUser();
    await request(app).post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${accessToken}`).expect(200);
    await rejected(connectWithToken(accessToken));
  });

  test("revoking all sessions disconnects already-open sockets", async () => {
    const { accessToken } = await registerUser();
    const client = connectWithToken(accessToken);
    await connected(client);
    const disconnected = new Promise((resolve) => client.once("disconnect", resolve));
    await request(app).post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${accessToken}`).expect(200);
    await disconnected;
  });

  test("the server disconnects a socket when its access token expires", async () => {
    const { user } = await registerUser();
    const shortLived = jsonwebtoken.sign({ sub: user._id, role: user.role, ver: 0 }, env.jwt.accessSecret, {
      algorithm: "HS256",
      expiresIn: 1,
    });
    const client = connectWithToken(shortLived);
    await connected(client);
    const reason = await new Promise((resolve) => client.once("disconnect", resolve));
    expect(reason).toBe("io server disconnect");
  });
});

describe("presence (who may see that a user is online)", () => {
  const presenceEvents = (client) => {
    const events = [];
    client.on("presence", (e) => events.push(e));
    return events;
  };
  const settle = () => new Promise((r) => setTimeout(r, 250));

  // Regression: presence went to role_<role>, i.e. every user with the same
  // role, while REST only shows isOnline to conversation partners.
  test("only conversation partners are told; strangers with the same role are not", async () => {
    const [alice, partner, stranger] = await Promise.all([registerUser(), registerUser(), registerUser()]);
    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${partner.accessToken}`)
      .send({ receiverId: alice.user._id, body: "hello" })
      .expect(201);

    const partnerSocket = connectWithToken(partner.accessToken);
    const strangerSocket = connectWithToken(stranger.accessToken);
    await Promise.all([connected(partnerSocket), connected(strangerSocket)]);
    const partnerSaw = presenceEvents(partnerSocket);
    const strangerSaw = presenceEvents(strangerSocket);

    const aliceSocket = connectWithToken(alice.accessToken);
    await connected(aliceSocket);
    await settle();
    aliceSocket.close();
    await settle();

    expect(partnerSaw).toEqual([
      { userId: alice.user._id, online: true },
      { userId: alice.user._id, online: false },
    ]);
    expect(strangerSaw).toEqual([]);
  });

  test("a second tab doesn't re-announce online, and closing one of two tabs doesn't announce offline", async () => {
    const [alice, partner] = await Promise.all([registerUser(), registerUser()]);
    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ receiverId: partner.user._id, body: "hi" })
      .expect(201);
    const partnerSocket = connectWithToken(partner.accessToken);
    await connected(partnerSocket);
    const seen = presenceEvents(partnerSocket);

    const tab1 = connectWithToken(alice.accessToken);
    await connected(tab1);
    const tab2 = connectWithToken(alice.accessToken);
    await connected(tab2);
    tab1.close();
    await settle();
    expect(seen).toEqual([{ userId: alice.user._id, online: true }]);
  });
});

describe("admin deactivation", () => {
  test("disconnects the user's open sockets immediately", async () => {
    const { user, accessToken } = await registerUser();
    const admin = await createAdmin();
    const client = connectWithToken(accessToken);
    await connected(client);
    const disconnected = new Promise((resolve) => client.once("disconnect", resolve));
    await request(app)
      .patch(`/api/v1/users/${user._id}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ isActive: false })
      .expect(200);
    await disconnected;
  });
});

describe("chat:message", () => {
  test("a message reaches the intended recipient only, and the sender gets an ack", async () => {
    const [alice, bob, eve] = await Promise.all([registerUser(), registerUser(), registerUser()]);
    const [aliceSocket, bobSocket, eveSocket] = [alice, bob, eve].map((u) => connectWithToken(u.accessToken));
    await Promise.all([aliceSocket, bobSocket, eveSocket].map(connected));

    const bobReceived = new Promise((resolve) => bobSocket.on("message", resolve));
    let eveReceived = false;
    eveSocket.on("message", () => (eveReceived = true));

    const ack = await emitWithAck(aliceSocket, "chat:message", { receiverId: bob.user._id, body: "hi bob" });
    expect(ack).toMatchObject({ ok: true, data: { body: "hi bob" } });
    expect((await bobReceived).body).toBe("hi bob");
    await new Promise((r) => setTimeout(r, 200));
    expect(eveReceived).toBe(false);
  });

  test("applies the same recipient rules as REST: self is SELF_MESSAGE_NOT_ALLOWED, missing or deactivated is NOT_FOUND", async () => {
    const [sender, deactivated] = await Promise.all([registerUser(), registerUser()]);
    await User.updateOne({ _id: deactivated.user._id }, { isActive: false });
    const socket = connectWithToken(sender.accessToken);
    await connected(socket);

    const toSelf = await emitWithAck(socket, "chat:message", { receiverId: sender.user._id, body: "me" });
    expect(toSelf.error.code).toBe("SELF_MESSAGE_NOT_ALLOWED");
    for (const receiverId of ["507f1f77bcf86cd799439011", deactivated.user._id]) {
      const ack = await emitWithAck(socket, "chat:message", { receiverId, body: "x" });
      expect(ack).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "Recipient not found" } });
    }
  });
});

// Regression for audit C1: `socket.emit("chat:message", null)` threw inside
// an async listener, the rejection went unhandled, and server.js exited.
describe("malformed and failing socket events cannot crash the server", () => {
  let sender;
  let receiver;
  let socket;

  beforeEach(async () => {
    [sender, receiver] = await Promise.all([registerUser(), registerUser()]);
    socket = connectWithToken(sender.accessToken);
    await connected(socket);
  });

  // After each abuse, the same connection must still work end to end.
  async function expectStillServing() {
    const ack = await emitWithAck(socket, "chat:message", { receiverId: receiver.user._id, body: "still alive" });
    expect(ack.ok).toBe(true);
    expect((await request(app).get("/health")).status).toBe(200);
    expect(unhandled).toEqual([]);
  }

  test.each([
    ["null", null],
    ["a string", "hello"],
    ["a number", 42],
    ["an array", [1, 2, 3]],
    ["an empty object", {}],
    ["a non-ObjectId receiverId", { receiverId: "not-an-id", body: "x" }],
    ["an operator-injection receiverId", { receiverId: { $gt: "" }, body: "x" }],
    ["a non-string body", { receiverId: "507f1f77bcf86cd799439011", body: { nested: true } }],
    ["a whitespace-only body", { receiverId: "507f1f77bcf86cd799439011", body: "   " }],
    ["an oversized body", { receiverId: "507f1f77bcf86cd799439011", body: "x".repeat(5001) }],
  ])("payload that is %s gets a VALIDATION_ERROR ack", async (_, payload) => {
    const ack = await emitWithAck(socket, "chat:message", payload);
    expect(ack).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    await expectStillServing();
  });

  test("no payload at all, and no ack callback, does not crash", async () => {
    socket.emit("chat:message");
    socket.emit("chat:message", null);
    await new Promise((r) => setTimeout(r, 200));
    await expectStillServing();
  });

  test("a non-function in the ack position is ignored rather than called", async () => {
    socket.emit("chat:message", { receiverId: receiver.user._id, body: "x" }, "not-a-function");
    socket.emit("chat:message", null, 12345);
    await new Promise((r) => setTimeout(r, 200));
    await expectStillServing();
  });

  test("a handler that throws synchronously is caught, logged and acked as INTERNAL_ERROR", async () => {
    const logged = jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(messageService, "send").mockImplementationOnce(() => {
      throw new Error("sync boom");
    });

    const ack = await emitWithAck(socket, "chat:message", { receiverId: receiver.user._id, body: "x" });
    expect(ack).toEqual({ ok: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(logged).toHaveBeenCalledWith(
      "Socket event handler failed",
      expect.objectContaining({ event: "chat:message", userId: sender.user._id, error: "sync boom" })
    );
    await expectStillServing();
  });

  test("a handler whose promise rejects is caught, logged and acked as INTERNAL_ERROR", async () => {
    const logged = jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(messageService, "send").mockRejectedValueOnce(new Error("async boom"));

    const ack = await emitWithAck(socket, "chat:message", { receiverId: receiver.user._id, body: "x" });
    expect(ack.error.code).toBe("INTERNAL_ERROR");
    expect(logged).toHaveBeenCalledWith(
      "Socket event handler failed",
      expect.objectContaining({ error: "async boom" })
    );
    await expectStillServing();
  });

  test("the internal error message is never sent to the client", async () => {
    jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(messageService, "send").mockRejectedValueOnce(new Error("E11000 secret internal detail"));
    const ack = await emitWithAck(socket, "chat:message", { receiverId: receiver.user._id, body: "x" });
    expect(JSON.stringify(ack)).not.toContain("secret internal detail");
  });
});
