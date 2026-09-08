# توثيق واجهة برمجة التطبيقات (API Documentation)

# اجدع مسا عليكو يا احلي شباب

## نظرة عامة

هذا المشروع يتكون من نظامين رئيسيين:

1. نظام محمود: يركز على التوظيف والتقديم للوظائف
2. نظام ماتريكس: يركز على إدارة المستثمرين والشركات الناشئة

## معلومات عامة

- الرابط الأساسي: `http://localhost:3000`
- جميع الطلبات تستخدم JSON ما لم يذكر خلاف ذلك
- التوثيق يتبع معيار OpenAPI 3.0

## رموز الاستجابة العامة

- `200`: نجاح العملية
- `201`: تم الإنشاء بنجاح
- `400`: خطأ في البيانات المرسلة
- `401`: غير مصرح
- `403`: ممنوع الوصول
- `404`: غير موجود
- `500`: خطأ في الخادم

---

## 🟢 نظام محمود

### 1. إدارة المستخدمين والمصادقة

#### التسجيل باستخدام السيرة الذاتية

POST /api/mahmoud/signup/register-cv
Content-Type: multipart/form-data
**المعاملات المطلوبة:**

"email": "string",
"cv": "file (PDF/Word)"

**الاستجابة الناجحة:**
json
{
"message": "تم التسجيل بنجاح باستخدام CV",
"token": "JWT_TOKEN"
}

#### التسجيل اليدوي

POST /api/mahmoud/signup/register-manually

**المعاملات المطلوبة:**
json
{
"username": "string",
"email": "string",
"password": "string"
}

**الاستجابة الناجحة:**
json
{
"message": "تم التسجيل يدويًا بنجاح",
"token": "JWT_TOKEN"
}

#### تسجيل الدخول

POST /api/mahmoud/signup/login

**المعاملات المطلوبة:**
json
{
"email": "string",
"password": "string"
}

**الاستجابة الناجحة:**
json
{
"message": "تم تسجيل الدخول بنجاح",
"token": "JWT_TOKEN"
}

### 2. إدارة الوظائف

#### نشر وظيفة جديدة

1- تسجيل الدخول للحصول على التوكن
POST /api/mahmoud/postjop/login
{
    "email": "البريد الإلكتروني",
    "password": "كلمة المرور"
}

2- نشر الوظيفة
POST /api/mahmoud/postjop
Authorization: Bearer {token}

**المعاملات المطلوبة:**
json
{
"title": "string",
"role": "string",
"minSalary": "number",
"maxSalary": "number",
"salaryType": "string",
"applyMethod": "string",
"description": "string",
"responsibilities": "string",
"tags": ["string"],
"vacancies": "number",
"expirationDate": "date"
}

**الاستجابة الناجحة:**
json
{
"message": "تم نشر الوظيفة بنجاح",
"job": {
// تفاصيل الوظيفة
}
}

#### عرض جميع الوظائف

GET /api/mahmoud/postjop

**الاستجابة الناجحة:**
json
[
{
// تفاصيل الوظيفة 1
},
{
// تفاصيل الوظيفة 2
}
]

### 3. التقديم على وظيفة

#### تقديم طلب

POST /api/mahmoud/apply

**المعاملات المطلوبة:**
json
{
"resume": "string",
"coverLetter": "string (min: 10 chars)",
"jobTitle": "string"
}

**الاستجابة الناجحة:**
json
{
"message": "تم إرسال الطلب بنجاح"
}

### 4. التنبؤ بنجاح الشركات الناشئة

#### تحليل نجاح الشركة

POST /api/mahmoud/successprediction

**المعاملات المطلوبة:**
json
{
"isSoftwareBased": "boolean",
"hasAdCampaigns": "boolean",
"hasConsulting": "boolean",
"totalFunding": "number"
}

**الاستجابة الناجحة:**
json
{
"success": true,
"prediction": "من المحتمل أن ينجح/من غير المحتمل أن ينجح"
}

