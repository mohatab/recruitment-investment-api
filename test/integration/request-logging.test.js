process.env.LOG_LEVEL = "info"; // local to this file (see rate-limit.test.js)

const { app, request, registerUser } = require("../helpers");

let lines;
beforeEach(() => {
  lines = [];
  const capture = (line) => lines.push(JSON.parse(line));
  jest.spyOn(console, "log").mockImplementation(capture);
  jest.spyOn(console, "warn").mockImplementation(capture);
  jest.spyOn(console, "error").mockImplementation(capture);
});
afterEach(() => jest.restoreAllMocks());

// The log line is written on the response's "finish" event, which can land
// just after supertest resolves.
const accessLog = async (requestId) => {
  for (let i = 0; i < 20 && !lines.some((l) => l.meta?.requestId === requestId); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return lines.find((l) => l.message === "request completed" && l.meta.requestId === requestId);
};

describe("structured request logging", () => {
  test("logs one structured line per request with id, method, route, status and duration", async () => {
    const { user, accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/v1/users/me?secret=querytoken")
      .set("Authorization", `Bearer ${accessToken}`);

    const entry = await accessLog(res.headers["x-request-id"]);
    expect(entry.level).toBe("info");
    expect(entry.timestamp).toEqual(expect.any(String));
    expect(entry.meta).toMatchObject({
      method: "GET",
      path: "/api/v1/users/me",
      route: "/api/v1/users/me",
      status: 200,
      userId: user._id,
    });
    expect(entry.meta.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify(entry)).not.toContain("querytoken");
  });

  test("client errors are logged at warn with their error code, and never include the request body", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "who@example.com", password: "hunter2hunter2" });

    const entry = await accessLog(res.headers["x-request-id"]);
    expect(entry.level).toBe("warn");
    expect(entry.meta).toMatchObject({ status: 401, errorCode: "UNAUTHORIZED" });
    const everything = JSON.stringify(lines);
    expect(everything).not.toContain("hunter2hunter2");
    expect(everything).not.toContain("who@example.com");
  });

  test("4xx errors do not produce a separate error-level entry with a stack trace", async () => {
    await request(app).get("/api/v1/jobs/not-an-id");
    expect(lines.filter((l) => l.level === "error")).toEqual([]);
  });
});
