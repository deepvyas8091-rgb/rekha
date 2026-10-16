// Daily timing alerts: subscribe, what is due when, once a day, gone subscriptions removed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;
const push = await import('../src/push.js');
const { goodBadTimes } = await import('../src/engine/index.js');
const { default: app } = await import('../src/server.js');

const sent = [];
app.locals.pushSender = async (sub, payload) => { sent.push({ sub, payload: JSON.parse(payload) }); };
let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => server.close());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const subscription = (n) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'BPk', auth: 'au' } });
const mumbai = { lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', name: 'Mumbai' };
// 2026-10-12 local time in Mumbai (UTC+5:30) as a Date.
const at = (hhmm) => new Date(`2026-10-12T${hhmm}:00+05:30`);

test('public key and subscribe, with a confirmation notification in the chosen language', async () => {
  const k = await (await fetch(`${base}/api/push/key`)).json();
  assert.match(k.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  const r = await post('/api/push/subscribe', { subscription: subscription(1), place: mumbai, lang: 'hi', morning: '07:00', rahu: true, confirm: true });
  assert.equal(r.status, 200);
  assert.equal(sent.at(-1).payload.title, 'अलर्ट चालू हैं');
  assert.equal((await post('/api/push/subscribe', { subscription: { endpoint: 'http://x' }, place: mumbai })).status, 400);
  assert.equal((await post('/api/push/subscribe', { subscription: subscription(2), place: { ...mumbai, tz: 'Nowhere/Here' } })).status, 400);
});

test('morning summary and 10-minute Rahu Kaal reminder, each once a day', async () => {
  push.saveSubscription({ subscription: subscription(3), place: mumbai, lang: 'en', morning: '07:00', rahu: true });
  const rk = goodBadTimes('2026-10-12', mumbai.lat, mumbai.lon, mumbai.tz, {}).badTimes.find((b) => b.name === 'Rahu Kaal');
  const out = [];
  const sender = async (sub, payload) => { if (sub.endpoint.endsWith('/3')) out.push(JSON.parse(payload)); };
  await push.pushTick(at('06:59'), sender);
  assert.equal(out.length, 0);
  await push.pushTick(at('07:02'), sender);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Today in Mumbai');
  assert.match(out[0].body, new RegExp(`Rahu Kaal ${rk.start}–${rk.end}`));
  await push.pushTick(at('07:10'), sender);
  assert.equal(out.length, 1, 'not sent twice');
  const [h, m] = rk.start.split(':').map(Number);
  const before = `${String(Math.floor((h * 60 + m - 5) / 60)).padStart(2, '0')}:${String((h * 60 + m - 5) % 60).padStart(2, '0')}`;
  await push.pushTick(at(before), sender);
  assert.equal(out.length, 2);
  assert.equal(out[1].title, `Rahu Kaal starts at ${rk.start}`);
  assert.equal(out[1].url, '/?tab=today');
  await push.pushTick(at(before), sender);
  assert.equal(out.length, 2);
});

test('a subscription the browser has dropped (410) is removed', async () => {
  push.saveSubscription({ subscription: subscription(4), place: mumbai, lang: 'en', morning: '07:00', rahu: false });
  const n = push.countSubscriptions();
  await push.pushTick(at('07:05'), async (sub) => { if (sub.endpoint.endsWith('/4')) throw Object.assign(new Error('gone'), { statusCode: 410 }); });
  assert.equal(push.countSubscriptions(), n - 1);
  assert.equal((await post('/api/push/unsubscribe', { endpoint: subscription(3).endpoint })).status, 200);
  assert.equal(push.countSubscriptions(), n - 2);
});
