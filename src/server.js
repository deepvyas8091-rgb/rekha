// Rekha API + web app. Run: npm start  (PORT defaults to 3000)
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  panchang, goodBadTimes, monthCalendar, birthProfile, gunMilan, thaiColourOfDay, ACTIVITIES,
} from './engine/index.js';
import { palmGeometry, interpretGeometry, interpretLines } from './readings/palm.js';
import { faceGeometry, interpretFace } from './readings/face.js';
import { extractPalmLines, narrate, ask, distressCheck, demoMode, LANGUAGES } from './ai/reader.js';
import { CITIES } from './data/cities.js';
import { PLANS, planOf, planKey, monthKey, publicPlans } from './plans.js';
import * as store from './db.js';
import { sessionMiddleware, requireUser, authRoutes } from './auth.js';
import { billingRoutes, billingJsonRoutes, billingConfigured } from './billing.js';
import { devLoginEnabled, isTest } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
billingRoutes(app); // raw-body webhook must come before express.json()
app.use(express.json({ limit: '2mb' }));
app.use(sessionMiddleware);
authRoutes(app);
billingJsonRoutes(app);
// Palm photos stay in memory only and are never written to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

// ---- helpers -------------------------------------------------------------
const today = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function place(q) {
  const lat = +q.lat, lon = +q.lon, tz = q.tz;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !tz) throw httpError(400, 'lat, lon and tz are required');
  return { lat, lon, tz };
}
function checkBirth(b) {
  if (!b || !b.date || !b.tz || !Number.isFinite(+b.lat) || !Number.isFinite(+b.lon)) throw httpError(400, 'Birth details need date, time and place');
  return { date: b.date, time: b.time || '12:00', lat: +b.lat, lon: +b.lon, tz: b.tz, city: b.city || '' };
}

// Per-IP limiter for expensive routes. Production at scale: Redis-backed.
const hits = new Map();
function limit(maxPerHour) {
  return (req, _res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < 3600000);
    if (arr.length >= maxPerHour) return next(httpError(429, 'Too many requests, try again later'));
    arr.push(now); hits.set(key, arr); next();
  };
}

// ---- plans, quotas and profile access ------------------------------------
function quotaLimit(user, kind) {
  const plan = planOf(user);
  return plan.limits[kind] * (plan === PLANS.free ? 1 : plan.profiles);
}
/** Throws 402 if the monthly allowance is used up; returns a function that records the use. */
function checkQuota(user, kind) {
  const max = quotaLimit(user, kind);
  const used = store.usageFor(user.id, monthKey())[kind] || 0;
  if (used >= max) {
    const free = planOf(user) === PLANS.free;
    throw httpError(402, free ? 'This is a premium feature. Upgrade to continue.' : 'You have used this month\'s allowance. It resets on the 1st.', free ? 'upgrade' : 'limit');
  }
  return () => store.addUsage(user.id, monthKey(), kind);
}
/** A profile is usable if it is within the plan's profile count (oldest first). */
function usableProfile(user, id) {
  const all = store.listProfiles(user.id);
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) throw httpError(404, 'Profile not found');
  if (idx >= planOf(user).profiles) throw httpError(402, 'Your plan covers fewer profiles. Upgrade to use this one.', 'upgrade');
  return all[idx];
}
const requirePaid = (user) => {
  if (!planOf(user).personal) throw httpError(402, 'Personal times and guidance are part of the paid plans.', 'upgrade');
};

function natalOf(birth) {
  const v = birthProfile(birth).vedic;
  return { nakshatraIndex: v.birthNakshatraIndex, moonSign: v.moonSignIndex, nakshatra: v.birthNakshatra, rashi: v.moonSign, lagna: v.lagna.signName };
}

// ---- session + catalogue --------------------------------------------------
app.get('/api/meta', (_req, res) => res.json({
  demoMode, languages: LANGUAGES, activities: ACTIVITIES, cities: CITIES, plans: publicPlans(),
  googleClientId: process.env.GOOGLE_CLIENT_ID || null, devLogin: devLoginEnabled,
  billing: billingConfigured(),
}));

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user;
  const plan = planOf(u);
  const used = store.usageFor(u.id, monthKey());
  res.json({
    user: { id: u.id, name: u.name, email: u.email },
    plan: { key: planKey(u), name: plan.name, profiles: plan.profiles, status: u.plan_status, renewsAt: u.plan_renews_at, personal: plan.personal },
    allowance: Object.fromEntries(Object.keys(plan.limits).map((k) => [k, { used: used[k] || 0, max: quotaLimit(u, k) }])),
    profiles: store.listProfiles(u.id).map((p, i) => ({ id: p.id, name: p.name, relation: p.relation, birth: p.birth, natal: p.natal, hasPalm: !!p.palm, hasFace: !!p.face, hasReading: !!p.reading, locked: i >= plan.profiles })),
  });
});

