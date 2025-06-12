const express = require("express");
const router = express.Router();

// استيراد النماذج
const Userchat = require("../models/userchat");
const Message = require("../models/Message");

/**
 * @swagger
 * components:
 *   schemas:
 *     Userchat:
 *       type: object
 *       required:
 *         - id
 *         - name
 *       properties:
 *         id:
 *           type: string
 *           description: معرف المستخدم
 *         name:
 *           type: string
 *           description: اسم المستخدم
 *         isOnline:
 *           type: boolean
 *           description: حالة اتصال المستخدم
 *     Message:
 *       type: object
 *       required:
 *         - senderId
 *         - receiverId
 *         - message
 *         - roomId
 *       properties:
 *         senderId:
 *           type: string
 *           description: معرف المرسل
 *         receiverId:
 *           type: string
 *           description: معرف المستلم
 *         message:
 *           type: string
 *           description: محتوى الرسالة
 *         roomId:
 *           type: string
 *           description: معرف غرفة المحادثة
 *         delivered:
 *           type: boolean
 *           description: حالة تسليم الرسالة
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: وقت إرسال الرسالة
 */

/**
 * @swagger
 * /api/mohamed/chat/register:
 *   post:
 *     summary: تسجيل مستخدم في نظام المحادثة
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - name
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تسجيل المستخدم بنجاح
 *       500:
 *         description: خطأ في السيرفر
 */
router.post("/register", async (req, res) => {
  console.log("Request received:", req.body);
  const { id, name } = req.body;
  try {
    await Userchat.findOneAndUpdate(
      { id },
      { name },
      { upsert: true, new: true }
    );
    res.send({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/mohamed/chat/conversations/{userId}:
 *   get:
 *     summary: جلب محادثات المستخدم
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف المستخدم
 *     responses:
 *       200:
 *         description: قائمة المحادثات
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: string
 *                   name:
 *                     type: string
 *                   lastMessage:
 *                     type: string
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   roomId:
 *                     type: string
 *                   isOnline:
 *                     type: boolean
 *       500:
 *         description: خطأ في السيرفر
 */
router.get("/conversations/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ timestamp: -1 });

    const conversations = {};
    for (const msg of messages) {
      const otherUserId =
        msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!conversations[otherUserId]) {
        const otherUser = await Userchat.findOne({ id: otherUserId });
        conversations[otherUserId] = {
          userId: otherUserId,
          name: otherUser?.name || "Unknown",
          lastMessage: msg.message,
          timestamp: msg.timestamp,
          roomId: msg.roomId,
          isOnline: otherUser?.isOnline || false,
        };
      }
    }

    const sortedConversations = Object.values(conversations).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    res.send(sortedConversations);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/mohamed/chat/messages/{roomId}:
 *   get:
 *     summary: جلب رسائل غرفة محادثة معينة
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: معرف غرفة المحادثة
 *     responses:
 *       200:
 *         description: قائمة الرسائل
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 *       500:
 *         description: خطأ في السيرفر
 */
router.get("/messages/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const messages = await Message.find({ roomId }).sort({ timestamp: 1 });
    res.send(messages);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/mohamed/chat/sendMessage:
 *   post:
 *     summary: إرسال رسالة
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - senderId
 *               - receiverId
 *               - message
 *               - roomId
 *             properties:
 *               senderId:
 *                 type: string
 *               receiverId:
 *                 type: string
 *               message:
 *                 type: string
 *               roomId:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم إرسال الرسالة بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       500:
 *         description: خطأ في السيرفر
 */
router.post("/sendMessage", async (req, res) => {
  const { senderId, receiverId, message, roomId } = req.body;
  try {
    const receiver = await Userchat.findOne({ id: receiverId });
    const newMessage = new Message({
      senderId,
      receiverId,
      message,
      roomId,
      delivered: receiver?.isOnline || false,
    });
    await newMessage.save();
    // إشعار الوقت الفعلي إذا كان المستلم أونلاين
    if (req.io && receiver?.isOnline) {
      req.io
        .to(roomId)
        .emit("chat message", {
          senderId,
          message,
          timestamp: newMessage.timestamp,
        });
    }
    res.send({ success: true, message: newMessage });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// إعداد Socket.IO
const setupSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("join room", async ({ roomId, userId }) => {
      socket.join(roomId);
      socket.userId = userId;
      console.log(`User ${userId} joined room: ${roomId}`);
      await Userchat.findOneAndUpdate(
        { id: userId },
        { isOnline: true },
        { upsert: true, new: true }
      );
      io.emit("user status", { userId, isOnline: true });

      // إرسال الرسائل المعلقة للمستلم عند الاتصال
      const pendingMessages = await Message.find({
        receiverId: userId,
        delivered: false,
        roomId,
      });
      for (const msg of pendingMessages) {
        io.to(roomId).emit("chat message", {
          senderId: msg.senderId,
          message: msg.message,
          timestamp: msg.timestamp,
        });
        await Message.findByIdAndUpdate(msg._id, { delivered: true }); // تحديث حالة التسليم
      }
    });

    socket.on("chat message", async ({ roomId, message, receiverId }) => {
      const senderId = socket.userId;
      const newMessage = new Message({
        senderId,
        receiverId,
        message,
        roomId,
        delivered: false,
      });
      await newMessage.save();
      const receiver = await Userchat.findOne({ id: receiverId });
      if (receiver?.isOnline) {
        io.to(roomId).emit("chat message", {
          senderId,
          message,
          timestamp: newMessage.timestamp,
        });
        await Message.findByIdAndUpdate(newMessage._id, { delivered: true });
      }
      io.emit("new message", { roomId, senderId, receiverId });
    });

    socket.on("disconnect", async () => {
      console.log("A user disconnected");
      if (socket.userId) {
        await Userchat.findOneAndUpdate(
          { id: socket.userId },
          { isOnline: false }
        );
        io.emit("user status", { userId: socket.userId, isOnline: false });
      }
    });
  });
};

module.exports = { router, setupSocket };
