const env = require("../../config/env");
const { NotFoundError } = require("../errors/AppError");

// Lazily require the AWS SDK so a `local`-driver deployment never needs the
// dependency resolved at import time.
let s3Client;
function getClient() {
  if (!s3Client) {
    const { S3Client } = require("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: env.storage.s3.region,
      endpoint: env.storage.s3.endpoint || undefined,
      forcePathStyle: Boolean(env.storage.s3.endpoint),
      credentials: {
        accessKeyId: env.storage.s3.accessKeyId,
        secretAccessKey: env.storage.s3.secretAccessKey,
      },
    });
  }
  return s3Client;
}

async function save(key, buffer, contentType) {
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  await getClient().send(
    new PutObjectCommand({ Bucket: env.storage.s3.bucket, Key: key, Body: buffer, ContentType: contentType })
  );
  return key;
}

// Objects are read back through the API, never linked to directly: the bucket
// stays private and authorization happens in this service, exactly as with the
// local driver. That is also why there is no getUrl() any more — a public
// object URL would bypass every check.
async function read(key) {
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  try {
    const result = await getClient().send(new GetObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
    return Buffer.from(await result.Body.transformToByteArray());
  } catch {
    throw new NotFoundError("File not found");
  }
}

async function exists(key) {
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// Best-effort, like the local driver: an object that is already gone is not an
// error worth failing a request over.
async function remove(key) {
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
  } catch {
    // ignored
  }
}

module.exports = { save, read, exists, remove };
