const { generateQrBuffer } = require('./qr');
const { getDb } = require('../db');

const MAIL_RELAY_URL = process.env.MAIL_RELAY_URL || 'http://192.168.195.33:3880';
const MAIL_RELAY_KEY = process.env.MAIL_RELAY_KEY || 'skynet-mail-relay-key-2026';

async function relaySendMail({ from, to, subject, html, attachments }) {
  const body = { from, to, subject, html };

  if (attachments && attachments.length > 0) {
    body.attachments = attachments.map(a => ({
      filename: a.filename,
      content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)).toString('base64'),
      contentType: a.contentType,
      cid: a.cid,
    }));
  }

  const res = await fetch(`${MAIL_RELAY_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': MAIL_RELAY_KEY },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Mail relay error: ${res.status}`);
  }

  return res.json();
}

function buildGoogleCalendarUrl({ title, dateTime, venue, description }) {
  const startDate = new Date(dateTime);
  const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
  const formatDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: title,
    dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
    location: `${venue}, Ayr, Scotland`,
    details: description || `Tickets for ${title} at ${venue}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function trackUrl(emailLogId, targetUrl) {
  const baseUrl = process.env.API_URL || process.env.APP_URL || 'https://tickets.ayrpavilion.com';
  return `${baseUrl}/api/track/click/${emailLogId}?url=${encodeURIComponent(targetUrl)}`;
}

function trackPixel(emailLogId) {
  const baseUrl = process.env.API_URL || process.env.APP_URL || 'https://tickets.ayrpavilion.com';
  return `${baseUrl}/api/track/open/${emailLogId}`;
}

function formatPrice(pence) {
  return '£' + (pence / 100).toFixed(2);
}

function buildCombinedEmailHtml({ customerName, eventTitle, dateTime, doorsOpen, venue, orderRef, emailLogId, tickets, orderItems, addonDetails, totalPence, bookingFee }) {
  const eventDate = new Date(dateTime);
  const formattedDate = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formattedTime = eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const doorsText = doorsOpen ? new Date(doorsOpen).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;

  const appUrl = process.env.APP_URL || 'https://tickets.ayrpavilion.com';
  const directionsUrl = 'https://maps.google.com/maps?q=Ayr+Pavilion,+30+The+Pavilion,+Low+Green,+Ayr+KA7+1HL';
  const calendarUrl = buildGoogleCalendarUrl({ title: eventTitle, dateTime, venue, description: `${eventTitle} at ${venue}` });

  const trackedCalendarUrl = emailLogId ? trackUrl(emailLogId, calendarUrl) : calendarUrl;
  const trackedDirectionsUrl = emailLogId ? trackUrl(emailLogId, directionsUrl) : directionsUrl;
  const pixelTag = emailLogId ? `<img src="${trackPixel(emailLogId)}" width="1" height="1" style="display:none;" alt="">` : '';

  // --- Build order summary rows ---
  let orderRowsHtml = '';
  if (orderItems && orderItems.length > 0) {
    for (const item of orderItems) {
      const lineTotal = item.price * item.quantity;
      orderRowsHtml += `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a4a;color:#fff;font-size:14px;">
            ${item.ticketTypeName} ${item.quantity > 1 ? `<span style="color:#888;">×${item.quantity}</span>` : ''}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a4a;color:#fff;font-size:14px;text-align:right;">
            ${formatPrice(lineTotal)}
          </td>
        </tr>`;
    }
  }

  // Addon rows
  if (addonDetails && addonDetails.length > 0) {
    for (const a of addonDetails) {
      const lineTotal = (a.price || 0) * (a.quantity || 1);
      orderRowsHtml += `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a4a;color:#ccc;font-size:13px;">
            ${a.name}${a.option ? ': ' + a.option : ''} ${a.quantity > 1 ? `<span style="color:#888;">×${a.quantity}</span>` : ''}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a4a;color:#ccc;font-size:13px;text-align:right;">
            ${lineTotal > 0 ? formatPrice(lineTotal) : 'Free'}
          </td>
        </tr>`;
    }
  }

  // Booking fee row
  if (bookingFee && bookingFee > 0) {
    orderRowsHtml += `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a4a;color:#888;font-size:13px;">Booking Fee</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a4a;color:#888;font-size:13px;text-align:right;">${formatPrice(bookingFee)}</td>
      </tr>`;
  }

  // --- Build ticket QR sections ---
  let ticketSectionsHtml = '';
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const viewUrl = `${appUrl}/tickets/${t.code}`;
    const trackedViewUrl = emailLogId ? trackUrl(emailLogId, viewUrl) : viewUrl;
    ticketSectionsHtml += `
      ${tickets.length > 1 ? `<p style="margin:20px 0 8px;color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Ticket ${i + 1} of ${tickets.length} — ${t.ticketTypeName || 'General'}</p>` : ''}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:15px;">
        <tr>
          <td align="center" style="padding:20px;background-color:#12122a;border-radius:12px;border:1px solid #D4A843;">
            <p style="margin:0 0 12px;color:#D4A843;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Scan for Entry</p>
            <img src="cid:qr_${i}" alt="QR Code" width="200" height="200" style="display:block;margin:0 auto;border-radius:8px;">
            <p style="margin:10px 0 0;color:#666;font-size:11px;font-family:monospace;letter-spacing:1px;">${t.code}</p>
            <a href="${trackedViewUrl}" style="display:inline-block;margin-top:8px;color:#D4A843;font-size:11px;text-decoration:none;">View Online →</a>
          </td>
        </tr>
      </table>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation - ${eventTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 30px;text-align:center;border-bottom:2px solid #D4A843;">
              <h1 style="margin:0;font-size:28px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
              <p style="margin:8px 0 0;color:#888;font-size:14px;letter-spacing:1px;">ORDER CONFIRMATION & TICKETS</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:30px 30px 0;">
              <p style="margin:0 0 5px;color:#fff;font-size:16px;">Hi ${customerName || 'there'},</p>
              <p style="margin:0;color:#999;font-size:14px;">Thanks for your order! Here's your receipt and tickets.</p>
            </td>
          </tr>

          <!-- Event Details -->
          <tr>
            <td style="padding:20px 30px;">
              <h2 style="margin:0 0 15px;font-size:22px;color:#ffffff;text-align:center;">${eventTitle}</h2>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;">
                    <span style="color:#D4A843;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Date</span><br>
                    <span style="color:#ffffff;font-size:15px;">${formattedDate}</span>
                  </td>
                </tr>
                <tr><td style="height:6px;"></td></tr>
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <span style="color:#D4A843;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Time</span><br>
                          <span style="color:#ffffff;font-size:15px;">${formattedTime}</span>
                        </td>
                        ${doorsText ? `<td width="50%">
                          <span style="color:#D4A843;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Doors Open</span><br>
                          <span style="color:#ffffff;font-size:15px;">${doorsText}</span>
                        </td>` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:6px;"></td></tr>
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;">
                    <span style="color:#D4A843;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Venue</span><br>
                    <span style="color:#ffffff;font-size:15px;">${venue}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order Summary / Receipt -->
          <tr>
            <td style="padding:0 30px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
                <tr>
                  <td colspan="2" style="padding:15px 20px 10px;border-bottom:2px solid #D4A843;">
                    <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Order Summary</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:5px 20px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${orderRowsHtml}
                      <!-- Total -->
                      <tr>
                        <td style="padding:15px 0 10px;color:#fff;font-size:16px;font-weight:bold;">Total Paid</td>
                        <td style="padding:15px 0 10px;color:#D4A843;font-size:20px;font-weight:bold;text-align:right;">${formatPrice(totalPence)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:0 20px 15px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:10px 12px;background-color:#0a0a1a;border-radius:8px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="50%">
                                <span style="color:#888;font-size:11px;text-transform:uppercase;">Order Ref</span><br>
                                <span style="color:#fff;font-size:14px;font-family:monospace;font-weight:bold;">${orderRef}</span>
                              </td>
                              <td width="50%" style="text-align:right;">
                                <span style="color:#888;font-size:11px;text-transform:uppercase;">Payment</span><br>
                                <span style="color:#4ade80;font-size:14px;font-weight:bold;">✓ Paid</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tickets Section -->
          <tr>
            <td style="padding:0 30px 20px;">
              <p style="margin:0 0 15px;color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;text-align:center;">
                ${tickets.length > 1 ? `Your ${tickets.length} Tickets` : 'Your Ticket'}
              </p>
              ${ticketSectionsHtml}
            </td>
          </tr>

          <!-- Action Buttons -->
          <tr>
            <td style="padding:0 30px 25px;text-align:center;">
              <a href="${trackedCalendarUrl}" target="_blank" style="display:inline-block;padding:14px 30px;background-color:#D4A843;color:#1a1a2e;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;text-transform:uppercase;letter-spacing:1px;">
                Add to Calendar
              </a>
              <br><br>
              <a href="${trackedDirectionsUrl}" target="_blank" style="display:inline-block;padding:10px 25px;border:1px solid #555;color:#999;text-decoration:none;border-radius:8px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">
                Get Directions
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;">
              <p style="margin:0 0 8px;color:#666;font-size:12px;">Ayr Pavilion · 30 The Pavilion · Low Green · Ayr KA7 1HL</p>
              <p style="margin:0 0 8px;color:#666;font-size:12px;">Please have your QR code ready at the door for scanning.</p>
              <p style="margin:0 0 8px;color:#555;font-size:11px;">This ticket is non-transferable. No refunds unless the event is cancelled.</p>
              <p style="margin:0;color:#444;font-size:11px;">Questions? Contact us at info@ayrpavilion.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  ${pixelTag}
</body>
</html>`;
}

// --- Legacy single-ticket template (kept for resend compatibility) ---
function buildEmailHtml(params) {
  return buildCombinedEmailHtml({
    ...params,
    customerName: null,
    tickets: [{ code: params.ticketCode, ticketTypeName: params.ticketTypeName }],
    orderItems: [{ ticketTypeName: params.ticketTypeName, quantity: params.quantity || 1, price: 0 }],
    totalPence: 0,
    bookingFee: 0,
  });
}

function logEmail({ ticketId, orderId, recipient, subject }) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO email_logs (ticket_id, order_id, recipient, subject, status)
    VALUES (?, ?, ?, ?, 'queued')
  `).run(ticketId || null, orderId || null, recipient, subject);
  return result.lastInsertRowid;
}

function markEmailSent(emailLogId) {
  const db = getDb();
  db.prepare(`UPDATE email_logs SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).run(emailLogId);
}

function markEmailFailed(emailLogId, error) {
  const db = getDb();
  db.prepare(`UPDATE email_logs SET status = 'failed', error = ? WHERE id = ?`).run(String(error).slice(0, 500), emailLogId);
}

async function sendTicketEmail({ to, customerName, eventTitle, dateTime, doorsOpen, venue, ticketTypeName, tickets, orderRef, orderId }) {
  const db = getDb();

  // Fetch order details for receipt
  let orderItems = [];
  let totalPence = 0;
  let bookingFee = 0;

  if (orderId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (order) {
      totalPence = order.total || 0;
      bookingFee = order.booking_fee || 0;
    }

    // Get line items from tickets grouped by type
    const items = db.prepare(`
      SELECT tt.name as ticketTypeName, tt.price, COUNT(*) as quantity
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.order_id = ?
      GROUP BY tt.id
    `).all(orderId);
    if (items.length > 0) orderItems = items;
  }

  // Fetch addon selections
  let addonDetails = [];
  if (orderId) {
    const addonSels = db.prepare(`
      SELECT oas.*, a.name as addon_name
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      WHERE oas.order_id = ?
    `).all(orderId);
    addonDetails = addonSels.map(s => ({
      name: s.addon_name,
      option: s.selected_option,
      quantity: s.quantity,
      price: s.price || 0,
    }));
  }

  // Send ONE email per order with all tickets
  const subject = `Order Confirmation: ${eventTitle} — ${orderRef}`;

  const emailLogId = logEmail({
    ticketId: tickets[0]?.id || null,
    orderId: orderId || null,
    recipient: to,
    subject,
  });

  try {
    // Generate QR buffers for all tickets
    const qrBuffers = [];
    for (const ticket of tickets) {
      const buf = await generateQrBuffer(ticket.code);
      qrBuffers.push(buf);
    }

    const html = buildCombinedEmailHtml({
      customerName,
      eventTitle,
      dateTime,
      doorsOpen,
      venue,
      orderRef,
      emailLogId,
      tickets,
      orderItems,
      addonDetails,
      totalPence,
      bookingFee,
    });

    const attachments = qrBuffers.map((buf, i) => ({
      filename: `qrcode-${i + 1}.png`,
      content: buf,
      contentType: 'image/png',
      cid: `qr_${i}`,
    }));

    await relaySendMail({
      from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
      to,
      subject,
      html,
      attachments,
    });

    markEmailSent(emailLogId);
  } catch (err) {
    console.error(`Failed to send order email to ${to} for order ${orderRef}:`, err.message);
    markEmailFailed(emailLogId, err.message);
  }
}

async function resendEmail(emailLogId) {
  const db = getDb();
  const log = db.prepare('SELECT * FROM email_logs WHERE id = ?').get(emailLogId);
  if (!log) throw new Error('Email log not found');

  const order = log.order_id ? db.prepare(`
    SELECT o.*, e.title as event_title, e.date_time, e.doors_open, e.venue
    FROM orders o
    JOIN events e ON o.event_id = e.id
    WHERE o.id = ?
  `).get(log.order_id) : null;

  if (!order) throw new Error('Cannot find original order data to resend');

  const tickets = db.prepare(`
    SELECT t.*, tt.name as ticketTypeName
    FROM tickets t
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    WHERE t.order_id = ?
  `).all(order.id);

  db.prepare(`UPDATE email_logs SET status = 'queued', error = NULL WHERE id = ?`).run(emailLogId);

  await sendTicketEmail({
    to: log.recipient,
    customerName: order.customer_name,
    eventTitle: order.event_title,
    dateTime: order.date_time,
    doorsOpen: order.doors_open,
    venue: order.venue,
    ticketTypeName: tickets[0]?.ticketTypeName || 'General',
    tickets,
    orderRef: order.order_ref,
    orderId: order.id,
  });
}

async function sendRefundEmail({ to, customerName, eventTitle, dateTime, venue, orderRef, refundAmount, isFullRefund, reason }) {
  const db = getDb();
  const formattedAmount = '£' + (refundAmount / 100).toFixed(2);
  const eventDate = dateTime ? new Date(dateTime).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const subject = `Refund Confirmation: ${orderRef} — ${eventTitle}`;

  const emailLogId = logEmail({ ticketId: null, orderId: null, recipient: to, subject });

  try {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 30px;text-align:center;border-bottom:2px solid #D4A843;">
              <h1 style="margin:0;font-size:28px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
              <p style="margin:8px 0 0;color:#888;font-size:14px;letter-spacing:1px;">REFUND CONFIRMATION</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:30px;">
              <p style="margin:0 0 15px;color:#fff;font-size:16px;">Hi ${customerName || 'there'},</p>
              <p style="margin:0 0 20px;color:#999;font-size:14px;">
                ${isFullRefund
                  ? 'Your order has been fully refunded. The refund will appear on your statement within 5-10 business days.'
                  : 'A partial refund has been processed for your order. The refund will appear on your statement within 5-10 business days.'}
              </p>

              <!-- Refund details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td colspan="2" style="padding:15px 20px 10px;border-bottom:2px solid #D4A843;">
                    <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Refund Details</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:15px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;color:#999;font-size:14px;">Event</td>
                        <td style="padding:8px 0;color:#fff;font-size:14px;text-align:right;">${eventTitle}</td>
                      </tr>
                      ${eventDate ? `<tr>
                        <td style="padding:8px 0;color:#999;font-size:14px;">Date</td>
                        <td style="padding:8px 0;color:#fff;font-size:14px;text-align:right;">${eventDate}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:8px 0;color:#999;font-size:14px;">Order Reference</td>
                        <td style="padding:8px 0;color:#fff;font-size:14px;text-align:right;font-family:monospace;">${orderRef}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-top:1px solid #2a2a4a;color:#999;font-size:14px;">Refund Type</td>
                        <td style="padding:8px 0;border-top:1px solid #2a2a4a;color:#fff;font-size:14px;text-align:right;">${isFullRefund ? 'Full Refund' : 'Partial Refund'}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;color:#fff;font-size:16px;font-weight:bold;">Amount Refunded</td>
                        <td style="padding:12px 0;color:#4ade80;font-size:22px;font-weight:bold;text-align:right;">${formattedAmount}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${reason ? `<tr>
                  <td colspan="2" style="padding:0 20px 15px;">
                    <table width="100%"><tr><td style="padding:10px 12px;background-color:#0a0a1a;border-radius:8px;">
                      <span style="color:#888;font-size:11px;text-transform:uppercase;">Reason</span><br>
                      <span style="color:#fff;font-size:13px;">${reason}</span>
                    </td></tr></table>
                  </td>
                </tr>` : ''}
              </table>

              ${isFullRefund ? `<p style="margin:0 0 10px;color:#999;font-size:13px;">Your tickets for this event have been cancelled and are no longer valid.</p>` : ''}
              <p style="margin:0;color:#999;font-size:13px;">If you have any questions about this refund, please contact us at info@ayrpavilion.com.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;">
              <p style="margin:0 0 8px;color:#666;font-size:12px;">Ayr Pavilion · 30 The Pavilion · Low Green · Ayr KA7 1HL</p>
              <p style="margin:0;color:#444;font-size:11px;">This is an automated refund confirmation.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await relaySendMail({
      from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
      to,
      subject,
      html,
    });

    markEmailSent(emailLogId);
  } catch (err) {
    console.error(`Failed to send refund email to ${to}:`, err.message);
    markEmailFailed(emailLogId, err.message);
  }
}

async function sendPasswordResetEmail(to, name, resetUrl) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:500px;margin:0 auto;padding:40px 20px;">
        <div style="background:#252540;border-radius:12px;padding:40px 30px;border:1px solid #333355;">
          <h1 style="color:#D4A843;margin:0 0 8px;font-size:20px;">🔒 Password Reset</h1>
          <p style="color:#999;margin:0 0 24px;font-size:14px;">Ayr Pavilion Admin</p>
          
          <p style="color:#ccc;font-size:14px;line-height:1.6;">Hi ${name},</p>
          <p style="color:#ccc;font-size:14px;line-height:1.6;">We received a request to reset your password. Click the button below to set a new one:</p>
          
          <div style="text-align:center;margin:30px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#D4A843;color:#1a1a2e;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Reset Password</a>
          </div>
          
          <p style="color:#888;font-size:12px;line-height:1.6;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          
          <hr style="border:none;border-top:1px solid #333355;margin:24px 0;">
          <p style="color:#666;font-size:11px;text-align:center;">Ayr Pavilion · Ayr, Scotland</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await relaySendMail({
    from: '"Ayr Pavilion" <no-reply@ayrpavilion.com>',
    to,
    subject: 'Reset your password — Ayr Pavilion',
    html,
  });
}

module.exports = { sendTicketEmail, resendEmail, sendRefundEmail, sendPasswordResetEmail, buildGoogleCalendarUrl };
