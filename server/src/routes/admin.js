const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const { getDb } = require('../db');
const { adminAuth, ownerOnly, adminOrOwner } = require('../middleware/auth');
const { createRefund } = require('../services/stripe');
const { resendEmail, sendPasswordResetEmail, sendEventReportEmail } = require('../services/email');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

// Mount stats sub-routes (must be before any :id params)
const statsRoutes = require('./stats');
router.use('/stats', statsRoutes);

// POST /api/admin/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM admin_users WHERE LOWER(username) = LOWER(?)').get(username);

    if (!user || !bcryptjs.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.active) {
      return res.status(401).json({ error: 'Account disabled. Contact the site owner.' });
    }

    db.prepare('UPDATE admin_users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: user.username, role: user.role, displayName: user.display_name, canSeeFinancials: !!user.can_see_financials });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/admin/forgot-password
router.post('/forgot-password', (req, res) => {
  try {
    const { email } = req.body;
    // Always return success to prevent email enumeration
    if (!email) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const db = getDb();
    const user = db.prepare('SELECT id, email, display_name FROM admin_users WHERE LOWER(email) = LOWER(?) AND active = 1').get(email);

    if (user) {
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      db.prepare('UPDATE admin_users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, user.id);

      const appUrl = process.env.APP_URL || 'https://tickets.ayrpavilion.com';
      sendPasswordResetEmail(user.email, user.display_name || 'Admin', `${appUrl}/admin/reset-password?token=${token}`)
        .catch(err => console.error('Failed to send reset email:', err));
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// POST /api/admin/reset-password
router.post('/reset-password', (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const db = getDb();
    const user = db.prepare('SELECT id FROM admin_users WHERE reset_token = ? AND reset_token_expires > datetime(\'now\') AND active = 1').get(token);

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });

    const hash = bcryptjs.hashSync(password, 10);
    db.prepare('UPDATE admin_users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(hash, user.id);

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── Profile ────────────────────────────────────────────────
// GET /api/admin/profile
router.get('/profile', adminAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, email, display_name, role, can_see_financials, last_login, created_at FROM admin_users WHERE id = ?').get(req.admin.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PUT /api/admin/profile
router.put('/profile', adminAuth, (req, res) => {
  const { display_name, email } = req.body;
  const db = getDb();
  
  if (email) {
    const existing = db.prepare('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?) AND id != ?').get(email, req.admin.userId);
    if (existing) return res.status(400).json({ error: 'Email already in use' });
  }

  db.prepare('UPDATE admin_users SET display_name = COALESCE(?, display_name), email = COALESCE(?, email), updated_at = datetime(\'now\') WHERE id = ?')
    .run(display_name || null, email || null, req.admin.userId);

  res.json({ message: 'Profile updated' });
});

// PUT /api/admin/profile/password
router.put('/profile/password', adminAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new passwords are required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM admin_users WHERE id = ?').get(req.admin.userId);
  if (!bcryptjs.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = bcryptjs.hashSync(new_password, 10);
  db.prepare('UPDATE admin_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, req.admin.userId);
  res.json({ message: 'Password changed successfully' });
});

// ─── User Management (Owner only) ──────────────────────────
// GET /api/admin/users
router.get('/users', adminAuth, ownerOnly, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, email, display_name, role, active, can_see_financials, last_login, created_at FROM admin_users ORDER BY created_at ASC').all();
  res.json(users);
});

// POST /api/admin/users
router.post('/users', adminAuth, ownerOnly, (req, res) => {
  const { username, email, password, display_name, role } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Username, email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const db = getDb();
  const existingUser = db.prepare('SELECT id FROM admin_users WHERE LOWER(username) = LOWER(?)').get(username);
  if (existingUser) return res.status(400).json({ error: 'Username already taken' });

  const existingEmail = db.prepare('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?)').get(email);
  if (existingEmail) return res.status(400).json({ error: 'Email already in use' });

  const hash = bcryptjs.hashSync(password, 10);
  const result = db.prepare('INSERT INTO admin_users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)')
    .run(username, email, hash, display_name || username, role || 'admin');

  res.json({ id: result.lastInsertRowid, message: 'User created' });
});

// PUT /api/admin/users/:id
router.put('/users/:id', adminAuth, ownerOnly, (req, res) => {
  const { display_name, email, role, active, can_see_financials } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent demoting/disabling the last owner
  if (user.role === 'owner' && (role !== 'owner' || active === 0)) {
    const ownerCount = db.prepare("SELECT COUNT(*) as count FROM admin_users WHERE role = 'owner' AND active = 1").get();
    if (ownerCount.count <= 1) return res.status(400).json({ error: 'Cannot demote or disable the last owner' });
  }

  if (email) {
    const existing = db.prepare('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?) AND id != ?').get(email, req.params.id);
    if (existing) return res.status(400).json({ error: 'Email already in use' });
  }

  db.prepare(`UPDATE admin_users SET 
    display_name = COALESCE(?, display_name),
    email = COALESCE(?, email),
    role = COALESCE(?, role),
    active = COALESCE(?, active),
    can_see_financials = COALESCE(?, can_see_financials),
    updated_at = datetime('now')
    WHERE id = ?`).run(display_name || null, email || null, role || null, active !== undefined ? active : null, can_see_financials !== undefined ? (can_see_financials ? 1 : 0) : null, req.params.id);

  res.json({ message: 'User updated' });
});

// PUT /api/admin/users/:id/password
router.put('/users/:id/password', adminAuth, ownerOnly, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const db = getDb();
  const user = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = bcryptjs.hashSync(password, 10);
  db.prepare('UPDATE admin_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, req.params.id);
  res.json({ message: 'Password updated' });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminAuth, ownerOnly, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.admin.userId) return res.status(400).json({ error: 'Cannot delete your own account' });

  if (user.role === 'owner') {
    const ownerCount = db.prepare("SELECT COUNT(*) as count FROM admin_users WHERE role = 'owner' AND active = 1").get();
    if (ownerCount.count <= 1) return res.status(400).json({ error: 'Cannot delete the last owner' });
  }

  db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted' });
});

// GET /api/admin/dashboard - dashboard stats
router.get('/dashboard', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
    const activeEvents = db.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'on-sale'").get();
    const totalTicketsSold = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status != 'cancelled' AND status != 'refunded'").get();
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'paid'").get();
    const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'paid'").get();

    const upcomingEvents = db.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status != 'cancelled' AND t.status != 'refunded') as tickets_sold,
        (SELECT COALESCE(SUM(tt.quantity), 0) FROM ticket_types tt WHERE tt.event_id = e.id) as total_capacity
      FROM events e
      WHERE e.date_time >= datetime('now')
      AND e.status IN ('on-sale', 'sold-out')
      ORDER BY e.date_time ASC
      LIMIT 10
    `).all();

    const recentOrders = db.prepare(`
      SELECT o.*, e.title as event_title
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.status = 'paid'
      ORDER BY o.created_at DESC
      LIMIT 10
    `).all();

    const todayCheckins = db.prepare(`
      SELECT COUNT(*) as count FROM tickets
      WHERE status = 'used' AND date(checked_in_at) = date('now')
    `).get();

    res.json({
      stats: {
        total_events: totalEvents.count,
        active_events: activeEvents.count,
        tickets_sold: totalTicketsSold.count,
        total_revenue: totalRevenue.total,
        total_orders: totalOrders.count,
        today_checkins: todayCheckins.count
      },
      upcoming_events: upcomingEvents,
      recent_orders: recentOrders
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/admin/orders - list orders with pagination/filtering
router.get('/orders', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, status, eventId, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT o.*, e.title as event_title,
        (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id) as ticket_count
      FROM orders o
      JOIN events e ON o.event_id = e.id
    `;
    let countQuery = 'SELECT COUNT(*) as count FROM orders o JOIN events e ON o.event_id = e.id';
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }

    if (eventId) {
      conditions.push('o.event_id = ?');
      params.push(eventId);
    }

    if (search) {
      conditions.push('(o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.order_ref LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      const where = ' WHERE ' + conditions.join(' AND ');
      query += where;
      countQuery += where;
    }

    const total = db.prepare(countQuery).get(...params);

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    const orders = db.prepare(query).all(...params, parseInt(limit, 10), offset);

    res.json({
      orders,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: total.count,
        pages: Math.ceil(total.count / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/admin/orders/:id - order detail with tickets
router.get('/orders/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, e.title as event_title, e.date_time, e.venue
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.id = ?
    `).get(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const tickets = db.prepare(`
      SELECT t.*, tt.name as ticket_type_name, tt.price as ticket_price
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.order_id = ?
      ORDER BY t.created_at ASC
    `).all(order.id);

    const addon_selections = db.prepare(`
      SELECT oas.*, a.name as addon_name, a.type as addon_type
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      WHERE oas.order_id = ?
    `).all(order.id);

    const waiver_acceptances = db.prepare(`
      SELECT wa.*, w.name as waiver_name
      FROM waiver_acceptances wa
      JOIN waivers w ON wa.waiver_id = w.id
      WHERE wa.order_id = ?
    `).all(order.id);

    res.json({ ...order, tickets, addon_selections, waiver_acceptances });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /api/admin/orders/:id/refund - initiate refund via Stripe
router.post('/orders/:id/refund', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, e.title as event_title, e.date_time, e.venue
      FROM orders o JOIN events e ON o.event_id = e.id WHERE o.id = ?
    `).get(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'Order is not in a refundable state' });
    }

    if (!order.stripe_payment_intent) {
      return res.status(400).json({ error: 'No payment intent found for this order' });
    }

    const { amount, reason, notes } = req.body;
    const refundAmount = amount || null; // null = full refund
    const isFullRefund = !refundAmount || refundAmount >= order.total;
    const actualRefundAmount = isFullRefund ? order.total : refundAmount;

    const refund = await createRefund(order.stripe_payment_intent, refundAmount);

    if (isFullRefund) {
      // Full refund — cancel order and all tickets
      db.prepare(`
        UPDATE orders SET status = 'refunded', refund_amount = ?, refund_reason = ?, refund_notes = ?,
        refunded_at = datetime('now'), stripe_refund_id = ?, updated_at = datetime('now') WHERE id = ?
      `).run(actualRefundAmount, reason || null, notes || null, refund.id, order.id);

      db.prepare("UPDATE tickets SET status = 'refunded' WHERE order_id = ?").run(order.id);

      // Restore sold counts
      const orderTickets = db.prepare(`
        SELECT ticket_type_id, COUNT(*) as count FROM tickets WHERE order_id = ? GROUP BY ticket_type_id
      `).all(order.id);
      for (const t of orderTickets) {
        db.prepare('UPDATE ticket_types SET sold = MAX(0, sold - ?) WHERE id = ?').run(t.count, t.ticket_type_id);
      }
    } else {
      // Partial refund — keep order paid, track amount
      const existingRefund = order.refund_amount || 0;
      db.prepare(`
        UPDATE orders SET refund_amount = ?, refund_reason = ?, refund_notes = ?,
        refunded_at = datetime('now'), stripe_refund_id = ?, updated_at = datetime('now') WHERE id = ?
      `).run(existingRefund + actualRefundAmount, reason || null, notes || null, refund.id, order.id);
    }

    // Send refund confirmation email
    const { sendRefundEmail } = require('../services/email');
    sendRefundEmail({
      to: order.customer_email,
      customerName: order.customer_name,
      eventTitle: order.event_title,
      dateTime: order.date_time,
      venue: order.venue,
      orderRef: order.order_ref,
      refundAmount: actualRefundAmount,
      isFullRefund,
      reason: reason || null,
    }).catch(err => console.error('Failed to send refund email:', err.message));

    res.json({
      message: isFullRefund ? 'Full refund processed' : 'Partial refund processed',
      refund_id: refund.id,
      refund_amount: actualRefundAmount,
      status: refund.status,
    });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: err.message || 'Failed to process refund' });
  }
});

// GET /api/admin/events/:id/door-list - get door list for event
router.get('/events/:id/door-list', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const tickets = db.prepare(`
      SELECT
        t.code, t.holder_name, t.status, t.checked_in_at,
        tt.name as ticket_type_name,
        o.customer_name, o.customer_email, o.customer_phone, o.order_ref
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN orders o ON t.order_id = o.id
      WHERE t.event_id = ? AND t.status != 'cancelled'
      ORDER BY o.customer_name ASC
    `).all(req.params.id);

    const summary = db.prepare(`
      SELECT tt.name,
        COUNT(*) as total,
        SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as checked_in,
        SUM(CASE WHEN t.status = 'valid' THEN 1 ELSE 0 END) as pending
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.event_id = ? AND t.status != 'cancelled'
      GROUP BY tt.id, tt.name
    `).all(req.params.id);

    res.json({
      event: {
        id: event.id,
        title: event.title,
        date_time: event.date_time,
        venue: event.venue
      },
      summary,
      tickets,
      total: tickets.length
    });
  } catch (err) {
    console.error('Error fetching door list:', err);
    res.status(500).json({ error: 'Failed to fetch door list' });
  }
});

// GET /api/admin/emails - list email logs with filtering
router.get('/emails', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 50, eventId, status } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT el.*,
        e.title as event_title,
        o.order_ref
      FROM email_logs el
      LEFT JOIN orders o ON el.order_id = o.id
      LEFT JOIN events e ON o.event_id = e.id
    `;
    let countQuery = `
      SELECT COUNT(*) as count FROM email_logs el
      LEFT JOIN orders o ON el.order_id = o.id
      LEFT JOIN events e ON o.event_id = e.id
    `;
    const conditions = [];
    const params = [];

    if (eventId) {
      conditions.push('o.event_id = ?');
      params.push(eventId);
    }
    if (status) {
      conditions.push('el.status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      const where = ' WHERE ' + conditions.join(' AND ');
      query += where;
      countQuery += where;
    }

    const total = db.prepare(countQuery).get(...params);

    query += ' ORDER BY el.created_at DESC LIMIT ? OFFSET ?';
    const emails = db.prepare(query).all(...params, parseInt(limit, 10), offset);

    // Summary stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' OR status = 'resent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN opened_count > 0 THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN clicked_count > 0 THEN 1 ELSE 0 END) as clicked
      FROM email_logs
    `).get();

    res.json({
      emails,
      stats: {
        total: stats.total,
        sent: stats.sent,
        failed: stats.failed,
        opened: stats.opened,
        clicked: stats.clicked,
        open_rate: stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : '0.0',
        click_rate: stats.sent > 0 ? ((stats.clicked / stats.sent) * 100).toFixed(1) : '0.0'
      },
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: total.count,
        pages: Math.ceil(total.count / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('Error fetching email logs:', err);
    res.status(500).json({ error: 'Failed to fetch email logs' });
  }
});

