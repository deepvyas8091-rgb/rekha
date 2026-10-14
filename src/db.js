// SQLite storage using Node's built-in driver: no database server to run or pay for.
// On Railway the file lives on the attached volume, so it survives redeploys.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isProd, isTest } from './env.js';

function dbFile() {
  const vol = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const custom = process.env.DB_PATH;
  // A DB_PATH outside the volume (e.g. ./data/rekha.db copied from .env.example) would put
  // the database on the container's temporary disk, wiped on every redeploy. Ignore it.
  if (custom && vol && !path.resolve(custom).startsWith(path.resolve(vol) + path.sep)) {
    console.warn(`Ignoring DB_PATH=${custom}: it is outside the volume (${vol}), so data would be lost on redeploy. Delete the DB_PATH variable in Railway.`);
  } else if (custom) return custom;
  if (isTest) return ':memory:';
  if (vol) return path.join(vol, 'rekha.db');
  // Without a volume every redeploy would wipe all users and subscriptions.
  if (isProd) throw new Error('No storage volume attached. In Railway: right-click the service > Attach Volume, mount path /data.');
  return './data/rekha.db';
}
const file = dbFile();
if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
export const dbLocation = file;

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT,
  plan_renews_at INTEGER,
  subscription_id TEXT,
  prev_subscription_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT,
  birth_json TEXT NOT NULL,
  natal_json TEXT,
  palm_json TEXT,
  face_json TEXT,
  reading_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month, kind)
);
CREATE TABLE IF NOT EXISTS daily_cache (
  profile_id TEXT NOT NULL,
  date TEXT NOT NULL,
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (profile_id, date, lang)
);
CREATE TABLE IF NOT EXISTS palm_cache (
  hash TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_calls (
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER, tokens_out INTEGER, cost_usd REAL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subscription_id TEXT,
  received_at INTEGER NOT NULL,
  body TEXT
);
`);

// Columns added after first release: add them to databases created earlier.
for (const [table, col, type] of [
  ['ai_calls', 'cache_write', 'INTEGER DEFAULT 0'], ['ai_calls', 'cache_read', 'INTEGER DEFAULT 0'],
  ['users', 'phone', 'TEXT'], ['users', 'password_hash', 'TEXT'], ['users', 'session_v', 'INTEGER DEFAULT 0'],
  ['users', 'failed_logins', 'INTEGER DEFAULT 0'], ['users', 'locked_until', 'INTEGER'],
  ['users', 'stripe_customer_id', 'TEXT'],
]) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');
db.exec(`CREATE TABLE IF NOT EXISTS horoscope_cache (
  date TEXT NOT NULL, sign INTEGER NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL,
  PRIMARY KEY (date, sign, lang)
)`);

// Translations. ns 'ui' holds short strings keyed by their English text; 'article:<slug>'
// holds one row per article field, with a hash of the English so edits are re-translated.
// origin: 'ai' (machine), 'human' (imported after native review; never overwritten by AI).
db.exec(`CREATE TABLE IF NOT EXISTS translations (
  lang TEXT NOT NULL, ns TEXT NOT NULL, src TEXT NOT NULL, text TEXT NOT NULL,
  src_hash TEXT, origin TEXT NOT NULL DEFAULT 'ai', updated_at INTEGER NOT NULL,
  PRIMARY KEY (lang, ns, src)
)`);

/** A stored secret, created once on first start (so nobody has to type one in). */
export function storedSecret(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return row.value;
  const value = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  return value;
}

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

// ---- users
export function upsertGoogleUser({ sub, email, name }) {
  const existing = one('SELECT * FROM users WHERE google_sub = ?', sub);
  if (existing) {
    run('UPDATE users SET email = ?, name = ? WHERE id = ?', email, name, existing.id);
    return getUser(existing.id);
  }
  const id = newId('u');
  run('INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)', id, sub, email, name, Date.now());
  return getUser(id);
}
export const getUser = (id) => one('SELECT * FROM users WHERE id = ?', id);
export const getUserByPhone = (phone) => one('SELECT * FROM users WHERE phone = ?', phone);
export function createPhoneUser({ phone, name, email, passwordHash }) {
  const id = newId('u');
  run('INSERT INTO users (id, phone, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, phone, name, email || null, passwordHash, Date.now());
  return getUser(id);
}
export function setPassword(userId, passwordHash) {
  run('UPDATE users SET password_hash = ?, session_v = COALESCE(session_v, 0) + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', passwordHash, userId);
}
export function recordLoginFailure(userId, lockMs) {
  run(`UPDATE users SET failed_logins = COALESCE(failed_logins, 0) + 1,
       locked_until = CASE WHEN COALESCE(failed_logins, 0) + 1 >= 5 THEN ? ELSE locked_until END WHERE id = ?`, Date.now() + lockMs, userId);
}
export const clearLoginFailures = (userId) => run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', userId);
export const setPhone = (userId, phone) => run('UPDATE users SET phone = ? WHERE id = ?', phone, userId);
export const findUsers = (q) => all(`SELECT id, name, email, phone, plan, plan_status, created_at FROM users
  WHERE phone LIKE ? OR email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 20`, `%${q}%`, `%${q}%`, `%${q}%`);
export const getHoroscope = (date, sign, lang) => one('SELECT text FROM horoscope_cache WHERE date = ? AND sign = ? AND lang = ?', date, sign, lang)?.text;
export function putHoroscope(date, sign, lang, text) {
  run('INSERT OR REPLACE INTO horoscope_cache VALUES (?, ?, ?, ?)', date, sign, lang, text);
  run('DELETE FROM horoscope_cache WHERE date < ?', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
}
export const setStripeCustomer = (userId, cid) => run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', cid, userId);
export const getUserByStripeCustomer = (cid) => one('SELECT * FROM users WHERE stripe_customer_id = ?', cid);
export const getUserBySubscription = (sid) => one('SELECT * FROM users WHERE subscription_id = ?', sid);
export function setPlan(userId, fields) {
  const { plan, status, renewsAt, subscriptionId } = fields;
  run(`UPDATE users SET plan = COALESCE(?, plan), plan_status = COALESCE(?, plan_status),
       plan_renews_at = COALESCE(?, plan_renews_at), subscription_id = COALESCE(?, subscription_id) WHERE id = ?`,
    plan ?? null, status ?? null, renewsAt ?? null, subscriptionId ?? null, userId);
  // Only touched when the caller passes the key (null clears it).
  if ('prevSubscriptionId' in fields) run('UPDATE users SET prev_subscription_id = ? WHERE id = ?', fields.prevSubscriptionId ?? null, userId);
}
export function deleteUser(id) { run('DELETE FROM users WHERE id = ?', id); run('DELETE FROM usage WHERE user_id = ?', id); }

// ---- profiles
const parseProfile = (p) => p && ({
  ...p,
  birth: JSON.parse(p.birth_json),
  natal: p.natal_json ? JSON.parse(p.natal_json) : null,
  palm: p.palm_json ? JSON.parse(p.palm_json) : null,
  face: p.face_json ? JSON.parse(p.face_json) : null,
  reading: p.reading_json ? JSON.parse(p.reading_json) : null,
  birth_json: undefined, natal_json: undefined, palm_json: undefined, face_json: undefined, reading_json: undefined,
});
export const listProfiles = (userId) => all('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at', userId).map(parseProfile);
export const getProfile = (userId, id) => parseProfile(one('SELECT * FROM profiles WHERE id = ? AND user_id = ?', id, userId));
export function createProfile(userId, { name, relation, birth, natal }) {
  const id = newId('p');
  run('INSERT INTO profiles (id, user_id, name, relation, birth_json, natal_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, userId, name, relation || null, JSON.stringify(birth), natal ? JSON.stringify(natal) : null, Date.now());
  return getProfile(userId, id);
}
export function updateProfile(userId, id, fields) {
  const map = { name: 'name', relation: 'relation', birth: 'birth_json', natal: 'natal_json', palm: 'palm_json', face: 'face_json', reading: 'reading_json' };
  for (const [k, col] of Object.entries(map)) {
    if (fields[k] === undefined) continue;
    const v = col.endsWith('_json') ? (fields[k] === null ? null : JSON.stringify(fields[k])) : fields[k];
    run(`UPDATE profiles SET ${col} = ? WHERE id = ? AND user_id = ?`, v, id, userId);
  }
  return getProfile(userId, id);
}
export function deleteProfile(userId, id) {
  run('DELETE FROM profiles WHERE id = ? AND user_id = ?', id, userId);
  run('DELETE FROM daily_cache WHERE profile_id = ?', id);
}

// ---- usage quotas
export function usageFor(userId, month) {
  return Object.fromEntries(all('SELECT kind, count FROM usage WHERE user_id = ? AND month = ?', userId, month).map((r) => [r.kind, r.count]));
}
export function addUsage(userId, month, kind, n = 1) {
  run(`INSERT INTO usage (user_id, month, kind, count) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, month, kind) DO UPDATE SET count = count + excluded.count`, userId, month, kind, n);
}

// ---- daily guidance cache
export const getDaily = (pid, date, lang) => one('SELECT text FROM daily_cache WHERE profile_id = ? AND date = ? AND lang = ?', pid, date, lang)?.text;
export const putDaily = (pid, date, lang, text) => run('INSERT OR REPLACE INTO daily_cache VALUES (?, ?, ?, ?)', pid, date, lang, text);

// ---- AI cost log
export function logAi({ kind, model, tokensIn, tokensOut, costUsd, cacheWrite = 0, cacheRead = 0 }) {
  run('INSERT INTO ai_calls (at, kind, model, tokens_in, tokens_out, cost_usd, cache_write, cache_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    Date.now(), kind, model, tokensIn, tokensOut, costUsd, cacheWrite, cacheRead);
}
const monthStartMs = () => Date.parse(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
/** USD spent on AI since the 1st of this month (UTC). */
export const aiSpendThisMonth = () => one('SELECT COALESCE(SUM(cost_usd),0) usd FROM ai_calls WHERE at >= ?', monthStartMs()).usd;

// ---- palm result cache (same photo never paid for twice, survives redeploys)
export function getPalmCache(hash) {
  const r = one('SELECT json FROM palm_cache WHERE hash = ?', hash);
  return r ? JSON.parse(r.json) : null;
}
export function putPalmCache(hash, value) {
  run('INSERT OR REPLACE INTO palm_cache VALUES (?, ?, ?)', hash, JSON.stringify(value), Date.now());
  run('DELETE FROM palm_cache WHERE at < ?', Date.now() - 90 * 86400000); // keep 90 days
}

// ---- billing events (idempotency)
export function recordEvent(id, type, subscriptionId, body) {
  const r = run('INSERT OR IGNORE INTO billing_events VALUES (?, ?, ?, ?, ?)', id, type, subscriptionId, Date.now(), body);
  return r.changes === 1; // false = already processed
}

// ---- owner dashboard
export function stats() {
  const since = (days) => Date.now() - days * 86400000;
  const monthStart = Date.parse(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
  return {
    users: one('SELECT COUNT(*) n FROM users').n,
    newUsers7d: one('SELECT COUNT(*) n FROM users WHERE created_at > ?', since(7)).n,
    profiles: one('SELECT COUNT(*) n FROM profiles').n,
    subscribers: all(`SELECT plan, COUNT(*) n FROM users WHERE plan != 'free' AND plan_status IN ('active','authenticated','cancelling') GROUP BY plan`),
    aiThisMonth: one('SELECT COUNT(*) calls, COALESCE(SUM(cost_usd),0) usd, COALESCE(SUM(tokens_in),0) tokens_in, COALESCE(SUM(cache_read),0) cache_read, COALESCE(SUM(cache_write),0) cache_write FROM ai_calls WHERE at >= ?', monthStart),
    aiByKind: all(`SELECT kind, COUNT(*) calls, ROUND(SUM(cost_usd),4) usd, ROUND(AVG(cost_usd),5) avg_usd,
      SUM(cache_read) cache_read, SUM(tokens_in) tokens_in FROM ai_calls WHERE at >= ? GROUP BY kind ORDER BY usd DESC`, monthStart),
    signupsByDay: all(`SELECT date(created_at/1000,'unixepoch') day, COUNT(*) n FROM users WHERE created_at > ? GROUP BY day ORDER BY day`, since(30)),
    recentBilling: all('SELECT type, subscription_id, received_at FROM billing_events ORDER BY received_at DESC LIMIT 20'),
  };
}

// ---- translations ----------------------------------------------------------------
export const getTranslations = (lang, ns) => all('SELECT src, text, src_hash, origin FROM translations WHERE lang = ? AND ns = ?', lang, ns);
export const getTranslationsLike = (lang, nsPrefix) => all('SELECT ns, src, text, src_hash, origin FROM translations WHERE lang = ? AND ns LIKE ?', lang, `${nsPrefix}%`);
/** rows: [{ src, text, srcHash, origin }]. Machine rows never replace human-reviewed ones. */
export function putTranslations(lang, ns, rows) {
  const stmt = db.prepare(`INSERT INTO translations (lang, ns, src, text, src_hash, origin, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (lang, ns, src) DO UPDATE SET text = excluded.text, src_hash = excluded.src_hash, origin = excluded.origin, updated_at = excluded.updated_at
    WHERE translations.origin != 'human' OR excluded.origin = 'human'`);
  db.exec('BEGIN');
  try {
    for (const r of rows) stmt.run(lang, ns, r.src, r.text, r.srcHash ?? null, r.origin || 'ai', Date.now());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export const deleteTranslation = (lang, ns, src) => run('DELETE FROM translations WHERE lang = ? AND ns = ? AND src = ?', lang, ns, src);
export const translationCounts = () => all(`SELECT lang, CASE WHEN ns LIKE 'article:%' THEN 'articles' ELSE ns END AS ns, origin, COUNT(*) n
  FROM translations GROUP BY 1, 2, 3 ORDER BY 1, 2`);
