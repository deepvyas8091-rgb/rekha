// Rekha API + web app. Run: npm start  (PORT defaults to 3000)
import express from 'express';
import compression from 'compression';
import crypto from 'node:crypto';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  panchang, goodBadTimes, monthCalendar, birthProfile, gunMilan, thaiColourOfDay, ACTIVITIES,
} from './engine/index.js';
import { palmGeometry, interpretGeometry, interpretLines } from './readings/palm.js';
import { faceGeometry, interpretFace } from './readings/face.js';
import { extractPalmLines, narrate, ask, distressCheck, demoMode, LANGUAGES } from './ai/reader.js';
import { CITIES } from './data/cities.js';
import { dailyHoroscope, horoscopeText } from './engine/horoscope.js';
import { PLANS, planOf, planKey, monthKey, publicPlans } from './plans.js';
import * as store from './db.js';
import { sessionMiddleware, requireUser, authRoutes, hashPassword } from './auth.js';
import { billingRoutes, billingJsonRoutes, billingConfigured } from './billing.js';
import { priceFor, visitorCountry } from './pricing.js';
import { searchPlaces } from './data/places.js';
import { devLoginEnabled, isTest, clientIp } from './env.js';
import { seoRoutes, ARTICLES, clearPageCache } from './seo/routes.js';
import { t as tr, isLang, LANG_CODES, localePath, languageNames, packFor, readyLangs, coverage, invalidate } from './i18n/index.js';
import { renderShell } from './i18n/shell.js';
import { runTranslations, status as translateStatus, exportLang, importLang } from './i18n/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());

// One address for everything: when PUBLIC_URL is set (https://rekha.io), visits to any other
// host (the railway.app address, www.) are sent there with a permanent redirect. The API is
// left alone so Railway's health check and Razorpay's webhook keep working on any host.
const canonicalHost = (() => { try { return process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : null; } catch { return null; } })();
app.use((req, res, next) => {
  if (!canonicalHost || req.path.startsWith('/api/') || process.env.CANONICAL_REDIRECT === '0') return next();
  if (req.get('host') !== canonicalHost && (req.method === 'GET' || req.method === 'HEAD')) {
    return res.redirect(301, `${process.env.PUBLIC_URL.replace(/\/$/, '')}${req.originalUrl}`);
  }
  next();
});

// Language prefix: /hi/insights is served by the /insights handler with req.lang = 'hi'.
// English lives at the root; /en/... redirects there so each page has one address.
app.use((req, res, next) => {
  const m = req.path.match(/^\/([a-z]{2})(?=\/|$)/);
  req.lang = 'en';
  if (!m || !isLang(m[1])) return next();
  if (m[1] === 'en') return res.redirect(301, req.originalUrl.slice(3) || '/');
  req.lang = m[1];
  req.url = req.url.slice(3) || '/';
  if (!req.url.startsWith('/')) req.url = `/${req.url}`;
  next();
});
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
    const key = `${clientIp(req)}:${req.path}`;
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
app.get('/api/meta', wrap(async (_req, res) => res.json({
  demoMode, languages: LANGUAGES, languageNames: languageNames(), readyLangs: readyLangs(), activities: ACTIVITIES, cities: CITIES,
  plans: publicPlans(),
  googleClientId: process.env.GOOGLE_CLIENT_ID || null, devLogin: devLoginEnabled,
  billing: billingConfigured(),
})));

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user;
  const plan = planOf(u);
  const used = store.usageFor(u.id, monthKey());
  res.json({
    user: { id: u.id, name: u.name, email: u.email, phone: u.phone, hasPassword: !!u.password_hash, hasGoogle: !!u.google_sub },
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

// City search, any country (location, birth place, matching).
app.get('/api/places', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(searchPlaces(String(req.query.q || '').slice(0, 60)));
});

// Prices for the visitor's country (Stripe). Razorpay charges in rupees only.
app.get('/api/pricing', (req, res) => {
  const country = billingConfigured() === 'razorpay' ? 'IN' : visitorCountry(req, req.query.tz);
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({ country, plans: Object.fromEntries(['solo', 'couple', 'family'].map((k) => [k, priceFor(k, country)])) });
});

// Translations for the browser: interface, explanations and engine names (keyed by English).
app.get('/api/i18n/:lang', (req, res) => {
  if (!isLang(req.params.lang)) return res.status(404).json({ error: 'Unknown language' });
  const pack = packFor(req.params.lang);
  res.set('Cache-Control', req.query.v === pack.version ? 'public, max-age=86400' : 'public, max-age=300');
  res.json(pack);
});

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
  const text = await narrate({ kind: 'daily', facts, language: lang, name: prof.name, paid: true });
  store.putDaily(prof.id, date, lang, text);
  record();
  res.json({ date, text });
}));

