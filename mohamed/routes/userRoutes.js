const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - email
 *         - password
 *       properties:
 *         firstName:
 *           type: string
 *           description: First name of the user
 *         lastName:
 *           type: string
 *           description: Last name of the user
 *         email:
 *           type: string
 *           description: Email address of the user
 *         password:
 *           type: string
 *           description: User's password
 *         user_type:
 *           type: string
 *           description: Type of user (optional)
 */

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).send("Unauthorized");

  jwt.verify(token, "secret", (err, user) => {
    if (err) return res.status(403).send("Forbidden");
    req.user = user;
    next();
  });
};

/**
 * @swagger
 * /api/mohamed/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *               - password
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               user_type:
 *                 type: string
 *     responses:
 *       200:
 *         description: User registered successfully
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
router.post("/register", async (req, res) => {
  const { first_name, last_name, password, email, user_type } = req.body;
  if (!first_name || !last_name || !password || !email) {
    return res.status(400).send("Please provide all the required fields.");
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.send("User already exists");

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      firstName: first_name,
      lastName: last_name,
      password: hashedPassword,
      email,
      user_type,
    });

    await newUser.save();
    res.send("User registered successfully");
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).send("Error registering user");
  }
});

/**
 * @swagger
 * /api/mohamed/login:
 *   post:
 *     summary: Login user
 *     tags: [Users]
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       400:
 *         description: Missing credentials
 *       500:
 *         description: Server error
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).send("Please provide all the details");

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.send("Invalid credentials");
    }

    const token = jwt.sign({ email: user.email }, "secret", {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).send("Error logging in");
  }
});

/**
 * @swagger
 * /api/mohamed/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   username:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/users", verifyToken, async (req, res) => {
  try {
    const users = await User.find({}, { _id: 1, username: 1 });
    res.send(users);
  } catch (err) {
    console.error("Error fetching users:", err.message);
    res.status(500).send("Error fetching users");
  }
});

/**
 * @swagger
 * /api/mohamed/user/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get("/user/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id, "email username phone");
    if (!user) return res.status(404).send("User not found");
    res.send(user);
  } catch (err) {
    console.error("Error fetching user:", err.message);
    res.status(500).send("Error fetching user");
  }
});

/**
 * @swagger
 * /api/mohamed/user/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.put("/user/:id", verifyToken, async (req, res) => {
  const { username, email, phone } = req.body;
  try {
    await User.findByIdAndUpdate(req.params.id, { username, email, phone });
    res.send("User updated successfully");
  } catch (err) {
    console.error("Error updating user:", err.message);
    res.status(500).send("Error updating user");
  }
});

/**
 * @swagger
 * /api/mohamed/user/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.delete("/user/:id", verifyToken, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.send("User deleted successfully");
  } catch (err) {
    console.error("Error deleting user:", err.message);
    res.status(500).send("Error deleting user");
  }
});

module.exports = router;
