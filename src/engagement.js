// Engagement features:
//   Calendar feed    /cal/feed.ics: festivals with this city's muhurat, and (if chosen) daily Rahu Kaal,
//                    subscribed from Google or Apple Calendar so Rekha shows up there every day.
//   Muhurat finder   /api/muhurat: the best dates for an activity in the next 60 days, with the best
//                    window on each date (personalised to the chart on paid plans).
//   Partner invite   a link the user sends to a partner; the partner enters their own birth details
//                    and both see the 36-gun score. The partner's birth details are not stored.
//   Month ahead      on the 1st, paid users get "your month ahead" (AI, from their dasha, transits and
//                    best days), in the app and by email and push.
import crypto from 'node:crypto';
import { db } from './db.js';
import { goodBadTimes, monthCalendar, birthProfile, gunMilan, ACTIVITIES } from './engine/index.js';
import { zonedToUtc } from './engine/time.js';
import { FESTIVALS, festivalCalendar, festivalIn } from './engine/festivals.js';
import { t, dataT, isLang, localePath } from './i18n/index.js';
import { planOf } from './plans.js';

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
function placeOf(q) {
  const lat = +q.lat, lon = +q.lon, tz = String(q.tz || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !tz) throw fail(400, 'lat, lon and tz are required');
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw fail(400, 'Unknown time zone'); }
  return { lat: +lat.toFixed(3), lon: +lon.toFixed(3), tz, name: String(q.name || '').slice(0, 60) };
}

// ---- calendar feed (iCalendar) ------------------------------------------------------------
const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let i = 74; while (Buffer.byteLength(s.slice(0, i)) > 74) i--; out.push(s.slice(0, i)); s = ` ${s.slice(i)}`; } out.push(s); return out.join('\r\n'); };
const at = (date, hhmm, tz) => zonedToUtc(+date.slice(0, 4), +date.slice(5, 7), +date.slice(8, 10), +hhmm.slice(0, 2), +hhmm.slice(3, 5), tz);
function vevent({ uid, start, end, allDay, summary, description, url }) {
  return [
    'BEGIN:VEVENT', `UID:${uid}@rekha.io`, `DTSTAMP:${stamp(new Date())}`,
    allDay ? `DTSTART;VALUE=DATE:${start.replace(/-/g, '')}` : `DTSTART:${stamp(start)}`,
    allDay ? `DTEND;VALUE=DATE:${addDays(start, 1).replace(/-/g, '')}` : `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEsc(summary)}`, description ? `DESCRIPTION:${icsEsc(description)}` : '', url ? `URL:${url}` : '', 'TRANSP:TRANSPARENT', 'END:VEVENT',
  ].filter(Boolean).map(fold).join('\r\n');
}
/** The calendar for a place: next date of every festival (timed muhurat where it has one), and daily Rahu Kaal for 14 days if asked. */
export function calendarFeed({ place, lang: asked = 'en', rahu = false, base = 'https://rekha.io' }) {
  const lang = isLang(asked) ? asked : 'en';
  const events = [];
  for (const f of festivalCalendar()) {
    const x = festivalIn(f.slug, place); if (!x) continue;
    const name = dataT(lang, f.name);
    const url = `${base}${localePath(lang, `/festivals/${f.slug}`)}`;
    const timed = x.muhurat && f.kind !== 'chhath';
    events.push(vevent({
      uid: `fest-${f.slug}-${x.date}-${place.lat},${place.lon}`, allDay: !timed,
      start: timed ? at(x.date, x.muhurat.start, place.tz) : x.date,
      end: timed ? new Date(at(x.date, x.muhurat.start, place.tz).getTime() + x.muhurat.minutes * 60000) : null,
      summary: timed ? `${name}: ${t(lang, 'Puja muhurat')}` : name,
      description: `${timed ? `${x.muhurat.start}–${x.muhurat.end}. ` : ''}${f.kind === 'moonrise' && x.moonrise ? `${t(lang, 'Moonrise')} ${x.moonrise}. ` : ''}${url}`, url,
    }));
  }
  if (rahu) {
    const start = todayIn(place.tz);
    for (let i = 0; i < 14; i++) {
      const date = addDays(start, i);
      const rk = goodBadTimes(date, place.lat, place.lon, place.tz, {}).badTimes.find((b) => b.name === 'Rahu Kaal');
      if (!rk) continue;
      events.push(vevent({ uid: `rahu-${date}-${place.lat},${place.lon}`, start: at(date, rk.start, place.tz), end: at(date, rk.end, place.tz), summary: t(lang, 'Rahu Kaal'), description: t(lang, 'Avoid starting new work, travel or big purchases in this window.') }));
    }
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rekha//rekha.io//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsEsc(`Rekha${place.name ? `: ${place.name}` : ''}`)}`), 'X-PUBLISHED-TTL:PT12H', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    ...events, 'END:VCALENDAR', ''].join('\r\n');
}

// ---- muhurat finder ------------------------------------------------------------------------
/** The best dates for an activity over the next `days` days, best first, each with its best window. */
export function findMuhurat({ place, activity = 'general', days = 60, birth = null, limit = 10 }) {
  if (!ACTIVITIES.includes(activity)) throw fail(400, 'Unknown activity');
  const start = todayIn(place.tz); const end = addDays(start, Math.min(90, Math.max(7, days)));
  const months = []; for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = addDays(`${m}-01`, 32).slice(0, 7)) months.push(m);
  const all = months.flatMap((m) => monthCalendar(m, place.lat, place.lon, place.tz, activity, birth).days).filter((d) => d.date >= start && d.date <= end);
  const good = all.filter((d) => d.rating === 'excellent' || d.rating === 'good').sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, limit);
  return {
    activity, from: start, to: end, checked: all.length,
    dates: good.map((d) => {
      const w = goodBadTimes(d.date, place.lat, place.lon, place.tz, { activities: [activity] }).bestWindows[activity]?.[0] || null;
      return { date: d.date, weekday: d.weekday, rating: d.rating, score: d.score, tithi: d.tithi, nakshatra: d.nakshatra, reasons: d.reasons, window: w ? { start: w.start, end: w.end, choghadiya: w.choghadiya } : null, personal: !!d.personal };
    }),
  };
}