// ---- free daily rashi horoscope ------------------------------------------------
// One text per sign per day per language, shared by every visitor (12 AI calls a day
// per language at most). Falls back to the rules-based text if AI is off or paused.
const inflight = new Map();
export async function horoscopeFor(sign, lang = 'en', date = today('Asia/Kolkata')) {
  const h = dailyHoroscope(date, sign);
  const cached = store.getHoroscope(date, sign, lang);
  if (cached) return { ...h, text: cached };
  const key = `${date}:${sign}:${lang}`;
  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      try {
        const facts = { sign: `${h.sign.sa} (${h.sign.en})`, moonToday: h.moonTransit, scores: h.scores, lucky: h.lucky, highlights: h.highlights, sadeSati: h.sadeSati, retrogrades: h.retrogrades };
        const text = demoMode ? horoscopeText(h) : await narrate({ kind: 'horoscope', facts, language: lang });
        if (!demoMode) store.putHoroscope(date, sign, lang, text);
        return text;
      } catch { return horoscopeText(h); } finally { setTimeout(() => inflight.delete(key), 1000); }
    })());
  }
  return { ...h, text: await inflight.get(key) };
}
app.get('/api/horoscope', wrap(async (req, res) => {
  const sign = Number(req.query.sign);
  if (!Number.isInteger(sign) || sign < 0 || sign > 11) throw httpError(400, 'sign must be 0 to 11');
  const lang = LANGUAGES[req.query.lang] ? req.query.lang : 'en';
  res.json(await horoscopeFor(sign, lang));
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
      reading = await narrate({ kind: 'match', facts: { gunMilan: result, manglik, chinese }, language: req.body.language, paid: true });
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
    const raw = await extractPalmLines(req.file.buffer.toString('base64'), req.file.mimetype, { paid: planOf(req.user).personal });
    if (!raw.cached) record();
    lines = { raw, ...interpretLines(raw) };
  }
  if (!geometry && !lines) throw httpError(400, 'Send landmarks, a photo, or both');
  const palm = { handType: geometry?.handType, facts: [...(geometry?.facts || []), ...(lines?.facts || [])], notVisible: lines?.notVisible || [], marriageLines: lines?.raw?.marriageLines };
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
  const facts = factsFor(prof, req.body.location);
  // Free plan gets a short teaser from the cheaper model; paid plans get the full reading.
  const paid = planOf(req.user).personal;
  const kind = paid ? 'full' : 'teaser';
  // Reuse the saved reading when nothing about the person has changed: no API call,
  // no allowance used. Daily timings are left out of the comparison on purpose.
  const { today: _today, ...core } = facts;
  const factsHash = crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 16);
  const saved = prof.reading;
  if (!req.body.refresh && saved?.kind === kind && saved.language === language && saved.factsHash === factsHash
    && Date.now() - saved.at < 30 * 86400000) {
    return res.json({ ...saved, facts, cached: true });
  }
  const record = checkQuota(req.user, 'reading');
  const text = await narrate({ kind, facts, language, name: prof.name, paid });
  record();
  const reading = { text, kind, language, at: Date.now(), factsHash };
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
  if (d) return res.json({ answer: tr(language, d.message), support: true });
  const prof = usableProfile(req.user, profileId);
  const record = checkQuota(req.user, 'chat');
  // factsFor(prof) without a location is identical across questions, so follow-ups hit the prompt cache.
  const answer = await ask({ question: String(question).slice(0, 500), facts: factsFor(prof), history: Array.isArray(history) ? history.slice(-8) : [], language, paid: planOf(req.user).personal });
  record();
  res.json({ answer });
}));

