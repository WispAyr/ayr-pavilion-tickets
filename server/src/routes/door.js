const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
// Door routes are open — designed for in-venue use on trusted local network

// GET /api/door/active-event — auto-detect current active event
router.get('/active-event', (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const twoHoursBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const endOfDay = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    // Find event: first try active now (within 2h before to 12h after), then fall back to next upcoming
    let event = db.prepare(`
      SELECT id, title, slug, date_time, doors_open, venue, capacity, status
      FROM events
      WHERE status IN ('on-sale', 'sold-out')
        AND date_time >= ? AND date_time <= ?
      ORDER BY date_time ASC
      LIMIT 1
    `).get(twoHoursBefore, endOfDay);

    if (!event) {
      // Fall back to next upcoming event
      event = db.prepare(`
        SELECT id, title, slug, date_time, doors_open, venue, capacity, status
        FROM events
        WHERE status IN ('on-sale', 'sold-out')
          AND date_time > ?
        ORDER BY date_time ASC
        LIMIT 1
      `).get(now.toISOString());
    }

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


// GET /api/door/skate-prep — get next skate event with size breakdown
router.get('/skate-prep', (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const twoHoursBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const endOfDay = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    // Find next event that HAS Skate Hire addons
    // Try active now first (within window), then upcoming
    let event = db.prepare(`
      SELECT DISTINCT e.id, e.title, e.slug, e.date_time, e.doors_open, e.venue, e.capacity, e.status
      FROM events e
      JOIN addons a ON a.event_id = e.id AND LOWER(a.name) LIKE '%skate%'
      WHERE e.status IN ('on-sale', 'sold-out')
        AND e.date_time >= ? AND e.date_time <= ?
      ORDER BY e.date_time ASC
      LIMIT 1
    `).get(twoHoursBefore, endOfDay);

    if (!event) {
      event = db.prepare(`
        SELECT DISTINCT e.id, e.title, e.slug, e.date_time, e.doors_open, e.venue, e.capacity, e.status
        FROM events e
        JOIN addons a ON a.event_id = e.id AND LOWER(a.name) LIKE '%skate%'
        WHERE e.status IN ('on-sale', 'sold-out')
          AND e.date_time > ?
        ORDER BY e.date_time ASC
        LIMIT 1
      `).get(now.toISOString());
    }

    if (!event) {
      return res.json({ event: null, expected: [], arrived: [] });
    }

    // Ticket stats
    const stats = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as checked_in
      FROM tickets
      WHERE event_id = ? AND status != 'cancelled' AND status != 'refunded'
    `).get(event.id);

    // EXPECTED: all skate sizes from orders (non-cancelled tickets)
    const expected = db.prepare(`
      SELECT oas.selected_option as size, COUNT(*) as count
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      JOIN tickets t ON oas.ticket_id = t.id
      WHERE a.event_id = ? AND LOWER(a.name) LIKE '%skate%'
        AND t.status != 'cancelled' AND t.status != 'refunded'
      GROUP BY oas.selected_option
      ORDER BY oas.selected_option
    `).all(event.id);

    // ARRIVED: skate sizes from checked-in tickets only
    const arrived = db.prepare(`
      SELECT oas.selected_option as size, COUNT(*) as count
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      JOIN tickets t ON oas.ticket_id = t.id
      WHERE a.event_id = ? AND LOWER(a.name) LIKE '%skate%'
        AND t.status = 'used'
      GROUP BY oas.selected_option
      ORDER BY oas.selected_option
    `).all(event.id);

    // Per-person skate list with handout status
    const people = db.prepare(`
      SELECT o.customer_name, oas.selected_option as skate_size, 
             t.id as ticket_id, t.status, t.checked_in_at, tt.name as ticket_type, t.holder_name,
             sh.id as handout_id, sh.handed_out_at, sh.handed_out_by, sh.returned_at, sh.returned_by
      FROM tickets t
      JOIN order_addon_selections oas ON oas.ticket_id = t.id
      JOIN addons a ON oas.addon_id = a.id
      JOIN orders o ON t.order_id = o.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      LEFT JOIN skate_handouts sh ON sh.ticket_id = t.id AND sh.event_id = a.event_id AND sh.returned_at IS NULL
      WHERE a.event_id = ? AND LOWER(a.name) LIKE '%skate%'
        AND t.status != 'cancelled' AND t.status != 'refunded'
      ORDER BY 
        CASE WHEN sh.id IS NOT NULL AND sh.returned_at IS NULL THEN 0
             WHEN t.status = 'used' THEN 1
             ELSE 2 END,
        t.checked_in_at DESC,
        o.customer_name ASC
    `).all(event.id);

    // Handout summary
    const handoutStats = db.prepare(`
      SELECT 
        COUNT(*) as total_handed_out,
        SUM(CASE WHEN returned_at IS NULL THEN 1 ELSE 0 END) as outstanding,
        SUM(CASE WHEN returned_at IS NOT NULL THEN 1 ELSE 0 END) as returned
      FROM skate_handouts WHERE event_id = ?
    `).get(event.id);

    res.json({
      event: {
        ...event,
        total_tickets: stats.total,
        checked_in: stats.checked_in,
      },
      expected,
      arrived,
      people,
      handoutStats: handoutStats || { total_handed_out: 0, outstanding: 0, returned: 0 },
    });
  } catch (err) {
    console.error('Error in skate-prep:', err);
    res.status(500).json({ error: 'Failed to get skate prep data' });
  }
});


// POST /api/door/skate-handout — hand out skates to a ticket
router.post('/skate-handout', (req, res) => {
  try {
    const db = getDb();
    const { ticket_id, event_id, skate_size, handed_out_by } = req.body;
    if (!ticket_id || !event_id || !skate_size) {
      return res.status(400).json({ error: 'ticket_id, event_id, and skate_size are required' });
    }
    // Check not already handed out without return
    const existing = db.prepare('SELECT id FROM skate_handouts WHERE ticket_id = ? AND event_id = ? AND returned_at IS NULL').get(ticket_id, event_id);
    if (existing) {
      return res.status(409).json({ error: 'Skates already handed out for this ticket', handout_id: existing.id });
    }
    const result = db.prepare('INSERT INTO skate_handouts (ticket_id, event_id, skate_size, handed_out_by) VALUES (?, ?, ?, ?)').run(ticket_id, event_id, skate_size, handed_out_by || 'Staff');
    res.json({ success: true, handout_id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error in skate-handout:', err);
    res.status(500).json({ error: 'Failed to record handout' });
  }
});

// POST /api/door/skate-return — return skates
router.post('/skate-return', (req, res) => {
  try {
    const db = getDb();
    const { handout_id, returned_by } = req.body;
    if (!handout_id) {
      return res.status(400).json({ error: 'handout_id is required' });
    }
    const handout = db.prepare('SELECT * FROM skate_handouts WHERE id = ?').get(handout_id);
    if (!handout) return res.status(404).json({ error: 'Handout not found' });
    if (handout.returned_at) return res.status(409).json({ error: 'Already returned' });
    db.prepare('UPDATE skate_handouts SET returned_at = datetime("now"), returned_by = ? WHERE id = ?').run(returned_by || 'Staff', handout_id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error in skate-return:', err);
    res.status(500).json({ error: 'Failed to record return' });
  }
});

// POST /api/door/skate-return-all — return all outstanding skates for an event
router.post('/skate-return-all', (req, res) => {
  try {
    const db = getDb();
    const { event_id, returned_by } = req.body;
    if (!event_id) return res.status(400).json({ error: 'event_id is required' });
    const result = db.prepare('UPDATE skate_handouts SET returned_at = datetime("now"), returned_by = ? WHERE event_id = ? AND returned_at IS NULL').run(returned_by || 'Staff', event_id);
    res.json({ success: true, count: result.changes });
  } catch (err) {
    console.error('Error in skate-return-all:', err);
    res.status(500).json({ error: 'Failed to return all' });
  }
});
module.exports = router;

// GET /api/door/event-report/:eventId — full printable event report (no auth, venue use)
router.get('/event-report/:eventId', (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Ticket types with counts
    const ticketTypes = db.prepare(`
      SELECT tt.name, tt.price, tt.quantity, tt.sold,
        (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'used') as checked_in,
        (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'valid') as valid,
        (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'cancelled') as cancelled,
        (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'refunded') as refunded
      FROM ticket_types tt WHERE tt.event_id = ? ORDER BY tt.sort_order, tt.name
    `).all(eventId);

    // All orders for this event
    const orders = db.prepare(`
      SELECT o.id, o.order_ref, o.customer_name, o.customer_email, o.customer_phone,
             o.total, o.booking_fee, o.status, o.refund_amount, o.created_at
      FROM orders o
      WHERE o.event_id = ? AND o.status != 'abandoned'
      ORDER BY o.created_at ASC
    `).all(eventId);

    // All tickets with addon selections
    const tickets = db.prepare(`
      SELECT t.id as ticket_id, t.code, t.status, t.checked_in_at, t.holder_name,
             o.order_ref, o.customer_name, o.customer_email, o.customer_phone,
             tt.name as ticket_type, tt.price as ticket_price,
             oas.selected_option as addon_selection,
             a.name as addon_name
      FROM tickets t
      JOIN orders o ON t.order_id = o.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      LEFT JOIN order_addon_selections oas ON oas.ticket_id = t.id
      LEFT JOIN addons a ON oas.addon_id = a.id
      WHERE t.event_id = ?
      ORDER BY o.customer_name ASC, t.id ASC
    `).all(eventId);

    // Revenue summary
    const revenue = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status = 'paid' THEN booking_fee ELSE 0 END) as total_fees,
        SUM(refund_amount) as total_refunds,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_orders
      FROM orders WHERE event_id = ? AND status != 'abandoned'
    `).get(eventId);

    // Skate size summary (if applicable)
    const skateSizes = db.prepare(`
      SELECT oas.selected_option as size, COUNT(*) as count
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      JOIN tickets t ON oas.ticket_id = t.id
      WHERE a.event_id = ? AND LOWER(a.name) LIKE '%skate%'
        AND t.status != 'cancelled' AND t.status != 'refunded'
      GROUP BY oas.selected_option
      ORDER BY oas.selected_option
    `).all(eventId);

    // Group tickets by customer for the manifest
    const customerMap = new Map();
    for (const t of tickets) {
      const key = t.order_ref;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          order_ref: t.order_ref,
          customer_name: t.customer_name,
          customer_email: t.customer_email,
          customer_phone: t.customer_phone,
          tickets: []
        });
      }
      customerMap.get(key).tickets.push({
        ticket_id: t.ticket_id,
        code: t.code,
        status: t.status,
        checked_in_at: t.checked_in_at,
        holder_name: t.holder_name,
        ticket_type: t.ticket_type,
        ticket_price: t.ticket_price,
        addon_name: t.addon_name,
        addon_selection: t.addon_selection,
      });
    }

    const generatedAt = new Date().toISOString();

    res.json({
      generated_at: generatedAt,
      event,
      ticketTypes,
      revenue,
      orders,
      skateSizes,
      manifest: Array.from(customerMap.values()),
      totalTickets: tickets.filter(t => t.status !== 'cancelled' && t.status !== 'refunded').length,
      totalCheckedIn: tickets.filter(t => t.status === 'used').length,
    });
  } catch (err) {
    console.error('Error generating event report:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});
