const fs = require("fs");
const path = require("path");
const env = require("../../config/env");

const rootDir = path.resolve(process.cwd(), env.storage.uploadDir);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(rootDir);

// `key` is a server-generated relative path (e.g. "cv/<uuid>.pdf") — never
// derived from the client's filename — so this can't be used to escape
// uploadDir via `../`.
async function save(key, buffer) {
  const dest = path.join(rootDir, key);
  ensureDir(path.dirname(dest));
  await fs.promises.writeFile(dest, buffer);
  return key;
}

function getUrl(key) {
  return `${env.baseUrl}/uploads/${key}`;
}

async function remove(key) {
  const dest = path.join(rootDir, key);
  await fs.promises.unlink(dest).catch(() => {});
}

module.exports = { save, getUrl, remove, rootDir };
