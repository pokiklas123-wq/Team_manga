const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// السماح بقراءة JSON من الطلبات
app.use(express.json());

// 🔑 إعدادات GitHub من متغيرات البيئة
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const REPO_NAME = process.env.REPO_NAME || 'Team_manga_railway'; // يمكن تغييره
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
            // الملف غير موجود، نرجع بيانات فارغة
            return { users: {} };
        }
        console.error('❌ خطأ في قراءة الملف:', error.message);
        throw error;
    }
}

// 💾 كتابة ملف users.json إلى GitHub
async function writeUsersToGitHub(data) {
    try {
        // الحصول على SHA الحالي للملف
        let currentSHA = null;
        try {
            const currentFile = await axios.get(FILE_URL, {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'User-Agent': 'Node.js'
                }
            });
            currentSHA = currentFile.data.sha;
        } catch (error) {
            // إذا الملف غير موجود، هذا طبيعي
            if (error.response && error.response.status !== 404) {
                throw error;
            }
        }
        
        const content = JSON.stringify(data, null, 2);
        const contentBase64 = Buffer.from(content).toString('base64');
        
        await axios.put(FILE_URL, {
            message: `تحديث المستخدمين - ${new Date().toISOString()}`,
            content: contentBase64,
            sha: currentSHA || undefined
        }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js',
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ تم حفظ البيانات إلى GitHub');
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في حفظ الملف:', error.message);
        throw error;
    }
}

// ========== مسارات API ==========

// 🏠 الصفحة الرئيسية البسيطة
app.get('/', (req, res) => {
    res.json({
        message: 'سيرفر المصادقة على Railway',
        endpoints: {
            create: 'POST /create/:email/:password',
            signin: 'POST /signin/:email/:password',
            test: 'GET /test',
            users: 'GET /users',
            delete_user: 'DELETE /user/:uid'
        }
    });
});

// 🔍 اختبار الاتصال بـ GitHub
app.get('/test', async (req, res) => {
    try {
        // التحقق من وجود المتغيرات البيئية
        if (!GITHUB_TOKEN) {
            return res.json({
                success: false,
                message: '❌ GITHUB_TOKEN غير موجود'
            });
        }
        
        if (!GITHUB_USERNAME) {
            return res.json({
                success: false,
                message: '❌ GITHUB_USERNAME غير موجود'
            });
        }
        
        const response = await axios.get(REPO_URL, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        
        res.json({
            success: true,
            message: '✅ الاتصال ناجح',
            repo: `${GITHUB_USERNAME}/${REPO_NAME}`,
            url: response.data.html_url
        });
        
    } catch (error) {
        console.error('❌ فشل اختبار الاتصال:', error.message);
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
        const password = req.params.password;
        
        // التحقق من صحة البريد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({
                success: false,
                message: 'صيغة البريد الإلكتروني غير صحيحة'
            });
        }
        
        // قراءة البيانات الحالية
        const db = await readUsersFromGitHub();
        
        // التحقق إذا كان البريد مستخدماً
        for (const uid in db.users) {
            if (db.users[uid].email === email) {
                return res.json({
                    success: false,
                    message: 'الحساب مستعمل بالفعل'
                });
            }
        }
        
        // إنشاء UID جديد
        const uid = generateUID();
        const hashedPassword = hashPassword(password);
        
        // إضافة المستخدم الجديد
        db.users[uid] = {
            email: email,
            password: hashedPassword,
            password_original: password,
            uid: uid,
            created_at: new Date().toISOString(),
            last_login: null
        };
        
        // حفظ البيانات إلى GitHub
        await writeUsersToGitHub(db);
        
        res.json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                uid: uid,
                email: email,
                password: password,
                password_hashed: hashedPassword,
                created_at: db.users[uid].created_at
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء حساب:', error.message);
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
        
        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                uid: userUID,
                email: userFound.email,
                password: userFound.password_original || password,
                password_hashed: userFound.password,
                created_at: userFound.created_at,
                last_login: userFound.last_login
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error.message);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// 📊 الحصول على جميع المستخدمين
app.get('/users', async (req, res) => {
    try {
        const db = await readUsersFromGitHub();
        
        // إخفاء كلمات المرور عند العرض
        const usersWithoutPasswords = {};
        for (const uid in db.users) {
            usersWithoutPasswords[uid] = {
                email: db.users[uid].email,
                uid: db.users[uid].uid,
                created_at: db.users[uid].created_at,
                last_login: db.users[uid].last_login
            };
        }
        
        res.json({
            success: true,
            count: Object.keys(db.users).length,
            users: usersWithoutPasswords
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في قراءة البيانات'
        });
    }
});

// ❌ حذف مستخدم
app.delete('/user/:uid', async (req, res) => {
    try {
        const uid = req.params.uid;
        const db = await readUsersFromGitHub();
        
        if (db.users[uid]) {
            delete db.users[uid];
            await writeUsersToGitHub(db);
            
            res.json({
                success: true,
                message: 'تم حذف المستخدم بنجاح'
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
