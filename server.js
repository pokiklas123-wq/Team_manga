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
    private_key_id: req.env.private_key_id,
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

// ========== الدوال المساعدة (Helper Functions) ==========
function generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 28; i++) { uid += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return uid;
}

function generateApiKey() {
    return crypto.randomBytes(24).toString('hex'); // مفتاح قوي عشوائي
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// 🔐 دالة التحقق من صحة النطاق و API Key (الأهم في النظام)
async function validateDomainAndKey(domainName, providedApiKey) {
    try {
        const domainRef = db.collection('_domains').doc(domainName);
        const domainDoc = await domainRef.get();

        if (!domainDoc.exists) {
            return { success: false, message: 'النطاق غير موجود.' };
        }
        const domainData = domainDoc.data();

        if (domainData.api_key !== providedApiKey) {
            return { success: false, message: 'مفتاح API غير صالح أو لا يطابق هذا النطاق.' };
        }
        return { success: true, domainData: domainData };
    } catch (error) {
        console.error('خطأ في التحقق:', error);
        return { success: false, message: 'خطأ في التحقق من صلاحية الطلب.' };
    }
}

// ========== مسارات API الرئيسية ==========

// 🌐 1. إنشاء نطاق (مجموعة) جديدة والحصول على API Key
app.post('/create_collection/:domain_name', async (req, res) => {
    try {
        const domainName = req.params.domain_name;

        // التحقق من صحة اسم النطاق
        if (!/^[a-zA-Z0-9_-]+$/.test(domainName)) {
            return res.json({
                success: false,
                message: 'اسم النطاق غير صالح. استخدم أحرف إنجليزية وأرقام و(_ أو -) فقط.'
            });
        }

        // التحقق من عدم وجود النطاق مسبقاً (في مجموعة النطاقات الخاصة _domains)
        const domainRef = db.collection('_domains').doc(domainName);
        const domainDoc = await domainRef.get();

        if (domainDoc.exists) {
            return res.json({
                success: false,
                message: `النطاق '${domainName}' مستعمل بالفعل.`
            });
        }

        // إنشاء مفتاح API فريد لهذا النطاق
        const newApiKey = generateApiKey();

        // حفظ بيانات النطاق في مجموعة خاصة (_domains)
        await domainRef.set({
            api_key: newApiKey,
            created_at: new Date().toISOString(),
            user_count: 0 // عداد للمستخدمين (اختياري)
        });

        res.json({
            success: true,
            message: `تم إنشاء النطاق '${domainName}' بنجاح!`,
            domain: domainName,
            api_key: newApiKey // ⚠️ يتم إرجاع المفتاح مرة واحدة فقط عند الإنشاء
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء النطاق:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في الخادم.'
        });
    }
});

// 👤 2. إنشاء حساب مستخدم جديد داخل نطاق معين (يتطلب API Key)
app.post('/create/:domain/:email/:password/:api_key', async (req, res) => {
    try {
        const { domain, email, password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        // 🔐 الخطوة 1: التحقق من صحة النطاق والمفتاح
        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) {
            return res.json({ success: false, message: validation.message });
        }

        // 📧 الخطوة 2: التحقق من صحة البريد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(decodedEmail)) {
            return res.json({ success: false, message: 'صيغة البريد غير صحيحة' });
        }

        // 🔍 الخطوة 3: التحقق من عدم وجود البريد في نطاقه الخاص فقط
        const usersCollectionRef = db.collection(domain); // المجموعة = اسم النطاق
        const snapshot = await usersCollectionRef.where('email', '==', decodedEmail).limit(1).get();

        if (!snapshot.empty) {
            return res.json({
                success: false,
                message: `البريد الإلكتروني مستخدم بالفعل في النطاق '${domain}'.`
            });
        }

        // 🆔 الخطوة 4: إنشاء الحساب
        const uid = generateUID();
        const hashedPassword = hashPassword(password);

        await usersCollectionRef.doc(uid).set({
            email: decodedEmail,
            password: hashedPassword,
            uid: uid,
            created_at: new Date().toISOString(),
            last_login: null
            // لاحظ: إزالة حفظ password_original لأمان أفضل
        });

        // تحديث عداد المستخدمين (اختياري)
        const domainRef = db.collection('_domains').doc(domain);
        await domainRef.update({ user_count: admin.firestore.FieldValue.increment(1) });

        res.json({
            success: true,
            message: `تم إنشاء الحساب بنجاح في النطاق '${domain}'.`,
            domain: domain,
            user: { uid: uid, email: decodedEmail, created_at: new Date().toISOString() }
        });

    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// 🔑 3. تسجيل الدخول داخل نطاق معين (يتطلب API Key)
app.post('/signin/:domain/:email/:password/:api_key', async (req, res) => {
    try {
        const { domain, email, password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        // التحقق من صحة النطاق والمفتاح
        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) {
            return res.json({ success: false, message: validation.message });
        }

        const usersCollectionRef = db.collection(domain);
        const snapshot = await usersCollectionRef.where('email', '==', decodedEmail).limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود في النطاق '${domain}'.` });
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // التحقق من كلمة المرور
        if (userData.password !== hashPassword(password)) {
            return res.json({ success: false, message: 'كلمة المرور خاطئة.' });
        }

        // تحديث وقت آخر دخول
        await userDoc.ref.update({ last_login: new Date().toISOString() });

        res.json({
            success: true,
            message: `تم تسجيل الدخول بنجاح إلى النطاق '${domain}'.`,
            user: {
                uid: userData.uid,
                email: userData.email,
                created_at: userData.created_at,
                last_login: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// 🗑️  4. حذف مستخدم من نطاق معين (يتطلب API Key)
app.post('/delete/:domain/:email/:password/:api_key', async (req, res) => {
    try {
        const { domain, email, password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) {
            return res.json({ success: false, message: validation.message });
        }

        const usersCollectionRef = db.collection(domain);
        const snapshot = await usersCollectionRef.where('email', '==', decodedEmail).limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود في النطاق '${domain}'.` });
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // تحقق إضافي: تأكيد كلمة المرور قبل الحذف
        if (userData.password !== hashPassword(password)) {
            return res.json({ success: false, message: 'كلمة المرور خاطئة. الحذف مرفوض.' });
        }

        await userDoc.ref.delete();

        // تحديث عداد المستخدمين
        const domainRef = db.collection('_domains').doc(domain);
        await domainRef.update({ user_count: admin.firestore.FieldValue.increment(-1) });

        res.json({
            success: true,
            message: `تم حذف الحساب '${decodedEmail}' من النطاق '${domain}' بنجاح.`
        });

    } catch (error) {
        console.error('❌ خطأ في حذف المستخدم:', error);
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// 🔄 5. تغيير كلمة مرور مستخدم (يتطلب API Key)
app.post('/reset_pass/:domain/:email/:new_password/:api_key', async (req, res) => {
    try {
        const { domain, email, new_password, api_key } = req.params;
        const decodedEmail = decodeURIComponent(email);

        const validation = await validateDomainAndKey(domain, api_key);
        if (!validation.success) return res.json({ success: false, message: validation.message });

        const usersCollectionRef = db.collection(domain);
        const snapshot = await usersCollectionRef.where('email', '==', decodedEmail).limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود في النطاق '${domain}'.` });
        }

        const userDoc = snapshot.docs[0];
        const newHashedPassword = hashPassword(new_password);

        await userDoc.ref.update({
            password: newHashedPassword,
            updated_at: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `تم تغيير كلمة مرور '${decodedEmail}' في النطاق '${domain}' بنجاح.`
        });

    } catch (error) {
        console.error('❌ خطأ في تغيير كلمة المرور:', error);
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// ✉️  6. تغيير بريد مستخدم (يتطلب API Key)
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
            return res.json({ success: false, message: 'صيغة البريد الجديد غير صحيحة.' });
        }

        const usersCollectionRef = db.collection(domain);
        // التحقق من عدم استخدام البريد الجديد
        const checkNewEmail = await usersCollectionRef.where('email', '==', decodedNewEmail).limit(1).get();
        if (!checkNewEmail.empty) {
            return res.json({ success: false, message: 'البريد الجديد مستخدم بالفعل في هذا النطاق.' });
        }

        // البحث عن المستخدم بالبريد القديم
        const snapshot = await usersCollectionRef.where('email', '==', decodedOldEmail).limit(1).get();
        if (snapshot.empty) {
            return res.json({ success: false, message: `الحساب غير موجود في النطاق '${domain}'.` });
        }

        const userDoc = snapshot.docs[0];
        await userDoc.ref.update({
            email: decodedNewEmail,
            updated_at: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `تم تغيير بريد '${decodedOldEmail}' إلى '${decodedNewEmail}' في النطاق '${domain}' بنجاح.`
        });

    } catch (error) {
        console.error('❌ خطأ في تغيير البريد:', error);
        res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
    }
});

// ℹ️ 7. جلب قائمة النطاقات (للتطوير فقط)
app.get('/collections', async (req, res) => {
    try {
        const snapshot = await db.collection('_domains').get();
        const domains = [];
        snapshot.forEach(doc => domains.push({ name: doc.id, ...doc.data() }));
        res.json({ success: true, domains: domains });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في جلب النطاقات.' });
    }
});

// 🧪 8. اختبار الاتصال
app.get('/test', async (req, res) => {
    try {
        const snapshot = await db.collection('_domains').limit(1).get();
        res.json({
            success: true,
            message: '✅ السيرفر و Firestore يعملان!',
            domain_count: snapshot.size
        });
    } catch (error) {
        res.json({ success: false, message: '❌ فشل الاتصال.', error: error.message });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر جاهز على البورت ${PORT}`);
});
