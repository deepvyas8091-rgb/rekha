// Daily rashi (Moon sign) horoscope from real transits, using classical Gochara:
// each planet's house counted from the Moon sign is favourable or not.
// Deterministic: the same date and sign always give the same scores and text.
import { siderealLon, isRetrograde } from './astro.js';
import { zonedToUtc } from './time.js';
import { RASHI, NAKSHATRA } from './constants.js';

// Houses (from the Moon sign) where a transiting planet gives good results.
const GOOD = {
  Sun: [3, 6, 10, 11], Moon: [1, 3, 6, 7, 10, 11], Mars: [3, 6, 11], Mercury: [2, 4, 6, 8, 10, 11],
  Jupiter: [2, 5, 7, 9, 11], Venus: [1, 2, 3, 4, 5, 8, 9, 11, 12], Saturn: [3, 6, 11], Rahu: [3, 6, 11], Ketu: [3, 6, 11],
};
const AREAS = {
  love: { planets: ['Venus', 'Moon', 'Jupiter'], houses: [5, 7] },
  career: { planets: ['Sun', 'Saturn', 'Mercury'], houses: [10, 6] },
  money: { planets: ['Jupiter', 'Venus', 'Mercury'], houses: [2, 11] },
  energy: { planets: ['Mars', 'Sun', 'Moon'], houses: [1, 3] },
};
// What the day's Moon brings, by its house from your Moon sign.
const MOON_HOUSE = {
  1: 'The Moon is in your own sign today, so feelings run close to the surface. Good for self-care and steady routine.',
  2: 'The Moon moves through your 2nd house of family and money. Watch small expenses and choose your words kindly.',
  3: 'The Moon in your 3rd house lifts courage and communication. A good day to make calls, send proposals and take short trips.',
  4: 'The Moon in your 4th house turns attention to home and comfort. Restlessness is possible; keep plans simple.',
  5: 'The Moon in your 5th house favours creativity, children and romance, though worries can creep in. Keep things light.',
  6: 'The Moon in your 6th house helps you clear tasks and beat obstacles. Good for health routines and sorting work backlogs.',
  7: 'The Moon in your 7th house brings people and partnerships into focus. Good for meetings, deals and time with your partner.',
  8: 'The Moon in your 8th house asks for caution. Avoid risky decisions and arguments; good for research and quiet reflection.',
  9: 'The Moon in your 9th house brings faith, learning and advice from elders. Progress may be slow but meaningful.',
  10: 'The Moon in your 10th house puts work and reputation in the spotlight. A productive day to show what you can do.',
  11: 'The Moon in your 11th house is one of the best placements: gains, good news and help from friends are likely.',
  12: 'The Moon in your 12th house can bring extra spending and tiredness. Rest, pray or plan rather than push.',
};
const SIGN_COLOUR = {
  Sun: ['Orange', 'Gold'], Moon: ['White', 'Silver'], Mars: ['Red', 'Coral'], Mercury: ['Green', 'Emerald'],
  Jupiter: ['Yellow', 'Saffron'], Venus: ['Pink', 'Cream'], Saturn: ['Blue', 'Black'],
};
export const SIGN_SLUGS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

const houseFrom = (planetSign, moonSign) => ((planetSign - moonSign + 12) % 12) + 1;

/** Transit facts and scores for one Moon sign on a date (positions at noon IST). */
export function dailyHoroscope(dateStr, signIdx) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const at = zonedToUtc(y, m, d, 12, 0, 'Asia/Kolkata');
  const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const pos = Object.fromEntries(planets.map((p) => {
    const lon = siderealLon(p, at);
    const sign = Math.floor(lon / 30);
    return [p, { sign, house: houseFrom(sign, signIdx), good: GOOD[p].includes(houseFrom(sign, signIdx)), retro: !['Sun', 'Moon', 'Rahu', 'Ketu'].includes(p) && isRetrograde(p, at), lon }];
  }));

  const scores = {};
  for (const [area, { planets: ps, houses }] of Object.entries(AREAS)) {
    let s = 3;
    for (const p of ps) s += pos[p].good ? 0.5 : -0.5;
    if (houses.includes(pos.Moon.house)) s += 1;
    if (pos.Moon.house === 8 || pos.Moon.house === 12) s -= 0.5;
    scores[area] = Math.max(1, Math.min(5, Math.round(s)));
  }
  const overall = Math.max(1, Math.min(5, Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 4)));

  const sat = pos.Saturn.house;
  const sadeSati = sat === 12 ? 'rising' : sat === 1 ? 'peak' : sat === 2 ? 'setting' : null;
  const lord = RASHI[signIdx].lord;
  const digits = String(y + m + d).split('').reduce((a, b) => a + +b, 0);

  const highlights = [MOON_HOUSE[pos.Moon.house]];
  highlights.push(pos.Jupiter.good
    ? `Jupiter in your ${ord(pos.Jupiter.house)} house supports growth and good advice this season.`
    : `Jupiter in your ${ord(pos.Jupiter.house)} house asks for patience before big financial or family decisions.`);
  if (sadeSati) highlights.push(`Saturn's Sade Sati (${sadeSati} phase) continues for your sign: steady effort pays more than shortcuts.`);
  else if (sat === 4 || sat === 8) highlights.push(`Saturn's Dhaiya (house ${sat}) continues for your sign: keep commitments realistic.`);
  else if (pos.Saturn.good) highlights.push('Saturn favours your sign now: hard work brings lasting rewards.');
  const retros = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].filter((p) => pos[p].retro);
  if (retros.includes('Mercury')) highlights.push('Mercury is retrograde: double-check messages, travel plans and paperwork.');

  return {
    date: dateStr,
    sign: { index: signIdx, sa: RASHI[signIdx].sa, en: RASHI[signIdx].en, hi: RASHI[signIdx].hi, slug: SIGN_SLUGS[signIdx], lord },
    moonTransit: { sign: RASHI[pos.Moon.sign].sa, house: pos.Moon.house, nakshatra: NAKSHATRA[Math.floor(pos.Moon.lon / (360 / 27))].name },
    scores, overall,
    lucky: { colour: SIGN_COLOUR[lord], number: ((digits + signIdx) % 9) + 1 },
    transits: Object.fromEntries(planets.map((p) => [p, { sign: RASHI[pos[p].sign].sa, house: pos[p].house, favourable: pos[p].good, retrograde: pos[p].retro }])),
    sadeSati, retrogrades: retros,
    highlights,
  };
}

/** Plain-text version used when AI is off or paused. */
export function horoscopeText(h) {
  const word = (n) => ['', 'challenging', 'below average', 'steady', 'good', 'excellent'][n];
  return [
    ...h.highlights,
    `Love: ${word(h.scores.love)}. Career: ${word(h.scores.career)}. Money: ${word(h.scores.money)}. Energy: ${word(h.scores.energy)}.`,
    `Lucky colour: ${h.lucky.colour.join(' or ')}. Lucky number: ${h.lucky.number}.`,
  ].join(' ');
}

function ord(n) { return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`; }
