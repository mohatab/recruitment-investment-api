const express = require("express");
const router = express.Router();
const Investor = require("../models/Investor");

/**
 * @swagger
 * /api/matrix/investor:
 *   post:
 *     tags: [Investors]
 *     summary: إضافة مستثمر جديد
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: اسم المستثمر
 *     responses:
 *       201:
 *         description: تم إضافة المستثمر بنجاح
 *       400:
 *         description: خطأ في البيانات المدخلة
 */
router.post("/", async (req, res) => {
  try {
    const investor = new Investor(req.body);
    await investor.save();
    res.status(201).json(investor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/matrix/investor:
 *   get:
 *     tags: [Investors]
 *     summary: الحصول على جميع المستثمرين
 *     responses:
 *       200:
 *         description: تم جلب المستثمرين بنجاح
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/", async (req, res) => {
  try {
    const investors = await Investor.find();
    res.status(200).json(investors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/matrix/investor/{id}:
 *   get:
 *     tags: [Investors]
 *     summary: الحصول على بيانات مستثمر محدد
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف المستثمر
 *     responses:
 *       200:
 *         description: تم جلب بيانات المستثمر بنجاح
 *       404:
 *         description: المستثمر غير موجود
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/:id", async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    if (!investor) {
      return res.status(404).json({ error: "المستثمر غير موجود" });
    }
    res.status(200).json(investor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
