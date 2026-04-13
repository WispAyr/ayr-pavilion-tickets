const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');

const WAIVER_TEMPLATES = [
  {
    name: 'Ice Skating / Activity Liability Waiver',
    content: `<h3>Assumption of Risk & Release of Liability</h3>
<p>By purchasing tickets and participating in this activity at Ayr Pavilion, I acknowledge and agree to the following:</p>
<ul>
<li>I understand that ice skating and related activities carry inherent risks including but not limited to falls, collisions, and injuries.</li>
<li>I voluntarily assume all risks associated with participation, including the risk of serious injury or death.</li>
<li>I release Ayr Pavilion, its owners, operators, employees, and agents from any and all liability for injury, damage, or loss arising from my participation.</li>
<li>I agree to follow all venue rules, staff instructions, and safety guidelines at all times.</li>
<li>I understand that protective gear (helmets, gloves) is recommended and available.</li>
<li>I confirm that I have disclosed any medical conditions that may affect my ability to participate safely.</li>
<li>I accept responsibility for any damage caused to equipment provided by the venue.</li>
</ul>
<p><strong>For participants under 18:</strong> I confirm that I am the parent/legal guardian and give consent for the named minor to participate.</p>`
  },
  {
    name: 'Social Media / Photography Waiver',
    content: `<h3>Photography & Media Consent</h3>
<p>By attending this event at Ayr Pavilion, I acknowledge and agree to the following:</p>
<ul>
<li>Professional and/or amateur photography and videography may take place during this event.</li>
<li>I consent to Ayr Pavilion using any photographs or video footage in which I appear for marketing, social media, website content, and promotional materials.</li>
<li>I understand that images may be used without further notice or compensation.</li>
<li>I may be incidentally captured in photographs or video taken by other attendees or staff.</li>
<li>If I do not wish to be photographed, I will inform a member of staff upon arrival and make reasonable efforts to avoid designated photography areas.</li>
</ul>
<p>This consent is ongoing unless revoked in writing to info@ayrpavilion.com.</p>`
  },
  {
    name: 'General Event Terms & Conditions',
    content: `<h3>Event Terms & Conditions</h3>
<p>By purchasing tickets for this event at Ayr Pavilion, I agree to the following terms:</p>

<h4>Cancellation & Refund Policy</h4>
<ul>
<li><strong>Without Ticket Protection:</strong> All ticket sales are final and non-refundable. Refunds will only be issued if the event is cancelled or postponed by the organiser.</li>
<li><strong>With Ticket Protection:</strong> If you have purchased Ticket Protection, you may submit a cancellation request if you are unable to attend due to illness, injury, bereavement, or other unforeseen circumstances. All claims are reviewed by the venue and approval is not guaranteed. The Ticket Protection fee itself is non-refundable. Claims must be submitted at least 24 hours before the event start time.</li>
<li><strong>Event Cancellation:</strong> If the event is cancelled by the organiser, a full refund will be issued to all ticket holders regardless of protection status.</li>
<li><strong>Event Postponement:</strong> If the event is rescheduled, tickets will be valid for the new date. Refund requests due to rescheduling will be considered on a case-by-case basis.</li>
<li><strong>Transfers:</strong> Tickets are non-transferable unless authorised by the venue.</li>
</ul>

<h4>General Terms</h4>
<ul>
<li><strong>Age Restrictions:</strong> Any age restrictions listed for the event must be adhered to. Proof of age may be required.</li>
<li><strong>Behaviour:</strong> All attendees are expected to behave in a respectful manner. Anti-social behaviour, intoxication, or disruptive conduct may result in removal from the venue without refund.</li>
<li><strong>Right to Refuse Entry:</strong> Ayr Pavilion reserves the right to refuse entry to any person at its discretion.</li>
<li><strong>Venue Liability:</strong> Ayr Pavilion accepts no liability for loss, theft, or damage to personal property brought onto the premises.</li>
<li><strong>Event Changes:</strong> The venue reserves the right to make changes to event timings, performers, or activities. Attendees will be notified of significant changes where possible.</li>
<li><strong>Health & Safety:</strong> All attendees must comply with venue health and safety regulations and follow instructions from staff.</li>
</ul>`
  }
];