// POST /api/admin/emails/:id/resend - resend a failed email
router.post('/emails/:id/resend', adminAuth, async (req, res) => {
  try {
    await resendEmail(parseInt(req.params.id, 10));
    res.json({ message: 'Email resent successfully' });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: err.message || 'Failed to resend email' });
  }
});

// ─── Scanner Users ──────────────────────────────────────────

// GET /api/admin/scanner-users
router.get('/scanner-users', adminAuth, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, name, pin, active, created_at FROM scanner_users ORDER BY name').all();
  // Count scans per user
  const usersWithStats = users.map(u => {
    const scanCount = db.prepare("SELECT COUNT(*) as count FROM scans WHERE scanned_by = ?").get(u.name);
    const lastScan = db.prepare("SELECT scanned_at FROM scans WHERE scanned_by = ? ORDER BY scanned_at DESC LIMIT 1").get(u.name);
    return { ...u, scan_count: scanCount.count, last_scan: lastScan ? lastScan.scanned_at : null };
  });
  res.json(usersWithStats);
});

// POST /api/admin/scanner-users
router.post('/scanner-users', adminAuth, (req, res) => {
  const db = getDb();
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Name and PIN required' });
  if (pin.length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' });

  const existing = db.prepare('SELECT id FROM scanner_users WHERE pin = ?').get(pin);
  if (existing) return res.status(400).json({ error: 'PIN already in use' });

  const result = db.prepare('INSERT INTO scanner_users (name, pin) VALUES (?, ?)').run(name, pin);
  res.json({ id: result.lastInsertRowid, name, pin, active: 1 });
});

// PUT /api/admin/scanner-users/:id
router.put('/scanner-users/:id', adminAuth, (req, res) => {
  const db = getDb();
  const { name, pin, active } = req.body;
  const user = db.prepare('SELECT * FROM scanner_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (pin && pin !== user.pin) {
    const existing = db.prepare('SELECT id FROM scanner_users WHERE pin = ? AND id != ?').get(pin, user.id);
    if (existing) return res.status(400).json({ error: 'PIN already in use' });
  }

  db.prepare('UPDATE scanner_users SET name = ?, pin = ?, active = ? WHERE id = ?')
    .run(name || user.name, pin || user.pin, active !== undefined ? active : user.active, user.id);
  res.json({ message: 'Updated' });
});

// DELETE /api/admin/scanner-users/:id
router.delete('/scanner-users/:id', adminAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM scanner_users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// GET /api/admin/door/:eventId - live door stats for an event
router.get('/door/:eventId', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const event = db.prepare('SELECT id, title, date_time, doors_open, venue FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const totalTickets = db.prepare(
      "SELECT COUNT(*) as count FROM tickets WHERE event_id = ? AND status != 'cancelled' AND status != 'refunded'"
    ).get(eventId);

    const checkedIn = db.prepare(
      "SELECT COUNT(*) as count FROM tickets WHERE event_id = ? AND status = 'used'"
    ).get(eventId);

    const totalOrders = db.prepare(
      "SELECT COUNT(*) as count FROM orders WHERE event_id = ? AND status = 'paid'"
    ).get(eventId);

    const totalRevenue = db.prepare(
      "SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE event_id = ? AND status = 'paid'"
    ).get(eventId);

    const byType = db.prepare(`
      SELECT tt.name, tt.price, COUNT(t.id) as total,
        SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as checked_in
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.event_id = ? AND t.status != 'cancelled' AND t.status != 'refunded'
      GROUP BY tt.id, tt.name
    `).all(eventId);

    const recentScans = db.prepare(`
      SELECT s.scanned_at, s.result, s.scanned_by,
        t.code, t.holder_name,
        tt.name as ticket_type,
        o.customer_name, o.order_ref
      FROM scans s
      LEFT JOIN tickets t ON s.ticket_id = t.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      LEFT JOIN orders o ON t.order_id = o.id
      WHERE t.event_id = ? OR s.ticket_id = 0
      ORDER BY s.scanned_at DESC
      LIMIT 30
    `).all(eventId);

    // Scans per minute (last 60 minutes)
    const scanRate = db.prepare(`
      SELECT 
        strftime('%H:%M', s.scanned_at) as minute,
        COUNT(*) as count
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = ? AND s.result = 'valid'
        AND s.scanned_at > datetime('now', '-60 minutes')
      GROUP BY minute
      ORDER BY minute
    `).all(eventId);

    res.json({
      event,
      total_tickets: totalTickets.count,
      checked_in: checkedIn.count,
      remaining: totalTickets.count - checkedIn.count,
      percentage: totalTickets.count > 0 ? Math.round((checkedIn.count / totalTickets.count) * 100) : 0,
      total_orders: totalOrders.count,
      total_revenue: totalRevenue.total,
      by_type: byType,
      recent_scans: recentScans,
      scan_rate: scanRate,
    });
  } catch (err) {
    console.error('Door stats error:', err);
    res.status(500).json({ error: 'Failed to fetch door statistics' });
  }
});

