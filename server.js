const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

// السماح بقراءة JSON من الطلبات
app.use(express.json());

// توليد UID عشوائي 28 حرف (مثل Firebase)
function generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 28; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

// تحميل قاعدة البيانات من ملف JSON
async function loadDatabase() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'database.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // إذا الملف غير موجود، نرجع قاعدة بيانات فارغة
        return { users: {} };
    }
}

// حفظ قاعدة البيانات إلى ملف JSON
async function saveDatabase(db) {
    await fs.writeFile(
        path.join(__dirname, 'database.json'),
        JSON.stringify(db, null, 2)
    );
}

// 1️⃣ مسار إنشاء حساب جديد
app.post('/create/:email/:password', async (req, res) => {
    try {
        const email = req.params.email;
        const password = req.params.password;
        
        // تحميل قاعدة البيانات
        let db = await loadDatabase();
        
        // التحقق إذا كان البريد موجود بالفعل
        const existingUser = Object.values(db.users).find(user => user.email === email);
        
        if (existingUser) {
            return res.json({
                success: false,
                message: 'الحساب مستعمل بالفعل',
                exists: true
            });
        }
        
        // إنشاء UID جديد
        const uid = generateUID();
        
        // إضافة المستخدم الجديد
        db.users[uid] = {
            email: email,
            password: password, // ⚠️ في الإنتاج: يجب تشفير كلمة المرور
            uid: uid
        };
        
        // حفظ قاعدة البيانات
        await saveDatabase(db);
        
        res.json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            uid: uid,
            email: email
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر: ' + error.message
        });
    }
});

// 2️⃣ مسار تسجيل الدخول
app.post('/signin/:email/:password', async (req, res) => {
    try {
        const email = req.params.email;
        const password = req.params.password;
        
        // تحميل قاعدة البيانات
        const db = await loadDatabase();
        
        // البحث عن المستخدم بالبريد
        let userFound = null;
        let userUID = null;
        
        for (const [uid, user] of Object.entries(db.users)) {
            if (user.email === email) {
                userFound = user;
                userUID = uid;
                break;
            }
        }
        
        // إذا لم يتم العثور على الحساب
        if (!userFound) {
            return res.json({
                success: false,
                message: 'الحساب غير موجود',
                error: 'USER_NOT_FOUND'
            });
        }
        
        // التحقق من كلمة المرور
        if (userFound.password !== password) { // ⚠️ في الإنتاج: استخدم تشفير
            return res.json({
                success: false,
                message: 'كلمة السر خاطئة',
                error: 'WRONG_PASSWORD'
            });
        }
        
        // تسجيل الدخول ناجح
        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            uid: userUID,
            email: userFound.email
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر: ' + error.message
        });
    }
});

// 3️⃣ مسار للحصول على جميع المستخدمين (للتطوير فقط)
app.get('/users', async (req, res) => {
    const db = await loadDatabase();
    res.json(db.users);
});

// 4️⃣ مسار للحصول على مستخدم محدد
app.get('/user/:uid', async (req, res) => {
    const db = await loadDatabase();
    const user = db.users[req.params.uid];
    
    if (user) {
        res.json({
            success: true,
            user: user
        });
    } else {
        res.json({
            success: false,
            message: 'المستخدم غير موجود'
        });
    }
});

// 5️⃣ مسار للحصول على UID باستخدام البريد
app.get('/getuid/:email', async (req, res) => {
    const db = await loadDatabase();
    const email = req.params.email;
    
    for (const [uid, user] of Object.entries(db.users)) {
        if (user.email === email) {
            return res.json({
                success: true,
                uid: uid,
                email: email
            });
        }
    }
    
    res.json({
        success: false,
        message: 'البريد غير موجود'
    });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على: http://localhost:${PORT}`);
    console.log(`📊 المسارات المتاحة:`);
    console.log(`   POST /create/:email/:password`);
    console.log(`   POST /signin/:email/:password`);
    console.log(`   GET  /users`);
    console.log(`   GET  /user/:uid`);
    console.log(`   GET  /getuid/:email`);
});
