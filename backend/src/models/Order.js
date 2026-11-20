const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 }
  }],
  shippingAddress: {
    name: { type: String, required: true },
    line1: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true }
  },
  subtotal: { type: Number, required: true },
  couponCode: { type: String, default: '' },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['payment_pending', 'payment_failed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'payment_pending',
    index: true
  },
  paymentProvider: { type: String, enum: ['razorpay', 'simulation'], default: 'simulation' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  razorpayOrderId: { type: String, default: '' },
  paymentId: { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  paymentEvents: [{ eventId: { type: String, required: true }, receivedAt: { type: Date, default: Date.now } }],
  timeline: [{ status: { type: String, required: true }, note: { type: String, default: '' }, at: { type: Date, default: Date.now } }]
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
