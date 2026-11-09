// Email through Resend (https://resend.com). Set RESEND_API_KEY in Railway Variables and verify
// the sending domain (rekha.io) in Resend; EMAIL_FROM defaults to "Rekha <hello@rekha.io>".
//   Confirmation   double opt-in for the email list: nobody gets email until they click the link.
//   Festival eve   the day before major festivals, each subscriber gets the times for their city.
//   Campaigns      the owner writes an email in the dashboard and sends it to a language or country.
// Every email carries a personal unsubscribe link and one-click unsubscribe headers (RFC 8058),
// and is logged per recipient, so a restart never sends the same email twice.
import crypto from 'node:crypto';
import { db } from './db.js';
import { t, dataT, isLang, localePath } from './i18n/index.js';
import { FESTIVAL_BY_SLUG, nextFestivalDate, festivalIn } from './engine/festivals.js';
import { CITY, festAnswer } from './seo/routes.js';

export const emailConfigured = () => !!process.env.RESEND_API_KEY;
const FROM = () => process.env.EMAIL_FROM || 'Rekha <hello@rekha.io>';
const API = () => process.env.RESEND_API_BASE || 'https://api.resend.com';
const base = () => (process.env.PUBLIC_URL || 'https://rekha.io').replace(/\/$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- schema --------------------------------------------------------------------------------
const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
// Same table as in subscribers.js (whichever module loads first creates it).
db.exec(`CREATE TABLE IF NOT EXISTS email_subscribers (
  email TEXT PRIMARY KEY, lang TEXT NOT NULL DEFAULT 'en', city TEXT, country TEXT, source TEXT,
  consent_at INTEGER NOT NULL, unsub_token TEXT NOT NULL, unsubscribed_at INTEGER
)`);
if (!cols('email_subscribers').includes('confirmed_at')) {
  db.exec('ALTER TABLE email_subscribers ADD COLUMN confirmed_at INTEGER');
  db.exec('ALTER TABLE email_subscribers ADD COLUMN confirm_token TEXT');
  // People who signed up before email sending existed agreed on the page; treat them as confirmed.
  db.exec('UPDATE email_subscribers SET confirmed_at = consent_at WHERE confirmed_at IS NULL');
}
if (!cols('users').includes('unsub_token')) db.exec('ALTER TABLE users ADD COLUMN unsub_token TEXT');
db.exec(`CREATE TABLE IF NOT EXISTS email_log (key TEXT NOT NULL, email TEXT NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (key, email))`);
db.exec(`CREATE TABLE IF NOT EXISTS email_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, body TEXT NOT NULL, url TEXT, segment_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, finished_at INTEGER
)`);

// ---- sending ---------------------------------------------------------------------------------
/** Send up to 100 emails in one request. Each: { to, subject, html, text, unsub }. Returns per-email ok flags. */
export async function sendBatch(list, fetchImpl = fetch) {
  if (!emailConfigured() || !list.length) return list.map(() => false);
  const payload = list.map((m) => ({
    from: FROM(), to: [m.to], subject: m.subject, html: m.html, text: m.text,
    ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    headers: m.unsub ? { 'List-Unsubscribe': `<${m.unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
  }));
  const r = await fetchImpl(`${API()}/emails/batch`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) { console.error('Resend', r.status, (await r.text().catch(() => '')).slice(0, 300)); return list.map(() => false); }
  return list.map(() => true);
}
export const sendOne = async (m, fetchImpl) => (await sendBatch([m], fetchImpl))[0];

/** The email around a message: brand, content, a button, and the footer with the unsubscribe link. */
export function layout(lang, { heading, paragraphs, button, unsub, why }) {
  const dir = 'ltr';
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#fbf6ee;font-family:Arial,Helvetica,sans-serif;color:#24182f">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#2b1840"><img src="${base()}/icons/logo-96.png" width="32" height="32" alt="" style="vertical-align:middle;border:0;margin-right:8px">Rekha</p>
  <div style="background:#ffffff;border:1px solid #e8dccb;border-radius:12px;padding:24px">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${esc(heading)}</h1>
    ${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6">${esc(p)}</p>`).join('')}
    ${button ? `<p style="margin:20px 0 4px"><a href="${esc(button.url)}" style="display:inline-block;background:#c45c14;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></p>` : ''}
  </div>
  <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6a5f74">${esc(why)}${unsub ? ` <a href="${esc(unsub)}" style="color:#6a5f74">${esc(t(lang, 'Unsubscribe'))}</a>` : ''}</p>
</div></body></html>`;
  const text = [heading, '', ...paragraphs.flatMap((p) => [p, '']), button ? `${button.label}: ${button.url}` : '', '', why, unsub ? `${t(lang, 'Unsubscribe')}: ${unsub}` : ''].join('\n');
  return { html, text };
}

// ---- recipients ------------------------------------------------------------------------------
function userToken(id) {
  let tok = db.prepare('SELECT unsub_token FROM users WHERE id = ?').get(id)?.unsub_token;
  if (!tok) { tok = crypto.randomBytes(16).toString('hex'); db.prepare('UPDATE users SET unsub_token = ? WHERE id = ?').run(tok, id); }
  return tok;
}
/** Everyone who may get marketing email, de-duplicated by address: confirmed list members and opted-in accounts. */
export function emailAudience(seg = {}) {
  const ok = (r) => (!seg.langs?.length || seg.langs.includes(r.lang || 'en')) && (!seg.countries?.length || seg.countries.includes(r.country));
  const out = new Map();
  for (const r of db.prepare('SELECT email, lang, city, country, unsub_token FROM email_subscribers WHERE unsubscribed_at IS NULL AND confirmed_at IS NOT NULL').all()) {
    if (ok(r)) out.set(r.email, { email: r.email, lang: r.lang || 'en', city: r.city, unsub: `${base()}/unsubscribe?t=${r.unsub_token}&lang=${r.lang || 'en'}` });
  }
  for (const u of db.prepare("SELECT id, email, lang, country FROM users WHERE marketing_opt_in = 1 AND email IS NOT NULL AND email != ''").all()) {
    const email = u.email.toLowerCase();
    if (!out.has(email) && ok(u)) out.set(email, { email, lang: u.lang || 'en', city: null, unsub: `${base()}/unsubscribe?u=${userToken(u.id)}&lang=${u.lang || 'en'}` });
  }
  return [...out.values()];
}
const logged = (key, email) => !!db.prepare('SELECT 1 FROM email_log WHERE key = ? AND email = ?').get(key, email);
const log = (key, email, ok) => db.prepare('INSERT OR REPLACE INTO email_log (key, email, at, ok) VALUES (?, ?, ?, ?)').run(key, email, Date.now(), ok ? 1 : 0);
/** Send one message per recipient (built by `build`), 100 per request, skipping anyone already sent this key. */
async function sendToAll(key, recipients, build, fetchImpl) {
  const todo = recipients.filter((r) => !logged(key, r.email));
  let sent = 0; let failed = 0;
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const results = await sendBatch(chunk.map((r) => ({ to: r.email, unsub: r.unsub, ...build(r) })), fetchImpl);
    chunk.forEach((r, j) => { log(key, r.email, results[j]); results[j] ? sent++ : failed++; });
  }
  return { sent, failed };
}

// ---- confirmation (double opt-in) -----------------------------------------------------------------
export async function sendConfirmation(email, fetchImpl) {
  const row = db.prepare('SELECT * FROM email_subscribers WHERE email = ?').get(email);
  if (!row || row.confirmed_at || !emailConfigured()) return false;
  const token = row.confirm_token || crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE email_subscribers SET confirm_token = ? WHERE email = ?').run(token, email);
  const lang = row.lang || 'en';
  const { html, text } = layout(lang, {
    heading: t(lang, 'Confirm your Rekha subscription'),
    paragraphs: [t(lang, 'Tap the button to confirm that you want festival dates and muhurat times from Rekha.')],
    button: { label: t(lang, 'Confirm subscription'), url: `${base()}/confirm?t=${token}&lang=${lang}` },
    why: t(lang, 'If you did not ask for this, ignore this email and you will not hear from us.'),
  });
  return sendOne({ to: email, subject: t(lang, 'Confirm your Rekha subscription'), html, text }, fetchImpl);
}

// ---- festival eve ---------------------------------------------------------------------------------
export const EMAIL_FESTIVALS = ['navratri', 'karwa-chauth', 'dhanteras', 'diwali', 'chhath-puja', 'lohri', 'makar-sankranti', 'maha-shivaratri', 'holika-dahan', 'raksha-bandhan', 'janmashtami', 'ganesh-chaturthi'];
const CITY_BY_NAME = new Map(CITY.map((c) => [c.name.toLowerCase(), c]));
const todayIST = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
const hourIST = (now) => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now);
const addDay = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** The day before a festival (India date), from 09:00 IST: each subscriber gets the times for their city. */
export async function festivalEmailTick(now = new Date(), fetchImpl) {
  if (!emailConfigured() || hourIST(now) < 9) return null;
  const tomorrow = addDay(todayIST(now), 1);
  const slug = EMAIL_FESTIVALS.find((s) => nextFestivalDate(s, todayIST(now)) === tomorrow);
  if (!slug) return null;
  const f = FESTIVAL_BY_SLUG.get(slug);
  const cityCache = new Map();
  const timesFor = (c) => { if (!cityCache.has(c.slug)) cityCache.set(c.slug, festivalIn(slug, c, todayIST(now))); return cityCache.get(c.slug); };
  const delhi = CITY_BY_NAME.get('delhi');
  return sendToAll(`fest:${slug}:${tomorrow}`, emailAudience(), (r) => {
    const lang = isLang(r.lang) ? r.lang : 'en';
    const c = (r.city && CITY_BY_NAME.get(r.city.toLowerCase())) || null;
    const city = c || delhi; const x = timesFor(city);
    const festival = dataT(lang, f.name); const cityName = dataT(lang, city.name);
    const pagePath = f.city ? `/festivals/${slug}/${city.slug}` : `/festivals/${slug}`;
    const { html, text } = layout(lang, {
      heading: c ? t(lang, '{festival} is tomorrow: timings for {city}', { festival, city: cityName }) : t(lang, '{festival} is tomorrow', { festival }),
      paragraphs: [x ? festAnswer(lang, f, x, cityName) : '', c ? '' : t(lang, 'These times are for Delhi. Open the page for the times in your own city.')].filter(Boolean),
      button: { label: t(lang, 'See the full timings'), url: `${base()}${localePath(lang, pagePath)}` },
      why: t(lang, 'You get this email because you asked Rekha for festival reminders.'),
    });
    return { subject: c ? t(lang, '{festival} is tomorrow: timings for {city}', { festival, city: cityName }) : t(lang, '{festival} is tomorrow', { festival }), html, text };
  }, fetchImpl);
}

// ---- owner campaigns --------------------------------------------------------------------------------
export function queueCampaign({ subject, body, url, segment }) {
  const r = db.prepare('INSERT INTO email_campaigns (subject, body, url, segment_json, created_at) VALUES (?, ?, ?, ?, ?)').run(subject, body, url || null, JSON.stringify(segment || {}), Date.now());
  return Number(r.lastInsertRowid);
}
let running = false;
export async function emailCampaignTick(fetchImpl) {
  if (running || !emailConfigured()) return 0;
  running = true;
  try {
    for (const c of db.prepare("SELECT * FROM email_campaigns WHERE status IN ('queued','sending') ORDER BY id").all()) {
      db.prepare("UPDATE email_campaigns SET status = 'sending' WHERE id = ?").run(c.id);
      const paragraphs = c.body.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const res = await sendToAll(`campaign:${c.id}`, emailAudience(JSON.parse(c.segment_json)), (r) => ({
        subject: c.subject, ...layout(r.lang, {
          heading: c.subject, paragraphs,
          button: c.url ? { label: t(r.lang, 'Open Rekha'), url: `${base()}${localePath(r.lang, c.url)}` } : null,
          why: t(r.lang, 'You get this email because you asked Rekha for festival reminders.'),
        }),
      }), fetchImpl);
      db.prepare("UPDATE email_campaigns SET status = 'done', sent = sent + ?, failed = failed + ?, finished_at = ? WHERE id = ?").run(res.sent, res.failed, Date.now(), c.id);
    }
  } finally { running = false; }
  return 1;
}

// ---- routes -------------------------------------------------------------------------------------------
export function emailRoutes(app, isAdmin) {
  const page = (lang, title, msg) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Rekha</title></head>
    <body style="font-family:system-ui;max-width:560px;margin:15vh auto;padding:0 16px"><h1>${esc(title)}</h1><p>${esc(msg)}</p><p><a href="${localePath(lang, '/')}">Rekha</a></p></body></html>`;
  app.get('/confirm', (req, res) => {
    const lang = isLang(req.query.lang) ? req.query.lang : 'en';
    const n = db.prepare('UPDATE email_subscribers SET confirmed_at = ?, confirm_token = NULL WHERE confirm_token = ? AND confirmed_at IS NULL').run(Date.now(), String(req.query.t || '')).changes;
    res.type('html').send(n ? page(lang, t(lang, 'You are subscribed'), t(lang, 'Thank you. Festival dates and muhurat times will reach you before each major festival.'))
      : page(lang, t(lang, 'Already confirmed'), t(lang, 'This confirmation link has expired or was already used.')));
  });
  // One-click unsubscribe from mail apps (RFC 8058) for both the list and accounts.
  app.post('/unsubscribe', (req, res) => {
    db.prepare('UPDATE email_subscribers SET unsubscribed_at = ? WHERE unsub_token = ? AND unsubscribed_at IS NULL').run(Date.now(), String(req.query.t || ''));
    if (req.query.u) db.prepare('UPDATE users SET marketing_opt_in = 0 WHERE unsub_token = ?').run(String(req.query.u));
    res.json({ ok: true });
  });
  app.post('/api/admin/email-campaigns', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    if (!emailConfigured()) return res.status(400).json({ error: 'Set RESEND_API_KEY first' });
    const subject = String(req.body.subject || '').trim().slice(0, 120); const body = String(req.body.body || '').trim().slice(0, 5000);
    if (!subject || !body) return res.status(400).json({ error: 'Subject and message are needed' });
    const url = /^\/[\w\-/?=&.%]*$/.test(req.body.url || '') ? req.body.url : null;
    const list = (x, re) => String(x || '').split(',').map((v) => v.trim()).filter((v) => re.test(v));
    const segment = { langs: list(req.body.langs, /^[a-z]{2}$/), countries: list(String(req.body.countries || '').toUpperCase(), /^[A-Z]{2}$/) };
    if (req.body.test) {
      // A test to the owner's address only.
      const to = String(req.body.test).trim();
      return sendOne({ to, subject: `[Test] ${subject}`, ...layout('en', { heading: subject, paragraphs: body.split(/\n\s*\n/), button: url ? { label: 'Open Rekha', url: `${base()}${url}` } : null, why: 'Test email.' }) })
        .then((ok) => res.json({ ok }));
    }
    const id = queueCampaign({ subject, body, url, segment });
    emailCampaignTick().catch((e) => console.error('email campaign', e.message));
    res.json({ ok: true, id, audience: emailAudience(segment).length });
  });
  app.get('/api/admin/email', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    res.json({
      configured: emailConfigured(), from: FROM(),
      audience: emailAudience().length,
      pending: db.prepare('SELECT COUNT(*) n FROM email_subscribers WHERE confirmed_at IS NULL AND unsubscribed_at IS NULL').get().n,
      campaigns: db.prepare('SELECT id, subject, status, sent, failed, created_at, finished_at FROM email_campaigns ORDER BY id DESC LIMIT 20').all(),
      festivalSends: db.prepare("SELECT key, COUNT(*) n, SUM(ok) ok, MAX(at) at FROM email_log WHERE key LIKE 'fest:%' GROUP BY key ORDER BY at DESC LIMIT 10").all(),
    });
  });
}
