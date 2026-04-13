const { getDb } = require('../db');

function cleanupExpiredReservations() {
  try {
    const db = getDb();

    // Find pending orders older than 35 minutes (Stripe sessions expire at 30 min, 5 min buffer)
    const expiredOrders = db.prepare(`
      SELECT * FROM orders
      WHERE status = 'pending'
      AND created_at < datetime('now', '-35 minutes')
    `).all();

    if (expiredOrders.length === 0) return;

    const releaseOrder = db.transaction((order) => {
      // Release reserved inventory (order_items may be null for legacy orders)
      const orderItems = JSON.parse(order.order_items || '[]');
      for (const item of orderItems) {
        db.prepare('UPDATE ticket_types SET sold = MAX(0, sold - ?) WHERE id = ?').run(item.quantity, item.ticketTypeId);
      }
      db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(order.id);

      // Restore event availability if needed
      if (orderItems.length > 0) {
        const ticketTypes = db.prepare('SELECT * FROM ticket_types WHERE event_id = ?').all(order.event_id);
        const hasAvailability = ticketTypes.some(tt => tt.sold < tt.quantity);
        if (hasAvailability) {
          db.prepare("UPDATE events SET status = 'on-sale', updated_at = datetime('now') WHERE id = ? AND status = 'sold-out'").run(order.event_id);
        }
      }
    });

    for (const order of expiredOrders) {
      releaseOrder(order);
      console.log(`[Cleanup] Released reservation for order ${order.order_ref}`);
    }
  } catch (err) {
    console.error('[Cleanup] Error cleaning up expired reservations:', err);
  }
}

function startReservationCleanup(intervalMs = 60000) {
  cleanupExpiredReservations();
  const interval = setInterval(cleanupExpiredReservations, intervalMs);
  console.log(`Reservation cleanup running every ${intervalMs / 1000}s`);
  return interval;
}

module.exports = { startReservationCleanup, cleanupExpiredReservations };
