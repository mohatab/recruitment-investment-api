const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const router = express.Router();
const User = require("../models/User");
const Job = require("../models/Job");

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token)
    return res
      .status(401)
      .json({ message: "Access denied. Authentication token not provided." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid authentication token" });
  }
};

/**
 * @swagger
 * /api/mahmoud/register:
 *   post:
 *     tags: [Authentication]
 *     summary: تسجيل مستخدم جديد
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: تم تسجيل المستخدم بنجاح
 *       400:
 *         description: المستخدم موجود بالفعل
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "User already exists" });

    const user = new User({ email, password });
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/mahmoud/login:
 *   post:
 *     tags: [Authentication]
 *     summary: تسجيل الدخول
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تسجيل الدخول بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: بيانات غير صحيحة
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/mahmoud:
 *   post:
 *     tags: [Jobs]
 *     summary: إنشاء وظيفة جديدة
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - role
 *               - minSalary
 *               - maxSalary
 *               - salaryType
 *               - applyMethod
 *               - description
 *               - responsibilities
 *               - tags
 *               - vacancies
 *               - expirationDate
 *             properties:
 *               title:
 *                 type: string
 *               role:
 *                 type: string
 *               minSalary:
 *                 type: number
 *               maxSalary:
 *                 type: number
 *               salaryType:
 *                 type: string
 *               applyMethod:
 *                 type: string
 *               description:
 *                 type: string
 *               responsibilities:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               vacancies:
 *                 type: number
 *               expirationDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: تم إنشاء الوظيفة بنجاح
 *       400:
 *         description: بيانات غير صحيحة
 *       401:
 *         description: غير مصرح
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const jobData = req.body;

    if (
      !jobData.title ||
      !jobData.role ||
      !jobData.minSalary ||
      !jobData.maxSalary ||
      !jobData.salaryType ||
      !jobData.applyMethod ||
      !jobData.description ||
      !jobData.responsibilities ||
      !jobData.tags ||
      !jobData.vacancies ||
      !jobData.expirationDate
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided" });
    }

    const job = new Job(jobData);
    job.updatedAt = Date.now();
    await job.save();

    res.status(201).json({ message: "Job posted successfully", job });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/mahmoud:
 *   get:
 *     tags: [Jobs]
 *     summary: الحصول على جميع الوظائف
 *     responses:
 *       200:
 *         description: تم جلب الوظائف بنجاح
 *       500:
 *         description: خطأ في الخادم
 */
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find();
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
