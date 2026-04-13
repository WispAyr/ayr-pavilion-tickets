const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');

// GET /api/admin/stats/overview
router.get('/overview', adminAuth, (req, res) => {
  try {
    const db = getDb();

    // Core metrics
    const revenue = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'paid'").get();
    const refunds = db.prepare("SELECT COALESCE(SUM(refund_amount), 0) as total, COUNT(CASE WHEN refund_amount > 0 THEN 1 END) as count FROM orders").get();
    const orders = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='paid' THEN 1 END) as paid, COUNT(CASE WHEN status='pending' THEN 1 END) as pending, COUNT(CASE WHEN status='refunded' THEN 1 END) as refunded, COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled FROM orders").get();
    const tickets = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='valid' THEN 1 END) as valid, COUNT(CASE WHEN status='used' THEN 1 END) as used, COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled, COUNT(CASE WHEN status='refunded' THEN 1 END) as refunded FROM tickets").get();
    const events = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='on-sale' THEN 1 END) as on_sale, COUNT(CASE WHEN status='sold-out' THEN 1 END) as sold_out, COUNT(CASE WHEN status='completed' THEN 1 END) as completed FROM events").get();
    const scans = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN result='valid' THEN 1 END) as success, COUNT(CASE WHEN result='already_used' THEN 1 END) as already_used, COUNT(CASE WHEN result='invalid' THEN 1 END) as invalid FROM scans").get();

    // Avg order value
    const avgOrder = db.prepare("SELECT COALESCE(AVG(total), 0) as avg FROM orders WHERE status = 'paid'").get();

    // Booking fees collected
    const fees = db.prepare("SELECT COALESCE(SUM(booking_fee), 0) as total FROM orders WHERE status = 'paid'").get();

    // Today's numbers
    const today = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM orders WHERE status='paid' AND date(created_at) = date('now')) as orders,
        (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status='paid' AND date(created_at) = date('now')) as revenue,
        (SELECT COUNT(*) FROM tickets WHERE status='used' AND date(checked_in_at) = date('now')) as checkins,
        (SELECT COUNT(*) FROM scans WHERE date(scanned_at) = date('now')) as scans
    `).get();

    res.json({
      revenue: { gross: revenue.total, net: revenue.total - refunds.total, refunded: refunds.total, refund_count: refunds.count, fees: fees.total, avg_order: Math.round(avgOrder.avg) },
      orders,
      tickets,
      events,
      scans,
      today
    });
  } catch (err) {
    console.error('Stats overview error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/admin/stats/revenue-chart?days=30
router.get('/revenue-chart', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    const data = db.prepare(`
      SELECT date(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(SUM(CASE WHEN refund_amount > 0 THEN refund_amount ELSE 0 END), 0) as refunds
      FROM orders WHERE status IN ('paid','refunded')
        AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(days);

    res.json(data);
  } catch (err) {
    console.error('Revenue chart error:', err);
    res.status(500).json({ error: 'Failed to load chart' });
  }
});

// GET /api/admin/stats/by-event
router.get('/by-event', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT e.id, e.title, e.date_time, e.status, e.capacity,
        COALESCE(os.order_count, 0) as order_count,
        COALESCE(os.revenue, 0) as revenue,
        COALESCE(ts.tickets_sold, 0) as tickets_sold,
        COALESCE(ts.checked_in, 0) as checked_in,
        COALESCE(os.refunded, 0) as refunded
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*) as order_count, SUM(total) as revenue, SUM(refund_amount) as refunded
        FROM orders WHERE status IN ('paid','refunded')
        GROUP BY event_id
      ) os ON os.event_id = e.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as tickets_sold, COUNT(CASE WHEN status='used' THEN 1 END) as checked_in
        FROM tickets WHERE status IN ('valid','used')
        GROUP BY event_id
      ) ts ON ts.event_id = e.id
      ORDER BY e.date_time DESC
    `).all();

    res.json(data);
  } catch (err) {
    console.error('By-event error:', err);
    res.status(500).json({ error: 'Failed to load event stats' });
  }
});

// GET /api/admin/stats/ticket-types
router.get('/ticket-types', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT tt.name, tt.price, e.title as event_title,
        COUNT(t.id) as sold,
        tt.quantity as available,
        COUNT(CASE WHEN t.status='used' THEN 1 END) as used
      FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.status IN ('valid','used')
      GROUP BY tt.id
      ORDER BY e.date_time DESC, tt.sort_order
    `).all();

    res.json(data);
  } catch (err) {
    console.error('Ticket types error:', err);
    res.status(500).json({ error: 'Failed to load ticket type stats' });
  }
});

// GET /api/admin/stats/scans-timeline?days=30
router.get('/scans-timeline', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    const data = db.prepare(`
      SELECT date(scanned_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN result='valid' THEN 1 END) as success,
        COUNT(CASE WHEN result='already_used' THEN 1 END) as duplicate,
        COUNT(CASE WHEN result='invalid' THEN 1 END) as invalid
      FROM scans
      WHERE scanned_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(scanned_at)
      ORDER BY date ASC
    `).all(days);

    res.json(data);
  } catch (err) {
    console.error('Scans timeline error:', err);
    res.status(500).json({ error: 'Failed to load scans timeline' });
  }
});

