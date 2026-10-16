// Audience: who can be contacted, how they agreed, and owner tools to reach them.
//   Accounts      users who ticked "festival reminders and updates" (consent time stored).
//   Email list    visitors who left an email on a public page (no account needed).
//   Push          phones with alerts on; news = 1 when festival reminders and news are allowed.
// Owner dashboard: counts, CSV exports, push campaigns to a segment (now or scheduled).
// Every list keeps the consent time and source, and every person can leave in one tap.
import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { deliver } from './push.js';
import { isLang, t } from './i18n/index.js';
import { sendConfirmation, emailConfigured } from './email.js';

// ---- schema ----------------------------------------------------------------------------
for (const [col, type] of [['marketing_opt_in', 'INTEGER NOT NULL DEFAULT 0'], ['marketing_at', 'INTEGER'], ['country', 'TEXT'], ['lang', 'TEXT']]) {
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS email_subscribers (
  email TEXT PRIMARY KEY, lang TEXT NOT NULL DEFAULT 'en', city TEXT, country TEXT, source TEXT,
  consent_at INTEGER NOT NULL, unsub_token TEXT NOT NULL, unsubscribed_at INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS push_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, segment_json TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0, gone INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, finished_at INTEGER
)`);

const fail = (status, message) => Object.assign(new Error(message), { status });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

// ---- consent on accounts -----------------------------------------------------------------
export function setMarketing(userId, optIn, { lang, country } = {}) {
  db.prepare(`UPDATE users SET marketing_opt_in = ?, marketing_at = CASE WHEN ? = 1 THEN ? ELSE marketing_at END,
    lang = COALESCE(?, lang), country = COALESCE(?, country) WHERE id = ?`).run(optIn ? 1 : 0, optIn ? 1 : 0, Date.now(), lang || null, country || null, userId);
}

// ---- the email list ----------------------------------------------------------------------
export function addEmail({ email, lang = 'en', city = null, country = null, source = null }) {
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw fail(400, 'Enter a valid email address');
  const row = db.prepare('SELECT * FROM email_subscribers WHERE email = ?').get(email);
  if (row && !row.unsubscribed_at) return { email, already: true };
  db.prepare(`INSERT INTO email_subscribers (email, lang, city, country, source, consent_at, unsub_token) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET lang = excluded.lang, city = excluded.city, country = excluded.country, source = excluded.source,
    consent_at = excluded.consent_at, unsubscribed_at = NULL`)
    .run(email, isLang(lang) ? lang : 'en', city ? String(city).slice(0, 60) : null, country, source ? String(source).slice(0, 120) : null, Date.now(), row?.unsub_token || crypto.randomBytes(16).toString('hex'));
  return { email };
}
export const unsubscribeToken = (token) => db.prepare('UPDATE email_subscribers SET unsubscribed_at = ? WHERE unsub_token = ? AND unsubscribed_at IS NULL').run(Date.now(), String(token || '')).changes;

// ---- segments ----------------------------------------------------------------------------
/** Push subscriptions matching a segment: { langs:[], countries:[], audience: all|accounts|paid|free|guests }. Only those who allowed news. */
export function pushSegment(seg = {}) {
  const where = ['p.news = 1']; const args = [];
  if (seg.langs?.length) { where.push(`p.lang IN (${seg.langs.map(() => '?').join(',')})`); args.push(...seg.langs); }
  if (seg.countries?.length) { where.push(`p.country IN (${seg.countries.map(() => '?').join(',')})`); args.push(...seg.countries); }
  if (seg.audience === 'accounts') where.push('p.user_id IS NOT NULL');
  if (seg.audience === 'guests') where.push('p.user_id IS NULL');
  if (seg.audience === 'paid') where.push("u.plan != 'free' AND u.plan_status IN ('active','authenticated','cancelling','pending')");
  if (seg.audience === 'free') where.push("(u.id IS NULL OR u.plan = 'free' OR u.plan_status NOT IN ('active','authenticated','cancelling','pending'))");
  return db.prepare(`SELECT p.* FROM push_subs p LEFT JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')}`).all(...args);
}
function cleanSegment(s = {}) {
  const list = (x, re) => (Array.isArray(x) ? x : String(x || '').split(',')).map((v) => String(v).trim()).filter((v) => re.test(v)).slice(0, 50);
  return { langs: list(s.langs, /^[a-z]{2}$/), countries: list(s.countries, /^[A-Z]{2}$/).map((c) => c.toUpperCase()), audience: ['all', 'accounts', 'paid', 'free', 'guests'].includes(s.audience) ? s.audience : 'all' };
}

