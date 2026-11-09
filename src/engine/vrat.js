// Monthly fasting days (vrat) for any city: Ekadashi, Purnima, Amavasya, Pradosh and Sankashti
// Chaturthi, a year ahead. The tithi boundaries are the same moment everywhere, so they are found
// once; each city then decides the local day from its own sunrise, sunset or moonrise.
//
// VERIFY with the consultant. Rules used (the common Smarta convention):
// - Ekadashi, Purnima, Amavasya: the day whose sunrise falls in the tithi. When no sunrise does
//   (a skipped tithi), the day in which the tithi runs. When two sunrises do, the first day.
// - Ekadashi parana (breaking the fast): the next day, after Hari Vasara (the first quarter of
//   Dwadashi) has passed, within the first fifth of the day (Pratahkal); if Hari Vasara runs past
//   that, in Aparahna (the fourth fifth), avoiding midday; and before Dwadashi ends.
// - Month names for Krishna paksha days follow the North Indian (purnimanta) calendar, so the
//   Diwali new moon is Kartik Amavasya. Ekadashi names are the same in both calendars.
// - Pradosh: the day whose Pradosh Kaal (sunset plus a fifth of the night) overlaps Trayodashi most.
// - Sankashti Chaturthi: the day whose moonrise falls in Krishna Chaturthi.
import { tropicalLon, norm, findAngleCrossing, nextRiseSet } from './astro.js';
import { masaAt } from './panchang.js';
import { MASA } from './constants.js';
import { zonedToUtc, fmtTime } from './time.js';

export const VRATS = [
  { slug: 'ekadashi', name: 'Ekadashi', tithi: [10, 25] },
  { slug: 'purnima', name: 'Purnima', tithi: [14] },
  { slug: 'amavasya', name: 'Amavasya', tithi: [29] },
  { slug: 'pradosh', name: 'Pradosh Vrat', tithi: [12, 27] },
  { slug: 'sankashti-chaturthi', name: 'Sankashti Chaturthi', tithi: [18] },
];
export const VRAT_BY_SLUG = new Map(VRATS.map((v) => [v.slug, v]));

// Ekadashi names by amanta month, Shukla then Krishna. Adhik months: Padmini and Parama.
const EKADASHI = {
  Chaitra: ['Kamada Ekadashi', 'Varuthini Ekadashi'],
  Vaishakha: ['Mohini Ekadashi', 'Apara Ekadashi'],
  Jyeshtha: ['Nirjala Ekadashi', 'Yogini Ekadashi'],
  Ashadha: ['Devshayani Ekadashi', 'Kamika Ekadashi'],
  Shravana: ['Shravana Putrada Ekadashi', 'Aja Ekadashi'],
  Bhadrapada: ['Parivartini Ekadashi', 'Indira Ekadashi'],
  Ashwin: ['Papankusha Ekadashi', 'Rama Ekadashi'],
  Kartik: ['Devutthana Ekadashi', 'Utpanna Ekadashi'],
  Margashirsha: ['Mokshada Ekadashi', 'Saphala Ekadashi'],
  Pausha: ['Pausha Putrada Ekadashi', 'Shattila Ekadashi'],
  Magha: ['Jaya Ekadashi', 'Vijaya Ekadashi'],
  Phalguna: ['Amalaki Ekadashi', 'Papmochani Ekadashi'],
};
const ADHIK_EKADASHI = ['Padmini Ekadashi', 'Parama Ekadashi'];
const PRADOSH_DAY = { 1: 'Soma Pradosh', 2: 'Bhauma Pradosh', 6: 'Shani Pradosh' };

