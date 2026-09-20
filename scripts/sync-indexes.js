#!/usr/bin/env node
/**
 * Brings the database's indexes in line with the models.
 *
 * Mongoose creates missing indexes on connect (autoIndex), but it never drops
 * one that a model no longer declares — so after a change like Task 11's
 * (`{ roomId, createdAt }` becoming `{ roomId, createdAt, _id }`), the old
 * index would sit there forever, slowing every write and answering nothing.
 * This is the explicit, reviewable step that removes them.
 *
 * Idempotent: a second run reports nothing to do. It only ever touches
 * indexes, never documents, and it is deliberately not part of application
 * startup — dropping an index is a decision to take knowingly, and building
 * one on a large collection is not something a boot sequence should trigger.
 *
 *   node scripts/sync-indexes.js --dry-run    # report the difference only
 *   node scripts/sync-indexes.js              # apply it
 */
const mongoose = require("mongoose");
const env = require("../src/config/env");

// Loading the app's models registers every schema with this mongoose instance.
require("../src/app");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  await mongoose.connect(env.mongoUri, { autoIndex: false });
  console.log(`${DRY_RUN ? "[dry run] " : ""}${mongoose.modelNames().length} models against ${env.mongoUri}`);

  let created = 0;
  let dropped = 0;

  for (const name of mongoose.modelNames().sort()) {
    const model = mongoose.model(name);
    // Mongoose's own comparison: it knows how a text index is stored, how an
    // index is named, and which options matter — a hand-rolled key diff gets
    // text indexes wrong and drops/recreates them on every run.
    const { toDrop, toCreate } = await model.diffIndexes();
    if (!toDrop.length && !toCreate.length) continue;

    toDrop.forEach((index) => console.log(`  ${model.collection.name}: drop ${index}`));
    toCreate.forEach((spec) => console.log(`  ${model.collection.name}: create ${JSON.stringify(spec)}`));
    created += toCreate.length;
    dropped += toDrop.length;

    if (!DRY_RUN) await model.syncIndexes();
  }

  console.log(created + dropped === 0 ? "indexes already in sync" : `${created} created, ${dropped} dropped`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Index sync failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
