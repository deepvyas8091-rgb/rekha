// Payments. Two providers, one at a time:
//   Stripe   (src/stripe.js) when STRIPE_SECRET_KEY is set: good for starting out.
//   Razorpay (this file) otherwise: UPI and Indian cards at Indian rates, needs an Indian business.
// PAYMENT_PROVIDER=razorpay|stripe forces one. Switching later keeps existing users' plans.
// Razorpay plans (₹49 / ₹99 / ₹199 monthly) are created in its dashboard; their IDs go
// in RZP_PLAN_SOLO / _COUPLE / _FAMILY.
import crypto from 'node:crypto';
import express from 'express';
import { PLANS, planOf } from './plans.js';
import { setPlan, getUserBySubscription, recordEvent, getUser } from './db.js';
import { requireUser } from './auth.js';
import { stripeConfigured, stripeWebhookRoute, stripeJsonRoutes } from './stripe.js';

const KEY_ID = () => process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = () => process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = () => process.env.RAZORPAY_WEBHOOK_SECRET;
const razorpayConfigured = () => !!(KEY_ID() && KEY_SECRET());
/** 'stripe', 'razorpay' or null (payments off). */
export function paymentProvider() {
  const forced = process.env.PAYMENT_PROVIDER;
  if (forced === 'razorpay') return razorpayConfigured() ? 'razorpay' : null;
  if (forced === 'stripe' || stripeConfigured()) return stripeConfigured() ? 'stripe' : null;
  return razorpayConfigured() ? 'razorpay' : null;
}
export const billingConfigured = () => paymentProvider();

function hmacHex(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest('hex'); }
function safeEq(a, b) { return typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }

async function rzp(path, body, method = 'POST') {
  const res = await fetch(`${process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1'}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${KEY_ID()}:${KEY_SECRET()}`).toString('base64')}` },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.description || 'Payment provider error'), { status: 502 });
  return data;
}

const planFromRzpId = (rzpPlanId) => Object.keys(PLANS).find((k) => PLANS[k].envPlanId && process.env[PLANS[k].envPlanId] === rzpPlanId);

// Map Razorpay subscription states to ours.
const STATUS = {
  authenticated: 'authenticated', active: 'active', charged: 'active', activated: 'active', resumed: 'active',
  pending: 'pending', halted: 'halted', paused: 'halted', cancelled: 'cancelled', completed: 'cancelled', expired: 'cancelled',
};

export function billingRoutes(app) {
  stripeWebhookRoute(app);
  // Webhook needs the raw body for signature checks, so it is registered before express.json().
  app.post('/api/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!WEBHOOK_SECRET() || !safeEq(hmacHex(WEBHOOK_SECRET(), raw), req.get('x-razorpay-signature'))) {
      return res.status(400).json({ error: 'bad signature' });
    }
    const evt = JSON.parse(raw);
    const sub = evt?.payload?.subscription?.entity;
    const eventId = req.get('x-razorpay-event-id') || hmacHex('id', raw);
    if (!recordEvent(eventId, evt.event, sub?.id, raw)) return res.json({ ok: true, duplicate: true });
    if (sub?.id) {
      const user = getUserBySubscription(sub.id);
      // Events for a replaced (old) subscription must not touch the current plan.
      if (user && user.subscription_id === sub.id) {
        const action = evt.event.split('.')[1];
        const status = STATUS[action] || STATUS[sub.status] || null;
        if (status) {
          setPlan(user.id, {
            plan: planFromRzpId(sub.plan_id) || undefined,
            status,
            renewsAt: sub.current_end ? sub.current_end * 1000 : undefined,
            subscriptionId: sub.id,
          });
        }
      }
    }
    res.json({ ok: true });
  });
}

export function billingJsonRoutes(app) {
  if (paymentProvider() === 'stripe') { stripeJsonRoutes(app); return; }
  // Start a subscription: returns what Razorpay Checkout needs in the browser.
  app.post('/api/billing/subscribe', requireUser, async (req, res, next) => {
    try {
      const key = req.body.plan;
      const plan = PLANS[key];
      if (!plan || !plan.envPlanId) throw Object.assign(new Error('Unknown plan'), { status: 400 });
      if (req.body.interval === 'year') throw Object.assign(new Error('Yearly plans are not available yet. Please choose monthly.'), { status: 400 });
      if (!razorpayConfigured() || !process.env[plan.envPlanId]) throw Object.assign(new Error('Payments are not set up yet'), { status: 501 });
      const sub = await rzp('/subscriptions', {
        plan_id: process.env[plan.envPlanId],
        total_count: 120, // monthly for up to 10 years, cancellable any time
        customer_notify: true,
        notes: { user_id: req.user.id, plan: key },
      });
      // An existing paid subscription is cancelled once the new one is paid (plan change).
      const prev = planOf(req.user) !== PLANS.free ? req.user.subscription_id : null;
      setPlan(req.user.id, { subscriptionId: sub.id, prevSubscriptionId: prev });
      res.json({ keyId: KEY_ID(), subscriptionId: sub.id, plan: key, name: plan.name, priceInr: plan.priceInr, email: req.user.email, userName: req.user.name });
    } catch (e) { next(e); }
  });

  // Checkout success handler: verify signature, then activate immediately
  // (the webhook confirms later and keeps renewals in sync).
  app.post('/api/billing/verify', requireUser, async (req, res, next) => {
    try {
      const { razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
      const subId = getUser(req.user.id).subscription_id; // use our stored id, not the client's
      if (!subId || !safeEq(hmacHex(KEY_SECRET(), `${pid}|${subId}`), sig)) throw Object.assign(new Error('Payment could not be verified'), { status: 400 });
      // The plan comes from Razorpay, never from the browser.
      const sub = await rzp(`/subscriptions/${subId}`, null, 'GET');
      const plan = planFromRzpId(sub.plan_id);
      if (!plan) throw Object.assign(new Error('Unknown plan on subscription'), { status: 400 });
      const prev = getUser(req.user.id).prev_subscription_id;
      setPlan(req.user.id, { plan, status: 'active', renewsAt: sub.current_end ? sub.current_end * 1000 : Date.now() + 31 * 86400000, prevSubscriptionId: null });
      if (prev && prev !== subId) rzp(`/subscriptions/${prev}/cancel`, { cancel_at_cycle_end: false }).catch((e) => console.error('cancel previous failed', e.message));
      res.json({ ok: true, plan });
    } catch (e) { next(e); }
  });

  app.post('/api/billing/cancel', requireUser, async (req, res, next) => {
    try {
      const u = getUser(req.user.id);
      if (!u.subscription_id) throw Object.assign(new Error('No active subscription'), { status: 400 });
      await rzp(`/subscriptions/${u.subscription_id}/cancel`, { cancel_at_cycle_end: true });
      setPlan(u.id, { status: 'cancelling' }); // keeps access until the paid period ends
      res.json({ ok: true, accessUntil: u.plan_renews_at });
    } catch (e) { next(e); }
  });
}
