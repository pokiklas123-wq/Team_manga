const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');
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

// ========== مسارات API الجديدة ==========

// 1. إنشاء حساب في مجموعة محددة
app.post('/create/:collection/:email/:password', async (req, res) => {
    try {
        const collectionName = req.params.collection; // مثل: users, users2, clients, etc
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password;
        
        // التحقق من صحة اسم المجموعة (يجب أن يكون نصًا فقط)
        if (!/^[a-zA-Z0-9_-]+$/.test(collectionName)) {
            return res.json({
                success: false,
                message: 'اسم المجموعة غير صالح. استخدم أحرف إنجليزية وأرقام فقط.'
            });
        }
        
        // التحقق من صحة البريد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({
                success: false,
                message: 'صيغة البريد غير صحيحة'
            });
        }
        
        // البحث إذا البريد موجود في هذه المجموعة بالتحديد
        const snapshot = await db.collection(collectionName)
            .where('email', '==', email)
            .limit(1)
            .get();
        
        if (!snapshot.empty) {
            return res.json({
                success: false,
                message: `الحساب مستعمل بالفعل في مجموعة '${collectionName}'`
            });
        }
        
        // إنشاء UID جديد
        const uid = generateUID();
        const hashedPassword = hashPassword(password);
        
        // إضافة المستخدم إلى المجموعة المحددة
        await db.collection(collectionName).doc(uid).set({
            email: email,
            password: hashedPassword,
            password_original: password,
            uid: uid,
            created_at: new Date().toISOString(),
            last_login: null
        });
        
        res.json({
            success: true,
            message: `تم إنشاء الحساب بنجاح في مجموعة '${collectionName}'`,
            collection: collectionName,
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

// 2. تسجيل الدخول في مجموعة محددة
app.post('/signin/:collection/:email/:password', async (req, res) => {
    try {
        const collectionName = req.params.collection;
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password;
        
        // البحث عن المستخدم بالبريد في المجموعة المحددة
        const snapshot = await db.collection(collectionName)
            .where('email', '==', email)
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            return res.json({
                success: false,
                message: `الحساب غير موجود في مجموعة '${collectionName}'`
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
            message: `تم تسجيل الدخول بنجاح من مجموعة '${collectionName}'`,
            collection: collectionName,
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

// 3. الحصول على جميع المستخدمين من مجموعة محددة
app.get('/users/:collection', async (req, res) => {
    try {
        const collectionName = req.params.collection;
        const snapshot = await db.collection(collectionName).get();
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
            collection: collectionName,
            count: snapshot.size,
            users: users
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `خطأ في قراءة البيانات من مجموعة '${req.params.collection}'`
        });
    }
});

// 4. جلب جميع المجموعات الموجودة (اختياري - لتطويرك فقط)
app.get('/collections', async (req, res) => {
    try {
        const collections = await db.listCollections();
        const collectionNames = collections.map(col => col.id);
        
        res.json({
            success: true,
            collections: collectionNames
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب قائمة المجموعات'
        });
    }
});

// 5. اختبار الاتصال بـ Firestore
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
