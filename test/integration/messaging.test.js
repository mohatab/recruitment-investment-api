// Direct messaging over REST. The socket path calls the same service, and
// socket.test.js asserts the two agree; what is pinned here is the domain
// contract itself: who may send to whom, what may be stored, and what a list
// endpoint returns.
const { app, request, registerUser, createAdmin } = require("../helpers");
const Message = require("../../src/modules/messaging/message.model");
const mongoose = require("mongoose");

const as = (who) => ({ Authorization: `Bearer ${who.accessToken}` });
const send = (who, receiverId, body = "hello there", extra = {}) =>
  request(app)
    .post("/api/v1/messages")
    .set(as(who))
    .send({ receiverId, body, ...extra });
const history = (who, otherId, query = "") => request(app).get(`/api/v1/messages/${otherId}${query}`).set(as(who));

describe("messaging", () => {
  test("sending a message and reading it back from both sides", async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const sendRes = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ receiverId: bob.user._id, body: "hey bob" });
    expect(sendRes.status).toBe(201);

    const aliceView = await request(app)
      .get(`/api/v1/messages/${bob.user._id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    const bobView = await request(app)
      .get(`/api/v1/messages/${alice.user._id}`)
      .set("Authorization", `Bearer ${bob.accessToken}`);
    expect(aliceView.body.data.length).toBe(1);
    expect(bobView.body.data.length).toBe(1);
    expect(bobView.body.data[0].body).toBe("hey bob");
  });

  test("a third party's history request with either party returns no shared messages", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const eve = await registerUser();

    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ receiverId: bob.user._id, body: "private" });

    // Eve asking for "her conversation with bob" is a *different* room than
    // alice-bob's — the room id is derived from the two real participants,
    // so this can never return alice & bob's messages.
    const eveView = await request(app)
      .get(`/api/v1/messages/${bob.user._id}`)
      .set("Authorization", `Bearer ${eve.accessToken}`);
    expect(eveView.status).toBe(200);
    expect(eveView.body.data.length).toBe(0);
  });

  test("conversations list shows the other participant and last message", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ receiverId: bob.user._id, body: "hi" });

    const res = await request(app)
      .get("/api/v1/messages/conversations")
      .set("Authorization", `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].lastMessage).toBe("hi");
  });
});

