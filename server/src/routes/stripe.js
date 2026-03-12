const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { createCheckoutSession, constructWebhookEvent } = require('../services/stripe');
const { generateQrDataUrl } = require('../services/qr');
const { sendTicketEmail } = require('../services/email');

function generateOrderRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'APT-';
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

// POST /api/stripe/checkout - create Stripe Checkout Session
router.post('/checkout', async (req, res) => {
  try {
    const db = getDb();
    const { eventId, items, customerName, customerEmail, customerPhone, addonSelections, waiverAcceptances } = req.body;

    if (!eventId || !items || !items.length || !customerName || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields: eventId, items, customerName, customerEmail' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.status !== 'on-sale') {
      return res.status(400).json({ error: 'Event is not currently on sale' });
    }

    // Validate adult supervision rule
    if (event.require_adult_supervision) {
      const maxChildAge = event.supervision_child_max_age || 12;
      let adultCount = 0;
      let childCount = 0;

      for (const item of items) {
        const tt = db.prepare('SELECT * FROM ticket_types WHERE id = ? AND event_id = ?').get(item.ticketTypeId, eventId);
        if (!tt) continue;
        if (tt.age_max && tt.age_max <= maxChildAge) {
          childCount += item.quantity;
        } else {
          adultCount += item.quantity;
        }
      }

      if (childCount > 0 && adultCount < 1) {
        return res.status(400).json({
          error: `Children under ${maxChildAge} must be accompanied by at least one adult. Please add an adult ticket.`
        });
      }

      // Parse ratio (e.g. "1:1" = 1 adult per 1 child)
      const ratio = (event.supervision_ratio || '1:1').split(':').map(Number);
      const requiredAdults = Math.ceil(childCount * (ratio[0] / ratio[1]));
      if (adultCount < requiredAdults) {
        return res.status(400).json({
          error: `At least ${requiredAdults} adult ticket(s) required for ${childCount} child ticket(s) (${event.supervision_ratio} adult-to-child ratio).`
        });
      }
    }

    // Validate ticket types and availability
    let totalPence = 0;
    const lineItems = [];
    const orderItems = [];

    for (const item of items) {
      const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ? AND event_id = ?').get(item.ticketTypeId, eventId);

      if (!ticketType) {
        return res.status(404).json({ error: `Ticket type ${item.ticketTypeId} not found` });
      }

      const available = ticketType.quantity - ticketType.sold;
      if (item.quantity > available) {
        return res.status(400).json({
          error: `Only ${available} ${ticketType.name} tickets remaining`
        });
      }

      // Check sale window
      const now = new Date().toISOString();
      if (ticketType.sale_start && now < ticketType.sale_start) {
        return res.status(400).json({ error: `${ticketType.name} tickets are not yet on sale` });
      }
      if (ticketType.sale_end && now > ticketType.sale_end) {
        return res.status(400).json({ error: `${ticketType.name} ticket sales have ended` });
      }

      const itemTotal = ticketType.price * item.quantity;
      totalPence += itemTotal;

      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `${ticketType.name} - ${event.title}`,
            description: ticketType.description || `${ticketType.name} ticket for ${event.title}`,
            metadata: {
              event_id: String(event.id),
              ticket_type_id: String(ticketType.id)
            }
          },
          unit_amount: ticketType.price
        },
        quantity: item.quantity
      });

      orderItems.push({
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity: item.quantity,
        price: ticketType.price
      });
    }

    // Validate and calculate addon costs
    let addonTotal = 0;
    const validatedAddons = [];

    if (addonSelections && addonSelections.length > 0) {
      for (const sel of addonSelections) {
        const addon = db.prepare('SELECT * FROM addons WHERE id = ? AND event_id = ? AND active = 1').get(sel.addonId, eventId);
        if (!addon) continue;

        let unitPrice = addon.price;
        let optionLabel = sel.selectedOption || null;
        let addonOptionId = null;

        if (addon.type === 'select' && sel.addonOptionId) {
          const option = db.prepare('SELECT * FROM addon_options WHERE id = ? AND addon_id = ? AND active = 1').get(sel.addonOptionId, addon.id);
          if (!option) continue;
          if (option.stock > 0 && option.reserved >= option.stock) {
            return res.status(400).json({ error: `${addon.name} - ${option.label} is out of stock` });
          }
          unitPrice = option.price_override !== null ? option.price_override : addon.price;
          optionLabel = option.label;
          addonOptionId = option.id;
        }

        const qty = sel.quantity || 1;
        addonTotal += unitPrice * qty;

        validatedAddons.push({
          addonId: addon.id,
          addonName: addon.name,
          addonOptionId,
          selectedOption: optionLabel,
          quantity: qty,
          price: unitPrice,
          ticketIndex: sel.ticketIndex !== undefined ? sel.ticketIndex : null,
          ticketTypeId: sel.ticketTypeId || null
        });

        lineItems.push({
          price_data: {
            currency: 'gbp',
            product_data: {
              name: optionLabel ? `${addon.name}: ${optionLabel}` : addon.name,
              description: addon.description || `Add-on for ${event.title}`,
            },
            unit_amount: unitPrice
          },
          quantity: qty
        });
      }
    }

    totalPence += addonTotal;

    // Validate required waivers
    const requiredWaivers = db.prepare(`
      SELECT * FROM waivers WHERE (event_id = ? OR event_id IS NULL) AND active = 1 AND required = 1
    `).all(eventId);

    if (requiredWaivers.length > 0) {
      const acceptedIds = (waiverAcceptances || []).map(w => w.waiverId);
      for (const w of requiredWaivers) {
        const waiverTtIds = db.prepare('SELECT ticket_type_id FROM waiver_ticket_types WHERE waiver_id = ?').all(w.id).map(r => r.ticket_type_id);
        const selectedTtIds = items.map(i => i.ticketTypeId);
        if (waiverTtIds.length > 0 && !waiverTtIds.some(id => selectedTtIds.includes(id))) continue;
        if (!acceptedIds.includes(w.id)) {
          return res.status(400).json({ error: `You must accept the "${w.name}" waiver to proceed` });
        }
      }
    }

    // Create pending order
    const orderRef = generateOrderRef();
    const appUrl = process.env.APP_URL || 'http://localhost:5173';

    const session = await createCheckoutSession({
      lineItems,
      customerEmail,
      customerName,
      orderRef,
      successUrl: `${appUrl}/order/success?ref=${orderRef}`,
      cancelUrl: `${appUrl}/events/${event.slug}`,
      metadata: {
        event_id: String(event.id),
        order_items: JSON.stringify(orderItems),
        addon_selections: validatedAddons.length > 0 ? JSON.stringify(validatedAddons) : undefined,
        waiver_acceptances: waiverAcceptances && waiverAcceptances.length > 0 ? JSON.stringify(waiverAcceptances) : undefined
      }
    });

    db.prepare(`
      INSERT INTO orders (order_ref, event_id, customer_name, customer_email, customer_phone, total, status, stripe_session_id)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(orderRef, eventId, customerName, customerEmail, customerPhone || null, totalPence, session.id);

    res.json({ url: session.url, orderRef });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/stripe/webhook - Stripe webhook handler
router.post('/webhook', async (req, res) => {
  let event;

  try {
    const signature = req.headers['stripe-signature'];
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    const db = getDb();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderRef = session.metadata.order_ref;
        const eventId = parseInt(session.metadata.event_id, 10);
        const orderItems = JSON.parse(session.metadata.order_items);

        const order = db.prepare('SELECT * FROM orders WHERE order_ref = ?').get(orderRef);
        if (!order) {
          console.error(`Order not found for ref: ${orderRef}`);
          break;
        }

        // Update order status
        db.prepare(`
          UPDATE orders SET
            status = 'paid',
            stripe_payment_intent = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(session.payment_intent, order.id);

        // Generate tickets
        const tickets = [];
        const insertTicket = db.prepare(`
          INSERT INTO tickets (code, order_id, event_id, ticket_type_id, holder_name)
          VALUES (?, ?, ?, ?, ?)
        `);
        const updateSold = db.prepare(`
          UPDATE ticket_types SET sold = sold + ? WHERE id = ?
        `);

        const generateTickets = db.transaction(() => {
          for (const item of orderItems) {
            updateSold.run(item.quantity, item.ticketTypeId);

            for (let i = 0; i < item.quantity; i++) {
              const code = uuidv4();
              insertTicket.run(code, order.id, eventId, item.ticketTypeId, order.customer_name);
              tickets.push({
                code,
                ticketTypeName: item.ticketTypeName
              });
            }
          }
        });

        generateTickets();

        // Store addon selections
        const addonSelectionsRaw = session.metadata.addon_selections;
        if (addonSelectionsRaw) {
          try {
            const addonSels = JSON.parse(addonSelectionsRaw);
            const insertAddonSel = db.prepare(`
              INSERT INTO order_addon_selections (order_id, ticket_id, addon_id, addon_option_id, selected_option, quantity, price)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const updateOptionReserved = db.prepare(`
              UPDATE addon_options SET reserved = reserved + 1 WHERE id = ?
            `);

            for (const sel of addonSels) {
              // For per-ticket addons, link to the specific ticket
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

              insertAddonSel.run(
                order.id, ticketId, sel.addonId, sel.addonOptionId || null,
                sel.selectedOption, sel.quantity || 1, sel.price
              );

              if (sel.addonOptionId) {
                updateOptionReserved.run(sel.addonOptionId);
              }
            }
          } catch (e) {
            console.error('Error storing addon selections:', e);
          }
        }

        // Store waiver acceptances
        const waiverAcceptancesRaw = session.metadata.waiver_acceptances;
        if (waiverAcceptancesRaw) {
          try {
            const waiverAccs = JSON.parse(waiverAcceptancesRaw);
            const insertWaiverAcc = db.prepare(`
              INSERT INTO waiver_acceptances (order_id, waiver_id, ip_address, user_agent)
              VALUES (?, ?, ?, ?)
            `);
            for (const acc of waiverAccs) {
              insertWaiverAcc.run(order.id, acc.waiverId, acc.ipAddress || null, acc.userAgent || null);
            }
          } catch (e) {
            console.error('Error storing waiver acceptances:', e);
          }
        }

        // Check if event is now sold out
        const ticketTypes = db.prepare('SELECT * FROM ticket_types WHERE event_id = ?').all(eventId);
        const allSoldOut = ticketTypes.every(tt => tt.sold >= tt.quantity);
        if (allSoldOut) {
          db.prepare("UPDATE events SET status = 'sold-out', updated_at = datetime('now') WHERE id = ?").run(eventId);
        }

        // Send confirmation email (async, don't block webhook response)
        const eventData = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
        if (eventData) {
          sendTicketEmail({
            to: order.customer_email,
            customerName: order.customer_name,
            eventTitle: eventData.title,
            dateTime: eventData.date_time,
            doorsOpen: eventData.doors_open,
            venue: eventData.venue,
            ticketTypeName: orderItems[0].ticketTypeName,
            tickets,
            orderRef,
            orderId: order.id
          }).catch(err => {
            console.error('Failed to send ticket email:', err.message);
          });
        }

        console.log(`Order ${orderRef} completed: ${tickets.length} tickets generated`);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const paymentIntent = charge.payment_intent;

        const order = db.prepare('SELECT * FROM orders WHERE stripe_payment_intent = ?').get(paymentIntent);
        if (order) {
          db.prepare(`
            UPDATE orders SET status = 'refunded', updated_at = datetime('now') WHERE id = ?
          `).run(order.id);

          db.prepare(`
            UPDATE tickets SET status = 'refunded' WHERE order_id = ?
          `).run(order.id);

          // Restore sold counts
          const orderTickets = db.prepare(`
            SELECT ticket_type_id, COUNT(*) as count FROM tickets WHERE order_id = ? GROUP BY ticket_type_id
          `).all(order.id);

          for (const t of orderTickets) {
            db.prepare('UPDATE ticket_types SET sold = MAX(0, sold - ?) WHERE id = ?').run(t.count, t.ticket_type_id);
          }

          console.log(`Order ${order.order_ref} refunded`);
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  res.json({ received: true });
});

module.exports = router;
