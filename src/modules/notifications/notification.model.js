const mongoose = require("mongoose");
const ROLES = require("../../common/constants/roles");

const notificationSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    targetRole: { type: String, enum: [...Object.values(ROLES), null], default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
