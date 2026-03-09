# Ayr Pavilion Ticketing System

## Overview
Build a complete ticketing platform for ayrpavilion.com — a live event venue in Ayr, Scotland.
The current site is a static landing page at https://ayrpavilion.com hosted on VPS 172.81.61.36.

## Stack
- **Backend:** Node.js/Express + PostgreSQL
- **Frontend:** React + Tailwind CSS (mobile-first)
- **Payments:** Stripe Checkout Sessions + Webhooks
- **QR:** Generate unique ticket codes as QR codes

## Core Features

### 1. Event Management (Admin)
- Create/edit/delete events
- Event fields: title, slug, date/time, doors open, venue, description, hero image, capacity
- Multiple ticket types per event (Early Bird, General, VIP, Table, Group, etc.)
- Each ticket type: name, price, quantity available, description, sale start/end dates
- Event status: draft, on-sale, sold-out, completed, cancelled
- Dashboard with sales stats, revenue, check-in counts

### 2. Public Event Pages
- Beautiful event listing page at /events
- Individual event pages at /events/{slug} (e.g. /events/wrestling-night-march-22)
- Mobile-first responsive design
- Ticket selection + quantity picker
- Stripe Checkout integration
- Countdown timer for upcoming events
- Share buttons (social media)
- Past events gallery

### 3. Stripe Integration
- Stripe Checkout Sessions for payment
- Webhook handler for payment confirmation
- Automatic ticket generation on successful payment
- Refund support (admin-initiated)
- Use Stripe test keys for now: pk_test and sk_test (add to .env)

### 4. Ticket Delivery
- On payment confirmation, generate unique ticket with UUID code
- Send beautiful mobile-first HTML email with:
  - Event name, date, venue
  - Ticket type and quantity
  - Large scannable QR code (the ticket code)
  - Add to calendar link
  - Venue map/directions
  - Terms & conditions
- Also accessible via web: /tickets/{code}

### 5. Door Scanner
- Mobile-friendly web page at /scan
- Uses device camera to scan QR codes
- Real-time validation against database
- Shows: valid/invalid, ticket holder name, ticket type, already scanned warning
- Scan count dashboard
- Works offline-tolerant (queue scans if connection drops)
- PIN/password protected

### 6. Future-Proof Schema
- Promo/discount codes
- Seating/table assignments
- Guest lists (free entry)
- Age restrictions
- Waitlist when sold out
- Multi-day events / festivals
- Booking fees (configurable)
- Door list export (PDF)

## Database Schema (PostgreSQL)
Design a clean schema covering: events, ticket_types, orders, tickets, scans, promo_codes, settings

## Design
- Dark theme matching ayrpavilion.com (the current site uses dark navy/black with gold accents)
- Modern, premium feel — this is a nightlife/events venue
- Mobile-first everything
- Animations and transitions for polish
- Font: Inter or similar modern sans-serif

## Deployment Notes
- Will deploy on VPS 172.81.61.36 alongside existing site
- Backend on a port (e.g. 3970), reverse proxied
- Frontend can be static build served by nginx
- PostgreSQL already available on the VPS or use SQLite for v1

## API Design
RESTful API with these groups:
- `/api/events` — CRUD for events
- `/api/events/:id/ticket-types` — manage ticket types
- `/api/orders` — order management
- `/api/tickets/:code` — ticket lookup/validation
- `/api/scan` — scan/validate ticket
- `/api/admin/dashboard` — stats and reporting
- `/api/stripe/webhook` — Stripe webhook handler
- `/api/stripe/checkout` — create checkout session

## GitHub
Create repo: WispAyr/ayr-pavilion-tickets
