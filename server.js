const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('✅ DogeRat Server is running!');
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${port}`);
});
