// Prices by country. Three tiers by purchasing power; key markets pay round amounts in
// their own currency, every other country pays the tier's US dollar price.
// To change prices: edit the numbers below and bump PRICE_VERSION. New Stripe prices are
// created automatically on the next start; existing subscribers keep what they pay.
import cityTimezones from 'city-timezones';

export const PRICE_VERSION = 1;
export const INTERVALS = ['month', 'year'];
// Yearly = 10 months' price (two months free), rounded to a normal-looking amount.
export const YEAR_MONTHS = 10;

// [solo, couple, family] per currency, in normal units (₹49, not paise).
export const TIERS = {
  A: { usd: [4.99, 8.99, 14.99], gbp: [3.99, 6.99, 11.99], eur: [4.49, 7.99, 13.49], aed: [19, 35, 55], sar: [19, 35, 55], qar: [19, 35, 55],
    cad: [6.49, 11.99, 19.99], aud: [7.49, 13.49, 22.99], nzd: [7.99, 14.99, 24.99], sgd: [6.49, 11.99, 19.99], hkd: [38, 68, 118],
    jpy: [750, 1300, 2200], chf: [4.49, 7.99, 13.49] },
  B: { usd: [2.99, 4.99, 7.99], myr: [9.90, 16.90, 26.90], thb: [89, 149, 249], zar: [39, 69, 119], mxn: [49, 89, 139], brl: [14.90, 24.90, 39.90] },
  C: { usd: [1.49, 2.49, 3.99], inr: [49, 99, 199], idr: [19000, 35000, 59000], php: [79, 139, 229], vnd: [29000, 49000, 79000],
    pkr: [349, 599, 999], bdt: [149, 249, 399], lkr: [399, 699, 1199], npr: [179, 299, 499], egp: [59, 99, 169], kes: [179, 299, 499] },
};
const PLAN_INDEX = { solo: 0, couple: 1, family: 2 };

const A = 'US CA GB IE AU NZ SG HK MO JP KR TW CH LI NO IS DK SE FI DE AT NL BE LU FR MC IT SM VA ES AD PT MT CY GR SI EE LV LT CZ SK AE SA QA KW BH OM IL BN';
const C = 'IN PK BD NP LK BT MV AF ID PH VN KH LA MM TL EG NG KE GH TZ UG ET RW ZM ZW MW MZ CM CI SN ML BF NE TD BJ TG SL LR GN GW GM MR SD SS SO DJ ER BI CD CG CF MG KM LS SZ AO HT NI HN BO KG TJ UZ YE SY PS';
const TIER_OF = Object.fromEntries([...A.split(' ').map((c) => [c, 'A']), ...C.split(' ').map((c) => [c, 'C'])]); // everything else: B
const EURO = 'IE DE AT NL BE LU FR MC IT SM VA ES AD PT MT CY GR SI EE LV LT SK FI';
const CURRENCY_OF = {
  ...Object.fromEntries(EURO.split(' ').map((c) => [c, 'eur'])),
  US: 'usd', GB: 'gbp', AE: 'aed', SA: 'sar', QA: 'qar', CA: 'cad', AU: 'aud', NZ: 'nzd', SG: 'sgd', HK: 'hkd', JP: 'jpy', CH: 'chf', LI: 'chf',
  MY: 'myr', TH: 'thb', ZA: 'zar', MX: 'mxn', BR: 'brl',
  IN: 'inr', ID: 'idr', PH: 'php', VN: 'vnd', PK: 'pkr', BD: 'bdt', LK: 'lkr', NP: 'npr', EG: 'egp', KE: 'kes',
};
const ZERO_DECIMAL = new Set(['jpy', 'vnd', 'krw', 'clp']);
export const minorUnits = (amount, cur) => Math.round(ZERO_DECIMAL.has(cur) ? amount : amount * 100);

/** A yearly amount from a monthly one: 4.99 -> 49.99, 49 -> 490, 19000 -> 190000. */
export function yearlyAmount(monthly, cur) {
  const y = monthly * YEAR_MONTHS;
  if (ZERO_DECIMAL.has(cur) || Number.isInteger(monthly)) return Math.round(y);
  return +(Math.ceil(y - 1e-9) - 0.01).toFixed(2);
}
/** Amount in normal units for a plan, tier and currency (lowercase), per month or per year. */
export function amountOf(plan, tier, cur, interval = 'month') {
  const m = TIERS[tier][cur][PLAN_INDEX[plan]];
  return interval === 'year' ? yearlyAmount(m, cur) : m;
}

export const tierOf = (country) => TIER_OF[country] || 'B';
/** The price a visitor from this country sees: { country, tier, currency, amount, interval }. */
export function priceFor(plan, country, interval = 'month') {
  const tier = tierOf(country);
  const local = CURRENCY_OF[country];
  const currency = local && TIERS[tier][local] ? local : 'usd';
  const iv = interval === 'year' ? 'year' : 'month';
  return { country, tier, currency: currency.toUpperCase(), amount: amountOf(plan, tier, currency, iv), interval: iv };
}

// ---- where the visitor is ----------------------------------------------------------
// Time zone to country, from the bundled world city list (biggest city per zone wins).
const TZ_COUNTRY = (() => {
  const best = {};
  for (const c of cityTimezones.cityMapping) {
    if (!c.timezone || !c.iso2) continue;
    if (!best[c.timezone] || c.pop > best[c.timezone].pop) best[c.timezone] = { iso2: c.iso2, pop: c.pop };
  }
  return Object.fromEntries(Object.entries(best).map(([tz, v]) => [tz, v.iso2]));
})();
TZ_COUNTRY['Asia/Calcutta'] = 'IN'; TZ_COUNTRY['Asia/Saigon'] = 'VN'; TZ_COUNTRY['Asia/Katmandu'] = 'NP';
export const countryOfTz = (tz) => TZ_COUNTRY[tz] || null;

/**
 * Country for pricing: Cloudflare's IP country if the site runs through Cloudflare's proxy,
 * else the browser's time zone, else the browser language's region, else the US.
 */
export function visitorCountry(req, tz) {
  const cf = req.get('cf-ipcountry');
  if (cf && /^[A-Z]{2}$/.test(cf) && cf !== 'XX' && cf !== 'T1') return cf;
  const fromTz = tz && countryOfTz(String(tz));
  if (fromTz) return fromTz;
  const region = /[-_]([A-Z]{2})\b/.exec(req.get('accept-language') || '')?.[1];
  return region || 'US';
}
