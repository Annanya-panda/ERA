const crypto = require('crypto');
const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { authenticate, allowRoles } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { calculateTotals, validAddress } = require('../utils/checkout');
const { createRazorpayClient, razorpayConfigured, verifyCheckoutSignature } = require('../services/payments');

const router = express.Router();

async function restoreStock(items) {
  await Promise.all(items.map((item) => Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } })));
}

function emitOrder(io, order) {
  if (io) io.to(`user:${order.buyer}`).emit('order:update', { orderId: order._id, status: order.status });
}

function canViewOrder(user, order) {
  return user.role === 'admin' ||
    order.buyer.toString() === user._id.toString() ||
    (user.role === 'seller' && order.items.some((item) => item.seller.toString() === user._id.toString()));
}

module.exports = (io) => {
  router.post('/', authenticate, allowRoles('buyer'), asyncHandler(async (req, res) => {
    const { items: requestedItems, shippingAddress, couponCode = '' } = req.body;
    if (!Array.isArray(requestedItems) || requestedItems.length === 0 || requestedItems.length > 30) throw httpError(400, 'Add between 1 and 30 products to your cart');
    if (!validAddress(shippingAddress)) throw httpError(400, 'Name, address, city, and postal code are required');

    const quantities = new Map();
    for (const item of requestedItems) {
      if (!item || typeof item.productId !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        throw httpError(400, 'Each cart item needs a product ID and a quantity from 1 to 99');
      }
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
    }

    const products = await Product.find({ _id: { $in: [...quantities.keys()] }, active: true });
    if (products.length !== quantities.size) throw httpError(400, 'A cart product is no longer available');
    if (new Set(products.map((product) => product.seller.toString())).size > 1) {
      throw httpError(400, 'For this demo, check out products from one seller at a time');
    }
    const reserved = [];
    try {
      const orderItems = [];
      for (const product of products) {
        const quantity = quantities.get(product._id.toString());
        const updated = await Product.findOneAndUpdate(
          { _id: product._id, active: true, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { new: true }
        );
        if (!updated) throw httpError(409, `${product.name} does not have enough stock`);
        reserved.push({ product: product._id, quantity });
        orderItems.push({
          product: product._id,
          seller: product.seller,
          name: product.name,
          quantity,
          unitPrice: product.price
        });
      }

      const totals = calculateTotals(orderItems, couponCode);
      const order = await Order.create({
        buyer: req.user._id,
        items: orderItems,
        shippingAddress,
        ...totals,
        couponCode: String(couponCode).toUpperCase(),
        status: 'payment_pending',
        paymentStatus: 'pending',
        timeline: [{ status: 'payment_pending', note: 'Order created; stock reserved for this demo order.' }]
      });
      res.status(201).json({ order });
    } catch (error) {
      await restoreStock(reserved);
      throw error;
    }
  }));

  router.get('/mine', authenticate, asyncHandler(async (req, res) => {
    const filter = req.user.role === 'admin' ? {} :
      req.user.role === 'seller' ? { 'items.seller': req.user._id } : { buyer: req.user._id };
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).populate('buyer', 'name');
    res.json({ orders });
  }));

  router.get('/:id', authenticate, asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('buyer', 'name email');
    if (!order) throw httpError(404, 'Order not found');
    if (!canViewOrder(req.user, order)) throw httpError(403, 'You cannot view this order');
    res.json({ order });
  }));

  router.post('/:id/payments/simulate', authenticate, allowRoles('buyer'), asyncHandler(async (req, res) => {
    if (razorpayConfigured()) throw httpError(409, 'Razorpay test checkout is configured; use that flow instead of the local simulator');
    const outcome = req.body.outcome === 'failure' ? 'failure' : 'success';
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        buyer: req.user._id,
        status: { $in: ['payment_pending', 'payment_failed'] },
        paymentStatus: { $ne: 'paid' },
        razorpayOrderId: ''
      },
      {
        $set: {
          paymentProvider: 'simulation',
          paymentStatus: outcome === 'success' ? 'paid' : 'failed',
          status: outcome === 'success' ? 'paid' : 'payment_failed',
          paymentId: outcome === 'success' ? `demo_${crypto.randomUUID()}` : ''
        },
        $push: {
          timeline: {
            status: outcome === 'success' ? 'paid' : 'payment_failed',
            note: `Local payment simulator recorded ${outcome}. This was not a real payment.`
          }
        }
      },
      { new: true }
    );
    if (!order) throw httpError(404, 'Order not found');
    emitOrder(io, order);
    res.json({ order, simulated: true });
  }));

  router.post('/:id/payments/razorpay-order', authenticate, allowRoles('buyer'), asyncHandler(async (req, res) => {
    const client = createRazorpayClient();
    if (!client) throw httpError(503, 'Razorpay test keys are not configured; use the local payment simulator');
    const order = await Order.findOne({ _id: req.params.id, buyer: req.user._id });
    if (!order) throw httpError(404, 'Order not found');
    if (order.paymentStatus === 'paid' || ['cancelled', 'refunded'].includes(order.status)) throw httpError(409, 'This order cannot be paid');
    if (order.razorpayOrderId) {
      return res.json({
        keyId: process.env.RAZORPAY_KEY_ID,
        razorpayOrder: { id: order.razorpayOrderId, amount: Math.round(order.total * 100), currency: 'INR' }
      });
    }
    const paymentOrder = await client.orders.create({
      amount: Math.round(order.total * 100),
      currency: 'INR',
      receipt: order._id.toString().slice(-40),
      notes: { orderId: order._id.toString() }
    });
    order.paymentProvider = 'razorpay';
    order.razorpayOrderId = paymentOrder.id;
    await order.save();
    res.json({ keyId: process.env.RAZORPAY_KEY_ID, razorpayOrder: paymentOrder });
  }));

  router.post('/:id/payments/verify', authenticate, allowRoles('buyer'), asyncHandler(async (req, res) => {
    const { razorpay_order_id: razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    const order = await Order.findOne({ _id: req.params.id, buyer: req.user._id });
    if (!order) throw httpError(404, 'Order not found');
    if (order.paymentStatus === 'paid') return res.json({ order, alreadyPaid: true });
    if (!razorpayConfigured() || !razorpayOrderId || razorpayOrderId !== order.razorpayOrderId ||
      !verifyCheckoutSignature(razorpayOrderId, paymentId, signature)) {
      throw httpError(400, 'Payment verification failed');
    }
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, buyer: req.user._id, razorpayOrderId, paymentStatus: { $ne: 'paid' }, status: { $in: ['payment_pending', 'payment_failed'] } },
      {
        $set: { paymentProvider: 'razorpay', paymentId, paymentStatus: 'paid', status: 'paid' },
        $push: { timeline: { status: 'paid', note: 'Razorpay test checkout signature verified by the server.' } }
      },
      { new: true }
    );
    if (!updated) {
      const current = await Order.findById(order._id);
      if (current?.paymentStatus === 'paid') return res.json({ order: current, alreadyPaid: true });
      throw httpError(409, 'Order changed before payment confirmation could be applied');
    }
    emitOrder(io, updated);
    res.json({ order: updated });
  }));

  router.patch('/:id/status', authenticate, asyncHandler(async (req, res) => {
    const { status, trackingNumber = '' } = req.body;
    const allowed = ['processing', 'shipped', 'delivered'];
    const order = await Order.findById(req.params.id);
    if (!order) throw httpError(404, 'Order not found');
    const isAdmin = req.user.role === 'admin';
    const isSeller = req.user.role === 'seller' && req.user.sellerStatus === 'approved' &&
      order.items.some((item) => item.seller.toString() === req.user._id.toString());
    if (!isAdmin && !isSeller) throw httpError(403, 'Only an order seller or admin can update fulfillment');
    if (!allowed.includes(status)) throw httpError(400, 'Choose processing, shipped, or delivered');
    const transitions = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };
    if (transitions[order.status] !== status) throw httpError(409, `Cannot move this order from ${order.status} to ${status}`);
    if (status === 'shipped' && !String(trackingNumber).trim()) throw httpError(400, 'Add a tracking number before marking an order shipped');
    order.status = status;
    if (trackingNumber) order.trackingNumber = String(trackingNumber).trim().slice(0, 80);
    order.timeline.push({ status, note: trackingNumber ? `Tracking: ${order.trackingNumber}` : '' });
    await order.save();
    emitOrder(io, order);
    res.json({ order });
  }));

  router.post('/:id/cancel', authenticate, asyncHandler(async (req, res) => {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, buyer: req.user._id, status: { $in: ['payment_pending', 'payment_failed'] }, paymentStatus: { $ne: 'paid' } },
      {
        $set: { status: 'cancelled' },
        $push: { timeline: { status: 'cancelled', note: 'Unpaid order cancelled; reserved stock returned.' } }
      },
      { new: true }
    );
    if (!order) {
      const exists = await Order.exists({ _id: req.params.id, buyer: req.user._id });
      if (!exists) throw httpError(404, 'Order not found');
      throw httpError(409, 'Only unpaid orders without an active Razorpay checkout can be cancelled in this demo');
    }
    await restoreStock(order.items);
    emitOrder(io, order);
    res.json({ order });
  }));

  router.post('/:id/refund/simulate', authenticate, asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw httpError(403, 'Only an admin can record a demo refund');
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, paymentStatus: 'paid', status: { $in: ['paid', 'processing'] } },
      {
        $set: { status: 'refunded', paymentStatus: 'refunded' },
        $push: { timeline: { status: 'refunded', note: 'Admin recorded a demo refund. No funds were returned by a payment provider.' } }
      },
      { new: true }
    );
    if (!order) {
      const exists = await Order.exists({ _id: req.params.id });
      if (!exists) throw httpError(404, 'Order not found');
      throw httpError(409, 'Only paid orders before shipment can be refunded in this demo');
    }
    await restoreStock(order.items);
    emitOrder(io, order);
    res.json({ order, simulated: true });
  }));

  return router;
};
