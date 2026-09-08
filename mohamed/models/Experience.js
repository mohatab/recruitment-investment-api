const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema({
  yearsOfExperience: String,
  jobTitle: { type: String, required: true },
  companyName: { type: String, required: true },
  jobCategory: String,
  experienceType: String,
  startMonth: String,
  startYear: String,
  endMonth: String,
  endYear: String,
  currentlyWorking: Boolean
});

module.exports = mongoose.models.Experience || mongoose.model('Experience', experienceSchema);
