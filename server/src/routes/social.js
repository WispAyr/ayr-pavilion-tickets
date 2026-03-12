const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { adminAuth } = require('../middleware/auth');

// Keyword-to-hashtag mapping
const HASHTAG_MAP = {
  roller: '#RollerSkating',
  skating: '#RollerSkating',
  skate: '#RollerSkating',
  disco: '#RollerDisco',
  family: '#FamilyFun',
  kids: '#KidsFun',
  children: '#KidsFun',
  party: '#PartyTime',
  halloween: '#Halloween',
  christmas: '#Christmas',
  xmas: '#Christmas',
  summer: '#Summer',
  live: '#LiveEvent',
  music: '#LiveMusic',
  glow: '#GlowParty',
  neon: '#NeonNights',
};

function buildHashtags(title) {
  const base = ['#AyrPavilion', '#Ayr'];
  const titleLower = title.toLowerCase();

  for (const [keyword, tag] of Object.entries(HASHTAG_MAP)) {
    if (titleLower.includes(keyword) && !base.includes(tag)) {
      base.push(tag);
    }
  }

  return base.join(' ');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(dateStr) {
  return `${formatDate(dateStr)} at ${formatTime(dateStr)}`;
}

function formatPrice(pence) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

const TICKET_EMOJIS = ['\ud83c\udfab', '\ud83c\udf9f\ufe0f', '\u2b50', '\ud83d\udd25', '\ud83c\udf1f'];

function generateHype(event, ticketTypes) {
  const ticketLines = ticketTypes.map((tt, i) => {
    const emoji = TICKET_EMOJIS[i % TICKET_EMOJIS.length];
    return `${emoji} ${tt.name} \u2014 ${formatPrice(tt.price)}`;
  }).join('\n');

  const hashtags = buildHashtags(event.title);

  return `\ud83d\uded7 ${event.title.toUpperCase()} \ud83d\uded7

Ayr Pavilion | ${formatDate(event.date_time)}

\ud83c\udfab Tickets:
${ticketLines}

Multiple sessions available \u2014 grab yours before they sell out!

\ud83c\udfab Book now: tickets.ayrpavilion.com

${hashtags}`;
}

function generateInformative(event, ticketTypes) {
  const ticketLines = ticketTypes.map(tt => {
    return `\u2022 ${tt.name} \u2014 ${formatPrice(tt.price)}`;
  }).join('\n');

  let doorsLine = '';
  if (event.doors_open) {
    doorsLine = `\n\ud83d\udeaa Doors: ${formatTime(event.doors_open)}`;
  }

  const hashtags = '#AyrPavilion #Ayr';

  return `\ud83d\udcc5 ${event.title}

\ud83d\udccd Ayr Pavilion
\ud83d\udd50 ${formatDateTime(event.date_time)}${doorsLine}

Tickets:
${ticketLines}

Book online: tickets.ayrpavilion.com

${hashtags}`;
}

function generateLastChance(event) {
  return `\u26a1 LIMITED TICKETS REMAINING \u26a1

${event.title} at Ayr Pavilion
${formatDate(event.date_time)}

Don't miss out \ud83d\udc49 tickets.ayrpavilion.com`;
}

// POST /api/events/:id/social-post - generate social media content
router.post('/events/:id/social-post', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const ticketTypes = db.prepare(
      'SELECT * FROM ticket_types WHERE event_id = ? ORDER BY sort_order ASC, price ASC'
    ).all(event.id);

    const { template, customText } = req.body;

    if (!template || !['hype', 'informative', 'last-chance'].includes(template)) {
      return res.status(400).json({ error: 'Invalid template. Use: hype, informative, last-chance' });
    }

    let content;
    switch (template) {
      case 'hype':
        content = generateHype(event, ticketTypes);
        break;
      case 'informative':
        content = generateInformative(event, ticketTypes);
        break;
      case 'last-chance':
        content = generateLastChance(event);
        break;
    }

    if (customText) {
      content += `\n\n${customText}`;
    }

    // Save to social_posts for each platform
    const platforms = ['facebook', 'instagram', 'twitter'];
    const insertStmt = db.prepare(
      'INSERT INTO social_posts (event_id, platform, template, content) VALUES (?, ?, ?, ?)'
    );

    const posts = {};
    for (const platform of platforms) {
      let platformContent = content;

      // Twitter/X: trim to 280 chars if needed
      if (platform === 'twitter' && platformContent.length > 280) {
        platformContent = platformContent.substring(0, 277) + '...';
      }

      insertStmt.run(event.id, platform, template, platformContent);
      posts[platform] = platformContent;
    }

    res.json({
      event_id: event.id,
      template,
      posts,
      hashtags: buildHashtags(event.title),
    });
  } catch (err) {
    console.error('Error generating social post:', err);
    res.status(500).json({ error: 'Failed to generate social post' });
  }
});

module.exports = router;
