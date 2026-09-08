const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phoneNumber: { type: String, required: true, trim: true },
    country: { type: String, default: "" },
    city: { type: String, default: "" },
    profileImageUrl: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", contactSchema);
