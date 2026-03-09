const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { scannerAuth } = require('../middleware/auth');

// POST /api/scan/validate - validate scanner PIN
router.post('/validate', (req, res) => {
  const { pin } = req.body;
  const expectedPin = process.env.SCANNER_PIN || '1234';

  if (!pin || pin !== expectedPin) {
    return res.status(401).json({ valid: false, error: 'Invalid PIN' });
  }

  res.json({ valid: true });
});

// POST /api/scan - scan a ticket code
router.post('/', scannerAuth, (req, res) => {
  try {
    const db = getDb();
    const { code, scanned_by } = req.body;

    if (!code) {
      return res.status(400).json({ result: 'error', message: 'No ticket code provided' });
    }

    const ticket = db.prepare(`
      SELECT
        t.id, t.code, t.status, t.holder_name, t.checked_in_at,
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
        INSERT INTO scans (ticket_id, result, scanned_by)
        VALUES (0, 'invalid', ?)
      `).run(scanned_by || null);

      return res.json({
        result: 'invalid',
        message: 'Ticket not found'
      });
    }

    if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
      db.prepare(`
        INSERT INTO scans (ticket_id, result, scanned_by)
        VALUES (?, 'invalid', ?)
      `).run(ticket.id, scanned_by || null);

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
        INSERT INTO scans (ticket_id, result, scanned_by)
        VALUES (?, 'already_used', ?)
      `).run(ticket.id, scanned_by || null);

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
      INSERT INTO scans (ticket_id, result, scanned_by)
      VALUES (?, 'valid', ?)
    `).run(ticket.id, scanned_by || null);

    res.json({
      result: 'valid',
      message: 'Ticket verified - entry granted',
      ticket: {
        holder_name: ticket.holder_name || ticket.customer_name,
        ticket_type: ticket.ticket_type_name,
        event: ticket.event_title,
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

module.exports = router;
