// Stripe Billing against a mock Stripe API: checkout, verification, plan change,
// cancellation, renewal/failure webhooks, signature checks and replay protection.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DEV_LOGIN = '1';
delete process.env.ANTHROPIC_API_KEY;
for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']) delete process.env[k];
Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test' });
for (const k of ['STRIPE_PRICE_SOLO', 'STRIPE_PRICE_COUPLE', 'STRIPE_PRICE_FAMILY']) delete process.env[k];

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const sessions = new Map(); const subs = new Map(); const calls = []; const prices = new Map(); const products = new Set();
const subObj = (id, priceId, customer, extra = {}) => ({
  id, object: 'subscription', customer, status: 'active', cancel_at_period_end: false,
  items: { data: [{ id: `si_${id}`, price: prices.get(priceId), current_period_end: now() + 30 * DAY }] }, ...extra,
});
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const p = Object.fromEntries(new URLSearchParams(body));
    calls.push({ method: req.method, url: req.url, p, auth: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    const send = (o) => res.end(JSON.stringify(o));
    if (req.url === '/customers') return send({ id: `cus_${calls.length}` });
    if (req.method === 'GET' && req.url.startsWith('/prices?')) {
      const key = new URL(`http://x${req.url}`).searchParams.get('lookup_keys[0]');
      return send({ data: [...prices.values()].filter((x) => x.lookup_key === key) });
    }
    if (req.method === 'POST' && req.url === '/prices') {
      const pr = { id: `price_${prices.size + 1}`, lookup_key: p.lookup_key, currency: p.currency, unit_amount: +p.unit_amount, recurring: { interval: p['recurring[interval]'] }, metadata: { plan: p['metadata[plan]'], tier: p['metadata[tier]'], interval: p['metadata[interval]'] }, options: p };
      prices.set(pr.id, pr); return send(pr);
    }
    let pm = /^\/products\/(\w+)/.exec(req.url);
    if (req.method === 'GET' && pm) return products.has(pm[1]) ? send({ id: pm[1] }) : (res.statusCode = 404, send({ error: { message: 'No such product' } }));
    if (req.method === 'POST' && req.url === '/products') { products.add(p.id); return send({ id: p.id }); }
    if (req.url === '/checkout/sessions') {
      const s = { id: `cs_test_${sessions.size + 1}`, url: `https://checkout.stripe.test/${sessions.size + 1}`, status: 'open', client_reference_id: p.client_reference_id, customer: p.customer, price: p['line_items[0][price]'], currency: p.currency, mode: 'subscription' };
      sessions.set(s.id, s); return send(s);
    }
    let m = /^\/checkout\/sessions\/(cs_\w+)/.exec(req.url);
    if (m) return sessions.has(m[1]) ? send(sessions.get(m[1])) : (res.statusCode = 404, send({ error: { message: 'no' } }));
    m = /^\/subscriptions\/(sub_\w+)/.exec(req.url);
    if (m && subs.has(m[1])) {
      const s = subs.get(m[1]);
      if (req.method === 'POST') {
        if (p['items[0][price]']) s.items.data[0].price = prices.get(p['items[0][price]']);
        if (p.cancel_at_period_end) s.cancel_at_period_end = p.cancel_at_period_end === 'true';
      }
      return send(s);
    }
    if (req.url === '/billing_portal/sessions') return send({ url: 'https://billing.stripe.test/portal' });
    res.statusCode = 404; send({ error: { message: 'not found' } });
  });
});

let server, base;
before(async () => {
  await new Promise((r) => mock.listen(0, r));
  process.env.STRIPE_API_BASE = `http://localhost:${mock.address().port}`;
  const { default: app } = await import('../src/server.js');
  await new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); });
});
after(() => { server.close(); mock.close(); });

