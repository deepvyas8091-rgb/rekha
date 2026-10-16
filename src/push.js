// Daily timing alerts by web push: a morning summary and a "Rahu Kaal starts in 10 minutes"
// reminder, for the city the visitor chose. Works for installed web apps on Android and on
// iPhone (iOS 16.4 and later, once Rekha is added to the Home Screen). No account needed.
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set, otherwise created once and kept in the database.
import webpush from 'web-push';
import { db } from './db.js';
import { goodBadTimes } from './engine/index.js';
import { t, dataT, isLang } from './i18n/index.js';
import { festivalCalendar, festivalIn } from './engine/festivals.js';

db.exec(`CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY, sub_json TEXT NOT NULL,
  lat REAL NOT NULL, lon REAL NOT NULL, tz TEXT NOT NULL, place TEXT, lang TEXT NOT NULL DEFAULT 'en',
  morning TEXT, rahu INTEGER NOT NULL DEFAULT 1, sent_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
)`);
// Added later: the account (if signed in), country, consent to festival reminders and news, delivery health.
for (const [col, type] of [['user_id', 'TEXT'], ['country', 'TEXT'], ['news', 'INTEGER NOT NULL DEFAULT 1'], ['last_ok', 'INTEGER'], ['fails', 'INTEGER NOT NULL DEFAULT 0']]) {
  if (!db.prepare('PRAGMA table_info(push_subs)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE push_subs ADD COLUMN ${col} ${type}`);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs(user_id)');

let keys = null;
export function vapidKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get();
    if (row) keys = JSON.parse(row.value);
    else {
      keys = webpush.generateVAPIDKeys();
      db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(keys));
    }
  }
  const subject = process.env.VAPID_SUBJECT || (process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : 'https://rekha.io');
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return keys;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const fail = (status, message) => Object.assign(new Error(message), { status });

export function saveSubscription({ subscription, place, lang, morning, rahu, news, userId = null, country = null }) {
  const endpoint = subscription?.endpoint;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !subscription.keys?.p256dh || !subscription.keys?.auth) throw fail(400, 'Invalid subscription');
  const lat = +place?.lat, lon = +place?.lon, tz = String(place?.tz || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !tz) throw fail(400, 'lat, lon and tz are required');
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw fail(400, 'Unknown time zone'); }
  const m = morning && HHMM.test(morning) ? morning : null;
  db.prepare(`INSERT INTO push_subs (endpoint, sub_json, lat, lon, tz, place, lang, morning, rahu, news, user_id, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET sub_json = excluded.sub_json, lat = excluded.lat, lon = excluded.lon, tz = excluded.tz,
    place = excluded.place, lang = excluded.lang, morning = excluded.morning, rahu = excluded.rahu, news = excluded.news,
    user_id = COALESCE(excluded.user_id, push_subs.user_id), country = COALESCE(excluded.country, push_subs.country), fails = 0`)
    .run(endpoint, JSON.stringify({ endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } }), lat, lon, tz,
      String(place.name || '').slice(0, 60), isLang(lang) ? lang : 'en', m, rahu === false ? 0 : 1, news === false ? 0 : 1, userId, country, Date.now());
  return { endpoint, morning: m, rahu: rahu !== false, news: news !== false };
}
export const removeSubscription = (endpoint) => db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(String(endpoint || ''));
export const countSubscriptions = () => db.prepare('SELECT COUNT(*) n FROM push_subs').get().n;

// ---- what to send, and when ------------------------------------------------------
const local = (now, tz) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
};
const dayCache = new Map();
function timesFor(sub, date) {
  const key = `${sub.lat},${sub.lon},${sub.tz},${date}`;
  if (!dayCache.has(key)) {
    if (dayCache.size > 2000) dayCache.clear();
    dayCache.set(key, goodBadTimes(date, sub.lat, sub.lon, sub.tz, { activities: ['general'] }));
  }
  return dayCache.get(key);
}

/** The notifications due for one subscription at this moment (each at most once a day). */
export function dueFor(sub, now = new Date()) {
  const { date, hhmm } = local(now, sub.tz);
  const sent = JSON.parse(sub.sent_json || '{}');
  const tm = timesFor(sub, date);
  const rk = tm.badTimes.find((b) => b.name === 'Rahu Kaal');
  const lang = sub.lang || 'en';
  const city = sub.place || '';
  const out = [];
  const n = mins(hhmm);
  if (sub.morning && sent.morning !== date && n >= mins(sub.morning) && n < mins(sub.morning) + 30) {
    const best = tm.bestWindows.general?.[0];
    out.push({
      kind: 'morning', tag: 'rekha-morning',
      title: t(lang, 'Today in {city}', { city }),
      body: best ? t(lang, 'Rahu Kaal {start}–{end}. Best time {best}.', { start: rk.start, end: rk.end, best: `${best.start}–${best.end}` })
        : t(lang, 'Rahu Kaal {start}–{end}. No clean window today.', { start: rk.start, end: rk.end }),
    });
  }
  if (sub.rahu && rk && sent.rahu !== date) {
    const start = mins(rk.start);
    if (n >= start - 10 && n < start) {
      out.push({
        kind: 'rahu', tag: 'rekha-rahu',
        title: t(lang, 'Rahu Kaal starts at {time}', { time: rk.start }),
        body: t(lang, '{city}: until {end}. Avoid starting new work in this window.', { city, end: rk.end }),
      });
    }
  }
  // Festival morning: the day's festival with this city's muhurat or moonrise, for subscribers who
  // allowed festival reminders, at their morning time (or 07:30).
  if (sub.news) {
    const at = sub.morning || '07:30';
    const fest = festivalCalendar().find((f) => f.date === date || Math.abs(Date.parse(f.date) - Date.parse(date)) <= 86400000);
    if (fest && sent[`fest:${fest.slug}`] !== date && n >= mins(at) && n < mins(at) + 30) {
      const x = festivalForSub(fest.slug, sub, date);
      if (x?.date === date) out.push({ kind: `fest:${fest.slug}`, tag: `rekha-fest-${fest.slug}`, url: `/festivals/${fest.slug}`, ...festivalMessage(lang, fest, x, city) });
    }
  }
  return out.map((x) => ({ ...x, date }));
}

