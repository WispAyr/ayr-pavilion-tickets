const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const http = require('http');
const { WebSocketServer } = require('ws');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const { initialize } = require('./db');
const { startReservationCleanup } = require('./services/reservationCleanup');

// Initialize database
initialize();

// Start periodic cleanup of expired checkout reservations
startReservationCleanup(60000);

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
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
const protectionRoutes = require('./routes/protection');
const compsRoutes = require('./routes/comps');

const trackingRoutes = require('./routes/tracking');
const socialRoutes = require('./routes/social');
const doorRoutes = require('./routes/door');

app.use('/api/door', doorRoutes);
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
app.use('/api/protection', protectionRoutes);
app.use('/api', protectionRoutes);
app.use('/api/comps', compsRoutes);
app.use('/api', compsRoutes);

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

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/door' });

// Track connected door clients
wss.on('connection', (ws) => {
  console.log('[WS] Door client connected');
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => { console.log('[WS] Door client disconnected'); });
});

// Heartbeat to clean up dead connections
const wsInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(wsInterval));

// Wire up scan broadcast to push to all connected door clients
scanRoutes.setBroadcast((data) => {
  const message = JSON.stringify({ type: 'scan', data });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
});

const PORT = process.env.PORT || 3970;
server.listen(PORT, () => {
  console.log(`Ayr Pavilion Tickets API running on port ${PORT}`);
  console.log(`WebSocket server active on /ws/door`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
