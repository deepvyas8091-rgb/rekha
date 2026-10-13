// Google sign-in (free) + signed session cookie. No passwords stored anywhere.
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { upsertGoogleUser, getUser, storedSecret } from './db.js';
import { isProd, devLoginEnabled } from './env.js';

// SESSION_SECRET is optional: if unset, a random one is created once and kept in the database.
const SECRET = process.env.SESSION_SECRET || storedSecret('session_secret');
const COOKIE = 'rk_sess';
const MAX_AGE = 60 * 86400; // 60 days
const google = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

function setSession(res, userId) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const val = `${userId}.${exp}`;
  const secure = isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${val}.${sign(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`);
}

function readSession(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [userId, exp, mac] = raw.slice(COOKIE.length + 1).split('.');
  if (!userId || !exp || !mac) return null;
  const expected = sign(`${userId}.${exp}`);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (+exp * 1000 < Date.now()) return null;
  return userId;
}

/** Attaches req.user when a valid session cookie is present. */
export function sessionMiddleware(req, _res, next) {
  const id = readSession(req);
  req.user = id ? getUser(id) || null : null;
  next();
}

export function requireUser(req, _res, next) {
  if (req.user) return next();
  const e = new Error('Please sign in to continue'); e.status = 401; e.code = 'signin'; next(e);
}

export function authRoutes(app) {
  app.post('/api/auth/google', async (req, res, next) => {
    try {
      if (!google) throw Object.assign(new Error('Google sign-in is not configured'), { status: 501 });
      const ticket = await google.verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p?.sub || p.email_verified === false) throw Object.assign(new Error('Google account not verified'), { status: 401 });
      const user = upsertGoogleUser({ sub: p.sub, email: p.email, name: p.given_name || p.name || '' });
      setSession(res, user.id);
      res.json({ ok: true });
    } catch (e) { e.status ||= 401; next(e); }
  });

  // Local testing only: never enable DEV_LOGIN on the live site.
  app.post('/api/auth/dev', (req, res, next) => {
    if (!devLoginEnabled) return next();
    const email = String(req.body.email || 'tester@example.com');
    const user = upsertGoogleUser({ sub: `dev:${email}`, email, name: req.body.name || 'Tester' });
    setSession(res, user.id);
    res.json({ ok: true, userId: user.id });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });
}
