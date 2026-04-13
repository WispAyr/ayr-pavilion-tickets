const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { scannerAuth } = require('../middleware/auth');

// WebSocket broadcast helper — set by index.js after WS server is created
let broadcastScan = () => {};
router.setBroadcast = (fn) => { broadcastScan = fn; };

// POST /api/scan/validate - validate scanner PIN against DB
router.post('/validate', (req, res) => {
  const db = getDb();
  const { pin } = req.body;

  if (!pin) {
    return res.status(401).json({ valid: false, error: 'Invalid PIN' });
  }

  // Check DB first
  const user = db.prepare('SELECT id, name, pin FROM scanner_users WHERE pin = ? AND active = 1').get(pin);
  if (user) {
    return res.json({ valid: true, user: { id: user.id, name: user.name } });
  }

  // Fallback to env var
  const expectedPin = process.env.SCANNER_PIN || '1234';
  if (pin === expectedPin) {
    return res.json({ valid: true, user: { id: 0, name: 'Default' } });
  }

  res.status(401).json({ valid: false, error: 'Invalid PIN' });
});

// POST /api/scan - scan a ticket code
router.post('/', scannerAuth, (req, res) => {
  try {
    const db = getDb();
    let { code, device_id } = req.body;
    const scanned_by = req.scannerUser ? req.scannerUser.name : (req.body.scanned_by || null);

    if (!code) {
      return res.status(400).json({ result: 'error', message: 'No ticket code provided' });
    }

    // Extract ticket code from URL if a full URL was scanned
    try {
      const url = new URL(code);
      const parts = url.pathname.split('/');
      const ticketsIdx = parts.indexOf('tickets');
      if (ticketsIdx !== -1 && parts[ticketsIdx + 1]) {
        code = decodeURIComponent(parts[ticketsIdx + 1]);
      }
    } catch {
      // Not a URL, use as-is
    }

    const expected_event_id = req.body.expected_event_id ? parseInt(req.body.expected_event_id, 10) : null;
    console.log(`[SCAN] Code received: ${code}, expected event: ${expected_event_id || "any"}`);

    const ticket = db.prepare(`
      SELECT
        t.id, t.code, t.status, t.holder_name, t.checked_in_at, t.event_id,
        e.title AS event_title, e.date_time, e.venue,
        tt.name AS ticket_type_name,
        o.customer_name, o.order_ref
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN orders o ON t.order_id = o.id
      WHERE t.code = ?
    `).get(code);

    if (!ticket) {
      db.prepare(`
        INSERT INTO scans (ticket_id, result, scanned_by, device_id)
        VALUES (0, 'invalid', ?, ?)
      `).run(scanned_by || null, device_id || null);

      broadcastScan({ result: 'invalid', message: 'Ticket not found', scanner: scanned_by, device_id: device_id || null, timestamp: new Date().toISOString() });

      return res.json({
        result: 'invalid',
        message: 'Ticket not found'
      });
    }

    if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
      db.prepare(`
        INSERT INTO scans (ticket_id, result, scanned_by, device_id)
        VALUES (?, 'invalid', ?, ?)
      `).run(ticket.id, scanned_by || null, device_id || null);

      broadcastScan({ result: 'invalid', ticket_id: ticket.id, customer_name: ticket.holder_name || ticket.customer_name, ticket_type: ticket.ticket_type_name, event: ticket.event_title, scanner: scanned_by, device_id: device_id || null, timestamp: new Date().toISOString() });

      return res.json({
        result: 'invalid',
        message: `Ticket has been ${ticket.status}`,
        ticket: {
          holder_name: ticket.holder_name || ticket.customer_name,
          ticket_type: ticket.ticket_type_name,
          event: ticket.event_title
        }
      });
    }

    if (ticket.status === 'used') {
      db.prepare(`
        INSERT INTO scans (ticket_id, result, scanned_by, device_id)
        VALUES (?, 'already_used', ?, ?)
      `).run(ticket.id, scanned_by || null, device_id || null);

      broadcastScan({ result: 'already_used', ticket_id: ticket.id, customer_name: ticket.holder_name || ticket.customer_name, ticket_type: ticket.ticket_type_name, event: ticket.event_title, scanner: scanned_by, device_id: device_id || null, timestamp: new Date().toISOString() });

      return res.json({
        result: 'already_used',
        message: 'Ticket has already been scanned',
        checked_in_at: ticket.checked_in_at,
        ticket: {
          holder_name: ticket.holder_name || ticket.customer_name,
          ticket_type: ticket.ticket_type_name,
          event: ticket.event_title,
          order_ref: ticket.order_ref
        }
      });
    }

    // Valid ticket - mark as used
    db.prepare(`
      UPDATE tickets SET status = 'used', checked_in_at = datetime('now') WHERE id = ?
    `).run(ticket.id);

    db.prepare(`
      INSERT INTO scans (ticket_id, result, scanned_by, device_id)
      VALUES (?, 'valid', ?, ?)
    `).run(ticket.id, scanned_by || null, device_id || null);

    // Look up skate size addon for this ticket's order
    const skateAddon = db.prepare(`
      SELECT oas.selected_option, a.name AS addon_name
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      WHERE oas.order_id = (SELECT order_id FROM tickets WHERE id = ?)
        AND (LOWER(a.name) LIKE '%skate%' OR LOWER(a.name) LIKE '%shoe%' OR LOWER(a.name) LIKE '%boot%')
      LIMIT 1
    `).get(ticket.id);

    broadcastScan({
      result: 'valid',
      ticket_id: ticket.id,
      customer_name: ticket.holder_name || ticket.customer_name,
      ticket_type: ticket.ticket_type_name,
      event: ticket.event_title,
      event_id: ticket.event_id,
      order_ref: ticket.order_ref,
      scanner: scanned_by,
      device_id: device_id || null,
      skate_size: skateAddon ? skateAddon.selected_option : null,
      skate_addon_name: skateAddon ? skateAddon.addon_name : null,
      timestamp: new Date().toISOString()
    });

    const wrongEvent = expected_event_id && ticket.event_id !== expected_event_id;

    res.json({
      result: 'valid',
      message: wrongEvent ? 'Valid ticket but WRONG SESSION' : 'Ticket verified - entry granted',
      wrong_event: wrongEvent || false,
      ticket: {
        holder_name: ticket.holder_name || ticket.customer_name,
        ticket_type: ticket.ticket_type_name,
        event: ticket.event_title,
        event_id: ticket.event_id,
        order_ref: ticket.order_ref,
        venue: ticket.venue,
        date_time: ticket.date_time
      }
    });
  } catch (err) {
    console.error('Error scanning ticket:', err);
    res.status(500).json({ result: 'error', message: 'Scan failed' });
  }
});

