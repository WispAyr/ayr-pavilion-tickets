// Sales data backup - writes to static JSON file every time an order is created/updated
// Also provides GET /api/backup/sales endpoint

const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');

const BACKUP_DIR = path.join(__dirname, '../../data/backups');
const BACKUP_FILE = path.join(BACKUP_DIR, 'sales-backup.json');

function backupSales() {
  const db = getDb();
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const orders = db.prepare('SELECT * FROM orders').all();
  const tickets = db.prepare('SELECT * FROM tickets').all();
  const events = db.prepare('SELECT * FROM events').all();
  const ticketTypes = db.prepare('SELECT * FROM ticket_types').all();
  const scans = db.prepare('SELECT * FROM scans').all();
  const addons = db.prepare('SELECT * FROM addons').all();
  const addonSelections = db.prepare('SELECT * FROM order_addon_selections').all();

  const backup = {
    exported_at: new Date().toISOString(),
    summary: {
      total_orders: orders.length,
      total_tickets: tickets.length,
      total_revenue_pence: orders.reduce((sum, o) => sum + (o.total || 0), 0),
      total_revenue_gbp: (orders.reduce((sum, o) => sum + (o.total || 0), 0) / 100).toFixed(2),
    },
    orders,
    tickets,
    events,
    ticket_types: ticketTypes,
    scans,
    addons,
    order_addon_selections: addonSelections,
  };

  fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
  console.log(`[Backup] Sales backed up: ${orders.length} orders, ${tickets.length} tickets → ${BACKUP_FILE}`);
  return backup;
}

function setupBackupRoutes(app) {
  // Manual backup trigger
  app.get('/api/backup/sales', (req, res) => {
    try {
      const backup = backupSales();
      res.json({ 
        status: 'ok', 
        message: `Backed up ${backup.orders.length} orders, ${backup.tickets.length} tickets`,
        summary: backup.summary,
        file: BACKUP_FILE
      });
    } catch (err) {
      console.error('Backup failed:', err);
      res.status(500).json({ error: 'Backup failed', details: err.message });
    }
  });

  // Download backup file
  app.get('/api/backup/sales/download', (req, res) => {
    try {
      backupSales(); // Refresh first
      res.download(BACKUP_FILE, `ayr-pavilion-sales-${new Date().toISOString().split('T')[0]}.json`);
    } catch (err) {
      res.status(500).json({ error: 'Backup failed' });
    }
  });
}

module.exports = { backupSales, setupBackupRoutes };
