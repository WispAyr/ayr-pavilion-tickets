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

    -- Ticket Protection
    CREATE TABLE IF NOT EXISTS protection_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      min_price INTEGER NOT NULL,
      max_price INTEGER,
      fee INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS protection_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      claim_ref TEXT UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      reason_category TEXT DEFAULT 'other',
      customer_email TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
      admin_notes TEXT,
      refund_amount INTEGER,
      requested_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by TEXT
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

  // Add protection columns to orders table
  const orderCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
  if (!orderCols.includes('protection_opted')) {
    db.exec('ALTER TABLE orders ADD COLUMN protection_opted INTEGER DEFAULT 0');
  }
  if (!orderCols.includes('protection_fee')) {
    db.exec('ALTER TABLE orders ADD COLUMN protection_fee INTEGER DEFAULT 0');
  }

  // Seed default protection tiers if empty
  const tierCount = db.prepare('SELECT COUNT(*) as count FROM protection_tiers').get();
  if (tierCount.count === 0) {
    db.exec(`
      INSERT INTO protection_tiers (min_price, max_price, fee, sort_order) VALUES (0, 1500, 150, 1);
      INSERT INTO protection_tiers (min_price, max_price, fee, sort_order) VALUES (1501, 3000, 250, 2);
      INSERT INTO protection_tiers (min_price, max_price, fee, sort_order) VALUES (3001, 5000, 500, 3);
      INSERT INTO protection_tiers (min_price, max_price, fee, sort_order) VALUES (5001, 8000, 750, 4);
      INSERT INTO protection_tiers (min_price, max_price, fee, sort_order) VALUES (8001, NULL, 1000, 5);
    `);
  }

  // --- Complimentary Tickets ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS comp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      event_id INTEGER NOT NULL REFERENCES events(id),
      max_tickets INTEGER NOT NULL DEFAULT 10,
      used_tickets INTEGER DEFAULT 0,
      recipient_name TEXT,
      recipient_email TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );
  `);

  if (!orderCols.includes('comp_code_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN comp_code_id INTEGER');
  }

  if (!orderCols.includes('refund_amount')) {
    db.exec('ALTER TABLE orders ADD COLUMN refund_amount INTEGER DEFAULT 0');
  }

  if (!orderCols.includes('marketing_opt_in')) {
    db.exec('ALTER TABLE orders ADD COLUMN marketing_opt_in INTEGER DEFAULT 0');
  }

  if (!orderCols.includes('order_items')) {
    db.exec('ALTER TABLE orders ADD COLUMN order_items TEXT');
  }


  // Group passes — one QR per purchaser per event for batch check-in
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_passes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_group_passes_event_email ON group_passes(event_id, email);
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
