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

/**
 * @swagger
 * /api/matrix/password/change:
 *   post:
 *     tags: [Password]
 *     summary: تغيير كلمة المرور
 *     description: تغيير كلمة المرور للمستخدم بعد التحقق من كلمة المرور القديمة
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               userId:
 *                 type: string
 *                 description: معرف المستخدم
 *               oldPassword:
 *                 type: string
 *                 description: كلمة المرور القديمة
 *               newPassword:
 *                 type: string
 *                 description: كلمة المرور الجديدة
 *     responses:
 *       200:
 *         description: تم تغيير كلمة المرور بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: كلمة المرور القديمة غير صحيحة
 *       404:
 *         description: المستخدم غير موجود
 */
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
