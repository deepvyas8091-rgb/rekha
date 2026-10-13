// Good and bad time engine: Choghadiya, Rahu Kaal, Yamaganda, Gulika, Abhijit,
// Brahma Muhurta, Vijaya, Dur Muhurtam, Hora, Bhadra, Panchak, personal
// Tarabalam/Chandrabalam, and a "best windows" finder per activity.
import { sunTimes, panchang } from './panchang.js';
import { siderealLon } from './astro.js';
import { zonedParts, fmtTime } from './time.js';
import {
  CHOGHADIYA, CHOGHADIYA_DAY_START, CHOGHADIYA_NIGHT_START, RAHU_KAAL_SEG,
  YAMAGANDA_SEG, GULIKA_SEG, DUR_MUHURTAM, HORA_ORDER, HORA_USE, TARA,
  CHANDRABALAM_GOOD, NAKSHATRA, RASHI,
} from './constants.js';

const NAK_SPAN = 360 / 27;

function split(start, end, n) {
  const step = (end - start) / n;
  return Array.from({ length: n }, (_, i) => ({
    start: new Date(start.getTime() + i * step),
    end: new Date(start.getTime() + (i + 1) * step),
  }));
}

function choghadiyaList(start, end, startIdx, stepDir, part) {
  return split(start, end, 8).map((s, i) => {
    const c = CHOGHADIYA[((startIdx + stepDir * i) % 7 + 7) % 7];
    return { part, ...s, name: c.name, lord: c.lord, quality: c.quality, use: c.use };
  });
}