### 5. إدارة جهات الاتصال

#### إنشاء جهة اتصال جديدة

POST /api/mahmoud/contact
Content-Type: multipart/form-data

**المعاملات المطلوبة:**

```json
{
  "firstName": "string (مطلوب)",
  "lastName": "string (مطلوب)",
  "email": "string (مطلوب)",
  "phoneNumber": "string (مطلوب)",
  "country": "string (اختياري)",
  "city": "string (اختياري)",
  "profileImage": "file (اختياري - صورة jpg/png)",
  "coverImage": "file (اختياري - صورة jpg/png)"
}
```

**الاستجابة الناجحة:**

```json
{
  "message": "تم حفظ معلومات جهة الاتصال بنجاح",
  "data": {
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phoneNumber": "string",
    "country": "string",
    "city": "string",
    "profileImage": "string (مسار الملف)",
    "coverImage": "string (مسار الملف)",
    "createdAt": "date"
  }
}
```

**ملاحظات:**

- حجم الصور يجب ألا يتجاوز 5 ميجابايت
- الصور المسموح بها فقط بصيغة JPG أو PNG
- يتم التحقق من صحة البريد الإلكتروني

### 6. معايير الاستثمار

#### إضافة معايير استثمار جديدة

POST /api/mahmoud/investment

**المعاملات المطلوبة:**

```json
{
  "investment_range": {
    "min": "number (مطلوب)",
    "max": "number (مطلوب)"
  },
  "locations": ["string (مطلوب)"],
  "stages": ["string (مطلوب)"],
  "industries": ["string (مطلوب)"],
  "languages": ["string (مطلوب)"]
}
```

**الاستجابة الناجحة:**

```json
{
  "message": "تم حفظ معايير الاستثمار بنجاح",
  "data": {
    "investment_range": {
      "min": "number",
      "max": "number"
    },
    "locations": ["string"],
    "stages": ["string"],
    "industries": ["string"],
    "languages": ["string"]
  }
}
```

**ملاحظات:**

- يجب أن يكون الحد الأدنى للاستثمار أقل من أو يساوي الحد الأقصى
- جميع المصفوفات (locations, stages, industries, languages) يجب أن تحتوي على قيمة واحدة على الأقل

---

## 🔵 نظام ماتريكس

### 1. إدارة المستخدمين

#### إنشاء مستخدم جديد

POST /api/matrix/users

**المعاملات المطلوبة:**
json
{
"name": "string",
"email": "string",
"password": "string"
}

**الاستجابة الناجحة:**
json
{
"name": "string",
"email": "string",
"\_id": "string",
"createdAt": "date"
}

#### عرض جميع المستخدمين

GET /api/matrix/users

**الاستجابة الناجحة:**
json
[
{
"_id": "string",
"name": "string",
"email": "string",
"createdAt": "date"
}
]

### 2. إدارة الشركات الناشئة

#### إنشاء شركة ناشئة

POST /api/matrix/forms/startup/startup

**المعاملات المطلوبة:**
json
{
"name": "string",
"email": "string",
"description": "string",
"pitchTitle": "string (اختياري)",
"website": "string (اختياري)",
"teamSize": "number (اختياري)",
"fundingStage": "string (اختياري)",
"industry": "string (اختياري)"
}

**الاستجابة الناجحة:**
json
{
"\_id": "string",
"name": "string",
"email": "string",
"description": "string",
"createdAt": "date"
}

#### عرض جميع الشركات

GET /api/matrix/forms/startup/startups

**الاستجابة الناجحة:**
json
[
{
"_id": "string",
"name": "string",
"email": "string",
"description": "string",
"pitchTitle": "string",
"website": "string",
"teamSize": "number",
"fundingStage": "string",
"industry": "string",
"createdAt": "date"
}
]

#### عرض شركة محددة

GET /api/matrix/forms/startup/startup/:id

