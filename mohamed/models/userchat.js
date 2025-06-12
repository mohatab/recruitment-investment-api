const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  isOnline: { type: Boolean, default: false }
});

const Userchat = mongoose.models.Userchat || mongoose.model('Userchat', userSchema);

module.exports = Userchat;