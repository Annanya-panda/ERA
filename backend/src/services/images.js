const cloudinary = require('cloudinary').v2;

function configured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

function uploadImage(dataUri) {
  if (!configured()) throw new Error('Configure Cloudinary credentials to upload images; remote image URLs work in demo mode.');
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  return cloudinary.uploader.upload(dataUri, { folder: 'era-marketplace-demo', resource_type: 'image' });
}

module.exports = { configured, uploadImage };
