const express = require('express');
const Order = require('../models/Order');
const { verifyWebhookSignature } = require('../services/payments');

const router = express.Router();

router.post('/webhook', async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: 'Expected raw webhook body' });
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ message: 'Webhook secret is not configured' });
    if (!verifyWebhookSignature(req.body, req.get('x-razorpay-signature'))) {
      return res.status(400).json({ message: 'Webhook signature verification failed' });
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    const eventId = req.get('x-razorpay-event-id');
    if (!eventId) return res.status(400).json({ message: 'Webhook event ID is required for idempotency' });
    const payment = payload.payload?.payment?.entity;
    const orderId = payment?.notes?.orderId;
    const razorpayOrderId = payment?.order_id;
    const paymentId = payment?.id;
    const captured = payload.event === 'payment.captured';
    const failed = payload.event === 'payment.failed';
    if (!orderId || !razorpayOrderId || !paymentId || (!captured && !failed)) return res.json({ received: true, ignored: true });
    const targetOrder = await Order.findById(orderId).select('razorpayOrderId total');
    if (!targetOrder) return res.status(404).json({ message: 'Order not found' });
    if (targetOrder.razorpayOrderId !== razorpayOrderId ||
      Math.round(targetOrder.total * 100) !== Number(payment.amount) ||
      payment.currency !== 'INR') {
      return res.status(400).json({ message: 'Payment does not match the recorded order' });
    }

    const status = captured ? 'paid' : 'payment_failed';
    const paymentStatus = captured ? 'paid' : 'failed';
    const updated = await Order.findOneAndUpdate(
      {
        _id: orderId,
        razorpayOrderId,
        'paymentEvents.eventId': { $ne: eventId },
        status: { $in: ['payment_pending', 'payment_failed'] },
        ...(failed ? { paymentStatus: { $ne: 'paid' } } : {})
      },
      {
        $set: { status, paymentStatus, paymentProvider: 'razorpay', paymentId },
        $push: {
          paymentEvents: { eventId },
          timeline: { status, note: `Razorpay webhook ${payload.event} accepted.` }
        }
      },
      { new: true }
    );
    if (updated) {
      req.io?.to(`user:${updated.buyer}`).emit('order:update', { orderId: updated._id, status: updated.status });
      return res.json({ received: true, duplicate: false });
    }
    const exists = await Order.exists({ _id: orderId, 'paymentEvents.eventId': eventId });
    if (exists) return res.json({ received: true, duplicate: true });
    return res.json({ received: true, ignored: true });
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ message: 'Webhook payload is not valid JSON' });
    next(error);
  }
});

module.exports = router;
