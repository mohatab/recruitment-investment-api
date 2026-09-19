// The two pieces of realtime bookkeeping whose edge cases are hard to force
// through a real socket: connection reference counting and the per-socket
// event budget. socket.test.js covers them end to end; this pins the
// transitions themselves, including the ones a client cannot easily trigger.
const { markOnline, markOffline, isOnline, connectionCount, onlineUsers } = require("../../src/realtime/presence");
const { createEventBudget, EVENT_LIMIT, EVENT_WINDOW_MS } = require("../../src/realtime/socket");

const USER = "507f1f77bcf86cd799439011";

afterEach(() => onlineUsers.clear());

describe("presence reference counting", () => {
  test("only the first connection and the last disconnect are transitions", () => {
    expect(markOnline(USER, "s1")).toBe(true);
    expect(markOnline(USER, "s2")).toBe(false);
    expect(markOnline(USER, "s3")).toBe(false);
    expect(connectionCount(USER)).toBe(3);

    expect(markOffline(USER, "s1")).toBe(false);
    expect(markOffline(USER, "s2")).toBe(false);
    expect(isOnline(USER)).toBe(true);
    expect(markOffline(USER, "s3")).toBe(true);
    expect(isOnline(USER)).toBe(false);
    expect(connectionCount(USER)).toBe(0);
  });

  // A disconnect can arrive twice for the same socket (transport error then
  // close). Counting it twice would report a user with other tabs open as
  // offline — and, once the count went stale, never correct itself.
  test("a repeated disconnect for the same socket changes nothing", () => {
    markOnline(USER, "s1");
    markOnline(USER, "s2");

    expect(markOffline(USER, "s1")).toBe(false);
    expect(markOffline(USER, "s1")).toBe(false);
    expect(connectionCount(USER)).toBe(1);
    expect(isOnline(USER)).toBe(true);

    expect(markOffline(USER, "s2")).toBe(true);
    expect(markOffline(USER, "s2")).toBe(false); // nothing left to remove
  });

  test("a disconnect for a user who was never online is not a transition", () => {
    expect(markOffline("nobody", "s1")).toBe(false);
    expect(isOnline("nobody")).toBe(false);
  });

  test("ids are compared as strings, however they arrive", () => {
    markOnline({ toString: () => USER }, "s1");
    expect(isOnline(USER)).toBe(true);
    expect(markOffline(USER, "s1")).toBe(true);
  });
});

describe("the per-socket event budget", () => {
  afterEach(() => jest.useRealTimers());

  test("allows exactly the limit, then refuses", () => {
    const withinBudget = createEventBudget();
    for (let i = 0; i < EVENT_LIMIT; i++) expect(withinBudget()).toBe(true);
    expect(withinBudget()).toBe(false);
    expect(withinBudget()).toBe(false);
  });

  test("a new window restores the full allowance", () => {
    jest.useFakeTimers();
    const withinBudget = createEventBudget();
    for (let i = 0; i < EVENT_LIMIT; i++) withinBudget();
    expect(withinBudget()).toBe(false);

    jest.advanceTimersByTime(EVENT_WINDOW_MS);
    expect(withinBudget()).toBe(true);
    for (let i = 1; i < EVENT_LIMIT; i++) expect(withinBudget()).toBe(true);
    expect(withinBudget()).toBe(false);
  });

  test("each socket gets its own budget", () => {
    const first = createEventBudget();
    const second = createEventBudget();
    for (let i = 0; i < EVENT_LIMIT; i++) first();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