const festCache = new Map();
function festivalForSub(slug, sub, date) {
  const key = `${slug}:${sub.lat.toFixed(1)},${sub.lon.toFixed(1)},${sub.tz}:${date}`;
  if (!festCache.has(key)) { if (festCache.size > 2000) festCache.clear(); festCache.set(key, festivalIn(slug, sub)); }
  return festCache.get(key);
}
function festivalMessage(lang, f, x, city) {
  const festival = dataT(lang, f.name);
  const title = t(lang, '{festival} today in {city}', { festival, city });
  let body = t(lang, 'Tap for the full timings.');
  if (f.kind === 'lakshmi' && x.muhurat) body = `${t(lang, 'Puja muhurat {start} to {end}.', x.muhurat)} ${body}`;
  else if (f.kind === 'nishita' && x.muhurat) body = `${t(lang, 'Nishita puja {start} to {end}.', x.muhurat)} ${body}`;
  else if (f.kind === 'moonrise' && x.moonrise) body = `${t(lang, 'Moonrise {time}.', { time: x.moonrise })} ${body}`;
  else if (f.kind === 'chhath') body = `${t(lang, 'Evening arghya at {sunset}, morning arghya at {sunrise}.', { sunset: x.sandhyaArghya, sunrise: x.ushaArghya })} ${body}`;
  return { title, body };
}

const localUrl = (lang, path) => `${lang && lang !== 'en' ? `/${lang}` : ''}${path}`;
const send = (sub, msg, sender) => sender(JSON.parse(sub.sub_json), JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag, url: msg.absolute ? msg.url : localUrl(sub.lang, msg.url || '/?tab=today') }), { TTL: msg.ttl || 1800 });
/** Send one message to one subscription; records delivery health and removes it when the browser says it is gone. */
export async function deliver(sub, msg, sender = webpush.sendNotification) {
  vapidKeys();
  try {
    await send(sub, msg, sender);
    db.prepare('UPDATE push_subs SET last_ok = ?, fails = 0 WHERE endpoint = ?').run(Date.now(), sub.endpoint);
    return 'sent';
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { removeSubscription(sub.endpoint); return 'gone'; }
    db.prepare('UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?').run(sub.endpoint);
    return 'failed';
  }
}

/** Send everything due now. Returns the number sent. Gone subscriptions are removed. */
export async function pushTick(now = new Date(), sender = webpush.sendNotification) {
  vapidKeys();
  let count = 0;
  for (const sub of db.prepare('SELECT * FROM push_subs').all()) {
    let due;
    try { due = dueFor(sub, now); } catch { continue; }
    for (const msg of due) {
      try {
        await send(sub, msg, sender);
        count++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { removeSubscription(sub.endpoint); break; }
        continue; // try again next minute
      }
      const sent = JSON.parse(sub.sent_json || '{}');
      sent[msg.kind] = msg.date;
      sub.sent_json = JSON.stringify(sent);
      db.prepare('UPDATE push_subs SET sent_json = ? WHERE endpoint = ?').run(sub.sent_json, sub.endpoint);
    }
  }
  return count;
}

export function pushRoutes(app, limit) {
  app.get('/api/push/key', (_req, res) => res.json({ publicKey: vapidKeys().publicKey }));
  app.post('/api/push/subscribe', limit(30), async (req, res, next) => {
    try {
      vapidKeys();
      const saved = saveSubscription({ ...(req.body || {}), userId: req.user?.id || null, country: app.locals.countryOf ? app.locals.countryOf(req, req.body?.place?.tz) : null });
      const lang = isLang(req.body.lang) ? req.body.lang : 'en';
      // A confirmation straight away, so people know alerts work on this phone.
      if (req.body.confirm) {
        const sub = db.prepare('SELECT * FROM push_subs WHERE endpoint = ?').get(saved.endpoint);
        await send(sub, { title: t(lang, 'Alerts are on'), body: t(lang, 'Your daily timings for {city} will arrive here.', { city: sub.place || '' }), tag: 'rekha-test' }, app.locals.pushSender || webpush.sendNotification)
          .catch(() => {});
      }
      res.json({ ok: true, ...saved });
    } catch (e) { next(e); }
  });
  app.post('/api/push/unsubscribe', (req, res) => { removeSubscription(req.body?.endpoint); res.json({ ok: true }); });
}
