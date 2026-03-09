const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// GET /api/track/open/:emailLogId — tracking pixel
router.get('/open/:emailLogId', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.emailLogId, 10);
    if (!isNaN(id)) {
      const log = db.prepare('SELECT id, opened_at FROM email_logs WHERE id = ?').get(id);
      if (log) {
        if (!log.opened_at) {
          db.prepare(`UPDATE email_logs SET opened_at = datetime('now'), opened_count = 1 WHERE id = ?`).run(id);
        } else {
          db.prepare(`UPDATE email_logs SET opened_count = opened_count + 1 WHERE id = ?`).run(id);
        }
      }
    }
  } catch (err) {
    // Don't fail the response for tracking errors
    console.error('Track open error:', err.message);
  }

  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(PIXEL);
});

// GET /api/track/click/:emailLogId?url=ENCODED_URL — click redirect
router.get('/click/:emailLogId', (req, res) => {
  const targetUrl = req.query.url;

  try {
    const db = getDb();
    const id = parseInt(req.params.emailLogId, 10);
    if (!isNaN(id)) {
      const log = db.prepare('SELECT id, clicked_at FROM email_logs WHERE id = ?').get(id);
      if (log) {
        if (!log.clicked_at) {
          db.prepare(`UPDATE email_logs SET clicked_at = datetime('now'), clicked_count = 1 WHERE id = ?`).run(id);
        } else {
          db.prepare(`UPDATE email_logs SET clicked_count = clicked_count + 1 WHERE id = ?`).run(id);
        }
      }
    }
  } catch (err) {
    console.error('Track click error:', err.message);
  }

  if (targetUrl) {
    res.redirect(302, targetUrl);
  } else {
    res.redirect(302, process.env.APP_URL || 'https://tickets.ayrpavilion.com');
  }
});

module.exports = router;
