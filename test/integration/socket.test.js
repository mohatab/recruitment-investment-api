// Real Socket.IO integration tests: an actual HTTP + Socket.IO server on an
// ephemeral port and the real socket.io-client, because both vulnerability
// classes covered here (joining another user's room, crashing the process
// with a malformed event) only exist at the transport level.
const http = require("http");
const { Server } = require("socket.io");
const { io: ioClient } = require("socket.io-client");
const jsonwebtoken = require("jsonwebtoken");
const { app, request, registerUser, createAdmin, waitFor } = require("../helpers");
const { initSocket, serverOptions, EVENT_LIMIT } = require("../../src/realtime/socket");
const { setIO } = require("../../src/realtime/ioRegistry");
const { isOnline, connectionCount } = require("../../src/realtime/presence");
const Message = require("../../src/modules/messaging/message.model");
const messageService = require("../../src/modules/messaging/message.service");
const User = require("../../src/modules/users/user.model");
const logger = require("../../src/common/utils/logger");
const env = require("../../src/config/env");

let server;
let port;
let io;
const unhandled = [];
const recordUnhandled = (reason) => unhandled.push(reason);

beforeAll((done) => {
  process.on("unhandledRejection", recordUnhandled);
  process.on("uncaughtException", recordUnhandled);
  server = http.createServer(app);
  // The same transport options production uses, so the payload cap is a
  // property of the server rather than of one entry point.
  io = new Server(server, serverOptions);
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

// Deterministic synchronisation. `until` polls for the state a test is
// actually waiting for, so a slow machine waits longer instead of failing;
// `quiet` is the bounded grace period used only to assert that *nothing*
// arrived, and only after something observable has already come back through
// the same path — there is no event to wait for in that case.
const until = (fn, timeoutMs = 5000) => waitFor(fn, { timeoutMs });
const quiet = () => new Promise((r) => setTimeout(r, 150));

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
    await until(() => partnerSaw.length === 1);
    aliceSocket.close();
    await until(() => partnerSaw.length === 2);

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
    await until(() => seen.length === 1);
    tab1.close();
    await quiet();
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
    await quiet();
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

// Rooms are the whole access-control surface of the realtime layer: a socket
// receives exactly what its rooms receive, so joining is never something a
// client may ask for.
describe("rooms are derived from the session, never from the client", () => {
  test("a socket is in exactly its own user room and its role room", async () => {
    const user = await registerUser({ role: "candidate" });
    const client = connectWithToken(user.accessToken);
    await connected(client);
    await until(() => [...io.sockets.sockets.values()].some((s) => s.user.id === user.user._id));

    const serverSocket = [...io.sockets.sockets.values()].find((s) => s.user.id === user.user._id);
    expect([...serverSocket.rooms].sort()).toEqual([serverSocket.id, `user_${user.user._id}`, "role_candidate"].sort());
  });

  test("no event lets a client join another user's room or a role room", async () => {
    const [alice, bob, eve] = await Promise.all([registerUser(), registerUser(), registerUser()]);
    const eveSocket = connectWithToken(eve.accessToken);
    const bobSocket = connectWithToken(bob.accessToken);
    const aliceSocket = connectWithToken(alice.accessToken);
    await Promise.all([eveSocket, bobSocket, aliceSocket].map(connected));

    // Every plausible spelling of "put me in that room".
    for (const event of ["join", "subscribe", "room:join", "chat:join", "conversation:join", "presence:subscribe"]) {
      eveSocket.emit(event, { room: `user_${bob.user._id}`, roomId: `user_${bob.user._id}`, userId: bob.user._id });
      eveSocket.emit(event, `user_${bob.user._id}`);
      eveSocket.emit(event, "role_admin");
    }
    await quiet();

    const eveServerSocket = [...io.sockets.sockets.values()].find((s) => s.user.id === eve.user._id);
    expect([...eveServerSocket.rooms]).not.toContain(`user_${bob.user._id}`);
    expect([...eveServerSocket.rooms]).not.toContain("role_admin");

    // And the delivery itself: a message for bob does not reach eve.
    let eveSaw = false;
    eveSocket.on("message", () => (eveSaw = true));
    const bobSaw = new Promise((resolve) => bobSocket.on("message", resolve));
    await emitWithAck(aliceSocket, "chat:message", { receiverId: bob.user._id, body: "for bob only" });
    expect((await bobSaw).body).toBe("for bob only");
    await quiet();
    expect(eveSaw).toBe(false);
  });

  test("an admin role broadcast reaches that role's sockets only", async () => {
    const admin = await createAdmin();
    const [candidate, recruiter] = await Promise.all([
      registerUser({ role: "candidate" }),
      registerUser({ role: "recruiter" }),
    ]);
    const candidateSocket = connectWithToken(candidate.accessToken);
    const recruiterSocket = connectWithToken(recruiter.accessToken);
    await Promise.all([candidateSocket, recruiterSocket].map(connected));

    const candidateSaw = new Promise((resolve) => candidateSocket.on("notification", resolve));
    let recruiterSaw = false;
    recruiterSocket.on("notification", () => (recruiterSaw = true));

    await request(app)
      .post("/api/v1/notifications/broadcast")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ targetRole: "candidate", message: "candidates only" })
      .expect(201);

    const received = await candidateSaw;
    expect(received.message).toBe("candidates only");
    expect(received.readBy).toBeUndefined(); // who else read it is never shipped
    await quiet();
    expect(recruiterSaw).toBe(false);
  });

  test("a personal notification reaches only its recipient's sockets", async () => {
    const admin = await createAdmin();
    const [target, other] = await Promise.all([registerUser(), registerUser()]);
    const targetSocket = connectWithToken(target.accessToken);
    const otherSocket = connectWithToken(other.accessToken);
    await Promise.all([targetSocket, otherSocket].map(connected));

    const targetSaw = new Promise((resolve) => targetSocket.on("notification", resolve));
    let otherSaw = false;
    otherSocket.on("notification", () => (otherSaw = true));

    await request(app)
      .post("/api/v1/notifications/broadcast")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ userId: target.user._id, message: "just for you" })
      .expect(201);

    expect((await targetSaw).message).toBe("just for you");
    await quiet();
    expect(otherSaw).toBe(false);
  });
});

