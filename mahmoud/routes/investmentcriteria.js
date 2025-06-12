const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const investmentCriteriaSchema = new mongoose.Schema({
  investment_range: {
    min: Number,
    max: Number,
  },
  locations: [String],
  stages: [String],
  industries: [String],
  languages: [String],
});

const InvestmentCriteria = mongoose.model(
  "InvestmentCriteria",
  investmentCriteriaSchema
);

/**
 * @swagger
 * /api/mahmoud/investment-criteria:
 *   post:
 *     tags: [Investment Criteria]
 *     summary: حفظ معايير الاستثمار
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - investment_range
 *               - locations
 *               - stages
 *               - industries
 *               - languages
 *             properties:
 *               investment_range:
 *                 type: object
 *                 required:
 *                   - min
 *                   - max
 *                 properties:
 *                   min:
 *                     type: number
 *                     description: الحد الأدنى للاستثمار
 *                   max:
 *                     type: number
 *                     description: الحد الأقصى للاستثمار
 *               locations:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: المواقع المستهدفة
 *               stages:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: مراحل الاستثمار
 *               industries:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: الصناعات المستهدفة
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: اللغات المدعومة
 *     responses:
 *       200:
 *         description: تم حفظ معايير الاستثمار بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: بيانات غير صحيحة
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/", async (req, res) => {
  const { investment_range, locations, stages, industries, languages } =
    req.body;

  if (!investment_range || !locations || !stages || !industries || !languages) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (!investment_range.min || !investment_range.max) {
    return res
      .status(400)
      .json({
        error: "The minimum and maximum investment range must be specified",
      });
  }

  const min = parseFloat(investment_range.min);
  const max = parseFloat(investment_range.max);

  if (min > max) {
    return res
      .status(400)
      .json({ error: "The minimum must be less than or equal to the maximum" });
  }

  if (
    !Array.isArray(locations) ||
    !Array.isArray(stages) ||
    !Array.isArray(industries) ||
    !Array.isArray(languages)
  ) {
    return res
      .status(400)
      .json({
        error: "Locations, stages, industries, and languages must be arrays",
      });
  }

  const investmentCriteria = new InvestmentCriteria({
    investment_range: { min, max },
    locations,
    stages,
    industries,
    languages,
  });

  try {
    const savedCriteria = await investmentCriteria.save();
    res
      .status(200)
      .json({
        message: "Investment criteria saved successfully",
        data: savedCriteria,
      });
  } catch (error) {
    console.error("Database save error:", error);
    res.status(500).json({ error: "Failed to save investment criteria" });
  }
});

module.exports = router;
