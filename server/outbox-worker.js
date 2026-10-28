#!/usr/bin/env node
/**
 * outbox-worker.js — the safety net for Ayr Pavilion ticket email.
 *
 * WHY THIS EXISTS
 * Before this, nothing retried. The relay is fire-and-forget and the app did
 * markEmailFailed() and stopped. So a single transient SMTP hiccup meant a PAYING
 * customer never received their tickets — permanently — until a human happened to
 * notice. That is exactly what happened on 19-22 Jun 2026 (SMTP auth broke: "535
 * Incorrect authentication data"); every affected customer needed a manual resend,
 * and it was only found weeks later by chance.
 *
 * The failure mode we are killing is not "loud outage". It is "a customer quietly
 * turns up at the door with no ticket".
 *
 * WHAT IT DOES, every TICK_MS:
 *   1. Health-checks the relay (which lives on pu2, over an autossh reverse tunnel).
 *      Edge-triggered Telegram alert when it goes down / recovers — a dead relay means
 *      NOTHING is being delivered, which is the loudest thing we can possibly say.
 *   2. Picks up any email_logs row stuck 'failed' or 'queued' and re-sends it, with
 *      exponential backoff, tracked in email_logs.attempts.
 *   3. After MAX_ATTEMPTS it stops, marks the row 'abandoned', and alerts a human with
 *      the customer + order so they can phone them. Giving up silently is the one thing
 *      it must never do.
 *
 * SAFETY RAILS (each one is here because without it this worker would misfire badly):
 *   - GRACE_MS: a row is legitimately 'queued' for a moment mid-send (logEmail writes
 *     'queued', then markEmailSent flips it). Only touch rows older than the grace
 *     window, or we would race a healthy in-flight send and double-mail the customer.
 *   - MAX_AGE_DAYS + past-event skip: on 2026-07-14 the table held ~64 stale failed/
 *     queued rows going back to April, all long since superseded by manual resends. A
 *     naive worker would have cheerfully mailed tickets to ~30 people for gigs that had
 *     already happened. Never resend for an event in the past.
 *   - MAX_PER_TICK: a bounded blast radius. If something systemic breaks and 200 rows
 *     fail at once, we trickle rather than firehose the relay (and the customers).
 *   - Attempt counting lives in the DB, not memory, so a worker restart cannot reset
 *     the backoff and start hammering.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const db = require('./src/db');
db.initialize();
const { getDb } = require('./src/db');
const { resendEmail } = require('./src/services/email');

const TICK_MS       = Number(process.env.OUTBOX_TICK_MS       || 60_000);
const GRACE_MS      = Number(process.env.OUTBOX_GRACE_MS      || 5 * 60_000);
const MAX_ATTEMPTS  = Number(process.env.OUTBOX_MAX_ATTEMPTS  || 5);
const MAX_PER_TICK  = Number(process.env.OUTBOX_MAX_PER_TICK  || 10);
const MAX_AGE_DAYS  = Number(process.env.OUTBOX_MAX_AGE_DAYS  || 3);
const RELAY_URL     = process.env.MAIL_RELAY_URL;
const RELAY_KEY     = process.env.MAIL_RELAY_KEY;
const TG_TOKEN      = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT       = process.env.TELEGRAM_CHAT_ID   || '';

// Backoff per attempt number (minutes). Deliberately long at the tail: if it has
// failed 4 times the problem is systemic (relay/SMTP/DNS), and retrying every minute
// just burns sender reputation against a mail server that is already saying no.
const BACKOFF_MIN = [1, 5, 20, 60, 180];

if (!RELAY_URL) {
  console.error('outbox: MAIL_RELAY_URL not set — refusing to start (see server/.env)');
  process.exit(1);
}

// No hard-coded fallback for the relay key: it must come from the environment.
if (!RELAY_KEY) {
  throw new Error('outbox: MAIL_RELAY_KEY is not set — refusing to start. Set MAIL_RELAY_KEY in server/.env');
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function telegram(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown' })
    });
  } catch (e) { log('telegram failed (non-fatal):', e.message); }
}

let relayWasUp = true;   // edge-triggered: only alert on transitions
async function checkRelay() {
  let up = false;
  try {
    const ctl = AbortSignal.timeout(10_000);
    const r = await fetch(`${RELAY_URL}/accounts`, { headers: { 'x-api-key': RELAY_KEY }, signal: ctl });
    up = r.ok;                       // 401 => key wrong; also "not healthy" for our purposes
  } catch { up = false; }

  if (!up && relayWasUp) {
    await telegram('🔴 *Ayr Pavilion tickets*: MAIL RELAY IS DOWN — no ticket emails are ' +
                   'being delivered. Relay is the node app on pu2 (:3880 via autossh tunnel).');
    log('ALERT relay DOWN');
  } else if (up && !relayWasUp) {
    await telegram('🟢 *Ayr Pavilion tickets*: mail relay is back up.');
    log('relay recovered');
  }
  relayWasUp = up;
  return up;
}

function dueRows() {
  return getDb().prepare(`
    SELECT el.id, el.recipient, el.subject, el.attempts, el.last_attempt_at,
           o.order_ref, o.customer_name, e.title AS event_title, e.date_time
    FROM email_logs el
    LEFT JOIN orders o ON o.id = el.order_id
    LEFT JOIN events e ON e.id = o.event_id
    WHERE el.status IN ('failed','queued')
      AND COALESCE(el.attempts,0) < ?
      AND el.created_at > datetime('now', ?)
      AND el.created_at < datetime('now', ?)
      AND (e.date_time IS NULL OR e.date_time > datetime('now'))
    ORDER BY el.id ASC
    LIMIT ?
  `).all(MAX_ATTEMPTS, `-${MAX_AGE_DAYS} day`, `-${Math.floor(GRACE_MS / 1000)} second`, MAX_PER_TICK);
}

function backoffPassed(row) {
  if (!row.last_attempt_at) return true;
  const mins = BACKOFF_MIN[Math.min(row.attempts || 0, BACKOFF_MIN.length - 1)];
  return Date.now() - new Date(row.last_attempt_at + 'Z').getTime() >= mins * 60_000;
}

async function tick() {
  if (!(await checkRelay())) return;   // relay down: retrying now would just burn attempts

  const rows = dueRows();
  if (!rows.length) return;
  log(`outbox: ${rows.length} row(s) needing delivery`);

  for (const row of rows) {
    if (!backoffPassed(row)) continue;

    try {
      await resendEmail(row.id);       // increments attempts + resolves the row itself
      log(`outbox: RESENT id=${row.id} -> ${row.recipient} (${row.order_ref || 'no order'})`);
      await telegram(`✅ *Ayr Pavilion tickets*: recovered a failed ticket email — resent to ` +
                     `${row.recipient} (${row.order_ref || '?'}, ${row.event_title || '?'}).`);
    } catch (err) {
      const attempts = (row.attempts || 0) + 1;
      log(`outbox: retry FAILED id=${row.id} attempt=${attempts}: ${err.message}`);

      if (attempts >= MAX_ATTEMPTS) {
        // Out of road. Never fail silently — a human has to phone this customer.
        getDb().prepare(
          `UPDATE email_logs SET status='abandoned', error=? WHERE id=?`
        ).run(`gave up after ${attempts} attempts: ${err.message}`, row.id);

        await telegram(
          `🚨 *Ayr Pavilion tickets*: GIVING UP on a ticket email after ${attempts} attempts.\n\n` +
          `*Customer:* ${row.customer_name || '?'}\n*Email:* ${row.recipient}\n` +
          `*Order:* ${row.order_ref || '?'}\n*Event:* ${row.event_title || '?'}\n\n` +
          `They have PAID and have NO TICKETS. Contact them.\nLast error: ${err.message}`
        );
        log(`outbox: ABANDONED id=${row.id} — human escalation sent`);
      }
    }
  }
}

log(`outbox-worker up: tick=${TICK_MS}ms grace=${GRACE_MS}ms maxAttempts=${MAX_ATTEMPTS} ` +
    `maxAge=${MAX_AGE_DAYS}d relay=${RELAY_URL} telegram=${TG_TOKEN ? 'on' : 'OFF'}`);

tick().catch(e => log('tick error:', e.message));
setInterval(() => tick().catch(e => log('tick error:', e.message)), TICK_MS);
