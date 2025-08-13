const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'secret';

function generateToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, secret, { expiresIn });
}

module.exports = generateToken;