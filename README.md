# المشروع الموحد

مشروع يجمع بين ثلاثة أنظمة رئيسية: نظام محمود، نظام محمد، ونظام ماتريكس.

## المميزات

- نظام إشعارات في الوقت الفعلي
- نظام محادثات متكامل
- إدارة المستخدمين والمستثمرين
- نظام خبرات وقصص النجاح
- واجهة برمجة تطبيقات RESTful
- توثيق Swagger مدمج

## المتطلبات

- Node.js (v14 أو أحدث)
- MongoDB
- npm أو yarn

## التثبيت

1. استنسخ المشروع

```bash
git clone https://github.com/yourusername/unified-project.git
cd unified-project
```

2. ثبت الاعتمادات

```bash
npm install
```

3. أنشئ ملف `.env` وأضف المتغيرات المطلوبة

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
SOCKET_IO_PORT=3001
CLOUDINARY_URL=your_cloudinary_url
```

4. شغل المشروع

```bash
node index.js
```

## الوثائق

- يمكنك الوصول إلى وثائق API على: `http://localhost:3000/api-docs`
- للمزيد من التفاصيل، راجع ملف `API_DOCUMENTATION.md`