// Right to erasure (India DPDP Act): deletes the account and every profile.
app.delete('/api/me', requireUser, wrap(async (req, res) => {
  if (req.user.subscription_id && planOf(req.user) !== PLANS.free) throw httpError(400, 'Cancel your subscription first, then delete the account.');
  store.deleteUser(req.user.id);
  res.setHeader('Set-Cookie', 'rk_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
}));

// ---- profiles ---------------------------------------------------------------
app.post('/api/profiles', requireUser, wrap(async (req, res) => {
  const count = store.listProfiles(req.user.id).length;
  const plan = planOf(req.user);
  if (count >= plan.profiles) throw httpError(402, `${plan.name} covers ${plan.profiles} profile${plan.profiles > 1 ? 's' : ''}. Upgrade to add more.`, 'upgrade');
  const birth = checkBirth(req.body.birth);
  const name = String(req.body.name || 'Me').slice(0, 40);
  res.json(store.createProfile(req.user.id, { name, relation: req.body.relation || null, birth, natal: natalOf(birth) }));
}));
app.patch('/api/profiles/:id', requireUser, wrap(async (req, res) => {
  usableProfile(req.user, req.params.id);
  const fields = { name: req.body.name ? String(req.body.name).slice(0, 40) : undefined, relation: req.body.relation };
  if (req.body.birth) { fields.birth = checkBirth(req.body.birth); fields.natal = natalOf(fields.birth); fields.reading = null; }
  res.json(store.updateProfile(req.user.id, req.params.id, fields));
}));
app.delete('/api/profiles/:id', requireUser, wrap(async (req, res) => {
  store.deleteProfile(req.user.id, req.params.id);
  res.json({ ok: true });
}));
app.get('/api/profiles/:id/chart', requireUser, wrap(async (req, res) => {
  const p = usableProfile(req.user, req.params.id);
  res.json({ profile: { id: p.id, name: p.name }, ...birthProfile({ ...p.birth, name: p.name }) });
}));

// ---- good / bad time (free; personal layer is paid) -------------------------
function personalOpts(req) {
  if (!req.query.profile) return { opts: {}, locked: false };
  if (!req.user || !planOf(req.user).personal) return { opts: {}, locked: true };
  const p = usableProfile(req.user, req.query.profile);
  return { opts: { birthNakshatra: p.natal.nakshatraIndex, birthMoonSign: p.natal.moonSign }, locked: false };
}

app.get('/api/panchang', wrap(async (req, res) => {
  const p = place(req.query);
  const out = panchang(req.query.date || today(p.tz), p.lat, p.lon, p.tz);
  delete out._raw; delete out._karanaRaw;
  res.json(out);
}));

app.get('/api/timings', wrap(async (req, res) => {
  const p = place(req.query);
  const { opts, locked } = personalOpts(req);
  opts.activities = (req.query.activities || 'general').split(',').filter((a) => ACTIVITIES.includes(a));
  opts.now = req.query.now || new Date().toISOString();
  let date = req.query.date || today(p.tz);
  let out = goodBadTimes(date, p.lat, p.lon, p.tz, opts);
  // Before sunrise we are still in the previous Hindu day (its night choghadiya).
  if (!req.query.date && out.current && !out.current.choghadiya) {
    const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().slice(0, 10);
    out = goodBadTimes(date, p.lat, p.lon, p.tz, opts);
  }
  res.json({ ...out, personalLocked: locked, thaiColour: thaiColourOfDay(new Date(), p.tz) });
}));

app.get('/api/calendar', wrap(async (req, res) => {
  const p = place(req.query);
  const { opts, locked } = personalOpts(req);
  const birth = opts.birthNakshatra != null ? { nakshatraIndex: opts.birthNakshatra, moonSign: opts.birthMoonSign } : null;
  const month = req.query.month || today(p.tz).slice(0, 7);
  res.json({ ...monthCalendar(month, p.lat, p.lon, p.tz, req.query.activity || 'general', birth), personalLocked: locked });
}));

// ---- daily AI guidance (paid) -------------------------------------------------
app.get('/api/daily/:profileId', requireUser, limit(60), wrap(async (req, res) => {
  requirePaid(req.user);
  const prof = usableProfile(req.user, req.params.profileId);
  const p = place(req.query);
  const lang = LANGUAGES[req.query.language] ? req.query.language : 'en';
  const date = today(p.tz);
  const cached = store.getDaily(prof.id, date, lang);
  if (cached) return res.json({ date, text: cached, cached: true });
  const record = checkQuota(req.user, 'daily');
  const t = goodBadTimes(date, p.lat, p.lon, p.tz, { birthNakshatra: prof.natal.nakshatraIndex, birthMoonSign: prof.natal.moonSign, activities: ['general', 'business', 'travel'] });
  const facts = { name: prof.name, date, weekday: t.weekday, personal: t.personal, bestWindows: t.bestWindows, avoid: t.badTimes.filter((b) => b.severity === 'high'), panchak: t.panchak, natal: prof.natal };
  const text = await narrate({ kind: 'daily', facts, language: lang, name: prof.name });
  store.putDaily(prof.id, date, lang, text);
  record();
  res.json({ date, text });
}));

// ---- birth chart and matching -----------------------------------------------
app.post('/api/profile', wrap(async (req, res) => {
  res.json(birthProfile(checkBirth(req.body.birth)));
}));

app.post('/api/match', limit(30), wrap(async (req, res) => {
  const a = birthProfile(checkBirth(req.body.boy));
  const b = birthProfile(checkBirth(req.body.girl));
  const moon = (p) => p.vedic.planets.find((x) => x.planet === 'Moon').longitude;
  const result = gunMilan({ moonLongitude: moon(a) }, { moonLongitude: moon(b) });
  const manglik = { boy: a.vedic.manglik.status, girl: b.vedic.manglik.status };
  const chinese = { boy: a.chinese.zodiac.chinese, girl: b.chinese.zodiac.chinese };
  let reading = null, readingLocked = false;
  if (req.body.narrate) {
    if (!req.user || !planOf(req.user).personal) readingLocked = true;
    else {
      const record = checkQuota(req.user, 'match');
      reading = await narrate({ kind: 'match', facts: { gunMilan: result, manglik, chinese }, language: req.body.language });
      record();
    }
  }
  res.json({ gunMilan: result, manglik, chinese, reading, readingLocked });
}));

// ---- palm and face ------------------------------------------------------------
app.post('/api/palm', limit(20), upload.single('photo'), wrap(async (req, res) => {
  const landmarks = req.body.landmarks ? JSON.parse(req.body.landmarks) : null;
  const geometry = landmarks ? interpretGeometry(palmGeometry(landmarks)) : null;
  let lines = null;
  if (req.file) {
    if (!req.user) throw httpError(401, 'Please sign in to read your palm lines', 'signin');
    if (!/^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) throw httpError(400, 'Photo must be JPEG, PNG or WebP');
    const record = checkQuota(req.user, 'palm');
    const raw = await extractPalmLines(req.file.buffer.toString('base64'), req.file.mimetype);
    if (!raw.cached) record();
    lines = { raw, ...interpretLines(raw) };
  }
  if (!geometry && !lines) throw httpError(400, 'Send landmarks, a photo, or both');
  const palm = { handType: geometry?.handType, facts: [...(geometry?.facts || []), ...(lines?.facts || [])], marriageLines: lines?.raw?.marriageLines };
  if (req.user && req.body.profileId && lines && !lines.warning) {
    usableProfile(req.user, req.body.profileId);
    store.updateProfile(req.user.id, req.body.profileId, { palm });
  }
  res.json({ geometry, lines, palm, photoStored: false });
}));

app.post('/api/face', limit(20), wrap(async (req, res) => {
  if (!req.body.consent) throw httpError(400, 'Face reading needs explicit consent');
  const face = interpretFace(faceGeometry(req.body.landmarks));
  if (req.user && req.body.profileId) {
    usableProfile(req.user, req.body.profileId);
    store.updateProfile(req.user.id, req.body.profileId, { face: { faceType: face.faceType, facts: face.facts } });
  }
  res.json({ ...face, photoStored: false, photoUploaded: false });
}));

// ---- combined reading and chat (facts always come from the stored profile) -----
function factsFor(prof, location) {
  const p = birthProfile({ ...prof.birth, name: prof.name });
  const v = p.vedic;
  const facts = {
    chart: {
      lagna: v.lagna.signName, moonSign: v.moonSign, nakshatra: v.birthNakshatra, sunSignWestern: v.sunSignWestern,
      planets: v.planets.map((x) => `${x.planet} in ${x.signName} (house ${x.house})${x.retrograde ? ' R' : ''}`),
      currentDasha: v.dasha.current, sadeSati: v.sadeSati, manglik: v.manglik.status,
      chinese: { zodiac: p.chinese.zodiac, dayMaster: p.chinese.dayMaster, missing: p.chinese.missingElements },
      numerology: p.numerology,
    },
  };
  if (prof.palm) facts.palm = prof.palm;
  if (prof.face) facts.face = prof.face;
  if (location) {
    const loc = place(location);
    const t = goodBadTimes(today(loc.tz), loc.lat, loc.lon, loc.tz, { birthNakshatra: v.birthNakshatraIndex, birthMoonSign: v.moonSignIndex, activities: ['general'] });
    facts.today = { personal: t.personal, bestWindows: t.bestWindows.general, badTimes: t.badTimes.slice(0, 4) };
  }
  return facts;
}

app.post('/api/reading', requireUser, limit(15), wrap(async (req, res) => {
  const prof = usableProfile(req.user, req.body.profileId);
  const language = LANGUAGES[req.body.language] ? req.body.language : 'en';
  const record = checkQuota(req.user, 'reading');
  const facts = factsFor(prof, req.body.location);
  // Free plan gets a short teaser from the cheaper model; paid plans get the full reading.
  const kind = planOf(req.user).personal ? 'full' : 'teaser';
  const text = await narrate({ kind, facts, language, name: prof.name });
  record();
  const reading = { text, kind, language, at: Date.now() };
  store.updateProfile(req.user.id, prof.id, { reading });
  res.json({ ...reading, facts });
}));

app.get('/api/reading/:profileId', requireUser, wrap(async (req, res) => {
  const prof = usableProfile(req.user, req.params.profileId);
  res.json(prof.reading || null);
}));

app.post('/api/ask', requireUser, limit(40), wrap(async (req, res) => {
  const { question, history, language, profileId } = req.body;
  if (!question) throw httpError(400, 'Please type a question');
  const d = distressCheck(question);
  if (d) return res.json({ answer: d.message, support: true });
  const prof = usableProfile(req.user, profileId);
  const record = checkQuota(req.user, 'chat');
  const answer = await ask({ question: String(question).slice(0, 500), facts: factsFor(prof), history: Array.isArray(history) ? history.slice(-8) : [], language });
  record();
  res.json({ answer });
}));

// ---- owner dashboard -------------------------------------------------------------
app.get('/api/admin/stats', (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.get('x-admin-token') !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });
  const s = store.stats();
  const mrr = s.subscribers.reduce((sum, r) => sum + (PLANS[r.plan]?.priceInr || 0) * r.n, 0);
  res.json({ ...s, mrrInr: mrr, aiCostInrThisMonth: Math.round(s.aiThisMonth.usd * (+process.env.FX_INR || 88)) });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : err.message, code: err.code });
});

// Railway sets PORT automatically.
const port = process.env.PORT || 3000;
if (!isTest) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Rekha running on port ${port}`);
    console.log(`Database: ${store.dbLocation}`);
    const missing = ['ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_ID', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RZP_PLAN_SOLO', 'RZP_PLAN_COUPLE', 'RZP_PLAN_FAMILY', 'ADMIN_TOKEN']
      .filter((k) => !process.env[k]);
    if (missing.length) console.log(`Not set yet (features stay off until added): ${missing.join(', ')}`);
  });
  // Railway sends SIGTERM before each redeploy: finish requests, then close the database cleanly.
  process.on('SIGTERM', () => {
    server.close(() => { try { store.db.close(); } catch { /* already closed */ } process.exit(0); });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
export default app;
