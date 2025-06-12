const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  time: { type: Date, required: true },
  read: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  targetRole: { type: String, enum: ['investor', 'jobseeker', 'startup', null], default: null }, //type user
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);