const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');

// GET /api/admin/stats/overview
router.get('/overview', adminAuth, (req, res) => {
  try {
    const db = getDb();

    // Core metrics
    const revenue = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'paid'").get();
    const refunds = db.prepare("SELECT COALESCE(SUM(refund_amount), 0) as total, COUNT(CASE WHEN refund_amount > 0 THEN 1 END) as count FROM orders").get();
    const orders = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='paid' THEN 1 END) as paid, COUNT(CASE WHEN status='pending' THEN 1 END) as pending, COUNT(CASE WHEN status='refunded' THEN 1 END) as refunded, COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled FROM orders").get();
    const tickets = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='valid' THEN 1 END) as valid, COUNT(CASE WHEN status='used' THEN 1 END) as used, COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled, COUNT(CASE WHEN status='refunded' THEN 1 END) as refunded FROM tickets").get();
    const events = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='on-sale' THEN 1 END) as on_sale, COUNT(CASE WHEN status='sold-out' THEN 1 END) as sold_out, COUNT(CASE WHEN status='completed' THEN 1 END) as completed FROM events").get();
    const scans = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN result='valid' THEN 1 END) as success, COUNT(CASE WHEN result='already_used' THEN 1 END) as already_used, COUNT(CASE WHEN result='invalid' THEN 1 END) as invalid FROM scans").get();

    // Avg order value
    const avgOrder = db.prepare("SELECT COALESCE(AVG(total), 0) as avg FROM orders WHERE status = 'paid'").get();

    // Booking fees collected
    const fees = db.prepare("SELECT COALESCE(SUM(booking_fee), 0) as total FROM orders WHERE status = 'paid'").get();

    // Today's numbers
    const today = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM orders WHERE status='paid' AND date(created_at) = date('now')) as orders,
        (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status='paid' AND date(created_at) = date('now')) as revenue,
        (SELECT COUNT(*) FROM tickets WHERE status='used' AND date(checked_in_at) = date('now')) as checkins,
        (SELECT COUNT(*) FROM scans WHERE date(scanned_at) = date('now')) as scans
    `).get();

    res.json({
      revenue: { gross: revenue.total, net: revenue.total - refunds.total, refunded: refunds.total, refund_count: refunds.count, fees: fees.total, avg_order: Math.round(avgOrder.avg) },
      orders,
      tickets,
      events,
      scans,
      today
    });
  } catch (err) {
    console.error('Stats overview error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/admin/stats/revenue-chart?days=30
router.get('/revenue-chart', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    const data = db.prepare(`
      SELECT date(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(SUM(CASE WHEN refund_amount > 0 THEN refund_amount ELSE 0 END), 0) as refunds
      FROM orders WHERE status IN ('paid','refunded')
        AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(days);

    res.json(data);
  } catch (err) {
    console.error('Revenue chart error:', err);
    res.status(500).json({ error: 'Failed to load chart' });
  }
});

// GET /api/admin/stats/by-event
router.get('/by-event', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT e.id, e.title, e.date_time, e.status, e.capacity,
        COALESCE(os.order_count, 0) as order_count,
        COALESCE(os.revenue, 0) as revenue,
        COALESCE(ts.tickets_sold, 0) as tickets_sold,
        COALESCE(ts.checked_in, 0) as checked_in,
        COALESCE(os.refunded, 0) as refunded
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*) as order_count, SUM(total) as revenue, SUM(refund_amount) as refunded
        FROM orders WHERE status IN ('paid','refunded')
        GROUP BY event_id
      ) os ON os.event_id = e.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as tickets_sold, COUNT(CASE WHEN status='used' THEN 1 END) as checked_in
        FROM tickets WHERE status IN ('valid','used')
        GROUP BY event_id
      ) ts ON ts.event_id = e.id
      ORDER BY e.date_time DESC
    `).all();

    res.json(data);
  } catch (err) {
    console.error('By-event error:', err);
    res.status(500).json({ error: 'Failed to load event stats' });
  }
});

// GET /api/admin/stats/ticket-types
router.get('/ticket-types', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT tt.name, tt.price, e.title as event_title,
        COUNT(t.id) as sold,
        tt.quantity as available,
        COUNT(CASE WHEN t.status='used' THEN 1 END) as used
      FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.status IN ('valid','used')
      GROUP BY tt.id
      ORDER BY e.date_time DESC, tt.sort_order
    `).all();

    res.json(data);
  } catch (err) {
    console.error('Ticket types error:', err);
    res.status(500).json({ error: 'Failed to load ticket type stats' });
  }
});

// GET /api/admin/stats/scans-timeline?days=30
router.get('/scans-timeline', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    const data = db.prepare(`
      SELECT date(scanned_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN result='valid' THEN 1 END) as success,
        COUNT(CASE WHEN result='already_used' THEN 1 END) as duplicate,
        COUNT(CASE WHEN result='invalid' THEN 1 END) as invalid
      FROM scans
      WHERE scanned_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(scanned_at)
      ORDER BY date ASC
    `).all(days);

    res.json(data);
  } catch (err) {
    console.error('Scans timeline error:', err);
    res.status(500).json({ error: 'Failed to load scans timeline' });
  }
});

