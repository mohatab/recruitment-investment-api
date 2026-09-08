const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const startupSchema = new mongoose.Schema({
  isSoftwareBased: Boolean,
  hasAdCampaigns: Boolean,
  hasConsulting: Boolean,
  totalFunding: Number,
  prediction: String,
  createdAt: { type: Date, default: Date.now },
});

const Startup = mongoose.model("Startup", startupSchema);

/**
 * @swagger
 * /api/mahmoud/prediction:
 *   post:
 *     tags: [Success Prediction]
 *     summary: التنبؤ بنجاح الشركة الناشئة
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isSoftwareBased
 *               - hasAdCampaigns
 *               - hasConsulting
 *               - totalFunding
 *             properties:
 *               isSoftwareBased:
 *                 type: boolean
 *                 description: هل الشركة تعتمد على البرمجيات
 *               hasAdCampaigns:
 *                 type: boolean
 *                 description: هل لديها حملات إعلانية
 *               hasConsulting:
 *                 type: boolean
 *                 description: هل تقدم خدمات استشارية
 *               totalFunding:
 *                 type: number
 *                 description: إجمالي التمويل
 *     responses:
 *       200:
 *         description: تم التنبؤ بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 prediction:
 *                   type: string
 *       400:
 *         description: بيانات غير صحيحة
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/", async (req, res) => {
  try {
    const { isSoftwareBased, hasAdCampaigns, hasConsulting, totalFunding } =
      req.body;

    if (
      typeof isSoftwareBased !== "boolean" ||
      typeof hasAdCampaigns !== "boolean" ||
      typeof hasConsulting !== "boolean" ||
      typeof totalFunding !== "number"
    ) {
      return res.status(400).json({
        success: false,
        message: "The input data types are incorrect",
      });
    }

    let prediction = "Unknown";
    if (totalFunding > 500000 && (isSoftwareBased || hasAdCampaigns)) {
      prediction = "It's likely to succeed";
    } else {
      prediction = "It's unlikely to succeed";
    }

    const startup = new Startup({
      isSoftwareBased,
      hasAdCampaigns,
      hasConsulting,
      totalFunding,
      prediction,
    });

    await startup.save();
    res.json({ success: true, prediction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