describe("who may send to whom", () => {
  test("the sender is always the session user — client-supplied identity is ignored", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const mallory = await registerUser();

    const res = await send(alice, bob.user._id, "from alice", {
      sender: mallory.user._id,
      senderId: mallory.user._id,
      userId: mallory.user._id,
      owner: mallory.user._id,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.sender).toBe(alice.user._id);

    const stored = await Message.findById(res.body.data._id).lean();
    expect(String(stored.sender)).toBe(alice.user._id);
    // Mallory's conversation list stays empty: nothing was attributed to them.
    const inbox = await request(app).get("/api/v1/messages/conversations").set(as(mallory));
    expect(inbox.body.data).toEqual([]);
  });

  test("a client cannot forge the stored room, timestamps or delivery state", async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const res = await send(alice, bob.user._id, "hi", {
      roomId: "000000000000000000000000:111111111111111111111111",
      delivered: true,
      read: true,
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
      _id: "507f1f77bcf86cd799439011",
    });
    expect(res.status).toBe(201);

    const stored = await Message.findById(res.body.data._id).lean();
    expect(stored.roomId).toBe([alice.user._id, bob.user._id].sort().join(":"));
    expect(stored.delivered).toBe(false); // nobody is connected in this test
    expect(new Date(stored.createdAt).getFullYear()).toBe(new Date().getFullYear());
    expect(String(stored._id)).not.toBe("507f1f77bcf86cd799439011");
    expect(stored.read).toBeUndefined();
  });

  test("messaging yourself is refused", async () => {
    const alice = await registerUser();
    const res = await send(alice, alice.user._id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SELF_MESSAGE_NOT_ALLOWED");
    expect(await Message.countDocuments({ sender: alice.user._id })).toBe(0);
  });

  test("a missing and a deactivated recipient are indistinguishable, and neither receives anything", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const admin = await createAdmin();
    await request(app).patch(`/api/v1/users/${bob.user._id}/status`).set(as(admin)).send({ isActive: false });

    const ghost = await send(alice, "507f1f77bcf86cd799439011");
    const disabled = await send(alice, bob.user._id);
    expect(ghost.status).toBe(404);
    expect(disabled.status).toBe(404);
    // Same code and message: the response does not disclose that bob exists.
    expect(disabled.body.error).toEqual(ghost.body.error);
    expect(await Message.countDocuments({})).toBe(0);
  });

  test.each([
    ["a malformed recipient id", { receiverId: "not-an-id" }],
    ["a recipient id of the wrong length", { receiverId: "507f1f77" }],
    ["a Mongo operator instead of an id", { receiverId: { $ne: null } }],
    ["an empty body", { body: "" }],
    ["a whitespace-only body", { body: "     " }],
    ["a body over the limit", { body: "x".repeat(5001) }],
    ["a non-string body", { body: { $ne: null } }],
    ["an array body", { body: ["hi"] }],
    ["no body at all", { body: undefined }],
  ])("rejects %s", async (_, overrides) => {
    const alice = await registerUser();
    const bob = await registerUser();
    const res = await request(app)
      .post("/api/v1/messages")
      .set(as(alice))
      .send({ receiverId: bob.user._id, body: "ok", ...overrides });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await Message.countDocuments({})).toBe(0);
  });

  test("a body is trimmed and stored verbatim — markup is data, not markup", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const payload = "  <script>alert(1)</script> and an emoji 👋 and a ☃ snowman  ";

    const res = await send(alice, bob.user._id, payload);
    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe(payload.trim());
    // Stored as text: there is no execution context here, and escaping belongs
    // to whatever renders it (this API always answers JSON).
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  test("sending requires authentication", async () => {
    const bob = await registerUser();
    const res = await request(app).post("/api/v1/messages").send({ receiverId: bob.user._id, body: "hi" });
    expect(res.status).toBe(401);
  });
});

describe("message history", () => {
  test("a malformed partner id is a 400, not a silently empty conversation", async () => {
    const alice = await registerUser();
    for (const id of ["not-an-id", "..%2F..", "507f1f77", "%7B%7D"]) {
      const res = await history(alice, id);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  test("ordering is total even when timestamps collide, so pages never repeat or skip", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    // A tie the storage engine cannot resolve the way we want by accident:
    // every message shares one millisecond, and the ids are written in
    // *descending* order, so insertion order and id order disagree. Only an
    // explicit tiebreak produces a defined result.
    const roomId = [alice.user._id, bob.user._id].sort().join(":");
    const when = new Date("2026-01-01T00:00:00.000Z");
    const ids = ["6a".padEnd(24, "4"), "6a".padEnd(24, "3"), "6a".padEnd(24, "2"), "6a".padEnd(24, "1")];
    await Message.collection.insertMany(
      ids.map((id, i) => ({
        _id: new mongoose.Types.ObjectId(id),
        sender: new mongoose.Types.ObjectId(alice.user._id),
        receiver: new mongoose.Types.ObjectId(bob.user._id),
        roomId,
        body: `msg ${i}`,
        delivered: false,
        createdAt: when,
        updatedAt: when,
      }))
    );

    const page = (n) => history(alice, bob.user._id, `?page=${n}&limit=2`);
    const first = (await page(1)).body;
    const second = (await page(2)).body;
    const returned = [...first.data, ...second.data].map((m) => m._id);
    expect(new Set(returned).size).toBe(4); // no duplicates across pages
    expect(first.pagination).toMatchObject({ page: 1, limit: 2, total: 4, totalPages: 2 });
    // The declared order — (createdAt, then _id) — not whatever the storage
    // engine happens to return for a tie.
    expect(returned).toEqual([...ids].sort());

    // And it is stable across repeated identical requests.
    expect((await page(1)).body.data.map((m) => m._id)).toEqual(first.data.map((m) => m._id));
  });

  test("oldest-first by default, newest-first on request", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await send(alice, bob.user._id, "first");
    await send(bob, alice.user._id, "second");

    expect((await history(alice, bob.user._id)).body.data.map((m) => m.body)).toEqual(["first", "second"]);
    expect((await history(alice, bob.user._id, "?sort=-createdAt")).body.data.map((m) => m.body)).toEqual([
      "second",
      "first",
    ]);
  });

  test("an unsortable field and an oversized limit are refused", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    expect((await history(alice, bob.user._id, "?sort=body")).status).toBe(400);
    expect((await history(alice, bob.user._id, "?limit=101")).status).toBe(400);
    expect((await history(alice, bob.user._id, "?limit=100")).status).toBe(200);
  });

  test("history requires authentication", async () => {
    const bob = await registerUser();
    expect((await request(app).get(`/api/v1/messages/${bob.user._id}`)).status).toBe(401);
  });

  test("the version key is not part of the message contract", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const res = await send(alice, bob.user._id);
    expect(res.body.data.__v).toBeUndefined();
    expect((await history(alice, bob.user._id)).body.data[0].__v).toBeUndefined();
  });
});

