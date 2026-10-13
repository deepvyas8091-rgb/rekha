// End-to-end API tests in demo mode with a mock Razorpay server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DEV_LOGIN = '1';
delete process.env.ANTHROPIC_API_KEY;
Object.assign(process.env, {
  RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'test_secret', RAZORPAY_WEBHOOK_SECRET: 'wh_secret',
  RZP_PLAN_SOLO: 'plan_solo', RZP_PLAN_COUPLE: 'plan_couple', RZP_PLAN_FAMILY: 'plan_family', ADMIN_TOKEN: 'admin123',
});

// Mock Razorpay: create, fetch and cancel subscriptions.
const subs = new Map();
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/subscriptions') {
      const b = JSON.parse(body);
      const s = { id: `sub_${subs.size + 1}`, plan_id: b.plan_id, status: 'created', current_end: Math.floor(Date.now() / 1000) + 30 * 86400, notes: b.notes };
      subs.set(s.id, s); return res.end(JSON.stringify(s));
    }
    const m = /^\/subscriptions\/(sub_\d+)(\/cancel)?$/.exec(req.url);
    if (m && subs.has(m[1])) {
      if (m[2]) subs.get(m[1]).status = 'cancelled';
      return res.end(JSON.stringify(subs.get(m[1])));
    }
    res.statusCode = 404; res.end('{}');
  });
});

let server, base;
before(async () => {
  await new Promise((r) => mock.listen(0, r));
  process.env.RAZORPAY_API_BASE = `http://localhost:${mock.address().port}`;
  const { default: app } = await import('../src/server.js');
  await new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); });
});
after(() => { server.close(); mock.close(); });

