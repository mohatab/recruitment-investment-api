// Query-plan regressions. These assert *what the database has to do* to answer
// the application's most important queries — which index it uses, how many
// documents it touches, and whether it has to sort in memory — never how long
// it takes, so they are stable across machines and CI.
//
// Each case was measured first with scripts/db-explain.js against a much
// larger fixture (see docs/DATABASE.md); the numbers there are the evidence,
// these are the guard rails. The collections below are seeded with enough
// documents that a collection scan is never accidentally the cheapest plan,
// which is what makes an index assertion meaningful.
const mongoose = require("mongoose");
const Message = require("../../src/modules/messaging/message.model");
const Notification = require("../../src/modules/notifications/notification.model");
const User = require("../../src/modules/users/user.model");
const Startup = require("../../src/modules/investment/startups/startup.model");
const Job = require("../../src/modules/recruitment/jobs/job.model");

const oid = () => new mongoose.Types.ObjectId();
const SIZE = 400;
const alice = oid();
const bob = oid();
const roomId = [String(alice), String(bob)].sort().join(":");
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

// The facts a plan is judged on.
function summarize(explain) {
  const plan = JSON.stringify(explain.queryPlanner.winningPlan);
  const stats = explain.executionStats;
  return {
    index: (plan.match(/"indexName":"([^"]+)"/) || [])[1] ?? null,
    collectionScan: plan.includes("COLLSCAN"),
    blockingSort: /"stage":"SORT"/.test(plan),
    docsExamined: stats.totalDocsExamined,
    keysExamined: stats.totalKeysExamined,
    returned: stats.nReturned,
  };
}

const explainFind = async (model, filter, { sort, limit = 20, projection } = {}) => {
  let query = model.find(filter, projection).limit(limit);
  if (sort) query = query.sort(sort);
  return summarize(await query.explain("executionStats"));
};

// The shared setup empties every collection after each test, so the fixture is
// rebuilt per test rather than once — a plan assertion against an empty
// collection would prove nothing.
beforeEach(async () => {
  const now = Date.now();
  await Message.collection.insertMany(
    Array.from({ length: SIZE }, (_, i) => {
      const [sender, receiver] = i % 2 ? [alice, bob] : [bob, alice];
      return {
        sender,
        receiver,
        roomId,
        body: `m${i}`,
        delivered: false,
        // Deliberately tied timestamps: this is the case the (createdAt, _id)
        // order exists for, and the one that used to force an in-memory sort.
        createdAt: new Date(now - (i % 5) * 1000),
        updatedAt: new Date(),
      };
    })
  );

  const roles = ["candidate", "recruiter", "investor", "startup"];
  await User.collection.insertMany(
    Array.from({ length: SIZE }, (_, i) => ({
      firstName: `Plan${i}`,
      lastName: "Fixture",
      email: `plan.fixture.${i}@example.com`,
      password: "x".repeat(60),
      role: roles[i % roles.length],
      isActive: true,
      tokenVersion: 0,
      createdAt: daysAgo(i % 90),
      updatedAt: new Date(),
    }))
  );

  await Notification.collection.insertMany(
    Array.from({ length: SIZE }, (_, i) => {
      const broadcast = i % 2 === 0;
      return {
        message: `n${i}`,
        user: broadcast ? null : alice,
        targetRole: broadcast ? "candidate" : null,
        read: i % 3 === 0,
        readBy: [],
        createdAt: new Date(now - (i % 5) * 1000),
        updatedAt: new Date(),
      };
    })
  );

  await Startup.collection.insertMany(
    Array.from({ length: SIZE }, (_, i) => ({
      owner: oid(),
      name: `Startup ${i}`,
      description: "d".repeat(50),
      industries: [["fintech", "health", "saas"][i % 3]],
      stage: ["idea", "seed", "series-a"][i % 3],
      location: "Remote",
      totalRaisingCents: 10_000_00,
      raisedSoFarCents: 0,
      reservedCents: 0,
      minInvestmentCents: 1_000_00,
      previousRaisedCents: 0,
      createdAt: daysAgo(i % 90),
      updatedAt: new Date(),
    }))
  );

  await Job.collection.insertMany(
    Array.from({ length: SIZE }, (_, i) => ({
      recruiter: oid(),
      title: `Job ${i}`,
      role: "Engineering",
      description: "d".repeat(50),
      responsibilities: "r".repeat(50),
      minSalary: 1000,
      maxSalary: 2000,
      salaryType: "monthly",
      applyMethod: "platform",
      tags: [],
      vacancies: 1,
      location: "Remote",
      status: i % 4 === 0 ? "closed" : "open",
      expirationDate: new Date(now + 30 * 864e5),
      createdAt: daysAgo(i % 90),
      updatedAt: new Date(),
    }))
  );

  await Promise.all([Message, Notification, User, Startup, Job].map((m) => m.syncIndexes()));
});

