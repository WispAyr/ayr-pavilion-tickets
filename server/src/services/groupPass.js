const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

/**
 * Get or create a group pass token for a purchaser+event combo.
 * If the buyer already has a group pass for this event (from a prior order), reuse it.
 */
function getOrCreateGroupPass(eventId, email) {
  const db = getDb();
  const normEmail = email.toLowerCase().trim();

  const existing = db.prepare('SELECT token FROM group_passes WHERE event_id = ? AND email = ?').get(eventId, normEmail);
  if (existing) return existing.token;

  const token = uuidv4();
  db.prepare('INSERT INTO group_passes (event_id, email, token) VALUES (?, ?, ?)').run(eventId, normEmail, token);
  return token;
}

/**
 * Look up all tickets for a group pass token.
 * Returns tickets from ALL orders by that purchaser for that event.
 */
function getGroupPassTickets(token) {
  const db = getDb();

  const gp = db.prepare('SELECT id, event_id, email FROM group_passes WHERE token = ?').get(token);
  if (!gp) return null;

  const tickets = db.prepare(`
    SELECT t.id, t.code, t.status, t.holder_name, t.checked_in_at,
           tt.name AS ticket_type_name,
           o.customer_name, o.order_ref,
           e.title AS event_title, e.id AS event_id
    FROM tickets t
    JOIN orders o ON t.order_id = o.id
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    JOIN events e ON t.event_id = e.id
    WHERE t.event_id = ? AND LOWER(o.customer_email) = ?
      AND t.status IN ('valid', 'used')
    ORDER BY o.id ASC, t.id ASC
  `).all(gp.event_id, gp.email);

  return { groupPass: gp, tickets };
}

module.exports = { getOrCreateGroupPass, getGroupPassTickets };
