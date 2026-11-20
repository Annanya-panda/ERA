process.env.JWT_SECRET = 'test-secret-for-marketplace-suite';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret-for-tests';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const crypto = require('crypto');
const createApp = require('../src/app');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const { calculateTotals } = require('../src/utils/checkout');

let mongo;
let app;
let buyer;
let seller;
let buyerToken;

const address = { name: 'Demo Buyer', line1: '12 Learning Lane', city: 'Pune', postalCode: '411001' };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Product.deleteMany({}), Order.deleteMany({})]);
  buyer = await User.create({ name: 'Buyer Example', email: 'buyer@example.test', password: 'DemoPass123!', role: 'buyer' });
  seller = await User.create({ name: 'Seller Example', email: 'seller@example.test', password: 'DemoPass123!', role: 'seller', sellerStatus: 'approved' });
  const login = await request(app).post('/api/auth/login').send({ email: buyer.email, password: 'DemoPass123!' });
  buyerToken = login.body.token;
});

test('passwords are hashed and new sellers remain pending approval', async () => {
  const response = await request(app).post('/api/auth/register').send({
    name: 'New Seller', email: 'new@example.test', password: 'DemoPass123!', role: 'seller'
  });
  expect(response.status).toBe(201);
  expect(response.body.user.sellerStatus).toBe('pending');
  const stored = await User.findById(response.body.user.id).select('+password');
  expect(stored.password).not.toBe('DemoPass123!');
  const denied = await request(app).post('/api/products')
    .set('Authorization', `Bearer ${response.body.token}`)
    .send({ name: 'Blocked item', description: 'Pending seller', category: 'Demo', price: 2, stock: 1 });
  expect(denied.status).toBe(403);
});

test('admins can approve sellers and users can update their profile name', async () => {
  const admin = await User.create({ name: 'Admin Example', email: 'admin@example.test', password: 'DemoPass123!', role: 'admin' });
  const adminLogin = await request(app).post('/api/auth/login').send({ email: admin.email, password: 'DemoPass123!' });
  const pending = await User.create({ name: 'Pending Seller', email: 'pending@example.test', password: 'DemoPass123!', role: 'seller', sellerStatus: 'pending' });
  const approval = await request(app).patch(`/api/admin/sellers/${pending._id}`)
    .set('Authorization', `Bearer ${adminLogin.body.token}`).send({ status: 'approved' });
  expect(approval.status).toBe(200);
  expect(approval.body.seller.sellerStatus).toBe('approved');
  const profile = await request(app).patch('/api/auth/me')
    .set('Authorization', `Bearer ${buyerToken}`).send({ name: 'Updated Buyer' });
  expect(profile.status).toBe(200);
  expect(profile.body.user.name).toBe('Updated Buyer');
});

test('checkout trusts server prices, applies the learning coupon, and atomically rejects overselling', async () => {
  const product = await Product.create({ seller: seller._id, name: 'Demo mug', description: 'A test item', category: 'Home', price: 20, stock: 1 });
  const first = await request(app).post('/api/orders').set('Authorization', `Bearer ${buyerToken}`).send({
    items: [{ productId: product._id.toString(), quantity: 1, price: 0.01 }],
    couponCode: 'LEARN10',
    shippingAddress: address
  });
  expect(first.status).toBe(201);
  expect(first.body.order.subtotal).toBe(20);
  expect(first.body.order.total).toBe(18);
  expect(await Product.findById(product._id).then((value) => value.stock)).toBe(0);

  const second = await request(app).post('/api/orders').set('Authorization', `Bearer ${buyerToken}`).send({
    items: [{ productId: product._id.toString(), quantity: 1 }],
    shippingAddress: address
  });
  expect(second.status).toBe(409);
  expect(await Product.findById(product._id).then((value) => value.stock)).toBe(0);
});

