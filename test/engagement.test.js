// Analytics tags and funnel, calendar feed, muhurat finder, partner invites, month ahead.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DEV_LOGIN = '1';
process.env.ADMIN_TOKEN = 'adm-eng';
process.env.GA4_MEASUREMENT_ID = 'G-TEST1234';
process.env.CLARITY_PROJECT_ID = 'abc123xyz';
delete process.env.ANTHROPIC_API_KEY;
const { default: app } = await import('../src/server.js');
const { calendarFeed, findMuhurat } = await import('../src/engagement.js');
const { monthlyTick } = await import('../src/monthly.js');
const { db } = await import('../src/db.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); server.keepAliveTimeout = 60000; }));
after(() => server.close());
function client() {
  let cookie = '';
  const call = async (p, opts = {}) => {
    const r = await fetch(base + p, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) } });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r;
  };
  return { call, post: (p, body) => call(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) };
}
const birth = { date: '1990-05-15', time: '08:30', lat: 23.03, lon: 72.58, tz: 'Asia/Kolkata' };
const mumbai = { lat: 19.076, lon: 72.877, tz: 'Asia/Kolkata', name: 'Mumbai' };

test('GA4 and Clarity load after the page, with consent mode, on the app and public pages; consent bar for Europe', async () => {
  for (const p of ['/hi/', '/choghadiya/mumbai']) {
    const html = await (await fetch(base + p)).text();
    assert.match(html, /gtag\('consent','default',\{ad_storage:'denied'/);
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-TEST1234/);
    assert.match(html, /clarity\.ms\/tag\/"\+i[\s\S]*"abc123xyz"/);
    assert.match(html, /requestIdleCallback/);
    assert.match(html, /id="rkConsent"/);
  }
});

test('first-party funnel counts events per visitor; unknown events are ignored', async () => {
  const ev = (n, v) => fetch(`${base}/api/ev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n, v }) });
  await ev('app_open', 'visitor0001'); await ev('app_open', 'visitor0001'); await ev('share_timings', 'visitor0001'); await ev('app_open', 'visitor0002'); await ev('hack', 'visitor0003');
  const f = await (await fetch(`${base}/api/admin/funnel`, { headers: { 'x-admin-token': 'adm-eng' } })).json();
  assert.equal(f.visitors, 2);
  assert.equal(f.events.app_open.n, 3);
  assert.equal(f.events.app_open.people, 2);
  assert.equal(f.events.share_timings.n, 1);
  assert.equal((await fetch(`${base}/api/admin/funnel`)).status, 403);
});

test('calendar feed: festival muhurats as timed events, daily Rahu Kaal on request, valid iCalendar', async () => {
  const ics = calendarFeed({ place: mumbai, lang: 'hi', rahu: true });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /SUMMARY:(Diwali|दिवाली): पूजा मुहूर्त/);
  assert.equal((ics.match(/SUMMARY:राहु काल/g) || []).length, 14);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines folded');
  const r = await fetch(`${base}/cal/feed.ics?lat=19.07&lon=72.87&tz=Asia/Kolkata&name=Mumbai&lang=en`);
  assert.match(r.headers.get('content-type'), /text\/calendar/);
  assert.doesNotMatch(await r.text(), /SUMMARY:Rahu Kaal/);
  assert.equal((await fetch(`${base}/cal/festival/diwali.ics?lat=19.07&lon=72.87&tz=Asia/Kolkata`)).status, 200);
  assert.equal((await fetch(`${base}/cal/feed.ics?lat=x`)).status, 400);
});

test('muhurat finder: good dates only, best first, each with a window', async () => {
  const r = findMuhurat({ place: mumbai, activity: 'purchase', days: 60 });
  assert.ok(r.checked >= 55);
  assert.ok(r.dates.length > 0);
  assert.ok(r.dates.every((d) => ['excellent', 'good'].includes(d.rating)));
  for (let i = 1; i < r.dates.length; i++) assert.ok(r.dates[i - 1].score >= r.dates[i].score);
  const api = await (await fetch(`${base}/api/muhurat?lat=19.07&lon=72.87&tz=Asia/Kolkata&activity=travel`)).json();
  assert.equal(api.activity, 'travel');
  assert.equal((await fetch(`${base}/api/muhurat?lat=19.07&lon=72.87&tz=Asia/Kolkata&activity=nope`)).status, 400);
});

test('partner invite: link, partner fills in, both see the score; partner birth details not stored', async () => {
  const c = client();
  await c.post('/api/auth/dev', { email: 'inviter@example.com' });
  const prof = await (await c.post('/api/profiles', { name: 'Asha', birth })).json();
  const inv = await (await c.post('/api/match-invites', { profileId: prof.id, lang: 'gu' })).json();
  assert.match(inv.url, /\/gu\/\?invite=[\w-]+$/);
  const anon = await (await fetch(`${base}/api/match-invites/${inv.token}`)).json();
  assert.equal(anon.inviterName, 'Asha');
  const res = await (await fetch(`${base}/api/match-invites/${inv.token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ravi', birth: { date: '1988-11-02', time: '06:10', lat: 22.3, lon: 73.18, tz: 'Asia/Kolkata' } }) })).json();
  assert.ok(res.total >= 0 && res.total <= 36);
  const row = db.prepare('SELECT * FROM match_invites WHERE token = ?').get(inv.token);
  assert.doesNotMatch(row.result_json, /1988-11-02/);
  const mine = await (await c.call('/api/match-invites')).json();
  assert.equal(mine[0].partner_name, 'Ravi');
  assert.equal(mine[0].result.total, res.total);
  assert.equal((await fetch(`${base}/api/match-invites/nope`)).status, 404);
});

test('month ahead: paid only; generated once; monthly sender on the 1st', async () => {
  const c = client();
  await c.post('/api/auth/dev', { email: 'month@example.com' });
  const prof = await (await c.post('/api/profiles', { name: 'Mira', birth })).json();
  assert.equal((await c.call(`/api/month-ahead/${prof.id}?lat=19.07&lon=72.87&tz=Asia/Kolkata`)).status, 402);
  const u = db.prepare("SELECT id FROM users WHERE email = 'month@example.com'").get();
  db.prepare("UPDATE users SET plan = 'solo', plan_status = 'active', plan_renews_at = ? WHERE id = ?").run(Date.now() + 30 * 86400000, u.id);
  const r = await (await c.call(`/api/month-ahead/${prof.id}?lat=19.07&lon=72.87&tz=Asia/Kolkata`)).json();
  assert.match(r.text, /Demo/);
  const calls = [];
  const narrate = async () => { calls.push(1); return 'Your month.'; };
  const n = await monthlyTick(narrate, new Date('2026-11-01T09:00:00+05:30'), { sender: async () => {} });
  assert.ok(n >= 1);
  assert.equal(await monthlyTick(narrate, new Date('2026-11-01T10:00:00+05:30'), { sender: async () => {} }), 0, 'once a month');
  assert.equal(await monthlyTick(narrate, new Date('2026-11-02T09:00:00+05:30')), 0, 'only on the 1st');
});
