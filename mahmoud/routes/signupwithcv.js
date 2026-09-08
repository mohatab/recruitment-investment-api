const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const router = express.Router();
const User = require("../models/User");
require("dotenv").config();

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("cv");

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ error: "Authentication token not provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid authentication token" });
  }
}

router.post("/register-cv", (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "The file size exceeds 5 MB" });
      }
      return res
        .status(500)
        .json({ error: "Failed to upload the file", details: err.message });
    } else if (err) {
      return res
        .status(500)
        .json({ error: "Failed to upload the file", details: err.message });
    }

    try {
      const { email } = req.body;
      if (!email || !req.file) {
        return res.status(400).json({ error: "Email and CV are required" });
      }

      const userExists = await User.findOne({ email });
      if (userExists)
        return res.status(400).json({ error: "User already exists" });

      const user = new User({ email, cv: req.file.path });
      await user.save();
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res
        .status(201)
        .json({ message: "Successfully registered with CV", token });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Registration failed", details: err.message });
    }
  });
});

router.post("/register-manually", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ error: "User already exists" });

    const user = new User({ username, email, password });
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res
      .status(201)
      .json({ message: "Manual registration completed successfully", token });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Registration failed", details: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    // إذا كان المستخدم سجل بالـ CV (ما عندوش password)، ما ينفعش يسجل الدخول بالطريقة دي
    if (!user.password) {
      return res.status(400).json({
        error: "This user is registered using a CV and cannot log in this way",
      });
    }

    if (await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.json({ message: "Logged in successfully", token });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

module.exports = router;
