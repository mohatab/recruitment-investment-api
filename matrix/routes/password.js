require("dotenv").config();
const express = require("express");
const passwordReset = require("./passwordReset");
const users = require("./users");
const connectDB = require("../../shared/db");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const router = express.Router();

router.use(bodyParser.json());
router.use(express.json());

router.use("/users", users);
router.use("/reset", passwordReset);

// Example User DB (Replace with real DB code)
let fakeUser = {
  id: "123",
  username: "mohamed",
  passwordHash: "$2b$10$yEhA9kXfBMOdQreId4LZNOv9kzL4xCK4eVW6ABsWQrrDCDPOWD7aS", // hashed password: "oldpassword"
};

// ✅ Change Password API
router.post("/change", async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;

  // ✅ 1. Verify user exists
  if (userId !== fakeUser.id) {
    return res.status(404).json({ message: "User not found" });
  }

  // ✅ 2. Check old password
  const isMatch = await bcrypt.compare(oldPassword, fakeUser.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ message: "كلمة السر القديمة غلط" });
  }

  // ✅ 3. Hash new password
  const newHashedPassword = await bcrypt.hash(newPassword, 10);

  // ✅ 4. Save to DB (replace this with real DB update)
  fakeUser.passwordHash = newHashedPassword;

  res.json({ message: "تم تغيير كلمة السر بنجاح" });
});

module.exports = router;
