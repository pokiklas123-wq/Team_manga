const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// السماح بقراءة JSON من الطلبات (لأي طلبات مستقبلية)
app.use(express.json());

// 🔑 إعدادات GitHub من متغيرات البيئة
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const REPO_NAME = 'Team_manga';
const FILE_PATH = 'users.json';

// 🔗 روابط GitHub API
const GITHUB_API = 'https://api.github.com';
const REPO_URL = `${GITHUB_API}/repos/${GITHUB_USERNAME}/${REPO_NAME}`;
const FILE_URL = `${REPO_URL}/contents/${FILE_PATH}`;

// 🔐 توليد UID عشوائي 28 حرف
function generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 28; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

// 🔐 تشفير كلمة المرور باستخدام SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// 📥 قراءة ملف users.json من GitHub
async function readUsersFromGitHub() {
    try {
        const response = await axios.get(FILE_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js'
            }
        });
        
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return JSON.parse(content);
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return { users: {} };
        }
        console.error('❌ خطأ في قراءة الملف:', error.message);
        return { users: {} };
    }
}

// 💾 كتابة ملف users.json إلى GitHub
async function writeUsersToGitHub(data) {
    try {
        let currentSHA = null;
        try {
            const currentFile = await axios.get(FILE_URL, {
                headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
            });
            currentSHA = currentFile.data.sha;
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
        }
        
        const content = JSON.stringify(data, null, 2);
        const contentBase64 = Buffer.from(content).toString('base64');
        
        await axios.put(FILE_URL, {
            message: `تحديث المستخدمين - ${new Date().toISOString()}`,
            content: contentBase64,
            sha: currentSHA
        }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ تم حفظ البيانات');
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في حفظ الملف:', error.message);
        throw new Error('فشل في حفظ البيانات');
    }
}

// ========== مسارات API ==========

// 🏠 الصفحة الرئيسية البسيطة
app.get('/', (req, res) => {
    res.json({
        message: 'سيرفر المصادقة باستخدام GitHub',
        endpoints: {
            create: 'POST /create/:email/:password',
            signin: 'POST /signin/:email/:password',
            test: 'GET /test',
            users: 'GET /users'
        }
    });
});

// 🔍 اختبار الاتصال بـ GitHub
app.get('/test', async (req, res) => {
    try {
        const repoResponse = await axios.get(REPO_URL, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        
        res.json({
            success: true,
            message: '✅ الاتصال ناجح',
            repo: `${GITHUB_USERNAME}/${REPO_NAME}`,
            url: repoResponse.data.html_url
        });
        
    } catch (error) {
        res.json({
            success: false,
            message: '❌ فشل الاتصال',
            error: error.response?.data?.message || error.message
        });
    }
});

// 👤 إنشاء حساب جديد عبر URL
app.post('/create/:email/:password', async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password; // كلمة السر الأصلية
        
        console.log(`📝 إنشاء حساب: ${email}`);
        
        // التحقق من صحة البريد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({
                success: false,
                message: 'صيغة البريد غير صحيحة'
            });
        }
        
        // قراءة البيانات
        const db = await readUsersFromGitHub();
        
        // التحقق من وجود البريد
        for (const uid in db.users) {
            if (db.users[uid].email === email) {
                return res.json({
                    success: false,
                    message: 'الحساب موجود بالفعل'
                });
            }
        }
        
        // إنشاء UID جديد
        const uid = generateUID();
        const hashedPassword = hashPassword(password);
        
        // إضافة المستخدم
        db.users[uid] = {
            email: email,
            password: hashedPassword, // تخزين مشفر
            password_original: password, // تخزين نسخة أصلية (غير مشفرة)
            uid: uid,
            created_at: new Date().toISOString(),
            last_login: null
        };
        
        // حفظ البيانات
        await writeUsersToGitHub(db);
        
        console.log(`✅ تم إنشاء حساب: ${uid}`);
        
        res.json({
            success: true,
            message: 'تم إنشاء الحساب',
            user: {
                uid: uid,
                email: email,
                password: password, // إرجاع كلمة السر الأصلية
                password_hashed: hashedPassword, // إرجاع كلمة السر المشفرة
                created_at: db.users[uid].created_at
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// 🔑 تسجيل الدخول عبر URL
app.post('/signin/:email/:password', async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password;
        
        console.log(`🔑 تسجيل دخول: ${email}`);
        
        // قراءة البيانات
        const db = await readUsersFromGitHub();
        
        // البحث عن المستخدم
        let userFound = null;
        let userUID = null;
        
        for (const uid in db.users) {
            if (db.users[uid].email === email) {
                userFound = db.users[uid];
                userUID = uid;
                break;
            }
        }
        
        // إذا لم يتم العثور على الحساب
        if (!userFound) {
            return res.json({
                success: false,
                message: 'الحساب غير موجود'
            });
        }
        
        // التحقق من كلمة المرور
        const hashedInput = hashPassword(password);
        if (userFound.password !== hashedInput) {
            return res.json({
                success: false,
                message: 'كلمة السر خاطئة'
            });
        }
        
        // تحديث وقت آخر دخول
        userFound.last_login = new Date().toISOString();
        db.users[userUID] = userFound;
        await writeUsersToGitHub(db);
        
        console.log(`✅ تسجيل دخول ناجح: ${userUID}`);
        
        res.json({
            success: true,
            message: 'تم تسجيل الدخول',
            user: {
                uid: userUID,
                email: userFound.email,
                password: userFound.password_original || 'نسيت تخزينها', // إرجاع كلمة السر الأصلية
                password_hashed: userFound.password, // إرجاع كلمة السر المشفرة
                created_at: userFound.created_at,
                last_login: userFound.last_login
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// 👥 الحصول على جميع المستخدمين
app.get('/users', async (req, res) => {
    try {
        const db = await readUsersFromGitHub();
        const count = Object.keys(db.users).length;
        
        res.json({
            success: true,
            count: count,
            users: db.users
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في قراءة البيانات'
        });
    }
});

// 🔍 الحصول على مستخدم محدد
app.get('/user/:uid', async (req, res) => {
    try {
        const uid = req.params.uid;
        const db = await readUsersFromGitHub();
        
        if (db.users[uid]) {
            res.json({
                success: true,
                user: db.users[uid]
            });
        } else {
            res.json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في البحث'
        });
    }
});

// 🗑️ حذف مستخدم
app.delete('/user/:uid', async (req, res) => {
    try {
        const uid = req.params.uid;
        const db = await readUsersFromGitHub();
        
        if (db.users[uid]) {
            delete db.users[uid];
            await writeUsersToGitHub(db);
            
            res.json({
                success: true,
                message: 'تم الحذف'
            });
        } else {
            res.json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في الحذف'
        });
    }
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على البورت ${PORT}`);
    console.log(`📁 المستودع: ${GITHUB_USERNAME}/${REPO_NAME}`);
    console.log(`🔗 مثال إنشاء حساب: POST /create/test@test.com/123456`);
    console.log(`🔗 مثال تسجيل دخول: POST /signin/test@test.com/123456`);
});
