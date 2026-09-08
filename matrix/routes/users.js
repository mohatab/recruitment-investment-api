const { User, validate } = require("../models/user");
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();

/**
 * @swagger
 * /api/matrix/users:
 *   get:
 *     tags: [Users]
 *     summary: الحصول على جميع المستخدمين
 *     responses:
 *       200:
 *         description: تم جلب المستخدمين بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   email:
 *                     type: string
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/", async (req, res) => {
  try {
    const users = await User.find();
    res.send(users);
  } catch (error) {
    res.status(500).send("An error occurred");
    console.log(error);
  }
});

/**
 * @swagger
 * /api/matrix/users:
 *   post:
 *     tags: [Users]
 *     summary: إنشاء مستخدم جديد
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 description: اسم المستخدم
 *               email:
 *                 type: string
 *                 format: email
 *                 description: البريد الإلكتروني
 *               password:
 *                 type: string
 *                 description: كلمة المرور
 *     responses:
 *       200:
 *         description: تم إنشاء المستخدم بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *       400:
 *         description: خطأ في البيانات المدخلة
 *       500:
 *         description: خطأ في الخادم
 */
router.post("/", async (req, res) => {
  try {
    const { error } = validate(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    // تشفير كلمة المرور
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    const user = await new User({
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword,
    }).save();

    res.send(user);
  } catch (error) {
    res.send("An error occured");
    console.log(error);
  }
});

module.exports = router;