// ---- partner match invites ---------------------------------------------------------------------
db.exec(`CREATE TABLE IF NOT EXISTS match_invites (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, profile_id TEXT NOT NULL, inviter_name TEXT, created_at INTEGER NOT NULL,
  partner_name TEXT, result_json TEXT, completed_at INTEGER
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_invites_user ON match_invites(user_id)');

// ---- month ahead -----------------------------------------------------------------------------------
db.exec(`CREATE TABLE IF NOT EXISTS month_ahead (profile_id TEXT NOT NULL, month TEXT NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (profile_id, month, lang))`);
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'monthly_email')) db.exec('ALTER TABLE users ADD COLUMN monthly_email INTEGER NOT NULL DEFAULT 1');

/** Facts for a month-ahead reading: current dasha, Sade Sati, slow planets now, the best days, festivals. */
export function monthFacts(prof, month, place) {
  const p = birthProfile({ ...prof.birth, name: prof.name });
  const v = p.vedic;
  const birth = { nakshatraIndex: prof.natal.nakshatraIndex, moonSign: prof.natal.moonSign };
  const cal = monthCalendar(month, place.lat, place.lon, place.tz, 'general', birth);
  return {
    name: prof.name, month, moonSign: v.moonSign, lagna: v.lagna.signName, nakshatra: v.birthNakshatra,
    currentDasha: v.dasha.current, sadeSati: v.sadeSati,
    bestDays: cal.days.filter((d) => d.rating === 'excellent').slice(0, 6).map((d) => ({ date: d.date, nakshatra: d.nakshatra })),
    daysToGoSlow: cal.days.filter((d) => d.rating === 'avoid').slice(0, 5).map((d) => d.date),
    festivals: festivalCalendar().filter((f) => f.date.startsWith(month)).map((f) => `${f.name} (${f.date})`),
  };
}

export function engagementRoutes(app, { requireUser, usableProfile, limit, narrate, LANGUAGES, sendEmail, pushToUser, baseOf }) {
  // Calendar: the feed itself (subscribed by URL, so no account is needed) and one festival as a single event.
  app.get('/cal/feed.ics', limit(120), (req, res, next) => {
    try {
      const place = placeOf(req.query);
      res.set({ 'Cache-Control': 'public, max-age=21600', 'Content-Disposition': 'inline; filename="rekha.ics"' }).type('text/calendar; charset=utf-8')
        .send(calendarFeed({ place, lang: req.query.lang, rahu: req.query.rahu === '1', base: baseOf(req) }));
    } catch (e) { next(e); }
  });
  app.get('/cal/festival/:slug.ics', (req, res, next) => {
    try {
      const place = placeOf(req.query);
      const f = FESTIVALS.find((x) => x.slug === req.params.slug); if (!f) return next();
      const x = festivalIn(f.slug, place); if (!x) return next();
      const lang = isLang(req.query.lang) ? req.query.lang : 'en';
      const timed = x.muhurat && f.kind !== 'chhath';
      const url = `${baseOf(req)}${localePath(lang, `/festivals/${f.slug}`)}`;
      const ev = vevent({ uid: `one-${f.slug}-${x.date}-${place.lat},${place.lon}`, allDay: !timed, start: timed ? at(x.date, x.muhurat.start, place.tz) : x.date,
        end: timed ? new Date(at(x.date, x.muhurat.start, place.tz).getTime() + x.muhurat.minutes * 60000) : null,
        summary: `${dataT(lang, f.name)}${timed ? `: ${t(lang, 'Puja muhurat')}` : ''}`, description: url, url });
      res.set('Content-Disposition', `attachment; filename="${f.slug}.ics"`).type('text/calendar; charset=utf-8')
        .send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rekha//rekha.io//EN', ev, 'END:VCALENDAR', ''].join('\r\n'));
    } catch (e) { next(e); }
  });

  // Muhurat finder: free for everyone; personalised to the chart on paid plans.
  app.get('/api/muhurat', limit(120), (req, res, next) => {
    try {
      const place = placeOf(req.query);
      let birth = null; let personalLocked = false;
      if (req.query.profile) {
        if (req.user && planOf(req.user).personal) { const pr = usableProfile(req.user, req.query.profile); birth = { nakshatraIndex: pr.natal.nakshatraIndex, moonSign: pr.natal.moonSign }; } else personalLocked = true;
      }
      res.set('Cache-Control', birth ? 'private, no-store' : 'public, max-age=3600');
      res.json({ ...findMuhurat({ place, activity: String(req.query.activity || 'general'), days: +req.query.days || 60, birth }), personalLocked });
    } catch (e) { next(e); }
  });

  // Partner invites.
  app.post('/api/match-invites', requireUser, limit(30), (req, res, next) => {
    try {
      const prof = usableProfile(req.user, req.body.profileId);
      const token = crypto.randomBytes(9).toString('base64url');
      db.prepare('INSERT INTO match_invites (token, user_id, profile_id, inviter_name, created_at) VALUES (?, ?, ?, ?, ?)').run(token, req.user.id, prof.id, prof.name, Date.now());
      res.json({ token, url: `${baseOf(req)}${localePath(isLang(req.body.lang) ? req.body.lang : 'en', '/')}?invite=${token}` });
    } catch (e) { next(e); }
  });
  app.get('/api/match-invites', requireUser, (req, res) => {
    res.json(db.prepare('SELECT token, inviter_name, partner_name, result_json, created_at, completed_at FROM match_invites WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id)
      .map((r) => ({ ...r, result: r.result_json ? JSON.parse(r.result_json) : null, result_json: undefined })));
  });
  app.get('/api/match-invites/:token', (req, res) => {
    const inv = db.prepare('SELECT inviter_name, completed_at FROM match_invites WHERE token = ?').get(String(req.params.token));
    if (!inv) return res.status(404).json({ error: 'This invite link is not valid.' });
    res.json({ inviterName: inv.inviter_name, completed: !!inv.completed_at });
  });
  app.post('/api/match-invites/:token', limit(20), (req, res, next) => {
    try {
      const inv = db.prepare('SELECT * FROM match_invites WHERE token = ?').get(String(req.params.token));
      if (!inv) throw fail(404, 'This invite link is not valid.');
      const prof = db.prepare('SELECT birth_json FROM profiles WHERE id = ? AND user_id = ?').get(inv.profile_id, inv.user_id);
      if (!prof) throw fail(404, 'This invite link is not valid.');
      const b = req.body.birth || {};
      if (!b.date || !Number.isFinite(+b.lat) || !Number.isFinite(+b.lon) || !b.tz) throw fail(400, 'Birth details need date, time and place');
      const partner = birthProfile({ date: b.date, time: b.time || '12:00', lat: +b.lat, lon: +b.lon, tz: b.tz });
      const inviter = birthProfile(JSON.parse(prof.birth_json));
      const moon = (p) => p.vedic.planets.find((x) => x.planet === 'Moon').longitude;
      const g = gunMilan({ moonLongitude: moon(inviter) }, { moonLongitude: moon(partner) });
      const result = { total: g.total, verdict: g.verdict, kootas: g.kootas, doshas: g.doshas, manglik: { inviter: inviter.vedic.manglik.status, partner: partner.vedic.manglik.status } };
      // Only the result and the name the partner typed are kept; not their birth details.
      db.prepare('UPDATE match_invites SET partner_name = ?, result_json = ?, completed_at = ? WHERE token = ?').run(String(req.body.name || '').slice(0, 40) || null, JSON.stringify(result), Date.now(), inv.token);
      const lang = 'en';
      pushToUser?.(inv.user_id, { title: t(lang, 'Your match result is ready'), body: `${req.body.name || ''} ${g.total}/36`.trim(), url: '/?tab=match' });
      res.json({ inviterName: inv.inviter_name, ...result });
    } catch (e) { next(e); }
  });

  // Month ahead: in the app on demand (generated once per profile, month and language).
  app.get('/api/month-ahead/:profileId', requireUser, limit(30), async (req, res, next) => {
    try {
      if (!planOf(req.user).personal) throw fail(402, 'Your month ahead is part of Premium.', 'upgrade');
      const prof = usableProfile(req.user, req.params.profileId);
      const lang = LANGUAGES[req.query.language] ? req.query.language : 'en';
      res.json(await monthAhead(prof, lang, placeOf(req.query), narrate));
    } catch (e) { next(e); }
  });
  app.post('/api/me/monthly-email', requireUser, (req, res) => {
    db.prepare('UPDATE users SET monthly_email = ? WHERE id = ?').run(req.body.on ? 1 : 0, req.user.id);
    res.json({ ok: true });
  });
  app.locals.sendMonthAhead = sendEmail;
}

/** Generate (or reuse) the month-ahead text for a profile. */
export async function monthAhead(prof, lang, place, narrate, month = new Date().toISOString().slice(0, 7)) {
  const hit = db.prepare('SELECT text, at FROM month_ahead WHERE profile_id = ? AND month = ? AND lang = ?').get(prof.id, month, lang);
  if (hit) return { month, text: hit.text, at: hit.at, cached: true };
  const facts = monthFacts(prof, month, place);
  const text = await narrate({ kind: 'month', facts, language: lang, name: prof.name, paid: true });
  db.prepare('INSERT OR REPLACE INTO month_ahead (profile_id, month, lang, text, at) VALUES (?, ?, ?, ?, ?)').run(prof.id, month, lang, text, Date.now());
  return { month, text, at: Date.now(), facts };
}