**الاستجابة الناجحة:**
json
{
"\_id": "string",
"name": "string",
"email": "string",
"description": "string",
"pitchTitle": "string",
"website": "string",
"teamSize": "number",
"fundingStage": "string",
"industry": "string",
"createdAt": "date"
}

### 3. إدارة المستثمرين

#### إنشاء مستثمر

POST /api/matrix/forms/investor/investor

**المعاملات المطلوبة:**
json
{
"name": "string",
"email": "string",
"investmentRange": {
"min": "number",
"max": "number"
},
"investmentStage": "string",
"sectors": ["string"],
"location": "string",
"bio": "string (اختياري)",
"portfolio": ["string"] (اختياري)
}

**الاستجابة الناجحة:**
json
{
"\_id": "string",
"name": "string",
"email": "string",
"investmentRange": {
"min": "number",
"max": "number"
},
"createdAt": "date"
}

#### عرض جميع المستثمرين

GET /api/matrix/forms/investor/investors

**الاستجابة الناجحة:**
json
[
{
"\_id": "string",
"name": "string",
"email": "string",
"investmentRange": {
"min": "number",
"max": "number"
},
"investmentStage": "string",
"sectors": ["string"],
"location": "string",
"bio": "string",
"portfolio": ["string"],
"createdAt": "date"
}
]

#### عرض مستثمر محدد

GET /api/matrix/forms/investor/investor/:id

**الاستجابة الناجحة:**
json
{
"\_id": "string",
"name": "string",
"email": "string",
"investmentRange": {
"min": "number",
"max": "number"
},
"investmentStage": "string",
"sectors": ["string"],
"location": "string",
"bio": "string",
"portfolio": ["string"],
"createdAt": "date"
}

### 4. نظام الدفع

#### إنشاء طريقة دفع

POST /api/matrix/payment/create-payment-method

**المعاملات المطلوبة:**
json
{
"type": "card",
"card": {
"number": "string (16 رقم)",
"exp_month": "number (1-12)",
"exp_year": "number (>= السنة الحالية)",
"cvc": "string (3-4 أرقام)"
}
}

**الاستجابة الناجحة:**
json
{
"success": true,
"paymentMethodId": "string"
}

#### تنفيذ عملية الدفع

POST /api/matrix/payment/process

**المعاملات المطلوبة:**
json
{
"paymentMethodId": "string",
"amount": "number (بالسنت)",
"currency": "string (default: usd)",
"description": "string (اختياري)"
}

**الاستجابة الناجحة:**
json
{
"success": true,
"paymentIntent": {
"id": "string",
"amount": "number",
"currency": "string",
"status": "string"
}
}

#### استرداد المبلغ

POST /api/matrix/payment/refund

**المعاملات المطلوبة:**
json
{
"paymentIntentId": "string",
"amount": "number (اختياري، للاسترداد الجزئي)"
}

**الاستجابة الناجحة:**
json
{
"success": true,
"refund": {
"id": "string",
"amount": "number",
"status": "string"
}
}

## 🟡 نظام محمد

### 1. إدارة الإشعارات

#### إنشاء إشعار جديد

POST /api/mohamed/notifications

**المعاملات المطلوبة:**

```json
{
  "message": "string (مطلوب)",
  "time": "date (مطلوب)",
  "userId": "string (اختياري)",
  "targetRole": "string (اختياري)"
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "notification": {
    "_id": "string",
    "message": "string",
    "time": "date",
    "userId": "string",
    "targetRole": "string",
    "createdAt": "date"
  }
}
```

#### عرض إشعارات المستخدم