// GET /api/admin/stats/scanner-leaderboard
router.get('/scanner-leaderboard', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT s.scanned_by as name,
        COUNT(*) as total_scans,
        COUNT(CASE WHEN s.result='valid' THEN 1 END) as successful,
        MIN(s.scanned_at) as first_scan,
        MAX(s.scanned_at) as last_scan
      FROM scans s
      WHERE s.scanned_by IS NOT NULL AND s.scanned_by != ''
      GROUP BY s.scanned_by
      ORDER BY total_scans DESC
    `).all();

    res.json(data);
  } catch (err) {
    console.error('Scanner leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// GET /api/admin/stats/emails
router.get('/emails', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const data = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status='failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status='queued' THEN 1 END) as queued,
        COALESCE(SUM(opened_count), 0) as total_opens,
        COUNT(CASE WHEN opened_count > 0 THEN 1 END) as unique_opens,
        COALESCE(SUM(clicked_count), 0) as total_clicks,
        COUNT(CASE WHEN clicked_count > 0 THEN 1 END) as unique_clicks
      FROM email_logs
    `).get();

    res.json(data);
  } catch (err) {
    console.error('Email stats error:', err);
    res.status(500).json({ error: 'Failed to load email stats' });
  }
});

// GET /api/admin/stats/hourly-pattern
router.get('/hourly-pattern', adminAuth, (req, res) => {
  try {
    const db = getDb();

    const purchases = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
      FROM orders WHERE status = 'paid'
      GROUP BY hour ORDER BY hour
    `).all();

    const checkins = db.prepare(`
      SELECT CAST(strftime('%H', scanned_at) AS INTEGER) as hour, COUNT(*) as count
      FROM scans WHERE result = 'success'
      GROUP BY hour ORDER BY hour
    `).all();

    res.json({ purchases, checkins });
  } catch (err) {
    console.error('Hourly pattern error:', err);
    res.status(500).json({ error: 'Failed to load hourly patterns' });
  }
});

// GET /api/admin/stats/event-report/:eventId — Comprehensive event intelligence report
router.get('/event-report/:eventId', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const eventId = req.params.eventId;

    // 1. Event details
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // 2. Ticket types with full breakdown
    const ticketTypes = db.prepare(`
      SELECT tt.id, tt.name, tt.price, tt.quantity,
        COUNT(CASE WHEN t.status IN ('valid','used') THEN 1 END) as sold,
        COUNT(CASE WHEN t.status = 'used' THEN 1 END) as checked_in,
        COUNT(CASE WHEN t.status = 'valid' THEN 1 END) as valid,
        COUNT(CASE WHEN t.status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN t.status = 'refunded' THEN 1 END) as refunded
      FROM ticket_types tt
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id
      WHERE tt.event_id = ?
      GROUP BY tt.id
      ORDER BY tt.sort_order
    `).all(eventId);

    for (const tt of ticketTypes) {
      tt.sell_through_pct = tt.quantity > 0 ? Math.round((tt.sold / tt.quantity) * 1000) / 10 : 0;
    }

    // 3. Financial summary
    const financials = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN total ELSE 0 END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN booking_fee ELSE 0 END), 0) as booking_fees,
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN refund_amount ELSE 0 END), 0) as refunds,
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded','comp') THEN protection_fee ELSE 0 END), 0) as protection_fees
      FROM orders WHERE event_id = ?
    `).get(eventId);
    financials.net_revenue = financials.gross_revenue - financials.refunds;

    // 4. Sales timeline — hourly buckets
    const salesTimeline = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as orders, SUM(total) as revenue
      FROM orders WHERE event_id = ? AND status = 'paid'
      GROUP BY hour ORDER BY hour ASC
    `).all(eventId);

    // 5. Booking velocity
    const velocityData = db.prepare(`
      SELECT MIN(created_at) as first_sale, MAX(created_at) as last_sale, COUNT(*) as total_orders
      FROM orders WHERE event_id = ? AND status = 'paid'
    `).get(eventId);

    const peakHourRow = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as cnt
      FROM orders WHERE event_id = ? AND status = 'paid'
      GROUP BY hour ORDER BY cnt DESC LIMIT 1
    `).get(eventId);

    let avgMinsBetween = 0;
    if (velocityData.first_sale && velocityData.last_sale && velocityData.total_orders > 1) {
      const firstMs = new Date(velocityData.first_sale).getTime();
      const lastMs = new Date(velocityData.last_sale).getTime();
      const totalHours = (lastMs - firstMs) / (1000 * 60 * 60);
      avgMinsBetween = Math.round(((lastMs - firstMs) / (1000 * 60)) / (velocityData.total_orders - 1) * 10) / 10;
      velocityData.total_hours_selling = Math.round(totalHours * 10) / 10;
    } else {
      velocityData.total_hours_selling = 0;
    }
    velocityData.peak_hour = peakHourRow ? peakHourRow.hour : null;
    velocityData.avg_minutes_between_orders = avgMinsBetween;

    // 6. Check-in / arrival intelligence
    const validScans = db.prepare(`
      SELECT s.scanned_at FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = ? AND s.result = 'valid'
      ORDER BY s.scanned_at ASC
    `).all(eventId);

    let arrivalCurve = [];
    let peakArrivalTime = null;
    let earlyPct = 0, onTimePct = 0, latePct = 0;

    if (validScans.length > 0 && event.doors_open) {
      const doorsMs = new Date(event.doors_open).getTime();
      const buckets = {};
      let earlyCount = 0, onTimeCount = 0, lateCount = 0;
      let maxBucketCount = 0;

      for (const scan of validScans) {
        const scanMs = new Date(scan.scanned_at).getTime();
        const offsetMins = Math.floor((scanMs - doorsMs) / (1000 * 60));
        const bucketKey = Math.floor(offsetMins / 15) * 15;
        buckets[bucketKey] = (buckets[bucketKey] || 0) + 1;

        if (offsetMins < 0) earlyCount++;
        else if (offsetMins <= 30) onTimeCount++;
        else lateCount++;
      }

      const total = validScans.length;
      earlyPct = Math.round((earlyCount / total) * 1000) / 10;
      onTimePct = Math.round((onTimeCount / total) * 1000) / 10;
      latePct = Math.round((lateCount / total) * 1000) / 10;

      arrivalCurve = Object.entries(buckets).map(([offset, count]) => {
        if (count > maxBucketCount) {
          maxBucketCount = count;
          peakArrivalTime = `doors ${parseInt(offset) >= 0 ? '+' : ''}${offset} mins`;
        }
        return { offset_mins: parseInt(offset), count };
      }).sort((a, b) => a.offset_mins - b.offset_mins);
    }

    const arrivalIntel = { arrival_curve: arrivalCurve, peak_arrival_time: peakArrivalTime, early_pct: earlyPct, on_time_pct: onTimePct, late_pct: latePct };

    // 7. No-show analysis
    const eventPassed = new Date(event.date_time) < new Date();
    let noShows = [];
    if (eventPassed) {
      noShows = db.prepare(`
        SELECT tt.name as ticket_type, COUNT(*) as no_show_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM tickets t2 WHERE t2.ticket_type_id = tt.id AND t2.status IN ('valid','used')), 0), 1) as no_show_pct
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.event_id = ? AND t.status = 'valid'
        GROUP BY tt.id
      `).all(eventId);
    }

    // 8. Add-on performance
    const addons = db.prepare(`
      SELECT a.id, a.name, a.type, a.price, a.per_ticket FROM addons a WHERE a.event_id = ? AND a.active = 1 ORDER BY a.sort_order
    `).all(eventId);

    const totalTicketsSold = ticketTypes.reduce((s, tt) => s + tt.sold, 0);

    for (const addon of addons) {
      if (addon.type === 'select') {
        addon.options = db.prepare(`
          SELECT ao.label, COUNT(oas.id) as count
          FROM addon_options ao
          LEFT JOIN order_addon_selections oas ON oas.addon_option_id = ao.id AND oas.addon_id = ?
          WHERE ao.addon_id = ? AND ao.active = 1
          GROUP BY ao.id ORDER BY ao.sort_order
        `).all(addon.id, addon.id);
        addon.total_selected = addon.options.reduce((s, o) => s + o.count, 0);
      } else if (addon.type === 'checkbox') {
        const sel = db.prepare('SELECT COUNT(*) as count FROM order_addon_selections WHERE addon_id = ? AND quantity > 0').get(addon.id);
        addon.total_selected = sel.count;
      } else if (addon.type === 'quantity') {
        const sel = db.prepare('SELECT COALESCE(SUM(quantity), 0) as total FROM order_addon_selections WHERE addon_id = ?').get(addon.id);
        addon.total_selected = sel.total;
      }
      addon.uptake_pct = totalTicketsSold > 0 ? Math.round((addon.total_selected / totalTicketsSold) * 1000) / 10 : 0;

      const addonRev = db.prepare('SELECT COALESCE(SUM(price * quantity), 0) as revenue FROM order_addon_selections WHERE addon_id = ?').get(addon.id);
      addon.revenue = addonRev.revenue;
    }

    // 9. Protection claims
    const protectedTickets = db.prepare(`
      SELECT COUNT(*) as count FROM orders WHERE event_id = ? AND protection_opted = 1 AND status IN ('paid','refunded','comp')
    `).get(eventId);

    const protectionRevenue = db.prepare(`
      SELECT COALESCE(SUM(protection_fee), 0) as total FROM orders WHERE event_id = ? AND protection_opted = 1 AND status IN ('paid','refunded','comp')
    `).get(eventId);

    const claims = db.prepare(`
      SELECT
        COUNT(*) as total_claims,
        COUNT(CASE WHEN pc.status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN pc.status = 'denied' THEN 1 END) as denied,
        COUNT(CASE WHEN pc.status = 'pending' THEN 1 END) as pending,
        COALESCE(SUM(CASE WHEN pc.status = 'approved' THEN pc.refund_amount ELSE 0 END), 0) as total_refunded
      FROM protection_claims pc
      WHERE pc.order_id IN (SELECT id FROM orders WHERE event_id = ?)
    `).get(eventId);

    claims.total_protected_tickets = protectedTickets.count;
    claims.protection_revenue = protectionRevenue.total;
    claims.claim_rate = protectedTickets.count > 0 ? Math.round((claims.total_claims / protectedTickets.count) * 1000) / 10 : 0;

    // 10. Customer intelligence
    const customerEmails = db.prepare(`
      SELECT customer_email FROM orders WHERE event_id = ? AND status IN ('paid','comp') GROUP BY customer_email
    `).all(eventId);

    let newCustomers = 0, repeatCustomers = 0;
    for (const c of customerEmails) {
      const prior = db.prepare(`
        SELECT COUNT(*) as cnt FROM orders WHERE customer_email = ? AND event_id != ? AND status IN ('paid','comp')
      `).get(c.customer_email, eventId);
      if (prior.cnt > 0) repeatCustomers++;
      else newCustomers++;
    }

    const optIn = db.prepare(`
      SELECT COUNT(*) as count FROM orders WHERE event_id = ? AND marketing_opt_in = 1 AND status = 'paid'
    `).get(eventId);

    const paidOrders = db.prepare(`
      SELECT COUNT(*) as count FROM orders WHERE event_id = ? AND status = 'paid'
    `).get(eventId);

    const avgSpend = db.prepare(`
      SELECT COALESCE(AVG(total), 0) as avg FROM orders WHERE event_id = ? AND status = 'paid'
    `).get(eventId);

    const customerIntel = {
      new_customers: newCustomers,
      repeat_customers: repeatCustomers,
      marketing_opt_in_count: optIn.count,
      opt_in_rate: paidOrders.count > 0 ? Math.round((optIn.count / paidOrders.count) * 1000) / 10 : 0,
      avg_spend_per_customer: Math.round(avgSpend.avg)
    };

    // 11. Scanner performance
    const scannerPerf = db.prepare(`
      SELECT s.scanned_by as name,
        COUNT(*) as total_scans,
        COUNT(CASE WHEN s.result = 'valid' THEN 1 END) as valid_scans,
        COUNT(CASE WHEN s.result != 'valid' THEN 1 END) as invalid_scans,
        MIN(s.scanned_at) as first_scan,
        MAX(s.scanned_at) as last_scan
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = ? AND s.scanned_by IS NOT NULL AND s.scanned_by != ''
      GROUP BY s.scanned_by
      ORDER BY total_scans DESC
    `).all(eventId);

    // 12. Email engagement
    const emailEngagement = db.prepare(`
      SELECT
        COUNT(*) as total_sent,
        COUNT(CASE WHEN opened_count > 0 THEN 1 END) as total_opened,
        COUNT(CASE WHEN clicked_count > 0 THEN 1 END) as total_clicked
      FROM email_logs
      WHERE order_id IN (SELECT id FROM orders WHERE event_id = ?)
    `).get(eventId);
    emailEngagement.open_rate = emailEngagement.total_sent > 0 ? Math.round((emailEngagement.total_opened / emailEngagement.total_sent) * 1000) / 10 : 0;
    emailEngagement.click_rate = emailEngagement.total_sent > 0 ? Math.round((emailEngagement.total_clicked / emailEngagement.total_sent) * 1000) / 10 : 0;

    // 13. Order manifest
    const manifest = db.prepare(`
      SELECT o.order_ref, o.customer_name, o.customer_email, o.customer_phone, o.total, o.status, o.created_at
      FROM orders o WHERE o.event_id = ? AND o.status IN ('paid','comp','refunded')
      ORDER BY o.created_at ASC
    `).all(eventId);

    for (const order of manifest) {
      order.tickets = db.prepare(`
        SELECT t.code, tt.name as ticket_type, t.status, t.checked_in_at
        FROM tickets t JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.order_id = (SELECT id FROM orders WHERE order_ref = ? LIMIT 1)
      `).all(order.order_ref);

      order.addons = db.prepare(`
        SELECT a.name, oas.selected_option, oas.quantity
        FROM order_addon_selections oas
        JOIN addons a ON oas.addon_id = a.id
        WHERE oas.order_id = (SELECT id FROM orders WHERE order_ref = ? LIMIT 1)
      `).all(order.order_ref);
    }

    res.json({
      event,
      ticket_types: ticketTypes,
      financials,
      sales_timeline: salesTimeline,
      booking_velocity: velocityData,
      arrival_intelligence: arrivalIntel,
      no_shows: noShows,
      addons,
      protection_claims: claims,
      customer_intelligence: customerIntel,
      scanner_performance: scannerPerf,
      email_engagement: emailEngagement,
      manifest
    });
  } catch (err) {
    console.error('Event report error:', err.message);
    res.status(500).json({ error: 'Failed to generate event report' });
  }
});

