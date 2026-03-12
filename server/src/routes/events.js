const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// GET /api/events - list events (public)
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { status, upcoming } = req.query;

    let query = 'SELECT * FROM events';
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (upcoming === 'true') {
      conditions.push("status IN ('on-sale', 'sold-out')");
      conditions.push("date_time >= datetime('now')");
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY date_time ASC';

    const events = db.prepare(query).all(...params);
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/:slugOrId - get single event by slug or ID with ticket types
router.get('/:slugOrId', (req, res) => {
  try {
    const db = getDb();
    const param = req.params.slugOrId;
    const event = /^\d+$/.test(param)
      ? db.prepare('SELECT * FROM events WHERE id = ?').get(param)
      : db.prepare('SELECT * FROM events WHERE slug = ?').get(param);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const ticketTypes = db.prepare(
      'SELECT * FROM ticket_types WHERE event_id = ? ORDER BY sort_order ASC, price ASC'
    ).all(event.id);

    const addons = db.prepare(
      'SELECT * FROM addons WHERE event_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC'
    ).all(event.id);

    for (const addon of addons) {
      addon.options = db.prepare(
        'SELECT * FROM addon_options WHERE addon_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC'
      ).all(addon.id);
      addon.ticket_type_ids = db.prepare(
        'SELECT ticket_type_id FROM addon_ticket_types WHERE addon_id = ?'
      ).all(addon.id).map(r => r.ticket_type_id);
    }

    const waivers = db.prepare(`
      SELECT * FROM waivers
      WHERE (event_id = ? OR event_id IS NULL) AND active = 1
      ORDER BY sort_order ASC, id ASC
    `).all(event.id);

    for (const waiver of waivers) {
      waiver.ticket_type_ids = db.prepare(
        'SELECT ticket_type_id FROM waiver_ticket_types WHERE waiver_id = ?'
      ).all(waiver.id).map(r => r.ticket_type_id);
    }

    res.json({ ...event, ticket_types: ticketTypes, addons, waivers });
  } catch (err) {
    console.error('Error fetching event:', err);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST /api/events - create event (admin)
router.post('/', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { title, date_time, doors_open, venue, description, hero_image, capacity, status, age_restriction } = req.body;

    if (!title || !date_time) {
      return res.status(400).json({ error: 'Title and date_time are required' });
    }

    let slug = slugify(title);

    // Ensure unique slug
    const existing = db.prepare('SELECT id FROM events WHERE slug = ?').get(slug);
    if (existing) {
      slug = slug + '-' + Date.now().toString(36);
    }

    const result = db.prepare(`
      INSERT INTO events (title, slug, date_time, doors_open, venue, description, hero_image, capacity, status, age_restriction)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      slug,
      date_time,
      doors_open || null,
      venue || 'Ayr Pavilion',
      description || null,
      hero_image || null,
      capacity || null,
      status || 'draft',
      age_restriction || null
    );

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(event);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/events/:id - update event (admin)
router.put('/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { title, date_time, doors_open, venue, description, hero_image, capacity, status, age_restriction } = req.body;

    let slug = event.slug;
    if (title && title !== event.title) {
      slug = slugify(title);
      const existing = db.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').get(slug, req.params.id);
      if (existing) {
        slug = slug + '-' + Date.now().toString(36);
      }
    }

    db.prepare(`
      UPDATE events SET
        title = ?, slug = ?, date_time = ?, doors_open = ?, venue = ?,
        description = ?, hero_image = ?, capacity = ?, status = ?,
        age_restriction = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title || event.title,
      slug,
      date_time || event.date_time,
      doors_open !== undefined ? doors_open : event.doors_open,
      venue || event.venue,
      description !== undefined ? description : event.description,
      hero_image !== undefined ? hero_image : event.hero_image,
      capacity !== undefined ? capacity : event.capacity,
      status || event.status,
      age_restriction !== undefined ? age_restriction : event.age_restriction,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/events/:id - delete event (admin)
router.delete('/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

module.exports = router;