// ---- campaigns ---------------------------------------------------------------------------
let sending = false;
/** Send campaigns that are due (called every minute). 20 at a time, so a big list does not block the server. */
export async function campaignTick(now = Date.now(), sender) {
  if (sending) return 0;
  sending = true;
  let total = 0;
  try {
    for (const c of db.prepare("SELECT * FROM push_campaigns WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at").all(now)) {
      db.prepare("UPDATE push_campaigns SET status = 'sending' WHERE id = ?").run(c.id);
      const subs = pushSegment(JSON.parse(c.segment_json));
      const tally = { sent: 0, failed: 0, gone: 0 };
      for (let i = 0; i < subs.length; i += 20) {
        const results = await Promise.all(subs.slice(i, i + 20).map((s) => deliver(s, { title: c.title, body: c.body, url: c.url || '/', tag: `rekha-c${c.id}`, ttl: 86400 }, sender)));
        for (const r of results) tally[r]++;
        db.prepare('UPDATE push_campaigns SET sent = ?, failed = ?, gone = ? WHERE id = ?').run(tally.sent, tally.failed, tally.gone, c.id);
      }
      db.prepare("UPDATE push_campaigns SET status = 'done', finished_at = ? WHERE id = ?").run(Date.now(), c.id);
      total += tally.sent;
    }
  } finally { sending = false; }
  return total;
}

// ---- CSV ---------------------------------------------------------------------------------
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formulas
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows, cols) => `﻿${cols.join(',')}\n${rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')).join('\n')}\n`;
const iso = (ms) => (ms ? new Date(ms).toISOString() : '');

