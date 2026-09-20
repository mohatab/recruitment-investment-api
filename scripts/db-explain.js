#!/usr/bin/env node
/**
 * Query-plan harness for the database audit (Task 11).
 *
 * Builds a realistic fixture dataset in a throwaway database, then runs
 * `explain("executionStats")` for every important query shape the application
 * actually issues and prints the facts that matter: which index won, how many
 * index keys and documents were examined to return how many, and whether the
 * server had to sort in memory (a blocking SORT stage).
 *
 * It asserts nothing and changes no application data — it is evidence for the
 * audit, and the regression tests in test/integration/query-plans.test.js pin
 * the conclusions it supports.
 *
 *   MONGODB_URI=mongodb://localhost:27017/perf-audit node scripts/db-explain.js [--keep]
 */
const mongoose = require("mongoose");

const User = require("../src/modules/users/user.model");
const Job = require("../src/modules/recruitment/jobs/job.model");
const Application = require("../src/modules/recruitment/applications/application.model");
const Message = require("../src/modules/messaging/message.model");
const Notification = require("../src/modules/notifications/notification.model");
const Investment = require("../src/modules/investment/investments/investment.model");
const Startup = require("../src/modules/investment/startups/startup.model");

const SIZES = {
  users: 2000,
  jobs: 5000,
  applications: 20000,
  messages: 40000,
  notifications: 20000,
  investments: 5000,
};
const oid = () => new mongoose.Types.ObjectId();
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const ROLES = ["candidate", "recruiter", "investor", "startup"];
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

