const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// السماح بقراءة JSON من الطلبات
app.use(express.json());

// 🔑 إعدادات GitHub من متغيرات البيئة
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const REPO_NAME = process.env.REPO_NAME || 'auth-database'; // اسم المستودع
const FILE_PATH = process.env.FILE_PATH || 'users.json';

// 🔗 روابط GitHub API
const GITHUB_API = 'https://api.github.com';
const REPO_URL = `${GITHUB_API}/repos/${GITHUB_USERNAME}/${REPO_NAME}`;
const FILE_URL = `${REPO_URL}/contents/${FILE_PATH}`;

// 🔐 توليد UID عشوائي 28 حرف (مثل Firebase)
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
                'User-Agent': 'Node.js',
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        // البيانات تأتي مشفرة بـ base64
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return JSON.parse(content);
        
    } catch (error) {
        console.error('❌ خطأ في قراءة الملف:', error.response?.status || error.message);
        
        // إذا كان الملف غير موجود، نرجع بيانات فارغة
        if (error.response?.status === 404) {
            return { users: {} };
        }
        
        throw new Error('فشل في قراءة قاعدة البيانات');
    }
}

// 💾 كتابة ملف users.json إلى GitHub
async function writeUsersToGitHub(data) {
    try {
        // أولاً أحصل على SHA الحالي للملف
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
            if (error.response?.status !== 404) {
                throw error;
            }
        }
        
        const content = JSON.stringify(data, null, 2);
        const contentBase64 = Buffer.from(content).toString('base64');
        
        const payload = {
            message: `تحديث المستخدمين - ${new Date().toISOString()}`,
            content: contentBase64,
            sha: currentSHA || undefined
        };
        
        await axios.put(FILE_URL, payload, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js',
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ تم حفظ البيانات إلى GitHub');
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في حفظ الملف:', error.response?.data?.message || error.message);
        throw new Error('فشل في حفظ البيانات');
    }
}

