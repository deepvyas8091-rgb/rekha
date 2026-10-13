// Non-Vedic systems for Southeast Asia and the diaspora: Chinese BaZi (Four
// Pillars) and zodiac, Vietnamese zodiac variant, Thai birth-day colours,
// Western sun sign, and Pythagorean + Chaldean numerology.
import { tropicalLon } from './astro.js';
import { zonedParts } from './time.js';

const STEMS = [
  { zh: '甲', py: 'Jia', el: 'Wood', yin: false }, { zh: '乙', py: 'Yi', el: 'Wood', yin: true },
  { zh: '丙', py: 'Bing', el: 'Fire', yin: false }, { zh: '丁', py: 'Ding', el: 'Fire', yin: true },
  { zh: '戊', py: 'Wu', el: 'Earth', yin: false }, { zh: '己', py: 'Ji', el: 'Earth', yin: true },
  { zh: '庚', py: 'Geng', el: 'Metal', yin: false }, { zh: '辛', py: 'Xin', el: 'Metal', yin: true },
  { zh: '壬', py: 'Ren', el: 'Water', yin: false }, { zh: '癸', py: 'Gui', el: 'Water', yin: true },
];
const BRANCHES = [
  { zh: '子', py: 'Zi', animal: 'Rat', el: 'Water' }, { zh: '丑', py: 'Chou', animal: 'Ox', el: 'Earth' },
  { zh: '寅', py: 'Yin', animal: 'Tiger', el: 'Wood' }, { zh: '卯', py: 'Mao', animal: 'Rabbit', el: 'Wood' },
  { zh: '辰', py: 'Chen', animal: 'Dragon', el: 'Earth' }, { zh: '巳', py: 'Si', animal: 'Snake', el: 'Fire' },
  { zh: '午', py: 'Wu', animal: 'Horse', el: 'Fire' }, { zh: '未', py: 'Wei', animal: 'Goat', el: 'Earth' },
  { zh: '申', py: 'Shen', animal: 'Monkey', el: 'Metal' }, { zh: '酉', py: 'You', animal: 'Rooster', el: 'Metal' },
  { zh: '戌', py: 'Xu', animal: 'Dog', el: 'Earth' }, { zh: '亥', py: 'Hai', animal: 'Pig', el: 'Water' },
];
const VIET_ANIMAL = { Ox: 'Buffalo', Rabbit: 'Cat' };

const pillar = (stem, branch) => ({
  stem: STEMS[stem], branch: BRANCHES[branch],
  label: `${STEMS[stem].py}-${BRANCHES[branch].py} (${STEMS[stem].el} ${BRANCHES[branch].animal})`,
});

function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/**
 * BaZi from a UTC birth instant and time zone. Year and month pillars use solar
 * terms (Lichun at Sun longitude 315 degrees), as BaZi practitioners do.
 * Day pillar: (JDN - 11) mod 60, anchored on 2000-01-01 = Wu-Wu.
 */
export function bazi(utc, tz) {
  const p = zonedParts(utc, tz);
  const sun = tropicalLon('Sun', utc);
  // Before Lichun (Sun between 270 and 315) the BaZi year is the previous year.
  const beforeLichun = p.month <= 2 && sun >= 270 && sun < 315;
  const y = beforeLichun ? p.year - 1 : p.year;
  const ys = (((y - 4) % 10) + 10) % 10, yb = (((y - 4) % 12) + 12) % 12;
  const monthIdx = Math.floor((((sun - 315) % 360 + 360) % 360) / 30); // 0 = Yin month
  const mb = (monthIdx + 2) % 12;
  const ms = ((ys % 5) * 2 + 2 + monthIdx) % 10;
  const dIdx = (((jdn(p.year, p.month, p.day) - 11) % 60) + 60) % 60;
  const ds = dIdx % 10, db = dIdx % 12;
  const hb = Math.floor(((p.hour + 1) % 24) / 2);
  const hs = ((ds % 5) * 2 + hb) % 10;

  const pillars = { year: pillar(ys, yb), month: pillar(ms, mb), day: pillar(ds, db), hour: pillar(hs, hb) };
  const elements = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  for (const pl of Object.values(pillars)) { elements[pl.stem.el]++; elements[pl.branch.el]++; }
  const missing = Object.entries(elements).filter(([, v]) => v === 0).map(([k]) => k);
  return {
    pillars,
    dayMaster: `${STEMS[ds].el} (${STEMS[ds].yin ? 'Yin' : 'Yang'} ${STEMS[ds].py})`,
    elements, missingElements: missing,
    zodiac: { chinese: BRANCHES[yb].animal, vietnamese: VIET_ANIMAL[BRANCHES[yb].animal] || BRANCHES[yb].animal },
  };
}

// Thai tradition: colour of the weekday of birth, plus lucky and unlucky colours.
const THAI_DAY = [
  { day: 'Sunday', colour: 'Red', lucky: ['Green', 'Black'], avoid: 'Blue' },
  { day: 'Monday', colour: 'Yellow', lucky: ['White', 'Cream'], avoid: 'Red' },
  { day: 'Tuesday', colour: 'Pink', lucky: ['Purple', 'Black'], avoid: 'White' },
  { day: 'Wednesday', colour: 'Green', lucky: ['Orange', 'Yellow'], avoid: 'Pink' },
  { day: 'Thursday', colour: 'Orange', lucky: ['Green', 'Red'], avoid: 'Purple' },
  { day: 'Friday', colour: 'Light blue', lucky: ['Pink', 'Green'], avoid: 'Grey' },
  { day: 'Saturday', colour: 'Purple', lucky: ['Black', 'Blue'], avoid: 'Green' },
];
// VERIFY lucky/avoid lists with a Thai consultant; the birth-day colour itself is standard.
export function thaiColours(utc, tz) {
  return THAI_DAY[zonedParts(utc, tz).weekday];
}
export function thaiColourOfDay(date, tz) {
  const d = THAI_DAY[zonedParts(date, tz).weekday];
  return { day: d.day, wear: d.lucky, avoid: d.avoid };
}

export function westernSunSign(utc) {
  const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  return signs[Math.floor(tropicalLon('Sun', utc) / 30)];
}

const reduce = (n, keepMaster = true) => {
  while (n > 9 && !(keepMaster && [11, 22, 33].includes(n))) n = String(n).split('').reduce((s, c) => s + +c, 0);
  return n;
};
const CHALDEAN = { a: 1, i: 1, j: 1, q: 1, y: 1, b: 2, k: 2, r: 2, c: 3, g: 3, l: 3, s: 3, d: 4, m: 4, t: 4, e: 5, h: 5, n: 5, x: 5, u: 6, v: 6, w: 6, o: 7, z: 7, f: 8, p: 8 };

export function numerology(dateStr, name = '') {
  const [y, m, d] = dateStr.split('-');
  const sumDigits = (s) => s.split('').reduce((a, c) => a + +c, 0);
  const lifePath = reduce(reduce(sumDigits(y)) + reduce(sumDigits(m)) + reduce(sumDigits(d)));
  const out = { lifePath, birthNumber: reduce(+d, false) };
  if (name) {
    const total = name.toLowerCase().split('').reduce((s, c) => s + (CHALDEAN[c] || 0), 0);
    out.chaldeanNameNumber = { compound: total, single: reduce(total, false) };
  }
  return out;
}
