const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { sendPasswordReset } = require('../services/notifications');

const router = express.Router();
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  sellerStatus: user.sellerStatus
});

function issueToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, role = 'buyer' } = req.body;
  if (!name || !email || !password || password.length < 8) throw httpError(400, 'Name, email, and a password of at least 8 characters are required');
  if (!['buyer', 'seller'].includes(role)) throw httpError(400, 'Choose buyer or seller');
  const user = await User.create({
    name,
    email,
    password,
    role,
    sellerStatus: role === 'seller' ? 'pending' : 'not_applicable'
  });
  res.status(201).json({ user: publicUser(user), token: issueToken(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.verifyPassword(String(req.body.password || '')))) throw httpError(401, 'Email or password is incorrect');
  res.json({ user: publicUser(user), token: issueToken(user) });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 80) throw httpError(400, 'Name must be between 1 and 80 characters');
  const user = await User.findByIdAndUpdate(req.user._id, { name }, { new: true, runValidators: true })
    .select('_id name email role sellerStatus');
  res.json({ user: publicUser(user) });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = await User.findOne({ email });
  const response = { message: 'If that account exists, a reset link has been sent.' };
  if (!user) return res.json(response);
  const token = crypto.randomBytes(32).toString('hex');
  user.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();
  const link = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/reset-password?token=${token}`;
  const delivery = await sendPasswordReset(user.email, link);
  if (delivery.delivery === 'development-log') response.demoResetLink = link;
  res.json(response);
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || typeof password !== 'string' || password.length < 8) throw httpError(400, 'A reset token and password of at least 8 characters are required');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ resetTokenHash: tokenHash, resetTokenExpires: { $gt: new Date() } })
    .select('+resetTokenHash +resetTokenExpires +password');
  if (!user) throw httpError(400, 'Reset link is invalid or expired');
  user.password = password;
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  res.json({ message: 'Password updated. You can now sign in.' });
}));

module.exports = router;
