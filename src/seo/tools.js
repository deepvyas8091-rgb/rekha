// Free calculators at /tools: Moon sign, nakshatra, Lagna, dasha, Manglik, Sade Sati and kundli
// matching. Each page is a form plus the method and common questions; the result comes from
// POST /api/tools/<slug>, worked out by the same engine as the app. Nothing here calls AI.
import express from 'express';
import { TOOLS, TOOL_BY_SLUG, TOOLS_NOTE } from '../content/tools-info.js';
import { kundli } from '../engine/kundli.js';
import { gunMilan } from '../engine/matching.js';
import { siderealLon } from '../engine/astro.js';
import { RASHI, NAKSHATRA, DASHA_YEARS } from '../engine/constants.js';
import { zonedToUtc } from '../engine/time.js';
import { clientIp } from '../env.js';
import { tFor, dataT, LANGS, localePath } from '../i18n/index.js';
import { esc } from './layout.js';

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

// ---- input -------------------------------------------------------------------------------
function birthOf(b) {
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return null;
  const year = +b.date.slice(0, 4);
  if (year < 1900 || year > new Date().getUTCFullYear() + 1 || Number.isNaN(Date.parse(`${b.date}T00:00:00Z`))) return null;
  const lat = +b.lat; const lon = +b.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 66 || Math.abs(lon) > 180) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: String(b.tz) }); } catch { return null; }
  const timed = /^\d{2}:\d{2}$/.test(b.time || '');
  return { date: b.date, time: timed ? b.time : '12:00', timed, lat, lon, tz: String(b.tz), city: String(b.city || '').slice(0, 60) };
}

// ---- Sade Sati dates -----------------------------------------------------------------------
// Saturn's sidereal sign every 5 days from 32 years back to 62 years ahead, worked out once a day.
let satScan = null;
function saturnSigns() {
  const today = iso(new Date());
  if (satScan?.day === today) return satScan.list;
  const list = []; const start = Date.now() - 32 * 365.25 * DAY; const end = Date.now() + 62 * 365.25 * DAY;
  for (let t = start; t <= end; t += 5 * DAY) list.push([t, Math.floor(siderealLon('Saturn', new Date(t)) / 30)]);
  satScan = { day: today, list };
  return list;
}
/** Sade Sati periods for a Moon sign: [{ start, end }] from first entry into the 12th sign to last exit from the 2nd. */
export function sadeSatiPeriods(moonSign) {
  const inSpan = (s) => [12, 1, 2].includes(((s - moonSign + 12) % 12) + 1);
  const out = []; let cur = null; let lastIn = null;
  for (const [t, s] of saturnSigns()) {
    if (inSpan(s)) { if (!cur) cur = { start: t }; lastIn = t; } else if (cur && t - lastIn > 400 * DAY) { out.push({ start: cur.start, end: lastIn }); cur = null; }
  }
  if (cur) out.push({ start: cur.start, end: lastIn, open: true });
  // A period already under way at the start of the scan has no known beginning, so it is left out.
  const first = saturnSigns()[0][0];
  while (out.length && out[0].start === first) out.shift();
  // The scan steps five days at a time; walk each edge a day at a time to the exact date.
  const at = (t) => inSpan(Math.floor(siderealLon('Saturn', new Date(t)) / 30));
  for (const p of out) {
    for (let i = 0; i < 5 && at(p.start - DAY); i++) p.start -= DAY;
    if (!p.open) for (let i = 0; i < 5 && at(p.end + DAY); i++) p.end += DAY;
  }
  return out.map((p) => ({ start: iso(new Date(p.start)), end: iso(new Date(p.end)), open: !!p.open }));
}

// Without a birth time the Lagna is unknown, so the check rests on the Moon and Venus only.
const mangalStatus = (k, b) => (b.timed ? k.manglik.status : (k.manglik.fromMoon || k.manglik.fromVenus ? 'Mild (Anshik) Manglik' : 'Not Manglik'));

