const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function initialize() {
  const dbPath = process.env.DATABASE_PATH || './data/pavilion.db';
  const fullPath = path.resolve(__dirname, '..', dbPath);
  const dbDir = path.dirname(fullPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(fullPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      date_time TEXT NOT NULL,
      doors_open TEXT,
      venue TEXT DEFAULT 'Ayr Pavilion',
      description TEXT,
      hero_image TEXT,
      capacity INTEGER,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','on-sale','sold-out','completed','cancelled')),
      age_restriction TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      sold INTEGER DEFAULT 0,
      description TEXT,
      sale_start TEXT,
      sale_end TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_ref TEXT UNIQUE NOT NULL,
      event_id INTEGER NOT NULL REFERENCES events(id),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      total INTEGER NOT NULL,
      booking_fee INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','refunded','cancelled')),
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      event_id INTEGER NOT NULL REFERENCES events(id),
      ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id),
      holder_name TEXT,
      status TEXT DEFAULT 'valid' CHECK(status IN ('valid','used','cancelled','refunded')),
      checked_in_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      scanned_at TEXT DEFAULT (datetime('now')),
      result TEXT NOT NULL,
      scanned_by TEXT
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      event_id INTEGER REFERENCES events(id),
      discount_type TEXT CHECK(discount_type IN ('percentage','fixed')),
      discount_value INTEGER NOT NULL,
      max_uses INTEGER,
      used INTEGER DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER REFERENCES tickets(id),
      order_id INTEGER REFERENCES orders(id),
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'queued',
      sent_at TEXT,
      opened_at TEXT,
      opened_count INTEGER DEFAULT 0,
      clicked_at TEXT,
      clicked_count INTEGER DEFAULT 0,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('Database initialized successfully');
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initialize() first.');
  }
  return db;
}

module.exports = { initialize, getDb };
