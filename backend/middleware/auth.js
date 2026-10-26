const jwt = require('jsonwebtoken');
const env = require('../config/env');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ error: 'No token provided' });
  if (!env.jwtSecret) {
    console.error('❌ JWT_SECRET is not configured');
    return res.status(500).json({ error: 'Server authentication is not configured' });
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (!decoded || !decoded.id) {
      return res.status(403).json({ error: 'Invalid token payload' });
    }
    req.userId = String(decoded.id);
    req.userEmail = decoded.email;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authMiddleware };