function client() {
  let cookie = '';
  const call = async (p, opts = {}) => {
    const res = await fetch(base + p, { ...opts, headers: { ...(opts.json ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...opts.headers }, body: opts.json ? JSON.stringify(opts.json) : opts.body });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { call, post: (p, json) => call(p, { method: 'POST', json }) };
}
async function signedIn(email) { const c = client(); assert.equal((await c.post('/api/auth/dev', { email })).status, 200); return c; }
/** Simulate the customer paying on Stripe's page. */
function pay(sessionId) {
  const s = sessions.get(sessionId);
  const sub = subObj(`sub_${subs.size + 1}`, s.price, s.customer);
  subs.set(sub.id, sub);
  Object.assign(s, { status: 'complete', subscription: sub.id });
  return sub;
}
function webhook(evt, { secret = 'whsec_test', t = now() } = {}) {
  const raw = JSON.stringify(evt);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return fetch(`${base}/api/billing/stripe-webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: raw });
}

test('prices follow the visitor\'s country', async () => {
  const m = await (await fetch(`${base}/api/meta`)).json();
  assert.equal(m.billing, 'stripe');
  const at = async (q, headers = {}) => (await (await fetch(`${base}/api/pricing?${q}`, { headers })).json());
  const inr = await at('tz=Asia/Kolkata');
  assert.equal(inr.country, 'IN');
  assert.deepEqual([inr.plans.solo.currency, inr.plans.solo.amount, inr.plans.family.amount], ['INR', 49, 199]);
  assert.deepEqual([(await at('tz=Asia/Dubai')).plans.solo.currency, (await at('tz=Asia/Dubai')).plans.solo.amount], ['AED', 19]);
  assert.equal((await at('tz=Europe/Berlin')).plans.solo.currency, 'EUR');
  assert.deepEqual((await at('tz=Africa/Lagos')).plans.solo, { country: 'NG', tier: 'C', currency: 'USD', amount: 1.49, interval: 'month' });
  // Cloudflare's IP country wins over the time zone when present.
  assert.equal((await at('tz=Asia/Kolkata', { 'cf-ipcountry': 'GB' })).plans.solo.currency, 'GBP');
  // Unknown: US dollars.
  assert.equal((await at('tz=Mars/Base')).country, 'US');
});

test('world city search', async () => {
  const r = await (await fetch(`${base}/api/places?q=lond`)).json();
  assert.equal(r[0].name, 'London');
  assert.equal(r[0].tz, 'Europe/London');
  assert.ok(Number.isFinite(r[0].lat));
  assert.equal((await (await fetch(`${base}/api/places?q=a`)).json()).length, 0);
});

test('checkout, verify, plan change, portal, cancel', async () => {
  const c = await signedIn('stripe1@example.com');
  const s = await c.post('/api/billing/subscribe', { plan: 'solo', lang: 'gu', tz: 'Asia/Kolkata' });
  assert.equal(s.status, 200);
  assert.match(s.body.url, /checkout\.stripe\.test/);
  const sessionCall = calls.find((x) => x.url === '/checkout/sessions');
  assert.match(sessionCall.p.success_url, /\/gu\/\?paid=\{CHECKOUT_SESSION_ID\}$/);
  assert.equal(sessionCall.auth, 'Bearer sk_test_x');
  assert.equal(sessionCall.p.currency, 'inr');
  // The price was created automatically: USD base with each tier currency as an option.
  const created = [...prices.values()][0];
  assert.equal(created.lookup_key, 'rekha_solo_C_v1');
  assert.equal(created.unit_amount, 149);
  assert.equal(created.options['currency_options[inr][unit_amount]'], '4900');
  assert.equal(created.options['currency_options[vnd][unit_amount]'], '29000', 'zero-decimal currency');
  assert.ok(products.has('rekha_solo'));
  const sid = [...sessions.keys()].at(-1);

  // Not paid yet: cannot verify. Someone else's session: rejected.
  assert.equal((await c.post('/api/billing/verify', { sessionId: sid })).status, 400);
  const other = await signedIn('stripe-other@example.com');
  pay(sid);
  assert.equal((await other.post('/api/billing/verify', { sessionId: sid })).status, 400);

  const v = await c.post('/api/billing/verify', { sessionId: sid });
  assert.equal(v.status, 200);
  assert.equal(v.body.plan, 'solo');
  assert.equal((await c.call('/api/me')).body.plan.key, 'solo');

  // Upgrade swaps the price on the same subscription (no second checkout).
  const up = await c.post('/api/billing/subscribe', { plan: 'family', tz: 'Europe/London' });
  assert.equal(up.body.changed, true);
  // A plan change stays in the subscription's tier (and currency), wherever the user is now.
  assert.equal(subs.get(v.body.sub || [...subs.keys()][0]).items.data[0].price.lookup_key, 'rekha_family_C_v1');
  const me = (await c.call('/api/me')).body;
  assert.equal(me.plan.key, 'family');
  assert.equal(me.plan.profiles, 4);

  assert.equal((await c.post('/api/billing/portal', {})).body.url, 'https://billing.stripe.test/portal');
  const cancel = await c.post('/api/billing/cancel', {});
  assert.equal(cancel.status, 200);
  const after = (await c.call('/api/me')).body;
  assert.equal(after.plan.key, 'family', 'access continues until the period ends');
  assert.equal(after.plan.status, 'cancelling');
});

test('webhooks: checkout completes without the browser, renewal failure, cancellation, bad signatures, replays', async () => {
  const c = await signedIn('stripe2@example.com');
  const userId = (await c.call('/api/me')).body.user.id;
  const before = prices.size;
  await c.post('/api/billing/subscribe', { plan: 'couple', tz: 'Asia/Dubai' });
  assert.equal(calls.filter((x) => x.url === '/checkout/sessions').at(-1).p.currency, 'aed');
  assert.equal(prices.size, before + 1);
  await c.post('/api/billing/subscribe', { plan: 'couple', tz: 'Asia/Dubai' });
  assert.equal(prices.size, before + 1, 'prices are reused, not created again');
  const sid = [...sessions.keys()].at(-1);
  const sub = pay(sid);

  // Forged or stale signatures are refused.
  const evt = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { object: 'checkout.session', mode: 'subscription', id: sid, client_reference_id: userId, customer: sub.customer, subscription: sub.id } } };
  assert.equal((await webhook(evt, { secret: 'wrong' })).status, 400);
  assert.equal((await webhook(evt, { t: now() - 3600 })).status, 400);

  assert.equal((await webhook(evt)).status, 200);
  assert.equal((await c.call('/api/me')).body.plan.key, 'couple');
  assert.equal((await (await webhook(evt)).json()).duplicate, true);

  // Renewal fails: Stripe retries, the user keeps access during the grace period.
  sub.status = 'past_due';
  await webhook({ id: 'evt_2', type: 'invoice.payment_failed', data: { object: { object: 'invoice', subscription: sub.id } } });
  const pd = (await c.call('/api/me')).body;
  assert.equal(pd.plan.status, 'pending');
  assert.equal(pd.plan.key, 'couple');

  // Subscription ends: back to Free once the paid period is over.
  sub.status = 'canceled'; sub.items.data[0].current_period_end = now() - DAY;
  await webhook({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: sub } });
  assert.equal((await c.call('/api/me')).body.plan.key, 'free');
});

test('yearly plans: two months free, own Stripe price, switch between monthly and yearly', async () => {
  const at = async (q) => (await (await fetch(`${base}/api/pricing?${q}`)).json());
  const inr = await at('tz=Asia/Kolkata');
  assert.deepEqual([inr.yearly.solo.amount, inr.yearly.couple.amount, inr.yearly.family.amount, inr.yearly.solo.interval], [490, 990, 1990, 'year']);
  const us = await at('tz=America/New_York');
  assert.deepEqual([us.yearly.solo.amount, us.yearly.family.amount], [49.99, 149.99]);
  assert.equal((await at('tz=Asia/Kuala_Lumpur')).yearly.solo.amount, 98.99);

  const c = await signedIn('yearly@example.com');
  const s = await c.post('/api/billing/subscribe', { plan: 'couple', interval: 'year', tz: 'Asia/Kolkata' });
  assert.equal(s.status, 200);
  const yp = [...prices.values()].find((x) => x.lookup_key === 'rekha_couple_C_year_v1');
  assert.ok(yp, 'yearly price created with its own lookup key');
  assert.equal(yp.options['recurring[interval]'], 'year');
  assert.equal(yp.unit_amount, 2499, 'USD base: 24.99 a year (2.49 x 10, rounded to .99)');
  assert.equal(yp.options['currency_options[inr][unit_amount]'], '99000');
  const sid = [...sessions.values()].at(-1).id;
  pay(sid);
  assert.equal((await c.post('/api/billing/verify', { sessionId: sid })).status, 200);
  let me = (await c.call('/api/me')).body;
  assert.deepEqual([me.plan.key, me.plan.interval], ['couple', 'year']);
  // Same plan, same interval: refused. Same plan, monthly: allowed.
  assert.equal((await c.post('/api/billing/subscribe', { plan: 'couple', interval: 'year' })).status, 400);
  const sw = await c.post('/api/billing/subscribe', { plan: 'couple', interval: 'month' });
  assert.equal(sw.body.changed, true);
  me = (await c.call('/api/me')).body;
  assert.deepEqual([me.plan.key, me.plan.interval], ['couple', 'month']);
});
