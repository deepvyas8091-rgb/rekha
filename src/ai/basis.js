// The calculated facts a reading is allowed to use, each with a short id (F1, F2 ...).
// The AI cites these ids under every section, and the app shows them as "Based on: ...",
// so every paragraph can be traced back to a placement, a palm line or today's timing.
// Names and values are the English engine terms; the browser translates them.

/**
 * @param {object} p      birthProfile() result
 * @param {object} extra  { palm, face, today } (any may be missing)
 * @returns {{id:string, group:'chart'|'palm'|'face'|'today', name:string, value:string|string[], house?:number, retro?:boolean}[]}
 */
export function basisFor(p, { palm, face, today } = {}) {
  const out = [];
  const add = (group, name, value, more = {}) => {
    if (value == null || value === '' || (Array.isArray(value) && !value.filter(Boolean).length)) return;
    out.push({ id: `F${out.length + 1}`, group, name, value, ...more });
  };
  if (p?.vedic) {
    const v = p.vedic;
    add('chart', 'Lagna (ascendant)', v.lagna.signName);
    add('chart', 'Moon sign (Rashi)', v.moonSign);
    add('chart', 'Birth nakshatra', v.birthNakshatra);
    for (const x of v.planets) add('chart', x.planet, x.signName, { house: x.house, retro: !!x.retrograde && !['Rahu', 'Ketu'].includes(x.planet) });
    const cur = v.dasha.current;
    if (cur) add('chart', 'Current dasha', [cur.mahadasha, cur.antardasha]);
    add('chart', 'Sade Sati', v.sadeSati.active ? v.sadeSati.phase : 'Not active');
    add('chart', 'Manglik', v.manglik.status);
    add('chart', 'Western sun sign', p.western?.sunSign || v.sunSignWestern);
    if (p.chinese) { add('chart', 'Chinese zodiac', p.chinese.zodiac.chinese); add('chart', 'BaZi day master', p.chinese.dayMaster); }
    if (p.numerology?.lifePath) add('chart', 'Life path number', String(p.numerology.lifePath));
  }
  for (const f of (palm?.facts || []).slice(0, 30)) add('palm', f.source, f.fact);
  for (const f of (face?.facts || []).slice(0, 20)) add('face', f.source, f.fact);
  if (today) {
    if (today.personal?.dayRating) add('today', 'Day rating', today.personal.dayRating);
    const w = today.bestWindows?.[0];
    if (w) add('today', 'Best window today', `${w.start}–${w.end}`);
    for (const b of (today.badTimes || []).slice(0, 3)) add('today', b.name, `${b.start}–${b.end}`);
  }
  return out;
}

/** One line per fact for the model: "F3 Birth nakshatra: Pushya". */
export function basisLines(basis) {
  return basis.map((b) => `${b.id} ${b.name}: ${Array.isArray(b.value) ? b.value.join(' / ') : b.value}${b.house ? ` (house ${b.house})` : ''}${b.retro ? ' retrograde' : ''}`).join('\n');
}

/** Keep only ids that exist, in order, without repeats (the model must not cite facts it was not given). */
export function cleanBasis(ids, basis) {
  const known = new Set(basis.map((b) => b.id));
  return [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x).trim().toUpperCase()).filter((x) => known.has(x)))].slice(0, 8);
}
