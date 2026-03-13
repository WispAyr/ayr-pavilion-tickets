# Image Upload + Social Media Post Generator

## 1. Image Upload for Events

### Backend Changes (server/src/routes/events.js)
- Add multer for file upload handling
- `POST /api/events/:id/image` — upload hero image
- Store images in `./data/uploads/` directory
- Serve uploaded images via `GET /uploads/:filename`
- Accept jpg, png, webp, gif — max 10MB
- Generate a thumbnail (400px wide) for listing pages
- Update event.hero_image with the served URL path

Install: `npm install multer sharp`

### Frontend Changes (client/src/pages/admin/EventForm.jsx)
- Replace the URL text input with a drag-and-drop upload zone
- Show image preview after upload
- Keep the URL option as fallback (toggle: "Upload" / "URL")
- Show upload progress
- Click to remove/replace image

### Static file serving
- Add to server/src/index.js: `app.use('/uploads', express.static(path.join(__dirname, '../data/uploads')))`

### Nginx (VPS)
- Add: `location /uploads/ { alias /root/ayr-pavilion-tickets/server/data/uploads/; }`

## 2. Social Media Post Generator

### Backend
- `POST /api/events/:id/social-post` — generate social media content
- Returns ready-to-copy text for Facebook, Instagram, Twitter/X
- Include: event title, date/time, ticket prices, link, hashtags
- Multiple templates/tones: "hype", "informative", "last-chance"

### Admin UI
- New button on event form/list: "📱 Social Post"
- Opens a modal/panel with:
  - Template selector (Hype / Informative / Last Chance / Custom)
  - Generated text preview for each platform (FB, Insta, X)
  - Character count (especially for X/Twitter 280 limit)
  - Copy button per platform
  - Option to include event image
  - Editable before copying
  - Hashtag suggestions based on event type

### Template Examples:

**Hype template:**
```
🛼 ROLLER WEEKEND IS HERE! 🛼

Ayr Pavilion | Friday 10th - Sunday 12th April

🎟️ Tickets:
👤 Adult (Over 12) — £12.50
👦 Child (12 & Under) — £10.00
👁️ Spectator — £5.00
⛸️ Skate Hire — £2.50

Multiple sessions available — grab yours before they sell out!

🎫 Book now: tickets.ayrpavilion.com

#AyrPavilion #RollerSkating #Ayr #FamilyFun #RollerWeekend #Sk8aHolic
```

**Last Chance template:**
```
⚡ LIMITED TICKETS REMAINING ⚡

Roller Weekend at Ayr Pavilion
[X] tickets left for [session]!

Don't miss out 👉 tickets.ayrpavilion.com
```

### Social Post Data Model
```sql
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  platform TEXT NOT NULL,
  template TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## Files to modify:
- server/src/routes/events.js — add image upload endpoint
- server/src/index.js — static file serving for uploads
- server/package.json — add multer, sharp
- client/src/pages/admin/EventForm.jsx — drag-drop upload + social post button
- New: client/src/components/SocialPostModal.jsx
- New: server/src/routes/social.js
- client/src/lib/api.js — new API calls
