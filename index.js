const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
require("dotenv").config();
const connectDB = require("./shared/db");
const mongoose = require("mongoose");
const MohamedUser = require("./mohamed/models/user");
const Notification = require("./mohamed/models/Notification");
const swaggerUi = require("swagger-ui-express");
const swaggerSpecs = require("./swagger");
const cors = require("cors");

// تعيين القيم الافتراضية للمتغيرات البيئية
process.env.MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/unified-project";
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || "sk_test_your_stripe_key";

// JWT_SECRET must never fall back to a known default: a known secret lets
// anyone forge valid auth tokens. Fail fast instead.
if (!process.env.JWT_SECRET) {
  console.error(
    "JWT_SECRET environment variable is required — refusing to start with an insecure default."
  );
  process.exit(1);
}

// ميدل وير
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// إضافة io إلى الطلبات
app.use((req, res, next) => {
  req.io = io;
  next();
});

// راوتس محمود
app.use("/api/mahmoud", require("./mahmoud/routes/postjop"));
app.use("/api/mahmoud/apply", require("./mahmoud/routes/apply"));
app.use("/api/mahmoud/contact", require("./mahmoud/routes/contact"));
app.use("/api/mahmoud/signup", require("./mahmoud/routes/signupwithcv"));
app.use(
  "/api/mahmoud/prediction",
  require("./mahmoud/routes/successprediction")
);
app.use(
  "/api/mahmoud/investment-criteria",
  require("./mahmoud/routes/investmentcriteria")
);

// راوتس ماتريكس
app.use("/api/matrix/users", require("./matrix/routes/users"));
app.use("/api/matrix/forms", require("./matrix/routes/forms"));
app.use("/api/matrix/payment", require("./matrix/routes/payment"));
app.use("/api/matrix/password", require("./matrix/routes/password"));
app.use("/api/matrix/password-reset", require("./matrix/routes/passwordReset"));
app.use("/api/matrix/investor", require("./matrix/routes/investorRoutes"));
app.use("/api/matrix/startup", require("./matrix/routes/startupRoutes"));

// راوتس محمد
app.use(
  "/api/mohamed/notifications",
  require("./mohamed/routes/notificationRoutes")
);
app.use("/api/mohamed/chat", require("./mohamed/routes/chat").router);
app.use("/api/mohamed/experience", require("./mohamed/routes/experience"));
app.use("/api/mohamed/tellyour", require("./mohamed/routes/tellyour"));
app.use("/api/mohamed/users", require("./mohamed/routes/userRoutes"));
app.use("/api/mohamed/investor", require("./mohamed/routes/investorRoutes"));

// إعداد Socket.IO للإشعارات
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinUserRoom", async ({ userId }) => {
    try {
      const user = await MohamedUser.findById(userId);
      if (!user) {
        console.error("User not found:", userId);
        return;
      }
      socket.join(`user_${userId}`);
      socket.join(`role_${user.role}`);
      console.log(
        `User ${userId} joined rooms: user_${userId}, role_${user.role}`
      );
    } catch (err) {
      console.error("Error joining room:", err.message);
    }
  });

  socket.on("newNotification", async (notification) => {
    try {
      if (
        !notification.message ||
        !notification.time ||
        isNaN(new Date(notification.time))
      ) {
        console.error("Invalid notification data");
        return;
      }
      const newNotification = new Notification({
        message: notification.message,
        time: new Date(notification.time),
        userId: notification.userId || null,
        targetRole: notification.targetRole || null,
      });
      await newNotification.save();

      if (notification.userId) {
        io.to(`user_${notification.userId}`).emit(
          "notification",
          newNotification
        );
      } else if (notification.targetRole) {
        io.to(`role_${notification.targetRole}`).emit(
          "notification",
          newNotification
        );
      } else {
        io.emit("notification", newNotification);
      }
    } catch (err) {
      console.error("Error saving notification:", err.message);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// تهيئة الشات
const chat = require("./mohamed/routes/chat");
chat.setupSocket(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ error: "Something went wrong!", details: err.message });
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  server.close();
  console.log("Server and MongoDB connection closed");
  process.exit(0);
});

// Only connect to the DB and bind a port when run directly (`node index.js`).
// When imported (e.g. by tests via supertest), neither side effect runs.
if (require.main === module) {
  connectDB();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

module.exports = app;