// GET /api/admin/stats/event-groups — List event groups for combined reports
router.get('/event-groups', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const events = db.prepare(`
      SELECT id, title, date_time, status, venue
      FROM events ORDER BY date_time DESC
    `).all();

    // Group by prefix before " — " (em dash)
    const groups = {};
    for (const e of events) {
      const dashIdx = e.title.indexOf(' \u2014 ');
      const prefix = dashIdx > -1 ? e.title.substring(0, dashIdx) : e.title;
      if (!groups[prefix]) {
        groups[prefix] = { name: prefix, sessions: [], venue: e.venue, event_ids: [] };
      }
      groups[prefix].sessions.push({
        id: e.id, title: e.title, date_time: e.date_time, status: e.status
      });
      groups[prefix].event_ids.push(e.id);
    }

    // Only return groups with 2+ sessions
    const multiSession = Object.values(groups).filter(g => g.sessions.length > 1);
    // Also return singles for completeness
    const singles = Object.values(groups).filter(g => g.sessions.length === 1);

    res.json({ multi_session: multiSession, single: singles });
  } catch (err) {
    console.error('Event groups error:', err.message);
    res.status(500).json({ error: 'Failed to load event groups' });
  }
});

// GET /api/admin/stats/combined-report?ids=1,2,3 — Combined multi-session event report
router.get('/combined-report', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const ids = (req.query.ids || '').split(',').map(Number).filter(n => n > 0);
    if (ids.length === 0) return res.status(400).json({ error: 'Provide event ids as ?ids=1,2,3' });

    const placeholders = ids.map(() => '?').join(',');
    const events = db.prepare(`SELECT * FROM events WHERE id IN (${placeholders}) ORDER BY date_time ASC`).all(...ids);
    if (events.length === 0) return res.status(404).json({ error: 'No events found' });

    // Determine group name
    const firstTitle = events[0].title;
    const dashIdx = firstTitle.indexOf(' \u2014 ');
    const groupName = dashIdx > -1 ? firstTitle.substring(0, dashIdx) : firstTitle;

    // Aggregate across all sessions
    const allTicketTypes = db.prepare(`
      SELECT tt.name, tt.price, SUM(tt.quantity) as quantity, SUM(tt.sold) as sold,
        SUM((SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'used')) as checked_in,
        SUM((SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'valid')) as valid,
        SUM((SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'cancelled')) as cancelled,
        SUM((SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'refunded')) as refunded
      FROM ticket_types tt WHERE tt.event_id IN (${placeholders})
      GROUP BY tt.name, tt.price
      ORDER BY tt.name
    `).all(...ids);

    for (const tt of allTicketTypes) {
      tt.sell_through_pct = tt.quantity > 0 ? Math.round(tt.sold / tt.quantity * 1000) / 10 : 0;
    }

    // Financials
    const fin = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('paid','comp') THEN total ELSE 0 END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN booking_fee ELSE 0 END), 0) as booking_fees,
        COALESCE(SUM(refund_amount), 0) as refunds,
        COALESCE(SUM(CASE WHEN protection_opted = 1 THEN protection_fee ELSE 0 END), 0) as protection_fees,
        COUNT(CASE WHEN status IN ('paid','comp') THEN 1 END) as total_orders
      FROM orders WHERE event_id IN (${placeholders})
    `).get(...ids);
    fin.net_revenue = fin.gross_revenue + fin.booking_fees - fin.refunds;

    // Sales timeline across all sessions
    const salesTimeline = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue
      FROM orders WHERE event_id IN (${placeholders}) AND status IN ('paid','comp')
      GROUP BY hour ORDER BY hour ASC
    `).all(...ids);

    // Booking velocity
    const velocityRows = db.prepare(`
      SELECT created_at FROM orders
      WHERE event_id IN (${placeholders}) AND status IN ('paid','comp')
      ORDER BY created_at ASC
    `).all(...ids);
    const velocityData = {};
    if (velocityRows.length > 0) {
      velocityData.first_sale = velocityRows[0].created_at;
      velocityData.last_sale = velocityRows[velocityRows.length - 1].created_at;
      velocityData.total_orders = velocityRows.length;
      const firstMs = new Date(velocityData.first_sale).getTime();
      const lastMs = new Date(velocityData.last_sale).getTime();
      velocityData.total_hours_selling = Math.round((lastMs - firstMs) / 3600000 * 10) / 10;
      velocityData.avg_minutes_between_orders = velocityRows.length > 1
        ? Math.round((lastMs - firstMs) / (velocityRows.length - 1) / 60000 * 10) / 10 : 0;

      const hourCounts = {};
      for (const r of velocityRows) {
        const h = r.created_at.substring(0, 13) + ':00';
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }
      velocityData.peak_hour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    // Per-session breakdown
    const sessionReports = [];
    for (const evt of events) {
      const eid = evt.id;
      const sTT = db.prepare(`
        SELECT tt.name, tt.price, tt.quantity, tt.sold,
          (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'used') as checked_in,
          (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id AND t.status = 'valid') as valid
        FROM ticket_types tt WHERE tt.event_id = ? ORDER BY tt.sort_order
      `).all(eid);

      const sFin = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN status IN ('paid','comp') THEN total ELSE 0 END), 0) as gross_revenue,
          COUNT(CASE WHEN status IN ('paid','comp') THEN 1 END) as total_orders
        FROM orders WHERE event_id = ?
      `).get(eid);

      const totalSold = sTT.reduce((s, t) => s + t.sold, 0);
      const totalCheckedIn = sTT.reduce((s, t) => s + t.checked_in, 0);
      const totalValid = sTT.reduce((s, t) => s + t.valid, 0);

      // Arrival data per session
      const doorsTime = new Date(evt.doors_open || evt.date_time).getTime();
      const scanTimes = db.prepare(`
        SELECT s.scanned_at FROM scans s
        JOIN tickets t ON s.ticket_id = t.id
        WHERE t.event_id = ? AND s.result = 'valid'
        ORDER BY s.scanned_at
      `).all(eid);

      let peakArrival = null;
      let early = 0, onTime = 0, late = 0;
      if (scanTimes.length > 0) {
        for (const sc of scanTimes) {
          const offset = (new Date(sc.scanned_at).getTime() - doorsTime) / 60000;
          if (offset < 0) early++;
          else if (offset <= 30) onTime++;
          else late++;
        }
        const total = scanTimes.length;
        early = Math.round(early / total * 1000) / 10;
        onTime = Math.round(onTime / total * 1000) / 10;
        late = Math.round(late / total * 1000) / 10;
      }

      sessionReports.push({
        id: evt.id,
        title: evt.title,
        date_time: evt.date_time,
        doors_open: evt.doors_open,
        status: evt.status,
        ticket_types: sTT,
        total_sold: totalSold,
        total_checked_in: totalCheckedIn,
        total_no_shows: totalValid,
        checkin_rate: totalSold > 0 ? Math.round(totalCheckedIn / totalSold * 1000) / 10 : 0,
        no_show_rate: totalSold > 0 ? Math.round(totalValid / totalSold * 1000) / 10 : 0,
        gross_revenue: sFin.gross_revenue,
        total_orders: sFin.total_orders,
        arrival: { early_pct: early, on_time_pct: onTime, late_pct: late }
      });
    }

    // No-shows (aggregate)
    const noShows = db.prepare(`
      SELECT tt.name as ticket_type, COUNT(*) as no_show_count,
        (SELECT COUNT(*) FROM tickets t2 WHERE t2.ticket_type_id = tt.id AND t2.status IN ('valid','used')) as sold
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.event_id IN (${placeholders}) AND t.status = 'valid'
      GROUP BY tt.name
    `).all(...ids);
    for (const n of noShows) {
      n.no_show_pct = n.sold > 0 ? Math.round(n.no_show_count / n.sold * 1000) / 10 : 0;
    }

    // Customer intelligence (across all sessions)
    const customerEmails = db.prepare(`
      SELECT DISTINCT customer_email FROM orders
      WHERE event_id IN (${placeholders}) AND status IN ('paid','comp')
    `).all(...ids).map(r => r.customer_email);

    let newCustomers = 0, repeatCustomers = 0, optInCount = 0;
    const totalCustomers = customerEmails.length;
    for (const email of customerEmails) {
      const prior = db.prepare(`
        SELECT COUNT(*) as c FROM orders
        WHERE customer_email = ? AND status = 'paid' AND event_id NOT IN (${placeholders})
      `).get(email, ...ids);
      if (prior.c > 0) repeatCustomers++;
      else newCustomers++;

      const opted = db.prepare(`
        SELECT marketing_opt_in FROM orders
        WHERE customer_email = ? AND event_id IN (${placeholders}) AND marketing_opt_in = 1 LIMIT 1
      `).get(email, ...ids);
      if (opted) optInCount++;
    }

    const avgSpend = fin.total_orders > 0 ? Math.round(fin.gross_revenue / fin.total_orders) : 0;

    // Protection claims
    const claimsData = db.prepare(`
      SELECT
        COUNT(*) as total_claims,
        COUNT(CASE WHEN pc.status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN pc.status = 'denied' THEN 1 END) as denied,
        COUNT(CASE WHEN pc.status = 'pending' THEN 1 END) as pending,
        COALESCE(SUM(CASE WHEN pc.status = 'approved' THEN pc.refund_amount ELSE 0 END), 0) as total_refunded
      FROM protection_claims pc
      JOIN orders o ON pc.order_id = o.id
      WHERE o.event_id IN (${placeholders})
    `).get(...ids);

    // Comp orders
    const compData = db.prepare(`
      SELECT COUNT(*) as total_comps,
        COUNT(DISTINCT cc.id) as comp_codes_used
      FROM orders o
      LEFT JOIN comp_codes cc ON o.comp_code_id = cc.id
      WHERE o.event_id IN (${placeholders}) AND o.status = 'comp'
    `).get(...ids);

    // Email engagement
    const emailData = db.prepare(`
      SELECT COUNT(*) as total_sent,
        COUNT(CASE WHEN opened_count > 0 THEN 1 END) as total_opened,
        COUNT(CASE WHEN clicked_count > 0 THEN 1 END) as total_clicked
      FROM email_logs WHERE order_id IN (SELECT id FROM orders WHERE event_id IN (${placeholders}))
    `).get(...ids);
    const emailEngagement = {
      total_sent: emailData.total_sent,
      total_opened: emailData.total_opened,
      total_clicked: emailData.total_clicked,
      open_rate: emailData.total_sent > 0 ? Math.round(emailData.total_opened / emailData.total_sent * 1000) / 10 : 0,
      click_rate: emailData.total_sent > 0 ? Math.round(emailData.total_clicked / emailData.total_sent * 1000) / 10 : 0
    };

    // Scanner performance
    const scannerPerf = db.prepare(`
      SELECT s.scanned_by as name, COUNT(*) as total_scans,
        COUNT(CASE WHEN s.result = 'valid' THEN 1 END) as valid_scans,
        COUNT(CASE WHEN s.result IN ('invalid','already_used') THEN 1 END) as invalid_scans,
        MIN(s.scanned_at) as first_scan, MAX(s.scanned_at) as last_scan
      FROM scans s JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id IN (${placeholders}) AND s.scanned_by IS NOT NULL
      GROUP BY s.scanned_by ORDER BY total_scans DESC
    `).all(...ids);

    const totalSold = allTicketTypes.reduce((s, t) => s + t.sold, 0);
    const totalCheckedIn = allTicketTypes.reduce((s, t) => s + t.checked_in, 0);
    const totalNoShows = allTicketTypes.reduce((s, t) => s + t.valid, 0);

    // Aggregate arrival intelligence across all sessions
    const allScanTimes = [];
    for (const evt of events) {
      const doorsTime = new Date(evt.doors_open || evt.date_time).getTime();
      const scans = db.prepare(`
        SELECT s.scanned_at FROM scans s
        JOIN tickets t ON s.ticket_id = t.id
        WHERE t.event_id = ? AND s.result = 'valid'
      `).all(evt.id);
      for (const sc of scans) {
        allScanTimes.push({ offset_mins: Math.round((new Date(sc.scanned_at).getTime() - doorsTime) / 60000) });
      }
    }
    let arrivalIntel = { arrival_curve: [], peak_arrival_time: null, early_pct: 0, on_time_pct: 0, late_pct: 0 };
    if (allScanTimes.length > 0) {
      let early = 0, onTime = 0, late = 0;
      const buckets = {};
      for (const sc of allScanTimes) {
        const bucket = Math.floor(sc.offset_mins / 15) * 15;
        buckets[bucket] = (buckets[bucket] || 0) + 1;
        if (sc.offset_mins < 0) early++;
        else if (sc.offset_mins <= 30) onTime++;
        else late++;
      }
      const total = allScanTimes.length;
      const curve = Object.entries(buckets).sort((a,b) => Number(a[0]) - Number(b[0])).map(([k,v]) => ({
        offset_mins: Number(k), count: v, label: Number(k) < 0 ? k + 'm' : '+' + k + 'm'
      }));
      const peak = curve.reduce((max, b) => b.count > (max?.count || 0) ? b : max, null);
      arrivalIntel = {
        arrival_curve: curve,
        peak_arrival_time: peak ? peak.label : null,
        early_pct: Math.round(early / total * 1000) / 10,
        on_time_pct: Math.round(onTime / total * 1000) / 10,
        late_pct: Math.round(late / total * 1000) / 10
      };
    }

    res.json({
      generated_at: new Date().toISOString(),
      is_combined: true,
      group_name: groupName,
      total_sessions: events.length,
      date_range: {
        first: events[0].date_time,
        last: events[events.length - 1].date_time
      },
      venue: events[0].venue,
      summary: {
        total_sold: totalSold,
        total_checked_in: totalCheckedIn,
        total_no_shows: totalNoShows,
        checkin_rate: totalSold > 0 ? Math.round(totalCheckedIn / totalSold * 1000) / 10 : 0,
        no_show_rate: totalSold > 0 ? Math.round(totalNoShows / totalSold * 1000) / 10 : 0
      },
      ticket_types: allTicketTypes,
      financials: fin,
      sales_timeline: salesTimeline,
      booking_velocity: velocityData,
      arrival_intelligence: arrivalIntel,
      no_shows: noShows,
      sessions: sessionReports,
      protection_claims: claimsData,
      comps: compData,
      customer_intelligence: {
        total_unique_customers: totalCustomers,
        new_customers: newCustomers,
        repeat_customers: repeatCustomers,
        marketing_opt_in_count: optInCount,
        opt_in_rate: totalCustomers > 0 ? Math.round(optInCount / totalCustomers * 1000) / 10 : 0,
        avg_spend: avgSpend
      },
      scanner_performance: scannerPerf,
      email_engagement: emailEngagement
    });
  } catch (err) {
    console.error('Combined report error:', err.message);
    res.status(500).json({ error: 'Failed to generate combined report' });
  }
});

module.exports = router;

// GET /api/admin/stats/event/:eventId — Full event operations view
router.get('/event/:eventId', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const eventId = req.params.eventId;

    // Event info
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Ticket types with sales
    const ticketTypes = db.prepare(`
      SELECT tt.*,
        COUNT(t.id) as sold,
        COUNT(CASE WHEN t.status='used' THEN 1 END) as checked_in,
        COUNT(CASE WHEN t.status='cancelled' THEN 1 END) as cancelled
      FROM ticket_types tt
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.status IN ('valid','used','cancelled')
      WHERE tt.event_id = ?
      GROUP BY tt.id
      ORDER BY tt.sort_order
    `).all(eventId);

    // Orders summary
    const orders = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status='paid' THEN 1 END) as paid,
        COUNT(CASE WHEN status='pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status='refunded' THEN 1 END) as refunded,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END), 0) as revenue,
        COALESCE(SUM(booking_fee), 0) as total_fees,
        COALESCE(SUM(refund_amount), 0) as total_refunds
      FROM orders WHERE event_id = ?
    `).get(eventId);

    // Recent orders
    const recentOrders = db.prepare(`
      SELECT o.id, o.order_ref, o.customer_name, o.customer_email, o.total, o.status, o.created_at,
        COUNT(t.id) as ticket_count
      FROM orders o
      LEFT JOIN tickets t ON t.order_id = o.id AND t.status IN ('valid','used')
      WHERE o.event_id = ? AND o.status = 'paid'
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 20
    `).all(eventId);

    // Addons — aggregate selections per addon
    const addons = db.prepare(`
      SELECT a.id, a.name, a.type, a.price, a.per_ticket
      FROM addons a
      WHERE a.event_id = ? AND a.active = 1
      ORDER BY a.sort_order
    `).all(eventId);

    // For each addon, get option-level breakdown
    for (const addon of addons) {
      if (addon.type === 'select') {
        // Get options with stock and reservation counts
        addon.options = db.prepare(`
          SELECT ao.id, ao.label, ao.stock,
            COUNT(oas.id) as reserved
          FROM addon_options ao
          LEFT JOIN order_addon_selections oas ON oas.addon_option_id = ao.id
            AND oas.addon_id = ?
          WHERE ao.addon_id = ? AND ao.active = 1
          GROUP BY ao.id
          ORDER BY ao.sort_order
        `).all(addon.id, addon.id);

        addon.total_reserved = addon.options.reduce((s, o) => s + o.reserved, 0);
        addon.total_stock = addon.options.reduce((s, o) => s + o.stock, 0);
      } else if (addon.type === 'checkbox') {
        const sel = db.prepare(`
          SELECT COUNT(*) as count FROM order_addon_selections
          WHERE addon_id = ? AND quantity > 0
        `).get(addon.id);
        addon.selected_count = sel.count;
      } else if (addon.type === 'quantity') {
        const sel = db.prepare(`
          SELECT COALESCE(SUM(quantity), 0) as total FROM order_addon_selections
          WHERE addon_id = ?
        `).get(addon.id);
        addon.total_quantity = sel.total;
      }
    }

    // Check-in stats
    const checkins = db.prepare(`
      SELECT
        COUNT(CASE WHEN t.status='used' THEN 1 END) as checked_in,
        COUNT(CASE WHEN t.status='valid' THEN 1 END) as remaining,
        COUNT(CASE WHEN t.status IN ('valid','used') THEN 1 END) as total
      FROM tickets t WHERE t.event_id = ?
    `).get(eventId);

    // Sales timeline (orders per hour for this event)
    const timeline = db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00', created_at) as hour,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      WHERE event_id = ? AND status = 'paid'
      GROUP BY hour
      ORDER BY hour ASC
    `).all(eventId);

    res.json({
      event,
      ticketTypes,
      orders,
      recentOrders,
      addons,
      checkins,
      timeline
    });
  } catch (err) {
    console.error('Event stats error:', err.message);
    res.status(500).json({ error: 'Failed to load event stats' });
  }
});