GET /api/mohamed/notifications/:userId

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "notifications": [
    {
      "_id": "string",
      "message": "string",
      "time": "date",
      "userId": "string",
      "targetRole": "string",
      "createdAt": "date"
    }
  ]
}
```

### 2. نظام المحادثات

#### إنشاء محادثة جديدة

POST /api/mohamed/chat/conversations

**المعاملات المطلوبة:**

```json
{
  "participants": ["string (معرفات المستخدمين)"],
  "title": "string (اختياري)"
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "conversation": {
    "_id": "string",
    "participants": ["string"],
    "title": "string",
    "createdAt": "date"
  }
}
```

#### إرسال رسالة

POST /api/mohamed/chat/messages

**المعاملات المطلوبة:**

```json
{
  "conversationId": "string (مطلوب)",
  "senderId": "string (مطلوب)",
  "content": "string (مطلوب)",
  "attachments": ["string (مسارات الملفات - اختياري)"]
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "message": {
    "_id": "string",
    "conversationId": "string",
    "senderId": "string",
    "content": "string",
    "attachments": ["string"],
    "createdAt": "date"
  }
}
```

#### عرض محادثات المستخدم

GET /api/mohamed/chat/conversations/:userId

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "conversations": [
    {
      "_id": "string",
      "participants": ["string"],
      "title": "string",
      "lastMessage": {
        "content": "string",
        "senderId": "string",
        "createdAt": "date"
      },
      "createdAt": "date"
    }
  ]
}
```

### 3. إدارة الخبرات

#### إضافة خبرة جديدة

POST /api/mohamed/experience

**المعاملات المطلوبة:**

```json
{
  "userId": "string (مطلوب)",
  "title": "string (مطلوب)",
  "company": "string (مطلوب)",
  "location": "string (مطلوب)",
  "startDate": "date (مطلوب)",
  "endDate": "date (اختياري)",
  "description": "string (مطلوب)",
  "skills": ["string (اختياري)"]
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "experience": {
    "_id": "string",
    "userId": "string",
    "title": "string",
    "company": "string",
    "location": "string",
    "startDate": "date",
    "endDate": "date",
    "description": "string",
    "skills": ["string"],
    "createdAt": "date"
  }
}
```

#### عرض خبرات المستخدم

GET /api/mohamed/experience/:userId

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "experiences": [
    {
      "_id": "string",
      "title": "string",
      "company": "string",
      "location": "string",
      "startDate": "date",
      "endDate": "date",
      "description": "string",
      "skills": ["string"],
      "createdAt": "date"
    }
  ]
}
```

### 4. منصة Tell Your Story

#### نشر قصة جديدة

POST /api/mohamed/tellyour

**المعاملات المطلوبة:**

```json
{
  "userId": "string (مطلوب)",
  "title": "string (مطلوب)",
  "content": "string (مطلوب)",
  "tags": ["string (اختياري)"],
  "media": ["string (مسارات الوسائط - اختياري)"]
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "story": {
    "_id": "string",
    "userId": "string",
    "title": "string",
    "content": "string",
    "tags": ["string"],
    "media": ["string"],
    "likes": 0,
    "comments": [],
    "createdAt": "date"
  }
}
```

#### عرض جميع القصص

GET /api/mohamed/tellyour

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "stories": [
    {
      "_id": "string",
      "userId": "string",
      "title": "string",
      "content": "string",
      "tags": ["string"],
      "media": ["string"],
      "likes": "number",
      "comments": ["object"],
      "createdAt": "date"
    }
  ]
}
```

### 5. إدارة المستخدمين

#### إنشاء مستخدم جديد

POST /api/mohamed/users

**المعاملات المطلوبة:**

```json
{
  "name": "string (مطلوب)",
  "email": "string (مطلوب)",
  "password": "string (مطلوب)",
  "role": "string (مطلوب)",
  "profileImage": "file (اختياري)",
  "bio": "string (اختياري)"
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "role": "string",
    "profileImage": "string",
    "bio": "string",
    "createdAt": "date"
  }
}
```

#### تحديث بيانات المستخدم

PUT /api/mohamed/users/:userId

**المعاملات المطلوبة:**

```json
{
  "name": "string (اختياري)",
  "email": "string (اختياري)",
  "password": "string (اختياري)",
  "profileImage": "file (اختياري)",
  "bio": "string (اختياري)"
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "role": "string",
    "profileImage": "string",
    "bio": "string",
    "updatedAt": "date"
  }
}
```

