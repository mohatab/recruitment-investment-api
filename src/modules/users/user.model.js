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
    password: { type: String, required: true, minlength: 6, select: false },
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

    cvUrl: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

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
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
