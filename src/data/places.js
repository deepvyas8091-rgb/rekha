// World city search for locations and birth places: about 7,300 cities in every country,
// with coordinates and time zone (city-timezones, MIT; data from simplemaps, CC BY 4.0).
import cityTimezones from 'city-timezones';

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const INDEX = cityTimezones.cityMapping
  .filter((c) => c.timezone && Number.isFinite(c.lat) && Number.isFinite(c.lng))
  .map((c) => ({ key: fold(c.city_ascii || c.city), alt: fold(c.city), name: c.city, region: c.province || '', country: c.iso2, lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), tz: c.timezone, pop: c.pop || 0 }))
  .sort((a, b) => b.pop - a.pop);

/** Up to `limit` cities matching the start of the name first, then anywhere in it; biggest first. */
export function searchPlaces(q, limit = 8) {
  const k = fold(q);
  if (k.length < 2) return [];
  const starts = []; const contains = [];
  for (const c of INDEX) {
    if (c.key.startsWith(k) || c.alt.startsWith(k)) starts.push(c);
    else if (k.length >= 3 && (c.key.includes(k) || c.alt.includes(k))) contains.push(c);
    if (starts.length >= limit) break;
  }
  const seen = new Set();
  return [...starts, ...contains].filter((c) => { const id = `${c.key}|${c.region}|${c.country}`; if (seen.has(id)) return false; seen.add(id); return true; })
    .slice(0, limit).map(({ key, alt, pop, ...rest }) => rest);
}
export const PLACE_COUNT = INDEX.length;

// ---- nearest city ------------------------------------------------------------------------
const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
/** The nearest listed city to a point (within maxKm), for naming a GPS or network location. */
export function nearestPlace(lat, lon, maxKm = 80) {
  let best = null; let bestD = Infinity;
  for (const c of INDEX) {
    if (Math.abs(c.lat - lat) > 2 || Math.abs(c.lon - lon) > 3) continue;
    const d = km({ lat, lon }, c);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (!best || bestD > maxKm) return null;
  const { key, alt, pop, ...rest } = best;
  return { ...rest, km: Math.round(bestD) };
}
/** The biggest city in a time zone (a rough guess when nothing better is known). */
const TZ_ALIAS = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon' };
export function largestInTz(tz) {
  tz = TZ_ALIAS[tz] || tz;
  const c = INDEX.find((x) => x.tz === tz);
  if (!c) return null;
  const { key, alt, pop, ...rest } = c;
  return rest;
}
