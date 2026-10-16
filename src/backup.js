// Database backups. SQLite keeps everything in one file on the Railway volume, so:
// 1. Every night a consistent copy is written next to it (VACUUM INTO, safe while the app runs):
//    the last 7 days and the last 4 Sundays are kept in /data/backups.
// 2. If BACKUP_S3_* variables are set, the copy is also uploaded off Railway to any S3-compatible
//    storage (Cloudflare R2, Backblaze B2, AWS S3), so a lost volume or account does not lose the data.
// 3. The owner dashboard can download the latest copy at any time.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { db, dbLocation } from './db.js';

export const backupDir = () => (dbLocation === ':memory:' ? null : path.join(path.dirname(dbLocation), 'backups'));

/** Write today's copy (gzip). Returns the file path, or null for an in-memory database. */
export function makeBackup(now = new Date()) {
  const dir = backupDir(); if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const day = now.toISOString().slice(0, 10);
  const tmp = path.join(dir, `.rekha-${day}.db`);
  fs.rmSync(tmp, { force: true });
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const out = path.join(dir, `rekha-${day}.db.gz`);
  fs.writeFileSync(out, zlib.gzipSync(fs.readFileSync(tmp), { level: 6 }));
  fs.rmSync(tmp, { force: true });
  prune(dir);
  return out;
}
function prune(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^rekha-\d{4}-\d{2}-\d{2}\.db\.gz$/.test(f)).sort().reverse();
  const keep = new Set(files.slice(0, 7));
  files.filter((f) => new Date(`${f.slice(6, 16)}T12:00:00Z`).getUTCDay() === 0).slice(0, 4).forEach((f) => keep.add(f));
  for (const f of files) if (!keep.has(f)) fs.rmSync(path.join(dir, f), { force: true });
}
export function listBackups() {
  const dir = backupDir(); if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.db.gz')).sort().reverse()
    .map((f) => ({ file: f, bytes: fs.statSync(path.join(dir, f)).size }));
}

// ---- off-site copy: S3-compatible PUT with AWS Signature V4 (no SDK needed) ----------------
const s3 = () => {
  const e = process.env;
  return e.BACKUP_S3_ENDPOINT && e.BACKUP_S3_BUCKET && e.BACKUP_S3_KEY && e.BACKUP_S3_SECRET
    ? { endpoint: e.BACKUP_S3_ENDPOINT.replace(/\/$/, ''), bucket: e.BACKUP_S3_BUCKET, key: e.BACKUP_S3_KEY, secret: e.BACKUP_S3_SECRET, region: e.BACKUP_S3_REGION || 'auto' }
    : null;
};
export const offsiteConfigured = () => !!s3();
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
export async function uploadOffsite(file, fetchImpl = fetch, now = new Date()) {
  const c = s3(); if (!c) return null;
  const body = fs.readFileSync(file);
  const url = new URL(`${c.endpoint}/${c.bucket}/rekha/${path.basename(file)}`);
  const amz = now.toISOString().replace(/[-:]|\.\d{3}/g, ''); const day = amz.slice(0, 8);
  const hash = sha(body);
  const headers = { host: url.host, 'x-amz-content-sha256': hash, 'x-amz-date': amz };
  const signed = Object.keys(headers).sort();
  const canonical = ['PUT', url.pathname, '', ...signed.map((h) => `${h}:${headers[h]}`), '', signed.join(';'), hash].join('\n');
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, day), c.region), 's3'), 'aws4_request');
  const sig = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  const r = await fetchImpl(url, {
    method: 'PUT', body,
    headers: { ...headers, 'content-type': 'application/gzip', authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${sig}` },
  });
  if (!r.ok) throw new Error(`Off-site backup upload failed (${r.status})`);
  return url.href;
}

/** Nightly job: copy, then upload. Logs, never throws. */
export async function nightlyBackup() {
  try {
    const file = makeBackup();
    if (!file) return;
    const remote = await uploadOffsite(file).catch((e) => { console.error(e.message); return null; });
    console.log(`Backup: ${path.basename(file)}${remote ? ', uploaded off-site' : offsiteConfigured() ? ', off-site upload failed' : ' (set BACKUP_S3_* for an off-site copy)'}`);
  } catch (e) { console.error(`Backup failed: ${e.message}`); }
}

export function backupRoutes(app, isAdmin) {
  app.get('/api/admin/backups', (req, res) => (isAdmin(req) ? res.json({ backups: listBackups(), offsite: offsiteConfigured() }) : res.status(403).json({ error: 'forbidden' })));
  app.post('/api/admin/backups', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const file = makeBackup();
    res.json({ ok: !!file, file: file && path.basename(file) });
  });
  app.get('/api/admin/backups/:file', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const dir = backupDir();
    if (!dir || !/^rekha-\d{4}-\d{2}-\d{2}\.db\.gz$/.test(req.params.file)) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'no-store');
    res.download(path.join(dir, req.params.file), (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Not found' }); });
  });
}