function horaList(sunrise, sunset, nextSunrise, weekday) {
  const startIdx = HORA_ORDER.indexOf(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'][weekday]);
  const slots = [...split(sunrise, sunset, 12), ...split(sunset, nextSunrise, 12)];
  return slots.map((s, i) => {
    const lord = HORA_ORDER[(startIdx + i) % 7];
    return { part: i < 12 ? 'day' : 'night', ...s, lord, ...HORA_USE[lord] };
  });
}

/**
 * All timings for a civil date at a place. Hindu day runs sunrise to next sunrise;
 * "night" segments therefore run into the next civil morning.
 */
export function dayTimings(dateStr, lat, lon, tz) {
  const { sunrise, sunset, nextSunrise } = sunTimes(dateStr, lat, lon, tz);
  const wd = zonedParts(sunrise, tz).weekday;
  const daySeg = split(sunrise, sunset, 8);
  const dayMuh = split(sunrise, sunset, 15);
  const nightMuh = split(sunset, nextSunrise, 15);
  const nightLen = nextSunrise - sunset;

  const bad = [
    { name: 'Rahu Kaal', ...daySeg[RAHU_KAAL_SEG[wd] - 1], severity: 'high', note: 'Avoid starting new work, travel, purchases' },
    { name: 'Yamaganda', ...daySeg[YAMAGANDA_SEG[wd] - 1], severity: 'medium', note: 'Inauspicious for new beginnings' },
    { name: 'Gulika Kaal', ...daySeg[GULIKA_SEG[wd] - 1], severity: 'medium', note: 'Whatever starts now tends to repeat; avoid for new work, fine for repeat tasks' },
    ...DUR_MUHURTAM[wd].map((d) => ({
      name: 'Dur Muhurtam',
      ...(d.part === 'day' ? dayMuh : nightMuh)[d.n - 1],
      severity: 'medium', note: 'Inauspicious muhurta',
    })),
  ];

  const good = [
    { name: 'Brahma Muhurta', start: new Date(sunrise - (2 * nightLen) / 15), end: new Date(sunrise - nightLen / 15), note: 'Meditation, study, prayer' },
    { name: 'Abhijit Muhurta', ...dayMuh[7], note: wd === 3 ? 'Traditionally skipped on Wednesday' : 'Most auspicious midday window; good for any important start', skip: wd === 3 },
    { name: 'Vijaya Muhurta', ...dayMuh[10], note: 'Good for victory, competitions, legal matters' },
    { name: 'Godhuli Muhurta', start: sunset, end: new Date(sunset.getTime() + nightLen / 30), note: 'Cow-dust hour; traditional for weddings' },
    { name: 'Pratah Sandhya', start: new Date(sunrise - (3 * nightLen) / 30), end: sunrise, note: 'Morning prayer window' },
    { name: 'Sayahna Sandhya', start: sunset, end: new Date(sunset.getTime() + (3 * nightLen) / 30), note: 'Evening prayer window' },
    { name: 'Nishita Muhurta', ...nightMuh[7], note: 'Midnight window; Shiva and Kali worship' },
  ];

  return {
    weekday: wd,
    sunrise, sunset, nextSunrise,
    choghadiya: {
      day: choghadiyaList(sunrise, sunset, CHOGHADIYA_DAY_START[wd], 1, 'day'),
      night: choghadiyaList(sunset, nextSunrise, CHOGHADIYA_NIGHT_START[wd], -2, 'night'),
    },
    hora: horaList(sunrise, sunset, nextSunrise, wd),
    bad, good,
  };
}

/** Panchak: Moon transiting the last 5 nakshatras (sidereal 300 to 360 degrees). */
export function panchakAt(date) {
  return siderealLon('Moon', date) >= 300;
}

/** Personal day strength from the user's birth nakshatra and Moon sign. */
export function personalStrength(date, birthNakIdx, birthMoonSign) {
  const moon = siderealLon('Moon', date);
  const nakNow = Math.floor(moon / NAK_SPAN);
  const signNow = Math.floor(moon / 30);
  const tara = TARA[((nakNow - birthNakIdx + 27) % 27) % 9];
  const house = ((signNow - birthMoonSign + 12) % 12) + 1;
  const chandraGood = CHANDRABALAM_GOOD.has(house);
  return {
    tarabalam: { tara: tara.name, quality: tara.quality, transitNakshatra: NAKSHATRA[nakNow].name },
    chandrabalam: { house, good: chandraGood, transitMoonSign: RASHI[signNow].sa },
  };
}

// Which choghadiya and hora types suit each activity.
const ACTIVITY = {
  general: { chog: ['Amrit', 'Shubh', 'Labh'], hora: ['Jupiter', 'Venus', 'Mercury', 'Moon'] },
  business: { chog: ['Labh', 'Amrit', 'Shubh'], hora: ['Mercury', 'Jupiter'] },
  travel: { chog: ['Char', 'Amrit', 'Labh', 'Shubh'], hora: ['Moon', 'Mercury', 'Venus'] },
  marriage: { chog: ['Shubh', 'Amrit'], hora: ['Jupiter', 'Venus'] },
  purchase: { chog: ['Labh', 'Amrit', 'Shubh'], hora: ['Venus', 'Jupiter', 'Mercury'] },
  property: { chog: ['Shubh', 'Amrit', 'Labh'], hora: ['Jupiter', 'Venus', 'Moon'] },
  government: { chog: ['Udveg', 'Labh', 'Amrit'], hora: ['Sun', 'Jupiter'] },
  education: { chog: ['Labh', 'Amrit', 'Shubh'], hora: ['Mercury', 'Jupiter'] },
  health: { chog: ['Amrit', 'Shubh'], hora: ['Sun', 'Moon', 'Jupiter'] },
};
export const ACTIVITIES = Object.keys(ACTIVITY);

/**
 * Clean windows: favourable choghadiya, minus Rahu Kaal, Yamaganda, Gulika,
 * Dur Muhurtam and Bhadra. Each window carries the overlapping horas.
 */
export function bestWindows(timings, panch, activity = 'general', includeNight = false) {
  const rule = ACTIVITY[activity] || ACTIVITY.general;
  const blocks = [...timings.bad];
  for (const k of panch._bhadra || []) blocks.push({ name: 'Bhadra (Vishti)', start: k.start, end: k.end });

  const segs = [...timings.choghadiya.day, ...(includeNight ? timings.choghadiya.night : [])]
    .filter((c) => rule.chog.includes(c.name));

  const windows = [];
  for (const seg of segs) {
    let pieces = [{ start: seg.start, end: seg.end }];
    for (const b of blocks) {
      pieces = pieces.flatMap((p) => {
        if (b.end <= p.start || b.start >= p.end) return [p];
        const out = [];
        if (b.start > p.start) out.push({ start: p.start, end: b.start });
        if (b.end < p.end) out.push({ start: b.end, end: p.end });
        return out;
      });
    }
    for (const p of pieces) {
      if (p.end - p.start < 15 * 60000) continue; // ignore slivers under 15 minutes
      const horas = timings.hora.filter((h) => h.start < p.end && h.end > p.start);
      const horaMatch = horas.some((h) => rule.hora.includes(h.lord));
      windows.push({ ...p, choghadiya: seg.name, horas: horas.map((h) => h.lord), score: (seg.name === 'Amrit' ? 3 : 2) + (horaMatch ? 1 : 0) });
    }
  }
  return windows.sort((a, b) => b.score - a.score || a.start - b.start);
}

/** Full good/bad time report for a date, formatted for the API. */
export function goodBadTimes(dateStr, lat, lon, tz, opts = {}) {
  const panch = panchang(dateStr, lat, lon, tz);
  const t = dayTimings(dateStr, lat, lon, tz);
  const f = (x) => ({ ...x, start: fmtTime(x.start, tz), end: fmtTime(x.end, tz) });

  panch._bhadra = bhadraPeriods(panch, t);

  const now = opts.now ? new Date(opts.now) : null;
  const allSlots = [...t.choghadiya.day, ...t.choghadiya.night];
  const current = now ? {
    choghadiya: allSlots.find((c) => now >= c.start && now < c.end)?.name || null,
    hora: t.hora.find((h) => now >= h.start && now < h.end)?.lord || null,
    inBadPeriod: t.bad.filter((b) => now >= b.start && now < b.end).map((b) => b.name),
  } : null;

  let personal = null;
  if (opts.birthNakshatra != null && opts.birthMoonSign != null) {
    personal = personalStrength(t.sunrise, opts.birthNakshatra, opts.birthMoonSign);
    const score = (personal.tarabalam.quality === 'good' ? 1 : personal.tarabalam.quality === 'bad' ? -1 : 0)
      + (personal.chandrabalam.good ? 1 : -1);
    personal.dayRating = score >= 2 ? 'Strong day' : score === 1 ? 'Good day' : score === 0 ? 'Mixed day' : 'Cautious day';
  }

  return {
    date: dateStr,
    weekday: panch.vara.en,
    sunrise: fmtTime(t.sunrise, tz),
    sunset: fmtTime(t.sunset, tz),
    choghadiya: { day: t.choghadiya.day.map(f), night: t.choghadiya.night.map(f) },
    hora: t.hora.map(f),
    badTimes: [...t.bad, ...panch._bhadra.map((b) => ({ name: 'Bhadra (Vishti Karana)', ...b, severity: 'high', note: 'Avoid auspicious ceremonies' }))].map(f).sort((a, b) => a.start.localeCompare(b.start)),
    goodTimes: [...t.good].sort((a, b) => a.start - b.start).map(f),
    panchak: panchakAt(t.sunrise) ? 'Panchak active at sunrise: avoid roof work, wood collection, southward travel' : null,
    bestWindows: Object.fromEntries((opts.activities || ['general']).map((a) => [a, bestWindows(t, panch, a).slice(0, 4).map(f)])),
    current,
    personal,
  };
}

// Nakshatras commonly recommended per activity. VERIFY with consultant;
// a real wedding muhurat also checks Chaturmas, combust Jupiter/Venus, etc.
const GOOD_NAK = {
  travel: ['Ashwini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Anuradha', 'Shravana', 'Dhanishta', 'Revati'],
  marriage: ['Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati', 'Anuradha', 'Mula', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
  property: ['Rohini', 'Mrigashira', 'Uttara Phalguni', 'Chitra', 'Anuradha', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
  purchase: ['Ashwini', 'Rohini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Chitra', 'Swati', 'Anuradha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Revati'],
  business: ['Ashwini', 'Rohini', 'Pushya', 'Hasta', 'Chitra', 'Anuradha', 'Uttara Phalguni', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
};
const RIKTA = new Set([3, 8, 13]); // Chaturthi, Navami, Chaturdashi (0-based within paksha)

/** Month view: each day scored for an activity, optionally personalised. */
export function monthCalendar(yearMonth, lat, lon, tz, activity = 'general', birth = null) {
  const [y, m] = yearMonth.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const date = `${yearMonth}-${String(d).padStart(2, '0')}`;
    const p = panchang(date, lat, lon, tz);
    const t = p.tithi[0], n = p.nakshatra[0], yg = p.yoga[0];
    const reasons = [];
    let score = 0;
    if (yg.auspicious) score += 1; else { score -= 1; reasons.push(`${yg.name} yoga`); }
    const ti = (t.index - 1) % 15;
    if (RIKTA.has(ti)) { score -= 1; reasons.push(`Rikta tithi (${t.name})`); }
    if (t.name === 'Amavasya') { score -= 2; reasons.push('Amavasya'); }
    if (p.karana[0].bhadra) { score -= 1; reasons.push('Bhadra at sunrise'); }
    if (GOOD_NAK[activity]?.includes(n.name)) { score += 2; reasons.push(`${n.name} suits ${activity}`); }
    if (p.festivals.length) reasons.push(...p.festivals);
    let personal = null;
    if (birth) {
      personal = personalStrength(p._raw.sunrise, birth.nakshatraIndex, birth.moonSign);
      score += personal.tarabalam.quality === 'good' ? 1 : personal.tarabalam.quality === 'bad' ? -1 : 0;
      score += personal.chandrabalam.good ? 1 : -1;
    }
    out.push({
      date, weekday: p.vara.en, tithi: `${t.paksha} ${t.name}`, nakshatra: n.name, yoga: yg.name,
      score, rating: score >= 3 ? 'excellent' : score >= 1 ? 'good' : score >= 0 ? 'average' : 'avoid',
      reasons, personal,
    });
  }
  return { month: yearMonth, activity, days: out, note: 'Shortlist only. Weddings and griha pravesh should be confirmed by an expert.' };
}

/** Bhadra = Vishti karana periods falling inside this Hindu day. */
function bhadraPeriods(panch, t) {
  const out = [];
  let start = t.sunrise;
  for (const k of panch._karanaRaw) {
    const end = k.endsAt && k.endsAt < t.nextSunrise ? k.endsAt : t.nextSunrise;
    if (k.bhadra) out.push({ start, end });
    start = end;
    if (start >= t.nextSunrise) break;
  }
  return out;
}
