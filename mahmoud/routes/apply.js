const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const applicationSchema = new mongoose.Schema({
  resume: { type: String, required: true },
  coverLetter: { type: String, required: true, minlength: 10 },
  jobTitle: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
});

const Application = mongoose.model("Application", applicationSchema);

/**
 * @swagger
 * /api/mahmoud/apply:
 *   post:
 *     tags: [Applications]
 *     summary: تقديم طلب وظيفة جديد
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resume
 *               - coverLetter
 *               - jobTitle
 *             properties:
 *               resume:
 *                 type: string
 *                 description: السيرة الذاتية
 *               coverLetter:
 *                 type: string
 *                 description: خطاب التقديم (لا يقل عن 10 أحرف)
 *               jobTitle:
 *                 type: string
 *                 description: عنوان الوظيفة
 *     responses:
 *       201:
 *         description: تم تقديم الطلب بنجاح
 *       400:
 *         description: بيانات غير صحيحة
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/", async (req, res) => {
  try {
    const { resume, coverLetter, jobTitle } = req.body;
    if (!resume || !coverLetter || !jobTitle) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (coverLetter.length < 10) {
      return res
        .status(400)
        .json({
          error: "The introductory message must be at least 10 characters long",
        });
    }
    const newApplication = new Application({ resume, coverLetter, jobTitle });
    await newApplication.save();
    res
      .status(201)
      .json({ message: "The request has been submitted successfully" });
  } catch (error) {
    console.error("Error saving the request:", error);
    res.status(500).json({ error: "Failed to submit the request" });
  }
});

/**
 * @swagger
 * /api/mahmoud/apply:
 *   get:
 *     tags: [Applications]
 *     summary: الحصول على جميع طلبات التوظيف
 *     responses:
 *       200:
 *         description: تم جلب الطلبات بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   resume:
 *                     type: string
 *                   coverLetter:
 *                     type: string
 *                   jobTitle:
 *                     type: string
 *                   submittedAt:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/", async (req, res) => {
  try {
    const applications = await Application.find();
    res.status(200).json(applications);
  } catch (error) {
    console.error("Error retrieving the requests:", error);
    res.status(500).json({ error: "Failed to retrieve the requests" });
  }
});

module.exports = router;