// POST /api/admin/orders/:id/add-addon - add addon top-up to existing order
router.post('/orders/:id/add-addon', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, e.title as event_title FROM orders o
      JOIN events e ON o.event_id = e.id WHERE o.id = ?
    `).get(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Can only add addons to paid orders' });

    const { selections, paymentMethod, notes } = req.body;
    // selections: [{ addonId, addonOptionId?, quantity?, ticketId? }]
    // paymentMethod: 'cash' | 'comp' | 'card-on-file' (no new Stripe session for now)

    if (!selections || !selections.length) {
      return res.status(400).json({ error: 'No addon selections provided' });
    }

    let totalAdded = 0;
    const added = [];

    const insertAddonSel = db.prepare(`
      INSERT INTO order_addon_selections (order_id, ticket_id, addon_id, addon_option_id, selected_option, quantity, price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updateOptionReserved = db.prepare(`
      UPDATE addon_options SET reserved = reserved + ? WHERE id = ?
    `);

    const addAddons = db.transaction(() => {
      for (const sel of selections) {
        const addon = db.prepare('SELECT * FROM addons WHERE id = ? AND event_id = ? AND active = 1').get(sel.addonId, order.event_id);
        if (!addon) continue;

        let unitPrice = addon.price;
        let optionLabel = null;
        let addonOptionId = null;

        if (addon.type === 'select' && sel.addonOptionId) {
          const option = db.prepare('SELECT * FROM addon_options WHERE id = ? AND addon_id = ? AND active = 1').get(sel.addonOptionId, addon.id);
          if (!option) continue;
          if (option.stock > 0 && option.reserved >= option.stock) {
            throw new Error(`${addon.name} - ${option.label} is out of stock`);
          }
          unitPrice = option.price_override !== null ? option.price_override : addon.price;
          optionLabel = option.label;
          addonOptionId = option.id;
        }

        const qty = sel.quantity || 1;
        const ticketId = sel.ticketId || null;

        insertAddonSel.run(order.id, ticketId, addon.id, addonOptionId, optionLabel, qty, unitPrice);

        if (addonOptionId) {
          updateOptionReserved.run(qty, addonOptionId);
        }

        totalAdded += unitPrice * qty;
        added.push({ addon: addon.name, option: optionLabel, quantity: qty, price: unitPrice });
      }
    });

    addAddons();

    // Update order total if payment method is cash or card
    if (paymentMethod !== 'comp' && totalAdded > 0) {
      db.prepare('UPDATE orders SET total = total + ?, updated_at = datetime(\'now\') WHERE id = ?').run(totalAdded, order.id);
    }

    // Log the top-up (store as a note via notes field or just return)
    res.json({
      message: `${added.length} addon(s) added to order ${order.order_ref}`,
      added,
      total_added: totalAdded,
      payment_method: paymentMethod || 'cash',
      notes: notes || null,
    });
  } catch (err) {
    console.error('Add addon error:', err);
    res.status(500).json({ error: err.message || 'Failed to add addon to order' });
  }
});