// GET /api/events/:eventId/waivers - list waivers for an event (public)
router.get('/events/:eventId/waivers', (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;

    // Get event-specific waivers + global waivers (event_id IS NULL)
    const waivers = db.prepare(`
      SELECT * FROM waivers
      WHERE (event_id = ? OR event_id IS NULL) AND active = 1
      ORDER BY sort_order ASC, id ASC
    `).all(eventId);

    for (const waiver of waivers) {
      waiver.ticket_type_ids = db.prepare(
        'SELECT ticket_type_id FROM waiver_ticket_types WHERE waiver_id = ?'
      ).all(waiver.id).map(r => r.ticket_type_id);
    }

    res.json(waivers);
  } catch (err) {
    console.error('Error fetching waivers:', err);
    res.status(500).json({ error: 'Failed to fetch waivers' });
  }
});

// GET /api/waiver-templates - get template waivers
router.get('/waiver-templates', adminAuth, (req, res) => {
  res.json(WAIVER_TEMPLATES);
});

// POST /api/events/:eventId/waivers - create waiver (admin)
router.post('/events/:eventId/waivers', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { eventId } = req.params;
    const { name, type, content, required, sort_order, ticket_type_ids } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    const result = db.prepare(`
      INSERT INTO waivers (event_id, name, type, content, required, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      eventId === 'global' ? null : eventId,
      name, type || 'checkbox', content, required !== undefined ? (required ? 1 : 0) : 1, sort_order || 0
    );

    const waiverId = result.lastInsertRowid;

    if (ticket_type_ids && ticket_type_ids.length > 0) {
      const insertLink = db.prepare('INSERT INTO waiver_ticket_types (waiver_id, ticket_type_id) VALUES (?, ?)');
      for (const ttId of ticket_type_ids) {
        insertLink.run(waiverId, ttId);
      }
    }

    const waiver = db.prepare('SELECT * FROM waivers WHERE id = ?').get(waiverId);
    waiver.ticket_type_ids = (ticket_type_ids || []);
    res.status(201).json(waiver);
  } catch (err) {
    console.error('Error creating waiver:', err);
    res.status(500).json({ error: 'Failed to create waiver' });
  }
});

// PUT /api/waivers/:id - update waiver (admin)
router.put('/waivers/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const waiver = db.prepare('SELECT * FROM waivers WHERE id = ?').get(req.params.id);
    if (!waiver) return res.status(404).json({ error: 'Waiver not found' });

    const { name, type, content, required, sort_order, active, ticket_type_ids } = req.body;

    db.prepare(`
      UPDATE waivers SET
        name = ?, type = ?, content = ?, required = ?, sort_order = ?, active = ?
      WHERE id = ?
    `).run(
      name || waiver.name,
      type || waiver.type,
      content !== undefined ? content : waiver.content,
      required !== undefined ? (required ? 1 : 0) : waiver.required,
      sort_order !== undefined ? sort_order : waiver.sort_order,
      active !== undefined ? (active ? 1 : 0) : waiver.active,
      req.params.id
    );

    if (ticket_type_ids !== undefined) {
      db.prepare('DELETE FROM waiver_ticket_types WHERE waiver_id = ?').run(req.params.id);
      if (ticket_type_ids.length > 0) {
        const insertLink = db.prepare('INSERT INTO waiver_ticket_types (waiver_id, ticket_type_id) VALUES (?, ?)');
        for (const ttId of ticket_type_ids) {
          insertLink.run(req.params.id, ttId);
        }
      }
    }

    const updated = db.prepare('SELECT * FROM waivers WHERE id = ?').get(req.params.id);
    updated.ticket_type_ids = db.prepare('SELECT ticket_type_id FROM waiver_ticket_types WHERE waiver_id = ?').all(req.params.id).map(r => r.ticket_type_id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating waiver:', err);
    res.status(500).json({ error: 'Failed to update waiver' });
  }
});

// DELETE /api/waivers/:id - delete waiver (admin)
router.delete('/waivers/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const waiver = db.prepare('SELECT * FROM waivers WHERE id = ?').get(req.params.id);
    if (!waiver) return res.status(404).json({ error: 'Waiver not found' });

    db.prepare('DELETE FROM waivers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Waiver deleted successfully' });
  } catch (err) {
    console.error('Error deleting waiver:', err);
    res.status(500).json({ error: 'Failed to delete waiver' });
  }
});

module.exports = router;
