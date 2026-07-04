const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// استقبال البيانات من متغيرات البيئة
const TOKEN = process.env.TOKEN || '8549358187:AAFWADEIpzlmgVsqZZtLn5g3-Ppk4tOpQ0Y';
const CHAT_ID = process.env.CHAT_ID || '7770087246';

app.get('/', (req, res) => {
    res.send('✅ DogeRat Server is running!');
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

// تأكد من الاستماع على جميع الواجهات
app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${port}`);
    console.log(`✅ TOKEN: ${TOKEN.substring(0, 10)}...`);
    console.log(`✅ CHAT_ID: ${CHAT_ID}`);
});
