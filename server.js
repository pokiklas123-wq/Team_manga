const express = require('express');
// تصحيح: استدعاء المكتبة الموجودة في package.json بدلاً من المكتبة المفقودة
const { StreamChat } = require('stream-chat'); 
const cors = require('cors');
const path = require('path');

const app = express();

// 1. إعدادات Stream API
const STREAM_API_KEY = process.env.STREAM_API_KEY || 'r9vxmmx42jmz';
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || 'zzf2rqubuyswebanq2xncfef8uu24b2m7ftq7k85a5szgegvdgmre7n4kngfrjzc';

// 2. تهيئة عميل Stream (هذا السطر سيعمل الآن لأننا استدعينا StreamChat بالأعلى)
const serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

// 3. إعداد Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 4. نقطة النهاية (Endpoint) لإنشاء التوكن
app.get('/api/token', (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ 
                error: 'معرف المستخدم مطلوب',
                code: 'USER_ID_REQUIRED'
            });
        }
        
        // إنشاء التوكن
        const token = serverClient.createToken(user_id);
        
        res.json({
            success: true,
            user_id,
            token,
            api_key: STREAM_API_KEY
        });
        
    } catch (error) {
        console.error('خطأ في إنشاء التوكن:', error);
        res.status(500).json({ 
            error: 'فشل إنشاء التوكن',
            details: error.message 
        });
    }
});

// 5. نقطة النهاية للصحة (Health Check)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'نشط',
        timestamp: new Date().toISOString(),
        service: 'Stream Live Broadcast'
    });
});

// 6. تقديم الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 7. تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على المنفذ: ${PORT}`);
});
