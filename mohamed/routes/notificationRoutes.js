const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       required:
 *         - message
 *         - time
 *       properties:
 *         message:
 *           type: string
 *           description: محتوى الإشعار
 *         time:
 *           type: string
 *           format: date-time
 *           description: وقت الإشعار
 *         userId:
 *           type: string
 *           description: معرف المستخدم (اختياري)
 *         targetRole:
 *           type: string
 *           enum: [investor, jobseeker, startup]
 *           description: نوع المستخدم المستهدف (اختياري)
 *         read:
 *           type: boolean
 *           description: حالة قراءة الإشعار
 */

/**
 * @swagger
 * /api/mohamed/notifications/send-notification:
 *   post:
 *     summary: إرسال إشعار جديد
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - time
 *             properties:
 *               message:
 *                 type: string
 *               time:
 *                 type: string
 *                 format: date-time
 *               userId:
 *                 type: string
 *               targetRole:
 *                 type: string
 *                 enum: [investor, jobseeker, startup]
 *     responses:
 *       200:
 *         description: تم إرسال الإشعار بنجاح
 *       400:
 *         description: بيانات غير صالحة
 *       500:
 *         description: خطأ في السيرفر
 */
router.post("/send-notification", async (req, res) => {
  const { message, time, userId, targetRole } = req.body;
  try {
    if (!message || !time || isNaN(new Date(time))) {
      return res.status(400).json({ error: "Invalid message or time" });
    }
    if (
      targetRole &&
      !["investor", "jobseeker", "startup"].includes(targetRole)
    ) {
      return res.status(400).json({ error: "Invalid targetRole" });
    }
    const newNotification = new Notification({
      message,
      time: new Date(time),
      userId: userId || null,
      targetRole: targetRole || null,
    });
    await newNotification.save();
    if (userId) {
      req.io.to(`user_${userId}`).emit("notification", newNotification);
    } else if (targetRole) {
      req.io.to(`role_${targetRole}`).emit("notification", newNotification);
    } else {
      req.io.emit("notification", newNotification);
    }
    res
      .status(200)
      .json({
        message: "Notification sent successfully",
        data: newNotification,
      });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to send notification", details: err.message });
  }
});

/**
 * @swagger
 * /api/mohamed/notifications:
 *   get:
 *     summary: جلب الإشعارات
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: معرف المستخدم للتصفية
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [investor, jobseeker, startup]
 *         description: نوع المستخدم للتصفية
 *     responses:
 *       200:
 *         description: قائمة الإشعارات
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       500:
 *         description: خطأ في السيرفر
 */
router.get("/notifications", async (req, res) => {
  const { userId, role } = req.query;
  try {
    const query = {};
    if (userId) query.userId = userId;
    if (role) query.targetRole = role;
    const notifications = await Notification.find(query).sort({
      createdAt: -1,
    });
    res.status(200).json(notifications);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch notifications", details: err.message });
  }
});

/**
 * @swagger
 * /api/mohamed/notifications/{id}:
 *   put:
 *     summary: تحديث حالة الإشعار
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف الإشعار
 *     responses:
 *       200:
 *         description: تم تحديث الإشعار بنجاح
 *       404:
 *         description: الإشعار غير موجود
 *       500:
 *         description: خطأ في السيرفر
 */
router.put("/notifications/:id", async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (notification.userId) {
      req.io
        .to(`user_${notification.userId}`)
        .emit("notificationUpdated", notification);
    } else if (notification.targetRole) {
      req.io
        .to(`role_${notification.targetRole}`)
        .emit("notificationUpdated", notification);
    } else {
      req.io.emit("notificationUpdated", notification);
    }
    res
      .status(200)
      .json({ message: "Notification updated", data: notification });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to update notification", details: err.message });
  }
});

/**
 * @swagger
 * /api/mohamed/notifications/{id}:
 *   delete:
 *     summary: حذف إشعار
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف الإشعار
 *     responses:
 *       200:
 *         description: تم حذف الإشعار بنجاح
 *       404:
 *         description: الإشعار غير موجود
 *       500:
 *         description: خطأ في السيرفر
 */
router.delete("/notifications/:id", async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (notification.userId) {
      req.io
        .to(`user_${notification.userId}`)
        .emit("notificationDeleted", { id: req.params.id });
    } else if (notification.targetRole) {
      req.io
        .to(`role_${notification.targetRole}`)
        .emit("notificationDeleted", { id: req.params.id });
    } else {
      req.io.emit("notificationDeleted", { id: req.params.id });
    }
    res
      .status(200)
      .json({ message: "Notification deleted", data: notification });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to delete notification", details: err.message });
  }
});

/**
 * @swagger
 * /api/mohamed/notifications/toggle-automatic-notifications:
 *   post:
 *     summary: تفعيل/تعطيل الإشعارات التلقائية
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enable
 *             properties:
 *               enable:
 *                 type: boolean
 *                 description: تفعيل أو تعطيل الإشعارات التلقائية
 *               targetRole:
 *                 type: string
 *                 enum: [investor, jobseeker, startup]
 *                 description: نوع المستخدم المستهدف (اختياري)
 *     responses:
 *       200:
 *         description: تم تحديث حالة الإشعارات التلقائية
 *       400:
 *         description: نوع مستخدم غير صالح
 */
router.post("/toggle-automatic-notifications", (req, res) => {
  const { enable, targetRole } = req.body;
  if (
    targetRole &&
    !["investor", "jobseeker", "startup"].includes(targetRole)
  ) {
    return res.status(400).json({ error: "Invalid targetRole" });
  }
  if (enable) {
    if (!global.notificationInterval) {
      global.notificationInterval = setInterval(() => {
        sendAutomaticNotification(req.io, targetRole);
      }, 100000); // تغيير إلى 100 ثانية
      res.json({
        message: `Automatic notifications enabled for ${targetRole || "all"}`,
      });
    } else {
      res.json({ message: "Automatic notifications already enabled" });
    }
  } else {
    if (global.notificationInterval) {
      clearInterval(global.notificationInterval);
      global.notificationInterval = null;
      res.json({ message: "Automatic notifications disabled" });
    } else {
      res.json({ message: "Automatic notifications already disabled" });
    }
  }
});

module.exports = router;

// دالة لإرسال الإشعارات التلقائية
async function sendAutomaticNotification(io, targetRole = null) {
  try {
    const message = `إشعار تلقائي من السيرفر - ${new Date().toLocaleString(
      "ar-EG"
    )}`;
    const newNotification = new Notification({
      message,
      time: new Date(),
      userId: null,
      targetRole,
    });
    await newNotification.save();
    if (targetRole) {
      io.to(`role_${targetRole}`).emit("notification", newNotification);
    } else {
      io.emit("notification", newNotification);
    }
    console.log("Automatic notification sent:", message);
  } catch (err) {
    console.error("Error sending automatic notification:", err.message);
  }
}
