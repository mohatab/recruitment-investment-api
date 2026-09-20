const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const ROLES = require("../../common/constants/roles");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
    // Policy (length, bcrypt's 72-byte limit) is enforced by the Joi schemas;
    // this field only ever holds the bcrypt hash.
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true, default: ROLES.CANDIDATE },
    phone: { type: String, trim: true, default: "" },

    // Profile fields (consolidated from the old standalone "tell your story"
    // collection — this data belongs to the user, not a separate orphaned
    // document with no owner).
    nationality: { type: String, trim: true, default: "" },
    birthdate: { type: Date },
    location: {
      country: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
    },

    // The stored CV: metadata plus the server-generated storage key. There is
    // no public URL — the file is served by an authorized endpoint
    // (GET /users/me/cv, GET /users/:id/cv), never by static hosting.
    cv: {
      type: {
        _id: false,
        key: { type: String, required: true },
        filename: { type: String, required: true },
        contentType: { type: String, required: true },
        sizeBytes: { type: Number, required: true, min: 1 },
        uploadedAt: { type: Date, required: true },
      },
      default: null,
    },
    isActive: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date, default: null },
    // Embedded in access tokens and stored on refresh tokens. Incrementing it
    // revokes every session at once (password change/reset, deactivation,
    // logout-all, refresh-token reuse).
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// The admin user list: `{ role? }` newest first. The sort key is part of the
// index because a role filter alone left the server sorting every matching
// user in memory, and the unfiltered list scanned the whole collection
// (measured: 500 and 2,000 documents examined respectively, to return 20).
// Users are written rarely — registration, a profile edit, a session-version
// bump — so two small indexes here are cheap.
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.tokenVersion;
  // The storage key is an internal identifier; clients use the download route.
  if (obj.cv) obj.cv = { ...obj.cv, key: undefined, downloadPath: "/api/v1/users/me/cv" };
  delete obj.__v;
  if ("emailVerifiedAt" in obj) obj.emailVerified = Boolean(obj.emailVerifiedAt); // absent in projected public profiles
  return obj;
};

module.exports = mongoose.model("User", userSchema);
