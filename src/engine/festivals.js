// Festival dates and muhurat for any city, from the same Panchang engine as the daily pages.
// The date is found once a day for a reference city (Delhi), then checked a day either side in
// each city, because a festival can fall on a different date in another time zone.
import { panchang, sunTimes } from './panchang.js';
import { siderealAscendant } from './astro.js';
import { fmtTime } from './time.js';

const REF = { lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' };

// slug, the name the Panchang engine gives the day, how its time is worked out, and whether it
// gets a page for every city (the ones people search with a city name: muhurat, moonrise, arghya).
export const FESTIVALS = [
  { slug: 'diwali', match: 'Diwali (Lakshmi Puja)', name: 'Diwali', kind: 'lakshmi', city: true },
  { slug: 'dhanteras', match: 'Dhanteras', name: 'Dhanteras', kind: 'lakshmi', city: true },
  { slug: 'karwa-chauth', match: 'Karwa Chauth', name: 'Karwa Chauth', kind: 'moonrise', city: true },
  { slug: 'chhath-puja', match: 'Chhath Puja', name: 'Chhath Puja', kind: 'chhath', city: true },
  { slug: 'holika-dahan', match: 'Holika Dahan', name: 'Holika Dahan', kind: 'pradosh', city: true },
  { slug: 'janmashtami', match: 'Janmashtami', name: 'Janmashtami', kind: 'nishita', city: true },
  { slug: 'maha-shivaratri', match: 'Maha Shivaratri', name: 'Maha Shivaratri', kind: 'nishita', city: true },
  { slug: 'narak-chaturdashi', match: 'Narak Chaturdashi', name: 'Narak Chaturdashi' },
  { slug: 'govardhan-puja', match: 'Govardhan Puja / Gujarati New Year', name: 'Govardhan Puja' },
  { slug: 'bhai-dooj', match: 'Bhai Dooj', name: 'Bhai Dooj' },
  { slug: 'kartik-purnima', match: 'Kartik Purnima / Dev Diwali', name: 'Kartik Purnima' },
  // Navratri is found from any of its nine days (the first can be skipped when a tithi is lost), counted back to day 1.
  { slug: 'navratri', match: 'Sharad Navratri day 1', series: /^Sharad Navratri day (\d)$/, name: 'Sharad Navratri' },
  { slug: 'dussehra', match: 'Dussehra (Vijayadashami)', name: 'Dussehra' },
  { slug: 'sharad-purnima', match: 'Sharad Purnima', name: 'Sharad Purnima' },
  { slug: 'ganesh-chaturthi', match: 'Ganesh Chaturthi', name: 'Ganesh Chaturthi' },
  { slug: 'raksha-bandhan', match: 'Raksha Bandhan', name: 'Raksha Bandhan' },
  { slug: 'nag-panchami', match: 'Nag Panchami', name: 'Nag Panchami' },
  { slug: 'guru-purnima', match: 'Guru Purnima', name: 'Guru Purnima' },
  { slug: 'akshaya-tritiya', match: 'Akshaya Tritiya', name: 'Akshaya Tritiya' },
  { slug: 'ram-navami', match: 'Ram Navami', name: 'Ram Navami' },
  { slug: 'hanuman-jayanti', match: 'Hanuman Jayanti', name: 'Hanuman Jayanti' },
  { slug: 'vasant-panchami', match: 'Vasant Panchami', name: 'Vasant Panchami' },
  { slug: 'gudi-padwa-ugadi', match: 'Gudi Padwa / Ugadi, Chaitra Navratri begins', name: 'Gudi Padwa and Ugadi' },
];
export const FESTIVAL_BY_SLUG = new Map(FESTIVALS.map((f) => [f.slug, f]));

const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

// One scan of the next ~13 months for the reference city, shared by every festival, per day.
let scan = null;
function upcoming(from) {
  if (scan?.from === from) return scan.dates;
  const dates = {};
  // Start two days back, so a festival's page still shows this year's details just after it.
  for (let i = -2; i < 400 && Object.keys(dates).length < FESTIVALS.length; i++) {
    const d = addDays(from, i);
    for (const name of panchang(d, REF.lat, REF.lon, REF.tz).festivals) {
      for (const f of FESTIVALS) {
        if (dates[f.slug]) continue;
        if (f.match === name) dates[f.slug] = d;
        else if (f.series?.test(name)) dates[f.slug] = addDays(d, 1 - Number(f.series.exec(name)[1]));
      }
    }
  }
  scan = { from, dates };
  return dates;
}
/** The next date of a festival in India (reference: Delhi), as YYYY-MM-DD, or null. */
export function nextFestivalDate(slug, from = todayIn(REF.tz)) { return upcoming(from)[slug] || null; }
/** All festivals with their next date, soonest first. */
export function festivalCalendar(from = todayIn(REF.tz)) {
  const d = upcoming(from);
  return FESTIVALS.filter((f) => d[f.slug]).map((f) => ({ ...f, date: d[f.slug] })).sort((a, b) => a.date.localeCompare(b.date));
}

const fmt = (date, tz) => (date ? fmtTime(date, tz) : null);
/** Window of the sidereal ascendant in one sign between two instants (Vrishabha = 1). */
function lagnaWindow(sign, from, to, lat, lon) {
  let start = null;
  for (let t = from.getTime(); t <= to.getTime(); t += 60000) {
    const inSign = Math.floor(siderealAscendant(new Date(t), lat, lon) / 30) === sign;
    if (inSign && start == null) start = t;
    if (!inSign && start != null) return [new Date(start), new Date(t)];
  }
  return start != null ? [new Date(start), to] : null;
}
const overlap = (a, b) => (a && b && a[0] < b[1] && b[0] < a[1] ? [new Date(Math.max(a[0], b[0])), new Date(Math.min(a[1], b[1]))] : null);
const span = (w, tz) => (w ? { start: fmt(w[0], tz), end: fmt(w[1], tz), minutes: Math.round((w[1] - w[0]) / 60000) } : null);

/**
 * A festival in one city: its date there and the times that matter for it.
 * Returns null if the festival was not found within a day of the reference date.
 */
export function festivalIn(slug, city, from) {
  const f = FESTIVAL_BY_SLUG.get(slug); if (!f) return null;
  const ref = nextFestivalDate(slug, from); if (!ref) return null;
  let date = null; let p = null;
  for (const d of [ref, addDays(ref, -1), addDays(ref, 1)]) {
    const x = panchang(d, city.lat, city.lon, city.tz);
    if (x.festivals.includes(f.match)) { date = d; p = x; break; }
  }
  if (!date) { date = ref; p = panchang(ref, city.lat, city.lon, city.tz); }
  const st = sunTimes(date, city.lat, city.lon, city.tz);
  const night = st.nextSunrise - st.sunset;
  const pradosh = [st.sunset, new Date(st.sunset.getTime() + night / 5)];
  const out = {
    slug, name: f.name, kind: f.kind || 'day', date, sunrise: p.sunrise, sunset: p.sunset, moonrise: p.moonrise,
    tithi: p.tithi.map((x) => ({ paksha: x.paksha, name: x.name, endsAt: x.endsAt })), nakshatra: p.nakshatra[0].name,
  };
  if (f.kind === 'lakshmi') {
    const vrishabha = lagnaWindow(1, st.sunset, new Date(st.sunset.getTime() + 6 * 3600000), city.lat, city.lon);
    out.pradosh = span(pradosh, city.tz);
    out.vrishabha = span(vrishabha, city.tz);
    const both = overlap(pradosh, vrishabha);
    out.muhurat = span(both, city.tz) || out.pradosh;
    out.noOverlap = !both; // Vrishabha lagna falls outside Pradosh Kaal this year: Pradosh alone is used
  } else if (f.kind === 'pradosh') {
    // Holika Dahan: Pradosh after sunset, avoiding Bhadra (Vishti karana) where it overlaps.
    const raw = p._karanaRaw || [];
    const bhadra = raw.filter((k) => k.bhadra).map((k) => [k.startsAt || st.sunrise, k.endsAt || st.nextSunrise]).find((b) => overlap(b, pradosh));
    out.pradosh = span(pradosh, city.tz);
    out.bhadra = bhadra ? span(bhadra, city.tz) : null;
    out.muhurat = bhadra && bhadra[1] < pradosh[1] ? span([new Date(Math.max(bhadra[1], pradosh[0])), pradosh[1]], city.tz) : bhadra ? null : out.pradosh;
  } else if (f.kind === 'nishita') {
    // Nishita: the middle muhurta of the night (night / 15, centred on midnight).
    const mid = st.sunset.getTime() + night / 2; const half = night / 30;
    out.muhurat = span([new Date(mid - half), new Date(mid + half)], city.tz);
  } else if (f.kind === 'chhath') {
    out.sandhyaArghya = p.sunset; // evening offering at sunset on Shashthi
    out.ushaArghya = panchang(addDays(date, 1), city.lat, city.lon, city.tz).sunrise; // morning offering the next sunrise
  }
  return out;
}
