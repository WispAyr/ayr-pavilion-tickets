const nodemailer = require('nodemailer');
const { generateQrBuffer } = require('./qr');
const { getDb } = require('../db');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function buildGoogleCalendarUrl({ title, dateTime, venue, description }) {
  const startDate = new Date(dateTime);
  const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
  const formatDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
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

function buildEmailHtml({ eventTitle, dateTime, doorsOpen, venue, ticketTypeName, ticketCode, quantity, orderRef, calendarUrl, emailLogId, addonDetails }) {
  const eventDate = new Date(dateTime);
  const formattedDate = eventDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const formattedTime = eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const doorsText = doorsOpen
    ? new Date(doorsOpen).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const appUrl = process.env.APP_URL || 'https://tickets.ayrpavilion.com';
  const viewTicketUrl = `${appUrl}/tickets/${ticketCode}`;
  const directionsUrl = 'https://maps.google.com/maps?q=Ayr+Pavilion,+30+The+Pavilion,+Low+Green,+Ayr+KA7+1HL';

  // Wrap links through click tracker if we have an emailLogId
  const trackedCalendarUrl = emailLogId ? trackUrl(emailLogId, calendarUrl) : calendarUrl;
  const trackedViewUrl = emailLogId ? trackUrl(emailLogId, viewTicketUrl) : viewTicketUrl;
  const trackedDirectionsUrl = emailLogId ? trackUrl(emailLogId, directionsUrl) : directionsUrl;
  const pixelTag = emailLogId ? `<img src="${trackPixel(emailLogId)}" width="1" height="1" style="display:none;" alt="">` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Tickets - ${eventTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding:40px 30px;text-align:center;border-bottom:2px solid #D4A843;">
              <h1 style="margin:0;font-size:28px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
              <p style="margin:8px 0 0;color:#888;font-size:14px;letter-spacing:1px;">YOUR TICKETS ARE CONFIRMED</p>
            </td>
          </tr>

          <!-- Event Details -->
          <tr>
            <td style="padding:30px;">
              <h2 style="margin:0 0 20px;font-size:24px;color:#ffffff;text-align:center;">${eventTitle}</h2>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:25px;">
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;">
                    <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Date</span><br>
                    <span style="color:#ffffff;font-size:16px;">${formattedDate}</span>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Time</span><br>
                          <span style="color:#ffffff;font-size:16px;">${formattedTime}</span>
                        </td>
                        ${doorsText ? `<td width="50%">
                          <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Doors Open</span><br>
                          <span style="color:#ffffff;font-size:16px;">${doorsText}</span>
                        </td>` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Venue</span><br>
                          <span style="color:#ffffff;font-size:16px;">${venue}</span>
                        </td>
                        <td width="50%">
                          <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Ticket Type</span><br>
                          <span style="color:#ffffff;font-size:16px;">${ticketTypeName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- QR Code -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:20px;background-color:#12122a;border-radius:12px;border:1px solid #D4A843;">
                    <p style="margin:0 0 15px;color:#D4A843;font-size:14px;text-transform:uppercase;letter-spacing:2px;">Scan for Entry</p>
                    <img src="cid:qrcode" alt="QR Code" width="250" height="250" style="display:block;margin:0 auto;border-radius:8px;">
                    <p style="margin:15px 0 0;color:#666;font-size:12px;font-family:monospace;letter-spacing:2px;">${ticketCode}</p>
                  </td>
                </tr>
              </table>

              ${addonDetails && addonDetails.length > 0 ? `
              <!-- Addon Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;">
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;">
                    <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Add-ons</span><br>
                    ${addonDetails.map(a => `<span style="color:#ffffff;font-size:14px;">${a.name}${a.option ? ': ' + a.option : ''}${a.quantity > 1 ? ' x' + a.quantity : ''}</span>`).join('<br>')}
                  </td>
                </tr>
              </table>` : ''}

              <!-- Order Reference -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;text-align:center;">
                    <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Reference</span><br>
                    <span style="color:#ffffff;font-size:18px;font-weight:bold;font-family:monospace;">${orderRef}</span>
                  </td>
                </tr>
              </table>

              <!-- Action Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td align="center">
                    <a href="${trackedCalendarUrl}" target="_blank" style="display:inline-block;padding:14px 30px;background-color:#D4A843;color:#1a1a2e;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;text-transform:uppercase;letter-spacing:1px;">
                      Add to Calendar
                    </a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;">
                <tr>
                  <td align="center">
                    <a href="${trackedViewUrl}" target="_blank" style="display:inline-block;padding:12px 30px;border:1px solid #D4A843;color:#D4A843;text-decoration:none;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                      View Ticket Online
                    </a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;">
                <tr>
                  <td align="center">
                    <a href="${trackedDirectionsUrl}" target="_blank" style="display:inline-block;padding:12px 30px;border:1px solid #555;color:#999;text-decoration:none;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                      Get Directions
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;">
              <p style="margin:0 0 8px;color:#666;font-size:12px;">Ayr Pavilion, 30 The Pavilion, Low Green, Ayr KA7 1HL</p>
              <p style="margin:0 0 8px;color:#666;font-size:12px;">Please have your QR code ready at the door for scanning.</p>
              <p style="margin:0 0 8px;color:#555;font-size:11px;">This ticket is non-transferable. No refunds unless the event is cancelled.</p>
              <p style="margin:0;color:#444;font-size:11px;">By purchasing tickets you agree to the venue's terms and conditions.</p>
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

/**
 * Log an email attempt to the database BEFORE sending.
 * Returns the emailLog id.
 */
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
  const transporter = createTransporter();
  const db = getDb();

  const calendarUrl = buildGoogleCalendarUrl({
    title: eventTitle,
    dateTime,
    venue,
    description: `Your tickets for ${eventTitle} at ${venue}. Order ref: ${orderRef}`
  });

  // Fetch addon selections for the order
  let orderAddonDetails = [];
  if (orderId) {
    const addonSels = db.prepare(`
      SELECT oas.*, a.name as addon_name
      FROM order_addon_selections oas
      JOIN addons a ON oas.addon_id = a.id
      WHERE oas.order_id = ?
    `).all(orderId);
    orderAddonDetails = addonSels.map(s => ({
      name: s.addon_name,
      option: s.selected_option,
      quantity: s.quantity
    }));
  }

  for (const ticket of tickets) {
    const subject = `Your Tickets: ${eventTitle} - ${venue}`;

    // Log BEFORE sending
    const emailLogId = logEmail({
      ticketId: ticket.id || null,
      orderId: orderId || null,
      recipient: to,
      subject
    });

    try {
      const qrBuffer = await generateQrBuffer(ticket.code);

      const html = buildEmailHtml({
        eventTitle,
        dateTime,
        doorsOpen,
        venue,
        ticketTypeName: ticket.ticketTypeName || ticketTypeName,
        ticketCode: ticket.code,
        quantity: tickets.length,
        orderRef,
        calendarUrl,
        emailLogId,
        addonDetails: orderAddonDetails
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
        to,
        subject,
        html,
        attachments: [
          {
            filename: 'qrcode.png',
            content: qrBuffer,
            cid: 'qrcode'
          }
        ]
      });

      markEmailSent(emailLogId);
    } catch (err) {
      console.error(`Failed to send ticket email to ${to} for ticket ${ticket.code}:`, err.message);
      markEmailFailed(emailLogId, err.message);
    }
  }
}

/**
 * Resend a specific email by its log ID.
 * Looks up the original ticket/order data and re-sends.
 */
async function resendEmail(emailLogId) {
  const db = getDb();
  const log = db.prepare('SELECT * FROM email_logs WHERE id = ?').get(emailLogId);
  if (!log) throw new Error('Email log not found');

  const ticket = log.ticket_id ? db.prepare(`
    SELECT t.*, tt.name as ticket_type_name, e.title as event_title, e.date_time, e.doors_open, e.venue,
           o.order_ref, o.customer_name, o.customer_email
    FROM tickets t
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    JOIN events e ON t.event_id = e.id
    JOIN orders o ON t.order_id = o.id
    WHERE t.id = ?
  `).get(log.ticket_id) : null;

  if (!ticket) {
    // Fallback: try to find via order_id
    const order = log.order_id ? db.prepare(`
      SELECT o.*, e.title as event_title, e.date_time, e.doors_open, e.venue
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.id = ?
    `).get(log.order_id) : null;

    if (!order) throw new Error('Cannot find original ticket/order data to resend');

    const tickets = db.prepare(`
      SELECT t.*, tt.name as ticketTypeName
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.order_id = ?
    `).all(order.id);

    // Re-queue: update status
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
      orderId: order.id
    });
    return;
  }

  // Re-queue
  db.prepare(`UPDATE email_logs SET status = 'queued', error = NULL WHERE id = ?`).run(emailLogId);

  const calendarUrl = buildGoogleCalendarUrl({
    title: ticket.event_title,
    dateTime: ticket.date_time,
    venue: ticket.venue,
    description: `Your tickets for ${ticket.event_title} at ${ticket.venue}. Order ref: ${ticket.order_ref}`
  });

  const transporter = createTransporter();
  const qrBuffer = await generateQrBuffer(ticket.code);

  // Create a NEW log entry for the resend
  const newLogId = logEmail({
    ticketId: ticket.id,
    orderId: log.order_id,
    recipient: log.recipient,
    subject: log.subject
  });

  try {
    const html = buildEmailHtml({
      eventTitle: ticket.event_title,
      dateTime: ticket.date_time,
      doorsOpen: ticket.doors_open,
      venue: ticket.venue,
      ticketTypeName: ticket.ticket_type_name,
      ticketCode: ticket.code,
      quantity: 1,
      orderRef: ticket.order_ref,
      calendarUrl,
      emailLogId: newLogId
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
      to: log.recipient,
      subject: log.subject,
      html,
      attachments: [{ filename: 'qrcode.png', content: qrBuffer, cid: 'qrcode' }]
    });

    markEmailSent(newLogId);
    // Mark original as resent
    db.prepare(`UPDATE email_logs SET status = 'resent' WHERE id = ?`).run(emailLogId);
  } catch (err) {
    markEmailFailed(newLogId, err.message);
    throw err;
  }
}

module.exports = { sendTicketEmail, resendEmail, buildGoogleCalendarUrl };
