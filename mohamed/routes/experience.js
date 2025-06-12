const express = require("express");
const router = express.Router();
const Experience = require("../models/Experience");

/**
 * @swagger
 * components:
 *   schemas:
 *     Experience:
 *       type: object
 *       required:
 *         - yearsOfExperience
 *         - jobTitle
 *         - companyName
 *         - jobCategory
 *         - experienceType
 *         - startMonth
 *         - startYear
 *       properties:
 *         yearsOfExperience:
 *           type: string
 *           description: عدد سنوات الخبرة
 *         jobTitle:
 *           type: string
 *           description: المسمى الوظيفي
 *         companyName:
 *           type: string
 *           description: اسم الشركة
 *         jobCategory:
 *           type: string
 *           description: فئة الوظيفة
 *         experienceType:
 *           type: string
 *           description: نوع الخبرة
 *         startMonth:
 *           type: string
 *           description: شهر البدء
 *         startYear:
 *           type: string
 *           description: سنة البدء
 *         endMonth:
 *           type: string
 *           description: شهر الانتهاء (مطلوب إذا لم يكن يعمل حالياً)
 *         endYear:
 *           type: string
 *           description: سنة الانتهاء (مطلوب إذا لم يكن يعمل حالياً)
 *         currentlyWorking:
 *           type: boolean
 *           description: هل يعمل حالياً في هذه الوظيفة
 */

/**
 * @swagger
 * /api/mohamed/experience/submit-experience:
 *   post:
 *     summary: تقديم خبرة عمل جديدة
 *     tags: [Experience]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - yearsOfExperience
 *               - jobTitle
 *               - companyName
 *               - jobCategory
 *               - experienceType
 *               - startMonth
 *               - startYear
 *             properties:
 *               yearsOfExperience:
 *                 type: string
 *               jobTitle:
 *                 type: string
 *               companyName:
 *                 type: string
 *               jobCategory:
 *                 type: string
 *               experienceType:
 *                 type: string
 *               startMonth:
 *                 type: string
 *               startYear:
 *                 type: string
 *               endMonth:
 *                 type: string
 *               endYear:
 *                 type: string
 *               currentlyWorking:
 *                 type: string
 *                 enum: ['true', 'on']
 *     responses:
 *       200:
 *         description: تم تقديم الخبرة بنجاح
 *       400:
 *         description: خطأ في البيانات المقدمة
 */
router.post("/submit-experience", async (req, res) => {
  try {
    const {
      yearsOfExperience,
      jobTitle,
      companyName,
      jobCategory,
      experienceType,
      startMonth,
      startYear,
      endMonth,
      endYear,
      currentlyWorking,
    } = req.body;

    const missing = [];
    if (!yearsOfExperience) missing.push("yearsOfExperience");
    if (!jobTitle) missing.push("jobTitle");
    if (!companyName) missing.push("companyName");
    if (!jobCategory) missing.push("jobCategory");
    if (!experienceType) missing.push("experienceType");
    if (!startMonth) missing.push("startMonth");
    if (!startYear) missing.push("startYear");
    if (currentlyWorking !== "true" && currentlyWorking !== "on") {
      if (!endMonth) missing.push("endMonth");
      if (!endYear) missing.push("endYear");
    }

    if (missing.length > 0) {
      return res
        .status(400)
        .json({ error: "Missing fields: " + missing.join(", ") });
    }

    const newExperience = new Experience({
      yearsOfExperience,
      jobTitle,
      companyName,
      jobCategory,
      experienceType,
      startMonth,
      startYear,
      endMonth,
      endYear,
      currentlyWorking:
        currentlyWorking === "true" || currentlyWorking === "on",
    });

    await newExperience.save();
    res.status(200).json({ message: "Experience submitted successfully" });
  } catch (error) {
    res
      .status(400)
      .json({ error: "Error saving experience: " + error.message });
  }
});

module.exports = router;
