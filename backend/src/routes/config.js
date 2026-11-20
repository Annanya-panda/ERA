const express = require('express');
const { razorpayConfigured } = require('../services/payments');
const { configured: imageUploadsConfigured } = require('../services/images');

const router = express.Router();
router.get('/', (req, res) => res.json({
  razorpayEnabled: razorpayConfigured(),
  imageUploadsEnabled: imageUploadsConfigured(),
  paymentMode: razorpayConfigured() ? 'razorpay-test' : 'simulation'
}));

module.exports = router;
