const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// السماح بقراءة JSON من الطلبات
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
        console.log('📥 جاري قراءة الملف من GitHub...');
        console.log('🔗 الرابط:', FILE_URL);
        
        const response = await axios.get(FILE_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js'
            }
        });
        
        console.log('✅ قراءة ناجحة - حالة HTTP:', response.status);
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return JSON.parse(content);
        
    } catch (error) {
        console.error('❌ خطأ في القراءة:', error.response?.status || error.code);
        console.error('📋 تفاصيل الخطأ:', error.response?.data || error.message);
        
        if (error.response && error.response.status === 404) {
            console.log('📄 الملف غير موجود، سيتم إنشاؤه عند أول حفظ');
            return { users: {} };
        }
        
        throw error; // رمي الخطأ للتعامل معه في المستوى الأعلى
    }
}

// 💾 كتابة ملف users.json إلى GitHub
async function writeUsersToGitHub(data) {
    try {
        console.log('💾 جاري حفظ البيانات إلى GitHub...');
        console.log('🔗 الرابط:', FILE_URL);
        console.log('📊 عدد المستخدمين:', Object.keys(data.users).length);
        
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
            console.log('🔑 SHA الحالي:', currentSHA.substring(0, 20) + '...');
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log('📄 الملف غير موجود، سيتم إنشاؤه لأول مرة');
            } else {
                console.error('❌ خطأ في جلب SHA:', error.message);
                throw error;
            }
        }
        
        const content = JSON.stringify(data, null, 2);
        console.log('📝 محتوى الملف:', content.substring(0, 200) + '...');
        
        const contentBase64 = Buffer.from(content).toString('base64');
        
        const response = await axios.put(FILE_URL, {
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
        
        console.log('✅ حفظ ناجح - حالة HTTP:', response.status);
        console.log('🔗 رابط الملف:', response.data.content.html_url);
        return true;
        
    } catch (error) {
        console.error('❌ خطأ فادح في الحفظ!');
        console.error('📊 حالة HTTP:', error.response?.status);
        console.error('📝 رسالة الخطأ:', error.response?.data?.message || error.message);
        console.error('🔍 تفاصيل:', error.response?.data || 'لا توجد تفاصيل');
        throw error;
    }
}

// ========== مسارات API ==========

// 🏠 الصفحة الرئيسية البسيطة
app.get('/', (req, res) => {
    res.json({
        message: 'سيرفر المصادقة',
        endpoints: {
            create: 'POST /create/:email/:password',
            signin: 'POST /signin/:email/:password',
            test: 'GET /test',
            debug: 'GET /debug'
        }
    });
});

// 🔍 اختبار الاتصال بـ GitHub
app.get('/test', async (req, res) => {
    try {
        console.log('🔍 اختبار الاتصال...');
        
        // التحقق من المتغيرات البيئية
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
            error: error.response?.data?.message || error.message,
            status: error.response?.status
        });
    }
});

// 🐛 صفحة تتبع الأخطاء
app.get('/debug', async (req, res) => {
    try {
        // محاولة قراءة الملف
        const data = await readUsersFromGitHub();
        
        res.json({
            success: true,
            debug_info: {
                has_token: !!GITHUB_TOKEN,
                token_length: GITHUB_TOKEN?.length || 0,
                has_username: !!GITHUB_USERNAME,
                username: GITHUB_USERNAME,
                repo: REPO_NAME,
                file_url: FILE_URL,
                users_count: Object.keys(data.users).length,
                server_time: new Date().toISOString()
            }
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// 👤 إنشاء حساب جديد عبر URL
app.post('/create/:email/:password', async (req, res) => {
    try {
        console.log('🚀 بدء إنشاء حساب...');
        
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password;
        
        console.log('📧 البريد:', email);
        console.log('🔑 كلمة السر:', password);
        
        // التحقق من صحة البريد
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('❌ بريد غير صالح:', email);
            return res.json({
                success: false,
                message: 'صيغة البريد غير صحيحة'
            });
        }
        
        // قراءة البيانات
        console.log('📥 جاري قراءة قاعدة البيانات...');
        const db = await readUsersFromGitHub();
        console.log('📊 عدد المستخدمين الحالي:', Object.keys(db.users).length);
        
        // التحقق من وجود البريد
        for (const uid in db.users) {
            if (db.users[uid].email === email) {
                console.log('❌ البريد مستخدم بالفعل:', email);
                return res.json({
                    success: false,
                    message: 'الحساب موجود بالفعل'
                });
            }
        }
        
        // إنشاء UID جديد
        const uid = generateUID();
        const hashedPassword = hashPassword(password);
        
        console.log('🆔 UID الجديد:', uid);
        console.log('🔐 كلمة السر المشفرة:', hashedPassword);
        
        // إضافة المستخدم
        db.users[uid] = {
            email: email,
            password: hashedPassword,
            password_original: password,
            uid: uid,
            created_at: new Date().toISOString(),
            last_login: null
        };
        
        // حفظ البيانات
        console.log('💾 جاري حفظ البيانات الجديدة...');
        await writeUsersToGitHub(db);
        
        console.log('✅ تم إنشاء الحساب بنجاح!');
        
        res.json({
            success: true,
            message: 'تم إنشاء الحساب',
            user: {
                uid: uid,
                email: email,
                password: password,
                password_hashed: hashedPassword,
                created_at: db.users[uid].created_at
            }
        });
        
    } catch (error) {
        console.error('💥 خطأ فادح في إنشاء الحساب!');
        console.error('📋 الخطأ:', error.message);
        console.error('🔍 التفاصيل:', error.response?.data || 'لا توجد تفاصيل');
        
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined
        });
    }
});

// 🔑 تسجيل الدخول عبر URL
app.post('/signin/:email/:password', async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        const password = req.params.password;
        
        console.log('🔑 محاولة تسجيل دخول:', email);
        
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
            console.log('❌ الحساب غير موجود:', email);
            return res.json({
                success: false,
                message: 'الحساب غير موجود'
            });
        }
        
        // التحقق من كلمة المرور
        const hashedInput = hashPassword(password);
        if (userFound.password !== hashedInput) {
            console.log('❌ كلمة سر خاطئة للحساب:', email);
            return res.json({
                success: false,
                message: 'كلمة السر خاطئة'
            });
        }
        
        // تحديث وقت آخر دخول
        userFound.last_login = new Date().toISOString();
        db.users[userUID] = userFound;
        await writeUsersToGitHub(db);
        
        console.log('✅ تسجيل دخول ناجح:', userUID);
        
        res.json({
            success: true,
            message: 'تم تسجيل الدخول',
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
        console.error('💥 خطأ في تسجيل الدخول:', error.message);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
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
        console.error('❌ خطأ في قراءة المستخدمين:', error.message);
        res.status(500).json({
            success: false,
            message: 'خطأ في قراءة البيانات'
        });
    }
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على البورت ${PORT}`);
    console.log(`👤 GITHUB_USERNAME: ${GITHUB_USERNAME || 'غير محدد'}`);
    console.log(`🔑 GITHUB_TOKEN: ${GITHUB_TOKEN ? 'موجود (' + GITHUB_TOKEN.length + ' حرف)' : 'مفقود'}`);
    console.log(`📁 REPO: ${REPO_NAME}`);
    console.log(`🔗 اختبار الاتصال: http://localhost:${PORT}/test`);
    console.log(`🐛 صفحة التصحيح: http://localhost:${PORT}/debug`);
});
