const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  birthdate: {
    day: Number,
    month: String,
    year: Number
  },
  gender: String,
  nationality: String,
  location: {
    country: String,
    city: String,
    area: String
  },
  mobileNumber: String
});

module.exports = mongoose.models.your || mongoose.model('your', userSchema);
