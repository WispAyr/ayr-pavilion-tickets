const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');
const { createRefund } = require('../services/stripe');
const { resendEmail } = require('../services/email');

// POST /api/admin/login - authenticate admin
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';

    if (username !== adminUsername || password !== adminPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    res.json({ token, username, expiresIn: '24h' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
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
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'Order is not in a refundable state' });
    }

    if (!order.stripe_payment_intent) {
      return res.status(400).json({ error: 'No payment intent found for this order' });
    }

    const { amount } = req.body;
    const refundAmount = amount || null; // null = full refund

    const refund = await createRefund(order.stripe_payment_intent, refundAmount);

    // If full refund, update order and tickets
    if (!refundAmount || refundAmount >= order.total) {
      db.prepare("UPDATE orders SET status = 'refunded', updated_at = datetime('now') WHERE id = ?").run(order.id);
      db.prepare("UPDATE tickets SET status = 'refunded' WHERE order_id = ?").run(order.id);

      // Restore sold counts
      const orderTickets = db.prepare(`
        SELECT ticket_type_id, COUNT(*) as count FROM tickets WHERE order_id = ? GROUP BY ticket_type_id
      `).all(order.id);

      for (const t of orderTickets) {
        db.prepare('UPDATE ticket_types SET sold = MAX(0, sold - ?) WHERE id = ?').run(t.count, t.ticket_type_id);
      }
    }

    res.json({ message: 'Refund initiated', refund_id: refund.id, status: refund.status });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Failed to process refund' });
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

module.exports = router;