// POST /api/admin/events/:eventId/close-event — Close event and send report
router.post('/events/:eventId/close-event', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Set event status to completed
    db.prepare("UPDATE events SET status = 'completed', updated_at = datetime('now') WHERE id = ?").run(eventId);

    // Build the report by calling the stats logic internally
    const statsRoutes = require('./stats');
    // Use a fake req/res to get the report data
    const reportData = await new Promise((resolve, reject) => {
      const fakeReq = { params: { eventId }, admin: req.admin };
      const fakeRes = {
        json: (data) => resolve(data),
        status: (code) => ({ json: (data) => reject(new Error(data.error || 'Report generation failed')) })
      };
      // Find the event-report handler
      const layer = statsRoutes.stack.find(l => l.route && l.route.path === '/event-report/:eventId');
      if (layer) {
        layer.route.stack[layer.route.stack.length - 1].handle(fakeReq, fakeRes, (err) => { if (err) reject(err); });
      } else {
        reject(new Error('Event report route not found'));
      }
    });

    // Send the report email to the admin who closed it
    const adminUser = db.prepare('SELECT email FROM admin_users WHERE id = ?').get(req.admin.userId);
    if (adminUser && adminUser.email) {
      sendEventReportEmail({ to: adminUser.email, reportData })
        .catch(err => console.error('Failed to send event report email:', err.message));
    }

    res.json({ message: `Event "${event.title}" closed successfully`, report: reportData });
  } catch (err) {
    console.error('Close event error:', err);
    res.status(500).json({ error: err.message || 'Failed to close event' });
  }
});

