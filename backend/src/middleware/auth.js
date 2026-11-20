const jwt = require('jsonwebtoken');
const User = require('../models/User');
const httpError = require('../utils/httpError');

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw httpError(401, 'Sign in to continue');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('_id name email role sellerStatus');
    if (!user) throw httpError(401, 'Account no longer exists');
    req.user = user;
    next();
  } catch (error) {
    next(error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError'
      ? httpError(401, 'Your session is invalid or expired')
      : error);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(httpError(403, 'This action is not available for your role'));
    if (req.user.role === 'seller' && req.user.sellerStatus !== 'approved') {
      return next(httpError(403, 'Your seller account is awaiting admin approval'));
    }
    next();
  };
}

module.exports = { authenticate, allowRoles };