test('parallel checkouts cannot reserve the same final unit', async () => {
  const product = await Product.create({ seller: seller._id, name: 'Last demo item', description: 'One unit remains', category: 'Home', price: 8, stock: 1 });
  const payload = {
    items: [{ productId: product._id.toString(), quantity: 1 }],
    shippingAddress: address
  };
  const checkout = () => request(app).post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`).send(payload);
  const responses = await Promise.all([checkout(), checkout()]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await Product.findById(product._id).then((value) => value.stock)).toBe(0);
  expect(await Order.countDocuments()).toBe(1);
});

test('local payment is explicitly simulated and unpaid cancellation restores reserved stock', async () => {
  const product = await Product.create({ seller: seller._id, name: 'Demo notebook', description: 'A test item', category: 'Stationery', price: 10, stock: 2 });
  const checkout = await request(app).post('/api/orders').set('Authorization', `Bearer ${buyerToken}`).send({
    items: [{ productId: product._id.toString(), quantity: 1 }],
    shippingAddress: address
  });
  const orderId = checkout.body.order._id;
  const payment = await request(app).post(`/api/orders/${orderId}/payments/simulate`)
    .set('Authorization', `Bearer ${buyerToken}`).send({ outcome: 'success' });
  expect(payment.status).toBe(200);
  expect(payment.body.simulated).toBe(true);
  expect(payment.body.order.status).toBe('paid');

  const unpaid = await request(app).post('/api/orders').set('Authorization', `Bearer ${buyerToken}`).send({
    items: [{ productId: product._id.toString(), quantity: 1 }],
    shippingAddress: address
  });
  const cancellation = await request(app).post(`/api/orders/${unpaid.body.order._id}/cancel`)
    .set('Authorization', `Bearer ${buyerToken}`);
  expect(cancellation.status).toBe(200);
  expect(await Product.findById(product._id).then((value) => value.stock)).toBe(1);
});

test('an admin can record a demo refund before shipment and return reserved stock', async () => {
  const admin = await User.create({ name: 'Admin Example', email: 'admin@example.test', password: 'DemoPass123!', role: 'admin' });
  const adminLogin = await request(app).post('/api/auth/login').send({ email: admin.email, password: 'DemoPass123!' });
  const product = await Product.create({ seller: seller._id, name: 'Refund demo item', description: 'A paid order', category: 'Home', price: 30, stock: 0 });
  const order = await Order.create({
    buyer: buyer._id,
    items: [{ product: product._id, seller: seller._id, name: product.name, quantity: 1, unitPrice: 30 }],
    shippingAddress: address,
    subtotal: 30,
    total: 30,
    status: 'paid',
    paymentStatus: 'paid'
  });
  const response = await request(app).post(`/api/orders/${order._id}/refund/simulate`)
    .set('Authorization', `Bearer ${adminLogin.body.token}`);
  expect(response.status).toBe(200);
  expect(response.body.simulated).toBe(true);
  expect(response.body.order.paymentStatus).toBe('refunded');
  expect(await Product.findById(product._id).then((value) => value.stock)).toBe(1);
});

test('Razorpay webhook verifies signatures and ignores duplicate event IDs', async () => {
  const order = await Order.create({
    buyer: buyer._id,
    items: [{ product: new mongoose.Types.ObjectId(), seller: seller._id, name: 'Demo item', quantity: 1, unitPrice: 15 }],
    shippingAddress: address,
    subtotal: 15,
    total: 15,
    razorpayOrderId: 'order_test_1'
  });
  const payload = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_test_1', order_id: 'order_test_1', amount: 1500, currency: 'INR', notes: { orderId: order._id.toString() } } } }
  });
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
  const sendWebhook = () => request(app).post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signature)
    .set('x-razorpay-event-id', 'evt_demo_1')
    .send(payload);

  const first = await sendWebhook();
  const duplicate = await sendWebhook();
  expect(first.status).toBe(200);
  expect(first.body.duplicate).toBe(false);
  expect(duplicate.status).toBe(200);
  expect(duplicate.body.duplicate).toBe(true);
  const saved = await Order.findById(order._id);
  expect(saved.paymentStatus).toBe('paid');
  expect(saved.paymentEvents).toHaveLength(1);
});

test('coupon totals are rounded to cents and unknown coupons do not discount', () => {
  expect(calculateTotals([{ unitPrice: 12.35, quantity: 2 }], 'LEARN10')).toEqual({ subtotal: 24.7, discount: 2.47, total: 22.23 });
  expect(calculateTotals([{ unitPrice: 10, quantity: 1 }], 'NOTREAL')).toEqual({ subtotal: 10, discount: 0, total: 10 });
});
