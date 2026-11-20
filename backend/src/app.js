const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const createOrderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const paymentRoutes = require('./routes/payments');
const configRoutes = require('./routes/config');
const httpError = require('./utils/httpError');

function createApp(io) {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
  app.use('/api/payments', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', createOrderRoutes(io));
  app.use('/api/admin', adminRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use((req, res, next) => next(httpError(404, 'Route not found')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === 11000) return res.status(409).json({ message: 'An account with that email already exists' });
    if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier' });
    if (error.name === 'MulterError') return res.status(400).json({ message: error.message });
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ message: status >= 500 ? 'Unexpected server error' : error.message });
  });
  return app;
}

module.exports = createApp;