// POST /api/admin/events/close-group — Close all sessions in a group and send combined report
router.post('/events/close-group', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const { event_ids, email_to } = req.body;
    if (!event_ids || !event_ids.length) return res.status(400).json({ error: 'Provide event_ids array' });

    const placeholders = event_ids.map(() => '?').join(',');
    const events = db.prepare(`SELECT id, title, status FROM events WHERE id IN (${placeholders})`).all(...event_ids);

    // Mark all as completed
    const update = db.prepare("UPDATE events SET status = 'completed', updated_at = datetime('now') WHERE id = ? AND status != 'completed'");
    const closeAll = db.transaction(() => { for (const e of events) update.run(e.id); });
    closeAll();

    // Get combined report data
    const statsRoutes = require('./stats');
    const reportData = await new Promise((resolve, reject) => {
      const fakeReq = { query: { ids: event_ids.join(',') }, admin: req.admin };
      const fakeRes = {
        json: (data) => resolve(data),
        status: (code) => ({ json: (data) => reject(new Error(data.error || 'Report generation failed')) })
      };
      const layer = statsRoutes.stack.find(l => l.route && l.route.path === '/combined-report');
      if (layer) {
        layer.route.stack[layer.route.stack.length - 1].handle(fakeReq, fakeRes, (err) => { if (err) reject(err); });
      } else {
        reject(new Error('Combined report route not found'));
      }
    });

    // Send email
    const sendTo = email_to || 'info@ayrpavilion.com';
    sendEventReportEmail({ to: sendTo, reportData })
      .catch(err => console.error('Failed to send combined report email:', err.message));

    const adminUser = db.prepare('SELECT email FROM admin_users WHERE id = ?').get(req.admin.userId);
    if (adminUser && adminUser.email && adminUser.email !== sendTo) {
      sendEventReportEmail({ to: adminUser.email, reportData })
        .catch(err => console.error('Failed to send admin copy:', err.message));
    }

    res.json({
      message: `${events.length} session(s) closed. Combined report sent.`,
      group_name: reportData.group_name,
      sessions_closed: events.map(e => e.title)
    });
  } catch (err) {
    console.error('Close group error:', err);
    res.status(500).json({ error: err.message || 'Failed to close event group' });
  }
});

