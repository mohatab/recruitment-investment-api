#!/usr/bin/env node
/**
 * One-off migration for the Task 7 money change: float amounts in major units
 * (dollars) become integer minor units (cents) in `*Cents` fields.
 *
 *   investments: amount            -> amountCents
 *   startups:    totalRaising      -> totalRaisingCents
 *                minInvestment     -> minInvestmentCents
 *                raisedSoFar       -> raisedSoFarCents
 *                previousRaised    -> previousRaisedCents
 *                (adds reservedCents: 0)
 *   investors:   criteria.minInvestment -> criteria.minInvestmentCents
 *                criteria.maxInvestment -> criteria.maxInvestmentCents
 *
 * Idempotent: only documents that still have an old field are touched, and the
 * old field is removed in the same update. Values are rounded to the nearest
 * cent — a stored 10.005 becomes 1001 (there is no such thing as half a cent),
 * which is reported so it can be reviewed.
 *
 *   node scripts/migrate-money-to-minor-units.js [--dry-run]
 */
const mongoose = require("mongoose");
const env = require("../src/config/env");

const DRY_RUN = process.argv.includes("--dry-run");
const toCents = (major) => Math.round(Number(major) * 100);

const COLLECTIONS = [
  { name: "investments", fields: { amount: "amountCents" }, defaults: {} },
  {
    name: "startups",
    fields: {
      totalRaising: "totalRaisingCents",
      minInvestment: "minInvestmentCents",
      raisedSoFar: "raisedSoFarCents",
      previousRaised: "previousRaisedCents",
    },
    defaults: { reservedCents: 0 },
  },
  {
    name: "investors",
    fields: {
      "criteria.minInvestment": "criteria.minInvestmentCents",
      "criteria.maxInvestment": "criteria.maxInvestmentCents",
    },
    defaults: {},
  },
];

const read = (doc, path) => path.split(".").reduce((value, key) => (value == null ? value : value[key]), doc);

async function migrate() {
  await mongoose.connect(env.mongoUri);
  const db = mongoose.connection.db;
  let converted = 0;
  const rounded = [];

  for (const { name, fields, defaults } of COLLECTIONS) {
    const oldPaths = Object.keys(fields);
    const cursor = db.collection(name).find({ $or: oldPaths.map((path) => ({ [path]: { $exists: true } })) });

    for await (const doc of cursor) {
      const $set = { ...defaults };
      const $unset = {};
      for (const [oldPath, newPath] of Object.entries(fields)) {
        const value = read(doc, oldPath);
        if (value === undefined || value === null) continue;
        const cents = toCents(value);
        if (cents !== Number(value) * 100) rounded.push({ collection: name, _id: doc._id, oldPath, value, cents });
        $set[newPath] = cents;
        $unset[oldPath] = "";
      }
      if (!Object.keys($set).length) continue;

      converted += 1;
      if (DRY_RUN) continue;
      await db.collection(name).updateOne({ _id: doc._id }, { $set, $unset });
    }
  }

  console.log(`${DRY_RUN ? "[dry run] would convert" : "converted"} ${converted} document(s)`);
  if (rounded.length) {
    console.log(`${rounded.length} value(s) were not a whole number of cents and were rounded:`);
    for (const r of rounded) console.log(`  ${r.collection} ${r._id} ${r.oldPath}: ${r.value} -> ${r.cents}`);
  }
  await mongoose.connection.close();
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
