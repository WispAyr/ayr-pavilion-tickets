const nodemailer = require('nodemailer');
const { generateQrBuffer } = require('./qr');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
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

function buildEmailHtml({ eventTitle, dateTime, doorsOpen, venue, ticketTypeName, ticketCode, quantity, orderRef, calendarUrl }) {
  const eventDate = new Date(dateTime);
  const formattedDate = eventDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const formattedTime = eventDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const doorsText = doorsOpen
    ? new Date(doorsOpen).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  return `
<!DOCTYPE html>
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
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;margin-bottom:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">Date</td>
                      </tr>
                      <tr>
                        <td style="color:#ffffff;font-size:16px;">${formattedDate}</td>
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
                          <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Time</span><br>
                          <span style="color:#ffffff;font-size:16px;">${formattedTime}</span>
                        </td>
                        ${doorsText ? `
                        <td width="50%">
                          <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Doors Open</span><br>
                          <span style="color:#ffffff;font-size:16px;">${doorsText}</span>
                        </td>
                        ` : ''}
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

              <!-- Order Reference -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:12px 15px;background-color:#12122a;border-radius:8px;text-align:center;">
                    <span style="color:#D4A843;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Reference</span><br>
                    <span style="color:#ffffff;font-size:18px;font-weight:bold;font-family:monospace;">${orderRef}</span>
                  </td>
                </tr>
              </table>

              <!-- Add to Calendar -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td align="center">
                    <a href="${calendarUrl}" target="_blank" style="display:inline-block;padding:14px 30px;background-color:#D4A843;color:#1a1a2e;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;text-transform:uppercase;letter-spacing:1px;">
                      Add to Calendar
                    </a>
                  </td>
                </tr>
              </table>

              <!-- View Ticket Online -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;">
                <tr>
                  <td align="center">
                    <a href="${process.env.APP_URL || 'http://localhost:5173'}/tickets/${ticketCode}" target="_blank" style="display:inline-block;padding:12px 30px;border:1px solid #D4A843;color:#D4A843;text-decoration:none;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                      View Ticket Online
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
              <p style="margin:0;color:#444;font-size:11px;">This ticket is non-transferable. No refunds unless the event is cancelled.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendTicketEmail({ to, customerName, eventTitle, dateTime, doorsOpen, venue, ticketTypeName, tickets, orderRef }) {
  const transporter = createTransporter();

  const calendarUrl = buildGoogleCalendarUrl({
    title: eventTitle,
    dateTime,
    venue,
    description: `Your tickets for ${eventTitle} at ${venue}. Order ref: ${orderRef}`
  });

  for (const ticket of tickets) {
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
      calendarUrl
    });

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'Ayr Pavilion <tickets@ayrpavilion.com>',
        to,
        subject: `Your Tickets: ${eventTitle} - ${venue}`,
        html,
        attachments: [
          {
            filename: 'qrcode.png',
            content: qrBuffer,
            cid: 'qrcode'
          }
        ]
      });
    } catch (err) {
      console.error(`Failed to send ticket email to ${to} for ticket ${ticket.code}:`, err.message);
    }
  }
}

module.exports = { sendTicketEmail, buildGoogleCalendarUrl };
