// server.js - السيرفر الرئيسي مع نظام الإيقاظ المتبادل
const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// 🔥 تهيئة Firebase من متغيرات البيئة
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.type,
    project_id: process.env.project_id,
    private_key_id: process.env.private_key_id,
    private_key: process.env.private_key?.replace(/\\n/g, '\n'),
    client_email: process.env.client_email,
    client_id: process.env.client_id,
    auth_uri: process.env.auth_uri,
    token_uri: process.env.token_uri,
    auth_provider_x509_cert_url: process.env.auth_provider_x509_cert_url,
    client_x509_cert_url: process.env.client_x509_cert_url,
    universe_domain: process.env.universe_domain
  })
});

const db = admin.firestore();

// ========== إعدادات نظام الإيقاظ المتبادل ==========

// 🌐 رابط خدمة الإستيقاظ من متغير البيئة
const WAKE_SERVICE_URL = process.env.URL_UP || 'https://team-manga-rebo.onrender.com';

// 🔄 دالة لإيقاظ خدمة الإستيقاظ
async function wakeUpService() {
  try {
    console.log(`⏰ [${new Date().toLocaleTimeString()}] محاولة إيقاظ خدمة الإستيقاظ: ${WAKE_SERVICE_URL}/wake`);
    
    const response = await axios.get(`${WAKE_SERVICE_URL}/wake`, {
      timeout: 15000 // 15 ثانية فقط لتجنب الانتظار الطويل
    });
    
    console.log(`✅ [${new Date().toLocaleTimeString()}] تم إيقاظ خدمة الإستيقاظ: ${response.data.message}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`❌ [${new Date().toLocaleTimeString()}] فشل في إيقاظ خدمة الإستيقاظ:`, error.message);
    return { success: false, error: error.message };
  }
}

// 🛌 نقطة نهاية للاستيقاظ (ليستدعيك خدمة الإيقاظ)
app.get('/wake', async (req, res) => {
  try {
    const wakeTime = new Date().toISOString();
    console.log(`🔔 [${new Date().toLocaleTimeString()}] تم استدعاء نقطة الإيقاظ من خدمة الإستيقاظ`);
    
    res.json({
      success: true,
      message: `تم إيقاظ السيرفر الرئيسي في ${new Date().toLocaleTimeString('ar-SA')}`,
      server: 'team-manga',
      woke_at: wakeTime,
      next_wake: 'بعد 5 دقائق',
      note: 'سيتم إيقاظ خدمة الإستيقاظ في الدقيقة القادمة'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'خطأ في نقطة الإيقاظ',
      error: error.message 
    });
  }
});

// 📅 جدولة إيقاظ خدمة الإستيقاظ كل 5 دقائق
cron.schedule('*/5 * * * *', async () => {
  console.log(`⏰ [${new Date().toLocaleTimeString()}] تشغيل المهمة المجدولة لإيقاظ خدمة الإستيقاظ...`);
  await wakeUpService();
});

// 🔄 بدء جدولة إيقاظ خدمة الإستيقاظ فور تشغيل السيرفر
setTimeout(async () => {
  console.log('🔔 بدء الإيقاظ المتبادل الأولي بعد 10 ثواني...');
  await wakeUpService();
}, 10000);

// ========== دوال النظام الأساسي ==========

// توليد UID فقط
function generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 28; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

// 🔐 دالة التحقق من صحة النطاق و API Key
async function validateDomainAndKey(domainName, providedApiKey) {
    try {
        const domainRef = db.collection('_domains').doc(domainName);
        const domainDoc = await domainRef.get();

        if (!domainDoc.exists) {
            return { success: false, message: 'النطاق غير موجود.' };
        }
        const domainData = domainDoc.data();

        if (domainData.api_key !== providedApiKey) {
            return { success: false, message: 'مفتاح API غير صالح.' };
        }
        return { success: true, domainData: domainData };
    } catch (error) {
        return { success: false, message: 'خطأ في التحقق.' };
    }
}

// ========== مسارات API الرئيسية ==========

// 🌐 1. إنشاء نطاق جديد
app.post('/create_collection/:domain_name', async (req, res) => {
    try {
        const domainName = req.params.domain_name;

        if (!/^[a-zA-Z0-9_-]+$/.test(domainName)) {
            return res.json({
                success: false,
                message: 'اسم النطاق غير صالح.'
            });
        }

        const domainRef = db.collection('_domains').doc(domainName);
        const domainDoc = await domainRef.get();

        if (domainDoc.exists) {
            return res.json({
                success: false,
                message: `النطاق '${domainName}' مستعمل.`
            });
        }

        // توليد مفتاح API
        const newApiKey = require('crypto').randomBytes(24).toString('hex');

        await domainRef.set({
            api_key: newApiKey,
            created_at: new Date().toISOString(),
            user_count: 0
        });

        res.json({
            success: true,
            message: `تم إنشاء النطاق '${domainName}'`,
            domain: domainName,
            api_key: newApiKey
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في الخادم.' });
    }
});

// 👤 2. إنشاء حساب مستخدم (بدون تشفير)
app.post('/create/:domain/:email/:password/:api_key', async (req, res) => {
    try {
        const { domain, email, password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        // التحقق من صحة النطاق والمفتاح
        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) {
            return res.json({ success: false, message: validation.message });
        }

        // التحقق من صحة البريد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(decodedEmail)) {
            return res.json({ success: false, message: 'صيغة البريد غير صحيحة' });
        }

        // التحقق من عدم وجود البريد في النطاق
        const usersRef = db.collection(domain);
        const snapshot = await usersRef.where('email', '==', decodedEmail).limit(1).get();

        if (!snapshot.empty) {
            return res.json({
                success: false,
                message: `البريد مستخدم في النطاق '${domain}'.`
            });
        }

        // إنشاء الحساب
        const uid = generateUID();

        await usersRef.doc(uid).set({
            email: decodedEmail,
            password: password, // كلمة السر كما هي بدون تشفير
            uid: uid,
            created_at: new Date().toISOString()
        });

        // تحديث العداد
        const domainRef = db.collection('_domains').doc(domain);
        await domainRef.update({ user_count: admin.firestore.FieldValue.increment(1) });

        // ✅ الإرجاع: uid و email فقط (كما طلبت)
        res.json({
            success: true,
            message: `تم إنشاء الحساب في النطاق '${domain}'.`,
            user: {
                uid: uid,
                email: decodedEmail
                // لا يتم إرجاع password هنا
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// 🔑 3. تسجيل الدخول (بدون تشفير)
app.post('/signin/:domain/:email/:password/:api_key', async (req, res) => {
    try {
        const { domain, email, password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        // التحقق من صحة النطاق والمفتاح
        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) {
            return res.json({ success: false, message: validation.message });
        }

        const usersRef = db.collection(domain);
        const snapshot = await usersRef.where('email', '==', decodedEmail).limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود في '${domain}'.` });
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // ✅ التحقق من كلمة المرور كما هي (بدون تشفير)
        if (userData.password !== password) {
            return res.json({ success: false, message: 'كلمة المرور خاطئة.' });
        }

        // ✅ الإرجاع: uid، email، password (كما طلبت)
        res.json({
            success: true,
            message: `تم تسجيل الدخول إلى '${domain}'.`,
            user: {
                uid: userData.uid,
                email: userData.email,
                password: userData.password // إرجاع كلمة السر كما هي
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// 🗑️ 4. حذف مستخدم
app.post('/delete/:domain/:email/:password/:api_key', async (req, res) => {
    try {
        const { domain, email, password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) {
            return res.json({ success: false, message: validation.message });
        }

        const usersRef = db.collection(domain);
        const snapshot = await usersRef.where('email', '==', decodedEmail).limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود.` });
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // تحقق من كلمة المرور
        if (userData.password !== password) {
            return res.json({ success: false, message: 'كلمة المرور خاطئة.' });
        }

        await userDoc.ref.delete();

        // تحديث العداد
        const domainRef = db.collection('_domains').doc(domain);
        await domainRef.update({ user_count: admin.firestore.FieldValue.increment(-1) });

        res.json({
            success: true,
            message: `تم حذف الحساب '${decodedEmail}'.`
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// 🔄 5. تغيير كلمة مرور
app.post('/reset_pass/:domain/:email/:new_password/:api_key', async (req, res) => {
    try {
        const { domain, email, new_password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) return res.json({ success: false, message: validation.message });

        const usersRef = db.collection(domain);
        const snapshot = await usersRef.where('email', '==', decodedEmail).limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود.` });
        }

        const userDoc = snapshot.docs[0];
        await userDoc.ref.update({
            password: new_password, // حفظ كلمة السر الجديدة كما هي
            updated_at: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `تم تغيير كلمة المرور.`
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// ✉️ 6. تغيير البريد
app.post('/reset_email/:domain/:old_email/:new_email/:api_key', async (req, res) => {
    try {
        const { domain, old_email, new_email, api_key } = req.params;
        const decodedOldEmail = decodeURIComponent(old_email);
        const decodedNewEmail = decodeURIComponent(new_email);

        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) return res.json({ success: false, message: validation.message });

        // التحقق من صحة البريد الجديد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(decodedNewEmail)) {
            return res.json({ success: false, message: 'صيغة البريد غير صحيحة.' });
        }

        const usersRef = db.collection(domain);
        
        // التحقق من عدم استخدام البريد الجديد
        const checkNewEmail = await usersRef.where('email', '==', decodedNewEmail).limit(1).get();
        if (!checkNewEmail.empty) {
            return res.json({ success: false, message: 'البريد الجديد مستخدم.' });
        }

        // البحث عن المستخدم
        const snapshot = await usersRef.where('email', '==', decodedOldEmail).limit(1).get();
        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود.` });
        }

        const userDoc = snapshot.docs[0];
        await userDoc.ref.update({
            email: decodedNewEmail,
            updated_at: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `تم تغيير البريد.`
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// 👥 7. جلب جميع المستخدمين من نطاق معين (يعمل بـ POST و GET)
app.get('/users/:domain/:api_key', getAllUsers);
app.post('/users/:domain/:api_key', getAllUsers);

async function getAllUsers(req, res) {
    try {
        const { domain, api_key } = req.params;

        // التحقق من صحة النطاق والمفتاح
        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) {
            return res.json({ success: false, message: validation.message });
        }

        // جلب جميع المستخدمين من النطاق
        const usersRef = db.collection(domain);
        const snapshot = await usersRef.get();
        
        const users = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                uid: data.uid,
                email: data.email,
                password: data.password, // إرجاع كلمة السر كما هي
                created_at: data.created_at || 'غير معروف'
            });
        });

        // الحصول على بيانات النطاق
        const domainRef = db.collection('_domains').doc(domain);
        const domainDoc = await domainRef.get();
        const domainData = domainDoc.exists ? domainDoc.data() : null;

        res.json({
            success: true,
            message: `تم جلب ${users.length} مستخدم من نطاق '${domain}'`,
            domain: domain,
            user_count: domainData?.user_count || 0,
            total_fetched: users.length,
            users: users
        });

    } catch (error) {
        console.error('❌ خطأ في جلب المستخدمين:', error);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في قراءة البيانات' 
        });
    }
}

// 🧪 اختبار الاتصال
app.get('/test', async (req, res) => {
    res.json({
        success: true,
        message: '✅ السيرفر يعمل!',
        system: 'Firestore Auth Server مع نظام الإيقاظ المتبادل',
        wake_service_url: WAKE_SERVICE_URL,
        time: new Date().toISOString(),
        local_time: new Date().toLocaleTimeString('ar-SA')
    });
});

// 🔍 صفحة رئيسية بسيطة
app.get('/', async (req, res) => {
    res.send(`
        <html dir="rtl">
        <head>
            <title>سيرفر المصادقة</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #2c3e50; }
                .status { background: #2ecc71; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; }
                .info { margin: 20px 0; }
            </style>
        </head>
        <body>
            <h1>🚀 سيرفر المصادقة يعمل بنجاح</h1>
            <div class="status">✅ الحالة: نشط</div>
            <div class="info">
                <p>⏰ الوقت: ${new Date().toLocaleTimeString('ar-SA')}</p>
                <p>🔗 نظام الإيقاظ المتبادل: مفعل</p>
                <p>📞 خدمة الإيقاظ: ${WAKE_SERVICE_URL}</p>
            </div>
            <p><a href="/test">اختبار API</a></p>
        </body>
        </html>
    `);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على البورت ${PORT}`);
    console.log(`🔗 رابط الإيقاظ المتبادل: ${WAKE_SERVICE_URL}`);
    console.log(`⏰ تم تفعيل نظام الإيقاظ المتبادل كل 5 دقائق`);
    console.log(`📊 افتح ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT} في المتصفح`);
});
