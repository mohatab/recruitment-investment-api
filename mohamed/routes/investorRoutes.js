const express = require("express");
const mongoose = require("mongoose");
const Investor = require("../models/investor");
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Investor:
 *       type: object
 *       required:
 *         - investorType
 *         - linkedIn
 *         - aboutMe
 *       properties:
 *         investorType:
 *           type: string
 *           description: نوع المستثمر
 *         linkedIn:
 *           type: string
 *           description: رابط حساب LinkedIn
 *         twitter:
 *           type: string
 *           description: رابط حساب Twitter (اختياري)
 *         facebook:
 *           type: string
 *           description: رابط حساب Facebook (اختياري)
 *         website:
 *           type: string
 *           description: رابط الموقع الإلكتروني (اختياري)
 *         aboutMe:
 *           type: string
 *           description: نبذة عن المستثمر
 *         areasOfExpertise:
 *           type: array
 *           items:
 *             type: string
 *           description: مجالات الخبرة (اختياري)
 *         numberOfInvestments:
 *           type: number
 *           description: عدد الاستثمارات (اختياري)
 *         companies:
 *           type: array
 *           items:
 *             type: string
 *           description: الشركات المستثمر فيها (اختياري)
 */

// Function to check for missing fields
function checkMissingFields(obj, requiredFields) {
  return requiredFields.filter((field) => !obj[field]);
}

/**
 * @swagger
 * /api/mohamed/investor:
 *   post:
 *     summary: إنشاء مستثمر جديد
 *     tags: [Investors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Investor'
 *     responses:
 *       201:
 *         description: تم إنشاء المستثمر بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 investor:
 *                   $ref: '#/components/schemas/Investor'
 *       400:
 *         description: حقول مطلوبة مفقودة
 *       500:
 *         description: خطأ في السيرفر
 */
router.post("/investor", async (req, res) => {
  try {
    const requiredFields = ["investorType", "linkedIn", "aboutMe"];
    const missing = checkMissingFields(req.body, requiredFields);
    if (missing.length > 0) {
      return res
        .status(400)
        .json({
          message: `The following fields are required: ${missing.join(", ")}`,
        });
    }

    const {
      investorType,
      linkedIn,
      twitter,
      facebook,
      website,
      aboutMe,
      areasOfExpertise,
      numberOfInvestments,
      companies,
    } = req.body;

    const newInvestor = new Investor({
      investorType,
      linkedIn,
      twitter,
      facebook,
      website,
      aboutMe,
      areasOfExpertise,
      numberOfInvestments,
      companies,
    });

    const savedInvestor = await newInvestor.save();
    res
      .status(201)
      .json({
        message: "Investor created successfully",
        investor: savedInvestor,
      });
  } catch (error) {
    console.error("Creation error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/mohamed/investor/{id}:
 *   get:
 *     summary: جلب معلومات مستثمر بواسطة المعرف
 *     tags: [Investors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف المستثمر
 *     responses:
 *       200:
 *         description: معلومات المستثمر
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Investor'
 *       400:
 *         description: معرف غير صالح
 *       404:
 *         description: المستثمر غير موجود
 *       500:
 *         description: خطأ في السيرفر
 */
router.get("/investor/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid investor ID" });
    }

    const investor = await Investor.findById(req.params.id);
    if (!investor) {
      return res.status(404).json({ message: "Investor not found" });
    }
    res.status(200).json(investor);
  } catch (error) {
    console.error("Retrieval error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/mohamed/investor/{id}:
 *   put:
 *     summary: تحديث معلومات مستثمر
 *     tags: [Investors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف المستثمر
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Investor'
 *     responses:
 *       200:
 *         description: تم تحديث المستثمر بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 investor:
 *                   $ref: '#/components/schemas/Investor'
 *       400:
 *         description: معرف غير صالح أو حقول مطلوبة مفقودة
 *       404:
 *         description: المستثمر غير موجود
 *       500:
 *         description: خطأ في السيرفر
 */
router.put("/investor/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid investor ID" });
    }

    const requiredFields = ["investorType", "linkedIn", "aboutMe"];
    const missing = checkMissingFields(req.body, requiredFields);
    if (missing.length > 0) {
      return res
        .status(400)
        .json({
          message: `The following fields are required: ${missing.join(", ")}`,
        });
    }

    const updatedInvestor = await Investor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedInvestor) {
      return res.status(404).json({ message: "Investor not found" });
    }

    res.json({
      message: "Investor updated successfully",
      investor: updatedInvestor,
    });
  } catch (error) {
    console.error("Update error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
