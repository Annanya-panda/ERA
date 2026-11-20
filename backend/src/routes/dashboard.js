const express = require('express');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    const [users, products, orders, pendingSellers, revenue] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments({ active: true }),
      Order.countDocuments(),
      User.countDocuments({ role: 'seller', sellerStatus: 'pending' }),
      Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }])
    ]);
    return res.json({
      role: 'admin',
      metrics: { users, products, orders, pendingSellers, paidRevenue: revenue[0]?.total || 0 }
    });
  }

  if (req.user.role === 'seller') {
    const [products, orders, recentOrders, lowStock] = await Promise.all([
      Product.countDocuments({ seller: req.user._id, active: true }),
      Order.countDocuments({ 'items.seller': req.user._id }),
      Order.find({ 'items.seller': req.user._id }).sort({ createdAt: -1 }).limit(5).populate('buyer', 'name'),
      Product.countDocuments({ seller: req.user._id, active: true, stock: { $lte: 5 } })
    ]);
    const paidOrders = await Order.find({ 'items.seller': req.user._id, paymentStatus: 'paid' }).select('items total');
    const revenue = paidOrders.reduce((sum, order) => {
      const sellerItems = order.items.filter((item) => item.seller.toString() === req.user._id.toString());
      return sum + sellerItems.reduce((itemsTotal, item) => itemsTotal + item.unitPrice * item.quantity, 0);
    }, 0);
    return res.json({ role: 'seller', metrics: { products, orders, lowStock, paidRevenue: revenue }, recentOrders });
  }

  const [orders, recentOrders] = await Promise.all([
    Order.countDocuments({ buyer: req.user._id }),
    Order.find({ buyer: req.user._id }).sort({ createdAt: -1 }).limit(5)
  ]);
  res.json({ role: 'buyer', metrics: { orders }, recentOrders });
}));

module.exports = router;
