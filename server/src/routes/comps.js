const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');
const { sendTicketEmail, sendCompInviteEmail } = require('../services/email');
const { getOrCreateGroupPass } = require("../services/groupPass");

function generateCompCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'COMP-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateOrderRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'APT-';
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

// ============ PUBLIC ENDPOINTS ============

// GET /api/comps/:code/validate — check if comp code is valid
router.get('/:code/validate', (req, res) => {
  try {
    const db = getDb();
    const comp = db.prepare(`
      SELECT cc.*, e.title as event_title, e.slug as event_slug, e.status as event_status
      FROM comp_codes cc
      JOIN events e ON cc.event_id = e.id
      WHERE cc.code = ? AND cc.active = 1
    `).get(req.params.code);

    if (!comp) {
      return res.status(404).json({ error: 'Invalid or expired comp code' });
    }

    if (comp.expires_at && new Date(comp.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This comp code has expired' });
    }

    if (comp.event_status !== 'on-sale' && comp.event_status !== 'sold-out') {
      return res.status(400).json({ error: 'This event is not currently available' });
    }

    const remaining = comp.max_tickets - comp.used_tickets;
    if (remaining <= 0) {
      return res.status(400).json({ error: 'This comp code has been fully used' });
    }

    res.json({
      valid: true,
      eventId: comp.event_id,
      eventTitle: comp.event_title,
      eventSlug: comp.event_slug,
      remainingTickets: remaining,
      maxTickets: comp.max_tickets,
      recipientName: comp.recipient_name,
    });
  } catch (err) {
    console.error('Error validating comp code:', err);
    res.status(500).json({ error: 'Failed to validate comp code' });
  }
});

// POST /api/comps/:code/checkout — comp checkout (no Stripe)
router.post('/:code/checkout', (req, res) => {
  try {
    const db = getDb();
    const { eventId, items, customerName, customerEmail, customerPhone, addonSelections, waiverAcceptances, marketingOptIn } = req.body;

    // Validate comp code
    const comp = db.prepare('SELECT * FROM comp_codes WHERE code = ? AND active = 1').get(req.params.code);
    if (!comp) {
      return res.status(404).json({ error: 'Invalid or expired comp code' });
    }

    if (comp.event_id !== eventId) {
      return res.status(400).json({ error: 'Comp code is not valid for this event' });
    }

    const remaining = comp.max_tickets - comp.used_tickets;
    const totalRequested = items.reduce((sum, i) => sum + i.quantity, 0);
    if (totalRequested > remaining) {
      return res.status(400).json({ error: `Only ${remaining} complimentary ticket(s) remaining on this code` });
    }

    if (!eventId || !items || !items.length || !customerName || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Validate ticket types and availability
    const orderItems = [];
    for (const item of items) {
      const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ? AND event_id = ?').get(item.ticketTypeId, eventId);
      if (!ticketType) {
        return res.status(404).json({ error: `Ticket type ${item.ticketTypeId} not found` });
      }
      const available = ticketType.quantity - ticketType.sold;
      if (item.quantity > available) {
        return res.status(400).json({ error: `Only ${available} ${ticketType.name} tickets remaining` });
      }
      orderItems.push({
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity: item.quantity,
        price: ticketType.price
      });
    }

    // Create order
    const orderRef = generateOrderRef();
    db.prepare(`
      INSERT INTO orders (order_ref, event_id, customer_name, customer_email, customer_phone, total, booking_fee, status, comp_code_id, marketing_opt_in)
      VALUES (?, ?, ?, ?, ?, 0, 0, 'comp', ?, ?)
    `).run(orderRef, eventId, customerName, customerEmail, customerPhone || null, comp.id, marketingOptIn ? 1 : 0);

    const order = db.prepare('SELECT * FROM orders WHERE order_ref = ?').get(orderRef);

    // Generate tickets
    const tickets = [];
    const insertTicket = db.prepare('INSERT INTO tickets (code, order_id, event_id, ticket_type_id, holder_name) VALUES (?, ?, ?, ?, ?)');
    const updateSold = db.prepare('UPDATE ticket_types SET sold = sold + ? WHERE id = ?');

    const generateTickets = db.transaction(() => {
      for (const item of orderItems) {
        updateSold.run(item.quantity, item.ticketTypeId);
        for (let i = 0; i < item.quantity; i++) {
          const code = uuidv4();
          insertTicket.run(code, order.id, eventId, item.ticketTypeId, customerName);
          tickets.push({ code, ticketTypeName: item.ticketTypeName });
        }
      }
    });
    generateTickets();

    // Store addon selections
    if (addonSelections && addonSelections.length > 0) {
      const insertAddonSel = db.prepare(
        'INSERT INTO order_addon_selections (order_id, ticket_id, addon_id, addon_option_id, selected_option, quantity, price) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const updateOptionReserved = db.prepare('UPDATE addon_options SET reserved = reserved + 1 WHERE id = ?');

      for (const sel of addonSelections) {
        let ticketId = null;
        if (sel.ticketIndex !== null && sel.ticketIndex !== undefined && sel.ticketTypeId) {
          const matchingTickets = tickets.filter(t => {
            const item = orderItems.find(oi => oi.ticketTypeName === t.ticketTypeName);
            return item && item.ticketTypeId === sel.ticketTypeId;
          });
          if (matchingTickets[sel.ticketIndex]) {
            const ticketRow = db.prepare('SELECT id FROM tickets WHERE code = ?').get(matchingTickets[sel.ticketIndex].code);
            if (ticketRow) ticketId = ticketRow.id;
          }
        }
        insertAddonSel.run(order.id, ticketId, sel.addonId, sel.addonOptionId || null, sel.selectedOption, sel.quantity || 1, 0);
        if (sel.addonOptionId) updateOptionReserved.run(sel.addonOptionId);
      }
    }

    // Store waiver acceptances
    if (waiverAcceptances && waiverAcceptances.length > 0) {
      const insertWaiverAcc = db.prepare('INSERT INTO waiver_acceptances (order_id, waiver_id, ip_address, user_agent) VALUES (?, ?, ?, ?)');
      for (const acc of waiverAcceptances) {
        insertWaiverAcc.run(order.id, acc.waiverId, acc.ipAddress || null, acc.userAgent || null);
      }
    }

    // Update comp code usage
    db.prepare('UPDATE comp_codes SET used_tickets = used_tickets + ? WHERE id = ?').run(totalRequested, comp.id);

    // Check if event is sold out
    const ticketTypes = db.prepare('SELECT * FROM ticket_types WHERE event_id = ?').all(eventId);
    const allSoldOut = ticketTypes.every(tt => tt.sold >= tt.quantity);
    if (allSoldOut) {
      db.prepare("UPDATE events SET status = 'sold-out', updated_at = datetime('now') WHERE id = ?").run(eventId);
    }

    // Send confirmation email
    const groupPassToken = getOrCreateGroupPass(eventId, customerEmail);
    sendTicketEmail({
      to: customerEmail,
      customerName,
      eventTitle: event.title,
      dateTime: event.date_time,
      doorsOpen: event.doors_open,
      venue: event.venue,
      ticketTypeName: orderItems[0].ticketTypeName,
      tickets,
      orderRef,
      orderId: order.id,
      groupPassToken
    }).catch(err => console.error('Failed to send comp ticket email:', err.message));

    console.log(`Comp order ${orderRef} completed: ${tickets.length} tickets (code: ${comp.code})`);
    res.json({ orderRef, success: true });
  } catch (err) {
    console.error('Error processing comp checkout:', err);
    res.status(500).json({ error: 'Failed to process comp checkout' });
  }
});

// ============ ADMIN ENDPOINTS ============

// GET /api/admin/comps — list all comp codes
router.get('/admin/comps', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const comps = db.prepare(`
      SELECT cc.*, e.title as event_title, e.slug as event_slug, e.date_time
      FROM comp_codes cc
      JOIN events e ON cc.event_id = e.id
      ORDER BY cc.created_at DESC
    `).all();
    res.json(comps);
  } catch (err) {
    console.error('Error fetching comp codes:', err);
    res.status(500).json({ error: 'Failed to fetch comp codes' });
  }
});

// POST /api/admin/comps — create comp code
router.post('/admin/comps', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { event_id, max_tickets, recipient_name, recipient_email, notes } = req.body;

    if (!event_id) return res.status(400).json({ error: 'Event is required' });

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const code = generateCompCode();
    const result = db.prepare(`
      INSERT INTO comp_codes (code, event_id, max_tickets, recipient_name, recipient_email, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(code, event_id, max_tickets || 10, recipient_name || null, recipient_email || null, notes || null, req.admin.username);

    const comp = db.prepare(`
      SELECT cc.*, e.title as event_title, e.slug as event_slug, e.date_time, e.venue
      FROM comp_codes cc
      JOIN events e ON cc.event_id = e.id
      WHERE cc.id = ?
    `).get(result.lastInsertRowid);

    // Send invite email if requested and email provided
    if (req.body.send_invite && recipient_email) {
      sendCompInviteEmail({
        to: recipient_email,
        recipientName: recipient_name,
        eventTitle: comp.event_title,
        dateTime: comp.date_time,
        venue: comp.venue,
        compCode: code,
        eventSlug: comp.event_slug,
        maxTickets: max_tickets || 10,
      }).catch(err => console.error('Failed to send comp invite:', err.message));
    }

    res.status(201).json(comp);
  } catch (err) {
    console.error('Error creating comp code:', err);
    res.status(500).json({ error: 'Failed to create comp code' });
  }
});

// POST /api/admin/comps/:id/send-invite — send/resend invite email
router.post('/admin/comps/:id/send-invite', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const comp = db.prepare(`
      SELECT cc.*, e.title as event_title, e.slug as event_slug, e.date_time, e.venue
      FROM comp_codes cc
      JOIN events e ON cc.event_id = e.id
      WHERE cc.id = ?
    `).get(req.params.id);

    if (!comp) return res.status(404).json({ error: 'Comp code not found' });

    const email = req.body.email || comp.recipient_email;
    if (!email) return res.status(400).json({ error: 'No email address provided' });

    sendCompInviteEmail({
      to: email,
      recipientName: comp.recipient_name,
      eventTitle: comp.event_title,
      dateTime: comp.date_time,
      venue: comp.venue,
      compCode: comp.code,
      eventSlug: comp.event_slug,
      maxTickets: comp.max_tickets,
    }).catch(err => console.error('Failed to send comp invite:', err.message));

    res.json({ message: `Invite sent to ${email}` });
  } catch (err) {
    console.error('Error sending invite:', err);
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// PUT /api/admin/comps/:id — update comp code
router.put('/admin/comps/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const comp = db.prepare('SELECT * FROM comp_codes WHERE id = ?').get(req.params.id);
    if (!comp) return res.status(404).json({ error: 'Comp code not found' });

    const { max_tickets, active, notes, recipient_name, recipient_email } = req.body;
    db.prepare(`
      UPDATE comp_codes SET
        max_tickets = ?, active = ?, notes = ?, recipient_name = ?, recipient_email = ?
      WHERE id = ?
    `).run(
      max_tickets !== undefined ? max_tickets : comp.max_tickets,
      active !== undefined ? (active ? 1 : 0) : comp.active,
      notes !== undefined ? notes : comp.notes,
      recipient_name !== undefined ? recipient_name : comp.recipient_name,
      recipient_email !== undefined ? recipient_email : comp.recipient_email,
      req.params.id
    );

    const updated = db.prepare(`
      SELECT cc.*, e.title as event_title, e.slug as event_slug, e.date_time
      FROM comp_codes cc
      JOIN events e ON cc.event_id = e.id
      WHERE cc.id = ?
    `).get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating comp code:', err);
    res.status(500).json({ error: 'Failed to update comp code' });
  }
});

// POST /api/admin/comps/:id/reset — reset used_tickets to 0
router.post('/admin/comps/:id/reset', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const comp = db.prepare('SELECT * FROM comp_codes WHERE id = ?').get(req.params.id);
    if (!comp) return res.status(404).json({ error: 'Comp code not found' });

    db.prepare('UPDATE comp_codes SET used_tickets = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Comp code usage reset' });
  } catch (err) {
    console.error('Error resetting comp code:', err);
    res.status(500).json({ error: 'Failed to reset comp code' });
  }
});

// DELETE /api/admin/comps/:id — deactivate comp code
router.delete('/admin/comps/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE comp_codes SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Comp code deactivated' });
  } catch (err) {
    console.error('Error deactivating comp code:', err);
    res.status(500).json({ error: 'Failed to deactivate comp code' });
  }
});

module.exports = router;
