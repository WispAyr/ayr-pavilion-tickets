const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function scannerAuth(req, res, next) {
  const pin = req.headers['x-scanner-pin'] || req.body.pin;
  const expectedPin = process.env.SCANNER_PIN || '1234';

  if (!pin || pin !== expectedPin) {
    return res.status(401).json({ error: 'Invalid scanner PIN' });
  }

  next();
}

module.exports = { adminAuth, scannerAuth };
