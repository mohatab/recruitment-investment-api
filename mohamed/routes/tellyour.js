const express = require("express");
const router = express.Router();
const User = require("../models/your");

/**
 * @swagger
 * components:
 *   schemas:
 *     TellYourUser:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - birthdate
 *         - gender
 *         - nationality
 *         - location
 *         - mobileNumber
 *       properties:
 *         firstName:
 *           type: string
 *           description: الاسم الأول
 *         lastName:
 *           type: string
 *           description: اسم العائلة
 *         birthdate:
 *           type: object
 *           required:
 *             - day
 *             - month
 *             - year
 *           properties:
 *             day:
 *               type: string
 *               description: يوم الميلاد
 *             month:
 *               type: string
 *               description: شهر الميلاد
 *             year:
 *               type: string
 *               description: سنة الميلاد
 *         gender:
 *           type: string
 *           description: الجنس
 *         nationality:
 *           type: string
 *           description: الجنسية
 *         location:
 *           type: object
 *           required:
 *             - country
 *             - city
 *             - area
 *           properties:
 *             country:
 *               type: string
 *               description: الدولة
 *             city:
 *               type: string
 *               description: المدينة
 *             area:
 *               type: string
 *               description: المنطقة
 *         mobileNumber:
 *           type: string
 *           description: رقم الهاتف المحمول
 */

/**
 * @swagger
 * /api/mohamed/tellyour/submit:
 *   post:
 *     summary: تقديم معلومات المستخدم
 *     tags: [TellYour]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - day
 *               - month
 *               - year
 *               - gender
 *               - nationality
 *               - country
 *               - city
 *               - area
 *               - mobileNumber
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               day:
 *                 type: string
 *               month:
 *                 type: string
 *               year:
 *                 type: string
 *               gender:
 *                 type: string
 *               nationality:
 *                 type: string
 *               country:
 *                 type: string
 *               city:
 *                 type: string
 *               area:
 *                 type: string
 *               mobileNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: تم تقديم معلومات المستخدم بنجاح
 *       400:
 *         description: جميع الحقول مطلوبة
 *       500:
 *         description: خطأ في السيرفر
 */
router.post("/submit", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      day,
      month,
      year,
      gender,
      nationality,
      country,
      city,
      area,
      mobileNumber,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !day ||
      !month ||
      !year ||
      !gender ||
      !nationality ||
      !country ||
      !city ||
      !area ||
      !mobileNumber
    ) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const newUser = new User({
      firstName,
      lastName,
      birthdate: { day, month, year },
      gender,
      nationality,
      location: { country, city, area },
      mobileNumber,
    });

    await newUser.save();
    res.status(201).json({ message: "User info submitted successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

/**
 * @swagger
 * /api/mohamed/tellyour/users:
 *   get:
 *     summary: جلب جميع المستخدمين
 *     tags: [TellYour]
 *     responses:
 *       200:
 *         description: قائمة المستخدمين
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TellYourUser'
 *       500:
 *         description: خطأ في السيرفر
 */
router.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

module.exports = router;
