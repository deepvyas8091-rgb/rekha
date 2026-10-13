// Stripe Billing: Checkout (hosted payment page) for new subscriptions, direct price
// swap for plan changes, the Stripe customer portal for cards and invoices, and a
// signed webhook that keeps renewals, failures and cancellations in sync.
// Prices come from src/pricing.js (by country) and are created in Stripe automatically:
// one product per plan, one price per plan and tier, with each tier's local currencies.
import crypto from 'node:crypto';
import express from 'express';
import { PLANS, planOf } from './plans.js';
import { setPlan, getUser, getUserBySubscription, getUserByStripeCustomer, setStripeCustomer, recordEvent } from './db.js';
import { requireUser } from './auth.js';
import { localePath } from './i18n/languages.js';
import { TIERS, PRICE_VERSION, minorUnits, priceFor, visitorCountry } from './pricing.js';

const SECRET = () => process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET;
export const stripeConfigured = () => !!SECRET();
const fail = (status, message) => Object.assign(new Error(message), { status });

/** Stripe's form encoding: { a: { b: [1] } } -> a[b][0]=1 */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}
export async function stripe(path, params, method = 'POST', { allow404 = false } = {}) {
  const url = `${process.env.STRIPE_API_BASE || 'https://api.stripe.com/v1'}${path}`;
  const res = await fetch(method === 'GET' && params ? `${url}?${form(params)}` : url, {
    method,
    headers: { authorization: `Bearer ${SECRET()}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : form(params || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && allow404) return null;
  if (!res.ok) {
    console.error('Stripe error', res.status, data?.error?.message);
    throw fail(502, 'Payment provider error');
  }
  return data;
}

const PLAN_KEYS = ['solo', 'couple', 'family'];
/** Which plan a Stripe price is for: our metadata or lookup key, or a legacy STRIPE_PRICE_* variable. */
function planFromPrice(price) {
  if (!price) return undefined;
  if (PLAN_KEYS.includes(price.metadata?.plan)) return price.metadata.plan;
  const m = /^rekha_(solo|couple|family)_/.exec(price.lookup_key || '');
  if (m) return m[1];
  return Object.keys(PLANS).find((k) => PLANS[k].envStripePrice && process.env[PLANS[k].envStripePrice] === price.id);
}
const tierFromPrice = (price) => price?.metadata?.tier || /^rekha_\w+?_([ABC])_/.exec(price?.lookup_key || '')?.[1] || null;
const priceOf = (sub) => sub?.items?.data?.[0]?.price;

// One Stripe product per plan and one price per plan and tier, created on first use.
const priceIds = new Map();
async function ensurePrice(plan, tier) {
  const key = `rekha_${plan}_${tier}_v${PRICE_VERSION}`;
  if (priceIds.has(key)) return priceIds.get(key);
  const found = await stripe('/prices', { 'lookup_keys[0]': key, active: 'true', limit: 1 }, 'GET');
  let id = found?.data?.[0]?.id;
  if (!id) {
    const productId = `rekha_${plan}`;
    if (!(await stripe(`/products/${productId}`, null, 'GET', { allow404: true }))) {
      await stripe('/products', { id: productId, name: `Rekha ${PLANS[plan].name}`, metadata: { plan } });
    }
    const amounts = TIERS[tier];
    const options = Object.fromEntries(Object.entries(amounts).filter(([cur]) => cur !== 'usd')
      .map(([cur, list]) => [cur, { unit_amount: minorUnits(list[PLAN_INDEX[plan]], cur) }]));
    const price = await stripe('/prices', {
      product: productId, currency: 'usd', unit_amount: minorUnits(amounts.usd[PLAN_INDEX[plan]], 'usd'),
      recurring: { interval: 'month' }, lookup_key: key, metadata: { plan, tier },
      currency_options: options,
    });
    id = price.id;
  }
  priceIds.set(key, id);
  return id;
}
const PLAN_INDEX = { solo: 0, couple: 1, family: 2 };

// Newer Stripe API versions keep the period on the subscription item.
const periodEnd = (sub) => (sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0) * 1000;
function statusOf(sub) {
  if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) return 'cancelled';
  if (sub.status === 'past_due') return 'pending'; // Stripe is retrying; access continues for the grace days
  if (['active', 'trialing'].includes(sub.status)) return sub.cancel_at_period_end || sub.cancel_at ? 'cancelling' : 'active';
  return null; // incomplete: not paid yet, change nothing
}
/** Apply a Stripe subscription to the user who owns it. Ignores old, replaced subscriptions. */
function applySubscription(user, sub) {
  if (!user || (user.subscription_id && user.subscription_id !== sub.id)) return false;
  const status = statusOf(sub);
  if (!status) return false;
  setPlan(user.id, { plan: planFromPrice(priceOf(sub)) || undefined, status, renewsAt: periodEnd(sub) || undefined, subscriptionId: sub.id });
  return true;
}

/** Verify Stripe-Signature: t=<time>,v1=<hmac of "t.body">, within 5 minutes. */
export function verifyStripeSignature(raw, header, secret, now = Date.now()) {
  if (!secret || !header) return false;
  const t = Number(header.match(/(?:^|,)t=(\d+)/)?.[1]);
  const sigs = [...header.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map((m) => m[1]);
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

export function stripeWebhookRoute(app) {
  app.post('/api/billing/stripe-webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!verifyStripeSignature(raw, req.get('stripe-signature'), WEBHOOK_SECRET())) return res.status(400).json({ error: 'bad signature' });
    const evt = JSON.parse(raw);
    const obj = evt.data?.object || {};
    const subId = obj.object === 'subscription' ? obj.id : obj.subscription || obj.parent?.subscription_details?.subscription;
    if (!recordEvent(evt.id, evt.type, subId || null, raw)) return res.json({ ok: true, duplicate: true });
    try {
      if (evt.type === 'checkout.session.completed' && obj.mode === 'subscription' && obj.subscription) {
        const user = getUser(obj.client_reference_id || obj.metadata?.user_id || '');
        if (user) {
          if (obj.customer) setStripeCustomer(user.id, obj.customer);
          const sub = await stripe(`/subscriptions/${obj.subscription}`, null, 'GET');
          if (!user.subscription_id || user.subscription_id === sub.id || planOf(user) === PLANS.free) {
            setPlan(user.id, { subscriptionId: sub.id });
            applySubscription(getUser(user.id), sub);
          }
        }
      } else if (evt.type.startsWith('customer.subscription.')) {
        const user = getUserBySubscription(obj.id) || getUserByStripeCustomer(obj.customer);
        applySubscription(user, obj);
      } else if ((evt.type === 'invoice.paid' || evt.type === 'invoice.payment_failed') && subId) {
        // Renewals: re-read the subscription for its new status and period.
        const user = getUserBySubscription(subId);
        if (user) applySubscription(user, await stripe(`/subscriptions/${subId}`, null, 'GET'));
      }
    } catch (e) { console.error('Stripe webhook', evt.type, e.message); return res.status(500).json({ error: 'retry' }); }
    res.json({ ok: true });
  });
}

const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const CHECKOUT_LOCALES = new Set(['en', 'th', 'vi', 'id', 'ms', 'tl', 'zh']);

export function stripeJsonRoutes(app) {
  // New subscription: a Stripe Checkout page. Plan change on an existing subscription: swap the price.
  app.post('/api/billing/subscribe', requireUser, async (req, res, next) => {
    try {
      const key = req.body.plan;
      if (!PLAN_KEYS.includes(key)) throw fail(400, 'Unknown plan');
      const user = getUser(req.user.id);
      const lang = typeof req.body.lang === 'string' && /^[a-z]{2}$/.test(req.body.lang) ? req.body.lang : 'en';

      if (user.subscription_id && planOf(user) !== PLANS.free && ['active', 'pending'].includes(user.plan_status)) {
        const sub = await stripe(`/subscriptions/${user.subscription_id}`, null, 'GET');
        // Same tier (and so the same currency) as the current subscription.
        const tier = tierFromPrice(priceOf(sub)) || priceFor(key, visitorCountry(req, req.body.tz)).tier;
        const price = await ensurePrice(key, tier);
        const updated = await stripe(`/subscriptions/${sub.id}`, {
          items: { 0: { id: sub.items.data[0].id, price } }, proration_behavior: 'always_invoice', cancel_at_period_end: false,
          metadata: { user_id: user.id, plan: key },
        });
        applySubscription(user, updated);
        return res.json({ changed: true, plan: key });
      }

      let customer = user.stripe_customer_id;
      if (!customer) {
        const c = await stripe('/customers', { email: user.email || undefined, name: user.name || undefined, phone: user.phone || undefined, metadata: { user_id: user.id } });
        customer = c.id; setStripeCustomer(user.id, customer);
      }
      const local = priceFor(key, visitorCountry(req, req.body.tz));
      const price = await ensurePrice(key, local.tier);
      const back = `${baseUrl(req)}${localePath(lang, '/')}`;
      const session = await stripe('/checkout/sessions', {
        mode: 'subscription', customer, client_reference_id: user.id, currency: local.currency.toLowerCase(),
        line_items: { 0: { price, quantity: 1 } },
        subscription_data: { metadata: { user_id: user.id, plan: key, country: local.country } },
        metadata: { user_id: user.id, plan: key, country: local.country },
        allow_promotion_codes: 'true',
        locale: CHECKOUT_LOCALES.has(lang) ? (lang === 'tl' ? 'fil' : lang) : 'auto',
        success_url: `${back}?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: `${back}?tab=today`,
      });
      res.json({ url: session.url });
    } catch (e) { next(e); }
  });

  // Back from Checkout: confirm straight away (the webhook also does this, for when the browser closes).
  app.post('/api/billing/verify', requireUser, async (req, res, next) => {
    try {
      const id = String(req.body.sessionId || '');
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw fail(400, 'Payment could not be verified');
      const s = await stripe(`/checkout/sessions/${id}`, null, 'GET');
      if (s.client_reference_id !== req.user.id || s.status !== 'complete' || !s.subscription) throw fail(400, 'Payment could not be verified');
      const sub = await stripe(`/subscriptions/${s.subscription}`, null, 'GET');
      setPlan(req.user.id, { subscriptionId: sub.id });
      if (!applySubscription(getUser(req.user.id), sub)) throw fail(400, 'Payment is not complete yet');
      res.json({ ok: true, plan: planFromPrice(priceOf(sub)) });
    } catch (e) { next(e); }
  });

  app.post('/api/billing/cancel', requireUser, async (req, res, next) => {
    try {
      const u = getUser(req.user.id);
      if (!u.subscription_id) throw fail(400, 'No active subscription');
      const sub = await stripe(`/subscriptions/${u.subscription_id}`, { cancel_at_period_end: 'true' });
      applySubscription(u, sub); // keeps access until the paid period ends
      res.json({ ok: true, accessUntil: periodEnd(sub) });
    } catch (e) { next(e); }
  });

  // Stripe's own page to change card, see invoices and download receipts.
  app.post('/api/billing/portal', requireUser, async (req, res, next) => {
    try {
      const u = getUser(req.user.id);
      if (!u.stripe_customer_id) throw fail(400, 'No active subscription');
      const s = await stripe('/billing_portal/sessions', { customer: u.stripe_customer_id, return_url: `${baseUrl(req)}/` });
      res.json({ url: s.url });
    } catch (e) { next(e); }
  });
}
