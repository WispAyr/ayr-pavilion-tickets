const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const { initialize } = require('./db');

// Initialize database
initialize();

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' }
});

// Stripe webhook needs raw body - must be BEFORE json parser middleware
const stripeRoutes = require('./routes/stripe');
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Global middleware
app.use(helmet());
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));

// JSON body parser for all routes except stripe webhook (already handled above with raw)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') {
    return next();
  }
  express.json()(req, res, next);
});

app.use('/api/', limiter);

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../data/uploads')));

// Routes
const eventsRoutes = require('./routes/events');
const ticketTypesRoutes = require('./routes/ticket-types');
const ticketsRoutes = require('./routes/tickets');
const scanRoutes = require('./routes/scan');
const adminRoutes = require('./routes/admin');
const addonsRoutes = require('./routes/addons');
const waiversRoutes = require('./routes/waivers');

const trackingRoutes = require('./routes/tracking');
const socialRoutes = require('./routes/social');
const doorRoutes = require('./routes/door');
app.use('/api/track', trackingRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api', ticketTypesRoutes);
app.use('/api', addonsRoutes);
app.use('/api', waiversRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/admin/login', authLimiter);
app.use('/api/admin', adminRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api', socialRoutes);
app.use('/api/door', doorRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3970;
const server = http.createServer(app);

// ─── WebSocket server for /ws/door ─────────────────────────
const wss = new WebSocketServer({ noServer: true });
const doorClients = new Set();

wss.on('connection', (ws) => {
  doorClients.add(ws);
  ws.on('close', () => doorClients.delete(ws));
  ws.on('error', () => doorClients.delete(ws));
});

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/door') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Wire broadcast into scan route
function broadcastScan(data) {
  const msg = JSON.stringify({ type: 'scan', ...data });
  for (const client of doorClients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(msg);
    }
  }
}
scanRoutes.setBroadcast(broadcastScan);

server.listen(PORT, () => {
  console.log(`Ayr Pavilion Tickets API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
