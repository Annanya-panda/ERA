require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/era_marketplace');
  const accounts = [
    { name: 'Demo Buyer', email: 'buyer@example.com', role: 'buyer', sellerStatus: 'not_applicable' },
    { name: 'Demo Seller', email: 'seller@example.com', role: 'seller', sellerStatus: 'approved' },
    { name: 'Demo Admin', email: 'admin@example.com', role: 'admin', sellerStatus: 'not_applicable' }
  ];
  const users = {};
  for (const account of accounts) {
    let user = await User.findOne({ email: account.email });
    if (!user) user = await User.create({ ...account, password: 'Demo123!' });
    users[account.role] = user;
  }

  if (await Product.countDocuments() === 0) {
    await Product.insertMany([
      { seller: users.seller._id, name: 'Canvas Market Tote', description: 'A sturdy everyday tote, perfect for a first marketplace order.', category: 'Accessories', price: 24, stock: 18, imageUrl: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=800&q=80' },
      { seller: users.seller._id, name: 'Desk Plant Starter', description: 'A low-maintenance plant to brighten a workspace.', category: 'Home', price: 18.5, stock: 12, imageUrl: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80' },
      { seller: users.seller._id, name: 'Ceramic Coffee Cup', description: 'A handmade-style cup for your morning routine.', category: 'Home', price: 32, stock: 7, imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80' },
      { seller: users.seller._id, name: 'Pocket Notebook Set', description: 'Three compact notebooks for notes, plans, and ideas.', category: 'Stationery', price: 12, stock: 25, imageUrl: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=800&q=80' }
    ]);
  }
  console.info('Demo accounts and products are ready. Password for newly created demo accounts: Demo123!');
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
