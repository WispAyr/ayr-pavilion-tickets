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
      require_adult_supervision INTEGER DEFAULT 0,
      supervision_child_max_age INTEGER DEFAULT 12,
      supervision_ratio TEXT DEFAULT '1:1',
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
      refund_amount INTEGER DEFAULT 0,
      refund_reason TEXT,
      refund_notes TEXT,
      refunded_at TEXT,
      stripe_refund_id TEXT,
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

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'admin' CHECK(role IN ('owner','admin','staff')),
      active INTEGER DEFAULT 1,
      last_login TEXT,
      reset_token TEXT,
      reset_token_expires TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scanner_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
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

    -- Addons
    CREATE TABLE IF NOT EXISTS addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      type TEXT DEFAULT 'select' CHECK(type IN ('select','checkbox','quantity')),
      max_quantity INTEGER DEFAULT 1,
      required INTEGER DEFAULT 0,
      per_ticket INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS addon_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      addon_id INTEGER NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      stock INTEGER DEFAULT 0,
      reserved INTEGER DEFAULT 0,
      price_override INTEGER,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS addon_ticket_types (
      addon_id INTEGER NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
      ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      PRIMARY KEY (addon_id, ticket_type_id)
    );

    CREATE TABLE IF NOT EXISTS order_addon_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      ticket_id INTEGER REFERENCES tickets(id),
      addon_id INTEGER NOT NULL REFERENCES addons(id),
      addon_option_id INTEGER REFERENCES addon_options(id),
      selected_option TEXT,
      quantity INTEGER DEFAULT 1,
      price INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Waivers
    CREATE TABLE IF NOT EXISTS waivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'checkbox' CHECK(type IN ('checkbox','signature','scroll-agree')),
      content TEXT NOT NULL,
      required INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS waiver_ticket_types (
      waiver_id INTEGER NOT NULL REFERENCES waivers(id) ON DELETE CASCADE,
      ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      PRIMARY KEY (waiver_id, ticket_type_id)
    );

    CREATE TABLE IF NOT EXISTS waiver_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      waiver_id INTEGER NOT NULL REFERENCES waivers(id),
      accepted_at TEXT DEFAULT (datetime('now')),
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      platform TEXT NOT NULL,
      template TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add age range columns to ticket_types (safe to run multiple times)
  const ticketTypeCols = db.prepare("PRAGMA table_info(ticket_types)").all().map(c => c.name);
  if (!ticketTypeCols.includes('age_min')) {
    db.exec('ALTER TABLE ticket_types ADD COLUMN age_min INTEGER');
  }
  if (!ticketTypeCols.includes('age_max')) {
    db.exec('ALTER TABLE ticket_types ADD COLUMN age_max INTEGER');
  }
  if (!ticketTypeCols.includes('age_label')) {
    db.exec('ALTER TABLE ticket_types ADD COLUMN age_label TEXT');
  }

  // Add pending_data column to orders (stores addon/waiver data to avoid Stripe metadata limits)
  const orderCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
  if (!orderCols.includes('pending_data')) {
    db.exec('ALTER TABLE orders ADD COLUMN pending_data TEXT');
  }

  // Seed default admin user if none exist
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (adminCount.count === 0) {
    const bcryptjs = require('bcryptjs');
    const hash = bcryptjs.hashSync(process.env.ADMIN_PASSWORD || 'pavilion-admin-2026', 10);
    db.prepare(`INSERT INTO admin_users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)`).run(
      process.env.ADMIN_USERNAME || 'admin',
      'admin@ayrpavilion.com',
      hash,
      'Admin',
      'owner'
    );
    console.log('Default admin user created');
  }

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
