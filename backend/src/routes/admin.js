const express = require('express');
const User = require('../models/User');
const { authenticate, allowRoles } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');

const router = express.Router();

router.get('/sellers', authenticate, allowRoles('admin'), asyncHandler(async (req, res) => {
  const sellers = await User.find({ role: 'seller' }).select('_id name email sellerStatus createdAt').sort({ createdAt: -1 });
  res.json({ sellers });
}));

router.patch('/sellers/:id', authenticate, allowRoles('admin'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw httpError(400, 'Seller status must be approved or rejected');
  const seller = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'seller' },
    { sellerStatus: status },
    { new: true, runValidators: true }
  ).select('_id name email sellerStatus');
  if (!seller) throw httpError(404, 'Seller not found');
  res.json({ seller });
}));

module.exports = router;