// ========== مسارات API ==========

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>سيرفر المصادقة</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 {
                    color: #333;
                    border-bottom: 2px solid #4CAF50;
                    padding-bottom: 10px;
                }
                .endpoint {
                    background: #f8f9fa;
                    padding: 15px;
                    margin: 15px 0;
                    border-radius: 5px;
                    border-right: 4px solid #4CAF50;
                }
                .method {
                    display: inline-block;
                    background: #4CAF50;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 3px;
                    margin-right: 10px;
                }
                .url {
                    font-family: monospace;
                    color: #333;
                }
                .status {
                    margin-top: 20px;
                    padding: 10px;
                    background: #e8f5e9;
                    border-radius: 5px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 سيرفر المصادقة باستخدام GitHub</h1>
                <p>مرحباً! هذا السيرفر متصل بمستودع GitHub لتخزين بيانات المستخدمين.</p>
                
                <div class="status">
                    <strong>الحالة:</strong> ✅ الخدمة تعمل
                    <br>
                    <strong>المستودع:</strong> ${GITHUB_USERNAME}/${REPO_NAME}
                </div>
                
                <h2>📡 المسارات المتاحة:</h2>
                
                <div class="endpoint">
                    <span class="method">POST</span>
                    <span class="url">/create</span>
                    <p><strong>إنشاء حساب جديد</strong></p>
                    <p>📦 Body: {"email": "البريد", "password": "كلمة السر"}</p>
                </div>
                
                <div class="endpoint">
                    <span class="method">POST</span>
                    <span class="url">/signin</span>
                    <p><strong>تسجيل الدخول</strong></p>
                    <p>📦 Body: {"email": "البريد", "password": "كلمة السر"}</p>
                </div>
                
                <div class="endpoint">
                    <span class="method">GET</span>
                    <span class="url">/users</span>
                    <p><strong>عرض جميع المستخدمين</strong></p>
                </div>
                
                <div class="endpoint">
                    <span class="method">GET</span>
                    <span class="url">/test-github</span>
                    <p><strong>اختبار الاتصال بـ GitHub</strong></p>
                </div>
                
                <h2>📝 مثال للاستخدام:</h2>
                <pre>
// إنشاء حساب
POST /create
{
  "email": "user@example.com",
  "password": "123456"
}

// تسجيل دخول
POST /signin
{
  "email": "user@example.com",
  "password": "123456"
}
                </pre>
            </div>
        </body>
        </html>
    `);
});

// 🔍 اختبار الاتصال بـ GitHub
app.get('/test-github', async (req, res) => {
    try {
        console.log('🔍 اختبار الاتصال بـ GitHub...');
        
        // التحقق من وجود المتغيرات البيئية
        if (!GITHUB_TOKEN) {
            return res.json({
                success: false,
                message: '❌ متغير GITHUB_TOKEN غير موجود',
                instructions: 'أضف التوكن في Environment Variables على Render'
            });
        }
        
        if (!GITHUB_USERNAME) {
            return res.json({
                success: false,
                message: '❌ متغير GITHUB_USERNAME غير موجود',
                instructions: 'أضف اسم المستخدم في Environment Variables على Render'
            });
        }
        
        // اختبار الاتصال بالمستودع
        const response = await axios.get(REPO_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js'
            }
        });
        
        // اختبار قراءة الملف
        const fileResponse = await axios.get(FILE_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js'
            }
        });
        
        res.json({
            success: true,
            message: '✅ الاتصال ناجح!',
            details: {
                github_user: GITHUB_USERNAME,
                repo: REPO_NAME,
                repo_exists: true,
                file_exists: true,
                file_url: FILE_URL
            },
            next_steps: 'يمكنك الآن استخدام /create و /signin'
        });
        
    } catch (error) {
        console.error('❌ فشل اختبار الاتصال:', error.response?.data || error.message);
        
        let errorMessage = 'خطأ غير معروف';
        let instructions = '';
        
        if (error.response?.status === 401) {
            errorMessage = '❌ التوكن غير صالح أو منتهي الصلاحية';
            instructions = 'تحقق من GITHUB_TOKEN وتأكد أنه صحيح';
        } else if (error.response?.status === 404) {
            if (error.config.url.includes('/contents/')) {
                errorMessage = '⚠️ الملف غير موجود';
                instructions = 'سيتم إنشاء الملف عند أول عملية حفظ';
            } else {
                errorMessage = '❌ المستودع غير موجود';
                instructions = `تحقق من أن المستودع "${REPO_NAME}" موجود لدى ${GITHUB_USERNAME}`;
            }
        } else if (error.response?.status === 403) {
            errorMessage = '❌ صلاحية الوصول مرفوضة';
            instructions = 'تحقق من أن التوكن لديه صلاحية repo وأن المستودع ليس خاصاً';
        }
        
        res.json({
            success: false,
            message: errorMessage,
            error: error.response?.data?.message || error.message,
            instructions: instructions,
            debug_info: {
                has_token: !!GITHUB_TOKEN,
                token_length: GITHUB_TOKEN?.length || 0,
                has_username: !!GITHUB_USERNAME,
                repo_url: REPO_URL,
                file_url: FILE_URL
            }
        });
    }
});

// 👤 إنشاء حساب جديد
app.post('/create', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log(`📝 طلب إنشاء حساب: ${email}`);
        
        // التحقق من المدخلات
        if (!email || !password) {
            return res.json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
            });
        }
        
        // التحقق من صحة البريد الإلكتروني
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
        
        // إضافة المستخدم الجديد
        db.users[uid] = {
            email: email,
            password: hashPassword(password), // تخزين مشفر
            uid: uid,
            created_at: new Date().toISOString(),
            last_login: null
        };
        
        // حفظ البيانات إلى GitHub
        await writeUsersToGitHub(db);
        
        console.log(`✅ تم إنشاء حساب جديد: ${email} (${uid})`);
        
        res.json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                uid: uid,
                email: email,
                created_at: db.users[uid].created_at
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء حساب:', error.message);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر: ' + error.message
        });
    }
});

// 🔑 تسجيل الدخول
app.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log(`🔑 طلب تسجيل دخول: ${email}`);
        
        // التحقق من المدخلات
        if (!email || !password) {
            return res.json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
            });
        }
        
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
        
        console.log(`✅ تسجيل دخول ناجح: ${email}`);
        
        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                uid: userUID,
                email: userFound.email,
                created_at: userFound.created_at,
                last_login: userFound.last_login
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error.message);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر: ' + error.message
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

// 🔎 الحصول على مستخدم محدد بالبريد
app.get('/user/:email', async (req, res) => {
    try {
        const email = req.params.email;
        const db = await readUsersFromGitHub();
        
        for (const uid in db.users) {
            if (db.users[uid].email === email) {
                const user = db.users[uid];
                return res.json({
                    success: true,
                    user: {
                        uid: user.uid,
                        email: user.email,
                        created_at: user.created_at,
                        last_login: user.last_login
                    }
                });
            }
        }
        
        res.json({
            success: false,
            message: 'المستخدم غير موجود'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في البحث'
        });
    }
});

// ❌ حذف مستخدم (للتطوير فقط)
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
    console.log(`🌐 استخدم الرابط: http://localhost:${PORT}`);
    console.log(`🔗 اختبار الاتصال: http://localhost:${PORT}/test-github`);
    console.log(`📁 المستودع: ${GITHUB_USERNAME}/${REPO_NAME}`);
    console.log(`🔐 التوكن: ${GITHUB_TOKEN ? 'موجود ✓' : 'مفقود ✗'}`);
});
