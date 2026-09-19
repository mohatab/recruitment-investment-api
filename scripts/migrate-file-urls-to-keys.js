#!/usr/bin/env node
/**
 * One-off migration for the Task 9 file change: public file URLs become
 * private metadata plus a server-side storage key.
 *
 *   users:    cvUrl            -> cv    { key, filename, contentType, sizeBytes, uploadedAt }
 *   contacts: profileImageUrl  -> image { key, filename, contentType, sizeBytes }
 *
 * The key is the part of the old URL after `/uploads/` — that is exactly what
 * the old static route served. Size comes from the stored file itself, so a
 * row is only migrated when its file is actually readable; anything else (an
 * external URL, a file lost with an old container's filesystem) has its stale
 * field removed and is reported, and that user simply re-uploads. Leaving the
 * dead URL in place would be worse: it points at a route that no longer
 * exists.
 *
 * Idempotent: only documents that still carry the old field are touched, and
 * the old field is removed in the same update.
 *
 *   node scripts/migrate-file-urls-to-keys.js [--dry-run]
 */
const path = require("path");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const storage = require("../src/common/storage");

const DRY_RUN = process.argv.includes("--dry-run");

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// `http://host/uploads/cv/<uuid>.pdf` -> `cv/<uuid>.pdf`. Anything that is not
// one of our own upload URLs returns null and is dropped rather than guessed.
function keyFromUrl(url) {
  const marker = "/uploads/";
  const at = String(url || "").indexOf(marker);
  if (at === -1) return null;
  const key = url.slice(at + marker.length).split("?")[0];
  return key && CONTENT_TYPES[path.extname(key).toLowerCase()] ? key : null;
}

async function metadataFor(url, fallbackName) {
  const key = keyFromUrl(url);
  if (!key) return null;
  let buffer;
  try {
    buffer = await storage.read(key);
  } catch {
    return null; // the file is gone; nothing to point at
  }
  const extension = path.extname(key).toLowerCase();
  return {
    key,
    filename: `${fallbackName}${extension}`,
    contentType: CONTENT_TYPES[extension],
    sizeBytes: buffer.length,
  };
}

async function migrate({ collection, from, to, fallbackName, extra }) {
  const docs = await mongoose.connection.db
    .collection(collection)
    .find({ [from]: { $type: "string", $ne: "" } })
    .toArray();

  let migrated = 0;
  const dropped = [];
  for (const doc of docs) {
    const metadata = await metadataFor(doc[from], fallbackName);
    if (metadata) migrated += 1;
    else dropped.push({ _id: String(doc._id), url: doc[from] });

    if (!DRY_RUN) {
      await mongoose.connection.db
        .collection(collection)
        .updateOne(
          { _id: doc._id },
          { $set: { [to]: metadata ? { ...metadata, ...extra } : null }, $unset: { [from]: "" } }
        );
    }
  }
  return { examined: docs.length, migrated, dropped };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log(`${DRY_RUN ? "[dry run] " : ""}storage driver: ${env.storage.driver}`);

  const plan = [
    { collection: "users", from: "cvUrl", to: "cv", fallbackName: "cv", extra: { uploadedAt: new Date() } },
    { collection: "contacts", from: "profileImageUrl", to: "image", fallbackName: "image", extra: {} },
  ];

  for (const step of plan) {
    const { examined, migrated, dropped } = await migrate(step);
    console.log(
      `${step.collection}.${step.from}: ${examined} examined, ${migrated} migrated, ${dropped.length} dropped`
    );
    dropped.forEach((d) => console.log(`  dropped ${d._id}: no readable file for ${d.url}`));
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Migration failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