describe("chat:message payload handling", () => {
  test("client-supplied identity and metadata are stripped, not stored", async () => {
    const [alice, bob, mallory] = await Promise.all([registerUser(), registerUser(), registerUser()]);
    const socket = connectWithToken(alice.accessToken);
    await connected(socket);

    const ack = await emitWithAck(socket, "chat:message", {
      receiverId: bob.user._id,
      body: "legit",
      sender: mallory.user._id,
      senderId: mallory.user._id,
      roomId: "anything:at:all",
      delivered: true,
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    expect(ack.ok).toBe(true);

    const stored = await Message.findById(ack.data._id).lean();
    expect(String(stored.sender)).toBe(alice.user._id);
    expect(stored.roomId).toBe([alice.user._id, bob.user._id].sort().join(":"));
    expect(new Date(stored.createdAt).getFullYear()).toBe(new Date().getFullYear());
  });

  test("delivered reflects server-side presence at the moment of writing", async () => {
    const [alice, bob] = await Promise.all([registerUser(), registerUser()]);
    const aliceSocket = connectWithToken(alice.accessToken);
    await connected(aliceSocket);

    const offline = await emitWithAck(aliceSocket, "chat:message", { receiverId: bob.user._id, body: "while away" });
    expect((await Message.findById(offline.data._id).lean()).delivered).toBe(false);

    const bobSocket = connectWithToken(bob.accessToken);
    await connected(bobSocket);
    const online = await emitWithAck(aliceSocket, "chat:message", { receiverId: bob.user._id, body: "while here" });
    expect((await Message.findById(online.data._id).lean()).delivered).toBe(true);
  });

  test.each([
    ["an empty body", { body: "" }],
    ["a whitespace-only body", { body: "    " }],
    ["a body past the 5000-character limit", { body: "x".repeat(5001) }],
    ["a malformed receiver id", { receiverId: "not-an-id" }],
    ["a Mongo operator as the receiver", { receiverId: { $ne: null } }],
    ["a missing receiver", { receiverId: undefined }],
  ])("rejects %s with a validation ack and stores nothing", async (_, overrides) => {
    const [alice, bob] = await Promise.all([registerUser(), registerUser()]);
    const socket = connectWithToken(alice.accessToken);
    await connected(socket);

    const before = await Message.countDocuments({});
    const ack = await emitWithAck(socket, "chat:message", { receiverId: bob.user._id, body: "ok", ...overrides });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe("VALIDATION_ERROR");
    expect(await Message.countDocuments({})).toBe(before);
  });

  // Ordering matters: a client that sees a "message" event assumes it is in
  // the transcript. Persist first, emit second.
  test("a failed write produces an error ack and no phantom message for the recipient", async () => {
    const [alice, bob] = await Promise.all([registerUser(), registerUser()]);
    const aliceSocket = connectWithToken(alice.accessToken);
    const bobSocket = connectWithToken(bob.accessToken);
    await Promise.all([aliceSocket, bobSocket].map(connected));

    let bobSaw = false;
    bobSocket.on("message", () => (bobSaw = true));
    jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(Message, "create").mockRejectedValue(new Error("write concern failed on shard 3"));

    const ack = await emitWithAck(aliceSocket, "chat:message", { receiverId: bob.user._id, body: "never stored" });
    expect(ack).toEqual({ ok: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    await quiet();
    expect(bobSaw).toBe(false);
    expect(await Message.countDocuments({ body: "never stored" })).toBe(0);
  });

  test("a realtime delivery failure does not fail a message that was persisted", async () => {
    const [alice, bob] = await Promise.all([registerUser(), registerUser()]);
    const socket = connectWithToken(alice.accessToken);
    await connected(socket);

    jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(io, "to").mockImplementation(() => {
      throw new Error("adapter unavailable");
    });

    const ack = await emitWithAck(socket, "chat:message", { receiverId: bob.user._id, body: "persisted anyway" });
    expect(ack.ok).toBe(true);
    expect(await Message.countDocuments({ body: "persisted anyway" })).toBe(1);
  });
});

describe("abuse protection", () => {
  test("a socket flooding events is throttled, and the throttled events write nothing", async () => {
    const [alice, bob] = await Promise.all([registerUser(), registerUser()]);
    const socket = connectWithToken(alice.accessToken);
    await connected(socket);

    const attempts = EVENT_LIMIT + 5;
    const acks = [];
    for (let i = 0; i < attempts; i++) {
      acks.push(await emitWithAck(socket, "chat:message", { receiverId: bob.user._id, body: `flood ${i}` }));
    }

    const accepted = acks.filter((a) => a.ok);
    const refused = acks.filter((a) => !a.ok);
    expect(accepted.length).toBe(EVENT_LIMIT);
    expect(refused.length).toBe(5);
    expect(refused.every((a) => a.error.code === "TOO_MANY_REQUESTS")).toBe(true);
    // Exactly the accepted ones exist: a throttled event is not a silent write.
    expect(await Message.countDocuments({ body: /^flood/ })).toBe(EVENT_LIMIT);
  });

  test("the limit is per socket, so one flooding tab does not mute another", async () => {
    const [alice, bob] = await Promise.all([registerUser(), registerUser()]);
    const tab1 = connectWithToken(alice.accessToken);
    const tab2 = connectWithToken(alice.accessToken);
    await Promise.all([tab1, tab2].map(connected));

    for (let i = 0; i < EVENT_LIMIT; i++) {
      await emitWithAck(tab1, "chat:message", { receiverId: bob.user._id, body: `t1-${i}` });
    }
    expect((await emitWithAck(tab1, "chat:message", { receiverId: bob.user._id, body: "over" })).error.code).toBe(
      "TOO_MANY_REQUESTS"
    );
    expect((await emitWithAck(tab2, "chat:message", { receiverId: bob.user._id, body: "fine" })).ok).toBe(true);
  });

  test("a frame larger than the transport limit cannot reach a handler, and the server survives", async () => {
    const [alice, bob] = await Promise.all([registerUser(), registerUser()]);
    const socket = connectWithToken(alice.accessToken);
    await connected(socket);
    const gone = new Promise((resolve) => socket.once("disconnect", resolve));

    socket.emit("chat:message", { receiverId: bob.user._id, body: "x".repeat(200_000) });
    await gone; // the connection is closed rather than the payload processed

    expect(await Message.countDocuments({})).toBe(0);
    expect(unhandled).toEqual([]);
    // The server is still serving: a fresh connection works.
    const again = connectWithToken(alice.accessToken);
    await connected(again);
  });
});

describe("presence across several connections", () => {
  const presenceEvents = (client) => {
    const events = [];
    client.on("presence", (e) => events.push(e));
    return events;
  };

  // Three tabs: the user stays online until the last one goes.
  test("a user with three connections stays online until the last disconnects", async () => {
    const [alice, partner] = await Promise.all([registerUser(), registerUser()]);
    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ receiverId: partner.user._id, body: "hi" })
      .expect(201);
    const partnerSocket = connectWithToken(partner.accessToken);
    await connected(partnerSocket);
    const seen = presenceEvents(partnerSocket);

    const tabs = [
      connectWithToken(alice.accessToken),
      connectWithToken(alice.accessToken),
      connectWithToken(alice.accessToken),
    ];
    await Promise.all(tabs.map(connected));
    await until(() => connectionCount(alice.user._id) === 3);
    await until(() => seen.length === 1);
    expect(seen).toEqual([{ userId: alice.user._id, online: true }]);

    tabs[0].close();
    tabs[1].close();
    await until(() => connectionCount(alice.user._id) === 1);
    expect(isOnline(alice.user._id)).toBe(true);
    expect(seen.length).toBe(1); // still no offline announcement

    tabs[2].close();
    await until(() => seen.length === 2);
    expect(isOnline(alice.user._id)).toBe(false);
    expect(seen).toEqual([
      { userId: alice.user._id, online: true },
      { userId: alice.user._id, online: false },
    ]);
  });

  test("reconnecting announces offline then online again, and leaves no stale connection", async () => {
    const [alice, partner] = await Promise.all([registerUser(), registerUser()]);
    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ receiverId: partner.user._id, body: "hi" })
      .expect(201);
    const partnerSocket = connectWithToken(partner.accessToken);
    await connected(partnerSocket);
    const seen = presenceEvents(partnerSocket);

    const first = connectWithToken(alice.accessToken);
    await connected(first);
    await until(() => seen.length === 1);
    first.close();
    await until(() => seen.length === 2);
    const second = connectWithToken(alice.accessToken);
    await connected(second);
    await until(() => seen.length === 3);

    expect(seen.map((e) => e.online)).toEqual([true, false, true]);
    expect(connectionCount(alice.user._id)).toBe(1);
  });

  test("many concurrent connects and disconnects leave a consistent count", async () => {
    const alice = await registerUser();
    const sockets = Array.from({ length: 5 }, () => connectWithToken(alice.accessToken));
    await Promise.all(sockets.map(connected));
    await until(() => connectionCount(alice.user._id) === 5);

    sockets.forEach((s) => s.close());
    await until(() => connectionCount(alice.user._id) === 0);
    expect(isOnline(alice.user._id)).toBe(false);
  });

  test("revoking sessions drops every connection of that user and marks them offline", async () => {
    const [alice, partner] = await Promise.all([registerUser(), registerUser()]);
    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ receiverId: partner.user._id, body: "hi" })
      .expect(201);
    const partnerSocket = connectWithToken(partner.accessToken);
    await connected(partnerSocket);
    const seen = presenceEvents(partnerSocket);

    const tabs = [connectWithToken(alice.accessToken), connectWithToken(alice.accessToken)];
    await Promise.all(tabs.map(connected));
    await until(() => connectionCount(alice.user._id) === 2);
    await until(() => seen.length === 1);

    await request(app).post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${alice.accessToken}`).expect(200);
    await until(() => connectionCount(alice.user._id) === 0);
    await until(() => seen.length === 2);

    expect(connectionCount(alice.user._id)).toBe(0);
    expect(seen.map((e) => e.online)).toEqual([true, false]);
    // And the revoked token cannot open a new socket.
    await expect(rejected(connectWithToken(alice.accessToken))).resolves.toBeTruthy();
  });

  test("presence is never broadcast to users who share no conversation", async () => {
    const [alice, stranger] = await Promise.all([registerUser(), registerUser()]);
    const strangerSocket = connectWithToken(stranger.accessToken);
    await connected(strangerSocket);
    const seen = presenceEvents(strangerSocket);

    const aliceSocket = connectWithToken(alice.accessToken);
    await connected(aliceSocket);
    await until(() => connectionCount(alice.user._id) === 1);
    aliceSocket.close();
    await until(() => connectionCount(alice.user._id) === 0);
    await quiet();
    expect(seen).toEqual([]);
  });
});
