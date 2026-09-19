const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fileType = require("../utils/fileType");
const { ValidationError } = require("../errors/AppError");

// Memory storage: the buffer is handed to the storage driver rather than
// written straight to disk by multer, so a rejected upload never leaves a
// partial file behind and the same middleware works with either driver.
const storage = multer.memoryStorage();

const MAX_BYTES = 5 * 1024 * 1024;

// Deliberately narrow. Notably absent: SVG and HTML, which browsers execute,
// and archives, which hide what they contain.
const ALLOWED = {
  cv: {
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    exts: [".pdf", ".doc", ".docx"],
  },
  image: { mimes: ["image/jpeg", "image/png", "image/webp"], exts: [".jpg", ".jpeg", ".png", ".webp"] },
};

function fileFilterFor(kind) {
  const rule = ALLOWED[kind];
  return (req, file, cb) => {
    // The client's name is only read to pick an extension for our own key; it
    // never becomes a path.
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (rule.mimes.includes(file.mimetype) && rule.exts.includes(ext)) return cb(null, true);
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", `Only ${rule.exts.join(", ")} files are allowed`));
  };
}

const limits = { fileSize: MAX_BYTES, files: 1, parts: 20, fieldSize: 100 * 1024 };

// multer's own failures are MulterErrors, which the error handler already maps
// to 400/413. Anything else out of the parser is busboy rejecting a body that
// is not valid multipart at all ("Malformed part header", "Unexpected end of
// form") — a client mistake, so it must not surface as a 500 either.
function wrap(uploader) {
  return {
    single: (field) => (req, res, next) =>
      uploader.single(field)(req, res, (err) => {
        if (err && !(err instanceof multer.MulterError)) {
          return next(new ValidationError("Malformed multipart request body", [{ field, message: err.message }]));
        }
        next(err);
      }),
  };
}

const uploadCv = wrap(multer({ storage, limits, fileFilter: fileFilterFor("cv") }));
const uploadImage = wrap(multer({ storage, limits, fileFilter: fileFilterFor("image") }));

// The storage key is entirely server-generated: a random id plus the validated
// extension, under a fixed prefix. The client's filename never reaches the
// filesystem, so traversal, absolute paths, null bytes, reserved names and
// collisions with another user's file are impossible by construction.
function safeKey(prefix, extension) {
  return `${prefix}/${crypto.randomUUID()}${extension}`;
}

// Keeps a readable name for Content-Disposition without letting it near a
// path: separators and control characters are stripped.
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const UNSAFE_NAME_CHARS = /[\x00-\x1f\x7f<>:"/\\|?*]+/g;
function displayName(originalname, extension) {
  const base = path
    .basename(String(originalname || ""))
    .replace(UNSAFE_NAME_CHARS, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 100);
  return base && base.toLowerCase().endsWith(extension) ? base : `download${extension}`;
}

// Everything multer accepted is still only *claimed* to be a CV or an image:
// the client controls both the filename and the Content-Type. This is where
// the bytes get a vote — the magic number must agree with the declared type
// and the extension, and an empty file is rejected outright.
function inspect(file, kind) {
  if (!file) throw new ValidationError("No file uploaded", [{ field: "file", message: "a file is required" }]);
  if (!file.buffer?.length) {
    throw new ValidationError("The uploaded file is empty", [{ field: "file", message: "file is empty" }]);
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  if (!fileType.matches(file.buffer, { contentType: file.mimetype, extension })) {
    throw new ValidationError(`The file's contents are not a valid ${ALLOWED[kind].exts.join(", ")} file`, [
      { field: "file", message: "file contents do not match its declared type or extension" },
    ]);
  }

  return {
    key: safeKey(kind, extension),
    filename: displayName(file.originalname, extension),
    contentType: file.mimetype,
    sizeBytes: file.size,
    buffer: file.buffer,
  };
}

module.exports = { uploadCv, uploadImage, inspect, safeKey, displayName, ALLOWED, MAX_BYTES };