// GET /api/scan/stats/:eventId - scan statistics for an event
router.get('/stats/:eventId', scannerAuth, (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const event = db.prepare('SELECT id, title FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const totalTickets = db.prepare(
      "SELECT COUNT(*) as count FROM tickets WHERE event_id = ? AND status != 'cancelled' AND status != 'refunded'"
    ).get(eventId);

    const checkedIn = db.prepare(
      "SELECT COUNT(*) as count FROM tickets WHERE event_id = ? AND status = 'used'"
    ).get(eventId);

    const byType = db.prepare(`
      SELECT tt.name, COUNT(t.id) as total,
        SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as checked_in
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.event_id = ? AND t.status != 'cancelled' AND t.status != 'refunded'
      GROUP BY tt.id, tt.name
    `).all(eventId);

    const recentScans = db.prepare(`
      SELECT s.scanned_at, s.result, s.scanned_by,
        t.code, t.holder_name,
        o.customer_name
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      JOIN orders o ON t.order_id = o.id
      WHERE t.event_id = ?
      ORDER BY s.scanned_at DESC
      LIMIT 20
    `).all(eventId);

    res.json({
      event: event.title,
      total_tickets: totalTickets.count,
      checked_in: checkedIn.count,
      remaining: totalTickets.count - checkedIn.count,
      percentage: totalTickets.count > 0 ? Math.round((checkedIn.count / totalTickets.count) * 100) : 0,
      by_type: byType,
      recent_scans: recentScans
    });
  } catch (err) {
    console.error('Error fetching scan stats:', err);
    res.status(500).json({ error: 'Failed to fetch scan statistics' });
  }
});


// GET /api/scan/current-event — auto-detect the current or next event
router.get("/current-event", scannerAuth, (req, res) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    // 1. Find event currently in progress (doors_open <= now <= date_time + 4 hours)
    const current = db.prepare(`
      SELECT id, title, date_time, doors_open, venue, status
      FROM events
      WHERE status IN ('on-sale', 'sold-out')
        AND datetime(COALESCE(doors_open, date_time)) <= datetime(?)
        AND datetime(date_time, '+4 hours') >= datetime(?)
      ORDER BY date_time ASC
      LIMIT 1
    `).get(now, now);

    if (current) {
      return res.json({ event: current, mode: "live", message: "Event in progress" });
    }

    // 2. Find next upcoming event (doors within the next 2 hours, or just the next event)
    const upcoming = db.prepare(`
      SELECT id, title, date_time, doors_open, venue, status
      FROM events
      WHERE status IN ('on-sale', 'sold-out')
        AND datetime(date_time) > datetime(?)
      ORDER BY date_time ASC
      LIMIT 1
    `).get(now);

    if (upcoming) {
      const doorsTime = new Date(upcoming.doors_open || upcoming.date_time);
      const hoursUntilDoors = (doorsTime - new Date()) / (1000 * 60 * 60);
      const mode = hoursUntilDoors <= 2 ? "pre-event" : "upcoming";
      return res.json({ event: upcoming, mode, message: mode === "pre-event" ? "Doors opening soon" : "Next scheduled event" });
    }

    res.json({ event: null, mode: "none", message: "No upcoming events" });
  } catch (err) {
    console.error("Current event error:", err);
    res.status(500).json({ error: "Failed to detect current event" });
  }
});

// GET /api/scan/test-codes — returns dummy test codes for scanner testing
router.get("/test-codes", (req, res) => {
  try {
    const db = getDb();
    const valid = db.prepare(`
      SELECT t.code, t.status, tt.name as type, e.title as event
      FROM tickets t JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON t.event_id = e.id
      WHERE t.status = ?
      ORDER BY RANDOM() LIMIT 4
    `).all("valid");
    const used = db.prepare(`
      SELECT t.code, t.status, tt.name as type, e.title as event
      FROM tickets t JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON t.event_id = e.id
      WHERE t.status = ?
      ORDER BY RANDOM() LIMIT 2
    `).all("used");
    res.json({ valid, used, invalid: "TEST-INVALID-" + Date.now().toString(36).toUpperCase() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch test codes" });
  }
});

module.exports = router;