// POST /api/admin/events/retire-past — Auto-complete past events
router.post('/events/retire-past', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const pastEvents = db.prepare(`
      SELECT id, title, date_time FROM events
      WHERE date_time < datetime('now', '-4 hours')
      AND status IN ('on-sale', 'sold-out')
    `).all();

    if (pastEvents.length === 0) {
      return res.json({ message: 'No past events to retire', retired: [] });
    }

    const update = db.prepare("UPDATE events SET status = 'completed', updated_at = datetime('now') WHERE id = ?");
    const retireAll = db.transaction(() => {
      for (const evt of pastEvents) {
        update.run(evt.id);
      }
    });
    retireAll();

    res.json({
      message: `${pastEvents.length} event(s) retired`,
      retired: pastEvents.map(e => ({ id: e.id, title: e.title, date_time: e.date_time }))
    });
  } catch (err) {
    console.error('Retire past events error:', err);
    res.status(500).json({ error: 'Failed to retire past events' });
  }
});

// GET /api/admin/marketing/customers — Opted-in customer list
router.get('/marketing/customers', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const customers = db.prepare(`
      SELECT
        o.customer_name as name,
        o.customer_email as email,
        MAX(o.customer_phone) as phone,
        COUNT(*) as total_orders,
        SUM(o.total) as total_spent,
        MIN(o.created_at) as first_order,
        MAX(o.created_at) as last_order,
        GROUP_CONCAT(DISTINCT e.title || ' (' || date(e.date_time) || ')') as events
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.marketing_opt_in = 1 AND o.status = 'paid'
      GROUP BY o.customer_email
      ORDER BY last_order DESC
    `).all();

    for (const c of customers) {
      c.avg_spend = c.total_orders > 0 ? Math.round(c.total_spent / c.total_orders) : 0;
      c.is_repeat = c.total_orders > 1;
      c.events = c.events ? c.events.split(',') : [];
    }

    res.json(customers);
  } catch (err) {
    console.error('Marketing customers error:', err);
    res.status(500).json({ error: 'Failed to load marketing customers' });
  }
});

// GET /api/admin/marketing/insights — Marketing analytics
router.get('/marketing/insights', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const totalOptedIn = db.prepare(`
      SELECT COUNT(DISTINCT customer_email) as count FROM orders WHERE marketing_opt_in = 1 AND status = 'paid'
    `).get();

    const totalPaidOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'paid'").get();

    const revenueFromOptedIn = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE marketing_opt_in = 1 AND status = 'paid'
    `).get();

    const repeatCustomers = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT customer_email, COUNT(*) as cnt FROM orders
        WHERE marketing_opt_in = 1 AND status = 'paid'
        GROUP BY customer_email HAVING cnt > 1
      )
    `).get();

    const avgOrdersPerCustomer = db.prepare(`
      SELECT COALESCE(AVG(cnt), 0) as avg FROM (
        SELECT COUNT(*) as cnt FROM orders
        WHERE marketing_opt_in = 1 AND status = 'paid'
        GROUP BY customer_email
      )
    `).get();

    const topEvents = db.prepare(`
      SELECT e.title, COUNT(*) as order_count
      FROM orders o JOIN events e ON o.event_id = e.id
      WHERE o.marketing_opt_in = 1 AND o.status = 'paid'
      GROUP BY e.id ORDER BY order_count DESC LIMIT 5
    `).all();

    res.json({
      total_opted_in: totalOptedIn.count,
      opt_in_rate: totalPaidOrders.count > 0 ? Math.round((totalOptedIn.count / totalPaidOrders.count) * 1000) / 10 : 0,
      repeat_rate: totalOptedIn.count > 0 ? Math.round((repeatCustomers.count / totalOptedIn.count) * 1000) / 10 : 0,
      avg_orders_per_customer: Math.round(avgOrdersPerCustomer.avg * 10) / 10,
      total_revenue_from_opted_in: revenueFromOptedIn.total,
      top_events: topEvents
    });
  } catch (err) {
    console.error('Marketing insights error:', err);
    res.status(500).json({ error: 'Failed to load marketing insights' });
  }
});

