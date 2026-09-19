// Uploads and downloads as a security boundary: who may read a stored file,
// what may be stored at all, and what a response is allowed to reveal.
// Before Task 9 every upload was written under a publicly served static
// directory, so knowing (or guessing) a URL was enough to read anyone's CV.
const fs = require("fs");
const path = require("path");
const { app, request, registerUser, createAdmin } = require("../helpers");
const User = require("../../src/modules/users/user.model");
const storage = require("../../src/common/storage");
const localStorage = require("../../src/common/storage/localStorage");

const as = (who) => ({ Authorization: `Bearer ${who.accessToken}` });

const PDF = Buffer.from("%PDF-1.4\nfake but correctly signed pdf\n%%EOF");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jfif-ish body")]);

const attachCv = (who, buffer = PDF, options = {}) =>
  request(app)
    .post("/api/v1/users/me/cv")
    .set(as(who))
    .attach("cv", buffer, { filename: "resume.pdf", contentType: "application/pdf", ...options });

const uploadCv = async (who, ...args) => {
  const res = await attachCv(who, ...args);
  expect(res.status).toBe(200);
  return (await User.findById(who.user._id).select("+cv")).cv.key;
};

const download = (who, id = "me") =>
  request(app)
    .get(`/api/v1/users/${id}/cv`)
    .set(as(who))
    .buffer()
    .parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });

let owner;
beforeEach(async () => {
  owner = await registerUser({ role: "candidate" });
});