describe("message history (the Task 10 total order)", () => {
  test("a page is read straight from the index, with no in-memory sort", async () => {
    const plan = await explainFind(Message, { roomId }, { sort: { createdAt: 1, _id: 1 } });

    expect(plan.collectionScan).toBe(false);
    expect(plan.index).toBe("roomId_1_createdAt_1__id_1");
    // The tiebreak is part of the index, so the server stops after one page
    // instead of sorting the whole conversation to break ties.
    expect(plan.blockingSort).toBe(false);
    expect(plan.docsExamined).toBeLessThanOrEqual(20);
    expect(plan.returned).toBe(20);
  });

  test("the reverse order is served by the same index", async () => {
    const plan = await explainFind(Message, { roomId }, { sort: { createdAt: -1, _id: -1 } });
    expect(plan.blockingSort).toBe(false);
    expect(plan.docsExamined).toBeLessThanOrEqual(20);
  });

  test("a conversation lookup can be answered from the index alone", async () => {
    // The roomId prefix of the same index is what countDocuments({ roomId })
    // walks: keys only, no document fetches.
    const plan = summarize(
      await Message.collection.find({ roomId }, { projection: { _id: 0, roomId: 1 } }).explain("executionStats")
    );
    expect(plan.collectionScan).toBe(false);
    expect(plan.docsExamined).toBe(0);
    expect(plan.returned).toBe(SIZE);
  });

  test("the conversation-partner lookup is answered from index keys alone", async () => {
    // conversationPartners() projects the other participant; that field is the
    // last key of the index, so the distinct is covered.
    const plan = summarize(
      await Message.collection
        .find({ sender: alice }, { projection: { receiver: 1, _id: 0 } })
        .explain("executionStats")
    );
    expect(plan.collectionScan).toBe(false);
    expect(plan.docsExamined).toBe(0);
    expect(plan.returned).toBeGreaterThan(0);
  });
});

describe("notification lists", () => {
  const audience = { $or: [{ user: alice }, { user: null, targetRole: "candidate" }] };

  test("the audience query is index-ordered, examining about a page of documents", async () => {
    const plan = await explainFind(Notification, audience, { sort: { createdAt: -1, _id: -1 } });

    expect(plan.collectionScan).toBe(false);
    expect(plan.blockingSort).toBe(false);
    // An $or merges two index scans, so a page can touch a little more than
    // its own size — but it is bounded by the page, not by the audience.
    expect(plan.docsExamined).toBeLessThanOrEqual(60);
    expect(plan.returned).toBe(20);
  });

  test("the unread filter stays index-ordered too", async () => {
    const plan = await explainFind(
      Notification,
      {
        $or: [
          { user: alice, read: false },
          { user: null, targetRole: "candidate", readBy: { $ne: alice } },
        ],
      },
      { sort: { createdAt: -1, _id: -1 } }
    );
    expect(plan.collectionScan).toBe(false);
    expect(plan.blockingSort).toBe(false);
  });
});

describe("admin and browse lists", () => {
  test("the admin user list uses an index with and without a role filter", async () => {
    const byRole = await explainFind(User, { role: "candidate" }, { sort: { createdAt: -1 } });
    expect(byRole.index).toBe("role_1_createdAt_-1");
    expect(byRole.blockingSort).toBe(false);
    expect(byRole.docsExamined).toBeLessThanOrEqual(20);

    const unfiltered = await explainFind(User, {}, { sort: { createdAt: -1 } });
    expect(unfiltered.collectionScan).toBe(false);
    expect(unfiltered.blockingSort).toBe(false);
    expect(unfiltered.docsExamined).toBeLessThanOrEqual(20);
  });

  test("startup browsing uses an index with and without filters", async () => {
    const filtered = await explainFind(Startup, { industries: "fintech", stage: "seed" }, { sort: { createdAt: -1 } });
    expect(filtered.collectionScan).toBe(false);
    expect(filtered.blockingSort).toBe(false);

    const unfiltered = await explainFind(Startup, {}, { sort: { createdAt: -1 } });
    expect(unfiltered.collectionScan).toBe(false);
    expect(unfiltered.blockingSort).toBe(false);
  });

  test("the public job list reads roughly a page to return a page", async () => {
    const plan = await explainFind(
      Job,
      { status: "open", expirationDate: { $gt: new Date() } },
      { sort: { createdAt: -1 } }
    );
    expect(plan.index).toBe("status_1_createdAt_-1");
    expect(plan.blockingSort).toBe(false);
    expect(plan.returned).toBe(20);
    // The expiry cut-off is a residual predicate, so a few extra documents may
    // be read per page — a small multiple of the page, not the collection.
    expect(plan.docsExamined).toBeLessThan(100);
  });
});

// Indexes are only worth their write cost if each one answers a query. This
// fails if a future change leaves an index behind, or adds one nothing uses.
describe("the declared indexes are the ones the application needs", () => {
  test.each([
    [
      Message,
      ["_id_", "roomId_1_createdAt_1__id_1", "sender_1_createdAt_-1_receiver_1", "receiver_1_createdAt_-1_sender_1"],
    ],
    [Notification, ["_id_", "user_1_createdAt_-1__id_-1", "targetRole_1_createdAt_-1__id_-1"]],
    [User, ["_id_", "email_1", "role_1_createdAt_-1", "createdAt_-1"]],
    [Startup, ["_id_", "owner_1", "industries_1_stage_1_createdAt_-1", "createdAt_-1"]],
  ])("$modelName has exactly its documented indexes", async (model, expected) => {
    const names = (await model.collection.indexes()).map((i) => i.name).sort();
    expect(names).toEqual([...expected].sort());
  });
});