// GET /api/admin/marketing/customers/:email — Full customer history
router.get('/marketing/customers/:email', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const email = decodeURIComponent(req.params.email);

    const orders = db.prepare(`
      SELECT o.id, o.order_ref, o.total, o.status, o.created_at, o.booking_fee, o.protection_opted, o.protection_fee,
        e.title as event_title, e.date_time as event_date,
        o.customer_name, o.customer_phone
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE LOWER(o.customer_email) = LOWER(?)
      ORDER BY o.created_at DESC
    `).all(email);

    for (const order of orders) {
      order.tickets = db.prepare(`
        SELECT t.code, tt.name as ticket_type, t.status, t.checked_in_at
        FROM tickets t JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.order_id = ?
      `).all(order.id);

      order.addons = db.prepare(`
        SELECT a.name, oas.selected_option, oas.quantity, oas.price
        FROM order_addon_selections oas JOIN addons a ON oas.addon_id = a.id
        WHERE oas.order_id = ?
      `).all(order.id);

      order.emails = db.prepare(`
        SELECT status, subject, opened_count, clicked_count, sent_at
        FROM email_logs WHERE order_id = ?
      `).all(order.id);
    }

    res.json({
      email,
      name: orders[0]?.customer_name || null,
      phone: orders[0]?.customer_phone || null,
      total_orders: orders.length,
      total_spent: orders.reduce((s, o) => s + (o.status === 'paid' ? o.total : 0), 0),
      orders
    });
  } catch (err) {
    console.error('Customer detail error:', err);
    res.status(500).json({ error: 'Failed to load customer details' });
  }
});

// GET /api/admin/performance/events — Operational metrics per event
router.get('/performance/events', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const events = db.prepare(`
      SELECT e.id, e.title, e.date_time, e.status, e.venue, e.doors_open
      FROM events e
      WHERE e.status IN ('completed', 'sold-out', 'on-sale')
      AND EXISTS (SELECT 1 FROM orders WHERE event_id = e.id AND status = 'paid')
      ORDER BY e.date_time DESC
    `).all();

    const results = [];
    for (const event of events) {
      // Use actual ticket counts (sold counter on ticket_types can be stale)
      const capRow = db.prepare('SELECT SUM(quantity) as total_capacity FROM ticket_types WHERE event_id = ?').get(event.id);
      const ticketCounts = db.prepare(`
        SELECT COUNT(*) as total_active,
          COUNT(CASE WHEN status = 'used' THEN 1 END) as checked_in,
          COUNT(CASE WHEN status = 'valid' THEN 1 END) as not_scanned
        FROM tickets WHERE event_id = ? AND status IN ('valid','used')
      `).get(event.id);
      const ttStats = {
        total_capacity: capRow.total_capacity || 0,
        sold: ticketCounts.total_active || 0,
        checked_in: ticketCounts.checked_in || 0,
        no_shows: ticketCounts.not_scanned || 0
      };

      const addonStats = db.prepare(`
        SELECT COUNT(DISTINCT oas.id) as addon_selections, COUNT(DISTINCT t.id) as ticket_count
        FROM tickets t
        LEFT JOIN order_addon_selections oas ON oas.order_id = t.order_id
        WHERE t.event_id = ? AND t.status IN ('valid','used')
      `).get(event.id);

      const protClaims = db.prepare(`
        SELECT
          COUNT(CASE WHEN o.protection_opted = 1 THEN 1 END) as protected_orders,
          (SELECT COUNT(*) FROM protection_claims pc WHERE pc.order_id IN (SELECT id FROM orders WHERE event_id = ?)) as claims
        FROM orders o WHERE o.event_id = ? AND o.status IN ('paid','refunded','comp')
      `).get(event.id, event.id);

      // Avg arrival offset
      let avgArrivalOffset = null;
      if (event.doors_open) {
        const arrivalData = db.prepare(`
          SELECT AVG((julianday(s.scanned_at) - julianday(?)) * 24 * 60) as avg_offset
          FROM scans s JOIN tickets t ON s.ticket_id = t.id
          WHERE t.event_id = ? AND s.result = 'valid'
        `).get(event.doors_open, event.id);
        avgArrivalOffset = arrivalData.avg_offset !== null ? Math.round(arrivalData.avg_offset * 10) / 10 : null;
      }

      const sold = ttStats.sold || 0;
      const capacity = ttStats.total_capacity || 0;
      const checkedIn = ttStats.checked_in || 0;
      const noShows = ttStats.no_shows || 0;

      results.push({        id: event.id,        title: event.title,        date: event.date_time,        status: event.status,        sell_through: capacity > 0 ? Math.round((sold / capacity) * 1000) / 10 : 0,        checkin_rate: sold > 0 ? Math.round((checkedIn / sold) * 1000) / 10 : 0,        no_show_rate: (sold > 0 && new Date(event.date_time) < new Date()) ? Math.round((noShows / sold) * 1000) / 10 : 0,        add_on_uptake: addonStats.ticket_count > 0 ? Math.round((addonStats.addon_selections / addonStats.ticket_count) * 1000) / 10 : 0,        protection_claim_rate: protClaims.protected_orders > 0 ? Math.round((protClaims.claims / protClaims.protected_orders) * 1000) / 10 : 0,        avg_arrival_offset_mins: avgArrivalOffset      });    }    const totalEvents = results.length;    const avgCheckinRate = totalEvents > 0 ? Math.round(results.reduce((s, e) => s + e.checkin_rate, 0) / totalEvents * 10) / 10 : 0;    const avgSellThrough = totalEvents > 0 ? Math.round(results.reduce((s, e) => s + e.sell_through, 0) / totalEvents * 10) / 10 : 0;    const pastEvents = results.filter(e => new Date(e.date) < new Date());
    const avgNoShowRate = pastEvents.length > 0 ? Math.round(pastEvents.reduce((s, e) => s + e.no_show_rate, 0) / pastEvents.length * 10) / 10 : 0;    res.json({      events: results,      summary: { total_events: totalEvents, avg_checkin_rate: avgCheckinRate, avg_sell_through: avgSellThrough, avg_no_show_rate: avgNoShowRate }    });
  } catch (err) {
    console.error('Performance events error:', err);
    res.status(500).json({ error: 'Failed to load event performance' });
  }
});

