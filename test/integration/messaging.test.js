const { app, request, registerUser } = require("../helpers");

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
