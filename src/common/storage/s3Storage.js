const env = require("../../config/env");

// Lazily require the AWS SDK so a `local`-driver deployment never needs the
// dependency resolved at import time (kept simple: it's still declared in
// package.json since the S3 driver is a supported, first-class option).
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
    new PutObjectCommand({
      Bucket: env.storage.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

function getUrl(key) {
  if (env.storage.s3.endpoint) return `${env.storage.s3.endpoint}/${env.storage.s3.bucket}/${key}`;
  return `https://${env.storage.s3.bucket}.s3.${env.storage.s3.region}.amazonaws.com/${key}`;
}

async function remove(key) {
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  await getClient().send(new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
}

module.exports = { save, getUrl, remove };
