// Which public pages search engines are invited to index.
//
// Every page still works for visitors in every language. But a young site that offers Google tens
// of thousands of near-identical city pages in 15 languages gets treated as filler (it happened in
// November 2026), so only pages with a real audience are indexable and listed in the sitemaps:
//   - pages without a city (home, hubs, articles, horoscopes, festival and vrat overviews): every language
//   - English city pages: every city
//   - other languages: only the cities where that language is spoken, plus its main diaspora cities
//   - "tomorrow" pages: not indexed
//   - any page that already earned search impressions: always indexed
// Grow these lists slowly, and only where Search Console shows demand.
import { EARNED_PAGES } from '../data/earned-pages.js';
import { localePath } from '../i18n/index.js';

const set = (s) => new Set(s.split(/\s+/).filter(Boolean));
export const LANG_CITIES = {
  hi: set(`delhi lucknow jaipur indore bhopal patna varanasi chandigarh kanpur agra mathura ujjain jodhpur udaipur ajmer kota gwalior
    jabalpur ranchi jamshedpur gorakhpur meerut faridabad ghaziabad haridwar rishikesh dehradun raipur prayagraj noida gurugram shimla
    jammu mumbai dubai london new-york toronto sydney singapore`),
  gu: set('ahmedabad surat vadodara rajkot bhavnagar gandhinagar jamnagar anand junagadh mumbai london leicester new-york edison jersey-city toronto nairobi dubai'),
  mr: set('mumbai pune nagpur thane navi-mumbai nashik aurangabad kolhapur solapur panaji'),
  bn: set('kolkata siliguri dhaka chittagong london new-york'),
  ta: set('chennai coimbatore madurai tiruchirappalli colombo jaffna singapore kuala-lumpur george-town johor-bahru toronto london'),
  te: set('hyderabad vijayawada tirupati visakhapatnam dallas san-jose'),
  kn: set('bengaluru mysuru mangaluru hubballi'),
  ml: set('kochi thiruvananthapuram kozhikode dubai abu-dhabi sharjah doha muscat kuwait-city manama riyadh'),
  th: set('bangkok chiang-mai'),
  vi: set('ho-chi-minh-city hanoi'),
  id: set('jakarta bali'),
  ms: set('kuala-lumpur george-town johor-bahru'),
  tl: set('manila cebu'),
  zh: set('singapore hong-kong kuala-lumpur'),
};

const DAILY = new Set(['choghadiya', 'rahu-kaal', 'panchang']);
/** The city slug in a page path, or null for pages that are not about one city. */
export function cityOf(path) {
  const p = path.split('?')[0].split('/').filter(Boolean);
  if (DAILY.has(p[0]) && p[1]) return p[1];
  if ((p[0] === 'festivals' || p[0] === 'vrat') && p[2]) return p[2];
  return null;
}

/** Should this page (English path, without the language prefix) be offered to search engines in `lang`? */
export function indexable(lang, path) {
  if (!path) return true;
  const clean = path.split('?')[0].replace(/\/$/, '') || '/';
  if (EARNED_PAGES.has(localePath(lang, clean).replace(/\/$/, '') || '/')) return true;
  const city = cityOf(clean);
  if (!city) return true;
  if (/\/tomorrow$/.test(clean)) return false;
  if (lang === 'en') return true;
  return !!LANG_CITIES[lang]?.has(city);
}