// GET /api/admin/stats/scanner-leaderboard
router.get('/scanner-leaderboard', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT s.scanned_by as name,
        COUNT(*) as total_scans,
        COUNT(CASE WHEN s.result='valid' THEN 1 END) as successful,
        MIN(s.scanned_at) as first_scan,
        MAX(s.scanned_at) as last_scan
      FROM scans s
      WHERE s.scanned_by IS NOT NULL AND s.scanned_by != ''
      GROUP BY s.scanned_by
      ORDER BY total_scans DESC
    `).all();

    res.json(data);
  } catch (err) {
    console.error('Scanner leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// GET /api/admin/stats/emails
router.get('/emails', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status='failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status='queued' THEN 1 END) as queued,
        COALESCE(SUM(opened_count), 0) as total_opens,
        COUNT(CASE WHEN opened_count > 0 THEN 1 END) as unique_opens,
        COALESCE(SUM(clicked_count), 0) as total_clicks,
        COUNT(CASE WHEN clicked_count > 0 THEN 1 END) as unique_clicks
      FROM email_logs
    `).get();

    res.json(data);
  } catch (err) {
    console.error('Email stats error:', err);
    res.status(500).json({ error: 'Failed to load email stats' });
  }
});

// GET /api/admin/stats/hourly-pattern
router.get('/hourly-pattern', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const purchases = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
      FROM orders WHERE status = 'paid'
      GROUP BY hour ORDER BY hour
    `).all();

    const checkins = db.prepare(`
      SELECT CAST(strftime('%H', scanned_at) AS INTEGER) as hour, COUNT(*) as count
      FROM scans WHERE result = 'success'
      GROUP BY hour ORDER BY hour
    `).all();

    res.json({ purchases, checkins });
  } catch (err) {
    console.error('Hourly pattern error:', err);
    res.status(500).json({ error: 'Failed to load hourly patterns' });
  }
});

module.exports = router;

// GET /api/admin/stats/event/:eventId — Full event operations view
router.get('/event/:eventId', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const eventId = req.params.eventId;

    // Event info
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Ticket types with sales
    const ticketTypes = db.prepare(`
      SELECT tt.*,
        COUNT(t.id) as sold,
        COUNT(CASE WHEN t.status='used' THEN 1 END) as checked_in,
        COUNT(CASE WHEN t.status='cancelled' THEN 1 END) as cancelled
      FROM ticket_types tt
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.status IN ('valid','used','cancelled')
      WHERE tt.event_id = ?
      GROUP BY tt.id
      ORDER BY tt.sort_order
    `).all(eventId);

    // Orders summary
    const orders = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status='paid' THEN 1 END) as paid,
        COUNT(CASE WHEN status='pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status='refunded' THEN 1 END) as refunded,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END), 0) as revenue,
        COALESCE(SUM(booking_fee), 0) as total_fees,
        COALESCE(SUM(refund_amount), 0) as total_refunds
      FROM orders WHERE event_id = ?
    `).get(eventId);

    // Recent orders
    const recentOrders = db.prepare(`
      SELECT o.id, o.order_ref, o.customer_name, o.customer_email, o.total, o.status, o.created_at,
        COUNT(t.id) as ticket_count
      FROM orders o
      LEFT JOIN tickets t ON t.order_id = o.id AND t.status IN ('valid','used')
      WHERE o.event_id = ? AND o.status = 'paid'
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 20
    `).all(eventId);

    // Addons — aggregate selections per addon
    const addons = db.prepare(`
      SELECT a.id, a.name, a.type, a.price, a.per_ticket
      FROM addons a
      WHERE a.event_id = ? AND a.active = 1
      ORDER BY a.sort_order
    `).all(eventId);

    // For each addon, get option-level breakdown
    for (const addon of addons) {
      if (addon.type === 'select') {
        // Get options with stock and reservation counts
        addon.options = db.prepare(`
          SELECT ao.id, ao.label, ao.stock,
            COUNT(oas.id) as reserved
          FROM addon_options ao
          LEFT JOIN order_addon_selections oas ON oas.addon_option_id = ao.id
            AND oas.addon_id = ?
          WHERE ao.addon_id = ? AND ao.active = 1
          GROUP BY ao.id
          ORDER BY ao.sort_order
        `).all(addon.id, addon.id);

        addon.total_reserved = addon.options.reduce((s, o) => s + o.reserved, 0);
        addon.total_stock = addon.options.reduce((s, o) => s + o.stock, 0);
      } else if (addon.type === 'checkbox') {
        const sel = db.prepare(`
          SELECT COUNT(*) as count FROM order_addon_selections
          WHERE addon_id = ? AND quantity > 0
        `).get(addon.id);
        addon.selected_count = sel.count;
      } else if (addon.type === 'quantity') {
        const sel = db.prepare(`
          SELECT COALESCE(SUM(quantity), 0) as total FROM order_addon_selections
          WHERE addon_id = ?
        `).get(addon.id);
        addon.total_quantity = sel.total;
      }
    }

    // Check-in stats
    const checkins = db.prepare(`
      SELECT
        COUNT(CASE WHEN t.status='used' THEN 1 END) as checked_in,
        COUNT(CASE WHEN t.status='valid' THEN 1 END) as remaining,
        COUNT(CASE WHEN t.status IN ('valid','used') THEN 1 END) as total
      FROM tickets t WHERE t.event_id = ?
    `).get(eventId);

    // Sales timeline (orders per hour for this event)
    const timeline = db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00', created_at) as hour,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      WHERE event_id = ? AND status = 'paid'
      GROUP BY hour
      ORDER BY hour ASC
    `).all(eventId);

    res.json({
      event,
      ticketTypes,
      orders,
      recentOrders,
      addons,
      checkins,
      timeline
    });
  } catch (err) {
    console.error('Event stats error:', err.message);
    res.status(500).json({ error: 'Failed to load event stats' });
  }
});
