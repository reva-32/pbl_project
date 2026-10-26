const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'msme360';

/**
 * OAuth state is signed and short-lived, so a callback cannot be replayed or
 * used to attach a provider account to another tenant.
 */
function signOAuthState(payload, purpose, expiresIn = '10m') {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign(
    { ...payload, purpose, nonce: crypto.randomBytes(16).toString('hex') },
    env.jwtSecret,
    { expiresIn, issuer: ISSUER }
  );
}

function verifyOAuthState(token, purpose) {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not configured');
  const decoded = jwt.verify(token, env.jwtSecret, { issuer: ISSUER });
  if (decoded.purpose !== purpose || !decoded.sub) {
    const err = new Error('Invalid OAuth state');
    err.status = 400;
    throw err;
  }
  return decoded;
}

module.exports = { signOAuthState, verifyOAuthState };
