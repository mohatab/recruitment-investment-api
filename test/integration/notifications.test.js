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

  test("broadcast requires exactly one of userId or targetRole", async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post("/api/notifications/broadcast")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ message: "ambiguous" });
    expect(res.status).toBe(400);
  });
});
