const express = require("express");
const Stripe = require("stripe");
const bodyParser = require("body-parser");
require("dotenv").config();

const router = express.Router();

// middleware
router.use(bodyParser.json());
router.use(express.static("public"));

// افتح ملف .env وحط فيه المفتاح السري صح
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * @swagger
 * /api/matrix/payment/test:
 *   get:
 *     tags: [Payment]
 *     summary: اختبار أن السيرفر يعمل
 *     responses:
 *       200:
 *         description: السيرفر يعمل بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Server is working!
 */
router.get("/test", (req, res) => {
  res.json({ message: "Server is working!" });
});

/**
 * @swagger
 * /api/matrix/payment/test-stripe:
 *   post:
 *     tags: [Payment]
 *     summary: اختبار الاتصال مع Stripe
 *     responses:
 *       200:
 *         description: تم جلب طرق الدفع بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/test-stripe", async (req, res) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      limit: 1,
      type: "card",
    });
    res.json({ success: true, data: paymentMethods });
  } catch (error) {
    console.error("Stripe Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/matrix/payment/create-payment-method:
 *   post:
 *     tags: [Payment]
 *     summary: إنشاء طريقة دفع جديدة
 *     responses:
 *       200:
 *         description: تم إنشاء طريقة الدفع بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 paymentMethodId:
 *                   type: string
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/create-payment-method", async (req, res) => {
  try {
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        number: "4242424242424242", // بطاقة اختبار Visa
        exp_month: 12,
        exp_year: 2026,
        cvc: "123",
      },
    });
    res.json({ success: true, paymentMethodId: paymentMethod.id });
  } catch (error) {
    console.error("Create Payment Method Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/matrix/payment/process:
 *   post:
 *     tags: [Payment]
 *     summary: تنفيذ عملية الدفع
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethodId
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 description: معرف طريقة الدفع
 *     responses:
 *       200:
 *         description: تم تنفيذ عملية الدفع بنجاح
 *       400:
 *         description: بيانات غير صحيحة
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/process", async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    const amount = 14900; // 149.00 دولار بالسنت

    if (!paymentMethodId || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "بيانات غير صحيحة",
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      payment_method_types: ["card"],
      description: "Nudge Package Purchase",
    });

    res.json({ success: true, paymentIntent });
  } catch (error) {
    console.error("Stripe Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/matrix/payment/refund:
 *   post:
 *     tags: [Payment]
 *     summary: استرداد مبلغ الدفع
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentIntentId
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *                 description: معرف عملية الدفع
 *     responses:
 *       200:
 *         description: تم استرداد المبلغ بنجاح
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/refund", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
    });

    res.json({ success: true, refund });
  } catch (error) {
    console.error("Refund Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
