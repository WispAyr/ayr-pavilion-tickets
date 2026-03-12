# Ticket Addons, Age Ranges, Waivers — Feature Spec

## Overview
Add three new features to the Ayr Pavilion ticketing system:
1. **Ticket Addons** — configurable per-event and per-ticket-type
2. **Age Ranges** — optional display on ticket types
3. **Waivers/Agreements** — required acceptance during checkout

## 1. Ticket Addons

### Database
Create new tables:

```sql
CREATE TABLE IF NOT EXISTS addons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- e.g. "Skate Hire"
  description TEXT,             -- e.g. "Includes boots and blades"
  price INTEGER NOT NULL,       -- in pence
  type TEXT DEFAULT 'select' CHECK(type IN ('select','checkbox','quantity')),
  -- select: pick from options (e.g. shoe size)
  -- checkbox: yes/no add-on (e.g. insurance)  
  -- quantity: pick a number (e.g. extra drink tokens)
  options TEXT,                 -- JSON array for 'select' type, e.g. ["UK 1","UK 2","UK 3"..."UK 13"]
  max_quantity INTEGER DEFAULT 1,
  required INTEGER DEFAULT 0,   -- must select for this ticket?
  per_ticket INTEGER DEFAULT 1, -- 1 = per individual ticket, 0 = per order
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Link addons to specific ticket types (if empty, addon applies to ALL ticket types for the event)
CREATE TABLE IF NOT EXISTS addon_ticket_types (
  addon_id INTEGER NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  PRIMARY KEY (addon_id, ticket_type_id)
);

-- Track addon selections per ticket in orders
CREATE TABLE IF NOT EXISTS order_addon_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id),
  addon_id INTEGER NOT NULL REFERENCES addons(id),
  selected_option TEXT,       -- for 'select' type (e.g. "UK 8")
  quantity INTEGER DEFAULT 1, -- for 'quantity' type
  price INTEGER NOT NULL,     -- price at time of purchase (in pence)
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Example: Ice Skating Event
- Addon: "Skate Hire" (type: select, options: ["UK 1","UK 2","UK 3","UK 4","UK 5","UK 6","UK 7","UK 8","UK 9","UK 10","UK 11","UK 12","UK 13"], price: 0 or 300 or whatever, required: true, per_ticket: 1)
- Addon: "Locker" (type: checkbox, price: 200, required: false)
- Addon: "Hot Chocolate" (type: quantity, price: 350, max_quantity: 5)

### Admin UI
- In the EventForm.jsx, add an "Addons" section below ticket types
- CRUD for addons: name, type, price, options (dynamic list for select type), required flag
- Ability to link addon to specific ticket types or all
- Drag to reorder

### Checkout UI (EventDetailPage.jsx)
- After selecting ticket quantities, show relevant addons
- For per-ticket addons, show for EACH ticket (e.g. "Ticket 1 - Skate Size: [dropdown]", "Ticket 2 - Skate Size: [dropdown]")
- For per-order addons, show once
- Include addon prices in order total
- Required addons must be completed before checkout

### Stripe Integration
- Include addons as line items in Stripe Checkout
- Store addon selections in order_addon_selections table

### Ticket Email & View
- Show addon details on the ticket (e.g. "Skate Hire: UK 8")

## 2. Age Ranges on Ticket Types

### Database
Add columns to ticket_types:
```sql
ALTER TABLE ticket_types ADD COLUMN age_min INTEGER;      -- e.g. 5
ALTER TABLE ticket_types ADD COLUMN age_max INTEGER;      -- e.g. 12
ALTER TABLE ticket_types ADD COLUMN age_label TEXT;        -- e.g. "Child (5-12)", displayed on frontend
```

### Admin UI
- Add optional age_min, age_max, age_label fields to ticket type form
- age_label auto-generates from min/max if not manually set (e.g. "Ages 5-12")

### Frontend
- Display age label on ticket type cards (subtle badge)
- Informational only — no hard validation (parent buys for child)

## 3. Waivers & Agreements

### Database
```sql
CREATE TABLE IF NOT EXISTS waivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,  -- NULL = global waiver
  name TEXT NOT NULL,           -- e.g. "Skating Liability Waiver"
  type TEXT DEFAULT 'checkbox' CHECK(type IN ('checkbox','signature','scroll-agree')),
  content TEXT NOT NULL,        -- full waiver text (markdown or HTML)
  required INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Link waivers to specific ticket types (optional, empty = all)
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
```

### Template Waivers (seed these)

**Ice Skating / Activity Liability Waiver:**
Standard assumption of risk, release of liability for skating activities. Covers injury, equipment damage. Mentions following venue rules, protective gear recommendations, medical conditions disclosure.

**Social Media / Photography Waiver:**
Consent for venue to use photos/videos taken during the event for marketing, social media, website, and promotional materials. Right to opt out. Covers both professional photography and incidental capture.

**General Event Terms & Conditions:**
No refunds policy, age restrictions, behaviour expectations, right to refuse entry, venue liability limitations.

### Admin UI
- Waiver management section in event form
- Rich text editor for waiver content
- Template picker: "Load template" dropdown with pre-built waivers
- Link to specific ticket types or all
- Preview waiver as customer would see it

### Checkout UI
- After customer info, before payment — show required waivers
- Checkbox type: show summary with expandable full text, checkbox to agree
- Must accept all required waivers before proceeding to Stripe
- Store acceptance with timestamp, IP, user agent

### Ticket/Order
- Show "Waivers accepted" on order confirmation
- Admin can see waiver acceptance records per order

## Implementation Notes
- All DB changes via ALTER TABLE + CREATE TABLE IF NOT EXISTS (no migrations needed for SQLite)
- Keep the existing dark theme + gold accent design language
- Mobile-first — addons and waivers must work great on phone
- The addon selection for "per ticket" items should be clean and not overwhelming (accordion per ticket?)
- Test with the ice skating use case: Adult + Child tickets, skate hire addon with sizes, liability waiver + social media waiver

## Files to modify:
- `server/src/db.js` — new tables
- `server/src/routes/ticket-types.js` — age range fields
- New: `server/src/routes/addons.js` — CRUD for addons
- New: `server/src/routes/waivers.js` — CRUD for waivers  
- `server/src/routes/stripe.js` — include addons in checkout, store waiver acceptances
- `server/src/routes/events.js` — include addons+waivers in event response
- `server/src/index.js` — register new routes
- `client/src/pages/EventDetailPage.jsx` — addon selection + waiver acceptance UI
- `client/src/pages/admin/EventForm.jsx` — addon + waiver management
- `client/src/pages/OrderSuccessPage.jsx` — show addon details
- `client/src/pages/TicketViewPage.jsx` — show addon details on ticket
- `client/src/lib/api.js` — new API calls
- `server/src/services/email.js` — include addons in ticket email

## IMPORTANT: Skate Hire Addon — Real Inventory Data

The addon system needs to support STOCK TRACKING per option. Here's the real skate inventory:

| Size | Stock |
|------|-------|
| Child UK 6-9 | 4 |
| Child UK 8-11 | 3 |
| Child UK 10-13 | 4 |
| Child UK 12-2 | 20 |
| Child UK 3-6 | 8 |
| UK 3 | 5 |
| UK 4 | 10 |
| UK 5 | 15 |
| UK 6 | 20 |
| UK 7 | 15 |
| UK 8 | 10 |
| UK 9 | 5 |
| UK 10 | 4 |
| UK 11 | 3 |
| UK 12 | 2 |
| **Total** | **128** |

So the addon options need STOCK per option, not just a flat list. Update the schema:

```sql
-- Replace the simple 'options TEXT' (JSON array) with a proper options table:
CREATE TABLE IF NOT EXISTS addon_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  addon_id INTEGER NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  label TEXT NOT NULL,          -- e.g. "Child UK 6-9", "UK 8"
  stock INTEGER DEFAULT 0,     -- available inventory
  reserved INTEGER DEFAULT 0,  -- currently reserved/sold
  price_override INTEGER,      -- optional: different price for this option (NULL = use addon base price)
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
```

- When a customer selects "Child UK 12-2", decrement stock / increment reserved
- Show "X left" or "Out of stock" per option in the dropdown
- Admin can manage stock levels per option
- The options column on the addons table can be removed — use addon_options table instead

This supports ANY addon with sized/stocked options: skate hire, helmet sizes, t-shirt sizes, etc.