// ---- owner dashboard -------------------------------------------------------------
function isAdmin(req) {
  const t = req.get('x-admin-token') || '';
  const want = process.env.ADMIN_TOKEN || '';
  return want.length > 0 && t.length === want.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(want));
}
// Find a customer by phone, email or name (for support).
app.get('/api/admin/users', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  res.json(store.findUsers(String(req.query.q || '').slice(0, 60)));
});
// Forgotten password: the owner sets a temporary password after confirming the caller,
// e.g. by WhatsApp from the registered number. All the user's devices are signed out.
app.post('/api/admin/reset-password', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  const user = store.getUser(String(req.body.userId || ''));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const temp = crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
  store.setPassword(user.id, hashPassword(temp));
  res.json({ ok: true, tempPassword: temp, phone: user.phone });
});
app.get('/api/admin/stats', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  const s = store.stats();
  const mrr = s.subscribers.reduce((sum, r) => sum + (PLANS[r.plan]?.priceInr || 0) * r.n, 0);
  const fx = +process.env.FX_INR || 88;
  const budget = +process.env.AI_MONTHLY_BUDGET_USD || null;
  const a = s.aiThisMonth;
  res.json({
    ...s, mrrInr: mrr, aiCostInrThisMonth: Math.round(a.usd * fx),
    ai: {
      budgetUsd: budget, spentUsd: +a.usd.toFixed(4), budgetUsedPct: budget ? Math.round((a.usd / budget) * 100) : null,
      cacheHitPct: a.tokens_in ? Math.round((a.cache_read / a.tokens_in) * 100) : 0,
      cacheMode: process.env.AI_CACHE || 'auto',
    },
  });
});

// ---- translations (owner) ---------------------------------------------------------
// Start or check the background translation job; export/import for native-speaker review.
app.get('/api/admin/translations', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  const langs = LANG_CODES.filter((l) => l !== 'en').map((l) => ({ lang: l, live: readyLangs().includes(l), coverage: coverage(l) }));
  res.json({ job: translateStatus, langs, counts: store.translationCounts() });
});
app.post('/api/admin/translate', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  const langs = Array.isArray(req.body.langs) && req.body.langs.length ? req.body.langs.filter(isLang) : undefined;
  runTranslations({ langs, articles: ARTICLES, scope: req.body.scope }).then(() => { clearPageCache(); });
  res.json({ started: !translateStatus.error, job: translateStatus });
});
app.get('/api/admin/translations/:lang', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  if (!isLang(req.params.lang)) return res.status(404).json({ error: 'Unknown language' });
  res.set('Content-Disposition', `attachment; filename="rekha-${req.params.lang}.json"`);
  res.json(exportLang(req.params.lang, ARTICLES));
});
app.post('/api/admin/translations/:lang', express.json({ limit: '10mb' }), (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  if (!isLang(req.params.lang) || req.params.lang === 'en') return res.status(400).json({ error: 'Unknown language' });
  const n = importLang(req.params.lang, req.body, ARTICLES);
  clearPageCache();
  res.json({ ok: true, imported: n });
});

