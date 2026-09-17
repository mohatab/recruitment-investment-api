const { app, request, registerUser, createAdmin } = require("../helpers");
const notificationService = require("../../src/modules/notifications/notification.service");

describe("notifications", () => {
  test("a user only sees their own notifications, not another user's", async () => {
    const userA = await registerUser({ role: "candidate" });
    const userB = await registerUser({ role: "candidate" });

    await notificationService.notifyUser(userA.user._id, "hello A");
    await notificationService.notifyUser(userB.user._id, "hello B");

    const resA = await request(app).get("/api/notifications").set("Authorization", `Bearer ${userA.accessToken}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.every((n) => n.message !== "hello B")).toBe(true);
  });

  test("a user cannot mark another user's notification as read", async () => {
    const owner = await registerUser({ role: "candidate" });
    const intruder = await registerUser({ role: "candidate" });
    const notification = await notificationService.notifyUser(owner.user._id, "private");

    const res = await request(app)
      .patch(`/api/notifications/${notification._id}/read`)
      .set("Authorization", `Bearer ${intruder.accessToken}`);
    expect(res.status).toBe(403);
  });

  test("the owner can mark their own notification as read", async () => {
    const owner = await registerUser({ role: "candidate" });
    const notification = await notificationService.notifyUser(owner.user._id, "hi");

    const res = await request(app)
      .patch(`/api/notifications/${notification._id}/read`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.read).toBe(true);
  });

  test("non-admin cannot broadcast a notification", async () => {
    const { accessToken } = await registerUser({ role: "candidate" });
    const res = await request(app)
      .post("/api/notifications/broadcast")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ message: "spam", targetRole: "candidate" });
    expect(res.status).toBe(403);
  });

  test("an admin can broadcast to a role, and members of that role (only) see it", async () => {
    const admin = await createAdmin();
    const candidate = await registerUser({ role: "candidate" });
    const investor = await registerUser({ role: "investor" });

    const broadcastRes = await request(app)
      .post("/api/notifications/broadcast")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ message: "candidates: new feature", targetRole: "candidate" });
    expect(broadcastRes.status).toBe(200);

    const candidateInbox = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${candidate.accessToken}`);
    expect(candidateInbox.body.data.some((n) => n.message === "candidates: new feature")).toBe(true);

    const investorInbox = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${investor.accessToken}`);
    expect(investorInbox.body.data.some((n) => n.message === "candidates: new feature")).toBe(false);
  });

  // Regression: a role broadcast had one shared `read` flag, and any
  // authenticated user (any role) could flip it for the whole audience.
  describe("role broadcasts", () => {
    const inbox = async (who) =>
      (await request(app).get("/api/notifications").set("Authorization", `Bearer ${who.accessToken}`)).body.data;
    const markRead = (who, id) =>
      request(app).patch(`/api/notifications/${id}/read`).set("Authorization", `Bearer ${who.accessToken}`);

    async function broadcastToCandidates() {
      const admin = await createAdmin();
      const res = await request(app)
        .post("/api/notifications/broadcast")
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
      .post("/api/notifications/broadcast")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ message: "ambiguous" });
    expect(res.status).toBe(400);
  });
});