const DAY = 86400000;
const tithiAngle = (t) => norm(tropicalLon('Moon', t) - tropicalLon('Sun', t));
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const localDate = (t, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(t);
const weekdayOf = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();

// ---- tithi boundaries (global) ---------------------------------------------------------
let tithiScan = null;
/** Every tithi from a few days before `from` for about 13 months: { idx, start, end, masa, adhika }. */
export function tithiList(from) {
  if (tithiScan?.from === from) return tithiScan.list;
  const list = [];
  let t = new Date(`${addDays(from, -3)}T00:00:00Z`);
  const stop = new Date(t.getTime() + 395 * DAY);
  let idx = Math.floor(tithiAngle(t) / 12);
  let start = null;
  while (t < stop) {
    const end = findAngleCrossing(tithiAngle, new Date(t.getTime() + 60000), norm((idx + 1) * 12), 3, 1);
    if (!end) break;
    if (start) list.push({ idx, start, end });
    start = end; t = end; idx = (idx + 1) % 30;
  }
  // Month names only for the tithis that are used, from the middle of each.
  const wanted = new Set(VRATS.flatMap((v) => v.tithi));
  for (const x of list) {
    if (!wanted.has(x.idx)) continue;
    const m = masaAt(new Date((x.start.getTime() + x.end.getTime()) / 2));
    x.amanta = m.name; x.adhika = m.adhika;
    x.masa = x.idx >= 15 ? MASA[(m.index + 1) % 12] : m.name; // purnimanta name for Krishna paksha
  }
  tithiScan = { from, list };
  return list;
}

// ---- per city ----------------------------------------------------------------------------
function sunCache(city) {
  const m = new Map();
  return (d) => {
    if (!m.has(d)) {
      const [y, mo, da] = d.split('-').map(Number);
      const midnight = zonedToUtc(y, mo, da, 0, 0, city.tz);
      const sunrise = nextRiseSet('Sun', midnight, city.lat, city.lon, +1);
      const sunset = nextRiseSet('Sun', sunrise, city.lat, city.lon, -1);
      m.set(d, { sunrise, sunset });
    }
    return m.get(d);
  };
}

/** The day whose sunrise falls in [start, end); else the day the tithi runs in. */
function sunriseDay(t, sun, tz) {
  const d0 = localDate(t.start, tz);
  for (const d of [d0, addDays(d0, 1), addDays(d0, 2)]) {
    const sr = sun(d).sunrise;
    if (sr >= t.start && sr < t.end) return { date: d, kshaya: false };
  }
  // Skipped tithi: it begins and ends between two sunrises, inside the Hindu day that began at the earlier one.
  return { date: sun(d0).sunrise <= t.start ? d0 : addDays(d0, -1), kshaya: true };
}

const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

function observe(v, t, next, city, sun) {
  const tz = city.tz; const f = (x) => (x ? fmtTime(x, tz) : null);
  const base = { tithi: t.idx, paksha: t.idx < 15 ? 'Shukla' : 'Krishna', masa: t.masa, adhika: !!t.adhika, starts: `${localDate(t.start, tz)} ${f(t.start)}`, ends: `${localDate(t.end, tz)} ${f(t.end)}` };
  if (v.slug === 'ekadashi') {
    const { date, kshaya } = sunriseDay(t, sun, tz);
    const name = t.adhika ? ADHIK_EKADASHI[t.idx < 15 ? 0 : 1] : (EKADASHI[t.amanta] || [])[t.idx < 15 ? 0 : 1];
    // Parana on the following day, in Dwadashi, after Hari Vasara.
    const p = addDays(date, 1); const { sunrise, sunset } = sun(p);
    const hariVasaraEnd = next ? new Date(t.end.getTime() + (next.end - next.start) / 4) : t.end;
    const fifth = (sunset - sunrise) / 5;
    let start = new Date(Math.max(sunrise, hariVasaraEnd));
    let end = new Date(sunrise.getTime() + fifth);
    if (start >= end) { start = new Date(Math.max(sunrise.getTime() + 3 * fifth, hariVasaraEnd)); end = new Date(sunrise.getTime() + 4 * fifth); }
    if (next && next.end > start && next.end < end) end = next.end;
    const parana = start < end ? { date: p, start: f(start), end: f(end) } : null;
    return { ...base, date, kshaya, name: name || 'Ekadashi', parana };
  }
  if (v.slug === 'purnima' || v.slug === 'amavasya') {
    const { date, kshaya } = sunriseDay(t, sun, tz);
    return { ...base, date, kshaya, name: `${t.masa} ${v.slug === 'purnima' ? 'Purnima' : 'Amavasya'}` };
  }
  if (v.slug === 'pradosh') {
    const d0 = localDate(t.start, tz);
    let best = null;
    for (const d of [addDays(d0, -1), d0, addDays(d0, 1)]) {
      const { sunset } = sun(d); const nextSunrise = sun(addDays(d, 1)).sunrise;
      const win = [sunset.getTime(), sunset.getTime() + (nextSunrise - sunset) / 5];
      const o = overlap(win, [t.start.getTime(), t.end.getTime()]);
      if (o > 0 && (!best || o > best.o)) best = { d, o, win };
    }
    if (!best) { const d = sunriseDay(t, sun, tz).date; const { sunset } = sun(d); best = { d, o: 0, win: [sunset.getTime(), sunset.getTime() + 2 * 3600000] }; }
    const s = new Date(Math.max(best.win[0], t.start)); const e = new Date(Math.min(best.win[1], t.end));
    return { ...base, date: best.d, name: PRADOSH_DAY[weekdayOf(best.d)] || 'Pradosh Vrat', puja: best.o > 0 ? { start: f(s), end: f(e) } : null };
  }
  // Sankashti Chaturthi: the moon must rise during Krishna Chaturthi.
  const d0 = localDate(t.start, tz);
  for (const d of [addDays(d0, -1), d0, addDays(d0, 1)]) {
    const { sunset } = sun(d);
    const mr = nextRiseSet('Moon', new Date(sunset.getTime() - 2 * 3600000), city.lat, city.lon, +1);
    if (mr && mr >= t.start && mr < t.end && localDate(new Date(mr.getTime() - 6 * 3600000), tz) === d) {
      return { ...base, date: d, name: weekdayOf(d) === 2 ? 'Angaraki Sankashti Chaturthi' : `${t.masa} Sankashti Chaturthi`, moonrise: f(mr) };
    }
  }
  const { date } = sunriseDay(t, sun, tz);
  const mr = nextRiseSet('Moon', new Date(sun(date).sunset.getTime() - 2 * 3600000), city.lat, city.lon, +1);
  return { ...base, date, name: `${t.masa} Sankashti Chaturthi`, moonrise: mr ? f(mr) : null };
}

const cityCache = new Map();
/** The next twelve months of one vrat in a city (from the reference date `from`, YYYY-MM-DD). */
export function vratDates(slug, city, from) {
  const v = VRAT_BY_SLUG.get(slug); if (!v) return [];
  const key = `${slug}:${city.lat},${city.lon},${city.tz}:${from}`;
  if (cityCache.has(key)) { const hit = cityCache.get(key); cityCache.delete(key); cityCache.set(key, hit); return hit; }
  const list = tithiList(from); const sun = sunCache(city);
  const until = addDays(from, 366);
  const out = [];
  list.forEach((t, i) => {
    if (!v.tithi.includes(t.idx)) return;
    const x = observe(v, t, list[i + 1], city, sun);
    if (x.date >= addDays(from, -1) && x.date < until) out.push(x);
  });
  cityCache.set(key, out);
  if (cityCache.size > 400) cityCache.delete(cityCache.keys().next().value);
  return out;
}

/** The next date of every vrat in a city: [{ slug, name, ...next }]. */
export function nextVrats(city, from) {
  return VRATS.map((v) => ({ slug: v.slug, vrat: v.name, ...(vratDates(v.slug, city, from).find((x) => x.date >= from) || {}) })).filter((x) => x.date);
}
