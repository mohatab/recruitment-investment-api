const fs = require("fs");
const path = require("path");
const env = require("../../config/env");
const { NotFoundError } = require("../errors/AppError");

const rootDir = path.resolve(process.cwd(), env.storage.uploadDir);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(rootDir);

// Keys are always generated server-side (see middleware/upload.js), but this
// is the last place a bad one could become a filesystem path, so it re-checks
// rather than trusting its caller: the resolved path must stay inside the
// upload root. That stops `../`, absolute paths, encoded traversal and
// Unicode-normalisation tricks from ever reaching the filesystem.
function resolveKey(key) {
  if (typeof key !== "string" || key.length === 0 || key.includes("\0")) {
    throw new NotFoundError("File not found");
  }
  const target = path.resolve(rootDir, key);
  const withinRoot = target === rootDir || target.startsWith(rootDir + path.sep);
  if (!withinRoot) throw new NotFoundError("File not found");
  return target;
}

async function save(key, buffer) {
  const dest = resolveKey(key);
  ensureDir(path.dirname(dest));
  await fs.promises.writeFile(dest, buffer);
  return key;
}

// Missing files are a NotFoundError, never an unhandled ENOENT: a database row
// can outlive its file (a half-finished delete, a lost volume), and that must
// be a clean 404 rather than a 500 with a filesystem path in it.
async function read(key) {
  const source = resolveKey(key);
  try {
    return await fs.promises.readFile(source);
  } catch {
    throw new NotFoundError("File not found");
  }
}

async function exists(key) {
  try {
    await fs.promises.access(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

// Best-effort: an already-deleted file is not an error.
async function remove(key) {
  await fs.promises.unlink(resolveKey(key)).catch(() => {});
}

module.exports = { save, read, exists, remove, rootDir };
