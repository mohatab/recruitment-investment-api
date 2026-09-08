const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

// Memory storage: the buffer is handed to the storage abstraction (local
// disk or S3) rather than written straight to disk by multer, so the same
// upload middleware works with either driver.
const storage = multer.memoryStorage();

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
    const ext = path.extname(file.originalname).toLowerCase();
    if (rule.mimes.includes(file.mimetype) && rule.exts.includes(ext)) return cb(null, true);
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", `Only ${rule.exts.join(", ")} files are allowed`));
  };
}

// A server-generated random name + the (already validated) extension — the
// client's filename is never used as-is, which is what prevents path
// traversal / overwrite via a crafted filename.
function safeKey(prefix, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  return `${prefix}/${crypto.randomUUID()}${ext}`;
}

const uploadCv = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: fileFilterFor("cv") });
const uploadImage = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: fileFilterFor("image") });

module.exports = { uploadCv, uploadImage, safeKey };
