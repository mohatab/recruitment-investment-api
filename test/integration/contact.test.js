const { app, request } = require("../helpers");

describe("public contact form", () => {
  test("submits successfully without an image (no authentication required)", async () => {
    const res = await request(app).post("/api/v1/contact").send({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phoneNumber: "+10000000000",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.image).toBeNull();
  });

  test("rejects a submission missing required fields", async () => {
    const res = await request(app).post("/api/v1/contact").send({ firstName: "Jane" });
    expect(res.status).toBe(400);
  });

  test("accepts an optional profile image and rejects a disallowed file type", async () => {
    const withImage = await request(app)
      .post("/api/v1/contact")
      .field("firstName", "Jane")
      .field("lastName", "Doe")
      .field("email", "jane2@example.com")
      .field("phoneNumber", "+10000000000")
      // A real JPEG signature: the bytes are checked now, not just the extension.
      .attach("profileImage", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      });
    expect(withImage.status).toBe(201);
    expect(withImage.body.data.image).toMatchObject({ contentType: "image/jpeg", filename: "photo.jpg" });
    expect(withImage.body.data.image.key).toBeUndefined();
    expect(withImage.body.data.image.downloadPath).toMatch(/^\/api\/v1\/contact\/[a-f0-9]{24}\/image$/);

    const badType = await request(app)
      .post("/api/v1/contact")
      .field("firstName", "Jane")
      .field("lastName", "Doe")
      .field("email", "jane3@example.com")
      .field("phoneNumber", "+10000000000")
      .attach("profileImage", Buffer.from("not an image"), {
        filename: "malware.exe",
        contentType: "application/octet-stream",
      });
    expect(badType.status).toBe(400);
  });
});