// ---- results -------------------------------------------------------------------------------
/** The result of one tool as text ready to show: { headline, sub, rows: [[label, value]], table, notes: [] }. */
export function toolResult(tool, body, lang = 'en') {
  const tt = tFor(lang); const dt = (s) => dataT(lang, s);
  const sign = (i) => (lang === 'en' ? `${RASHI[i].sa} (${RASHI[i].en})` : dt(RASHI[i].sa));
  const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(LANGS[lang].locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const yes = (v) => (v ? tt('Yes') : tt('No'));
  const a = birthOf(body.a); if (!a) return null;
  const k = kundli(a); const moon = k.planets.find((p) => p.planet === 'Moon');
  const notes = [];
  // Without a birth time the Moon is checked across the whole day.
  let moonEither = null;
  if (!a.timed) {
    const [y, m, d] = a.date.split('-').map(Number);
    const at = (h, mi) => Math.floor(siderealLon('Moon', zonedToUtc(y, m, d, h, mi, a.tz)) / 30);
    const s0 = at(0, 0); const s1 = at(23, 59);
    if (s0 !== s1) moonEither = [s0, s1];
  }
  const noTime = tt('No birth time was given, so noon was used. Add the time for an exact result.');

  if (tool.kind === 'moon') {
    if (moonEither) notes.push(tt('The Moon changed sign on this day. Without a birth time your Moon sign is either {a} or {b}.', { a: sign(moonEither[0]), b: sign(moonEither[1]) }));
    else if (!a.timed) notes.push(tt('The Moon stayed in one sign all day, so your Moon sign is certain even without a birth time. The nakshatra and pada may differ.'));
    return {
      headline: moonEither ? tt('Your Moon sign is {a} or {b}', { a: sign(moonEither[0]), b: sign(moonEither[1]) }) : tt('Your Moon sign (Rashi) is {sign}', { sign: sign(moon.sign) }),
      rows: [[tt('Moon position'), `${moon.degree} ${dt(moon.signName)}`], [tt('Sign lord'), dt(RASHI[moon.sign].lord)], [tt('Birth star (nakshatra)'), `${dt(moon.nakshatra)}, ${tt('pada {n}', { n: moon.pada })}`], [tt('Western Sun sign'), dt(k.sunSignWestern)]],
      notes,
    };
  }
  if (tool.kind === 'nakshatra') {
    const n = NAKSHATRA[moon.nakshatraIndex];
    if (!a.timed) notes.push(noTime);
    return {
      headline: tt('Your birth nakshatra is {name}, pada {n}', { name: dt(n.name), n: moon.pada }),
      rows: [[tt('Ruling planet'), dt(n.lord)], [tt('Gana'), dt(n.gana)], [tt('Yoni'), dt(n.yoni)], [tt('Moon sign (Rashi)'), sign(moon.sign)],
        [tt('Dasha at birth'), tt('{planet}, {years} years left', { planet: dt(k.dasha.balanceAtBirth.lord), years: k.dasha.balanceAtBirth.years })]],
      notes,
    };
  }
  if (tool.kind === 'lagna') {
    if (!a.timed) return { headline: tt('A birth time is needed for the Lagna'), rows: [[tt('Moon sign (Rashi)'), sign(moon.sign)], [tt('Birth star (nakshatra)'), dt(moon.nakshatra)]], notes: [tt('The Lagna changes sign about every two hours, so it cannot be worked out from the date alone.')] };
    notes.push(tt('The Lagna changes sign about every two hours. If your birth time is uncertain by more than a few minutes, check the times just before and after.'));
    return {
      headline: tt('Your Lagna (ascendant) is {sign}', { sign: sign(k.lagna.sign) }),
      rows: [[tt('Rising degree'), `${k.lagna.degree} ${dt(k.lagna.signName)}`], [tt('Lagna lord'), dt(RASHI[k.lagna.sign].lord)], [tt('Nakshatra of the Lagna'), `${dt(k.lagna.nakshatra)}, ${tt('pada {n}', { n: k.lagna.pada })}`], [tt('Moon sign (Rashi)'), sign(moon.sign)]],
      notes,
    };
  }
  if (tool.kind === 'dasha') {
    const today = iso(new Date());
    const md = k.dasha.periods.find((p) => today >= p.start && today < p.end);
    const ad = md?.antardasha.find((p) => today >= p.start && today < p.end);
    if (!a.timed) notes.push(tt('No birth time was given, so noon was used. The dates can be off by several months; add the time for exact dates.'));
    return {
      headline: md ? tt('You are in {maha} Mahadasha, {antar} Antardasha', { maha: dt(md.lord), antar: dt(ad?.lord || md.lord) }) : tt('Your Vimshottari dashas'),
      rows: [...(md ? [[tt('Mahadasha ends'), day(md.end)], [tt('Antardasha ends'), day(ad?.end || md.end)]] : []),
        [tt('Birth star (nakshatra)'), dt(moon.nakshatra)], [tt('Dasha at birth'), tt('{planet}, {years} years left', { planet: dt(k.dasha.balanceAtBirth.lord), years: k.dasha.balanceAtBirth.years })]],
      table: { head: [tt('Mahadasha'), tt('From'), tt('To'), tt('Years')], rows: k.dasha.periods.map((p) => [dt(p.lord), day(p.start), day(p.end), String(DASHA_YEARS[p.lord])]), mark: md ? k.dasha.periods.indexOf(md) : -1 },
      sub: md ? { title: tt('Antardashas in this Mahadasha'), head: [tt('Antardasha'), tt('From'), tt('To')], rows: md.antardasha.map((p) => [dt(p.lord), day(p.start), day(p.end)]), mark: ad ? md.antardasha.indexOf(ad) : -1 } : null,
      notes,
    };
  }
  if (tool.kind === 'manglik') {
    const mars = k.planets.find((p) => p.planet === 'Mars'); const m = k.manglik;
    const venus = k.planets.find((p) => p.planet === 'Venus');
    const house = (from) => ((mars.sign - from + 12) % 12) + 1;
    const status = mangalStatus(k, a);
    if (!a.timed) notes.push(tt('No birth time was given, so the check from the Lagna was skipped. This result is from the Moon and Venus only.'));
    notes.push(tt('Cancellations are not applied here. Mars in its own sign, or both partners being Manglik, are widely held to reduce the dosha.'));
    return {
      headline: tt('Result: {status}', { status: dt(status) }),
      rows: [[tt('Mars is in'), sign(mars.sign)],
        ...(a.timed ? [[tt('From the Lagna'), `${tt('house {n}', { n: mars.house })}: ${yes(m.fromLagna)}`]] : []),
        [tt('From the Moon'), `${tt('house {n}', { n: house(moon.sign) })}: ${yes(m.fromMoon)}`],
        [tt('From Venus'), `${tt('house {n}', { n: house(venus.sign) })}: ${yes(m.fromVenus)}`]],
      notes,
    };
  }
  if (tool.kind === 'sadesati') {
    const today = iso(new Date()); const ss = k.sadeSati;
    const periods = sadeSatiPeriods(moon.sign);
    const now = periods.find((p) => today >= p.start && today <= p.end); const next = periods.find((p) => p.start > today); const last = [...periods].reverse().find((p) => p.end < today);
    if (moonEither) notes.push(tt('The Moon changed sign on this day. Without a birth time your Moon sign is either {a} or {b}.', { a: sign(moonEither[0]), b: sign(moonEither[1]) }));
    const span = (p) => `${day(p.start)} – ${p.open ? '…' : day(p.end)}`;
    return {
      headline: ss.active ? tt('Sade Sati is running: {phase}', { phase: dt(ss.phase) }) : tt('Sade Sati is not running for you now'),
      rows: [[tt('Moon sign (Rashi)'), sign(moon.sign)], [tt('Saturn is now in'), sign(Math.floor(siderealLon('Saturn', new Date()) / 30))],
        ...(now ? [[tt('This Sade Sati'), span(now)]] : []), ...(ss.dhaiya ? [[tt('Shani Dhaiya'), tt('Running now')]] : []),
        ...(next ? [[tt('Next Sade Sati'), span(next)]] : []), ...(last ? [[tt('Previous Sade Sati'), span(last)]] : [])],
      notes,
    };
  }
  if (tool.kind === 'match') {
    const b = birthOf(body.b); if (!b) return null;
    const k2 = kundli(b); const moon2 = k2.planets.find((p) => p.planet === 'Moon');
    const g = gunMilan({ moonLongitude: moon.longitude }, { moonLongitude: moon2.longitude });
    const total = g.total ?? g.kootas.reduce((s, x) => s + x.score, 0);
    const verdict = total >= 32 ? tt('Excellent match by tradition') : total >= 24 ? tt('Good match by tradition') : total >= 18 ? tt('Acceptable match by tradition') : tt('Below the traditional minimum of 18');
    if (!a.timed || !b.timed) notes.push(tt('A birth time is missing, so noon was used. The score can change if the Moon was near the edge of a nakshatra, and the Manglik check then uses the Moon and Venus only.'));
    notes.push(tt('The score uses only the Moon in each chart. Treat it as one input, not a verdict.'));
    return {
      headline: tt('{score} out of 36', { score: total }), lead: verdict,
      rows: [[tt('Groom: Moon sign and nakshatra'), `${sign(moon.sign)}, ${dt(moon.nakshatra)}`], [tt('Bride: Moon sign and nakshatra'), `${sign(moon2.sign)}, ${dt(moon2.nakshatra)}`],
        [tt('Doshas found'), (g.doshas || []).length ? g.doshas.map(dt).join(', ') : tt('None')],
        [tt('Manglik status'), `${tt('Groom')}: ${dt(mangalStatus(k, a))} · ${tt('Bride')}: ${dt(mangalStatus(k2, b))}`]],
      table: { head: [tt('Koota'), tt('Score'), tt('What it shows')], rows: g.kootas.map((x) => [dt(x.koota), `${x.score} / ${x.max}`, dt(x.area)]), mark: -1 },
      notes,
    };
  }
  return null;
}

// ---- pages ---------------------------------------------------------------------------------
const person = (tt, id, legend) => `<fieldset class="tool-person" data-person="${id}">${legend ? `<legend>${esc(legend)}</legend>` : ''}
  <div class="two"><label>${esc(tt('Date of birth'))}<input type="date" name="date" required min="1900-01-01"></label>
  <label>${esc(tt('Time of birth'))}<input type="time" name="time"></label></div>
  <label class="check"><input type="checkbox" name="notime"> <span>${esc(tt('I do not know the birth time'))}</span></label>
  <label>${esc(tt('Place of birth'))}<input type="text" name="place" autocomplete="off" required placeholder="${esc(tt('Start typing a city'))}"></label>
  <div class="tool-places" role="listbox"></div></fieldset>`;

const CSS = `<style>.tool-person{border:0;padding:0;margin:0 0 var(--s3);display:grid;gap:var(--s3)}.tool-person legend{font-weight:600;margin-bottom:var(--s2)}
.tool-places{display:grid;gap:4px}.tool-places button{text-align:left;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);font:inherit;color:inherit;cursor:pointer}
.tool-out .big{font-size:1.35rem;font-weight:700;line-height:1.3}.tool-out tr.on{font-weight:700;background:rgba(201,99,27,.1)}.tool-grid{display:grid;gap:var(--s4)}.tool-out h3{margin:var(--s4) 0 var(--s2)}
@media(min-width:860px){.tool-grid{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);align-items:start}}</style>`;

const script = (slug, lang, msg) => `<script>(function(){
var f=document.getElementById('toolForm'),out=document.getElementById('toolOut'),M=${JSON.stringify(msg)};
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
f.querySelectorAll('.tool-person').forEach(function(p){
  var inp=p.querySelector('[name=place]'),box=p.querySelector('.tool-places'),tm=p.querySelector('[name=time]'),nt=p.querySelector('[name=notime]'),timer;
  nt.addEventListener('change',function(){tm.disabled=nt.checked;if(nt.checked)tm.value=''});
  inp.addEventListener('input',function(){p._place=null;clearTimeout(timer);var q=inp.value.trim();if(q.length<2){box.textContent='';return}
    timer=setTimeout(function(){fetch('/api/places?q='+encodeURIComponent(q)).then(function(r){return r.json()}).then(function(list){box.textContent='';
      list.forEach(function(c){var b=el('button',null,c.name+(c.region?', '+c.region:'')+', '+c.country);b.type='button';b.addEventListener('click',function(){p._place=c;inp.value=b.textContent;box.textContent=''});box.appendChild(b)})}).catch(function(){})},200)});
});
function read(p){if(!p._place)return null;var t=p.querySelector('[name=time]').value;return{date:p.querySelector('[name=date]').value,time:p.querySelector('[name=notime]').checked?'':t,lat:p._place.lat,lon:p._place.lon,tz:p._place.tz,city:p._place.name}}
function table(t){var w=el('div','table-wrap card'),tb=el('table'),h=el('thead'),hr=el('tr'),b=el('tbody');t.head.forEach(function(x){hr.appendChild(el('th',null,x))});h.appendChild(hr);tb.appendChild(h);
  t.rows.forEach(function(r,i){var tr=el('tr',i===t.mark?'on':'');r.forEach(function(x){tr.appendChild(el('td',null,x))});b.appendChild(tr)});tb.appendChild(b);w.appendChild(tb);return w}
f.addEventListener('submit',function(e){e.preventDefault();var ps=f.querySelectorAll('.tool-person'),a=read(ps[0]),b=ps[1]?read(ps[1]):null;
  if(!a||(ps[1]&&!b)){out.textContent='';out.appendChild(el('p','form-error q-bad',M.place));return}
  out.textContent='';out.appendChild(el('p','hint',M.wait));
  fetch('/api/tools/${slug}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({a:a,b:b,lang:${JSON.stringify(lang)}})}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){
    out.textContent='';if(!x.ok){out.appendChild(el('p','form-error q-bad',x.j.error||M.fail));return}var r=x.j;
    var c=el('div','card now');c.appendChild(el('div','big',r.headline));if(r.lead)c.appendChild(el('div','sub',r.lead));out.appendChild(c);
    var w=el('div','table-wrap card'),tb=el('table'),bd=el('tbody');r.rows.forEach(function(row){var tr=el('tr'),th=el('th',null,row[0]);th.scope='row';tr.appendChild(th);var td=el('td');td.appendChild(el('strong',null,row[1]));tr.appendChild(td);bd.appendChild(tr)});tb.appendChild(bd);w.appendChild(tb);out.appendChild(w);
    if(r.table)out.appendChild(table(r.table));if(r.sub){out.appendChild(el('h3',null,r.sub.title));out.appendChild(table(r.sub))}
    (r.notes||[]).forEach(function(n){out.appendChild(el('p','hint',n))});
    if(window.rk)rk('tool_used',{tool:'${slug}'});out.scrollIntoView({behavior:'smooth',block:'nearest'});
  }).catch(function(){out.textContent='';out.appendChild(el('p','form-error q-bad',M.fail))});
});})();</script>`;

const hits = new Map();
export function toolRoutes(app, { page, send, cached, faqLd, baseOf, langOf, helpers }) {
  app.get('/tools', (req, res) => {
    const lang = langOf(req);
    send(res, cached(`tools:${lang}`, 6 * 3600000, () => {
      const tt = tFor(lang); const dt = (s) => dataT(lang, s);
      return page({
        lang, base: baseOf(req), path: '/tools',
        title: tt('Free Vedic Astrology Calculators: Rashi, Nakshatra, Lagna, Dasha, Manglik'),
        description: tt('Free calculators for Moon sign, nakshatra, Lagna, Vimshottari dasha, Manglik dosha, Sade Sati and kundli matching. Full results, no sign-up.'),
        h1: tt('Free astrology calculators'), lede: tt('Worked out from your birth details with the same calculations as the Rekha app. Full results, no sign-up.'),
        crumbs: [[tt('Free tools'), '/tools']],
        body: `<ul class="link-grid">${TOOLS.map((x) => `<li><a href="/tools/${x.slug}"><strong>${esc(dt(x.name))}</strong></a><p class="hint">${esc(dt(x.lede))}</p></li>`).join('')}</ul>
          <p class="hint">${esc(dt(TOOLS_NOTE))}</p>`,
      });
    }), 3600);
  });

  app.get('/tools/:slug', (req, res, next) => {
    const tool = TOOL_BY_SLUG.get(req.params.slug); if (!tool) return next();
    const lang = langOf(req);
    send(res, cached(`tool:${lang}:${tool.slug}`, 6 * 3600000, () => {
      const tt = tFor(lang); const dt = (s) => dataT(lang, s);
      const faq = tool.faq.map(([q, a]) => [dt(q), dt(a)]);
      const base = baseOf(req);
      const app_ld = { '@context': 'https://schema.org', '@type': 'WebApplication', name: dt(tool.name), url: `${base}${localePath(lang, `/tools/${tool.slug}`)}`, applicationCategory: 'LifestyleApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' } };
      const match = tool.kind === 'match';
      return page({
        lang, base, path: `/tools/${tool.slug}`,
        title: dt(tool.title), description: dt(tool.description), h1: dt(tool.h1), lede: dt(tool.lede),
        crumbs: [[tt('Free tools'), '/tools'], [dt(tool.name), `/tools/${tool.slug}`]],
        jsonld: [...faqLd(faq), app_ld],
        body: `${CSS}<div class="tool-grid"><section class="card"><form id="toolForm" class="form" novalidate>
            ${match ? person(tt, 'a', tt('Groom')) + person(tt, 'b', tt('Bride')) : person(tt, 'a', '')}
            <button class="primary">${esc(dt(tool.button))}</button>
            <p class="hint">${esc(tt('Your details are used for this calculation only. They are not saved and no account is created.'))}</p>
          </form></section>
          <section class="tool-out" id="toolOut" aria-live="polite"><p class="hint">${esc(tt('Enter the birth details and your result will appear here.'))}</p></section></div>
          ${script(tool.slug, lang, { place: tt('Choose the place of birth from the list.'), wait: tt('Calculating…'), fail: tt('That did not work. Check the details and try again.') })}
          <section class="faq"><h2>${esc(tt('Frequently asked questions'))}</h2>${faq.map(([q, a]) => `<details class="card fold" open><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join('')}</section>
          <section class="card"><h2>${esc(tt('How this is calculated'))}</h2><ul>${tool.method.map((m) => `<li>${esc(dt(m))}</li>`).join('')}</ul>
            <p class="hint">${esc(dt(TOOLS_NOTE))} <a href="/insights/${tool.article}">${esc(tt('Read the guide'))}</a> · <a href="/insights/how-rekha-works">${esc(tt('How Rekha calculates'))}</a></p></section>
          ${helpers(lang).cta(tt('Your full kundli and reading'), '/?tab=chart', tt('Chart, dashas and an AI reading based on these calculations, in the Rekha app.'))}
          <section class="block"><h2>${esc(tt('More free tools'))}</h2><ul class="link-grid">${tool.related.map((s) => TOOL_BY_SLUG.get(s)).map((x) => `<li><a href="/tools/${x.slug}">${esc(dt(x.name))}</a></li>`).join('')}<li><a href="/tools">${esc(tt('All free tools'))}</a></li></ul></section>`,
      });
    }), 3600);
  });

  app.post('/api/tools/:slug', express.json({ limit: '4kb' }), (req, res) => {
    const tool = TOOL_BY_SLUG.get(req.params.slug);
    const lang = LANGS[req.body?.lang] ? req.body.lang : 'en';
    const tt = tFor(lang);
    if (!tool) return res.status(404).json({ error: 'not found' });
    // 120 calculations an hour per visitor is far more than a person needs and stops scripted abuse.
    const key = clientIp(req); const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < 3600000);
    if (recent.length >= 120) return res.status(429).json({ error: tt('Too many calculations. Please try again in an hour.') });
    recent.push(now); hits.set(key, recent); if (hits.size > 20000) hits.clear();
    let r = null;
    try { r = toolResult(tool, req.body || {}, lang); } catch { r = null; }
    if (!r) return res.status(400).json({ error: tt('Check the date, time and place of birth.') });
    res.set('Cache-Control', 'private, no-store').json(r);
  });
}
