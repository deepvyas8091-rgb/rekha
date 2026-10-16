// First-visit city detection, and email through a mock Resend: confirmation, festival eve, campaigns, unsubscribe.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'adm-mail';
delete process.env.ANTHROPIC_API_KEY;
const sent = [];
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => { sent.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(b || '[]') }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [] })); });
});
await new Promise((r) => mock.listen(0, r));
process.env.RESEND_API_BASE = `http://localhost:${mock.address().port}`;
process.env.RESEND_API_KEY = 're_test';
process.env.PUBLIC_URL = 'https://rekha.io';
process.env.CANONICAL_REDIRECT = '0';
const { default: app } = await import('../src/server.js');
const email = await import('../src/email.js');
const { db } = await import('../src/db.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); server.keepAliveTimeout = 60000; }));
after(() => { server.close(); mock.close(); delete process.env.PUBLIC_URL; });
const admin = { 'x-admin-token': 'adm-mail', 'content-type': 'application/json' };

test('first visit: the city from Cloudflare\'s location headers, GPS named after the nearest city, time zone as fallback', async () => {
  const cf = await (await fetch(`${base}/api/geo?tz=Asia/Kolkata`, { headers: { 'cf-ray': 'x', 'cf-iplatitude': '22.31', 'cf-iplongitude': '73.18', 'cf-ipcity': 'Vadodara', 'cf-ipcountry': 'IN' } })).json();
  assert.equal(cf.name, 'Vadodara');
  assert.equal(cf.tz, 'Asia/Kolkata');
  assert.equal(cf.source, 'network');
  const gps = await (await fetch(`${base}/api/geo?lat=22.30&lon=73.20`)).json();
  assert.equal(gps.name, 'Vadodara');
  assert.equal(gps.source, 'gps');
  const tz = await (await fetch(`${base}/api/geo?tz=Europe/London`)).json();
  assert.equal(tz.name, 'London');
  assert.equal(tz.source, 'timezone');
  // Without Cloudflare's CF-Ray header, spoofed location headers are ignored.
  assert.equal((await (await fetch(`${base}/api/geo?tz=Asia/Dubai`, { headers: { 'cf-iplatitude': '22.31', 'cf-iplongitude': '73.18' } })).json()).source, 'timezone');
  // The app starts the lookup before its script loads when no city is saved yet.
  assert.match(await (await fetch(`${base}/gu/`)).text(), /\/api\/geo\?tz=/);
});

test('double opt-in: a confirmation email, then confirmed; only confirmed people get email', async () => {
  sent.length = 0;
  const r = await fetch(`${base}/subscribe`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'Priya@Example.com', consent: 'yes', back: '/festivals/diwali/vadodara', lang: 'gu', city: 'Vadodara' }) });
  assert.equal(r.headers.get('location'), '/festivals/diwali/vadodara?subscribed=check#subscribe');
  await new Promise((res) => setTimeout(res, 200));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].auth, 'Bearer re_test');
  const mail = sent[0].body[0];
  assert.deepEqual(mail.to, ['priya@example.com']);
  assert.equal(mail.subject, 'તમારા Rekha સબ્સ્ક્રિપ્શનની પુષ્ટિ કરો');
  assert.equal(email.emailAudience().some((x) => x.email === 'priya@example.com'), false, 'not confirmed yet');
  const token = mail.html.match(/confirm\?t=([0-9a-f]+)/)[1];
  assert.match(await (await fetch(`${base}/confirm?t=${token}&lang=gu`)).text(), /પાકું/);
  assert.equal(email.emailAudience().some((x) => x.email === 'priya@example.com'), true);
});

test('festival eve: one email per person with their city\'s muhurat, never twice', async () => {
  sent.length = 0;
  const eve = new Date('2026-11-07T10:00:00+05:30'); // Diwali is on 8 November 2026
  const r1 = await email.festivalEmailTick(eve);
  assert.equal(r1.failed, 0);
  assert.ok(r1.sent >= 1);
  const mail = sent.flatMap((s) => s.body).find((m) => m.to[0] === 'priya@example.com');
  assert.match(mail.subject, /આવતીકાલે છે: .+નો સમય$/, 'Gujarati subject naming the city');
  assert.match(mail.html, /\/gu\/festivals\/diwali\/vadodara/);
  assert.match(mail.headers['List-Unsubscribe'], /^<https:\/\/rekha\.io\/unsubscribe\?t=[0-9a-f]+&lang=gu>$/);
  assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const r2 = await email.festivalEmailTick(new Date('2026-11-07T11:00:00+05:30'));
  assert.equal(r2.sent, 0, 'already sent');
  assert.equal(await email.festivalEmailTick(new Date('2026-11-07T08:00:00+05:30')), null, 'not before 9:00');
  // One-click unsubscribe from the mail app.
  const unsub = mail.headers['List-Unsubscribe'].slice(1, -1).replace('https://rekha.io', base);
  await fetch(unsub, { method: 'POST', body: 'List-Unsubscribe=One-Click' });
  assert.equal(email.emailAudience().some((x) => x.email === 'priya@example.com'), false);
});

test('owner email campaign to a segment, with a test send first', async () => {
  db.prepare("INSERT OR REPLACE INTO email_subscribers (email, lang, consent_at, unsub_token, confirmed_at) VALUES ('hindi@example.com', 'hi', 1, 'tok-hi', 1)").run();
  db.prepare("INSERT OR REPLACE INTO email_subscribers (email, lang, consent_at, unsub_token, confirmed_at) VALUES ('english@example.com', 'en', 1, 'tok-en', 1)").run();
  sent.length = 0;
  const test1 = await (await fetch(`${base}/api/admin/email-campaigns`, { method: 'POST', headers: admin, body: JSON.stringify({ subject: 'Diwali', body: 'Line one.\n\nLine two.', test: 'owner@example.com' }) })).json();
  assert.equal(test1.ok, true);
  assert.equal(sent[0].body[0].subject, '[Test] Diwali');
  sent.length = 0;
  const c = await (await fetch(`${base}/api/admin/email-campaigns`, { method: 'POST', headers: admin, body: JSON.stringify({ subject: 'दिवाली', body: 'नमस्ते', url: '/festivals/diwali', langs: 'hi' }) })).json();
  assert.equal(c.audience, 1);
  await new Promise((res) => setTimeout(res, 300));
  const to = sent.flatMap((s) => s.body).map((m) => m.to[0]);
  assert.deepEqual(to, ['hindi@example.com']);
  assert.match(sent[0].body[0].html, /https:\/\/rekha\.io\/hi\/festivals\/diwali/);
  assert.equal((await fetch(`${base}/api/admin/email-campaigns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
});
