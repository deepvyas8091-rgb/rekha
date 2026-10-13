// Plans and fair-use limits. Change prices here and in the payment dashboard (Stripe or Razorpay).
// Limits are per profile per calendar month, multiplied by the plan's profiles.

export const PLANS = {
  free: {
    name: 'Free', priceInr: 0, profiles: 1,
    limits: { palm: 1, reading: 1, chat: 3, match: 0, daily: 0 },
    personal: false,
  },
  solo: {
    name: 'Solo', priceInr: 49, profiles: 1, envPlanId: 'RZP_PLAN_SOLO', envStripePrice: 'STRIPE_PRICE_SOLO',
    limits: { palm: 4, reading: 4, chat: 60, match: 10, daily: 31 },
    personal: true,
  },
  couple: {
    name: 'Couple', priceInr: 99, profiles: 2, envPlanId: 'RZP_PLAN_COUPLE', envStripePrice: 'STRIPE_PRICE_COUPLE',
    limits: { palm: 4, reading: 4, chat: 60, match: 10, daily: 31 },
    personal: true,
  },
  family: {
    name: 'Family', priceInr: 199, profiles: 4, envPlanId: 'RZP_PLAN_FAMILY', envStripePrice: 'STRIPE_PRICE_FAMILY',
    limits: { palm: 4, reading: 4, chat: 60, match: 10, daily: 31 },
    personal: true,
  },
};

// What each plan includes, shown on the pricing screen.
export const FEATURES = {
  free: [
    "Today's Choghadiya, Rahu Kaal, Hora and best times",
    'Daily Panchang and festival calendar',
    'Your kundli: planets, dasha, Sade Sati, Manglik',
    'Kundli matching score (36 gun)',
    '1 AI palm scan and a short AI reading each month',
    'Face reading (runs on your phone)',
  ],
  paid: [
    'Personal day rating and your own best times every day',
    'Daily AI guidance in your language',
    'Good-days calendar personalised to your chart',
    'Full palm + face + chart reading, refreshed monthly',
    'Ask Rekha: up to 60 questions a month per person',
    'Detailed matching explanation',
  ],
};

export function planOf(user) {
  if (!user) return PLANS.free;
  const paidUntil = user.plan_renews_at || 0;
  const grace = 3 * 86400000; // keep access while the payment provider retries a failed renewal
  const active = user.plan !== 'free' && (
    (['active', 'authenticated', 'cancelling', 'pending'].includes(user.plan_status) && paidUntil > Date.now() - grace)
    // Cancelled or halted users keep what they already paid for.
    || (['cancelled', 'halted'].includes(user.plan_status) && paidUntil > Date.now()));
  return active ? PLANS[user.plan] || PLANS.free : PLANS.free;
}

export function planKey(user) {
  const p = planOf(user);
  return Object.keys(PLANS).find((k) => PLANS[k] === p);
}

export function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

/** prices: optional { planKey: { amount, currency, interval } } read from the payment provider. */
export function publicPlans(prices = {}) {
  return Object.entries(PLANS).map(([key, p]) => ({
    key, name: p.name, priceInr: p.priceInr, profiles: p.profiles, price: prices[key] || null,
    features: key === 'free' ? FEATURES.free : [`${p.profiles} ${p.profiles === 1 ? 'profile' : 'profiles'}`, ...FEATURES.paid],
  }));
}
