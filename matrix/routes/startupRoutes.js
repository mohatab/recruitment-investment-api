const express = require("express");
const router = express.Router();
const MatrixStartup = require("../models/Startup");

/**
 * @swagger
 * /api/matrix/startup:
 *   post:
 *     tags: [Startups]
 *     summary: إنشاء شركة ناشئة جديدة
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
 *                 description: اسم الشركة الناشئة
 *     responses:
 *       201:
 *         description: تم إنشاء الشركة الناشئة بنجاح
 *       400:
 *         description: خطأ في البيانات المدخلة
 */
router.post("/startup", async (req, res) => {
  try {
    const startup = new MatrixStartup(req.body);
    await startup.save();
    res.status(201).json(startup);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/matrix/startups:
 *   get:
 *     tags: [Startups]
 *     summary: الحصول على جميع الشركات الناشئة
 *     responses:
 *       200:
 *         description: تم جلب الشركات الناشئة بنجاح
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/startups", async (req, res) => {
  try {
    const startups = await MatrixStartup.find();
    res.status(200).json(startups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/matrix/startup/{id}:
 *   get:
 *     tags: [Startups]
 *     summary: الحصول على شركة ناشئة محددة
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف الشركة الناشئة
 *     responses:
 *       200:
 *         description: تم جلب الشركة الناشئة بنجاح
 *       404:
 *         description: الشركة غير موجودة
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/startup/:id", async (req, res) => {
  try {
    const startup = await MatrixStartup.findById(req.params.id);
    if (!startup) {
      return res.status(404).json({ error: "الشركة غير موجودة" });
    }
    res.status(200).json(startup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