### 6. إدارة المستثمرين

#### إنشاء حساب مستثمر

POST /api/mohamed/investors

**المعاملات المطلوبة:**

```json
{
  "name": "string (مطلوب)",
  "email": "string (مطلوب)",
  "password": "string (مطلوب)",
  "company": "string (مطلوب)",
  "investmentRange": {
    "min": "number (مطلوب)",
    "max": "number (مطلوب)"
  },
  "interests": ["string (اختياري)"],
  "portfolio": ["string (اختياري)"]
}
```

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "investor": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "company": "string",
    "investmentRange": {
      "min": "number",
      "max": "number"
    },
    "interests": ["string"],
    "portfolio": ["string"],
    "createdAt": "date"
  }
}
```

#### عرض جميع المستثمرين

GET /api/mohamed/investors

**الاستجابة الناجحة:**

```json
{
  "success": true,
  "investors": [
    {
      "_id": "string",
      "name": "string",
      "email": "string",
      "company": "string",
      "investmentRange": {
        "min": "number",
        "max": "number"
      },
      "interests": ["string"],
      "portfolio": ["string"],
      "createdAt": "date"
    }
  ]
}
```

### ملاحظات خاصة بنظام محمد

1. **نظام الإشعارات في الوقت الفعلي**

   - يستخدم Socket.IO للإشعارات الفورية
   - يدعم الإشعارات المستهدفة للمستخدمين والأدوار
   - يحتفظ بسجل كامل للإشعارات في قاعدة البيانات

2. **نظام المحادثات**

   - يدعم المحادثات الفردية والجماعية
   - يدعم إرسال المرفقات
   - يستخدم Socket.IO للرسائل الفورية

3. **الأمان**

   - جميع المسارات محمية بنظام المصادقة JWT
   - يتم التحقق من صلاحيات المستخدم قبل كل عملية
   - يتم تشفير كلمات المرور باستخدام bcrypt

4. **التعامل مع الملفات**

   - الحد الأقصى لحجم الملفات: 5 ميجابايت
   - الصيغ المدعومة للصور: JPG, PNG
   - يتم تخزين الملفات في خدمة تخزين سحابية

5. **متطلبات إضافية للبيئة**

```env
SOCKET_IO_PORT=3001
CLOUDINARY_URL=your_cloudinary_url
```

## معلومات إضافية للمطورين

### المصادقة

- يتم استخدام JWT للمصادقة
- يجب إرسال التوكن في رأس الطلب: `Authorization: Bearer {token}`
- صلاحية التوكن: ساعة واحدة

### التعامل مع الملفات

- الحد الأقصى لحجم الملفات: 5 ميجابايت
- الصيغ المدعومة للصور: JPG, PNG
- الصيغ المدعومة للسيرة الذاتية: PDF, Word

### متطلبات البيئة

يجب إنشاء ملف `.env` يحتوي على:
\`\`\`env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
\`\`\`

### بطاقات Stripe الاختبارية

- رقم البطاقة: 4242424242424242
- تاريخ الانتهاء: أي تاريخ مستقبلي
- CVC: أي 3 أرقام

### أمثلة على الأخطاء الشائعة

\`\`\`json
{
"error": "جميع الحقول مطلوبة",
"status": 400
}
\`\`\`
\`\`\`json
{
"error": "غير مصرح",
"status": 401
}
\`\`\`
\`\`\`json
{
"error": "خطأ في الخادم",
"status": 500
}
\`\`\`

### ملاحظات مهمة

1. جميع الطلبات التي تتطلب مصادقة يجب أن تحتوي على توكن صالح
2. البيانات المرسلة يجب أن تكون بتنسيق UTF-8 لدعم اللغة العربية
3. جميع التواريخ يجب أن تكون بتنسيق ISO 8601
4. يجب التعامل مع الأخطاء في جانب العميل
