// server_up.js - خدمة الإستيقاظ المتبادل (مبسطة)
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// 🌐 رابط السيرفر الرئيسي من متغير البيئة
const MAIN_SERVER_URL = process.env.URL_UP || 'https://team-manga.onrender.com';

// 🔄 دالة لإيقاظ السيرفر الرئيسي
async function wakeUpMainServer() {
  try {
    console.log(`⏰ [${new Date().toLocaleTimeString()}] إيقاظ السيرفر: ${MAIN_SERVER_URL}/wake`);
    
    const response = await axios.get(`${MAIN_SERVER_URL}/wake`, {
      timeout: 10000 // 10 ثواني فقط
    });
    
    console.log(`✅ [${new Date().toLocaleTimeString()}] تم بنجاح: ${response.data.message}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`❌ [${new Date().toLocaleTimeString()}] فشل: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 🛌 نقطة نهاية للاستيقاظ (ليستدعيك السيرفر الرئيسي)
app.get('/wake', async (req, res) => {
  try {
    const wakeTime = new Date().toISOString();
    console.log(`🔔 [${new Date().toLocaleTimeString()}] تم استدعائي من السيرفر الرئيسي`);
    
    res.json({
      success: true,
      message: `تم إيقاظ خدمة الإستيقاظ في ${new Date().toLocaleTimeString('ar-SA')}`,
      server: 'team-manga-rebo (خدمة الإيقاظ)',
      woke_at: wakeTime,
      next_wake: 'بعد 5 دقائق'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'خطأ في خدمة الإيقاظ',
      error: error.message 
    });
  }
});

// 🧪 اختبار الاتصال البسيط
app.get('/test', async (req, res) => {
  res.json({
    success: true,
    message: '✅ خدمة الإستيقاظ تعمل!',
    system: 'Wake-Up Service Only',
    target_server: MAIN_SERVER_URL,
    time: new Date().toISOString(),
    local_time: new Date().toLocaleTimeString('ar-SA')
  });
});

// 📍 الصفحة الرئيسية البسيطة
app.get('/', async (req, res) => {
  res.send(`
    <html dir="rtl">
    <head>
        <title>خدمة إيقاظ السيرفر</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #2c3e50; }
            .status { background: #3498db; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; }
            .info { margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>🔔 خدمة إيقاظ السيرفر</h1>
        <div class="status">✅ الحالة: نشطة</div>
        <div class="info">
            <p>⏰ الوقت: ${new Date().toLocaleTimeString('ar-SA')}</p>
            <p>🎯 السيرفر المستهدف: ${MAIN_SERVER_URL}</p>
            <p>⏱️ الإيقاظ كل: 5 دقائق</p>
        </div>
        <p><a href="/test">اختبار الخدمة</a></p>
    </body>
    </html>
  `);
});

// 📅 جدولة إيقاظ السيرفر الرئيسي كل 5 دقائق
cron.schedule('*/5 * * * *', async () => {
  console.log(`⏰ [${new Date().toLocaleTimeString()}] بدأت المهمة المجدولة`);
  await wakeUpMainServer();
});

// 🚀 تشغيل السيرفر مع بدء فوري للإيقاظ
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✅ خدمة الإستيقاظ تعمل على البورت ${PORT}`);
  console.log(`🎯 السيرفر المستهدف: ${MAIN_SERVER_URL}`);
  
  // بدأ الإيقاظ فوراً بعد 5 ثواني
  setTimeout(async () => {
    console.log('🔔 بدء الإيقاظ الأولي بعد التشغيل...');
    await wakeUpMainServer();
    console.log('⏰ تم تفعيل الجدولة لإيقاظ السيرفر كل 5 دقائق');
  }, 5000);
});
