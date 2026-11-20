require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const createApp = require('./app');

async function start() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/era_marketplace');
  const server = http.createServer();
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }
  });
  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (!token) return socket.disconnect(true);
    try {
      const jwt = require('jsonwebtoken');
      const { sub } = jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`user:${sub}`);
    } catch {
      socket.disconnect(true);
    }
  });
  const app = createApp(io);
  server.on('request', app);
  const port = Number(process.env.PORT || 4000);
  await new Promise((resolve) => server.listen(port, resolve));
  console.info(`ERA API listening on http://localhost:${port}`);
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
