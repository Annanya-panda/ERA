const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const { authenticate, allowRoles } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { configured: imageUploadsConfigured, uploadImage } = require('../services/images');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

router.get('/', asyncHandler(async (req, res) => {
  const filter = { active: true };
  if (req.query.category) filter.category = String(req.query.category);
  if (req.query.q) filter.$text = { $search: String(req.query.q).slice(0, 100) };
  if (req.query.minPrice || req.query.maxPrice) {
    filter.price = {};
    if (Number.isFinite(Number(req.query.minPrice))) filter.price.$gte = Math.max(0, Number(req.query.minPrice));
    if (Number.isFinite(Number(req.query.maxPrice))) filter.price.$lte = Math.max(0, Number(req.query.maxPrice));
  }
  const sortBy = { priceAsc: { price: 1 }, priceDesc: { price: -1 }, popular: { createdAt: -1 } }[req.query.sort] || { createdAt: -1 };
  const products = await Product.find(filter).populate('seller', 'name').sort(sortBy).limit(60);
  res.json({ products });
}));

router.get('/mine', authenticate, allowRoles('seller'), asyncHandler(async (req, res) => {
  const products = await Product.find({ seller: req.user._id, active: true }).sort({ updatedAt: -1 });
  res.json({ products });
}));

router.post('/image', authenticate, allowRoles('seller'), upload.single('image'), asyncHandler(async (req, res) => {
  if (!imageUploadsConfigured()) throw httpError(503, 'Image uploads are not configured. Add Cloudinary credentials or use an image URL.');
  if (!req.file || !req.file.mimetype.startsWith('image/')) throw httpError(400, 'Choose an image file');
  const data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const result = await uploadImage(data);
  res.json({ imageUrl: result.secure_url });
}));

router.post('/', authenticate, allowRoles('seller'), asyncHandler(async (req, res) => {
  const { name, description, category, price, stock, imageUrl = '', sku = '' } = req.body;
  if (!name || !description || !category || !Number.isFinite(Number(price)) || !Number.isInteger(Number(stock)) || Number(price) < 0 || Number(stock) < 0) {
    throw httpError(400, 'Name, description, category, non-negative price, and whole-number stock are required');
  }
  const product = await Product.create({ seller: req.user._id, name, description, category, price, stock, imageUrl, sku });
  res.status(201).json({ product });
}));

router.patch('/:id', authenticate, allowRoles('seller'), asyncHandler(async (req, res) => {
  const allowed = ['name', 'description', 'category', 'price', 'stock', 'imageUrl', 'sku', 'active'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (updates.price !== undefined && (!Number.isFinite(Number(updates.price)) || Number(updates.price) < 0)) throw httpError(400, 'Price must be a non-negative number');
  if (updates.stock !== undefined && (!Number.isInteger(Number(updates.stock)) || Number(updates.stock) < 0)) throw httpError(400, 'Stock must be a non-negative whole number');
  const product = await Product.findOneAndUpdate({ _id: req.params.id, seller: req.user._id }, updates, { new: true, runValidators: true });
  if (!product) throw httpError(404, 'Product not found');
  res.json({ product });
}));

router.delete('/:id', authenticate, allowRoles('seller'), asyncHandler(async (req, res) => {
  const product = await Product.findOneAndUpdate({ _id: req.params.id, seller: req.user._id }, { active: false }, { new: true });
  if (!product) throw httpError(404, 'Product not found');
  res.json({ product });
}));

module.exports = router;
