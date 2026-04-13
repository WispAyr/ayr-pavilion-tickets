const { generateQrBuffer, generateGroupPassQR } = require('./qr');
const { getDb } = require('../db');

// HTTP relay via PU2 mail relay (direct SMTP blocked on VPS)
async function sendViaRelay({ from, to, subject, html, attachments }) {
  const relayUrl = process.env.MAIL_RELAY_URL || 'http://142.202.191.208:8025';
  const relayKey = process.env.MAIL_RELAY_KEY || 'skynet-mail-relay-key-2026';
  const body = { from, to, subject, html };
  if (attachments && attachments.length > 0) {
    body.attachments = attachments.map(a => ({
      filename: a.filename,
      content: (a.content instanceof Buffer ? a.content : Buffer.from(a.content)).toString('base64'),
      cid: a.cid || undefined
    }));
  }
  const resp = await fetch(`${relayUrl}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': relayKey },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Mail relay error ${resp.status}: ${err}`);
  }
  return resp.json();
}

// Shim: drop-in replacement for nodemailer transporter
function createTransporter() {
  return { sendMail: sendViaRelay };
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

function formatPence(pence) {
  return (pence / 100).toFixed(2);
}

function buildProtectionBlock(isProtected, protectionFee, orderRef) {
  const appUrl = process.env.APP_URL || 'https://tickets.ayrpavilion.com';
  const claimUrl = `${appUrl}/api/protection/claim/${orderRef}`;

  if (isProtected) {
    return `
      <!-- Ticket Protection - Protected -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
        <tr>
          <td style="padding:20px;background-color:#1a2a1a;border-radius:12px;border:1px solid #2d6b2d;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#4CAF50;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">&#10003; Ticket Protection Active</span>
                  <p style="color:#ccc;font-size:14px;margin:10px 0 5px;">Your tickets are protected (&pound;${formatPence(protectionFee)} paid). If you are unable to attend due to illness, injury, or unforeseen circumstances, you can request a refund.</p>
                  <p style="color:#999;font-size:12px;margin:0 0 15px;">Claims are reviewed by the venue. The protection fee is non-refundable. Requests must be submitted at least 24 hours before the event.</p>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <a href="${claimUrl}" target="_blank" style="display:inline-block;padding:12px 30px;background-color:#4CAF50;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                    Submit a Cancellation Request
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
  } else {
    return `
      <!-- Ticket Protection - Not Protected -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
        <tr>
          <td style="padding:15px;background-color:#2a1a1a;border-radius:8px;border:1px solid #3a2a2a;">
            <p style="color:#999;font-size:12px;margin:0;text-align:center;">
              Your tickets are not protected. All sales are final and non-refundable unless the event is cancelled by the organiser.
            </p>
          </td>
        </tr>
      </table>`;
  }
}

function buildOrderSummaryBlock({ orderItems, addonDetails, bookingFee, protectionOpted, protectionFee, grandTotal }) {
  if (!orderItems || orderItems.length === 0) return '';

  let rows = '';
  let subtotal = 0;

  for (const item of orderItems) {
    const lineTotal = item.price * item.quantity;
    subtotal += lineTotal;
    rows += `
      <tr>
        <td style="padding:8px 0;color:#fff;font-size:14px;">${item.ticketTypeName}${item.quantity > 1 ? ' x' + item.quantity : ''}</td>
        <td style="padding:8px 0;color:#fff;font-size:14px;text-align:right;">&pound;${formatPence(lineTotal)}</td>
      </tr>`;
  }

  if (addonDetails && addonDetails.length > 0) {
    for (const a of addonDetails) {
      const addonTotal = (a.price || 0) * (a.quantity || 1);
      if (addonTotal > 0) {
        subtotal += addonTotal;
        rows += `
          <tr>
            <td style="padding:8px 0;color:#ccc;font-size:13px;">${a.name}${a.option ? ': ' + a.option : ''}${a.quantity > 1 ? ' x' + a.quantity : ''}</td>
            <td style="padding:8px 0;color:#ccc;font-size:13px;text-align:right;">&pound;${formatPence(addonTotal)}</td>
          </tr>`;
      }
    }
  }

  if (protectionOpted && protectionFee > 0) {
    rows += `
      <tr>
        <td style="padding:8px 0;color:#ccc;font-size:13px;">Ticket Protection</td>
        <td style="padding:8px 0;color:#ccc;font-size:13px;text-align:right;">&pound;${formatPence(protectionFee)}</td>
      </tr>`;
  }

  if (bookingFee > 0) {
    rows += `
      <tr>
        <td style="padding:8px 0;color:#999;font-size:13px;">Booking Fee</td>
        <td style="padding:8px 0;color:#999;font-size:13px;text-align:right;">&pound;${formatPence(bookingFee)}</td>
      </tr>`;
  }

  const total = grandTotal || 0;

  return `
    <!-- Order Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      <tr>
        <td style="padding:15px 20px;background-color:#12122a;border-radius:12px;border:1px solid #2a2a4a;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td colspan="2" style="padding:0 0 12px;">
                <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Order Summary</span>
              </td>
            </tr>
            ${rows}
            <tr>
              <td colspan="2" style="border-top:1px solid #2a2a4a;padding-top:12px;"></td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#fff;font-size:16px;font-weight:bold;">Total Charged</td>
              <td style="padding:4px 0;color:#D4A843;font-size:18px;font-weight:bold;text-align:right;">&pound;${formatPence(total)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildEmailHtml({ eventTitle, dateTime, doorsOpen, venue, ticketTypeName, ticketCode, quantity, orderRef, calendarUrl, emailLogId, addonDetails, protectionOpted, protectionFee, isComp, orderItems, bookingFee, grandTotal, hasGroupPass }) {
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

  const protectionBlock = isComp ? '' : buildProtectionBlock(!!protectionOpted, protectionFee || 0, orderRef);

  const headerSubtitle = isComp ? 'VIP COMPLIMENTARY TICKETS' : 'YOUR TICKETS ARE CONFIRMED';
  const headerBorder = isComp ? '#9333ea' : '#D4A843';

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
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding:40px 30px;text-align:center;border-bottom:2px solid ${headerBorder};">
              <h1 style="margin:0;font-size:28px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
              ${isComp ? '<p style="margin:8px 0 0;color:#9333ea;font-size:14px;letter-spacing:1px;font-weight:bold;">&#9733; VIP COMPLIMENTARY TICKETS &#9733;</p>' : `<p style="margin:8px 0 0;color:#888;font-size:14px;letter-spacing:1px;">${headerSubtitle}</p>`}
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

              ${hasGroupPass ? `              <!-- Group Pass QR -->              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:15px;">                <tr>                  <td align="center" style="padding:20px;background-color:#1a1a0a;border-radius:12px;border:2px solid #D4A843;">                    <p style="margin:0 0 5px;color:#D4A843;font-size:14px;text-transform:uppercase;letter-spacing:2px;">&#9733; Family / Group Pass</p>                    <p style="margin:0 0 15px;color:#999;font-size:12px;">Scan once to check in all your tickets for this event</p>                    <img src="cid:groupqr" alt="Group Pass QR" width="250" height="250" style="display:block;margin:0 auto;border-radius:8px;">                  </td>                </tr>              </table>              ` : ""}
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

              ${!isComp ? buildOrderSummaryBlock({ orderItems, addonDetails, bookingFee, protectionOpted, protectionFee, grandTotal }) : ''}

              <!-- Order Reference -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;text-align:center;">
                    <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Reference</span><br>
                    <span style="color:#ffffff;font-size:18px;font-weight:bold;font-family:monospace;">${orderRef}</span>
                  </td>
                </tr>
              </table>

              ${protectionBlock}

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
              ${isComp ? '<p style="margin:0;color:#9333ea;font-size:11px;">Complimentary tickets issued by Ayr Pavilion.</p>' : '<p style="margin:0;color:#444;font-size:11px;">By purchasing tickets you agree to the venue\'s terms and conditions.</p>'}
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

async function sendTicketEmail({ to, customerName, eventTitle, dateTime, doorsOpen, venue, ticketTypeName, tickets, orderRef, orderId, groupPassToken }) {
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
      quantity: s.quantity,
      price: s.price || 0
    }));
  }

  // Get order details including pricing
  let protectionOpted = 0;
  let protectionFee = 0;
  let isComp = false;
  let bookingFee = 0;
  let grandTotal = 0;
  let orderItemsWithPrices = [];
  if (orderId) {
    const order = db.prepare('SELECT protection_opted, protection_fee, status, booking_fee, total FROM orders WHERE id = ?').get(orderId);
    if (order) {
      protectionOpted = order.protection_opted;
      protectionFee = order.protection_fee;
      isComp = order.status === 'comp';
      bookingFee = order.booking_fee || 0;
      grandTotal = order.total || 0;
    }

    // Get ticket type breakdown with prices from actual tickets
    const ticketBreakdown = db.prepare(`
      SELECT tt.name as ticketTypeName, tt.price, COUNT(t.id) as quantity
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.order_id = ?
      GROUP BY tt.id
    `).all(orderId);
    orderItemsWithPrices = ticketBreakdown;
  }

  // Generate group pass QR if applicable (2+ tickets)
  let groupPassQrBuffer = null;
  const hasGroupPass = !!(groupPassToken && tickets.length > 1);
  if (hasGroupPass) {
    try { groupPassQrBuffer = await generateGroupPassQR(groupPassToken); } catch (e) { console.error("Group pass QR error:", e.message); }
  }

  for (const ticket of tickets) {
    const subject = isComp ? `VIP Tickets: ${eventTitle} - ${venue}` : `Your Tickets: ${eventTitle} - ${venue}`;

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
        addonDetails: orderAddonDetails,
        protectionOpted,
        protectionFee,
        isComp,
        orderItems: orderItemsWithPrices,
        bookingFee,
        grandTotal,
        hasGroupPass
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
            cid: "qrcode"
          },
          ...(groupPassQrBuffer ? [{ filename: "grouppass.png", content: groupPassQrBuffer, cid: "groupqr" }] : [])
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
 * Send protection-related emails (claim submitted, approved, denied)
 */
async function sendProtectionEmail(type, data) {
  const transporter = createTransporter();
  let subject, html;

  const headerHtml = `
    <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 30px;text-align:center;border-bottom:2px solid #D4A843;">
      <h1 style="margin:0;font-size:28px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
    </td>`;

  const footerHtml = `
    <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;">
      <p style="margin:0 0 8px;color:#666;font-size:12px;">Ayr Pavilion, 30 The Pavilion, Low Green, Ayr KA7 1HL</p>
      <p style="margin:8px 0 0;color:#555;font-size:11px;">For further enquiries, please contact info@ayrpavilion.com</p>
    </td>`;

  if (type === 'claim_submitted') {
    subject = `Cancellation Request Received - ${data.claimRef}`;
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">
<tr>${headerHtml}</tr>
<tr><td style="padding:30px;">
  <h2 style="color:#fff;margin:0 0 20px;text-align:center;">Cancellation Request Received</h2>
  <p style="color:#ccc;font-size:15px;">Hi ${data.customerName},</p>
  <p style="color:#ccc;font-size:15px;">We have received your cancellation request and it is being reviewed by our team.</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="padding:15px;background-color:#12122a;border-radius:8px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Claim Reference</span><br><span style="color:#fff;font-size:16px;font-family:monospace;">${data.claimRef}</span></td></tr>
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Order Reference</span><br><span style="color:#fff;font-size:14px;">${data.orderRef}</span></td></tr>
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Event</span><br><span style="color:#fff;font-size:14px;">${data.eventTitle}</span></td></tr>
      </table>
    </td></tr>
  </table>

  <p style="color:#999;font-size:14px;">We aim to review all requests within 48 hours. You will receive an email once a decision has been made.</p>
</td></tr>
<tr>${footerHtml}</tr>
</table></td></tr></table></body></html>`;

  } else if (type === 'claim_approved') {
    subject = `Cancellation Request Approved - Refund Issued`;
    const refundStr = formatPence(data.refundAmount);
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">
<tr>${headerHtml}</tr>
<tr><td style="padding:30px;">
  <h2 style="color:#4CAF50;margin:0 0 20px;text-align:center;">Cancellation Approved</h2>
  <p style="color:#ccc;font-size:15px;">Hi ${data.customerName},</p>
  <p style="color:#ccc;font-size:15px;">Your cancellation request has been approved and a refund has been issued to your original payment method.</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="padding:20px;background-color:#1a2a1a;border:1px solid #2d6b2d;border-radius:12px;text-align:center;">
      <span style="color:#4CAF50;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Refund Amount</span><br>
      <span style="color:#4CAF50;font-size:32px;font-weight:bold;">&pound;${refundStr}</span>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="padding:15px;background-color:#12122a;border-radius:8px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Claim Reference</span><br><span style="color:#fff;font-size:14px;font-family:monospace;">${data.claimRef}</span></td></tr>
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Order Reference</span><br><span style="color:#fff;font-size:14px;">${data.orderRef}</span></td></tr>
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Event</span><br><span style="color:#fff;font-size:14px;">${data.eventTitle}</span></td></tr>
      </table>
    </td></tr>
  </table>

  <p style="color:#999;font-size:14px;">Please allow 5-10 business days for the refund to appear on your statement. Your tickets have been cancelled and are no longer valid for entry.</p>
</td></tr>
<tr>${footerHtml}</tr>
</table></td></tr></table></body></html>`;

  } else if (type === 'claim_denied') {
    subject = `Cancellation Request Update - ${data.claimRef}`;
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">
<tr>${headerHtml}</tr>
<tr><td style="padding:30px;">
  <h2 style="color:#fff;margin:0 0 20px;text-align:center;">Cancellation Request Update</h2>
  <p style="color:#ccc;font-size:15px;">Hi ${data.customerName},</p>
  <p style="color:#ccc;font-size:15px;">Unfortunately, your cancellation request has been declined.</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="padding:15px;background-color:#12122a;border-radius:8px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Claim Reference</span><br><span style="color:#fff;font-size:14px;font-family:monospace;">${data.claimRef}</span></td></tr>
        <tr><td style="padding:5px 0;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;">Reason</span><br><span style="color:#ff9999;font-size:14px;">${data.adminNotes}</span></td></tr>
      </table>
    </td></tr>
  </table>

  <p style="color:#999;font-size:14px;">Your tickets remain valid for the event. If you have any questions, please contact us at info@ayrpavilion.com.</p>
</td></tr>
<tr>${footerHtml}</tr>
</table></td></tr></table></body></html>`;
  }

  if (!subject || !html) return;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
    to: data.to,
    subject,
    html
  });
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

/**
 * Send refund confirmation email
 */
async function sendRefundEmail({ to, customerName, eventTitle, dateTime, venue, orderRef, refundAmount, isFullRefund, reason }) {
  const transporter = createTransporter();
  const formattedAmount = '\u00a3' + (refundAmount / 100).toFixed(2);
  const eventDate = dateTime ? new Date(dateTime).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const subject = `Refund Confirmation: ${orderRef} — ${eventTitle}`;

  const emailLogId = logEmail({ ticketId: null, orderId: null, recipient: to, subject });

  try {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 30px;text-align:center;border-bottom:2px solid #D4A843;">
            <h1 style="margin:0;font-size:28px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
            <p style="margin:8px 0 0;color:#888;font-size:14px;letter-spacing:1px;">REFUND CONFIRMATION</p>
          </td>
        </tr>
        <tr><td style="padding:30px;">
          <p style="margin:0 0 15px;color:#fff;font-size:16px;">Hi ${customerName || 'there'},</p>
          <p style="margin:0 0 20px;color:#999;font-size:14px;">
            ${isFullRefund
              ? 'Your order has been fully refunded. The refund will appear on your statement within 5-10 business days.'
              : 'A partial refund has been processed for your order. The refund will appear on your statement within 5-10 business days.'}
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;margin-bottom:20px;">
            <tr><td colspan="2" style="padding:15px 20px 10px;border-bottom:2px solid #D4A843;">
              <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Refund Details</span>
            </td></tr>
            <tr><td colspan="2" style="padding:15px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;color:#999;font-size:14px;">Event</td><td style="padding:8px 0;color:#fff;font-size:14px;text-align:right;">${eventTitle}</td></tr>
                ${eventDate ? `<tr><td style="padding:8px 0;color:#999;font-size:14px;">Date</td><td style="padding:8px 0;color:#fff;font-size:14px;text-align:right;">${eventDate}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#999;font-size:14px;">Order Reference</td><td style="padding:8px 0;color:#fff;font-size:14px;text-align:right;font-family:monospace;">${orderRef}</td></tr>
                <tr><td style="padding:8px 0;border-top:1px solid #2a2a4a;color:#999;font-size:14px;">Refund Type</td><td style="padding:8px 0;border-top:1px solid #2a2a4a;color:#fff;font-size:14px;text-align:right;">${isFullRefund ? 'Full Refund' : 'Partial Refund'}</td></tr>
                <tr><td style="padding:12px 0;color:#fff;font-size:16px;font-weight:bold;">Amount Refunded</td><td style="padding:12px 0;color:#4ade80;font-size:22px;font-weight:bold;text-align:right;">${formattedAmount}</td></tr>
              </table>
            </td></tr>
            ${reason ? `<tr><td colspan="2" style="padding:0 20px 15px;"><table width="100%"><tr><td style="padding:10px 12px;background-color:#0a0a1a;border-radius:8px;"><span style="color:#888;font-size:11px;text-transform:uppercase;">Reason</span><br><span style="color:#fff;font-size:13px;">${reason}</span></td></tr></table></td></tr>` : ''}
          </table>
          ${isFullRefund ? `<p style="margin:0 0 10px;color:#999;font-size:13px;">Your tickets for this event have been cancelled and are no longer valid.</p>` : ''}
          <p style="margin:0;color:#999;font-size:13px;">If you have any questions about this refund, please contact us at info@ayrpavilion.com.</p>
        </td></tr>
        <tr>
          <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;">
            <p style="margin:0 0 8px;color:#666;font-size:12px;">Ayr Pavilion, 30 The Pavilion, Low Green, Ayr KA7 1HL</p>
            <p style="margin:0;color:#444;font-size:11px;">This is an automated refund confirmation.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
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

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(to, name, resetUrl) {
  const transporter = createTransporter();

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:40px 20px;">
    <div style="background:#252540;border-radius:12px;padding:40px 30px;border:1px solid #333355;">
      <h1 style="color:#D4A843;margin:0 0 8px;font-size:20px;">Password Reset</h1>
      <p style="color:#999;margin:0 0 24px;font-size:14px;">Ayr Pavilion Admin</p>
      <p style="color:#ccc;font-size:14px;line-height:1.6;">Hi ${name},</p>
      <p style="color:#ccc;font-size:14px;line-height:1.6;">We received a request to reset your password. Click the button below to set a new one:</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#D4A843;color:#1a1a2e;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Reset Password</a>
      </div>
      <p style="color:#888;font-size:12px;line-height:1.6;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #333355;margin:24px 0;">
      <p style="color:#666;font-size:11px;text-align:center;">Ayr Pavilion, Ayr, Scotland</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
    to,
    subject: 'Reset your password — Ayr Pavilion',
    html,
  });
}

/**
 * Send a VIP comp invite email with claim instructions
 */
async function sendCompInviteEmail({ to, recipientName, eventTitle, dateTime, venue, compCode, eventSlug, maxTickets }) {
  const transporter = createTransporter();
  const appUrl = process.env.APP_URL || 'https://tickets.ayrpavilion.com';
  const claimUrl = `${appUrl}/events/${eventSlug}?comp=${compCode}`;

  const eventDate = new Date(dateTime);
  const formattedDate = eventDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const formattedTime = eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';

  const subject = `You're Invited: Complimentary Tickets for ${eventTitle}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VIP Invitation - ${eventTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #2d1854 50%, #16213e 100%); padding:50px 30px;text-align:center;border-bottom:2px solid #9333ea;">
              <p style="margin:0 0 8px;color:#9333ea;font-size:13px;letter-spacing:3px;text-transform:uppercase;">&#9733; Complimentary Invitation &#9733;</p>
              <h1 style="margin:0;font-size:32px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Ayr Pavilion</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 30px;">
              <p style="color:#ccc;font-size:16px;line-height:1.6;margin:0 0 20px;">${greeting}</p>
              <p style="color:#ccc;font-size:16px;line-height:1.6;margin:0 0 25px;">
                You have been issued <strong style="color:#D4A843;">${maxTickets} complimentary ticket${maxTickets > 1 ? 's' : ''}</strong> for the following event:
              </p>

              <!-- Event Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;">
                <tr>
                  <td style="padding:25px;background: linear-gradient(135deg, #12122a 0%, #1a1040 100%);border-radius:12px;border:1px solid #9333ea40;">
                    <h2 style="margin:0 0 15px;font-size:22px;color:#ffffff;">${eventTitle}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#9333ea;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Date</span><br>
                          <span style="color:#fff;font-size:15px;">${formattedDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#9333ea;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Time</span><br>
                          <span style="color:#fff;font-size:15px;">${formattedTime}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#9333ea;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Venue</span><br>
                          <span style="color:#fff;font-size:15px;">${venue}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;">
                <tr>
                  <td align="center">
                    <a href="${claimUrl}" target="_blank" style="display:inline-block;padding:18px 50px;background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);color:#ffffff;text-decoration:none;border-radius:12px;font-weight:bold;font-size:16px;text-transform:uppercase;letter-spacing:2px;">
                      Claim Your Tickets
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 25px;">
                <tr>
                  <td style="padding:20px;background-color:#12122a;border-radius:12px;">
                    <p style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">How to Claim</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#ccc;font-size:14px;">
                          <span style="color:#9333ea;font-weight:bold;margin-right:8px;">1.</span>
                          Click the button above or use the link below
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#ccc;font-size:14px;">
                          <span style="color:#9333ea;font-weight:bold;margin-right:8px;">2.</span>
                          Select your ticket type${maxTickets > 1 ? 's' : ''} and any options (e.g. skate sizes)
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#ccc;font-size:14px;">
                          <span style="color:#9333ea;font-weight:bold;margin-right:8px;">3.</span>
                          Enter your name and email address
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#ccc;font-size:14px;">
                          <span style="color:#9333ea;font-weight:bold;margin-right:8px;">4.</span>
                          Your tickets with QR codes will be emailed to you instantly
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color:#666;font-size:12px;margin:0;text-align:center;">
                Direct link: <a href="${claimUrl}" style="color:#9333ea;word-break:break-all;">${claimUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;">
              <p style="margin:0 0 8px;color:#666;font-size:12px;">Ayr Pavilion, 30 The Pavilion, Low Green, Ayr KA7 1HL</p>
              <p style="margin:0;color:#9333ea;font-size:11px;">Complimentary tickets issued by Ayr Pavilion</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
    to,
    subject,
    html
  });
}

/**
 * Send comprehensive event report email
 */
async function sendEventReportEmail({ to, reportData }) {
  const transporter = createTransporter();
  const r = reportData;
  const isCombined = !!r.is_combined;

  // Handle both single event and combined reports
  const event = r.event || {
    title: r.group_name || 'Combined Report',
    date_time: r.date_range?.first || new Date().toISOString(),
    venue: r.venue || 'Ayr Pavilion',
    doors_open: null
  };

  const eventDate = new Date(event.date_time);
  const formattedDate = isCombined
    ? `${new Date(r.date_range.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} — ${new Date(r.date_range.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formattedTime = isCombined ? `${r.total_sessions} sessions` : eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // Ensure safe defaults for all sections
  r.ticket_types = r.ticket_types || [];
  r.no_shows = r.no_shows || [];
  r.financials = r.financials || {};
  r.sales_timeline = r.sales_timeline || [];
  r.booking_velocity = r.booking_velocity || {};
  r.arrival_intelligence = r.arrival_intelligence || { arrival_curve: [], early_pct: 0, on_time_pct: 0, late_pct: 0 };
  r.protection_claims = r.protection_claims || {};
  r.customer_intelligence = r.customer_intelligence || {};
  r.scanner_performance = r.scanner_performance || [];
  r.email_engagement = r.email_engagement || {};
  r.addons = r.addons || [];
  r.manifest = r.manifest || [];
  r.comps = r.comps || {};

  const totalSold = r.ticket_types.reduce((s, tt) => s + (tt.sold || 0), 0);
  const totalCapacity = r.ticket_types.reduce((s, tt) => s + (tt.quantity || 0), 0);
  const totalCheckedIn = r.ticket_types.reduce((s, tt) => s + (tt.checked_in || 0), 0);
  const totalNoShows = r.no_shows.reduce((s, ns) => s + (ns.no_show_count || 0), 0);
  const checkinRate = totalSold > 0 ? Math.round((totalCheckedIn / totalSold) * 1000) / 10 : 0;
  const noShowRate = totalSold > 0 ? Math.round((totalNoShows / totalSold) * 1000) / 10 : 0;

  const fmtMoney = (pence) => '&pound;' + (pence / 100).toFixed(2);
  const fmtMoneyPlain = (pence) => '\u00a3' + (pence / 100).toFixed(2);

  // Build ticket type rows
  let ticketTypeRows = '';
  for (const tt of r.ticket_types) {
    const revenue = tt.sold * tt.price;
    const barWidth = Math.min(Math.max(tt.sell_through_pct, 0), 100);
    ticketTypeRows += `
      <tr>
        <td style="padding:10px 12px;color:#fff;font-size:13px;border-bottom:1px solid #2a2a4a;">${tt.name}</td>
        <td style="padding:10px 8px;color:#D4A843;font-size:13px;text-align:right;border-bottom:1px solid #2a2a4a;">${fmtMoney(tt.price)}</td>
        <td style="padding:10px 8px;color:#fff;font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;">${tt.sold}/${tt.quantity}</td>
        <td style="padding:10px 8px;color:#4ade80;font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;">${tt.checked_in}</td>
        <td style="padding:10px 8px;color:${tt.sold > 0 && tt.valid > 0 ? '#ff6b6b' : '#999'};font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;">${tt.valid}</td>
        <td style="padding:10px 8px;color:#D4A843;font-size:13px;text-align:right;border-bottom:1px solid #2a2a4a;">${fmtMoney(revenue)}</td>
      </tr>
      <tr>
        <td colspan="6" style="padding:0 12px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#2a2a4a;border-radius:3px;height:6px;">
              <table cellpadding="0" cellspacing="0" style="width:${barWidth}%;"><tr><td style="background-color:#D4A843;border-radius:3px;height:6px;"></td></tr></table>
            </td>
          </tr></table>
        </td>
      </tr>`;
  }

  // Sales timeline heatmap
  let timelineHtml = '';
  if (r.sales_timeline.length > 0) {
    const maxOrders = Math.max(...r.sales_timeline.map(h => h.orders));
    let timelineCells = '';
    for (const h of r.sales_timeline.slice(-24)) {
      const opacity = maxOrders > 0 ? Math.max(0.15, h.orders / maxOrders) : 0.15;
      const hourLabel = h.hour.split(' ')[1] || h.hour;
      timelineCells += `
        <td style="padding:4px 2px;text-align:center;vertical-align:bottom;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:rgba(212,168,67,${opacity});border-radius:3px;padding:6px 2px;">
              <span style="color:#fff;font-size:10px;font-weight:bold;">${h.orders}</span>
            </td>
          </tr></table>
          <span style="color:#666;font-size:9px;">${hourLabel}</span>
        </td>`;
    }
    timelineHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
        <tr>${timelineCells}</tr>
      </table>`;
  }

  // Arrival curve
  let arrivalHtml = '';
  if (r.arrival_intelligence && r.arrival_intelligence.arrival_curve && r.arrival_intelligence.arrival_curve.length > 0) {
    const maxArrival = Math.max(...r.arrival_intelligence.arrival_curve.map(b => b.count));
    let arrivalCells = '';
    for (const bucket of r.arrival_intelligence.arrival_curve) {
      const heightPct = maxArrival > 0 ? Math.max(5, Math.round((bucket.count / maxArrival) * 100)) : 5;
      const color = bucket.offset_mins < 0 ? '#579bfc' : bucket.offset_mins <= 30 ? '#4ade80' : '#ff6b6b';
      arrivalCells += `
        <td style="padding:2px;text-align:center;vertical-align:bottom;width:${Math.max(30, Math.floor(100 / r.arrival_intelligence.arrival_curve.length))}px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="height:80px;"><tr>
            <td style="vertical-align:bottom;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="background-color:${color};border-radius:3px 3px 0 0;height:${heightPct}%;min-height:4px;padding:2px 0;text-align:center;">
                  <span style="color:#fff;font-size:9px;">${bucket.count}</span>
                </td>
              </tr></table>
            </td>
          </tr></table>
          <span style="color:#666;font-size:8px;">${bucket.offset_mins >= 0 ? '+' : ''}${bucket.offset_mins}m</span>
        </td>`;
    }
    arrivalHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
        <tr>${arrivalCells}</tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
        <tr>
          <td style="text-align:center;">
            <span style="display:inline-block;width:10px;height:10px;background:#579bfc;border-radius:2px;"></span>
            <span style="color:#999;font-size:10px;margin-right:12px;"> Early</span>
            <span style="display:inline-block;width:10px;height:10px;background:#4ade80;border-radius:2px;"></span>
            <span style="color:#999;font-size:10px;margin-right:12px;"> On-time</span>
            <span style="display:inline-block;width:10px;height:10px;background:#ff6b6b;border-radius:2px;"></span>
            <span style="color:#999;font-size:10px;"> Late</span>
          </td>
        </tr>
      </table>`;
  }

  // Addon rows
  let addonSection = '';
  if (r.addons && r.addons.length > 0) {
    let addonRows = '';
    for (const addon of r.addons) {
      addonRows += `
        <tr>
          <td style="padding:8px 12px;color:#fff;font-size:13px;border-bottom:1px solid #2a2a4a;">${addon.name}</td>
          <td style="padding:8px 8px;color:#fff;font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;">${addon.total_selected || 0}</td>
          <td style="padding:8px 8px;color:#D4A843;font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;">${addon.uptake_pct}%</td>
          <td style="padding:8px 8px;color:#D4A843;font-size:13px;text-align:right;border-bottom:1px solid #2a2a4a;">${fmtMoney(addon.revenue || 0)}</td>
        </tr>`;
      if (addon.type === 'select' && addon.options) {
        for (const opt of addon.options) {
          addonRows += `
            <tr>
              <td style="padding:4px 12px 4px 28px;color:#999;font-size:12px;">&bull; ${opt.label}</td>
              <td style="padding:4px 8px;color:#999;font-size:12px;text-align:center;">${opt.count}</td>
              <td colspan="2"></td>
            </tr>`;
        }
      }
    }
    addonSection = `
      <!-- Add-on Performance -->
      <tr><td style="padding:20px 30px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
          <tr><td colspan="4" style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Add-on Performance</span></td></tr>
          <tr>
            <td style="padding:8px 12px;color:#888;font-size:11px;text-transform:uppercase;border-bottom:1px solid #2a2a4a;">Add-on</td>
            <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:center;border-bottom:1px solid #2a2a4a;">Selected</td>
            <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:center;border-bottom:1px solid #2a2a4a;">Uptake</td>
            <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:right;border-bottom:1px solid #2a2a4a;">Revenue</td>
          </tr>
          ${addonRows}
        </table>
      </td></tr>`;
  }

  // Protection section
  let protectionSection = '';
  if (r.protection_claims && r.protection_claims.total_protected_tickets > 0) {
    protectionSection = `
      <!-- Protection & Claims -->
      <tr><td style="padding:20px 30px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
          <tr><td colspan="2" style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Protection &amp; Claims</span></td></tr>
          <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Protected Tickets</td><td style="padding:8px 15px;color:#fff;font-size:13px;text-align:right;">${r.protection_claims.total_protected_tickets}</td></tr>
          <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Protection Revenue</td><td style="padding:8px 15px;color:#D4A843;font-size:13px;text-align:right;">${fmtMoney(r.protection_claims.protection_revenue)}</td></tr>
          <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Claims Submitted</td><td style="padding:8px 15px;color:#fff;font-size:13px;text-align:right;">${r.protection_claims.total_claims}</td></tr>
          <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Approved / Denied / Pending</td><td style="padding:8px 15px;color:#fff;font-size:13px;text-align:right;">${r.protection_claims.approved} / ${r.protection_claims.denied} / ${r.protection_claims.pending}</td></tr>
          <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Total Refunded via Claims</td><td style="padding:8px 15px;color:#ff6b6b;font-size:13px;text-align:right;">${fmtMoney(r.protection_claims.total_refunded)}</td></tr>
          <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Claim Rate</td><td style="padding:8px 15px;color:#fff;font-size:13px;text-align:right;">${r.protection_claims.claim_rate}%</td></tr>
        </table>
      </td></tr>`;
  }

  // Scanner performance
  let scannerSection = '';
  if (r.scanner_performance && r.scanner_performance.length > 0) {
    let scannerRows = '';
    for (const sc of r.scanner_performance) {
      const successRate = sc.total_scans > 0 ? Math.round((sc.valid_scans / sc.total_scans) * 1000) / 10 : 0;
      scannerRows += `
        <tr>
          <td style="padding:8px 12px;color:#fff;font-size:13px;border-bottom:1px solid #2a2a4a;">${sc.name}</td>
          <td style="padding:8px 8px;color:#fff;font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;">${sc.total_scans}</td>
          <td style="padding:8px 8px;color:#4ade80;font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;">${successRate}%</td>
        </tr>`;
    }
    scannerSection = `
      <!-- Scanner Performance -->
      <tr><td style="padding:20px 30px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
          <tr><td colspan="3" style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Scanner Performance</span></td></tr>
          <tr>
            <td style="padding:8px 12px;color:#888;font-size:11px;text-transform:uppercase;border-bottom:1px solid #2a2a4a;">Scanner</td>
            <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:center;border-bottom:1px solid #2a2a4a;">Scans</td>
            <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:center;border-bottom:1px solid #2a2a4a;">Success Rate</td>
          </tr>
          ${scannerRows}
        </table>
      </td></tr>`;
  }

  // Per-session breakdown for combined reports
  let sessionsBlock = '';
  if (isCombined && r.sessions && r.sessions.length > 0) {
    let sessionRows = '';
    for (const s of r.sessions) {
      const sDate = new Date(s.date_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const ciColor = s.checkin_rate > 70 ? '#4ade80' : s.checkin_rate > 40 ? '#fbbf24' : '#ff6b6b';
      const nsColor = s.no_show_rate > 20 ? '#ff6b6b' : '#999';
      sessionRows += `
        <tr>
          <td style="padding:8px 12px;color:#fff;font-size:12px;border-bottom:1px solid #2a2a4a;">${s.title.replace(r.group_name + ' \u2014 ', '')}</td>
          <td style="padding:8px 6px;color:#999;font-size:12px;text-align:center;border-bottom:1px solid #2a2a4a;">${sDate}</td>
          <td style="padding:8px 6px;color:#D4A843;font-size:12px;text-align:right;border-bottom:1px solid #2a2a4a;">${fmtMoney(s.gross_revenue)}</td>
          <td style="padding:8px 6px;color:#fff;font-size:12px;text-align:center;border-bottom:1px solid #2a2a4a;">${s.total_sold}</td>
          <td style="padding:8px 6px;color:${ciColor};font-size:12px;text-align:center;border-bottom:1px solid #2a2a4a;">${s.checkin_rate}%</td>
          <td style="padding:8px 6px;color:${nsColor};font-size:12px;text-align:center;border-bottom:1px solid #2a2a4a;">${s.no_show_rate}%</td>
          <td style="padding:8px 6px;color:#fff;font-size:12px;text-align:center;border-bottom:1px solid #2a2a4a;">${s.total_orders}</td>
        </tr>`;
    }
    sessionsBlock = `
      <tr><td style="padding:25px 30px 15px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
          <tr><td colspan="7" style="padding:15px 15px 8px;border-bottom:2px solid #D4A843;">
            <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Per-Session Breakdown</span>
          </td></tr>
          <tr style="background-color:#0a0a1a;">
            <th style="padding:10px 12px;color:#888;font-size:11px;text-align:left;text-transform:uppercase;">Session</th>
            <th style="padding:10px 6px;color:#888;font-size:11px;text-align:center;text-transform:uppercase;">Date</th>
            <th style="padding:10px 6px;color:#888;font-size:11px;text-align:right;text-transform:uppercase;">Revenue</th>
            <th style="padding:10px 6px;color:#888;font-size:11px;text-align:center;text-transform:uppercase;">Sold</th>
            <th style="padding:10px 6px;color:#888;font-size:11px;text-align:center;text-transform:uppercase;">Check-in</th>
            <th style="padding:10px 6px;color:#888;font-size:11px;text-align:center;text-transform:uppercase;">No-show</th>
            <th style="padding:10px 6px;color:#888;font-size:11px;text-align:center;text-transform:uppercase;">Orders</th>
          </tr>
          ${sessionRows}
        </table>
      </td></tr>`;
  }

  // Comps block
  let compsBlock = '';
  if (r.comps && r.comps.total_comps > 0) {
    compsBlock = `
      <tr><td style="padding:0 30px 15px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
          <tr><td colspan="2" style="padding:15px 15px 8px;border-bottom:2px solid #9333ea;">
            <span style="color:#9333ea;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Complimentary Tickets</span>
          </td></tr>
          <tr>
            <td style="padding:12px 15px;color:#ccc;font-size:13px;">Comp orders issued</td>
            <td style="padding:12px 15px;color:#fff;font-size:13px;text-align:right;font-weight:bold;">${r.comps.total_comps}</td>
          </tr>
          <tr>
            <td style="padding:12px 15px;color:#ccc;font-size:13px;border-top:1px solid #2a2a4a;">Comp codes used</td>
            <td style="padding:12px 15px;color:#fff;font-size:13px;text-align:right;border-top:1px solid #2a2a4a;">${r.comps.comp_codes_used}</td>
          </tr>
        </table>
      </td></tr>`;
  }

  const subject = isCombined
    ? `Combined Event Report: ${r.group_name} — ${r.total_sessions} Sessions`
    : `Event Report: ${event.title} — ${formattedDate}`;
  const timestamp = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:20px 0;">
    <tr><td align="center">
      <table width="650" cellpadding="0" cellspacing="0" style="max-width:650px;width:100%;background-color:#1a1a2e;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 30px;text-align:center;border-bottom:2px solid #D4A843;">
            <p style="margin:0 0 5px;color:#888;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Ayr Pavilion</p>
            <h1 style="margin:0 0 8px;font-size:24px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">Event Report</h1>
            <h2 style="margin:0 0 5px;font-size:20px;color:#fff;">${event.title}</h2>
            <p style="margin:0;color:#999;font-size:14px;">${formattedDate} at ${formattedTime} &mdash; ${event.venue || 'Ayr Pavilion'}</p>
          </td>
        </tr>

        <!-- Hero KPI Strip -->
        <tr>
          <td style="padding:25px 20px;background-color:#12122a;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="25%" style="text-align:center;padding:10px 5px;">
                  <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Gross Revenue</span><br>
                  <span style="color:#D4A843;font-size:26px;font-weight:bold;">${fmtMoney(r.financials.gross_revenue)}</span>
                </td>
                <td width="25%" style="text-align:center;padding:10px 5px;border-left:1px solid #2a2a4a;">
                  <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Tickets Sold</span><br>
                  <span style="color:#fff;font-size:26px;font-weight:bold;">${totalSold}</span>
                  <span style="color:#666;font-size:14px;">/${totalCapacity}</span>
                </td>
                <td width="25%" style="text-align:center;padding:10px 5px;border-left:1px solid #2a2a4a;">
                  <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Check-in Rate</span><br>
                  <span style="color:#4ade80;font-size:26px;font-weight:bold;">${checkinRate}%</span>
                </td>
                <td width="25%" style="text-align:center;padding:10px 5px;border-left:1px solid #2a2a4a;">
                  <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1px;">No-show Rate</span><br>
                  <span style="color:${noShowRate > 10 ? '#ff6b6b' : '#4ade80'};font-size:26px;font-weight:bold;">${noShowRate}%</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Financial Summary -->
        <tr><td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
            <tr><td colspan="2" style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Financial Summary</span></td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:14px;">Ticket Revenue</td><td style="padding:8px 15px;color:#D4A843;font-size:14px;text-align:right;font-weight:bold;">${fmtMoney(r.financials.gross_revenue)}</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:14px;">Booking Fees</td><td style="padding:8px 15px;color:#D4A843;font-size:14px;text-align:right;">${fmtMoney(r.financials.booking_fees)}</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:14px;">Protection Fees</td><td style="padding:8px 15px;color:#D4A843;font-size:14px;text-align:right;">${fmtMoney(r.financials.protection_fees)}</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:14px;">Refunds</td><td style="padding:8px 15px;color:#ff6b6b;font-size:14px;text-align:right;">-${fmtMoney(r.financials.refunds)}</td></tr>
            <tr><td style="padding:12px 15px;color:#fff;font-size:16px;font-weight:bold;border-top:1px solid #2a2a4a;">Net Revenue</td><td style="padding:12px 15px;color:#D4A843;font-size:20px;font-weight:bold;text-align:right;border-top:1px solid #2a2a4a;">${fmtMoney(r.financials.net_revenue)}</td></tr>
          </table>
        </td></tr>

        <!-- Ticket Types -->
        <tr><td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
            <tr><td colspan="6" style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Ticket Types</span></td></tr>
            <tr>
              <td style="padding:8px 12px;color:#888;font-size:11px;text-transform:uppercase;border-bottom:1px solid #2a2a4a;">Type</td>
              <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:right;border-bottom:1px solid #2a2a4a;">Price</td>
              <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:center;border-bottom:1px solid #2a2a4a;">Sold</td>
              <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:center;border-bottom:1px solid #2a2a4a;">In</td>
              <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:center;border-bottom:1px solid #2a2a4a;">No-show</td>
              <td style="padding:8px 8px;color:#888;font-size:11px;text-transform:uppercase;text-align:right;border-bottom:1px solid #2a2a4a;">Revenue</td>
            </tr>
            ${ticketTypeRows}
          </table>
        </td></tr>

        <!-- Sales Timeline -->
        <tr><td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Sales Timeline</span></td></tr>
            <tr><td style="padding:0 15px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#999;font-size:12px;">First Sale</td>
                  <td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">${r.booking_velocity.first_sale || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#999;font-size:12px;">Last Sale</td>
                  <td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">${r.booking_velocity.last_sale || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#999;font-size:12px;">Peak Booking Hour</td>
                  <td style="padding:6px 0;color:#D4A843;font-size:12px;text-align:right;">${r.booking_velocity.peak_hour || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#999;font-size:12px;">Avg Time Between Orders</td>
                  <td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">${r.booking_velocity.avg_minutes_between_orders} mins</td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:8px 15px 15px;">${timelineHtml}</td></tr>
          </table>
        </td></tr>

        <!-- Arrival Intelligence -->
        <tr><td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Arrival Intelligence</span></td></tr>
            <tr><td style="padding:0 15px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#999;font-size:12px;">Peak Arrival</td>
                  <td style="padding:6px 0;color:#D4A843;font-size:12px;text-align:right;">${r.arrival_intelligence.peak_arrival_time || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#999;font-size:12px;">Early / On-time / Late</td>
                  <td style="padding:6px 0;color:#fff;font-size:12px;text-align:right;">
                    <span style="color:#579bfc;">${r.arrival_intelligence.early_pct}%</span> /
                    <span style="color:#4ade80;">${r.arrival_intelligence.on_time_pct}%</span> /
                    <span style="color:#ff6b6b;">${r.arrival_intelligence.late_pct}%</span>
                  </td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:8px 15px 15px;">${arrivalHtml}</td></tr>
          </table>
        </td></tr>

        ${addonSection}

        ${protectionSection}

        <!-- Customer Intelligence -->
        <tr><td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
            <tr><td colspan="2" style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Customer Intelligence</span></td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:13px;">New Customers</td><td style="padding:8px 15px;color:#fff;font-size:13px;text-align:right;">${r.customer_intelligence.new_customers}</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Repeat Customers</td><td style="padding:8px 15px;color:#D4A843;font-size:13px;text-align:right;">${r.customer_intelligence.repeat_customers}</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Marketing Opt-in Rate</td><td style="padding:8px 15px;color:#fff;font-size:13px;text-align:right;">${r.customer_intelligence.opt_in_rate}%</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Avg Spend per Customer</td><td style="padding:8px 15px;color:#D4A843;font-size:13px;text-align:right;">${fmtMoney(r.customer_intelligence.avg_spend_per_customer)}</td></tr>
          </table>
        </td></tr>

        ${scannerSection}

        ${sessionsBlock}

        ${compsBlock}

        <!-- Email Engagement -->
        <tr><td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#12122a;border-radius:12px;overflow:hidden;">
            <tr><td colspan="2" style="padding:15px 15px 8px;"><span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Email Engagement</span></td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Emails Sent</td><td style="padding:8px 15px;color:#fff;font-size:13px;text-align:right;">${r.email_engagement.total_sent}</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Open Rate</td><td style="padding:8px 15px;color:#4ade80;font-size:13px;text-align:right;">${r.email_engagement.open_rate}%</td></tr>
            <tr><td style="padding:8px 15px;color:#999;font-size:13px;">Click Rate</td><td style="padding:8px 15px;color:#4ade80;font-size:13px;text-align:right;">${r.email_engagement.click_rate}%</td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:25px 30px;background-color:#12122a;border-top:1px solid #2a2a4a;text-align:center;margin-top:20px;">
            <p style="margin:0 0 8px;color:#666;font-size:12px;">Report generated at ${timestamp}</p>
            <p style="margin:0;color:#444;font-size:11px;">Ayr Pavilion Ticketing System</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Ayr Pavilion <no-reply@ayrpavilion.com>',
    to,
    subject,
    html
  });
}

module.exports = { sendTicketEmail, resendEmail, sendRefundEmail, sendPasswordResetEmail, sendProtectionEmail, sendCompInviteEmail, sendEventReportEmail, buildGoogleCalendarUrl };
