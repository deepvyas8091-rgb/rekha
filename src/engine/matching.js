// Ashtakoota Gun Milan (36 points) from the Moon sign and nakshatra of both people.
import { NAKSHATRA, RASHI, PLANET_FRIENDS } from './constants.js';

const VARNA_BY_SIGN_MOD4 = [3, 2, 1, 4]; // Kshatriya, Vaishya, Shudra, Brahmin
const VARNA_NAME = { 4: 'Brahmin', 3: 'Kshatriya', 2: 'Vaishya', 1: 'Shudra' };

function vashyaGroup(sign, degInSign) {
  if (sign === 8) return degInSign < 15 ? 'Manav' : 'Chatushpad';
  if (sign === 9) return degInSign < 15 ? 'Chatushpad' : 'Jalchar';
  return ['Chatushpad', 'Chatushpad', 'Manav', 'Jalchar', 'Vanchar', 'Manav', 'Manav', 'Keet', null, null, 'Manav', 'Jalchar'][sign];
}
// VERIFY: published Vashya tables differ slightly between schools. Rows = boy, cols = girl.
const VASHYA_GROUPS = ['Chatushpad', 'Manav', 'Jalchar', 'Vanchar', 'Keet'];
const VASHYA_TABLE = [
  [2, 1, 1, 0.5, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0.5, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];

const NADI_PATTERN = [0, 1, 2, 2, 1, 0]; // Adi, Madhya, Antya zig-zag over nakshatras
const NADI_NAME = ['Adi', 'Madhya', 'Antya'];

const YONI_ENEMIES = [
  ['Horse', 'Buffalo'], ['Elephant', 'Lion'], ['Sheep', 'Monkey'], ['Serpent', 'Mongoose'],
  ['Dog', 'Deer'], ['Cat', 'Rat'], ['Cow', 'Tiger'],
];

function relation(a, b) {
  if (a === b) return 'friend';
  const r = PLANET_FRIENDS[a];
  if (r.friends.includes(b)) return 'friend';
  if (r.enemies.includes(b)) return 'enemy';
  return 'neutral';
}

function grahaMaitri(lordA, lordB) {
  if (lordA === lordB) return 5;
  const pair = [relation(lordA, lordB), relation(lordB, lordA)].sort().join('-');
  return {
    'friend-friend': 5, 'friend-neutral': 4, 'neutral-neutral': 3,
    'enemy-friend': 1, 'enemy-neutral': 0.5, 'enemy-enemy': 0,
  }[pair];
}

function gana(boy, girl) {
  if (boy === girl) return 6;
  const key = `${boy}-${girl}`;
  return { 'Deva-Manushya': 6, 'Manushya-Deva': 5, 'Deva-Rakshasa': 0, 'Rakshasa-Deva': 1, 'Manushya-Rakshasa': 0, 'Rakshasa-Manushya': 0 }[key];
}

/** p = { moonLongitude } (sidereal degrees). Boy and girl as in tradition. */
export function gunMilan(boy, girl) {
  const bSign = Math.floor(boy.moonLongitude / 30), gSign = Math.floor(girl.moonLongitude / 30);
  const bNak = Math.floor(boy.moonLongitude / (360 / 27)), gNak = Math.floor(girl.moonLongitude / (360 / 27));
  const B = NAKSHATRA[bNak], G = NAKSHATRA[gNak];
  const kootas = [];

  const bv = VARNA_BY_SIGN_MOD4[bSign % 4], gv = VARNA_BY_SIGN_MOD4[gSign % 4];
  kootas.push({ koota: 'Varna', max: 1, score: bv >= gv ? 1 : 0, detail: `${VARNA_NAME[bv]} / ${VARNA_NAME[gv]}`, area: 'Work and ego compatibility' });

  const bvg = vashyaGroup(bSign, boy.moonLongitude % 30), gvg = vashyaGroup(gSign, girl.moonLongitude % 30);
  kootas.push({ koota: 'Vashya', max: 2, score: VASHYA_TABLE[VASHYA_GROUPS.indexOf(bvg)][VASHYA_GROUPS.indexOf(gvg)], detail: `${bvg} / ${gvg}`, area: 'Mutual attraction and influence' });

  const taraOk = (from, to) => ![3, 5, 7].includes(((to - from + 27) % 27 + 1) % 9);
  const tara = (taraOk(gNak, bNak) ? 1.5 : 0) + (taraOk(bNak, gNak) ? 1.5 : 0);
  kootas.push({ koota: 'Tara', max: 3, score: tara, detail: `${B.name} / ${G.name}`, area: 'Health and well-being' });

  const enemy = YONI_ENEMIES.some(([x, y]) => (B.yoni === x && G.yoni === y) || (B.yoni === y && G.yoni === x));
  kootas.push({ koota: 'Yoni', max: 4, score: B.yoni === G.yoni ? 4 : enemy ? 0 : 2, detail: `${B.yoni} / ${G.yoni}`, area: 'Physical and intimate compatibility', simplified: true });

  kootas.push({ koota: 'Graha Maitri', max: 5, score: grahaMaitri(RASHI[bSign].lord, RASHI[gSign].lord), detail: `${RASHI[bSign].lord} / ${RASHI[gSign].lord}`, area: 'Mental compatibility and friendship' });

  kootas.push({ koota: 'Gana', max: 6, score: gana(B.gana, G.gana), detail: `${B.gana} / ${G.gana}`, area: 'Temperament' });

  const dist = ((bSign - gSign + 12) % 12) + 1;
  const bhakootBad = [2, 12, 5, 9, 6, 8].includes(dist);
  kootas.push({ koota: 'Bhakoot', max: 7, score: bhakootBad ? 0 : 7, detail: `${RASHI[bSign].sa} / ${RASHI[gSign].sa}`, area: 'Family welfare and finances' });

  const bn = NADI_PATTERN[bNak % 6], gn = NADI_PATTERN[gNak % 6];
  kootas.push({ koota: 'Nadi', max: 8, score: bn === gn ? 0 : 8, detail: `${NADI_NAME[bn]} / ${NADI_NAME[gn]}`, area: 'Health of progeny and genes' });

  const total = kootas.reduce((s, k) => s + k.score, 0);
  const doshas = [];
  if (bn === gn) doshas.push('Nadi Dosha');
  if (bhakootBad) doshas.push('Bhakoot Dosha');
  if (kootas[5].score === 0) doshas.push('Gana Dosha');

  return {
    total, max: 36, kootas, doshas,
    verdict: total >= 33 ? 'Excellent match' : total >= 25 ? 'Very good match' : total >= 18 ? 'Acceptable match' : 'Not recommended without detailed analysis',
    note: 'Dosha cancellation rules (e.g. same rashi lord) are not applied. Present as guidance and offer an expert consultation.',
  };
}
