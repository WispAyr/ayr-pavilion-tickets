const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');

// GET /api/events/:eventId/addons - list addons for an event (public)
router.get('/events/:eventId/addons', (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    const addons = db.prepare(
      'SELECT * FROM addons WHERE event_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC'
    ).all(eventId);

    for (const addon of addons) {
      addon.options = db.prepare(
        'SELECT * FROM addon_options WHERE addon_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC'
      ).all(addon.id);

      addon.ticket_type_ids = db.prepare(
        'SELECT ticket_type_id FROM addon_ticket_types WHERE addon_id = ?'
      ).all(addon.id).map(r => r.ticket_type_id);
    }

    res.json(addons);
  } catch (err) {
    console.error('Error fetching addons:', err);
    res.status(500).json({ error: 'Failed to fetch addons' });
  }
});

// POST /api/events/:eventId/addons - create addon (admin)
router.post('/events/:eventId/addons', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;
    const { name, description, price, type, max_quantity, required, per_ticket, sort_order, options, ticket_type_ids } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const result = db.prepare(`
      INSERT INTO addons (event_id, name, description, price, type, max_quantity, required, per_ticket, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId, name, description || null, price, type || 'select',
      max_quantity || 1, required ? 1 : 0, per_ticket !== undefined ? (per_ticket ? 1 : 0) : 1, sort_order || 0
    );

    const addonId = result.lastInsertRowid;

    // Insert options
    if (options && options.length > 0) {
      const insertOption = db.prepare(`
        INSERT INTO addon_options (addon_id, label, stock, price_override, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        insertOption.run(addonId, opt.label, opt.stock || 0, opt.price_override ?? null, i);
      }
    }

    // Link to ticket types
    if (ticket_type_ids && ticket_type_ids.length > 0) {
      const insertLink = db.prepare('INSERT INTO addon_ticket_types (addon_id, ticket_type_id) VALUES (?, ?)');
      for (const ttId of ticket_type_ids) {
        insertLink.run(addonId, ttId);
      }
    }

    const addon = db.prepare('SELECT * FROM addons WHERE id = ?').get(addonId);
    addon.options = db.prepare('SELECT * FROM addon_options WHERE addon_id = ? ORDER BY sort_order ASC').all(addonId);
    addon.ticket_type_ids = (ticket_type_ids || []);

    res.status(201).json(addon);
  } catch (err) {
    console.error('Error creating addon:', err);
    res.status(500).json({ error: 'Failed to create addon' });
  }
});

// PUT /api/addons/:id - update addon (admin)
router.put('/addons/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const addon = db.prepare('SELECT * FROM addons WHERE id = ?').get(req.params.id);
    if (!addon) return res.status(404).json({ error: 'Addon not found' });

    const { name, description, price, type, max_quantity, required, per_ticket, sort_order, active, options, ticket_type_ids } = req.body;

    db.prepare(`
      UPDATE addons SET
        name = ?, description = ?, price = ?, type = ?, max_quantity = ?,
        required = ?, per_ticket = ?, sort_order = ?, active = ?
      WHERE id = ?
    `).run(
      name || addon.name,
      description !== undefined ? description : addon.description,
      price !== undefined ? price : addon.price,
      type || addon.type,
      max_quantity !== undefined ? max_quantity : addon.max_quantity,
      required !== undefined ? (required ? 1 : 0) : addon.required,
      per_ticket !== undefined ? (per_ticket ? 1 : 0) : addon.per_ticket,
      sort_order !== undefined ? sort_order : addon.sort_order,
      active !== undefined ? (active ? 1 : 0) : addon.active,
      req.params.id
    );

    // Replace options if provided
    if (options !== undefined) {
      db.prepare('DELETE FROM addon_options WHERE addon_id = ?').run(req.params.id);
      if (options.length > 0) {
        const insertOption = db.prepare(`
          INSERT INTO addon_options (addon_id, label, stock, reserved, price_override, sort_order, active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          insertOption.run(req.params.id, opt.label, opt.stock || 0, opt.reserved || 0, opt.price_override ?? null, i, opt.active !== undefined ? (opt.active ? 1 : 0) : 1);
        }
      }
    }

    // Replace ticket type links if provided
    if (ticket_type_ids !== undefined) {
      db.prepare('DELETE FROM addon_ticket_types WHERE addon_id = ?').run(req.params.id);
      if (ticket_type_ids.length > 0) {
        const insertLink = db.prepare('INSERT INTO addon_ticket_types (addon_id, ticket_type_id) VALUES (?, ?)');
        for (const ttId of ticket_type_ids) {
          insertLink.run(req.params.id, ttId);
        }
      }
    }

    const updated = db.prepare('SELECT * FROM addons WHERE id = ?').get(req.params.id);
    updated.options = db.prepare('SELECT * FROM addon_options WHERE addon_id = ? ORDER BY sort_order ASC').all(req.params.id);
    updated.ticket_type_ids = db.prepare('SELECT ticket_type_id FROM addon_ticket_types WHERE addon_id = ?').all(req.params.id).map(r => r.ticket_type_id);

    res.json(updated);
  } catch (err) {
    console.error('Error updating addon:', err);
    res.status(500).json({ error: 'Failed to update addon' });
  }
});

// DELETE /api/addons/:id - delete addon (admin)
router.delete('/addons/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const addon = db.prepare('SELECT * FROM addons WHERE id = ?').get(req.params.id);
    if (!addon) return res.status(404).json({ error: 'Addon not found' });

    db.prepare('DELETE FROM addons WHERE id = ?').run(req.params.id);
    res.json({ message: 'Addon deleted successfully' });
  } catch (err) {
    console.error('Error deleting addon:', err);
    res.status(500).json({ error: 'Failed to delete addon' });
  }
});

module.exports = router;
