// server_up.js - خدمة الإستيقاظ المتبادل
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// 🔥 تهيئة Firebase (نفس إعدادات الخادم الرئيسي)
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

// 🌐 رابط السيرفر الرئيسي من متغير البيئة
const MAIN_SERVER_URL = process.env.URL_UP || 'https://team-manga.onrender.com';

// 🔄 دالة لإيقاظ السيرفر الرئيسي
async function wakeUpMainServer() {
  try {
    console.log(`⏰ محاولة إيقاظ السيرفر الرئيسي: ${MAIN_SERVER_URL}/wake`);
    
    const response = await axios.get(`${MAIN_SERVER_URL}/wake`, {
      timeout: 30000 // 30 ثانية كحد أقصى
    });
    
    console.log(`✅ تم إيقاظ السيرفر الرئيسي: ${response.data.message}`);
    return true;
  } catch (error) {
    console.error('❌ فشل في إيقاظ السيرفر الرئيسي:', error.message);
    return false;
  }
}

// 🛌 نقطة نهاية للاستيقاظ (ليستدعيك السيرفر الرئيسي)
app.get('/wake', async (req, res) => {
  try {
    const wakeTime = new Date().toISOString();
    console.log(`🔔 تم استدعاء خدمة الإيقاظ في: ${wakeTime}`);
    
    res.json({
      success: true,
      message: `تم إيقاظ خدمة الإستيقاظ في ${wakeTime}`,
      server: 'team-manga-rebo',
      woke_at: wakeTime
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'خطأ في خدمة الإيقاظ' 
    });
  }
});

// 🧪 اختبار الاتصال
app.get('/test', async (req, res) => {
  res.json({
    success: true,
    message: '✅ خدمة الإستيقاظ تعمل!',
    system: 'Wake-Up Service',
    main_server_url: MAIN_SERVER_URL,
    time: new Date().toISOString()
  });
});

// 📅 جدولة إيقاظ السيرفر الرئيسي كل 5 دقائق
// ستشتغل فقط إذا كانت الخدمة نشطة
cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ تشغيل المهمة المجدولة لإيقاظ السيرفر الرئيسي...');
  await wakeUpMainServer();
});

// 🚀 تشغيل السيرفر مع جدولة فورية عند التشغيل
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✅ خدمة الإستيقاظ تعمل على البورت ${PORT}`);
  console.log(`🔗 السيرفر الرئيسي المستهدف: ${MAIN_SERVER_URL}`);
  
  // إيقاظ السيرفر الرئيسي فوراً عند تشغيل هذه الخدمة
  console.log('🔔 محاولة الإيقاظ الفوري للسيرفر الرئيسي...');
  await wakeUpMainServer();
  
  // بدأ الجدولة
  console.log('⏰ تم تفعيل الجدولة لإيقاظ السيرفر كل 5 دقائق');
});
