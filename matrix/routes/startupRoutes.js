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
 *               - email
 *               - description
 *             properties:
 *               name:
 *                 type: string
 *                 description: اسم الشركة الناشئة
 *               email:
 *                 type: string
 *                 format: email
 *                 description: البريد الإلكتروني للشركة
 *               description:
 *                 type: string
 *                 description: وصف الشركة
 *               pitchTitle:
 *                 type: string
 *                 description: عنوان العرض التقديمي
 *               website:
 *                 type: string
 *                 description: الموقع الإلكتروني
 *               location:
 *                 type: string
 *                 description: الموقع
 *               mobileNumber:
 *                 type: string
 *                 description: رقم الهاتف المحمول
 *               industry1:
 *                 type: string
 *                 description: المجال الأول
 *               industry2:
 *                 type: string
 *                 description: المجال الثاني
 *               stage:
 *                 type: string
 *                 description: مرحلة الشركة
 *               idealInvestorRole:
 *                 type: string
 *                 description: دور المستثمر المثالي
 *               previousRaised:
 *                 type: number
 *                 description: المبلغ المجمع سابقاً
 *               totalRaising:
 *                 type: number
 *                 description: إجمالي المبلغ المطلوب
 *               raisedSoFar:
 *                 type: number
 *                 description: المبلغ المجمع حتى الآن
 *               minInvestment:
 *                 type: number
 *                 description: الحد الأدنى للاستثمار
 *     responses:
 *       201:
 *         description: تم إنشاء الشركة الناشئة بنجاح
 *       400:
 *         description: خطأ في البيانات المدخلة
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, description } = req.body;

    // التحقق من وجود الحقول المطلوبة
    if (!name || !email || !description) {
      return res.status(400).json({
        error: "الحقول التالية مطلوبة: name, email, description",
      });
    }

    const startup = new MatrixStartup(req.body);
    await startup.save();
    res.status(201).json(startup);
  } catch (err) {
    // التحقق من نوع الخطأ
    if (err.code === 11000) {
      return res.status(400).json({
        error: "البريد الإلكتروني مستخدم بالفعل",
      });
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/matrix/startup:
 *   get:
 *     tags: [Startups]
 *     summary: الحصول على جميع الشركات الناشئة
 *     responses:
 *       200:
 *         description: تم جلب الشركات الناشئة بنجاح
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/", async (req, res) => {
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
router.get("/:id", async (req, res) => {
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