describe("downloading a CV", () => {
  test("the owner gets the exact bytes back, as a non-renderable attachment", async () => {
    await uploadCv(owner);
    const res = await download(owner);

    expect(res.status).toBe(200);
    expect(res.body.equals(PDF)).toBe(true);
    expect(res.headers["content-type"]).toBe("application/pdf");
    // Never rendered inline, never sniffed into something executable, never
    // parked in a shared cache.
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="resume\.pdf"/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  test("requires authentication", async () => {
    await uploadCv(owner);
    expect((await request(app).get("/api/v1/users/me/cv")).status).toBe(401);
    expect((await request(app).get(`/api/v1/users/${owner.user._id}/cv`)).status).toBe(401);
  });

  // The core regression: the file is not reachable by identifier, only by
  // permission.
  test("another candidate cannot read it, by id or otherwise", async () => {
    await uploadCv(owner);
    const stranger = await registerUser({ role: "candidate" });

    const res = await download(stranger, owner.user._id);
    expect(res.status).toBe(403);
    expect(res.body.toString()).not.toContain("%PDF");
  });

  test("a recruiter may read it only after that user applied to one of their own jobs", async () => {
    await uploadCv(owner);
    const recruiter = await registerUser({ role: "recruiter" });
    const otherRecruiter = await registerUser({ role: "recruiter" });

    expect((await download(recruiter, owner.user._id)).status).toBe(403);

    const job = await request(app)
      .post("/api/v1/jobs")
      .set(as(recruiter))
      .send({
        title: "Backend Engineer",
        role: "Engineering",
        description: "Build and run the API",
        responsibilities: "Ship features",
        minSalary: 1000,
        maxSalary: 2000,
        salaryType: "monthly",
        expirationDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      });
    expect(job.status).toBe(201);
    await request(app)
      .post(`/api/v1/jobs/${job.body.data._id}/applications`)
      .set(as(owner))
      .send({ coverLetter: "I would really like to join this team" })
      .expect(201);

    expect((await download(recruiter, owner.user._id)).status).toBe(200);
    // A recruiter with no relationship to this applicant still gets nothing.
    expect((await download(otherRecruiter, owner.user._id)).status).toBe(403);
  });

  test("an admin may read it", async () => {
    await uploadCv(owner);
    const admin = await createAdmin();
    expect((await download(admin, owner.user._id)).status).toBe(200);
  });

  test("a deactivated account loses access to its own CV immediately", async () => {
    await uploadCv(owner);
    const admin = await createAdmin();
    await request(app)
      .patch(`/api/v1/users/${owner.user._id}/status`)
      .set(as(admin))
      .send({ isActive: false })
      .expect(200);

    expect((await download(owner)).status).toBe(401);
  });

  test("a deleted CV cannot be downloaded any more, and its file is gone", async () => {
    const key = await uploadCv(owner);
    expect((await request(app).delete("/api/v1/users/me/cv").set(as(owner))).status).toBe(204);

    const res = await download(owner);
    expect(res.status).toBe(404);
    expect(await storage.exists(key)).toBe(false);
  });

  // A row can outlive its file (an interrupted delete, a lost volume). That is
  // a clean 404, not a 500, and it never names a filesystem path.
  test("a missing file is a controlled 404 that discloses no path", async () => {
    const key = await uploadCv(owner);
    await storage.remove(key);

    const res = await download(owner);
    expect(res.status).toBe(404);
    const body = res.body.toString();
    expect(body).not.toMatch(/ENOENT|uploads|[A-Za-z]:\\|\/var\//);
  });

  test("a user without a CV gets a 404, not an error about files", async () => {
    expect((await download(owner)).status).toBe(404);
  });

  test("a path-traversal or malformed user id is rejected, not resolved", async () => {
    await uploadCv(owner);
    for (const id of ["..%2F..%2Fetc%2Fpasswd", "..", "%2e%2e%2f", "507f1f77bcf86cd799439011"]) {
      const res = await download(owner, id);
      expect([400, 404]).toContain(res.status);
    }
  });
});

describe("static file exposure", () => {
  test("the upload directory is not served over HTTP", async () => {
    const key = await uploadCv(owner);
    for (const url of [`/uploads/${key}`, `/${key}`, `/uploads/`, `/uploads/../package.json`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(404);
      expect(res.text || "").not.toContain("%PDF");
    }
  });
});

describe("what may be uploaded", () => {
  const post = (file, options) => request(app).post("/api/v1/users/me/cv").set(as(owner)).attach("cv", file, options);

  test.each([
    ["an executable renamed to .pdf and declared as one", Buffer.from("MZ\x90\x00executable"), {}],
    ["HTML content in a .pdf wrapper", Buffer.from("<html><script>alert(1)</script></html>"), {}],
    ["an SVG declared as a PDF", Buffer.from('<svg onload="alert(1)"></svg>'), {}],
    ["a shell script", Buffer.from("#!/bin/sh\nrm -rf /"), {}],
    ["an empty file", Buffer.alloc(0), {}],
    ["a truncated PDF signature", Buffer.from("%PD"), {}],
  ])("rejects %s", async (_, buffer) => {
    const res = await post(buffer, { filename: "resume.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("rejects a real PDF presented under a disallowed extension or type", async () => {
    expect((await post(PDF, { filename: "resume.exe", contentType: "application/pdf" })).status).toBe(400);
    expect((await post(PDF, { filename: "resume.pdf", contentType: "image/png" })).status).toBe(400);
    expect((await post(PDF, { filename: "resume.svg", contentType: "image/svg+xml" })).status).toBe(400);
    expect((await post(PDF, { filename: "resume.html", contentType: "text/html" })).status).toBe(400);
  });

  test("rejects a real image for a CV, and a real PDF for a contact image", async () => {
    expect((await post(JPEG, { filename: "resume.pdf", contentType: "application/pdf" })).status).toBe(400);

    const contact = await request(app)
      .post("/api/v1/contact")
      .field("firstName", "Jane")
      .field("lastName", "Doe")
      .field("email", "jane.files@example.com")
      .field("phoneNumber", "+10000000000")
      .attach("profileImage", PDF, { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(contact.status).toBe(400);
  });

  test("a file over the size limit is a 413, and nothing is stored", async () => {
    const before = await User.findById(owner.user._id);
    const oversized = Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024, 0x20)]);
    const res = await post(oversized, { filename: "resume.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(413);
    expect((await User.findById(owner.user._id)).cv).toEqual(before.cv);
  });

  test("a request with no file at all is a validation error", async () => {
    expect((await request(app).post("/api/v1/users/me/cv").set(as(owner))).status).toBe(400);
  });
});

describe("storage keys are server-generated", () => {
  // The client controls the filename and could send any field it likes; none
  // of it may influence where the bytes land or who owns them.
  test("a hostile filename and injected fields cannot steer the stored key", async () => {
    const victim = await registerUser({ role: "candidate" });
    const victimKey = await uploadCv(victim);

    const res = await request(app)
      .post("/api/v1/users/me/cv")
      .set(as(owner))
      .field("key", victimKey)
      .field("userId", String(victim.user._id))
      .field("cv[key]", "../../../etc/passwd")
      .attach("cv", PDF, { filename: "../../../etc/passwd.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);

    const key = (await User.findById(owner.user._id)).cv.key;
    expect(key).toMatch(/^cv\/[0-9a-f-]{36}\.pdf$/);
    expect(key).not.toBe(victimKey);
    // The name kept for the download header is sanitized, never a path.
    expect(res.body.data.cv.filename).not.toMatch(/[/\\]/);
    expect(res.body.data.cv.filename).not.toContain(String.fromCharCode(0));
    // The victim's own file and metadata are untouched.
    expect((await User.findById(victim.user._id)).cv.key).toBe(victimKey);
    expect((await download(victim)).status).toBe(200);
  });

  // A filename with a null byte makes the multipart part header itself
  // invalid: busboy rejects the body, which used to escape as a 500.
  test("a null byte in the filename is a controlled 400, not a crash", async () => {
    const res = await request(app)
      .post("/api/v1/users/me/cv")
      .set(as(owner))
      .attach("cv", PDF, { filename: `resume${String.fromCharCode(0)}.pdf`, contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((await User.findById(owner.user._id)).cv).toBeNull();
  });

  test("replacing a CV deletes only the caller's previous file", async () => {
    const otherUser = await registerUser({ role: "candidate" });
    const otherKey = await uploadCv(otherUser);
    const firstKey = await uploadCv(owner);
    const secondKey = await uploadCv(owner);

    expect(secondKey).not.toBe(firstKey);
    expect(await storage.exists(firstKey)).toBe(false); // no orphan left behind
    expect(await storage.exists(secondKey)).toBe(true);
    expect(await storage.exists(otherKey)).toBe(true);
    expect((await download(otherUser)).status).toBe(200);
  });

  test("deleting a CV touches nobody else's file", async () => {
    const otherUser = await registerUser({ role: "candidate" });
    const otherKey = await uploadCv(otherUser);
    await uploadCv(owner);

    await request(app).delete("/api/v1/users/me/cv").set(as(owner)).expect(204);
    expect(await storage.exists(otherKey)).toBe(true);
    expect((await download(otherUser)).status).toBe(200);
  });

  test("deleting when there is no CV is still a 204", async () => {
    await request(app).delete("/api/v1/users/me/cv").set(as(owner)).expect(204);
  });

  test("the storage key is never exposed to clients", async () => {
    await uploadCv(owner);
    const me = await request(app).get("/api/v1/users/me").set(as(owner));
    expect(me.body.data.cv.key).toBeUndefined();
    expect(me.body.data.cv.downloadPath).toBe("/api/v1/users/me/cv");
    expect(me.body.data.cv.filename).toBe("resume.pdf");
    expect(JSON.stringify(me.body)).not.toContain("cv/"); // no key leaked anywhere in the payload
  });
});

// The storage driver is the last place a key could become a filesystem path,
// so it re-validates rather than trusting its caller.
describe("the storage driver refuses to escape its root", () => {
  test.each([
    "../escaped.pdf",
    "cv/../../escaped.pdf",
    "/etc/passwd",
    "C:\\Windows\\win.ini",
    "cv/..\\..\\escaped.pdf",
    "cv/x\u0000.pdf",
    "",
  ])("rejects the key %j", async (key) => {
    await expect(localStorage.save(key, PDF)).rejects.toMatchObject({ statusCode: 404 });
    await expect(localStorage.read(key)).rejects.toMatchObject({ statusCode: 404 });
    expect(await localStorage.exists(key)).toBe(false);
    expect(fs.existsSync(path.resolve(localStorage.rootDir, "..", "escaped.pdf"))).toBe(false);
  });

  test("a URL-encoded traversal stays a literal name inside the root", async () => {
    // Nothing decodes keys, so this is just an oddly named file — and it still
    // lands under the upload root.
    await localStorage.save("cv/%2e%2e%2fescaped.pdf", PDF);
    expect(fs.existsSync(path.resolve(localStorage.rootDir, "..", "escaped.pdf"))).toBe(false);
    await localStorage.remove("cv/%2e%2e%2fescaped.pdf");
  });
});

describe("contact submission images", () => {
  const submit = (file) => {
    const req = request(app)
      .post("/api/v1/contact")
      .field("firstName", "Jane")
      .field("lastName", "Doe")
      .field("email", `jane.${Date.now()}@example.com`)
      .field("phoneNumber", "+10000000000");
    return file ? req.attach("profileImage", JPEG, { filename: "photo.jpg", contentType: "image/jpeg" }) : req;
  };

  test("only an admin can list submissions or download an image", async () => {
    const created = await submit(true);
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    expect((await request(app).get("/api/v1/contact")).status).toBe(401);
    expect((await request(app).get(`/api/v1/contact/${id}/image`)).status).toBe(401);
    expect((await request(app).get("/api/v1/contact").set(as(owner))).status).toBe(403);
    expect((await request(app).get(`/api/v1/contact/${id}/image`).set(as(owner))).status).toBe(403);

    const admin = await createAdmin();
    const listed = await request(app).get("/api/v1/contact").set(as(admin));
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((c) => c._id === id)).toBe(true);

    const image = await request(app).get(`/api/v1/contact/${id}/image`).set(as(admin));
    expect(image.status).toBe(200);
    expect(image.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(image.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("a submission without an image is a 404 on the image route", async () => {
    const created = await submit(false);
    const admin = await createAdmin();
    expect((await request(app).get(`/api/v1/contact/${created.body.data._id}/image`).set(as(admin))).status).toBe(404);
  });
});
