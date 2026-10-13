// Daily Panchang: the five limbs (tithi, vara, nakshatra, yoga, karana) plus
// sunrise/sunset, moonrise, lunar month, paksha, ritu, samvat and festival flags.
import {
  tropicalLon, siderealLon, nextRiseSet, previousNewMoon, nextNewMoon,
  findAngleCrossing, norm,
} from './astro.js';
import { zonedToUtc, zonedParts, fmtTime, fmtDateTime, parseDate } from './time.js';
import {
  TITHI, NAKSHATRA, YOGA, INAUSPICIOUS_YOGA, KARANA_MOVABLE, MASA, VARA, RASHI,
} from './constants.js';

const NAK_SPAN = 360 / 27;

const tithiAngle = (t) => norm(tropicalLon('Moon', t) - tropicalLon('Sun', t));
const nakAngle = (t) => siderealLon('Moon', t);
const yogaAngle = (t) => norm(siderealLon('Sun', t) + siderealLon('Moon', t));

export function tithiName(idx) {
  const paksha = idx < 15 ? 'Shukla' : 'Krishna';
  const i = idx % 15;
  const name = i === 14 ? (paksha === 'Shukla' ? 'Purnima' : 'Amavasya') : TITHI[i];
  return { index: idx + 1, name, paksha };
}

export function karanaName(k) {
  if (k === 0) return 'Kimstughna';
  if (k >= 57) return ['Shakuni', 'Chatushpada', 'Naga'][k - 57];
  return KARANA_MOVABLE[(k - 1) % 7];
}

/** Sequence of elements of one limb between `from` and `to`, with end times. */
function limbSequence(angleFn, span, from, to, labelFn, maxItems = 4) {
  const out = [];
  let t = from;
  for (let i = 0; i < maxItems && t < to; i++) {
    const idx = Math.floor(angleFn(t) / span);
    const target = norm((idx + 1) * span);
    const end = findAngleCrossing(angleFn, t, target, 3, 1);
    out.push({ ...labelFn(idx), startsAt: i === 0 ? null : t, endsAt: end });
    if (!end) break;
    t = new Date(end.getTime() + 60000);
  }
  return out;
}

export function sunTimes(dateStr, lat, lon, tz) {
  const { year, month, day } = parseDate(dateStr);
  const midnight = zonedToUtc(year, month, day, 0, 0, tz);
  const sunrise = nextRiseSet('Sun', midnight, lat, lon, +1);
  const sunset = nextRiseSet('Sun', sunrise, lat, lon, -1);
  const nextSunrise = nextRiseSet('Sun', sunset, lat, lon, +1);
  const prevSunset = nextRiseSet('Sun', new Date(midnight.getTime() - 86400000), lat, lon, -1);
  const moonrise = nextRiseSet('Moon', midnight, lat, lon, +1);
  const moonset = nextRiseSet('Moon', midnight, lat, lon, -1);
  return { midnight, sunrise, sunset, nextSunrise, prevSunset, moonrise, moonset };
}

export function masaAt(date) {
  const nm = previousNewMoon(date);
  const nn = nextNewMoon(new Date(nm.getTime() + 86400000));
  const signAtNm = Math.floor(siderealLon('Sun', nm) / 30);
  const signAtNext = Math.floor(siderealLon('Sun', nn) / 30);
  const idx = (signAtNm + 1) % 12;
  return { index: idx, name: MASA[idx], adhika: signAtNm === signAtNext, newMoon: nm };
}

const RITU = ['Vasanta', 'Grishma', 'Varsha', 'Sharad', 'Hemanta', 'Shishira'];

// Major festivals keyed by amanta month, paksha and tithi (1-15) at sunrise.
// VERIFY: some festivals use the tithi at pradosh or midnight, and regional
// calendars differ; the consultant should own this table.
const FESTIVALS = [
  ['Chaitra', 'Shukla', 1, 'Gudi Padwa / Ugadi, Chaitra Navratri begins'],
  ['Chaitra', 'Shukla', 9, 'Ram Navami'],
  ['Chaitra', 'Shukla', 15, 'Hanuman Jayanti'],
  ['Vaishakha', 'Shukla', 3, 'Akshaya Tritiya'],
  ['Ashadha', 'Shukla', 11, 'Devshayani Ekadashi'],
  ['Ashadha', 'Shukla', 15, 'Guru Purnima'],
  ['Shravana', 'Shukla', 5, 'Nag Panchami'],
  ['Shravana', 'Shukla', 15, 'Raksha Bandhan'],
  ['Shravana', 'Krishna', 8, 'Janmashtami', 'nishita'],
  ['Bhadrapada', 'Shukla', 4, 'Ganesh Chaturthi'],
  ['Bhadrapada', 'Krishna', 15, 'Sarva Pitru Amavasya'],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ['Ashwin', 'Shukla', d, `Sharad Navratri day ${d}`]),
  ['Ashwin', 'Shukla', 10, 'Dussehra (Vijayadashami)'],
  ['Ashwin', 'Shukla', 15, 'Sharad Purnima'],
  ['Ashwin', 'Krishna', 4, 'Karwa Chauth'],
  ['Ashwin', 'Krishna', 13, 'Dhanteras', 'pradosh'],
  ['Ashwin', 'Krishna', 14, 'Narak Chaturdashi'],
  ['Ashwin', 'Krishna', 15, 'Diwali (Lakshmi Puja)', 'pradosh'],
  ['Kartik', 'Shukla', 1, 'Govardhan Puja / Gujarati New Year'],
  ['Kartik', 'Shukla', 2, 'Bhai Dooj'],
  ['Kartik', 'Shukla', 6, 'Chhath Puja'],
  ['Kartik', 'Shukla', 11, 'Dev Uthani Ekadashi'],
  ['Kartik', 'Shukla', 15, 'Kartik Purnima / Dev Diwali'],
  ['Magha', 'Shukla', 5, 'Vasant Panchami'],
  ['Magha', 'Krishna', 14, 'Maha Shivaratri', 'nishita'],
  ['Phalguna', 'Shukla', 15, 'Holika Dahan', 'pradosh'],
];

