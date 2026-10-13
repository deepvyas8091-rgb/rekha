// Sign-in: Google (one tap) or mobile number + password. Signed session cookie.
// Passwords are hashed with scrypt; the plain password is never stored.
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import {
  upsertGoogleUser, getUser, storedSecret, getUserByPhone, createPhoneUser, setPassword,
  recordLoginFailure, clearLoginFailures, setPhone,
} from './db.js';
import { isProd, devLoginEnabled, clientIp } from './env.js';

// SESSION_SECRET is optional: if unset, a random one is created once and kept in the database.
const SECRET = process.env.SESSION_SECRET || storedSecret('session_secret');
const COOKIE = 'rk_sess';
const MAX_AGE = 60 * 86400; // 60 days
const LOCK_MS = 15 * 60000; // 15 minutes after 5 wrong passwords
const google = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

// ---- sessions (cookie carries a version so a password reset logs out old devices)
export function setSession(res, user) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const val = `${user.id}.${user.session_v || 0}.${exp}`;
  const secure = isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${val}.${sign(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`);
}
function readSession(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const parts = raw.slice(COOKIE.length + 1).split('.');
  if (parts.length !== 4) return null;
  const [userId, v, exp, mac] = parts;
  const expected = sign(`${userId}.${v}.${exp}`);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (+exp * 1000 < Date.now()) return null;
  return { userId, v: +v };
}
export function sessionMiddleware(req, _res, next) {
  const s = readSession(req);
  const user = s ? getUser(s.userId) : null;
  req.user = user && (user.session_v || 0) === s.v ? user : null;
  next();
}
export function requireUser(req, _res, next) {
  if (req.user) return next();
  next(fail(401, 'Please sign in to continue', 'signin'));
}

// ---- passwords (scrypt, per-user salt)
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, N, r, p, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(got, expected);
}
// Spent on unknown numbers too, so response time does not reveal which numbers exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

// ---- phone numbers, stored in international format (+919876543210)
export function normalisePhone(countryCode, number) {
  const cc = String(countryCode || '+91').replace(/[^\d]/g, '');
  let n = String(number || '').replace(/[^\d]/g, '');
  if (n.startsWith(cc) && n.length > 10) n = n.slice(cc.length); // pasted with country code
  n = n.replace(/^0+/, '');
  if (cc === '91' && !/^[6-9]\d{9}$/.test(n)) throw fail(400, 'Enter a valid 10-digit Indian mobile number');
  if (!/^\d{6,12}$/.test(n) || !/^\d{1,3}$/.test(cc)) throw fail(400, 'Enter a valid mobile number');
  return `+${cc}${n}`;
}
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw fail(400, 'Password must be at least 8 characters');
  if (pw.length > 128) throw fail(400, 'Password is too long');
}

// ---- simple per-IP limiter for sign-in routes (production at scale: Redis)
const attempts = new Map();
function ipLimit(max, windowMs) {
  return (req, _res, next) => {
    const key = `${clientIp(req)}:${req.path}`;
    const now = Date.now();
    const arr = (attempts.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return next(fail(429, 'Too many attempts. Please wait a few minutes and try again.'));
    arr.push(now); attempts.set(key, arr); next();
  };
}

export function authRoutes(app) {
  app.post('/api/auth/google', async (req, res, next) => {
    try {
      if (!google) throw fail(501, 'Google sign-in is not configured');
      const ticket = await google.verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p?.sub || p.email_verified === false) throw fail(401, 'Google account not verified');
      const user = upsertGoogleUser({ sub: p.sub, email: p.email, name: p.given_name || p.name || '' });
      setSession(res, user);
      res.json({ ok: true });
    } catch (e) { e.status ||= 401; next(e); }
  });

  // Sign up with name, mobile number and password.
  app.post('/api/auth/signup', ipLimit(10, 3600000), (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim().slice(0, 40);
      if (!name) throw fail(400, 'Please enter your name');
      const phone = normalisePhone(req.body.countryCode, req.body.phone);
      checkPassword(req.body.password);
      const email = req.body.email ? String(req.body.email).trim().slice(0, 120) : null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email or leave it empty');
      if (getUserByPhone(phone)) throw fail(409, 'This mobile number already has an account. Please log in.', 'exists');
      const user = createPhoneUser({ phone, name, email, passwordHash: hashPassword(req.body.password) });
      setSession(res, user);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Log in with mobile number and password.
  app.post('/api/auth/login', ipLimit(20, 15 * 60000), (req, res, next) => {
    try {
      const phone = normalisePhone(req.body.countryCode, req.body.phone);
      const user = getUserByPhone(phone);
      if (user?.locked_until && user.locked_until > Date.now()) {
        throw fail(429, 'Too many wrong passwords. Please try again in 15 minutes.');
      }
      const ok = verifyPassword(String(req.body.password || ''), user?.password_hash || DUMMY_HASH);
      if (!user || !user.password_hash || !ok) {
        if (user) recordLoginFailure(user.id, LOCK_MS);
        throw fail(401, 'Mobile number or password is incorrect');
      }
      clearLoginFailures(user.id);
      setSession(res, getUser(user.id));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Signed-in users can add a mobile number and/or set or change a password.
  app.post('/api/auth/password', (req, res, next) => {
    try {
      if (!req.user) throw fail(401, 'Please sign in to continue', 'signin');
      if (req.user.password_hash && !verifyPassword(String(req.body.currentPassword || ''), req.user.password_hash)) {
        throw fail(401, 'Current password is incorrect');
      }
      checkPassword(req.body.newPassword);
      setPassword(req.user.id, hashPassword(req.body.newPassword));
      setSession(res, getUser(req.user.id)); // keep this device signed in, log out others
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/auth/phone', (req, res, next) => {
    try {
      if (!req.user) throw fail(401, 'Please sign in to continue', 'signin');
      const phone = normalisePhone(req.body.countryCode, req.body.phone);
      const other = getUserByPhone(phone);
      if (other && other.id !== req.user.id) throw fail(409, 'This mobile number is already used by another account');
      setPhone(req.user.id, phone);
      res.json({ ok: true, phone });
    } catch (e) { next(e); }
  });

  // Local testing only: never enabled on the live site.
  app.post('/api/auth/dev', (req, res, next) => {
    if (!devLoginEnabled) return next();
    const email = String(req.body.email || 'tester@example.com');
    const user = upsertGoogleUser({ sub: `dev:${email}`, email, name: req.body.name || 'Tester' });
    setSession(res, user);
    res.json({ ok: true, userId: user.id });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });
}
