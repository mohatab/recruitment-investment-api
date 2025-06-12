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