// GET /api/admin/financials/overview — Financial overview across all events
router.get('/financials/overview', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN total ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN booking_fee ELSE 0 END), 0) as total_fees,
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN refund_amount ELSE 0 END), 0) as total_refunds,
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN protection_fee ELSE 0 END), 0) as total_protection_fees
      FROM orders
    `).get();

    const claimsPaid = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN refund_amount ELSE 0 END), 0) as total
      FROM protection_claims
    `).get();

    totals.total_protection_claims_paid = claimsPaid.total;
    totals.net_revenue = totals.total_revenue - totals.total_refunds;

    // Per event breakdown
    const perEvent = db.prepare(`
      SELECT e.id, e.title, e.date_time,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','refunded','comp') THEN o.total ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','refunded','comp') THEN o.booking_fee ELSE 0 END), 0) as fees,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','refunded','comp') THEN o.refund_amount ELSE 0 END), 0) as refunds,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','refunded','comp') THEN o.protection_fee ELSE 0 END), 0) as protection_revenue
      FROM events e
      LEFT JOIN orders o ON o.event_id = e.id
      GROUP BY e.id
      HAVING revenue > 0
      ORDER BY e.date_time DESC
    `).all();

    for (const evt of perEvent) {
      const evtClaims = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN pc.status = 'approved' THEN pc.refund_amount ELSE 0 END), 0) as paid
        FROM protection_claims pc
        WHERE pc.order_id IN (SELECT id FROM orders WHERE event_id = ?)
      `).get(evt.id);
      evt.claims_paid = evtClaims.paid;
      evt.net = evt.revenue - evt.refunds;
    }

    // Revenue by ticket type across all events
    const byTicketType = db.prepare(`
      SELECT tt.name, SUM(tt.price * sub.cnt) as revenue, SUM(sub.cnt) as sold
      FROM ticket_types tt
      JOIN (
        SELECT ticket_type_id, COUNT(*) as cnt FROM tickets WHERE status IN ('valid','used') GROUP BY ticket_type_id
      ) sub ON sub.ticket_type_id = tt.id
      GROUP BY tt.name
      ORDER BY revenue DESC
    `).all();

    // Avg order value by event
    const avgOrderByEvent = db.prepare(`
      SELECT e.title, COALESCE(AVG(o.total), 0) as avg_order_value, COUNT(o.id) as order_count
      FROM orders o JOIN events e ON o.event_id = e.id
      WHERE o.status = 'paid'
      GROUP BY e.id
      ORDER BY e.date_time DESC
    `).all();

    res.json({
      ...totals,
      per_event: perEvent,
      revenue_by_ticket_type: byTicketType,
      avg_order_by_event: avgOrderByEvent
    });
  } catch (err) {
    console.error('Financials overview error:', err);
    res.status(500).json({ error: 'Failed to load financial overview' });
  }
});

module.exports = router;
