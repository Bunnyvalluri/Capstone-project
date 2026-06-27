const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'noteland_super_secret_key_123';

const authMiddleware = (req, res, next) => {
  // Bypass JWT check for single-user authless mode, automatically login as user ID 1
  req.user = { id: 1, name: 'NoteLand User', email: 'user@noteland.com' };
  next();
};

module.exports = {
  authMiddleware,
  JWT_SECRET
};
