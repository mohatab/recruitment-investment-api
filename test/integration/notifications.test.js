const { app, request, registerUser } = require("../helpers");
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

  test("non-admin cannot broadcast a notification", async () => {
    const { accessToken } = await registerUser({ role: "candidate" });
    const res = await request(app)
      .post("/api/notifications/broadcast")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ message: "spam", targetRole: "candidate" });
    expect(res.status).toBe(403);
  });
});
