const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { generateQrBuffer } = require('../services/qr');

// GET /api/tickets/:code - get ticket details by code (public)
router.get('/:code', (req, res) => {
  try {
    const db = getDb();
    const { code } = req.params;

    const ticket = db.prepare(`
      SELECT
        t.id, t.code, t.holder_name, t.status, t.checked_in_at, t.created_at,
        e.title AS event_title, e.slug AS event_slug, e.date_time, e.doors_open,
        e.venue, e.description AS event_description, e.hero_image,
        tt.name AS ticket_type_name, tt.price AS ticket_price,
        o.order_ref, o.customer_name, o.customer_email
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN orders o ON t.order_id = o.id
      WHERE t.code = ?
    `).get(code);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Fetch addon selections for this ticket
    const addonSelections = db.prepare(`
      SELECT oas.*, a.name as addon_name, a.type as addon_type
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      WHERE oas.ticket_id = (SELECT id FROM tickets WHERE code = ?)
         OR (oas.order_id = (SELECT order_id FROM tickets WHERE code = ?) AND oas.ticket_id IS NULL)
    `).all(code, code);

    res.json({
      code: ticket.code,
      status: ticket.status,
      holder_name: ticket.holder_name || ticket.customer_name,
      checked_in_at: ticket.checked_in_at,
      order_ref: ticket.order_ref,
      event: {
        title: ticket.event_title,
        slug: ticket.event_slug,
        date_time: ticket.date_time,
        doors_open: ticket.doors_open,
        venue: ticket.venue,
        description: ticket.event_description,
        hero_image: ticket.hero_image
      },
      ticket_type: {
        name: ticket.ticket_type_name,
        price: ticket.ticket_price
      },
      addon_selections: addonSelections
    });
  } catch (err) {
    console.error('Error fetching ticket:', err);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// GET /api/tickets/:code/qr - get QR code image for ticket
router.get('/:code/qr', async (req, res) => {
  try {
    const db = getDb();
    const ticket = db.prepare('SELECT code FROM tickets WHERE code = ?').get(req.params.code);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const qrBuffer = await generateQrBuffer(ticket.code);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (err) {
    console.error('Error generating QR:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

module.exports = router;
