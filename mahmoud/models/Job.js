const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  role: { type: String, required: true },
  minSalary: { type: Number, required: true },
  maxSalary: { type: Number, required: true },
  salaryType: { type: String, required: true },
  applyMethod: { type: String, required: true },
  applyLink: String,
  applyEmail: String,
  description: { type: String, required: true },
  responsibilities: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Job', jobSchema); 