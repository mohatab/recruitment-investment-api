const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const validator = require("validator");
const sanitize = require("sanitize-filename");
const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + sanitize(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Error: Images only are allowed (jpg, png)!"));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const contactSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  country: { type: String },
  city: { type: String },
  profileImage: { type: String },
  coverImage: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const Contact = mongoose.model("Contact", contactSchema);

/**
 * @swagger
 * /api/mahmoud/contact:
 *   post:
 *     tags: [Contacts]
 *     summary: إنشاء جهة اتصال جديدة
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - phoneNumber
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               country:
 *                 type: string
 *               city:
 *                 type: string
 *               profileImage:
 *                 type: string
 *                 format: binary
 *               coverImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: تم حفظ جهة الاتصال بنجاح
 *       400:
 *         description: بيانات غير صحيحة
 *       500:
 *         description: خطأ في الخادم
 */
router.post(
  "/",
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { firstName, lastName, email, phoneNumber, country, city } =
        req.body;

      if (!firstName || !lastName || !email || !phoneNumber) {
        return res
          .status(400)
          .json({ message: "All required fields are missing" });
      }

      if (!validator.isEmail(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      const profileImage = req.files?.profileImage?.[0]?.path || null;
      const coverImage = req.files?.coverImage?.[0]?.path || null;

      const newContact = new Contact({
        firstName,
        lastName,
        email,
        phoneNumber,
        country,
        city,
        profileImage,
        coverImage,
      });

      await newContact.save();

      return res.status(200).json({
        message: "Contact information saved successfully",
        data: newContact,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "An error occurred" });
    }
  }
);

module.exports = router;