describe("conversations", () => {
  test("lists only the caller's own partners, newest activity first", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    const eve = await registerUser();

    await send(alice, bob.user._id, "to bob");
    await send(carol, alice.user._id, "to alice");

    const list = await request(app).get("/api/v1/messages/conversations").set(as(alice));
    expect(list.status).toBe(200);
    expect(list.body.data.map((c) => c.userId)).toEqual([carol.user._id, bob.user._id]);
    expect(list.body.data[0]).toMatchObject({ lastMessage: "to alice", isOnline: false });
    expect(list.body.pagination).toMatchObject({ page: 1, limit: 20, total: 2, totalPages: 1 });

    // Eve shares no messages with anyone: nobody else's conversation leaks.
    expect((await request(app).get("/api/v1/messages/conversations").set(as(eve))).body.data).toEqual([]);
  });

  test("the fixed ordering is declared, not silently ignored: sort is refused", async () => {
    const alice = await registerUser();
    const res = await request(app).get("/api/v1/messages/conversations?sort=createdAt").set(as(alice));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("paginates with the standard contract", async () => {
    const alice = await registerUser();
    const partners = [await registerUser(), await registerUser(), await registerUser()];
    for (const p of partners) await send(alice, p.user._id, "hi");

    const res = await request(app).get("/api/v1/messages/conversations?page=2&limit=2").set(as(alice));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });
});

// Nothing in this domain derives state from a counter, so a duplicate send is
// simply two messages rather than corrupted state. Pinned here so the
// semantics are a decision rather than an accident.
describe("duplicate sends", () => {
  test("retrying the same message stores it twice and leaves the conversation consistent", async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const [a, b] = await Promise.all([send(alice, bob.user._id, "same"), send(alice, bob.user._id, "same")]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data._id).not.toBe(b.body.data._id);

    const list = await request(app).get("/api/v1/messages/conversations").set(as(bob));
    expect(list.body.data.length).toBe(1); // still one conversation, not two
    expect((await history(bob, alice.user._id)).body.pagination.total).toBe(2);
  });

  test("two users messaging each other concurrently both persist, in one conversation", async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    await Promise.all([send(alice, bob.user._id, "from alice"), send(bob, alice.user._id, "from bob")]);
    const roomIds = await Message.distinct("roomId");
    expect(roomIds.length).toBe(1);
    expect((await history(alice, bob.user._id)).body.pagination.total).toBe(2);
  });
});

// The service is also called directly (by the socket handler), so its own
// guards must hold without the route's Joi layer in front of them.
describe("the service guards its inputs on its own", () => {
  const messageService = require("../../src/modules/messaging/message.service");

  test.each(["not-an-id", "", null, undefined, {}, "507f1f77"])("refuses %p as a partner id", async (id) => {
    const alice = await registerUser();
    await expect(messageService.listWith(alice.user._id, id, {})).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_ID",
    });
    await expect(messageService.send(alice.user._id, id, "hi")).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_ID",
    });
  });
});