// The app shell, translated on the server so text, title and links are right before any script runs.
// A returning visitor who chose a language gets it at the root address too.
app.get(['/', '/index.html'], (req, res) => {
  if (req.originalUrl.startsWith('/index.html')) return res.redirect(301, '/');
  const pref = /(?:^|;\s*)rk_lang=([a-z]{2})/.exec(req.get('cookie') || '')?.[1];
  if (req.lang === 'en' && pref && pref !== 'en' && isLang(pref) && req.originalUrl === '/') return res.redirect(302, localePath(pref, '/'));
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(renderShell(req.lang, base));
});

// Privacy and terms: static drafts with an absolute canonical. They stay out of search
// results until LEGAL_PAGES_FINAL=1 says the lawyer-reviewed text is in place.
const legalCache = {};
app.get(['/privacy', '/terms'], (req, res, next) => {
  if (req.lang !== 'en') return res.redirect(301, req.path);
  try {
    const file = path.join(__dirname, '..', 'public', `${req.path.slice(1)}.html`);
    legalCache[file] ||= fs.readFileSync(file, 'utf8');
    const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.type('html').send(legalCache[file]
      .replace(/<link rel="canonical" href="\/(privacy|terms)">/, `<link rel="canonical" href="${base}/$1">`)
      .replace('<!--ROBOTS-->', process.env.LEGAL_PAGES_FINAL === '1' ? '' : '<meta name="robots" content="noindex, follow">'));
  } catch (e) { next(e); }
});

app.locals.horoscopeFor = horoscopeFor;
seoRoutes(app);
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], index: false }));

// Friendly 404 for pages; JSON for the API.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.method !== 'GET') return next();
  const lang = req.lang || 'en';
  const tt = (x) => tr(lang, x);
  const link = (p, label) => `<li><a href="${localePath(lang, p)}">${tt(label)}</a></li>`;
  res.status(404).type('html').send(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${tt('Page not found')}: Rekha</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/styles.css"></head><body><main class="article"><div class="page-head"><h1>${tt('Page not found')}</h1><p class="lede">${tt('That page does not exist. Try one of these:')}</p></div><ul class="link-grid">${link('/', "Today's good and bad times")}${link('/choghadiya', 'Choghadiya today')}${link('/panchang', 'Panchang today')}${link('/horoscope', 'Daily horoscope')}${link('/insights', 'Insights')}</ul></main></body></html>`);
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const expected = status < 500 || err.code === 'ai_paused';
  if (!expected) console.error(err);
  if (err.code === 'ai_paused') console.warn(`AI budget reached: ${err.message}`);
  res.status(status).json({ error: expected ? err.message : 'Something went wrong. Please try again.', code: err.code });
});

// Railway sets PORT automatically.
const port = process.env.PORT || 3000;
if (!isTest) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Rekha running on port ${port}`);
    console.log(`Database: ${store.dbLocation}`);
    const pay = billingConfigured() === 'stripe'
      ? ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
      : ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RZP_PLAN_SOLO', 'RZP_PLAN_COUPLE', 'RZP_PLAN_FAMILY'];
    const missing = ['ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_ID', ...pay, 'ADMIN_TOKEN'].filter((k) => !process.env[k]);
    console.log(`Payments: ${billingConfigured() || 'off (no Stripe or Razorpay keys yet)'}`);
    if (missing.length) console.log(`Not set yet (features stay off until added): ${missing.join(', ')}`);
    // Translate whatever is missing, a minute after start (only new strings after the first run).
    if (!demoMode && process.env.TRANSLATE_AUTO !== '0') {
      setTimeout(() => runTranslations({ articles: ARTICLES }).then((s) => {
        clearPageCache();
        console.log(`Translations: ${s.done} added, ${s.failed} to retry${s.error ? `, stopped: ${s.error}` : ''}. Live languages: ${readyLangs().join(', ')}`);
      }), 60000).unref();
    }
  });
  // Railway sends SIGTERM before each redeploy: finish requests, then close the database cleanly.
  process.on('SIGTERM', () => {
    server.close(() => { try { store.db.close(); } catch { /* already closed */ } process.exit(0); });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
export default app;
