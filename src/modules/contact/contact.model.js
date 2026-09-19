const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 30 },
    country: { type: String, default: "", trim: true, maxlength: 80 },
    city: { type: String, default: "", trim: true, maxlength: 80 },
    // The optional photo, stored privately like every other upload: metadata
    // plus a server-generated key, downloadable only by an admin. It used to
    // be a public URL on a static path.
    image: {
      type: {
        _id: false,
        key: { type: String, required: true },
        filename: { type: String, required: true },
        contentType: { type: String, required: true },
        sizeBytes: { type: Number, required: true, min: 1 },
      },
      default: null,
    },
  },
  { timestamps: true }
);

// The admin list is newest-first.
contactSchema.index({ createdAt: -1 });

contactSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.__v;
  if (obj.image) obj.image = { ...obj.image, key: undefined, downloadPath: `/api/v1/contact/${obj._id}/image` };
  return obj;
};

module.exports = mongoose.model("Contact", contactSchema);
