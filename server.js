const express = require('express');
const { StreamClient } = require('@stream-io/node-sdk'); // المكتبة الصحيحة للفيديو
const cors = require('cors');
const path = require('path');

const app = express();

// 1. إعدادات Stream API
const STREAM_API_KEY = process.env.STREAM_API_KEY || 'r9vxmmx42jmz';
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || 'zzf2rqubuyswebanq2xncfef8uu24b2m7ftq7k85a5szgegvdgmre7n4kngfrjzc';

// 2. تهيئة عميل Stream باستخدام حزمة Node SDK
const serverClient = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // تأكد أن ملف HTML داخل مجلد public

// 3. نقطة النهاية لإنشاء التوكن
app.get('/api/token', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // إنشاء المستخدم في Stream لضمان وجوده
        await serverClient.upsertUsers([
            {
                id: user_id,
                role: 'user', // أو 'admin' للمذيع إذا أردت صلاحيات أكثر
            },
        ]);

        // توليد التوكن
        const token = serverClient.generateUserToken({ user_id });
        
        res.json({
            token,
            api_key: STREAM_API_KEY
        });
        
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