const loc = 'lat=22.3072&lon=73.1812&tz=Asia/Kolkata';
const birth = { date: '1990-05-15', time: '08:30', lat: 23.0225, lon: 72.5714, tz: 'Asia/Kolkata' };
function client() {
  let cookie = '';
  const call = async (p, opts = {}) => {
    const res = await fetch(base + p, { ...opts, headers: { ...(opts.json ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...opts.headers }, body: opts.json ? JSON.stringify(opts.json) : opts.body });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { call, post: (p, json) => call(p, { method: 'POST', json }) };
}
async function signedIn(email) {
  const c = client();
  assert.equal((await c.post('/api/auth/dev', { email })).status, 200);
  return c;
}

test('free tools work without signing in', async () => {
  const c = client();
  const t = await c.call(`/api/timings?${loc}&date=2026-10-12`);
  assert.equal(t.body.choghadiya.day.length, 8);
  const p = await c.call(`/api/panchang?${loc}&date=2026-10-12`);
  assert.equal(p.body.tithi[0].name, 'Dwitiya');
  const m = await c.post('/api/match', { boy: birth, girl: { ...birth, date: '1992-02-10' } });
  assert.ok(m.body.gunMilan.total >= 0);
  assert.equal((await c.post('/api/profile', { birth })).body.vedic.planets.length, 9);
});

test('AI features need sign-in', async () => {
  const c = client();
  assert.equal((await c.post('/api/reading', { profileId: 'x' })).status, 401);
  assert.equal((await c.post('/api/ask', { question: 'hi' })).status, 401);
});

test('free plan: one profile, one reading, personal times locked', async () => {
  const c = await signedIn('free@example.com');
  const p1 = await c.post('/api/profiles', { name: 'Me', birth });
  assert.equal(p1.status, 200);
  assert.ok(p1.body.natal.nakshatra);
  const p2 = await c.post('/api/profiles', { name: 'Wife', birth });
  assert.equal(p2.status, 402);
  assert.equal(p2.body.code, 'upgrade');

  const r1 = await c.post('/api/reading', { profileId: p1.body.id, language: 'hi' });
  assert.equal(r1.status, 200);
  const r2 = await c.post('/api/reading', { profileId: p1.body.id });
  assert.equal(r2.status, 402);

  const t = await c.call(`/api/timings?${loc}&profile=${p1.body.id}`);
  assert.equal(t.body.personalLocked, true);
  assert.equal(t.body.personal, null);
  assert.equal((await c.call(`/api/daily/${p1.body.id}?${loc}`)).status, 402);
});

test('subscribe to Couple: payment verified, 2 profiles, personal times unlocked', async () => {
  const c = await signedIn('couple@example.com');
  const s = await c.post('/api/billing/subscribe', { plan: 'couple' });
  assert.equal(s.status, 200);
  assert.equal(s.body.keyId, 'rzp_test_key');

  // A forged signature is rejected.
  assert.equal((await c.post('/api/billing/verify', { razorpay_payment_id: 'pay_1', razorpay_signature: 'bad' })).status, 400);
  const sig = crypto.createHmac('sha256', 'test_secret').update(`pay_1|${s.body.subscriptionId}`).digest('hex');
  const v = await c.post('/api/billing/verify', { razorpay_payment_id: 'pay_1', razorpay_signature: sig });
  assert.equal(v.status, 200);
  assert.equal(v.body.plan, 'couple');

  const me = await c.call('/api/me');
  assert.equal(me.body.plan.key, 'couple');
  assert.equal(me.body.allowance.reading.max, 8);
  const a = await c.post('/api/profiles', { name: 'Me', birth });
  const b = await c.post('/api/profiles', { name: 'Partner', relation: 'spouse', birth: { ...birth, date: '1992-02-10' } });
  assert.equal(b.status, 200);
  assert.equal((await c.post('/api/profiles', { name: 'Third', birth })).status, 402);

  const t = await c.call(`/api/timings?${loc}&profile=${a.body.id}`);
  assert.ok(t.body.personal.dayRating);
  const d1 = await c.call(`/api/daily/${b.body.id}?${loc}&language=gu`);
  assert.equal(d1.status, 200);
  const d2 = await c.call(`/api/daily/${b.body.id}?${loc}&language=gu`);
  assert.equal(d2.body.cached, true);
  const ask = await c.post('/api/ask', { profileId: a.body.id, question: 'What about my career?' });
  assert.equal(ask.status, 200);
  const m = await c.post('/api/match', { boy: a.body.birth, girl: b.body.birth, narrate: true });
  assert.ok(m.body.reading);
});

test('webhook: bad signature rejected; cancellation keeps paid days then downgrades', async () => {
  const c = await signedIn('solo@example.com');
  const s = await c.post('/api/billing/subscribe', { plan: 'solo' });
  const sig = crypto.createHmac('sha256', 'test_secret').update(`pay_9|${s.body.subscriptionId}`).digest('hex');
  await c.post('/api/billing/verify', { razorpay_payment_id: 'pay_9', razorpay_signature: sig });

  const send = (evt, secret = 'wh_secret', id = crypto.randomUUID()) => {
    const raw = JSON.stringify(evt);
    return fetch(`${base}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': crypto.createHmac('sha256', secret).update(raw).digest('hex'), 'x-razorpay-event-id': id }, body: raw });
  };
  const entity = (status, endSec) => ({ id: s.body.subscriptionId, plan_id: 'plan_solo', status, current_end: endSec });
  assert.equal((await send({ event: 'subscription.charged', payload: { subscription: { entity: entity('active', 1) } } }, 'wrong')).status, 400);

  // Renewal charged: renews date moves forward.
  const future = Math.floor(Date.now() / 1000) + 20 * 86400;
  assert.equal((await send({ event: 'subscription.charged', payload: { subscription: { entity: entity('active', future) } } }, 'wh_secret', 'evt_1')).status, 200);
  const dup = await send({ event: 'subscription.charged', payload: { subscription: { entity: entity('active', future) } } }, 'wh_secret', 'evt_1');
  assert.equal((await dup.json()).duplicate, true);

  // Cancelled with paid days left: still Solo.
  await send({ event: 'subscription.cancelled', payload: { subscription: { entity: entity('cancelled', future) } } });
  assert.equal((await c.call('/api/me')).body.plan.key, 'solo');
  // Paid period over: back to Free.
  await send({ event: 'subscription.cancelled', payload: { subscription: { entity: entity('cancelled', Math.floor(Date.now() / 1000) - 10) } } });
  assert.equal((await c.call('/api/me')).body.plan.key, 'free');
});

test('plan change: upgrading cancels the old subscription', async () => {
  const c = await signedIn('upgrade@example.com');
  const pay = async (plan, pid) => {
    const s = await c.post('/api/billing/subscribe', { plan });
    const sig = crypto.createHmac('sha256', 'test_secret').update(`${pid}|${s.body.subscriptionId}`).digest('hex');
    await c.post('/api/billing/verify', { razorpay_payment_id: pid, razorpay_signature: sig });
    return s.body.subscriptionId;
  };
  const first = await pay('solo', 'pay_a');
  await pay('family', 'pay_b');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(subs.get(first).status, 'cancelled');
  assert.equal((await c.call('/api/me')).body.plan.key, 'family');
  assert.equal((await c.call('/api/me')).body.plan.profiles, 4);
});

test('account deletion removes data', async () => {
  const c = await signedIn('delete@example.com');
  await c.post('/api/profiles', { name: 'Me', birth });
  assert.equal((await c.call('/api/me', { method: 'DELETE' })).status, 200);
  assert.equal((await c.call('/api/me')).body.user, null);
});

test('owner dashboard needs the admin token', async () => {
  const c = client();
  assert.equal((await c.call('/api/admin/stats')).status, 403);
  const s = await c.call('/api/admin/stats', { headers: { 'x-admin-token': 'admin123' } });
  assert.ok(s.body.users >= 4);
  assert.ok(s.body.mrrInr >= 99);
});

test('palm geometry is free; distress gets support; bad input is 400', async () => {
  const c = await signedIn('misc@example.com');
  const lm = Array.from({ length: 21 }, (_, i) => ({ x: 0.5, y: 0.9 - i * 0.03 }));
  [[5, 0.38], [9, 0.46], [13, 0.54], [17, 0.62]].forEach(([i, x]) => { for (let j = 0; j < 4; j++) lm[i + j] = { x, y: 0.55 - j * 0.07 }; });
  for (let j = 1; j < 5; j++) lm[j] = { x: 0.3 - j * 0.02, y: 0.8 - j * 0.06 };
  const fd = new FormData(); fd.append('landmarks', JSON.stringify(lm));
  const r = await c.call('/api/palm', { method: 'POST', body: fd });
  assert.ok(['Earth', 'Air', 'Fire', 'Water'].includes(r.body.geometry.handType));
  const p = await c.post('/api/profiles', { name: 'Me', birth });
  const d = await c.post('/api/ask', { profileId: p.body.id, question: 'I want to end my life' });
  assert.equal(d.body.support, true);
  assert.equal((await c.call('/api/timings?lat=abc')).status, 400);
});