export function panchang(dateStr, lat, lon, tz) {
  const st = sunTimes(dateStr, lat, lon, tz);
  const { sunrise, nextSunrise } = st;
  const at = sunrise;

  const tithis = limbSequence(tithiAngle, 12, at, nextSunrise, tithiName);
  const nakshatras = limbSequence(nakAngle, NAK_SPAN, at, nextSunrise, (i) => (
    { index: i + 1, name: NAKSHATRA[i].name, lord: NAKSHATRA[i].lord }
  ));
  nakshatras[0].padaAtSunrise = Math.floor((nakAngle(at) % NAK_SPAN) / (NAK_SPAN / 4)) + 1;
  const yogas = limbSequence(yogaAngle, NAK_SPAN, at, nextSunrise, (i) => ({
    index: i + 1, name: YOGA[i], auspicious: !INAUSPICIOUS_YOGA.has(YOGA[i]),
  }));
  const karanas = limbSequence(tithiAngle, 6, at, nextSunrise, (k) => ({ name: karanaName(k), bhadra: karanaName(k) === 'Vishti' }), 5);

  const vara = zonedParts(sunrise, tz).weekday;
  const masa = masaAt(at);
  const t0 = tithis[0];
  const purnimantaIdx = t0.paksha === 'Krishna' ? (masa.index + 1) % 12 : masa.index;
  const sunSid = siderealLon('Sun', at);
  const moonSid = siderealLon('Moon', at);
  const { year, month } = parseDate(dateStr);
  const earlyYear = month <= 4 && masa.index >= 9; // Pausha, Magha, Phalguna before new year
  const fmt = (x) => ({
    ...x,
    startsAt: x.startsAt ? fmtDateTime(x.startsAt, tz) : undefined,
    endsAt: x.endsAt ? fmtDateTime(x.endsAt, tz) : null,
  });

  const festivals = [];
  // Each festival is matched on the tithi prevailing at its observance time:
  // sunrise by default, sunset + 1 hour for pradosh, mid-night for nishita.
  // If the tithi already held at yesterday's observance time, it was yesterday.
  const lunar = (time) => {
    const ti = tithiName(Math.floor(tithiAngle(time) / 12));
    const ms = masaAt(time);
    return { paksha: ti.paksha, n: ((ti.index - 1) % 15) + 1, masa: ms.name, adhika: ms.adhika };
  };
  const kaalAt = (kaal, sunsetT, sunriseNext) => (kaal === 'pradosh'
    ? new Date(sunsetT.getTime() + 3600000)
    : new Date((sunsetT.getTime() + sunriseNext.getTime()) / 2));
  const is = (l, m, pk, d) => !l.adhika && l.masa === m && l.paksha === pk && l.n === d;
  const atSunrise = lunar(at);
  for (const [m, pk, d, name, kaal] of FESTIVALS) {
    if (!kaal) { if (is(atSunrise, m, pk, d)) festivals.push(name); continue; }
    const today = is(lunar(kaalAt(kaal, st.sunset, nextSunrise)), m, pk, d);
    const yesterday = is(lunar(kaalAt(kaal, st.prevSunset, at)), m, pk, d);
    if (!yesterday && (today || is(atSunrise, m, pk, d))) festivals.push(name);
  }
  for (const t of tithis) {
    const n = (t.index - 1) % 15;
    if (n === 10) festivals.push(`${t.paksha} Ekadashi (fasting day)`);
    if (t.name === 'Purnima') festivals.push('Purnima (full moon)');
    if (t.name === 'Amavasya') festivals.push('Amavasya (new moon)');
    if (n === 12) festivals.push(`${t.paksha} Trayodashi (Pradosh)`);
    if (n === 3 && t.paksha === 'Krishna') festivals.push('Sankashti Chaturthi');
  }

  return {
    date: dateStr,
    location: { lat, lon, tz },
    sunrise: fmtTime(st.sunrise, tz),
    sunset: fmtTime(st.sunset, tz),
    moonrise: fmtTime(st.moonrise, tz),
    moonset: fmtTime(st.moonset, tz),
    vara: VARA[vara],
    tithi: tithis.map(fmt),
    nakshatra: nakshatras.map(fmt),
    yoga: yogas.map(fmt),
    karana: karanas.map(fmt),
    paksha: t0.paksha,
    masa: { amanta: masa.name + (masa.adhika ? ' (Adhika)' : ''), purnimanta: MASA[purnimantaIdx], adhika: masa.adhika },
    ritu: RITU[Math.floor(masa.index / 2)],
    ayana: sunSid >= 270 || sunSid < 90 ? 'Uttarayana' : 'Dakshinayana',
    sunSign: RASHI[Math.floor(sunSid / 30)].sa,
    moonSign: RASHI[Math.floor(moonSid / 30)].sa,
    samvat: {
      vikram: earlyYear ? year + 56 : year + 57,
      shaka: earlyYear ? year - 79 : year - 78,
      note: 'Chaitradi reckoning. Gujarati Vikram Samvat starts from Kartik Shukla Pratipada.',
    },
    festivals: [...new Set(festivals)],
    _raw: st,
    _karanaRaw: karanas,
  };
}
