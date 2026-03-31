const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { scannerAuth } = require('../middleware/auth');

// All door routes require scanner PIN auth
router.use(scannerAuth);

// GET /api/door/active-event — auto-detect current active event
router.get('/active-event', (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const twoHoursBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const endOfDay = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    // Find event whose date_time is within 2 hours before now or is happening now (up to 12h after start)
    const event = db.prepare(`
      SELECT id, title, slug, date_time, doors_open, venue, capacity, status
      FROM events
      WHERE status IN ('on-sale', 'sold-out')
        AND date_time >= ? AND date_time <= ?
      ORDER BY date_time ASC
      LIMIT 1
    `).get(twoHoursBefore, endOfDay);

    if (!event) {
      return res.json({ event: null });
    }

    // Get ticket stats
    const stats = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as checked_in
      FROM tickets
      WHERE event_id = ? AND status != 'cancelled' AND status != 'refunded'
    `).get(event.id);

    const byType = db.prepare(`
      SELECT tt.name, COUNT(t.id) as total,
        SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as checked_in
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.event_id = ? AND t.status != 'cancelled' AND t.status != 'refunded'
      GROUP BY tt.id, tt.name
    `).all(event.id);

    res.json({
      event: {
        ...event,
        total_tickets: stats.total,
        checked_in: stats.checked_in,
        by_type: byType
      }
    });
  } catch (err) {
    console.error('Error finding active event:', err);
    res.status(500).json({ error: 'Failed to find active event' });
  }
});

// GET /api/door/search?q=...&event_id=... — search customers across event family
router.get('/search', (req, res) => {
  try {
    const db = getDb();
    const { q, event_id } = req.query;

    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }

    const searchTerm = `%${q}%`;

    let eventFilter = '';
    let eventParams = [];

    if (event_id) {
      // Get the current event to find its family (same slug prefix or same date)
      const currentEvent = db.prepare('SELECT id, slug, date_time FROM events WHERE id = ?').get(event_id);
      if (currentEvent) {
        const slugBase = currentEvent.slug.replace(/-\d+$/, '').replace(/-(?:am|pm|morning|afternoon|evening|early|late)$/i, '');
        const eventDate = currentEvent.date_time.split('T')[0];
        // Find all events with similar slug or same date
        const familyEvents = db.prepare(`
          SELECT id FROM events WHERE slug LIKE ? OR date_time LIKE ?
        `).all(`${slugBase}%`, `${eventDate}%`);
        const familyIds = familyEvents.map(e => e.id);
        if (familyIds.length > 0) {
          eventFilter = `AND t.event_id IN (${familyIds.map(() => '?').join(',')})`;
          eventParams = familyIds;
        }
      }
    }

    const results = db.prepare(`
      SELECT
        t.id AS ticket_id, t.code, t.status, t.checked_in_at, t.holder_name,
        t.event_id, t.ticket_type_id,
        e.title AS event_title, e.date_time AS event_date_time, e.slug AS event_slug,
        tt.name AS ticket_type_name,
        o.customer_name, o.customer_email, o.order_ref
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN orders o ON t.order_id = o.id
      WHERE (LOWER(o.customer_name) LIKE LOWER(?) OR LOWER(o.customer_email) LIKE LOWER(?))
        AND t.status != 'cancelled' AND t.status != 'refunded'
        ${eventFilter}
      ORDER BY e.date_time ASC, o.customer_name ASC
      LIMIT 50
    `).all(searchTerm, searchTerm, ...eventParams);

    res.json({ results });
  } catch (err) {
    console.error('Error searching door:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/door/transfer — transfer ticket to different session
router.post('/transfer', (req, res) => {
  try {
    const db = getDb();
    const { ticket_id, to_event_id, reason, force } = req.body;
    const transferred_by = req.scannerUser ? req.scannerUser.name : 'Unknown';

    if (!ticket_id || !to_event_id) {
      return res.status(400).json({ error: 'ticket_id and to_event_id are required' });
    }

    // Get the ticket
    const ticket = db.prepare(`
      SELECT t.id, t.event_id, t.ticket_type_id, t.status, tt.name AS ticket_type_name
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = ?
    `).get(ticket_id);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.event_id === to_event_id) {
      return res.status(400).json({ error: 'Ticket is already in this session' });
    }

    // Get the target event
    const targetEvent = db.prepare('SELECT id, title, capacity, status FROM events WHERE id = ?').get(to_event_id);
    if (!targetEvent) {
      return res.status(404).json({ error: 'Target event not found' });
    }

    // Check capacity - count non-cancelled/refunded tickets for target event
    const targetCount = db.prepare(`
      SELECT COUNT(*) as count FROM tickets
      WHERE event_id = ? AND status != 'cancelled' AND status != 'refunded'
    `).get(to_event_id);

    const isFull = targetEvent.capacity && targetCount.count >= targetEvent.capacity;

    if (isFull && !force) {
      return res.status(409).json({
        error: 'Target session is at capacity',
        capacity: targetEvent.capacity,
        current_count: targetCount.count,
        requires_override: true
      });
    }

    // Find matching ticket type in target event
    const targetTicketType = db.prepare(`
      SELECT id FROM ticket_types WHERE event_id = ? AND name = ?
    `).get(to_event_id, ticket.ticket_type_name);

    if (!targetTicketType) {
      return res.status(400).json({ error: `No matching ticket type "${ticket.ticket_type_name}" in target session` });
    }

    const fromEventId = ticket.event_id;

    // Perform transfer in a transaction
    const transfer = db.transaction(() => {
      // Update ticket to new event + ticket type, reset check-in status
      db.prepare(`
        UPDATE tickets SET event_id = ?, ticket_type_id = ?, status = 'valid', checked_in_at = NULL WHERE id = ?
      `).run(to_event_id, targetTicketType.id, ticket_id);

      // Update sold counts
      db.prepare('UPDATE ticket_types SET sold = MAX(0, sold - 1) WHERE id = ?').run(ticket.ticket_type_id);
      db.prepare('UPDATE ticket_types SET sold = sold + 1 WHERE id = ?').run(targetTicketType.id);

      // Audit log
      db.prepare(`
        INSERT INTO session_transfers (ticket_id, from_event_id, to_event_id, transferred_by, reason, capacity_override)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(ticket_id, fromEventId, to_event_id, transferred_by, reason || null, isFull ? 1 : 0);
    });

    transfer();

    res.json({
      success: true,
      message: `Ticket transferred to ${targetEvent.title}`,
      capacity_override: isFull
    });
  } catch (err) {
    console.error('Error transferring ticket:', err);
    res.status(500).json({ error: 'Transfer failed' });
  }
});

// GET /api/door/recent-scans/:eventId — recent scan feed
router.get('/recent-scans/:eventId', (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const scans = db.prepare(`
      SELECT s.id, s.scanned_at, s.result, s.scanned_by, s.device_id,
        t.id AS ticket_id, t.holder_name, t.code,
        tt.name AS ticket_type_name,
        o.customer_name, o.order_ref
      FROM scans s
      LEFT JOIN tickets t ON s.ticket_id = t.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      LEFT JOIN orders o ON t.order_id = o.id
      WHERE (t.event_id = ? OR s.ticket_id = 0)
      ORDER BY s.scanned_at DESC
      LIMIT 50
    `).all(eventId);

    res.json({ scans });
  } catch (err) {
    console.error('Error fetching recent scans:', err);
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
});

module.exports = router;
