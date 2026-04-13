const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');
const { createRefund } = require('../services/stripe');
const { sendProtectionEmail } = require('../services/email');

// Cancellation cutoff: claims must be submitted at least this many hours
// before the event start time.
const CANCELLATION_CUTOFF_HOURS = 24;

function hoursUntilEvent(dateTime) {
  const eventMs = new Date(dateTime).getTime();
  if (Number.isNaN(eventMs)) return null;
  return (eventMs - Date.now()) / (1000 * 60 * 60);
}

function isWithinCancellationCutoff(dateTime) {
  const hours = hoursUntilEvent(dateTime);
  if (hours === null) return false;
  return hours < CANCELLATION_CUTOFF_HOURS;
}

function generateClaimRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'CLM-';
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

// ============ PUBLIC ENDPOINTS ============

// GET /api/protection/tiers - list active tiers
router.get('/tiers', (req, res) => {
  try {
    const db = getDb();
    const tiers = db.prepare('SELECT * FROM protection_tiers WHERE active = 1 ORDER BY sort_order ASC').all();
    res.json(tiers);
  } catch (err) {
    console.error('Error fetching protection tiers:', err);
    res.status(500).json({ error: 'Failed to fetch protection tiers' });
  }
});

// GET /api/protection/calculate - calculate protection fee for items
router.post('/calculate', (req, res) => {
  try {
    const db = getDb();
    const { items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Items required' });
    }

    const tiers = db.prepare('SELECT * FROM protection_tiers WHERE active = 1 ORDER BY sort_order ASC').all();
    let totalFee = 0;
    const breakdown = [];

    for (const item of items) {
      const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(item.ticketTypeId);
      if (!ticketType) continue;

      const tier = tiers.find(t =>
        ticketType.price >= t.min_price && (t.max_price === null || ticketType.price <= t.max_price)
      );

      const fee = tier ? tier.fee : 0;
      const qty = item.quantity || 1;
      totalFee += fee * qty;

      breakdown.push({
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        ticketPrice: ticketType.price,
        protectionFee: fee,
        quantity: qty,
        subtotal: fee * qty
      });
    }

    res.json({ totalFee, breakdown });
  } catch (err) {
    console.error('Error calculating protection:', err);
    res.status(500).json({ error: 'Failed to calculate protection fee' });
  }
});

// GET /api/protection/claim/:orderRef - serve claim form page
router.get('/claim/:orderRef', (req, res) => {
  try {
    const db = getDb();
    const { orderRef } = req.params;

    const order = db.prepare(`
      SELECT o.*, e.title as event_title, e.date_time, e.venue
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.order_ref = ?
    `).get(orderRef);

    if (!order) {
      return res.status(404).send(buildClaimPage({ error: 'Order not found. Please check your order reference.' }));
    }

    if (!order.protection_opted) {
      return res.status(400).send(buildClaimPage({ error: 'This order does not have Ticket Protection. Unfortunately, unprotected tickets are non-refundable.' }));
    }

    if (order.status === 'refunded') {
      return res.send(buildClaimPage({ error: 'This order has already been refunded.' }));
    }

    // Check for existing claim
    const existingClaim = db.prepare(
      "SELECT * FROM protection_claims WHERE order_id = ? AND status IN ('pending', 'approved')"
    ).get(order.id);

    if (existingClaim) {
      const msg = existingClaim.status === 'pending'
        ? `A cancellation request (${existingClaim.claim_ref}) has already been submitted for this order and is being reviewed.`
        : `A cancellation request for this order has already been approved and your refund is being processed.`;
      return res.send(buildClaimPage({ error: msg }));
    }

    if (isWithinCancellationCutoff(order.date_time)) {
      return res.send(buildClaimPage({
        error: `Cancellation requests must be submitted at least ${CANCELLATION_CUTOFF_HOURS} hours before the event start time. This event is within the ${CANCELLATION_CUTOFF_HOURS}-hour window, so a claim can no longer be accepted.`
      }));
    }

    res.send(buildClaimPage({
      order: {
        orderRef: order.order_ref,
        eventTitle: order.event_title,
        dateTime: order.date_time,
        venue: order.venue,
        total: order.total,
        protectionFee: order.protection_fee
      }
    }));
  } catch (err) {
    console.error('Error serving claim form:', err);
    res.status(500).send(buildClaimPage({ error: 'Something went wrong. Please try again later.' }));
  }
});

