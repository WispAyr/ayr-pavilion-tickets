const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');

// GET /api/events/:eventId/ticket-types - list ticket types for an event
router.get('/events/:eventId/ticket-types', (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const event = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const ticketTypes = db.prepare(
      'SELECT * FROM ticket_types WHERE event_id = ? ORDER BY sort_order ASC, price ASC'
    ).all(eventId);

    res.json(ticketTypes);
  } catch (err) {
    console.error('Error fetching ticket types:', err);
    res.status(500).json({ error: 'Failed to fetch ticket types' });
  }
});

// POST /api/events/:eventId/ticket-types - create ticket type (admin)
router.post('/events/:eventId/ticket-types', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const event = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { name, price, quantity, description, sale_start, sale_end, sort_order } = req.body;

    if (!name || price === undefined || !quantity) {
      return res.status(400).json({ error: 'Name, price, and quantity are required' });
    }

    const result = db.prepare(`
      INSERT INTO ticket_types (event_id, name, price, quantity, description, sale_start, sale_end, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      name,
      price,
      quantity,
      description || null,
      sale_start || null,
      sale_end || null,
      sort_order || 0
    );

    const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(ticketType);
  } catch (err) {
    console.error('Error creating ticket type:', err);
    res.status(500).json({ error: 'Failed to create ticket type' });
  }
});

// PUT /api/ticket-types/:id - update ticket type (admin)
router.put('/ticket-types/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(req.params.id);

    if (!ticketType) {
      return res.status(404).json({ error: 'Ticket type not found' });
    }

    const { name, price, quantity, description, sale_start, sale_end, sort_order } = req.body;

    db.prepare(`
      UPDATE ticket_types SET
        name = ?, price = ?, quantity = ?, description = ?,
        sale_start = ?, sale_end = ?, sort_order = ?
      WHERE id = ?
    `).run(
      name || ticketType.name,
      price !== undefined ? price : ticketType.price,
      quantity !== undefined ? quantity : ticketType.quantity,
      description !== undefined ? description : ticketType.description,
      sale_start !== undefined ? sale_start : ticketType.sale_start,
      sale_end !== undefined ? sale_end : ticketType.sale_end,
      sort_order !== undefined ? sort_order : ticketType.sort_order,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating ticket type:', err);
    res.status(500).json({ error: 'Failed to update ticket type' });
  }
});

// DELETE /api/ticket-types/:id - delete ticket type (admin)
router.delete('/ticket-types/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(req.params.id);

    if (!ticketType) {
      return res.status(404).json({ error: 'Ticket type not found' });
    }

    const existingTickets = db.prepare(
      'SELECT COUNT(*) as count FROM tickets WHERE ticket_type_id = ? AND status != ?'
    ).get(req.params.id, 'cancelled');

    if (existingTickets.count > 0) {
      return res.status(400).json({ error: 'Cannot delete ticket type with active tickets' });
    }

    db.prepare('DELETE FROM ticket_types WHERE id = ?').run(req.params.id);
    res.json({ message: 'Ticket type deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket type:', err);
    res.status(500).json({ error: 'Failed to delete ticket type' });
  }
});

module.exports = router;
