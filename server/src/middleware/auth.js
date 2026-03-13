const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check user still exists and is active
    const { getDb } = require('../db');
    const db = getDb();
    const user = db.prepare('SELECT id, username, role, active FROM admin_users WHERE id = ?').get(decoded.userId);
    
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Account disabled or not found' });
    }

    req.admin = { userId: user.id, username: user.username, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function ownerOnly(req, res, next) {
  if (req.admin?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

function adminOrOwner(req, res, next) {
  if (req.admin?.role === 'staff') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function scannerAuth(req, res, next) {
  const pin = req.headers['x-scanner-pin'] || req.body.pin;

  if (!pin) {
    return res.status(401).json({ error: 'Invalid scanner PIN' });
  }

  const { getDb } = require('../db');
  const db = getDb();
  const user = db.prepare('SELECT id, name FROM scanner_users WHERE pin = ? AND active = 1').get(pin);
  if (user) {
    req.scannerUser = user;
    return next();
  }

  const expectedPin = process.env.SCANNER_PIN || '1234';
  if (pin === expectedPin) {
    req.scannerUser = { id: 0, name: 'Default' };
    return next();
  }

  return res.status(401).json({ error: 'Invalid scanner PIN' });
}

module.exports = { adminAuth, ownerOnly, adminOrOwner, scannerAuth };