async function seed() {
  const users = Array.from({ length: SIZES.users }, (_, i) => ({
    _id: oid(),
    firstName: `User${i}`,
    lastName: "Fixture",
    email: `fixture${i}@example.com`,
    password: "x".repeat(60),
    role: ROLES[i % ROLES.length],
    isActive: true,
    tokenVersion: 0,
    createdAt: daysAgo(i % 400),
    updatedAt: new Date(),
  }));
  const recruiters = users.filter((u) => u.role === "recruiter");
  const candidates = users.filter((u) => u.role === "candidate");

  const jobs = Array.from({ length: SIZES.jobs }, (_, i) => ({
    _id: oid(),
    recruiter: pick(recruiters)._id,
    title: `${pick(["Senior", "Junior", "Staff"])} ${pick(["Backend", "Frontend", "Data"])} Engineer ${i}`,
    role: pick(["Engineering", "Design", "Sales", "Marketing"]),
    description: "d".repeat(400),
    responsibilities: "r".repeat(400),
    minSalary: 1000 + (i % 50) * 100,
    maxSalary: 6000 + (i % 50) * 100,
    salaryType: "monthly",
    applyMethod: "platform",
    tags: [pick(["node", "react", "mongo", "aws"])],
    vacancies: 1,
    location: pick(["Cairo", "Berlin", "Remote", "London"]),
    // A realistic mix: most postings are open and live, some closed, some expired.
    status: i % 5 === 0 ? "closed" : "open",
    expirationDate: i % 7 === 0 ? daysAgo(5) : new Date(Date.now() + 30 * 864e5),
    createdAt: daysAgo(i % 400),
    updatedAt: new Date(),
  }));

  // (job, applicant) is unique in the schema — one application per candidate
  // per posting — so the fixture generates distinct pairs rather than fighting
  // the index.
  const seen = new Set();
  const applications = [];
  for (let i = 0; applications.length < SIZES.applications && i < SIZES.applications * 4; i++) {
    const jobDoc = pick(jobs);
    const applicant = pick(candidates);
    const key = `${jobDoc._id}:${applicant._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    applications.push({
      _id: oid(),
      job: jobDoc._id,
      applicant: applicant._id,
      coverLetter: "c".repeat(200),
      resumeUrl: "https://example.com/cv.pdf",
      status: pick(["submitted", "under_review", "accepted", "rejected"]),
      createdAt: daysAgo(i % 400),
      updatedAt: new Date(),
    });
  }

  // A busy pair plus a long tail, so conversation queries see real selectivity.
  const [alice, bob] = candidates;
  const messages = Array.from({ length: SIZES.messages }, (_, i) => {
    const heavy = i % 4 === 0;
    const sender = heavy ? alice : pick(candidates);
    const receiver = heavy ? bob : pick(candidates);
    return {
      _id: oid(),
      sender: sender._id,
      receiver: receiver._id,
      roomId: [String(sender._id), String(receiver._id)].sort().join(":"),
      body: `message ${i}`,
      delivered: false,
      createdAt: daysAgo(i % 200),
      updatedAt: new Date(),
    };
  });

  const notifications = Array.from({ length: SIZES.notifications }, (_, i) => {
    const broadcast = i % 3 === 0;
    return {
      _id: oid(),
      message: `notification ${i}`,
      user: broadcast ? null : pick(users)._id,
      targetRole: broadcast ? pick(ROLES) : null,
      read: i % 2 === 0,
      readBy: broadcast ? [pick(users)._id] : [],
      createdAt: daysAgo(i % 300),
      updatedAt: new Date(),
    };
  });

  const startups = users
    .filter((u) => u.role === "startup")
    .map((u) => ({
      _id: oid(),
      owner: u._id,
      name: `Startup ${u.firstName}`,
      description: "s".repeat(300),
      industries: [pick(["fintech", "health", "saas", "climate"])],
      stage: pick(["idea", "pre-seed", "seed", "series-a"]),
      location: pick(["Cairo", "Berlin", "Remote"]),
      totalRaisingCents: 100_000_00,
      raisedSoFarCents: 10_000_00,
      reservedCents: 0,
      minInvestmentCents: 1_000_00,
      previousRaisedCents: 0,
      createdAt: daysAgo(1),
      updatedAt: new Date(),
    }));

  const investors = users.filter((u) => u.role === "investor");
  const investments = Array.from({ length: SIZES.investments }, (_, i) => ({
    _id: oid(),
    investor: pick(investors)._id,
    startup: pick(startups)._id,
    amountCents: 1_000_00,
    currency: "usd",
    status: pick(["pending", "paid", "failed", "refunded"]),
    createdAt: daysAgo(i % 300),
    updatedAt: new Date(),
  }));

  await Promise.all([
    User.collection.insertMany(users),
    Job.collection.insertMany(jobs),
    Application.collection.insertMany(applications),
    Message.collection.insertMany(messages),
    Notification.collection.insertMany(notifications),
    Startup.collection.insertMany(startups),
    Investment.collection.insertMany(investments),
  ]);

  return { users, recruiters, candidates, jobs, alice, bob, startups, investors };
}

// One line per query shape: the plan summary, the work done, and the verdict.
function report(name, explain) {
  const stats = explain.executionStats;
  const plan = explain.queryPlanner.winningPlan;
  const stages = JSON.stringify(plan);
  const indexName = (stages.match(/"indexName":"([^"]+)"/) || [])[1] || "-";
  const scan = stages.includes("COLLSCAN") ? "COLLSCAN" : "IXSCAN";
  const blockingSort = /"stage":"SORT"/.test(stages);
  console.log(
    [
      name.padEnd(52),
      scan.padEnd(9),
      `idx=${indexName}`.padEnd(46),
      `keys=${String(stats.totalKeysExamined).padStart(6)}`,
      `docs=${String(stats.totalDocsExamined).padStart(6)}`,
      `ret=${String(stats.nReturned).padStart(5)}`,
      blockingSort ? "BLOCKING-SORT" : "",
    ].join(" ")
  );
}

async function explainFind(name, model, filter, { sort, limit = 20, skip = 0, projection } = {}) {
  let q = model.find(filter, projection).skip(skip).limit(limit);
  if (sort) q = q.sort(sort);
  report(name, await q.explain("executionStats"));
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/perf-audit";
  // This script drops and rebuilds whatever database it is pointed at, so it
  // refuses to run against one that is not obviously a scratch database. A
  // benchmark harness must never be one typo away from deleting real data.
  const dbName = uri.split("/").pop().split("?")[0];
  if (!/perf|bench|scratch|test/i.test(dbName)) {
    console.error(
      `Refusing to run: "${dbName}" does not look like a scratch database.
` + "Point MONGODB_URI at one whose name contains perf/bench/scratch/test."
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  console.log(
    `seeding ${Object.entries(SIZES)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")} ...`
  );
  const data = await seed();
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));

  const recruiter = data.recruiters[0]._id;
  const candidate = data.candidates[0]._id;
  const job = data.jobs[0]._id;
  const roomId = [String(data.alice._id), String(data.bob._id)].sort().join(":");

  console.log("\n--- public job list (GET /jobs) ---");
  await explainFind(
    "jobs: open+unexpired, newest first",
    Job,
    {
      status: "open",
      expirationDate: { $gt: new Date() },
    },
    { sort: { createdAt: -1 } }
  );
  await explainFind(
    "jobs: + role regex",
    Job,
    {
      status: "open",
      expirationDate: { $gt: new Date() },
      role: /engineering/i,
    },
    { sort: { createdAt: -1 } }
  );
  await explainFind(
    "jobs: text search + createdAt sort",
    Job,
    {
      status: "open",
      expirationDate: { $gt: new Date() },
      $text: { $search: "backend" },
    },
    { sort: { createdAt: -1 } }
  );
  await explainFind(
    "jobs: deep page (skip 4000)",
    Job,
    {
      status: "open",
      expirationDate: { $gt: new Date() },
    },
    { sort: { createdAt: -1 }, skip: 4000 }
  );
  await explainFind("jobs/mine: recruiter, newest first", Job, { recruiter }, { sort: { createdAt: -1 } });

  console.log("\n--- applications ---");
  await explainFind("applications: for a job, newest first", Application, { job }, { sort: { createdAt: -1 } });
  await explainFind(
    "applications: mine + status",
    Application,
    {
      applicant: candidate,
      status: "submitted",
    },
    { sort: { createdAt: -1 } }
  );

  console.log("\n--- messages (Task 10 contract) ---");
  await explainFind(
    "messages: room history, (createdAt,_id)",
    Message,
    { roomId },
    {
      sort: { createdAt: 1, _id: 1 },
    }
  );
  report(
    "messages: conversation list aggregation",
    (
      await Message.aggregate([
        { $match: { $or: [{ sender: data.alice._id }, { receiver: data.alice._id }] } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { $cond: [{ $eq: ["$sender", data.alice._id] }, "$receiver", "$sender"] },
            lastMessage: { $first: "$body" },
            timestamp: { $first: "$createdAt" },
          },
        },
        { $sort: { timestamp: -1 } },
        { $facet: { total: [{ $count: "count" }], items: [{ $skip: 0 }, { $limit: 20 }] } },
      ]).explain("executionStats")
    ).stages?.[0]?.$cursor ?? {
      executionStats: { totalKeysExamined: -1, totalDocsExamined: -1, nReturned: -1 },
      queryPlanner: { winningPlan: {} },
    }
  );
  const partners = await Message.collection
    .find({ sender: data.alice._id }, { projection: { receiver: 1, _id: 0 } })
    .explain("executionStats");
  report("messages: distinct partners (sender side)", partners);

  console.log("\n--- notifications ---");
  const audience = {
    $or: [{ user: data.users[0]._id }, { user: null, targetRole: data.users[0].role }],
  };
  await explainFind("notifications: audience, newest first", Notification, audience, {
    sort: { createdAt: -1, _id: -1 },
  });
  await explainFind(
    "notifications: audience + unread",
    Notification,
    {
      $or: [
        { user: data.users[0]._id, read: false },
        { user: null, targetRole: data.users[0].role, readBy: { $ne: data.users[0]._id } },
      ],
    },
    { sort: { createdAt: -1, _id: -1 } }
  );

  console.log("\n--- users / investments / startups ---");
  await explainFind("users: admin list by role", User, { role: "candidate" }, { sort: { createdAt: -1 } });
  await explainFind("users: admin list, no filter", User, {}, { sort: { createdAt: -1 } });
  await explainFind(
    "investments: mine, newest first",
    Investment,
    { investor: data.investors[0]._id },
    {
      sort: { createdAt: -1 },
    }
  );
  await explainFind(
    "investments: for a startup",
    Investment,
    { startup: data.startups[0]._id },
    {
      sort: { createdAt: -1 },
    }
  );
  await explainFind(
    "startups: browse by industry+stage",
    Startup,
    { industries: "fintech", stage: "seed" },
    {
      sort: { createdAt: -1 },
    }
  );

  console.log("\n--- more list endpoints ---");
  await explainFind("startups: browse, no filter", Startup, {}, { sort: { createdAt: -1 } });
  await explainFind(
    "startups: investor criteria match",
    Startup,
    {
      minInvestmentCents: { $gte: 0, $lte: 1000000 },
      industries: { $in: ["fintech", "saas"] },
      stage: { $in: ["seed", "series-a"] },
      location: { $in: ["Cairo", "Berlin"] },
    },
    { sort: { createdAt: -1 } }
  );
  await explainFind(
    "investments: mine + status filter",
    Investment,
    { investor: data.investors[0]._id, status: "paid" },
    { sort: { createdAt: -1 } }
  );
  await explainFind(
    "experiences: mine, startDate desc",
    require("../src/modules/experience/experience.model"),
    { user: candidate },
    { sort: { startDate: -1 } }
  );

  console.log("\n--- authorization lookups ---");
  const jobIds = await Job.distinct("_id", { recruiter });
  console.log(`cv authorization: recruiter owns ${jobIds.length} jobs (that id list is loaded into the process)`);
  report(
    "cv auth: application exists in recruiter's jobs",
    await Application.collection
      .find({ applicant: candidate, job: { $in: jobIds.slice(0, 200) } })
      .limit(1)
      .explain("executionStats")
  );

  // The same authorization question asked the other way round: start from the
  // candidate's own applications (bounded by how many jobs one person applies
  // to) rather than from the recruiter's postings (unbounded).
  const appJobIds = await Application.distinct("job", { applicant: candidate });
  console.log(`cv authorization (inverted): candidate has ${appJobIds.length} applications`);
  report(
    "cv auth: recruiter owns one of the candidate's jobs",
    await Job.collection
      .find({ _id: { $in: appJobIds }, recruiter })
      .limit(1)
      .explain("executionStats")
  );

  if (!process.argv.includes("--keep")) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("explain run failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
