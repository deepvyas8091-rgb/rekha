// Birth chart (kundli): sidereal planets, lagna, whole-sign houses, navamsa,
// Vimshottari dasha, Manglik check, Sade Sati and current transits.
import {
  PLANETS, siderealLon, siderealAscendant, isRetrograde, tropicalLon, lahiriAyanamsa,
} from './astro.js';
import { zonedToUtc, parseDate, parseTime, fmtDateTime } from './time.js';
import { RASHI, NAKSHATRA, DASHA_ORDER, DASHA_YEARS } from './constants.js';

const NAK_SPAN = 360 / 27;
const YEAR_MS = 365.25 * 86400000;

export function describeLon(lon) {
  const sign = Math.floor(lon / 30);
  const nak = Math.floor(lon / NAK_SPAN);
  const degInSign = lon - sign * 30;
  return {
    longitude: +lon.toFixed(4),
    sign: sign,
    signName: RASHI[sign].sa,
    signEn: RASHI[sign].en,
    degree: `${Math.floor(degInSign)}°${String(Math.floor((degInSign % 1) * 60)).padStart(2, '0')}'`,
    nakshatra: NAKSHATRA[nak].name,
    nakshatraIndex: nak,
    pada: Math.floor((lon % NAK_SPAN) / (NAK_SPAN / 4)) + 1,
    navamsaSign: RASHI[Math.floor((lon * 9) / 30) % 12].sa,
  };
}

/** Birth input: { date:'YYYY-MM-DD', time:'HH:MM', lat, lon, tz } */
export function birthInstant(b) {
  const { year, month, day } = parseDate(b.date);
  const { hour, minute } = parseTime(b.time || '12:00');
  return zonedToUtc(year, month, day, hour, minute, b.tz);
}

export function vimshottari(moonLon, birth, levels = 2) {
  const nak = Math.floor(moonLon / NAK_SPAN);
  const fractionLeft = 1 - (moonLon % NAK_SPAN) / NAK_SPAN;
  const startLord = NAKSHATRA[nak].lord;
  const startIdx = DASHA_ORDER.indexOf(startLord);
  const out = [];
  // Back-date the first dasha so its elapsed part sits before birth.
  let t = birth.getTime() - (1 - fractionLeft) * DASHA_YEARS[startLord] * YEAR_MS;
  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(startIdx + i) % 9];
    const len = DASHA_YEARS[lord] * YEAR_MS;
    const md = { lord, start: new Date(t), end: new Date(t + len), antardasha: [] };
    if (levels > 1) {
      let a = t;
      for (let j = 0; j < 9; j++) {
        const al = DASHA_ORDER[(startIdx + i + j) % 9];
        const alen = (len * DASHA_YEARS[al]) / 120;
        md.antardasha.push({ lord: al, start: new Date(a), end: new Date(a + alen) });
        a += alen;
      }
    }
    out.push(md);
    t += len;
  }
  return { balanceAtBirth: { lord: startLord, years: +(fractionLeft * DASHA_YEARS[startLord]).toFixed(2) }, periods: out };
}

export function currentDasha(dasha, at = new Date()) {
  const md = dasha.periods.find((p) => at >= p.start && at < p.end);
  if (!md) return null;
  const ad = md.antardasha.find((p) => at >= p.start && at < p.end);
  return { mahadasha: md.lord, antardasha: ad?.lord, mahaEnds: md.end, antarEnds: ad?.end };
}

/** Manglik (Kuja dosha): Mars in houses 1, 2, 4, 7, 8, 12 from lagna, moon or venus. */
export function manglik(marsSign, lagnaSign, moonSign, venusSign) {
  const bad = new Set([1, 2, 4, 7, 8, 12]);
  const house = (from) => ((marsSign - from + 12) % 12) + 1;
  const fromLagna = bad.has(house(lagnaSign));
  const fromMoon = bad.has(house(moonSign));
  const fromVenus = bad.has(house(venusSign));
  const count = [fromLagna, fromMoon, fromVenus].filter(Boolean).length;
  return {
    fromLagna, fromMoon, fromVenus,
    status: count === 0 ? 'Not Manglik' : fromLagna ? 'Manglik' : 'Mild (Anshik) Manglik',
    note: 'Exceptions (e.g. Mars in own sign) reduce the dosha. Consultant to review exception rules.',
  };
}

/** Sade Sati: transit Saturn in the 12th, 1st or 2nd sign from natal Moon. */
export function sadeSati(natalMoonSign, at = new Date()) {
  const sat = Math.floor(siderealLon('Saturn', at) / 30);
  const h = ((sat - natalMoonSign + 12) % 12) + 1;
  const phase = h === 12 ? 'Rising (1st phase)' : h === 1 ? 'Peak (2nd phase)' : h === 2 ? 'Setting (3rd phase)' : null;
  const dhaiya = h === 4 || h === 8 ? `Shani Dhaiya (Saturn in house ${h} from Moon)` : null;
  return { active: !!phase, phase, dhaiya, saturnSign: RASHI[sat].sa };
}

export function transits(at = new Date(), natalMoonSign = null) {
  return PLANETS.map((p) => {
    const lon = siderealLon(p, at);
    const d = describeLon(lon);
    return {
      planet: p, signName: d.signName, degree: d.degree, retrograde: isRetrograde(p, at),
      houseFromMoon: natalMoonSign == null ? undefined : ((d.sign - natalMoonSign + 12) % 12) + 1,
    };
  });
}

export function kundli(b) {
  const t = birthInstant(b);
  const lagnaLon = siderealAscendant(t, b.lat, b.lon);
  const lagna = describeLon(lagnaLon);
  const planets = PLANETS.map((p) => {
    const lon = siderealLon(p, t);
    const d = describeLon(lon);
    return { planet: p, ...d, retrograde: isRetrograde(p, t), house: ((d.sign - lagna.sign + 12) % 12) + 1 };
  });
  const get = (n) => planets.find((p) => p.planet === n);
  const moon = get('Moon');
  const dasha = vimshottari(moon.longitude, t);
  const now = new Date();
  const cur = currentDasha(dasha, now);
  const tropSun = tropicalLon('Sun', t);

  return {
    input: b,
    utc: t.toISOString(),
    ayanamsa: { system: 'Lahiri', value: +lahiriAyanamsa(t).toFixed(4) },
    lagna,
    planets,
    houses: Array.from({ length: 12 }, (_, i) => ({
      house: i + 1,
      sign: RASHI[(lagna.sign + i) % 12].sa,
      planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
    })),
    moonSign: moon.signName,
    moonSignIndex: moon.sign,
    birthNakshatra: moon.nakshatra,
    birthNakshatraIndex: moon.nakshatraIndex,
    sunSignWestern: RASHI[Math.floor(tropSun / 30)].en,
    manglik: manglik(get('Mars').sign, lagna.sign, moon.sign, get('Venus').sign),
    dasha: {
      balanceAtBirth: dasha.balanceAtBirth,
      current: cur && { ...cur, mahaEnds: fmtDateTime(cur.mahaEnds, b.tz), antarEnds: fmtDateTime(cur.antarEnds, b.tz) },
      periods: dasha.periods.map((p) => ({
        lord: p.lord, start: p.start.toISOString().slice(0, 10), end: p.end.toISOString().slice(0, 10),
        antardasha: p.antardasha.map((a) => ({ lord: a.lord, start: a.start.toISOString().slice(0, 10), end: a.end.toISOString().slice(0, 10) })),
      })),
    },
    sadeSati: sadeSati(moon.sign, now),
    transits: transits(now, moon.sign),
  };
}
