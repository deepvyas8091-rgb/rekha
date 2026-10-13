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
