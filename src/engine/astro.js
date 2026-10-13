// Low-level astronomy: tropical and sidereal longitudes, ayanamsa, ascendant,
// sunrise/sunset. Uses astronomy-engine (MIT licence), so there is no AGPL
// obligation as there would be with the Swiss Ephemeris.
import * as A from 'astronomy-engine';
import { DAY_MS, addMs } from './time.js';

export const norm = (x) => ((x % 360) + 360) % 360;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

const BODY = {
  Sun: A.Body.Sun, Moon: A.Body.Moon, Mars: A.Body.Mars, Mercury: A.Body.Mercury,
  Jupiter: A.Body.Jupiter, Venus: A.Body.Venus, Saturn: A.Body.Saturn,
};
export const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

/** Julian centuries from J2000 (TT approximation is fine at this precision). */
function centuries(date) {
  return (date.getTime() / DAY_MS + 2440587.5 - 2451545.0) / 36525;
}

/** Tropical apparent ecliptic longitude of date, degrees. */
export function tropicalLon(name, date) {
  const t = A.MakeTime(date);
  if (name === 'Sun') return A.SunPosition(t).elon;
  if (name === 'Moon') return A.EclipticGeoMoon(t).lon;
  if (name === 'Rahu') return meanNode(date);
  if (name === 'Ketu') return norm(meanNode(date) + 180);
  const v = A.GeoVector(BODY[name], t, true);
  const rv = A.RotateVector(A.Rotation_EQJ_ECT(t), v);
  return norm(A.SphereFromVector(rv).lon);
}

/** Mean lunar node (Rahu). Mean node is the default in many Indian almanacs. */
export function meanNode(date) {
  const T = centuries(date);
  return norm(125.04452 - 1934.136261 * T + 0.0020708 * T * T);
}

/**
 * Lahiri (Chitrapaksha) ayanamsa. Linear model anchored at J2000 with the
 * general precession rate; error is well under 1 arc-minute for 1900-2100.
 */
export function lahiriAyanamsa(date) {
  const years = centuries(date) * 100;
  return 23.85306 + (years * 50.2879) / 3600;
}

export function siderealLon(name, date) {
  return norm(tropicalLon(name, date) - lahiriAyanamsa(date));
}

/** True when the planet's longitude is decreasing (retrograde). */
export function isRetrograde(name, date) {
  if (name === 'Sun' || name === 'Moon') return false;
  if (name === 'Rahu' || name === 'Ketu') return true; // nodes are always retrograde (mean)
  const a = tropicalLon(name, addMs(date, -DAY_MS / 2));
  const b = tropicalLon(name, addMs(date, DAY_MS / 2));
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d < 0;
}

/** Tropical ascendant for a UTC instant and location. */
export function tropicalAscendant(date, lat, lon) {
  const t = A.MakeTime(date);
  const gast = A.SiderealTime(t); // hours
  const ramc = rad(norm(gast * 15 + lon));
  const eps = rad(A.e_tilt(t).tobl);
  const phi = rad(lat);
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)));
  return norm(deg(asc));
}

export function siderealAscendant(date, lat, lon) {
  return norm(tropicalAscendant(date, lat, lon) - lahiriAyanamsa(date));
}

function observer(lat, lon, alt = 0) {
  return new A.Observer(lat, lon, alt);
}

/** Next rise (dir=+1) or set (dir=-1) of a body after `from`, as a Date or null. */
export function nextRiseSet(bodyName, from, lat, lon, dir) {
  const r = A.SearchRiseSet(BODY[bodyName], observer(lat, lon), dir, A.MakeTime(from), 2);
  return r ? r.date : null;
}

/** Most recent new moon (Amavasya end) at or before `date`. */
export function previousNewMoon(date) {
  const r = A.SearchMoonPhase(0, A.MakeTime(addMs(date, -32 * DAY_MS)), 32);
  // SearchMoonPhase searches forward; step forward until we pass `date`.
  let last = r;
  let cur = r;
  while (cur && cur.date <= date) {
    last = cur;
    cur = A.SearchMoonPhase(0, cur.AddDays(1), 32);
  }
  return last.date;
}

export function nextNewMoon(date) {
  return A.SearchMoonPhase(0, A.MakeTime(date), 32).date;
}

/**
 * Find when an angle function f(t) (degrees, increasing over time) next reaches
 * `target` after `start`. Steps in coarse increments then bisects to ~1 minute.
 */
export function findAngleCrossing(f, start, target, maxDays = 3, stepH = 2) {
  const gap = (t) => norm(f(t) - target); // drops from ~360 to ~0 at crossing
  let t0 = start;
  let g0 = gap(t0);
  const end = addMs(start, maxDays * DAY_MS);
  while (t0 < end) {
    const t1 = addMs(t0, stepH * 3600000);
    const g1 = gap(t1);
    if (g1 < g0 && g0 - g1 > 180) {
      let lo = t0, hi = t1;
      for (let i = 0; i < 30 && hi - lo > 30000; i++) {
        const mid = new Date((lo.getTime() + hi.getTime()) / 2);
        if (gap(mid) > 180) lo = mid; else hi = mid;
      }
      return hi;
    }
    t0 = t1;
    g0 = g1;
  }
  return null;
}