// POST /api/protection/claim - submit a claim
router.post('/claim', (req, res) => {
  try {
    const db = getDb();
    const { orderRef, email, reason, reasonCategory } = req.body;

    if (!orderRef || !email || !reason) {
      return res.status(400).json({ error: 'Order reference, email, and reason are required' });
    }

    const order = db.prepare(`
      SELECT o.*, e.title as event_title, e.date_time, e.venue
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.order_ref = ?
    `).get(orderRef);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.protection_opted) {
      return res.status(400).json({ error: 'This order does not have Ticket Protection' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'This order is not eligible for a claim' });
    }

    // Validate email matches
    if (order.customer_email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ error: 'Email address does not match the order' });
    }

    // Check for existing pending/approved claim
    const existingClaim = db.prepare(
      "SELECT * FROM protection_claims WHERE order_id = ? AND status IN ('pending', 'approved')"
    ).get(order.id);

    if (existingClaim) {
      return res.status(400).json({ error: 'A cancellation request has already been submitted for this order' });
    }

    if (isWithinCancellationCutoff(order.date_time)) {
      return res.status(400).json({
        error: `Cancellation requests must be submitted at least ${CANCELLATION_CUTOFF_HOURS} hours before the event start time. This claim cannot be accepted.`
      });
    }

    const claimRef = generateClaimRef();
    const refundAmount = order.total - order.protection_fee;

    db.prepare(`
      INSERT INTO protection_claims (order_id, claim_ref, reason, reason_category, customer_email, refund_amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(order.id, claimRef, reason, reasonCategory || 'other', email, refundAmount);

    // Send claim submitted confirmation email
    sendProtectionEmail('claim_submitted', {
      to: order.customer_email,
      customerName: order.customer_name,
      claimRef,
      orderRef: order.order_ref,
      eventTitle: order.event_title,
      dateTime: order.date_time,
      venue: order.venue,
      refundAmount
    }).catch(err => console.error('Failed to send claim submitted email:', err));

    res.json({
      message: 'Your cancellation request has been submitted and is being reviewed.',
      claimRef
    });
  } catch (err) {
    console.error('Error submitting claim:', err);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

// ============ ADMIN ENDPOINTS ============

// GET /api/admin/protection/tiers - list all tiers
router.get('/admin/protection/tiers', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const tiers = db.prepare('SELECT * FROM protection_tiers ORDER BY sort_order ASC').all();
    res.json(tiers);
  } catch (err) {
    console.error('Error fetching tiers:', err);
    res.status(500).json({ error: 'Failed to fetch tiers' });
  }
});

// POST /api/admin/protection/tiers - create tier
router.post('/admin/protection/tiers', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { min_price, max_price, fee, sort_order } = req.body;

    if (min_price === undefined || fee === undefined) {
      return res.status(400).json({ error: 'min_price and fee are required' });
    }

    const result = db.prepare(
      'INSERT INTO protection_tiers (min_price, max_price, fee, sort_order) VALUES (?, ?, ?, ?)'
    ).run(min_price, max_price !== undefined ? max_price : null, fee, sort_order || 0);

    const tier = db.prepare('SELECT * FROM protection_tiers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tier);
  } catch (err) {
    console.error('Error creating tier:', err);
    res.status(500).json({ error: 'Failed to create tier' });
  }
});

// PUT /api/admin/protection/tiers/:id - update tier
router.put('/admin/tiers/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const tier = db.prepare('SELECT * FROM protection_tiers WHERE id = ?').get(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });

    const { min_price, max_price, fee, active, sort_order } = req.body;

    db.prepare(`
      UPDATE protection_tiers SET
        min_price = ?, max_price = ?, fee = ?, active = ?, sort_order = ?
      WHERE id = ?
    `).run(
      min_price !== undefined ? min_price : tier.min_price,
      max_price !== undefined ? max_price : tier.max_price,
      fee !== undefined ? fee : tier.fee,
      active !== undefined ? (active ? 1 : 0) : tier.active,
      sort_order !== undefined ? sort_order : tier.sort_order,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM protection_tiers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating tier:', err);
    res.status(500).json({ error: 'Failed to update tier' });
  }
});

// DELETE /api/admin/protection/tiers/:id - delete tier
router.delete('/admin/tiers/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const tier = db.prepare('SELECT * FROM protection_tiers WHERE id = ?').get(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });

    db.prepare('DELETE FROM protection_tiers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Tier deleted' });
  } catch (err) {
    console.error('Error deleting tier:', err);
    res.status(500).json({ error: 'Failed to delete tier' });
  }
});

// GET /api/admin/protection/claims - list claims
router.get('/admin/protection/claims', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT pc.*, o.order_ref, o.customer_name, o.customer_email, o.total as order_total,
             o.protection_fee, e.title as event_title, e.date_time
      FROM protection_claims pc
      JOIN orders o ON pc.order_id = o.id
      JOIN events e ON o.event_id = e.id
    `;
    let countQuery = `
      SELECT COUNT(*) as count FROM protection_claims pc
      JOIN orders o ON pc.order_id = o.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE pc.status = ?';
      countQuery += ' WHERE pc.status = ?';
      params.push(status);
    }

    const total = db.prepare(countQuery).get(...params);

    query += ' ORDER BY pc.requested_at DESC LIMIT ? OFFSET ?';
    const claims = db.prepare(query).all(...params, parseInt(limit, 10), offset);

    // Pending count for badge
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM protection_claims WHERE status = 'pending'").get();

    res.json({
      claims,
      pending_count: pendingCount.count,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: total.count,
        pages: Math.ceil(total.count / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('Error fetching claims:', err);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// PUT /api/admin/protection/claims/:id/approve - approve a claim
router.put('/admin/claims/:id/approve', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const claim = db.prepare(`
      SELECT pc.*, o.order_ref, o.customer_name, o.customer_email, o.total as order_total,
             o.protection_fee, o.stripe_payment_intent, e.title as event_title, e.date_time, e.venue
      FROM protection_claims pc
      JOIN orders o ON pc.order_id = o.id
      JOIN events e ON o.event_id = e.id
      WHERE pc.id = ?
    `).get(req.params.id);

    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'pending') return res.status(400).json({ error: 'Claim is not pending' });

    const refundAmount = claim.order_total - claim.protection_fee;

    // Issue Stripe refund
    if (claim.stripe_payment_intent) {
      await createRefund(claim.stripe_payment_intent, refundAmount);
    }

    // Update order and tickets
    db.prepare("UPDATE orders SET status = 'refunded', updated_at = datetime('now') WHERE id = ?").run(claim.order_id);
    db.prepare("UPDATE tickets SET status = 'refunded' WHERE order_id = ?").run(claim.order_id);

    // Restore sold counts
    const orderTickets = db.prepare(
      'SELECT ticket_type_id, COUNT(*) as count FROM tickets WHERE order_id = ? GROUP BY ticket_type_id'
    ).all(claim.order_id);
    for (const t of orderTickets) {
      db.prepare('UPDATE ticket_types SET sold = MAX(0, sold - ?) WHERE id = ?').run(t.count, t.ticket_type_id);
    }

    // Update claim
    const { notes } = req.body;
    db.prepare(`
      UPDATE protection_claims SET
        status = 'approved', admin_notes = ?, refund_amount = ?,
        resolved_at = datetime('now'), resolved_by = ?
      WHERE id = ?
    `).run(notes || null, refundAmount, req.admin.username, req.params.id);

    // Send approval email
    sendProtectionEmail('claim_approved', {
      to: claim.customer_email,
      customerName: claim.customer_name,
      claimRef: claim.claim_ref,
      orderRef: claim.order_ref,
      eventTitle: claim.event_title,
      refundAmount
    }).catch(err => console.error('Failed to send approval email:', err));

    res.json({ message: 'Claim approved and refund issued', refundAmount });
  } catch (err) {
    console.error('Error approving claim:', err);
    res.status(500).json({ error: 'Failed to approve claim' });
  }
});

// PUT /api/admin/protection/claims/:id/deny - deny a claim
router.put('/admin/claims/:id/deny', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const claim = db.prepare(`
      SELECT pc.*, o.order_ref, o.customer_name, o.customer_email,
             e.title as event_title
      FROM protection_claims pc
      JOIN orders o ON pc.order_id = o.id
      JOIN events e ON o.event_id = e.id
      WHERE pc.id = ?
    `).get(req.params.id);

    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'pending') return res.status(400).json({ error: 'Claim is not pending' });

    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: 'Please provide a reason for denial' });

    db.prepare(`
      UPDATE protection_claims SET
        status = 'denied', admin_notes = ?,
        resolved_at = datetime('now'), resolved_by = ?
      WHERE id = ?
    `).run(notes, req.admin.username, req.params.id);

    // Send denial email
    sendProtectionEmail('claim_denied', {
      to: claim.customer_email,
      customerName: claim.customer_name,
      claimRef: claim.claim_ref,
      orderRef: claim.order_ref,
      eventTitle: claim.event_title,
      adminNotes: notes
    }).catch(err => console.error('Failed to send denial email:', err));

    res.json({ message: 'Claim denied' });
  } catch (err) {
    console.error('Error denying claim:', err);
    res.status(500).json({ error: 'Failed to deny claim' });
  }
});

// ============ CLAIM FORM HTML ============

function buildClaimPage({ order, error, success }) {
  const appUrl = process.env.APP_URL || 'https://tickets.ayrpavilion.com';

  let bodyContent = '';

  if (error) {
    bodyContent = `
      <div style="background-color:#2a1a1a;border:1px solid #cc4444;border-radius:12px;padding:30px;text-align:center;">
        <p style="color:#ff6666;font-size:18px;margin:0;">${error}</p>
      </div>
    `;
  } else if (success) {
    bodyContent = `
      <div style="background-color:#1a2a1a;border:1px solid #44cc44;border-radius:12px;padding:30px;text-align:center;">
        <p style="color:#66ff66;font-size:18px;margin:0 0 10px;">${success}</p>
        <p style="color:#999;font-size:14px;margin:0;">We will review your request and be in touch via email.</p>
      </div>
    `;
  } else if (order) {
    const eventDate = new Date(order.dateTime);
    const formattedDate = eventDate.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const refundAmount = ((order.total - order.protectionFee) / 100).toFixed(2);

    bodyContent = `
      <div style="background-color:#12122a;border-radius:12px;padding:20px;margin-bottom:25px;">
        <h3 style="color:#D4A843;margin:0 0 15px;font-size:16px;text-transform:uppercase;letter-spacing:1px;">Order Details</h3>
        <p style="color:#fff;margin:5px 0;"><strong>Event:</strong> ${order.eventTitle}</p>
        <p style="color:#fff;margin:5px 0;"><strong>Date:</strong> ${formattedDate}</p>
        <p style="color:#fff;margin:5px 0;"><strong>Venue:</strong> ${order.venue}</p>
        <p style="color:#fff;margin:5px 0;"><strong>Order Ref:</strong> ${order.orderRef}</p>
        <p style="color:#D4A843;margin:10px 0 0;font-size:14px;">If approved, your refund will be <strong>&pound;${refundAmount}</strong> (ticket total minus the non-refundable protection fee).</p>
      </div>

      <form id="claimForm" method="POST" action="javascript:void(0)" style="margin:0;">
        <input type="hidden" name="orderRef" value="${order.orderRef}">

        <label style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px;">Email Address (must match your order)</label>
        <input type="email" name="email" required placeholder="Your email address"
          style="width:100%;padding:12px 15px;background-color:#12122a;border:1px solid #2a2a4a;border-radius:8px;color:#fff;font-size:15px;margin-bottom:20px;box-sizing:border-box;">

        <label style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px;">Reason for Cancellation</label>
        <select name="reasonCategory" required
          style="width:100%;padding:12px 15px;background-color:#12122a;border:1px solid #2a2a4a;border-radius:8px;color:#fff;font-size:15px;margin-bottom:20px;box-sizing:border-box;">
          <option value="">Select a reason...</option>
          <option value="illness">Illness</option>
          <option value="injury">Injury</option>
          <option value="bereavement">Bereavement</option>
          <option value="other">Other unforeseen circumstance</option>
        </select>

        <label style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px;">Please provide details</label>
        <textarea name="reason" required rows="4" placeholder="Please explain why you are unable to attend..."
          style="width:100%;padding:12px 15px;background-color:#12122a;border:1px solid #2a2a4a;border-radius:8px;color:#fff;font-size:15px;margin-bottom:20px;box-sizing:border-box;resize:vertical;"></textarea>

        <label style="color:#ccc;font-size:13px;display:flex;align-items:flex-start;gap:10px;margin-bottom:25px;cursor:pointer;">
          <input type="checkbox" name="accept" required style="margin-top:3px;min-width:18px;min-height:18px;">
          <span>I understand that cancellation requests are reviewed by the venue and the Ticket Protection fee is non-refundable.</span>
        </label>

        <div id="formError" style="display:none;color:#ff6666;margin-bottom:15px;text-align:center;"></div>
        <div id="formSuccess" style="display:none;color:#66ff66;margin-bottom:15px;text-align:center;"></div>

        <button type="submit" id="submitBtn"
          style="width:100%;padding:16px;background-color:#D4A843;color:#1a1a2e;border:none;border-radius:8px;font-size:16px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;cursor:pointer;">
          Submit Cancellation Request
        </button>
      </form>

      <script>
        document.getElementById('claimForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          e.stopPropagation();
          var form = document.getElementById('claimForm');
          var btn = document.getElementById('submitBtn');
          var errDiv = document.getElementById('formError');
          var successDiv = document.getElementById('formSuccess');
          errDiv.style.display = 'none';
          successDiv.style.display = 'none';
          btn.disabled = true;
          btn.textContent = 'Submitting...';

          var data = {
            orderRef: form.elements.orderRef.value,
            email: form.elements.email.value,
            reason: form.elements.reason.value,
            reasonCategory: form.elements.reasonCategory.value
          };

          try {
            const resp = await fetch('/api/protection/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await resp.json();
            if (!resp.ok) {
              errDiv.textContent = result.error || 'Something went wrong';
              errDiv.style.display = 'block';
              btn.disabled = false;
              btn.textContent = 'Submit Cancellation Request';
              return;
            }
            successDiv.innerHTML = 'Your cancellation request <strong>' + result.claimRef + '</strong> has been submitted.<br>We will review it and be in touch via email.';
            successDiv.style.display = 'block';
            btn.style.display = 'none';
            this.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
          } catch (err) {
            errDiv.textContent = 'Network error. Please try again.';
            errDiv.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Submit Cancellation Request';
          }
        });
      </script>
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cancellation Request - Ayr Pavilion</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;min-height:100vh;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 30px;text-align:center;border-bottom:2px solid #D4A843;">
              <h1 style="margin:0;font-size:28px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
              <p style="margin:8px 0 0;color:#888;font-size:14px;letter-spacing:1px;">CANCELLATION REQUEST</p>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;">
              <p style="margin:0;color:#666;font-size:12px;">Ayr Pavilion, 30 The Pavilion, Low Green, Ayr KA7 1HL</p>
              <p style="margin:8px 0 0;color:#555;font-size:11px;">For further enquiries, please contact info@ayrpavilion.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = router;
