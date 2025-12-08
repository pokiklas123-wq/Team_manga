 const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// 🔥 تهيئة Firebase من متغيرات Railway - التعديل الرئيسي الوحيد
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.type,
    project_id: process.env.project_id,
    private_key_id: process.env.private_key_id,
    private_key: process.env.private_key?.replace(/\\n/g, '\n'), // إصلاح تنسيق السطور الجديدة
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

// توليد UID
function generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 28; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

// تشفير كلمة المرور
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ========== مسارات API ==========

// إنشاء حساب مع Firestore
app.post('/create/:email/:password', async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password;
        
        // التحقق من صحة البريد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({
                success: false,
                message: 'صيغة البريد غير صحيحة'
            });
        }
        
        // البحث إذا البريد موجود (Firestore query)
        const snapshot = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
        
        if (!snapshot.empty) {
            return res.json({
                success: false,
                message: 'الحساب مستعمل بالفعل'
            });
        }
        
        // إنشاء UID جديد
        const uid = generateUID();
        const hashedPassword = hashPassword(password);
        
        // إضافة المستخدم إلى Firestore
        await db.collection('users').doc(uid).set({
            email: email,
            password: hashedPassword,
            password_original: password,
            uid: uid,
            created_at: new Date().toISOString(),
            last_login: null
        });
        
        res.json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                uid: uid,
                email: email,
                password: password,
                password_hashed: hashedPassword,
                created_at: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في Firestore:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في قاعدة البيانات'
        });
    }
});

// تسجيل الدخول مع Firestore
app.post('/signin/:email/:password', async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password;
        
        // البحث عن المستخدم بالبريد
        const snapshot = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            return res.json({
                success: false,
                message: 'الحساب غير موجود'
            });
        }
        
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        // التحقق من كلمة المرور
        const hashedInput = hashPassword(password);
        if (userData.password !== hashedInput) {
            return res.json({
                success: false,
                message: 'كلمة السر خاطئة'
            });
        }
        
        // تحديث وقت آخر دخول
        await userDoc.ref.update({
            last_login: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                uid: userData.uid,
                email: userData.email,
                password: userData.password_original || password,
                password_hashed: userData.password,
                created_at: userData.created_at,
                last_login: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في قاعدة البيانات'
        });
    }
});

// الحصول على جميع المستخدمين
app.get('/users', async (req, res) => {
    try {
        const snapshot = await db.collection('users').get();
        const users = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            users[data.uid] = {
                email: data.email,
                uid: data.uid,
                created_at: data.created_at,
                last_login: data.last_login
            };
        });
        
        res.json({
            success: true,
            count: snapshot.size,
            users: users
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في قراءة البيانات'
        });
    }
});

// اختبار الاتصال بـ Firestore
app.get('/test', async (req, res) => {
    try {
        const snapshot = await db.collection('users').limit(1).get();
        res.json({
            success: true,
            message: '✅ Firestore يعمل!',
            users_count: snapshot.size,
            location: 'europe-west1'
        });
    } catch (error) {
        res.json({
            success: false,
            message: '❌ فشل الاتصال بـ Firestore',
            error: error.message
        });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على البورت ${PORT}`);
    console.log(`🔥 متصل بـ Firestore: europe-west1`);
});
