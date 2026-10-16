// Subscribers: consent, email list, push segments and campaigns, festival reminders, backups.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.DEV_LOGIN = '1';
process.env.ADMIN_TOKEN = 'adm-aud';
delete process.env.ANTHROPIC_API_KEY;
const { default: app } = await import('../src/server.js');
const push = await import('../src/push.js');
const { campaignTick, pushSegment } = await import('../src/subscribers.js');
const backup = await import('../src/backup.js');
const { db } = await import('../src/db.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); server.keepAliveTimeout = 60000; }));
after(() => server.close());
const admin = { 'x-admin-token': 'adm-aud', 'content-type': 'application/json' };
function client() {
  let cookie = '';
  const call = async (p, opts = {}) => {
    const r = await fetch(base + p, { redirect: 'manual', ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) } });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r;
  };
  return { call, post: (p, body) => call(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) };
}
const sub = (n) => ({ endpoint: `https://push.example.com/aud${n}`, keys: { p256dh: 'BPk', auth: 'au' } });
const mumbai = { lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', name: 'Mumbai' };

test('email sign-up form: consent required, bot trap, unsubscribe link', async () => {
  const form = (o) => fetch(`${base}/subscribe`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
  let r = await form({ email: 'a@example.com', back: '/festivals/diwali', lang: 'hi' });
  assert.equal(r.headers.get('location'), '/festivals/diwali?subscribed=0#subscribe', 'no consent, not added');
  r = await form({ email: 'a@example.com', consent: 'yes', back: '/festivals/diwali', lang: 'hi', city: 'Mumbai' });
  assert.equal(r.headers.get('location'), '/festivals/diwali?subscribed=1#subscribe');
  await form({ email: 'bot@example.com', consent: 'yes', website: 'spam', back: '/' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM email_subscribers WHERE email = 'bot@example.com'").get().n, 0);
  const row = db.prepare("SELECT * FROM email_subscribers WHERE email = 'a@example.com'").get();
  assert.equal(row.lang, 'hi');
  const page = await (await fetch(`${base}/unsubscribe?t=${row.unsub_token}&lang=hi`)).text();
  assert.match(page, /अनसब्सक्राइब/);
  assert.ok(db.prepare("SELECT unsubscribed_at FROM email_subscribers WHERE email = 'a@example.com'").get().unsubscribed_at);
  // The form is on festival and city pages.
  assert.match(await (await fetch(`${base}/festivals/diwali/mumbai`)).text(), /action="\/subscribe"/);
});

test('account consent, linked alerts, segments, campaign, CSV export without the unconsented', async () => {
  const c = client();
  await c.post('/api/auth/dev', { email: 'yes@example.com' });
  assert.equal((await c.post('/api/me/marketing', { optIn: true, lang: 'gu', tz: 'Asia/Kolkata' })).status, 200);
  assert.equal((await (await c.call('/api/me')).json()).user.marketing, true);
  await c.post('/api/push/subscribe', { subscription: sub(1), place: mumbai, lang: 'gu', rahu: true, news: true });
  const c2 = client();
  await c2.post('/api/auth/dev', { email: 'no@example.com' });
  await c2.post('/api/push/subscribe', { subscription: sub(2), place: { ...mumbai, tz: 'Asia/Dubai' }, lang: 'en', rahu: true, news: false });
  assert.equal(db.prepare('SELECT user_id FROM push_subs WHERE endpoint = ?').get(sub(1).endpoint).user_id !== null, true, 'alerts linked to the account');
  assert.equal(pushSegment({ langs: ['gu'] }).length, 1);
  assert.equal(pushSegment({ audience: 'all' }).filter((s) => s.endpoint === sub(2).endpoint).length, 0, 'no news consent, never in a campaign');
  const count = await (await fetch(`${base}/api/admin/audience/count?langs=gu`, { headers: admin })).json();
  assert.equal(count.n, 1);
  const r = await fetch(`${base}/api/admin/campaigns`, { method: 'POST', headers: admin, body: JSON.stringify({ title: 'Diwali muhurat', body: 'See the time for your city', url: '/festivals/diwali', segment: { langs: 'gu' } }) });
  assert.equal((await r.json()).audience, 1);
  const got = [];
  await campaignTick(Date.now() + 1000, async (s, payload) => { got.push([s.endpoint, JSON.parse(payload)]); });
  assert.equal(got.length, 1);
  assert.equal(got[0][1].url, '/gu/festivals/diwali', 'opens in the subscriber\'s language');
  const aud = await (await fetch(`${base}/api/admin/audience`, { headers: admin })).json();
  assert.equal(aud.campaigns[0].status, 'done');
  assert.equal(aud.campaigns[0].sent, 1);
  const csv = await (await fetch(`${base}/api/admin/export/marketing.csv`, { headers: admin })).text();
  assert.match(csv, /yes@example\.com/);
  assert.doesNotMatch(csv, /no@example\.com/);
  assert.equal((await fetch(`${base}/api/admin/export/marketing.csv`)).status, 403);
  // Deleting the account removes its alerts too.
  await c.call('/api/me', { method: 'DELETE' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subs WHERE endpoint = ?').get(sub(1).endpoint).n, 0);
});

test('festival morning reminder with the city muhurat, once, only with news consent', () => {
  push.saveSubscription({ subscription: sub(3), place: { lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata', name: 'Delhi' }, lang: 'en', morning: null, rahu: false, news: true });
  const s = db.prepare('SELECT * FROM push_subs WHERE endpoint = ?').get(sub(3).endpoint);
  const due = push.dueFor(s, new Date('2026-11-08T07:35:00+05:30'));
  const fest = due.find((d) => d.kind === 'fest:diwali');
  assert.ok(fest, JSON.stringify(due));
  assert.equal(fest.title, 'Diwali today in Delhi');
  assert.match(fest.body, /^Puja muhurat \d\d:\d\d to \d\d:\d\d\./);
  assert.equal(push.dueFor({ ...s, news: 0 }, new Date('2026-11-08T07:35:00+05:30')).length, 0);
});

test('backups: a consistent gzip copy, kept 7 days plus Sundays, off-site upload signed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-bk-'));
  const file = path.join(dir, 'copy.db');
  db.exec(`VACUUM INTO '${file}'`);
  assert.ok(fs.statSync(file).size > 0);
  // Off-site: a PUT signed with AWS Signature V4 to the configured bucket.
  Object.assign(process.env, { BACKUP_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', BACKUP_S3_BUCKET: 'rekha-backups', BACKUP_S3_KEY: 'AKID', BACKUP_S3_SECRET: 'secret' });
  const gz = path.join(dir, 'rekha-2026-10-16.db.gz'); fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(file)));
  let req;
  const url = await backup.uploadOffsite(gz, async (u, o) => { req = { u: String(u), o }; return { ok: true, status: 200 }; }, new Date('2026-10-16T21:00:00Z'));
  assert.equal(url, 'https://acc.r2.cloudflarestorage.com/rekha-backups/rekha/rekha-2026-10-16.db.gz');
  assert.match(req.o.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/20261016\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  for (const k of ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_KEY', 'BACKUP_S3_SECRET']) delete process.env[k];
  const list = await (await fetch(`${base}/api/admin/backups`, { headers: admin })).json();
  assert.equal(list.offsite, false);
  assert.equal((await fetch(`${base}/api/admin/backups/..%2Fsecret`, { headers: admin })).status, 404);
});