// ---- routes ------------------------------------------------------------------------------
export function subscriberRoutes(app, { isAdmin, limit, countryOf, baseOf }) {
  // Public pages: a plain form (works without JavaScript), then back to the page with a thank-you note.
  app.post('/subscribe', express.urlencoded({ extended: false, limit: '4kb' }), limit(10), (req, res) => {
    const back = /^\/[\w\-/]*$/.test(req.body.back || '') ? req.body.back : '/';
    if (req.body.website) return res.redirect(303, `${back}?subscribed=1#subscribe`); // bot trap: real people never fill this hidden field
    try {
      if (req.body.consent !== 'yes') throw fail(400, 'consent');
      const added = addEmail({ email: req.body.email, lang: req.body.lang, city: req.body.city, country: countryOf(req), source: back });
      // Double opt-in: the confirmation email goes out now; nothing else is sent until the link is clicked.
      sendConfirmation(added.email).catch((e) => console.error('confirm email', e.message));
      res.redirect(303, `${back}?subscribed=${emailConfigured() ? 'check' : '1'}#subscribe`);
    } catch { res.redirect(303, `${back}?subscribed=0#subscribe`); }
  });
  // The app (JSON).
  app.post('/api/subscribe', limit(10), (req, res, next) => {
    try {
      const added = addEmail({ email: req.body.email, lang: req.body.lang, city: req.body.city, country: countryOf(req, req.body.tz), source: 'app' });
      sendConfirmation(added.email).catch((e) => console.error('confirm email', e.message));
      res.json({ ok: true, confirm: emailConfigured(), ...added });
    } catch (e) { next(e); }
  });
  app.get('/unsubscribe', (req, res) => {
    let n = req.query.t ? unsubscribeToken(req.query.t) : 0;
    if (req.query.u) n += db.prepare('UPDATE users SET marketing_opt_in = 0 WHERE unsub_token = ? AND marketing_opt_in = 1').run(String(req.query.u)).changes;
    const lang = isLang(req.query.lang) ? req.query.lang : 'en';
    res.type('html').send(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Rekha</title></head>
      <body style="font-family:system-ui;max-width:560px;margin:15vh auto;padding:0 16px"><h1>${n ? t(lang, 'You are unsubscribed') : t(lang, 'Already unsubscribed')}</h1><p>${t(lang, 'You will not get any more emails from Rekha.')}</p><p><a href="/">Rekha</a></p></body></html>`);
  });
  // Signed-in users: festival reminders and updates on or off (also from the Account screen).
  app.post('/api/me/marketing', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue', code: 'signin' });
    setMarketing(req.user.id, !!req.body.optIn, { lang: isLang(req.body.lang) ? req.body.lang : null, country: countryOf(req, req.body.tz) });
    res.json({ ok: true, optIn: !!req.body.optIn });
  });

  // ---- owner ----
  const guard = (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: 'forbidden' }));
  app.get('/api/admin/audience', guard, (_req, res) => {
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const all = (sql, ...a) => db.prepare(sql).all(...a);
    res.json({
      accounts: one('SELECT COUNT(*) n FROM users').n,
      optedIn: one('SELECT COUNT(*) n FROM users WHERE marketing_opt_in = 1').n,
      withEmail: one("SELECT COUNT(*) n FROM users WHERE email IS NOT NULL AND email != ''").n,
      emailList: one('SELECT COUNT(*) n FROM email_subscribers WHERE unsubscribed_at IS NULL').n,
      emailUnsubscribed: one('SELECT COUNT(*) n FROM email_subscribers WHERE unsubscribed_at IS NOT NULL').n,
      push: one('SELECT COUNT(*) n, SUM(news) news, SUM(user_id IS NOT NULL) linked, SUM(fails > 2) failing FROM push_subs'),
      pushByLang: all('SELECT lang, COUNT(*) n FROM push_subs GROUP BY lang ORDER BY n DESC'),
      pushByCountry: all("SELECT COALESCE(country, '?') country, COUNT(*) n FROM push_subs GROUP BY country ORDER BY n DESC LIMIT 20"),
      emailBySource: all("SELECT COALESCE(source, '?') source, COUNT(*) n FROM email_subscribers WHERE unsubscribed_at IS NULL GROUP BY source ORDER BY n DESC LIMIT 20"),
      campaigns: all('SELECT id, title, body, url, segment_json, scheduled_at, status, sent, failed, gone, finished_at FROM push_campaigns ORDER BY id DESC LIMIT 30'),
    });
  });
  app.get('/api/admin/audience/count', guard, (req, res) => res.json({ n: pushSegment(cleanSegment(req.query)).length }));
  app.post('/api/admin/campaigns', guard, (req, res) => {
    const title = String(req.body.title || '').trim().slice(0, 80);
    const body = String(req.body.body || '').trim().slice(0, 200);
    if (!title || !body) return res.status(400).json({ error: 'Title and message are needed' });
    const url = /^\/[\w\-/?=&.%]*$/.test(req.body.url || '') ? req.body.url : '/';
    const at = req.body.at ? Date.parse(req.body.at) : Date.now();
    if (!Number.isFinite(at)) return res.status(400).json({ error: 'Invalid time' });
    const seg = cleanSegment(req.body.segment);
    const r = db.prepare('INSERT INTO push_campaigns (title, body, url, segment_json, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(title, body, url, JSON.stringify(seg), at, Date.now());
    res.json({ ok: true, id: Number(r.lastInsertRowid), audience: pushSegment(seg).length });
  });
  app.post('/api/admin/campaigns/:id/cancel', guard, (req, res) => {
    const n = db.prepare("UPDATE push_campaigns SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'").run(+req.params.id).changes;
    res.json({ ok: n === 1 });
  });
  // CSV exports, ready for a spreadsheet or an email tool (Brevo, Mailchimp, Resend ...).
  app.get('/api/admin/export/:list.csv', guard, (req, res, next) => {
    const base = baseOf(req);
    let body;
    if (req.params.list === 'accounts') {
      body = csv(db.prepare(`SELECT name, phone, email, lang, country, plan, plan_status, marketing_opt_in, marketing_at, created_at FROM users ORDER BY created_at`).all()
        .map((u) => ({ ...u, marketing_at: iso(u.marketing_at), created_at: iso(u.created_at) })), ['name', 'phone', 'email', 'lang', 'country', 'plan', 'plan_status', 'marketing_opt_in', 'marketing_at', 'created_at']);
    } else if (req.params.list === 'marketing') {
      // Only people who agreed to hear from Rekha: accounts that opted in, plus the email list.
      const accounts = db.prepare('SELECT name, phone, email, lang, country, marketing_at FROM users WHERE marketing_opt_in = 1').all()
        .map((u) => ({ ...u, source: 'account', consent_at: iso(u.marketing_at), unsubscribe: '' }));
      // Only addresses that clicked the confirmation link (double opt-in).
      const list = db.prepare('SELECT email, lang, city, country, source, consent_at, unsub_token FROM email_subscribers WHERE unsubscribed_at IS NULL AND confirmed_at IS NOT NULL').all()
        .map((e) => ({ ...e, name: '', phone: '', consent_at: iso(e.consent_at), unsubscribe: `${base}/unsubscribe?t=${e.unsub_token}&lang=${e.lang}` }));
      body = csv([...accounts, ...list], ['name', 'phone', 'email', 'lang', 'city', 'country', 'source', 'consent_at', 'unsubscribe']);
    } else return next();
    res.set({ 'Content-Disposition': `attachment; filename="rekha-${req.params.list}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' });
    res.type('text/csv; charset=utf-8').send(body);
  });
}
