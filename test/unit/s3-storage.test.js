// The S3 driver is the production storage path, so its contract is pinned
// here against a stubbed SDK: it must behave exactly like the local driver
// (a missing object is a NotFoundError, a delete is best-effort) and it must
// never hand out a public object URL — that would bypass the authorization
// check that every download goes through.
jest.mock("@aws-sdk/client-s3", () => {
  const send = jest.fn();
  return {
    __send: send,
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn((input) => ({ name: "Put", input })),
    GetObjectCommand: jest.fn((input) => ({ name: "Get", input })),
    HeadObjectCommand: jest.fn((input) => ({ name: "Head", input })),
    DeleteObjectCommand: jest.fn((input) => ({ name: "Delete", input })),
  };
});

const sdk = require("@aws-sdk/client-s3");
const s3 = require("../../src/common/storage/s3Storage");
const env = require("../../src/config/env");

const send = sdk.__send;
const lastCommand = () => send.mock.calls.at(-1)[0];

beforeEach(() => send.mockReset());

test("save uploads the buffer under the given key, with its content type", async () => {
  send.mockResolvedValue({});
  await expect(s3.save("cv/abc.pdf", Buffer.from("%PDF"), "application/pdf")).resolves.toBe("cv/abc.pdf");

  expect(lastCommand()).toMatchObject({
    name: "Put",
    input: { Bucket: env.storage.s3.bucket, Key: "cv/abc.pdf", ContentType: "application/pdf" },
  });
});

test("read returns the object's bytes", async () => {
  send.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } });
  expect((await s3.read("cv/abc.pdf")).equals(Buffer.from([1, 2, 3]))).toBe(true);
  expect(lastCommand().name).toBe("Get");
});

test("a missing object is a NotFoundError, not a raw SDK error", async () => {
  send.mockRejectedValue(Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" }));
  await expect(s3.read("cv/gone.pdf")).rejects.toMatchObject({ statusCode: 404, message: "File not found" });
});

test("exists reflects the head request, and swallows its failure", async () => {
  send.mockResolvedValue({});
  expect(await s3.exists("cv/abc.pdf")).toBe(true);
  expect(lastCommand().name).toBe("Head");

  send.mockRejectedValue(new Error("NotFound"));
  expect(await s3.exists("cv/gone.pdf")).toBe(false);
});

test("remove is best-effort: an object that is already gone is not an error", async () => {
  send.mockResolvedValue({});
  await expect(s3.remove("cv/abc.pdf")).resolves.toBeUndefined();
  expect(lastCommand().name).toBe("Delete");

  send.mockRejectedValue(new Error("NoSuchKey"));
  await expect(s3.remove("cv/gone.pdf")).resolves.toBeUndefined();
});

test("the driver exposes no URL-producing function", () => {
  expect(Object.keys(s3).sort()).toEqual(["exists", "read", "remove", "save"]);
});

test("the client is built once and reused", async () => {
  send.mockResolvedValue({});
  await s3.exists("a");
  await s3.exists("b");
  expect(sdk.S3Client).toHaveBeenCalledTimes(1);
});
