const { app, request, registerUser, createAdmin } = require("../helpers");
const notificationService = require("../../src/modules/notifications/notification.service");
const Notification = require("../../src/modules/notifications/notification.model");
const mongoose = require("mongoose");

describe("notifications", () => {
  test("a user only sees their own notifications, not another user's", async () => {
    const userA = await registerUser({ role: "candidate" });
    const userB = await registerUser({ role: "candidate" });

    await notificationService.notifyUser(userA.user._id, "hello A");
    await notificationService.notifyUser(userB.user._id, "hello B");

    const resA = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${userA.accessToken}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.every((n) => n.message !== "hello B")).toBe(true);
  });

  test("a user cannot mark another user's notification as read", async () => {
    const owner = await registerUser({ role: "candidate" });
    const intruder = await registerUser({ role: "candidate" });
    const notification = await notificationService.notifyUser(owner.user._id, "private");

    const res = await request(app)
      .patch(`/api/v1/notifications/${notification._id}/read`)
      .set("Authorization", `Bearer ${intruder.accessToken}`);
    expect(res.status).toBe(403);
  });

  test("the owner can mark their own notification as read", async () => {
    const owner = await registerUser({ role: "candidate" });
    const notification = await notificationService.notifyUser(owner.user._id, "hi");

    const res = await request(app)
      .patch(`/api/v1/notifications/${notification._id}/read`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.read).toBe(true);
  });

  test("non-admin cannot broadcast a notification", async () => {
    const { accessToken } = await registerUser({ role: "candidate" });
    const res = await request(app)
      .post("/api/v1/notifications/broadcast")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ message: "spam", targetRole: "candidate" });
    expect(res.status).toBe(403);
  });

  test("an admin can broadcast to a role, and members of that role (only) see it", async () => {
    const admin = await createAdmin();
    const candidate = await registerUser({ role: "candidate" });
    const investor = await registerUser({ role: "investor" });

    const broadcastRes = await request(app)
      .post("/api/v1/notifications/broadcast")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ message: "candidates: new feature", targetRole: "candidate" });
    expect(broadcastRes.status).toBe(201);

    const candidateInbox = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${candidate.accessToken}`);
    expect(candidateInbox.body.data.some((n) => n.message === "candidates: new feature")).toBe(true);

    const investorInbox = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${investor.accessToken}`);
    expect(investorInbox.body.data.some((n) => n.message === "candidates: new feature")).toBe(false);
  });

  // Regression: a role broadcast had one shared `read` flag, and any
  // authenticated user (any role) could flip it for the whole audience.
  describe("role broadcasts", () => {
    const inbox = async (who) =>
      (await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${who.accessToken}`)).body.data;
    const markRead = (who, id) =>
      request(app).patch(`/api/v1/notifications/${id}/read`).set("Authorization", `Bearer ${who.accessToken}`);

    async function broadcastToCandidates() {
      const admin = await createAdmin();
      const res = await request(app)
        .post("/api/v1/notifications/broadcast")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ message: "candidates only", targetRole: "candidate" });
      return res.body.data;
    }

    test("a user outside the target role cannot mark it read, and nothing changes for the audience", async () => {
      const notification = await broadcastToCandidates();
      const [investor, candidate] = await Promise.all([
        registerUser({ role: "investor" }),
        registerUser({ role: "candidate" }),
      ]);

      const res = await markRead(investor, notification._id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect((await inbox(candidate)).find((n) => n._id === notification._id).read).toBe(false);
    });

    test("read state is per user: one candidate reading it doesn't mark it read for the others", async () => {
      const notification = await broadcastToCandidates();
      const [alice, bob] = await Promise.all([
        registerUser({ role: "candidate" }),
        registerUser({ role: "candidate" }),
      ]);

      const res = await markRead(alice, notification._id);
      expect(res.status).toBe(200);
      expect(res.body.data.read).toBe(true);
      expect((await inbox(alice)).find((n) => n._id === notification._id).read).toBe(true);
      expect((await inbox(bob)).find((n) => n._id === notification._id).read).toBe(false);
    });

    test("who has read a broadcast is never exposed to other recipients", async () => {
      const notification = await broadcastToCandidates();
      const [alice, bob] = await Promise.all([
        registerUser({ role: "candidate" }),
        registerUser({ role: "candidate" }),
      ]);
      await markRead(alice, notification._id).expect(200);

      const seenByBob = (await inbox(bob)).find((n) => n._id === notification._id);
      expect(seenByBob.readBy).toBeUndefined();
      expect(JSON.stringify(seenByBob)).not.toContain(alice.user._id);
    });

    test("a personal notification of another user of the same role is still forbidden, and unknown ids are 404", async () => {
      const [owner, sameRole] = await Promise.all([
        registerUser({ role: "candidate" }),
        registerUser({ role: "candidate" }),
      ]);
      const personal = await notificationService.notifyUser(owner.user._id, "private");
      expect((await markRead(sameRole, personal._id)).status).toBe(403);
      expect((await markRead(sameRole, "507f1f77bcf86cd799439011")).status).toBe(404);
    });
  });

  test("broadcast requires exactly one of userId or targetRole", async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post("/api/v1/notifications/broadcast")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ message: "ambiguous" });
    expect(res.status).toBe(400);
  });
});

describe("the read filter", () => {
  const list = (who, query = "") =>
    request(app)
      .get(`/api/v1/notifications${query}`)
      .set({ Authorization: `Bearer ${who.accessToken}` });
  const notify = (admin, body) =>
    request(app)
      .post("/api/v1/notifications/broadcast")
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .send(body);
  const markRead = (who, id) =>
    request(app)
      .patch(`/api/v1/notifications/${id}/read`)
      .set({ Authorization: `Bearer ${who.accessToken}` });

  // Regression: `read` was declared in the query schema and validated, but
  // listMine never applied it — ?read=false returned read notifications too.
  test("narrows personal notifications by their read flag", async () => {
    const admin = await createAdmin();
    const user = await registerUser();
    await notify(admin, { userId: user.user._id, message: "one" });
    await notify(admin, { userId: user.user._id, message: "two" });

    const all = await list(user);
    expect(all.body.pagination.total).toBe(2);
    await markRead(user, all.body.data[0]._id);

    const unread = await list(user, "?read=false");
    expect(unread.body.data.map((n) => n.message)).toEqual([all.body.data[1].message]);
    expect(unread.body.pagination.total).toBe(1);

    const read = await list(user, "?read=true");
    expect(read.body.data.map((n) => n.message)).toEqual([all.body.data[0].message]);
    expect(read.body.pagination.total).toBe(1);
  });

  test("narrows role broadcasts per reader, not globally", async () => {
    const admin = await createAdmin();
    const [ann, ben] = [await registerUser({ role: "candidate" }), await registerUser({ role: "candidate" })];
    await notify(admin, { targetRole: "candidate", message: "everyone" });

    const seen = await list(ann);
    await markRead(ann, seen.body.data[0]._id);

    expect((await list(ann, "?read=false")).body.data).toEqual([]);
    expect((await list(ann, "?read=true")).body.data.length).toBe(1);
    // Ben has not read it: for him it is still unread.
    expect((await list(ben, "?read=false")).body.data.length).toBe(1);
    expect((await list(ben, "?read=true")).body.data).toEqual([]);
  });

  test("a non-boolean read filter is refused", async () => {
    const user = await registerUser();
    expect((await list(user, "?read=maybe")).status).toBe(400);
    expect((await list(user, "?read=1")).status).toBe(400);
    expect((await list(user, "?read=true")).status).toBe(200);
    expect((await list(user, "?read=false")).status).toBe(200);
  });

  test("combines with pagination and keeps a total, declared order", async () => {
    const user = await registerUser();
    // One millisecond shared by every row, with ids written in ascending
    // order while the endpoint's declared order is newest-first: insertion
    // order and the required order disagree, so only an explicit tiebreak
    // gives a defined result.
    const when = new Date("2026-01-01T00:00:00.000Z");
    const ids = ["6b".padEnd(24, "1"), "6b".padEnd(24, "2"), "6b".padEnd(24, "3")];
    await Notification.collection.insertMany(
      ids.map((id, i) => ({
        _id: new mongoose.Types.ObjectId(id),
        message: `n${i}`,
        user: new mongoose.Types.ObjectId(user.user._id),
        targetRole: null,
        read: false,
        readBy: [],
        createdAt: when,
        updatedAt: when,
      }))
    );

    const page1 = await list(user, "?read=false&page=1&limit=2");
    const page2 = await list(user, "?read=false&page=2&limit=2");
    expect(page1.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const returned = [...page1.body.data, ...page2.body.data].map((n) => n._id);
    expect(new Set(returned).size).toBe(3);
    expect(returned).toEqual([...ids].sort().reverse()); // newest-first, ties by descending id
    expect((await list(user, "?read=false&page=1&limit=2")).body.data.map((n) => n._id)).toEqual(
      page1.body.data.map((n) => n._id)
    );
  });
});

describe("notification recipients are server-controlled", () => {
  const notify = (who, body) =>
    request(app)
      .post("/api/v1/notifications/broadcast")
      .set({ Authorization: `Bearer ${who.accessToken}` })
      .send(body);

  test("a deactivated account cannot be given notifications, and is indistinguishable from a missing one", async () => {
    const admin = await createAdmin();
    const user = await registerUser();
    await request(app)
      .patch(`/api/v1/users/${user.user._id}/status`)
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .send({ isActive: false });

    const disabled = await notify(admin, { userId: user.user._id, message: "hello" });
    const ghost = await notify(admin, { userId: "507f1f77bcf86cd799439011", message: "hello" });
    expect(disabled.status).toBe(404);
    expect(disabled.body.error).toEqual(ghost.body.error);
    expect(await Notification.countDocuments({ user: user.user._id })).toBe(0);
  });

  test.each([
    ["a malformed user id", { userId: "not-an-id", message: "x" }],
    ["an unknown role", { targetRole: "wizard", message: "x" }],
    ["both a user and a role", { userId: "507f1f77bcf86cd799439011", targetRole: "candidate", message: "x" }],
    ["neither a user nor a role", { message: "x" }],
    ["an empty message", { targetRole: "candidate", message: "" }],
    ["an oversized message", { targetRole: "candidate", message: "x".repeat(1001) }],
    ["a Mongo operator as the target", { userId: { $ne: null }, message: "x" }],
  ])("rejects %s", async (_, body) => {
    const admin = await createAdmin();
    const res = await notify(admin, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("a client cannot forge read state or ownership at creation time", async () => {
    const admin = await createAdmin();
    const user = await registerUser();
    const res = await notify(admin, {
      userId: user.user._id,
      message: "fresh",
      read: true,
      readBy: [user.user._id],
      user: admin.user._id,
    });
    expect(res.status).toBe(201);

    const stored = await Notification.findById(res.body.data._id).lean();
    expect(String(stored.user)).toBe(user.user._id);
    expect(stored.read).toBe(false);
    expect(stored.readBy).toEqual([]);
  });
});

describe("read operations are idempotent and isolated", () => {
  const markRead = (who, id) =>
    request(app)
      .patch(`/api/v1/notifications/${id}/read`)
      .set({ Authorization: `Bearer ${who.accessToken}` });
  const notify = (admin, body) =>
    request(app)
      .post("/api/v1/notifications/broadcast")
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .send(body);

  test("marking a personal notification read twice is stable", async () => {
    const admin = await createAdmin();
    const user = await registerUser();
    const created = await notify(admin, { userId: user.user._id, message: "x" });

    const first = await markRead(user, created.body.data._id);
    const second = await markRead(user, created.body.data._id);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.data.read).toBe(true);
  });

  test("concurrent reads of the same broadcast record one receipt per user", async () => {
    const admin = await createAdmin();
    const [ann, ben] = [await registerUser({ role: "candidate" }), await registerUser({ role: "candidate" })];
    const created = await notify(admin, { targetRole: "candidate", message: "concurrent" });
    const id = created.body.data._id;

    const results = await Promise.all([
      markRead(ann, id),
      markRead(ann, id),
      markRead(ann, id),
      markRead(ben, id),
      markRead(ben, id),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);

    const stored = await Notification.findById(id).lean();
    expect(stored.readBy.map(String).sort()).toEqual([ann.user._id, ben.user._id].sort());
    expect(stored.read).toBe(false); // the shared flag is never used for broadcasts
  });

  test("a malformed notification id is a controlled 400", async () => {
    const user = await registerUser();
    const res = await markRead(user, "not-an-id");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
  });

  test("marking read requires authentication", async () => {
    const admin = await createAdmin();
    const user = await registerUser();
    const created = await notify(admin, { userId: user.user._id, message: "x" });
    expect((await request(app).patch(`/api/v1/notifications/${created.body.data._id}/read`)).status).toBe(401);
  });
});

// Notifications raised as a side effect of another operation (a new
// application, a funded round) must never turn a committed write into a 500.
describe("side-effect notifications never fail their caller", () => {
  test("a failed write is logged and reported as no notification, not thrown", async () => {
    const user = await registerUser();
    const logger = require("../../src/common/utils/logger");
    jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(Notification, "create").mockRejectedValue(new Error("primary stepped down"));

    await expect(notificationService.notifyUserSafely(user.user._id, "hello")).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to deliver notification",
      expect.objectContaining({
        userId: String(user.user._id),
      })
    );
    jest.restoreAllMocks();
  });

  test("a delivery failure still leaves the notification readable over REST", async () => {
    const admin = await createAdmin();
    const user = await registerUser();
    const logger = require("../../src/common/utils/logger");
    jest.spyOn(logger, "error").mockImplementation(() => {});
    const { getIO, setIO } = require("../../src/realtime/ioRegistry");
    const previous = getIO();
    setIO({
      to() {
        throw new Error("adapter unavailable");
      },
    });

    const res = await request(app)
      .post("/api/v1/notifications/broadcast")
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .send({ userId: user.user._id, message: "persisted anyway" });
    setIO(previous);
    jest.restoreAllMocks();

    expect(res.status).toBe(201);
    const listed = await request(app)
      .get("/api/v1/notifications")
      .set({ Authorization: `Bearer ${user.accessToken}` });
    expect(listed.body.data.map((n) => n.message)).toContain("persisted anyway");
  });
});
