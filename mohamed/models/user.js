const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    user_type: {
      type: String,
      enum: ["investor", "jobseeker", "startup"],
      default: "jobseeker",
      required: [true, "User type is required"],
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true, // هيضيف createdAt و updatedAt تلقائي
  }
);

module.exports = mongoose.model("MohamedUser", userSchema);
