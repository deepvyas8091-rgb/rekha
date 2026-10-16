// Public SEO pages: insights library, daily city pages (Choghadiya, Rahu Kaal,
// Panchang), daily horoscope pages, sitemap.xml, robots.txt and llms.txt.
// Every page exists in English at the root and in each language under /<lang>/
// (the language prefix is removed by the middleware in server.js and kept in req.lang).
import { page, md, esc, slugify, setFooterLinks } from './layout.js';
import timings from '../content/insights-timings.js';
import panchangArticles from '../content/insights-panchang.js';
import readings from '../content/insights-readings.js';
import about from '../content/about.js';
import { SEO_CITIES } from '../data/seo-cities.js';
import { FESTIVALS, FESTIVAL_BY_SLUG, nextFestivalDate, festivalCalendar, festivalIn } from '../engine/festivals.js';
import { FESTIVAL_INFO } from '../content/festivals-info.js';
import { panchang, goodBadTimes } from '../engine/index.js';
import { dailyHoroscope, SIGN_SLUGS } from '../engine/horoscope.js';
import { RASHI } from '../engine/constants.js';
import { priceFor } from '../pricing.js';
import { shareImage } from './og.js';
import { indexNowKey } from './indexnow.js';
import { tFor, dataT, monthT, LANGS, localePath, readyLangs, isReady, articleFor, articleLangs } from '../i18n/index.js';

export const ARTICLES = [...timings, ...panchangArticles, ...readings, ...about];
const BY_SLUG = new Map(ARTICLES.map((a) => [a.slug, a]));
const CATEGORY_ORDER = ['Good and bad times', 'Panchang', 'Kundli', 'Palm reading', 'Face reading', 'Other traditions', 'About Rekha'];
const UPDATED = '2026-10-16'; // bump when articles are edited

export const CITY = SEO_CITIES.map((c) => ({ ...c, slug: slugify(c.name.replace(/\(.*\)/, '')) }));
const CITY_BY_SLUG = new Map(CITY.map((c) => [c.slug, c]));
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
// Short date for meta descriptions ("Wed, 14 Oct"), long date for pages.
const short = (d, lang = 'en') => new Date(`${d}T12:00:00Z`).toLocaleDateString(LANGS[lang].locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** Join description parts, dropping optional ones from the end while it is over 160 characters. */
const fit = (base, ...optional) => { let d = base; for (const o of optional) { if (o && [...`${d} ${o}`].length <= 160) d = `${d} ${o}`; } return d; };
const pretty = (d, lang = 'en') => new Date(`${d}T12:00:00Z`).toLocaleDateString(LANGS[lang].locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const baseOf = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const langOf = (req) => req.lang || 'en';

// Small cache: daily pages are identical for everyone until the date changes.
// Keys include the language and the list of ready languages (which changes hreflang).
const cache = new Map();
function cached(key, ttlMs, build) {
  key = `${key}|${readyLangs().join(',')}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.html;
  const html = build();
  cache.set(key, { html, until: Date.now() + ttlMs });
  if (cache.size > 3000) cache.delete(cache.keys().next().value);
  return html;
}
export const clearPageCache = () => cache.clear();
// Browsers keep a page for maxAge; Cloudflare (s-maxage) keeps it a little longer and may serve
// a slightly stale copy while it fetches a fresh one, so visitors never wait for the server.
const send = (res, html, maxAge = 600) => {
  res.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${Math.max(maxAge, Math.min(maxAge * 4, 3600))}, stale-while-revalidate=600`);
  res.type('html').send(html);
};

const helpers = (lang) => {
  const tt = tFor(lang);
  const dt = (s) => dataT(lang, s);
  const cityName = (c) => dt(c.name);
  const cta = (label, href, note = '') => `<aside class="cta card"><div><strong>${esc(label)}</strong>${note ? `<p class="hint">${esc(note)}</p>` : ''}</div><a class="primary" href="${esc(href)}">${esc(tt('Open free'))}</a></aside>`;
  const faqHtml = (faq) => (faq?.length ? `<section class="faq"><h2>${esc(tt('Frequently asked questions'))}</h2>${faq.map(([q, a]) => `<details class="card fold"><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join('')}</section>` : '');
  const cityLinks = (prefix, exclude) => `<ul class="link-grid">${CITY.filter((c) => c.slug !== exclude).map((c) => `<li><a href="/${prefix}/${c.slug}">${esc(cityName(c))}</a></li>`).join('')}</ul>`;
  const signName = (i) => (lang === 'en' ? `${RASHI[i].sa} (${RASHI[i].en})` : dt(RASHI[i].sa));
  return { tt, dt, cityName, cta, faqHtml, cityLinks, signName };
};
const faqLd = (faq) => (faq?.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : []);

setFooterLinks((lang) => {
  const { tt, cityName, signName } = helpers(lang);
  return {
    cities: CITY.slice(0, 12).map((c) => [tt('Choghadiya {city}', { city: cityName(c) }), `/choghadiya/${c.slug}`]),
    signs: SIGN_SLUGS.map((s, i) => [signName(i), `/horoscope/${s}`]),
    insights: ARTICLES.map((a) => [(articleFor(lang, a) || a).h1.replace(/\?$/, ''), `/insights/${a.slug}`]),
    festivals: festivalCalendar().slice(0, 12).map((f) => [dataT(lang, f.name), `/festivals/${f.slug}`]),
  };
});

export function seoRoutes(app) {
  // ---------- insights ----------
  app.get('/insights', (req, res) => {
    const lang = langOf(req);
    send(res, cached(`insights:${lang}`, 3600000, () => {
      const { tt } = helpers(lang);
      const groups = CATEGORY_ORDER.map((cat) => [cat, ARTICLES.filter((a) => a.category === cat)]).filter(([, l]) => l.length);
      return page({
        lang, base: baseOf(req), path: '/insights',
        title: tt('Astrology Insights: Choghadiya, Panchang, Kundli, Palm Reading'),
        description: tt('Plain-language guides to Choghadiya, Rahu Kaal, tithi, nakshatra, dasha, Sade Sati, kundli matching, palm lines, face reading, BaZi and numerology.'),
        h1: tt('Insights'), lede: tt('Clear, practical guides to the ideas behind your daily timings, kundli and readings.'),
        crumbs: [[tt('Insights'), '/insights']],
        body: groups.map(([cat, list]) => `<section class="block"><h2>${esc(tt(cat))}</h2><div class="grid">${list.map((en) => {
          const a = articleFor(lang, en) || en;
          return `<a class="cell link-card" href="/insights/${en.slug}"${a === en && lang !== 'en' ? ' lang="en"' : ''}><span class="val">${esc(a.h1)}</span><span class="sub">${esc(a.description)}</span></a>`;
        }).join('')}</div></section>`).join(''),
      });
    }));
  });

  app.get('/insights/:slug', (req, res, next) => {
    const en = BY_SLUG.get(req.params.slug);
    if (!en) return next();
    const lang = langOf(req);
    send(res, cached(`ins:${lang}:${en.slug}`, 3600000, () => {
      const { tt, cta, faqHtml } = helpers(lang);
      const translated = articleFor(lang, en);
      const a = translated || en;
      const related = (en.related || []).map((s) => BY_SLUG.get(s)).filter(Boolean).map((r) => articleFor(lang, r) || r);
      const langs = articleLangs(en);
      return page({
        lang, base: baseOf(req), path: `/insights/${en.slug}`, ogType: 'article', langs,
        title: a.title, description: a.description, h1: a.h1,
        notice: !translated && lang !== 'en' ? esc(tt('This guide is not yet available in {language}, so it is shown in English.', { language: LANGS[lang].name })) : '',
        crumbs: [[tt('Insights'), '/insights'], [tt(en.category), '/insights'], [a.h1, `/insights/${en.slug}`]],
        jsonld: [{
          '@context': 'https://schema.org', '@type': 'Article', headline: a.h1, description: a.description,
          datePublished: UPDATED, dateModified: UPDATED, inLanguage: LANGS[translated ? lang : 'en'].hreflang,
          author: { '@type': 'Organization', name: 'Rekha' }, publisher: { '@type': 'Organization', name: 'Rekha' },
          mainEntityOfPage: `${baseOf(req)}${localePath(translated ? lang : 'en', `/insights/${en.slug}`)}`,
        }, ...faqLd(a.faq)],
        body: `<article class="prose-body"${translated || lang === 'en' ? '' : ' lang="en"'}>${md(a.body)}</article>
          ${a.tool ? cta(a.tool[0], a.tool[1], tt('Free, calculated for your own city and birth details.')) : ''}
          ${faqHtml(a.faq)}
          ${related.length ? `<section class="block"><h2>${esc(tt('Read next'))}</h2><div class="grid">${related.map((r) => `<a class="cell link-card" href="/insights/${r.slug}"><span class="val">${esc(r.h1)}</span><span class="sub">${esc(r.description)}</span></a>`).join('')}</div></section>` : ''}
          <p class="hint">${esc(tt('Updated {date}. For entertainment and self-reflection; traditions differ between regions and schools.', { date: pretty(UPDATED, lang) }))}</p>`,
      });
    }));
  });

  // Short link to the trust page, in the visitor's language.
  app.get('/trust', (req, res) => res.redirect(301, localePath(langOf(req), '/insights/how-rekha-works')));

  // ---------- daily city pages ----------
  const HUBS = {
    choghadiya: ['Choghadiya Today: Shubh, Labh and Amrit Timings by City', 'Choghadiya today', "Day and night Choghadiya for 40 cities, calculated from each city's sunrise.", "Today's Choghadiya for Indian and Southeast Asian cities: Amrit, Shubh, Labh, Char and the periods to avoid, from local sunrise."],
    'rahu-kaal': ['Rahu Kaal Today: Timings by City', 'Rahu Kaal today', "Rahu Kaal, Yamaganda and Gulika for 40 cities, from each city's sunrise.", "Today's Rahu Kaal, Yamaganda and Gulika Kaal timings for Indian and Southeast Asian cities, with Abhijit Muhurat."],
    panchang: ["Today's Panchang by City: Tithi, Nakshatra, Yoga, Karana", 'Panchang today', 'The daily Hindu almanac for 40 cities: tithi, nakshatra, yoga, karana, sunrise and festivals.', "Today's Panchang for your city: tithi, nakshatra, yoga, karana, sunrise, sunset, moonrise and festivals."],
  };
  // The strings above are registered for translation here.
  const N = (s) => s;
  void [N('Choghadiya Today: Shubh, Labh and Amrit Timings by City'), N('Choghadiya today'), N("Day and night Choghadiya for 40 cities, calculated from each city's sunrise."), N("Today's Choghadiya for Indian and Southeast Asian cities: Amrit, Shubh, Labh, Char and the periods to avoid, from local sunrise."),
    N('Rahu Kaal Today: Timings by City'), N('Rahu Kaal today'), N("Rahu Kaal, Yamaganda and Gulika for 40 cities, from each city's sunrise."), N("Today's Rahu Kaal, Yamaganda and Gulika Kaal timings for Indian and Southeast Asian cities, with Abhijit Muhurat."),
    N("Today's Panchang by City: Tithi, Nakshatra, Yoga, Karana"), N('Panchang today'), N('The daily Hindu almanac for 40 cities: tithi, nakshatra, yoga, karana, sunrise and festivals.'), N("Today's Panchang for your city: tithi, nakshatra, yoga, karana, sunrise, sunset, moonrise and festivals."),
    N('Good and bad times'), N('Panchang'), N('Kundli'), N('Palm reading'), N('Face reading'), N('Other traditions'), N('About Rekha')];
  for (const [type, [title, h1, lede, description]] of Object.entries(HUBS)) {
    app.get(`/${type}`, (req, res) => {
      const lang = langOf(req);
      send(res, cached(`hub:${type}:${lang}`, 3600000, () => {
        const { tt, cta, cityLinks } = helpers(lang);
        return page({
          lang, base: baseOf(req), path: `/${type}`, title: tt(title), description: tt(description), h1: tt(h1), lede: tt(lede),
          crumbs: [[tt(h1), `/${type}`]],
          body: `<section class="block"><h2>${esc(tt('Choose your city'))}</h2>${cityLinks(type)}</section>
            ${cta(tt('Use your exact location'), '/', tt("The app calculates from your phone's location and adds your personal day rating."))}`,
        });
      }));
    });
  }

  // ---------- daily city pages: today, tomorrow, month calendar ----------
  const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dayData = (c, offset = 0) => {
    const date = addDays(todayIn(c.tz), offset);
    return { date, t: goodBadTimes(date, c.lat, c.lon, c.tz, { activities: ['general', 'business', 'travel', 'purchase'] }), p: strip(panchang(date, c.lat, c.lon, c.tz)) };
  };
  const strip = (p) => { delete p._raw; delete p._karanaRaw; return p; };
  const nowIn = (tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const rowsFor = (lang) => {
    const { tt, dt } = helpers(lang);
    const row = (x, cls = '') => `<div class="item ${cls}"><time>${esc(x.start)} – ${esc(x.end)}</time><div><strong>${esc(dt(x.name || x.lord))}</strong><small>${esc(dt(x.note || x.use || ''))}</small></div></div>`;
    const slotRows = (list) => `<div class="timeline">${list.map((s) => `<div class="slot q-${esc(s.quality)}"><time>${esc(s.start)} – ${esc(s.end)}</time><span><strong>${esc(dt(s.name))}</strong><small>${esc(dt(s.use))}</small></span><span class="pill q-${esc(s.quality)}">${esc(dt(s.quality))}</span></div>`).join('')}</div>`;
    // Links to the same city's other daily pages (today, tomorrow, the month calendar, festivals).
    const crossLinks = (c, current) => `<p class="also">${esc(tt('Also for {city}:', { city: dt(c.name) }))} ${[
      ['/choghadiya', tt('Choghadiya today')], ['/choghadiya/tomorrow', tt('Choghadiya tomorrow')], ['/rahu-kaal', tt('Rahu Kaal today')], ['/rahu-kaal/tomorrow', tt('Rahu Kaal tomorrow')],
      ['/panchang', tt('Panchang today')], ['/panchang/tomorrow', tt('Panchang tomorrow')], ['/panchang/calendar', tt('Panchang calendar')], ['/festivals/diwali', dt('Diwali')],
    ].filter(([x]) => x !== current).map(([x, l]) => {
      const [type, sub] = x.slice(1).split('/');
      const href = type === 'festivals' ? `/festivals/${sub}/${c.slug}` : `/${type}/${c.slug}${sub ? `/${sub}` : ''}`;
      return `<a href="${href}">${esc(l)}</a>`;
    }).join(' · ')}</p>`;
    const windows = (list) => list.map((w) => `<div class="window"><strong>${esc(w.start)} – ${esc(w.end)}</strong><span>${esc(dt(w.choghadiya))} · ${esc(tt('{planets} hora', { planets: w.horas.map(dt).join(', ') }))}</span></div>`).join('');
    // How the page was worked out: shown on every timing page (AI search engines prefer sourced, dated numbers).
    const method = (c, t) => `<p class="method hint">${esc(tt('Calculated for {city} ({lat}, {lon}, {tz}) from local sunrise {sunrise} and sunset {sunset}, with the Lahiri ayanamsa. Updated at {time} local time.', { city: dt(c.name), lat: c.lat.toFixed(2), lon: c.lon.toFixed(2), tz: c.tz, sunrise: t.sunrise, sunset: t.sunset, time: nowIn(c.tz) }))} <a href="/insights/how-rekha-works">${esc(tt('How Rekha calculates'))}</a></p>`;
    return { row, slotRows, crossLinks, windows, method };
  };
  const ogImage = (base, kind, c) => `${base}/og/${kind}/${c.slug}.png`;

  for (const offset of [0, 1]) {
    const when = offset ? '/tomorrow' : '';
    app.get(`/choghadiya/:city${when}`, (req, res, next) => {
      const c = CITY_BY_SLUG.get(req.params.city); if (!c) return next();
      const lang = langOf(req);
      const { date, t } = dayData(c, offset);
      send(res, cached(`cg:${lang}:${c.slug}:${date}:${offset}`, 1800000, () => {
        const { tt, dt, cta, faqHtml, cityLinks } = helpers(lang);
        const { row, slotRows, crossLinks, windows, method } = rowsFor(lang);
        const city = dt(c.name); const day = pretty(date, lang);
        const best = t.bestWindows.general;
        const goodNames = t.choghadiya.day.filter((s) => ['best', 'good'].includes(s.quality)).map((s) => `${dt(s.name)} ${s.start}–${s.end}`);
        const rk = t.badTimes.find((b) => b.name === 'Rahu Kaal');
        const answer = best.length
          ? tt('On {day}, the best time in {city} is {start} to {end} ({name} Choghadiya), and Rahu Kaal is {rs} to {re}.', { day, city, start: best[0].start, end: best[0].end, name: dt(best[0].choghadiya), rs: rk.start, re: rk.end })
          : tt('On {day}, {city} has no clean daytime window; Rahu Kaal is {rs} to {re}.', { day, city, rs: rk.start, re: rk.end });
        const faq = offset ? [] : [
          [tt('What is the best Choghadiya today in {city}?', { city }), best.length ? tt('The cleanest window is {start} to {end} ({name}), which avoids Rahu Kaal, Yamaganda and Gulika.', { start: best[0].start, end: best[0].end, name: dt(best[0].choghadiya) }) : tt('There is no clean daytime window today; consider the night Choghadiya or another day.')],
          [tt('Which Choghadiya is good today in {city}?', { city }), tt('Daytime good periods: {list}.', { list: goodNames.join(', ') || tt('none') })],
          [tt('What is Choghadiya?'), tt('The day and night are each split into 8 parts ruled by planets. Amrit, Shubh and Labh are good; Char suits travel; Udveg, Kaal and Rog are avoided for new beginnings.')],
        ];
        const path = `/choghadiya/${c.slug}${when}`;
        return page({
          lang, base: baseOf(req), path, image: ogImage(baseOf(req), offset ? 'choghadiya-tomorrow' : 'choghadiya', c),
          title: offset ? tt('Choghadiya Tomorrow in {city}: Shubh, Labh, Amrit Timings', { city }) : tt('Choghadiya Today in {city}: Shubh, Labh, Amrit Timings', { city }),
          description: offset
            ? tt("Tomorrow's day and night Choghadiya for {city} ({day}), from local sunrise {sunrise}. Best time: {best}. Rahu Kaal {rahu}.", { city, day: short(date, lang), sunrise: t.sunrise, best: best[0] ? `${best[0].start}–${best[0].end}` : tt('see table'), rahu: rk?.start })
            : tt("Today's day and night Choghadiya for {city} on {day}, from local sunrise {sunrise}. Best time: {best}. Rahu Kaal {rahu}.", { city, day: short(date, lang), sunrise: t.sunrise, best: best[0] ? `${best[0].start}–${best[0].end}` : tt('see table'), rahu: rk?.start }),
          h1: offset ? tt('Choghadiya tomorrow in {city}', { city }) : tt('Choghadiya today in {city}', { city }), lede: `${day} · ${tt('Sunrise')} ${t.sunrise} · ${tt('Sunset')} ${t.sunset}`,
          crumbs: [[tt('Choghadiya'), '/choghadiya'], [city, `/choghadiya/${c.slug}`], ...(offset ? [[tt('Choghadiya tomorrow'), path]] : [])],
          jsonld: faqLd(faq),
          body: `
            <p class="answer">${esc(answer)}</p>
            <section class="block"><h2>${esc(offset ? tt('Best times tomorrow') : tt('Best times today'))}</h2><div class="windows">${windows(best) || `<p class="hint">${esc(tt('No clean daytime window today.'))}</p>`}</div></section>
            <div class="cols"><section class="block"><h2>${esc(tt('Day Choghadiya'))}</h2>${slotRows(t.choghadiya.day)}</section>
            <section class="block"><h2>${esc(tt('Night Choghadiya'))}</h2>${slotRows(t.choghadiya.night)}</section></div>
            <section class="block"><h2>${esc(offset ? tt('Avoid tomorrow') : tt('Avoid today'))}</h2><div class="list">${t.badTimes.map((b) => row(b, 'bad')).join('')}</div></section>
            ${method(c, t)}
            ${cta(tt('Get your personal best times'), '/', tt('Pick an activity, use your exact location, and add your birth chart for a personal day rating.'))}
            ${crossLinks(c, offset ? '/choghadiya/tomorrow' : '/choghadiya')}
            ${faqHtml(faq)}
            <section class="block"><h2>${esc(tt('Learn more'))}</h2><p><a href="/insights/what-is-choghadiya">${esc(tt('What is Choghadiya and how to read it'))}</a> · <a href="/insights/hora-planetary-hours">${esc(tt('Hora explained'))}</a> · <a href="/insights/how-to-choose-an-auspicious-time">${esc(tt('How to choose a good time'))}</a></p></section>
            <section class="block"><h2>${esc(tt('Choghadiya in other cities'))}</h2>${cityLinks('choghadiya', c.slug)}</section>`,
        });
      }), 900);
    });

    app.get(`/rahu-kaal/:city${when}`, (req, res, next) => {
      const c = CITY_BY_SLUG.get(req.params.city); if (!c) return next();
      const lang = langOf(req);
      const { date, t } = dayData(c, offset);
      send(res, cached(`rk:${lang}:${c.slug}:${date}:${offset}`, 1800000, () => {
        const { tt, dt, cta, faqHtml, cityLinks } = helpers(lang);
        const { row, crossLinks, method } = rowsFor(lang);
        const city = dt(c.name); const day = pretty(date, lang);
        const get = (n) => t.badTimes.find((b) => b.name === n) || t.goodTimes.find((b) => b.name === n);
        const rk = get('Rahu Kaal'); const ab = get('Abhijit Muhurta');
        const faq = offset ? [] : [
          [tt('What is the Rahu Kaal time today in {city}?', { city }), tt('Rahu Kaal today in {city} is from {start} to {end}.', { city, start: rk.start, end: rk.end })],
          [tt('When is Abhijit Muhurat today in {city}?', { city }), ab.skip ? tt('Abhijit Muhurat is traditionally skipped on Wednesdays.') : tt('Abhijit Muhurat is from {start} to {end}.', { start: ab.start, end: ab.end })],
          [tt('What should I avoid during Rahu Kaal?'), tt('Starting new work, signing agreements, big purchases and setting out on journeys. Ongoing work can continue.')],
        ];
        const path = `/rahu-kaal/${c.slug}${when}`;
        return page({
          lang, base: baseOf(req), path, image: ogImage(baseOf(req), offset ? 'rahu-kaal-tomorrow' : 'rahu-kaal', c),
          title: offset ? tt('Rahu Kaal Tomorrow in {city}: {start} to {end}', { city, start: rk.start, end: rk.end }) : tt('Rahu Kaal Today in {city}: {start} to {end}', { city, start: rk.start, end: rk.end }),
          description: offset
            ? tt('Rahu Kaal in {city} tomorrow ({day}) is {start} to {end}. Also Yamaganda, Gulika Kaal, Dur Muhurtam and Abhijit Muhurat from local sunrise {sunrise}.', { city, day: short(date, lang), start: rk.start, end: rk.end, sunrise: t.sunrise })
            : tt('Rahu Kaal in {city} today ({day}) is {start} to {end}. Also Yamaganda, Gulika Kaal, Dur Muhurtam and Abhijit Muhurat from local sunrise {sunrise}.', { city, day: short(date, lang), start: rk.start, end: rk.end, sunrise: t.sunrise }),
          h1: offset ? tt('Rahu Kaal tomorrow in {city}', { city }) : tt('Rahu Kaal today in {city}', { city }), lede: `${day} · ${tt('Sunrise')} ${t.sunrise} · ${tt('Sunset')} ${t.sunset}`,
          crumbs: [[tt('Rahu Kaal'), '/rahu-kaal'], [city, `/rahu-kaal/${c.slug}`], ...(offset ? [[tt('Rahu Kaal tomorrow'), path]] : [])],
          jsonld: faqLd(faq),
          body: `
            <p class="answer">${esc(tt('Rahu Kaal in {city} on {day} is from {start} to {end}.', { city, day, start: rk.start, end: rk.end }))}</p>
            <div class="card now"><div class="sub">${esc(offset ? tt('Rahu Kaal tomorrow') : tt('Rahu Kaal today'))}</div><div class="big">${esc(rk.start)} – ${esc(rk.end)}</div><div class="sub">${esc(tt('Avoid starting new work, travel or big purchases in this window.'))}</div></div>
            <div class="cols"><section class="block"><h2>${esc(tt('Periods to avoid'))}</h2><div class="list">${t.badTimes.map((b) => row(b, 'bad')).join('')}</div></section>
            <section class="block"><h2>${esc(tt('Auspicious windows'))}</h2><div class="list">${t.goodTimes.filter((g) => !g.skip).map((g) => row(g, 'good')).join('')}</div></section></div>
            ${method(c, t)}
            ${cta(tt("See today's best time for your activity"), '/', tt('Business, travel, purchase, property or marriage talks, for your exact location.'))}
            ${crossLinks(c, offset ? '/rahu-kaal/tomorrow' : '/rahu-kaal')}
            ${faqHtml(faq)}
            <section class="block"><h2>${esc(tt('Learn more'))}</h2><p><a href="/insights/rahu-kaal-meaning">${esc(tt('Rahu Kaal explained'))}</a> · <a href="/insights/yamaganda-gulika-dur-muhurtam">${esc(tt('Yamaganda, Gulika and Dur Muhurtam'))}</a> · <a href="/insights/abhijit-muhurat">${esc(tt('Abhijit Muhurat'))}</a></p></section>
            <section class="block"><h2>${esc(tt('Rahu Kaal in other cities'))}</h2>${cityLinks('rahu-kaal', c.slug)}</section>`,
        });
      }), 900);
    });

    app.get(`/panchang/:city${when}`, (req, res, next) => {
      const c = CITY_BY_SLUG.get(req.params.city); if (!c) return next();
      const lang = langOf(req);
      const { date, t, p } = dayData(c, offset);
      send(res, cached(`pc:${lang}:${c.slug}:${date}:${offset}`, 1800000, () => {
        const { tt, dt, cta, faqHtml, cityLinks } = helpers(lang);
        const { row, crossLinks, method } = rowsFor(lang);
        const city = dt(c.name); const day = pretty(date, lang);
        const ends = (x) => (x.endsAt ? (x.endsAt.slice(0, 10) !== date ? tt('until {time} (next day)', { time: x.endsAt.slice(11) }) : tt('until {time}', { time: x.endsAt.slice(11) })) : '');
        const tithi = `${dt(p.paksha)} ${dt(p.tithi[0].name)}`;
        const nak = dt(p.nakshatra[0].name);
        const rows = [
          [tt('Tithi'), tithi, ends(p.tithi[0]), '/insights/tithi-explained'],
          [tt('Nakshatra'), nak, ends(p.nakshatra[0]), '/insights/nakshatra-list-meaning'],
          [tt('Yoga'), dt(p.yoga[0].name), ends(p.yoga[0]), '/insights/yoga-and-karana'],
          [tt('Karana'), dt(p.karana[0].name), ends(p.karana[0]), '/insights/yoga-and-karana'],
          [tt('Vara'), lang === 'en' ? `${p.vara.en} (${p.vara.sa})` : dt(p.vara.en), tt('Ruled by {planet}', { planet: dt(p.vara.lord) }), ''],
          [tt('Month (Amanta / Purnimanta)'), `${monthT(lang, p.masa.amanta)} / ${monthT(lang, p.masa.purnimanta)}`, '', '/insights/what-is-panchang'],
          [tt('Sunrise / Sunset'), `${p.sunrise} / ${p.sunset}`, '', ''],
          [tt('Moonrise / Moonset'), `${p.moonrise ?? '-'} / ${p.moonset ?? '-'}`, '', ''],
          [tt('Moon sign'), dt(p.moonSign), tt('Sun in {sign}', { sign: dt(p.sunSign) }), '/insights/lagna-vs-rashi-vs-sun-sign'],
          [tt('Ritu / Ayana'), `${dt(p.ritu)} / ${dt(p.ayana)}`, '', ''],
          [tt('Vikram / Shaka Samvat'), `${p.samvat.vikram} / ${p.samvat.shaka}`, '', ''],
          [tt('Festivals and fasts'), p.festivals.map(dt).join(', ') || tt('None'), '', ''],
        ];
        const rk = t.badTimes.find((b) => b.name === 'Rahu Kaal');
        const faq = offset ? [] : [
          [tt("What is today's tithi in {city}?", { city }), `${tithi}${p.tithi[0].endsAt ? `, ${ends(p.tithi[0])}` : ''}.`],
          [tt("What is today's nakshatra in {city}?", { city }), `${nak}${p.nakshatra[0].endsAt ? `, ${ends(p.nakshatra[0])}` : ''}.`],
          [tt('What is Rahu Kaal today in {city}?', { city }), tt('{start} to {end}.', { start: rk.start, end: rk.end })],
        ];
        const path = `/panchang/${c.slug}${when}`;
        return page({
          lang, base: baseOf(req), path, image: ogImage(baseOf(req), offset ? 'panchang-tomorrow' : 'panchang', c),
          title: offset ? tt("Tomorrow's Panchang {city}: {tithi}, {nakshatra}", { city, tithi, nakshatra: nak }) : tt("Today's Panchang {city}: {tithi}, {nakshatra}", { city, tithi, nakshatra: nak }),
          description: fit(tt('Panchang for {city} on {day}: {tithi} tithi, {nakshatra} nakshatra, {yoga} yoga, sunrise {sunrise}, Rahu Kaal {start}–{end}.', { city, day: short(date, lang), tithi, nakshatra: nak, yoga: dt(p.yoga[0].name), sunrise: p.sunrise, start: rk.start, end: rk.end }), p.festivals.length ? `${dt(p.festivals[0])}.` : ''),
          h1: offset ? tt("Tomorrow's Panchang for {city}", { city }) : tt("Today's Panchang for {city}", { city }), lede: `${day} · ${tt('{month} month', { month: monthT(lang, p.masa.amanta) })} · ${tt('{paksha} paksha', { paksha: dt(p.paksha) })}`,
          crumbs: [[tt('Panchang'), '/panchang'], [city, `/panchang/${c.slug}`], ...(offset ? [[tt('Panchang tomorrow'), path]] : [])],
          jsonld: faqLd(faq),
          body: `
            <p class="answer">${esc(tt('On {day} in {city}, the tithi at sunrise is {tithi}, the nakshatra is {nakshatra}, and the sun rises at {sunrise}.', { day, city, tithi, nakshatra: nak, sunrise: p.sunrise }))}</p>
            <div class="table-wrap card"><table><tbody>${rows.map(([k, v, sub, link]) => `<tr><th scope="row">${link ? `<a href="${link}">${esc(k)}</a>` : esc(k)}</th><td><strong>${esc(v)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>
            <div class="cols"><section class="block"><h2>${esc(offset ? tt('Avoid tomorrow') : tt('Avoid today'))}</h2><div class="list">${t.badTimes.map((b) => row(b, 'bad')).join('')}</div></section>
            <section class="block"><h2>${esc(tt('Auspicious windows'))}</h2><div class="list">${t.goodTimes.filter((g) => !g.skip).map((g) => row(g, 'good')).join('')}</div></section></div>
            ${method(c, t)}
            ${cta(tt("See this month's good days"), '/?tab=panchang', tt('A calendar of good days for business, travel, marriage, property and more.'))}
            ${crossLinks(c, offset ? '/panchang/tomorrow' : '/panchang')}
            ${faqHtml(faq)}
            <section class="block"><h2>${esc(tt('Panchang in other cities'))}</h2>${cityLinks('panchang', c.slug)}</section>`,
        });
      }), 900);
    });
  }

  // Two months of Panchang for a city, one row per day.
  app.get('/panchang/:city/calendar', (req, res, next) => {
    const c = CITY_BY_SLUG.get(req.params.city); if (!c) return next();
    const lang = langOf(req);
    const start = `${todayIn(c.tz).slice(0, 7)}-01`;
    send(res, cached(`pcal:${lang}:${c.slug}:${start}`, 6 * 3600000, () => {
      const { tt, dt, cta } = helpers(lang);
      const { crossLinks, method } = rowsFor(lang);
      const city = dt(c.name);
      const monthName = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(LANGS[lang].locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const next = addDays(start, 32).slice(0, 7) + '-01';
      const months = [start, next].map((m) => {
        const days = [];
        for (let d = m; d.slice(0, 7) === m.slice(0, 7); d = addDays(d, 1)) days.push(strip(panchang(d, c.lat, c.lon, c.tz)));
        return [m, days];
      });
      const label = `${monthName(start)}, ${monthName(next)}`;
      const t0 = dayData(c).t;
      return page({
        lang, base: baseOf(req), path: `/panchang/${c.slug}/calendar`,
        title: tt('Panchang Calendar {month} for {city}: Tithi and Festivals', { month: monthName(start), city }),
        description: tt('Day-by-day Panchang for {city} for {months}: tithi, nakshatra, sunrise and festivals, calculated from local sunrise.', { city, months: label }),
        h1: tt('Panchang calendar for {city}', { city }), lede: label,
        crumbs: [[tt('Panchang'), '/panchang'], [city, `/panchang/${c.slug}`], [tt('Panchang calendar'), `/panchang/${c.slug}/calendar`]],
        body: months.map(([m, days]) => `<section class="block"><h2>${esc(monthName(m))}</h2><div class="table-wrap card"><table class="cal-table">
          <thead><tr><th>${esc(tt('Date'))}</th><th>${esc(tt('Tithi'))}</th><th>${esc(tt('Nakshatra'))}</th><th>${esc(tt('Sunrise'))}</th><th>${esc(tt('Festivals and fasts'))}</th></tr></thead><tbody>
          ${days.map((p) => `<tr><td><strong>${esc(short(p.date, lang))}</strong></td><td>${esc(`${dt(p.paksha)} ${dt(p.tithi[0].name)}`)}</td><td>${esc(dt(p.nakshatra[0].name))}</td><td>${esc(p.sunrise)}</td><td>${esc(p.festivals.map(dt).join(', '))}</td></tr>`).join('')}
          </tbody></table></div></section>`).join('')
          + `${method(c, t0)}${cta(tt("See this month's good days"), '/?tab=panchang', tt('A calendar of good days for business, travel, marriage, property and more.'))}${crossLinks(c, '/panchang/calendar')}`,
      });
    }), 3600);
  });


  // ---------- horoscope ----------
  app.get('/horoscope', (req, res) => {
    const lang = langOf(req);
    const date = todayIn('Asia/Kolkata');
    send(res, cached(`horo:${lang}:${date}`, 1800000, () => {
      const { tt, signName } = helpers(lang);
      const day = pretty(date, lang);
      return page({
        lang, base: baseOf(req), path: '/horoscope',
        title: tt("Today's Horoscope by Rashi ({date}): All 12 Moon Signs", { date }),
        description: tt('Daily rashi horoscope for {day} for all 12 Moon signs, from Mesha (Aries) to Meena (Pisces), with love, career and money ratings.', { day }),
        h1: tt("Today's horoscope"), lede: `${day} · ${tt('Based on your Moon sign (rashi), the Indian way.')}`,
        crumbs: [[tt('Horoscope'), '/horoscope']],
        body: `<div class="grid">${SIGN_SLUGS.map((s, i) => {
          const h = dailyHoroscope(date, i);
          return `<a class="cell link-card" href="/horoscope/${s}"><b>${esc(RASHI[i].hi)}</b><span class="val">${esc(signName(i))}</span><span class="sub">${esc(tt('Overall'))} ${'★'.repeat(h.overall)}${'☆'.repeat(5 - h.overall)} · ${esc(tt('Moon in house {n} from your sign', { n: h.moonTransit.house }))}</span></a>`;
        }).join('')}</div>
        <p class="hint">${esc(tt('Not sure of your rashi? It is the sign the Moon was in when you were born.'))} <a href="/?tab=chart">${esc(tt('Find it free'))}</a> · <a href="/insights/lagna-vs-rashi-vs-sun-sign">${esc(tt('Lagna vs rashi vs sun sign'))}</a></p>
        <aside class="card sign-note"><strong>${esc(tt('Why is my sign different here?'))}</strong><p>${esc(tt('Magazines and Western apps use your sun sign on the tropical zodiac. Indian horoscopes use your Moon sign (rashi) on the sidereal zodiac, which starts about 24 degrees earlier. So your rashi is often a different sign. Both are correct for their own system.'))}</p></aside>`,
      });
    }));
  });

  app.get('/horoscope/:sign', async (req, res, next) => {
    const i = SIGN_SLUGS.indexOf(req.params.sign); if (i < 0) return next();
    const lang = langOf(req);
    try {
      const date = todayIn('Asia/Kolkata');
      const key = `horo:${lang}:${i}:${date}|${readyLangs().join(',')}`;
      let html = cache.get(key)?.until > Date.now() ? cache.get(key).html : null;
      if (!html) {
        // AI text only for languages that are live, so stray crawls cannot run up costs.
        const h = await app.locals.horoscopeFor(i, isReady(lang) ? lang : 'en', date);
        const { tt, dt, cta, faqHtml, signName } = helpers(lang);
        const sign = signName(i); const day = pretty(date, lang);
        const bar = (l, n) => `<div class="score-row"><span>${esc(l)}</span><span class="meter-bar" aria-hidden="true"><i style="width:${n * 20}%"></i></span><b>${n}/5</b></div>`;
        const colours = h.lucky.colour.map(dt).join(` ${tt('or')} `);
        const summary = String(h.text || '').trim().split(/(?<=[.!?।])\s+/).slice(0, 2).join(' ');
        const faq = [
          ...(summary ? [[tt("What is today's horoscope for {sign}?", { sign }), summary]] : []),
          [tt('What is the lucky colour for {sign} today?', { sign }), tt('{colours}. Lucky number: {n}.', { colours, n: h.lucky.number })],
        ];
        html = page({
          lang, base: baseOf(req), path: `/horoscope/${SIGN_SLUGS[i]}`,
          title: lang === 'en' ? `${RASHI[i].sa} Rashifal Today (${RASHI[i].en} Horoscope) ${date}` : tt('{sign} horoscope today ({date})', { sign, date }),
          description: tt('{sign} daily horoscope for {day}: love {love}/5, career {career}/5, money {money}/5. Lucky colour {colour}, lucky number {n}.', { sign, day, love: h.scores.love, career: h.scores.career, money: h.scores.money, colour: dt(h.lucky.colour[0]), n: h.lucky.number }),
          h1: tt('{sign} horoscope today', { sign }), lede: `${day} · ${RASHI[i].hi} राशि · ${tt('Moon in {sign}, house {n} from your sign', { sign: dt(h.moonTransit.sign), n: h.moonTransit.house })}`,
          crumbs: [[tt('Horoscope'), '/horoscope'], [sign, `/horoscope/${SIGN_SLUGS[i]}`]],
          jsonld: faqLd(faq),
          body: `
            <article class="card horo">${h.ai ? `<p class="ai-label">${esc(tt('Written by AI from today\'s planet positions for {sign}. The scores are calculated, not written by AI.', { sign: dt(RASHI[i].sa) }))} <a href="/insights/how-rekha-works">${esc(tt('How Rekha works'))}</a></p>` : ''}<div class="prose">${esc(h.text)}</div>
            <div class="scores">${bar(tt('Love'), h.scores.love)}${bar(tt('Career'), h.scores.career)}${bar(tt('Money'), h.scores.money)}${bar(tt('Energy'), h.scores.energy)}</div>
            <p class="hint">${esc(tt('Lucky colour'))}: <strong>${esc(colours)}</strong> · ${esc(tt('Lucky number'))}: <strong>${h.lucky.number}</strong></p></article>
            <section class="card"><h2>${esc(tt("Today's planets for {sign}", { sign: dt(RASHI[i].sa) }))}</h2>
              <div class="table-wrap"><table><thead><tr><th>${esc(tt('Planet'))}</th><th>${esc(tt('Sign'))}</th><th>${esc(tt('House from {sign}', { sign: dt(RASHI[i].sa) }))}</th><th>${esc(tt('Effect'))}</th></tr></thead><tbody>
              ${Object.entries(h.transits).map(([pl, x]) => `<tr><td>${esc(dt(pl))}${x.retrograde ? ' (R)' : ''}</td><td>${esc(dt(x.sign))}</td><td>${x.house}</td><td>${esc(x.favourable ? tt('Supportive') : tt('Challenging'))}</td></tr>`).join('')}
              </tbody></table></div>
              <p class="hint">${esc(tt("Gochar: each planet's house is counted from your Moon sign."))} <a href="/insights/daily-horoscope-how-it-works">${esc(tt('How this horoscope works'))}</a></p></section>
            ${cta(tt('Get a horoscope from your own birth chart'), '/?tab=chart', tt('Your personal day rating uses your birth star and dasha, not just your sign.'))}
            ${faqHtml(faq)}
            <section class="block"><h2>${esc(tt('Other signs'))}</h2><ul class="link-grid">${SIGN_SLUGS.map((s, j) => (j === i ? '' : `<li><a href="/horoscope/${s}">${esc(signName(j))}</a></li>`)).join('')}</ul></section>`,
        });
        // The calculated fallback (AI off or failed) is kept only briefly, so the AI text replaces it soon.
        cache.set(key, { html, until: Date.now() + (h.ai ? 1800000 : 120000), ai: h.ai });
      }
      send(res, html, cache.get(key)?.ai === false ? 60 : 900);
    } catch (e) { next(e); }
  });

  // ---------- festivals ----------
  // The hub lists the next date of each festival; each festival page shows it in the main cities;
  // festivals people search with a city name (muhurat, moonrise, arghya) get a page per city.
  const yearOf = (d) => d.slice(0, 4);
  const HUB_CITIES = CITY.slice(0, 40);
  const festAnswer = (lang, f, x, city) => {
    const { tt, dt } = helpers(lang);
    const fest = dt(f.name); const day = pretty(x.date, lang);
    if (f.kind === 'lakshmi' && x.noOverlap) return tt('In {city} on {day}, Pradosh Kaal is {start} to {end}; the Vrishabha lagna does not fall within it this year.', { city, day, ...x.pradosh });
    if (f.kind === 'lakshmi') return tt('{festival} puja muhurat in {city} on {day} is {start} to {end} ({minutes} minutes), when Pradosh Kaal and the fixed Vrishabha lagna overlap.', { festival: fest, city, day, ...x.muhurat });
    if (f.kind === 'moonrise') return tt('On {festival} ({day}) the moon rises in {city} at {time}; sunset is at {sunset}.', { festival: fest, day, city, time: x.moonrise || '-', sunset: x.sunset });
    if (f.kind === 'chhath') return tt('In {city}, the evening arghya (Sandhya Arghya) on {day} is at sunset, {sunset}, and the morning arghya (Usha Arghya) the next day is at sunrise, {sunrise}.', { city, day, sunset: x.sandhyaArghya, sunrise: x.ushaArghya });
    if (f.kind === 'pradosh') {
      return x.muhurat
        ? tt('Holika Dahan muhurat in {city} on {day} is {start} to {end}, in Pradosh Kaal after Bhadra.', { city, day, ...x.muhurat })
        : tt('On {day} in {city}, Bhadra lasts from {bs} to {be}, covering the whole Pradosh Kaal ({start} to {end}). Families then follow their local priest or calendar for the time.', { city, day, bs: x.bhadra.start, be: x.bhadra.end, ...x.pradosh });
    }
    if (f.kind === 'nishita') return tt('{festival} Nishita puja time in {city} is {start} to {end} on the night of {day}.', { festival: fest, city, day, ...x.muhurat });
    return tt('{festival} falls on {day} in {city}.', { festival: fest, day, city });
  };
  const keyTime = (f, x) => (f.kind === 'moonrise' ? x.moonrise : f.kind === 'chhath' ? `${x.sandhyaArghya} / ${x.ushaArghya}` : x.muhurat ? `${x.muhurat.start}–${x.muhurat.end}` : x.pradosh ? `${x.pradosh.start}–${x.pradosh.end}` : '');
  const keyLabel = (tt, f) => (f.kind === 'moonrise' ? tt('Moonrise') : f.kind === 'chhath' ? tt('Sunset and sunrise arghya') : f.kind === 'nishita' ? tt('Nishita puja') : f.kind ? tt('Puja muhurat') : '');

  app.get('/festivals', (req, res) => {
    const lang = langOf(req);
    const from = todayIn('Asia/Kolkata');
    send(res, cached(`fest:${lang}:${from}`, 3 * 3600000, () => {
      const { tt, dt } = helpers(lang);
      const list = festivalCalendar(from);
      const years = [...new Set(list.map((f) => yearOf(f.date)))].join('–');
      return page({
        lang, base: baseOf(req), path: '/festivals',
        title: tt('Hindu Festival Dates {years}: Muhurat and Timings', { years }),
        description: tt('Dates of Diwali, Dhanteras, Karwa Chauth, Chhath, Holi, Janmashtami, Navratri and more, with puja muhurat and moonrise times for your city.'),
        h1: tt('Upcoming Hindu festivals'), lede: tt('Dates for India, worked out from the Panchang. In some time zones a festival falls a day earlier or later; each city page shows the local date.'),
        crumbs: [[tt('Festivals'), '/festivals']],
        body: `<div class="table-wrap card"><table><thead><tr><th>${esc(tt('Festival'))}</th><th>${esc(tt('Date'))}</th></tr></thead><tbody>
          ${list.map((f) => `<tr><td><a href="/festivals/${f.slug}"><strong>${esc(dt(f.name))}</strong></a></td><td>${esc(pretty(f.date, lang))}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="hint">${esc(tt('Festival rules differ between regions and traditions. Rekha follows the common North Indian Panchang; check with your local priest for family ceremonies.'))} <a href="/insights/how-rekha-works">${esc(tt('How Rekha calculates'))}</a></p>`,
      });
    }), 3600);
  });

  app.get('/festivals/:slug', (req, res, next) => {
    const f = FESTIVAL_BY_SLUG.get(req.params.slug); if (!f) return next();
    const lang = langOf(req);
    const from = todayIn('Asia/Kolkata');
    const date = nextFestivalDate(f.slug, from); if (!date) return next();
    send(res, cached(`festp:${lang}:${f.slug}:${from}`, 6 * 3600000, () => {
      const { tt, dt, faqHtml } = helpers(lang);
      const fest = dt(f.name); const year = yearOf(date);
      const rows = HUB_CITIES.map((c) => [c, festivalIn(f.slug, c, from)]).filter(([, x]) => x);
      const faq = [
        [tt('When is {festival} {year}?', { festival: fest, year }), tt('{festival} falls on {day} in India.', { festival: fest, day: pretty(date, lang) })],
        ...(f.city ? [[tt('Does the {festival} time change by city?', { festival: fest }), tt('Yes. The muhurat depends on local sunrise, sunset and moonrise, so it is different in every city, and outside India the date itself can change.', {})]] : []),
      ];
      return page({
        lang, base: baseOf(req), path: `/festivals/${f.slug}`,
        title: f.city ? tt('{festival} {year}: Date and Muhurat Times by City', { festival: fest, year }) : tt('{festival} {year}: Date and Timings', { festival: fest, year }),
        description: fit(tt('{festival} {year} falls on {day} in India.', { festival: fest, year, day: short(date, lang) }), f.city ? tt('Muhurat and timings for your city, worked out from local sunrise and sunset.') : tt('Tithi times and local dates for major cities.')),
        h1: tt('{festival} {year}', { festival: fest, year }), lede: pretty(date, lang),
        crumbs: [[tt('Festivals'), '/festivals'], [fest, `/festivals/${f.slug}`]],
        jsonld: faqLd(faq),
        body: `<p class="answer">${esc(tt('{festival} {year} falls on {day} in India.', { festival: fest, year, day: pretty(date, lang) }))}</p>
          <section class="card"><p>${esc(dt(FESTIVAL_INFO[f.slug] || ''))}</p></section>
          <section class="block"><h2>${esc(f.city ? tt('{festival} times by city', { festival: fest }) : tt('{festival} date by city', { festival: fest }))}</h2>
          <div class="table-wrap card"><table><thead><tr><th>${esc(tt('City'))}</th><th>${esc(tt('Date'))}</th>${f.kind ? `<th>${esc(keyLabel(tt, f))}</th>` : ''}</tr></thead><tbody>
          ${rows.map(([c, x]) => `<tr><td>${f.city ? `<a href="/festivals/${f.slug}/${c.slug}">${esc(dt(c.name))}</a>` : esc(dt(c.name))}</td><td>${esc(short(x.date, lang))}</td>${f.kind ? `<td>${esc(keyTime(f, x))}</td>` : ''}</tr>`).join('')}
          </tbody></table></div></section>
          ${f.city ? `<section class="block"><h2>${esc(tt('More cities'))}</h2><ul class="link-grid">${CITY.slice(40).map((c) => `<li><a href="/festivals/${f.slug}/${c.slug}">${esc(dt(c.name))}</a></li>`).join('')}</ul></section>` : ''}
          ${faqHtml(faq)}
          <p class="hint">${esc(tt('Festival rules differ between regions and traditions. Rekha follows the common North Indian Panchang; check with your local priest for family ceremonies.'))} <a href="/festivals">${esc(tt('All festivals'))}</a></p>`,
      });
    }), 3600);
  });

  app.get('/festivals/:slug/:city', (req, res, next) => {
    const f = FESTIVAL_BY_SLUG.get(req.params.slug); const c = CITY_BY_SLUG.get(req.params.city);
    if (!f?.city || !c) return next();
    const lang = langOf(req);
    const from = todayIn('Asia/Kolkata');
    const x = festivalIn(f.slug, c, from); if (!x) return next();
    send(res, cached(`festc:${lang}:${f.slug}:${c.slug}:${from}`, 6 * 3600000, () => {
      const { tt, dt, cta, faqHtml } = helpers(lang);
      const fest = dt(f.name); const city = dt(c.name); const year = yearOf(x.date); const day = pretty(x.date, lang);
      const answer = festAnswer(lang, f, x, city);
      const titles = {
        lakshmi: tt('{festival} {year} Muhurat in {city}: {start} to {end}', { festival: fest, year, city, start: x.muhurat?.start, end: x.muhurat?.end }),
        moonrise: tt('{festival} {year} Moonrise Time in {city}: {time}', { festival: fest, year, city, time: x.moonrise || '-' }),
        chhath: tt('{festival} {year} in {city}: Sunset and Sunrise Arghya Times', { festival: fest, year, city }),
        pradosh: tt('{festival} {year} Muhurat in {city}', { festival: fest, year, city }),
        nishita: tt('{festival} {year} Nishita Puja Time in {city}', { festival: fest, year, city }),
      };
      const ends = (e) => (e ? tt('until {time}', { time: e.slice(11) }) + (e.slice(0, 10) !== x.date ? ` (${short(e.slice(0, 10), lang)})` : '') : '');
      const rows = [
        [tt('Date'), day],
        [tt('Sunrise / Sunset'), `${x.sunrise} / ${x.sunset}`],
        [tt('Moonrise'), x.moonrise || '-'],
        ...x.tithi.map((ti) => [tt('Tithi'), `${dt(ti.paksha)} ${dt(ti.name)} ${ends(ti.endsAt)}`]),
        [tt('Nakshatra'), dt(x.nakshatra)],
        ...(x.pradosh ? [[tt('Pradosh Kaal'), `${x.pradosh.start} – ${x.pradosh.end}`]] : []),
        ...(x.vrishabha ? [[tt('Vrishabha lagna'), `${x.vrishabha.start} – ${x.vrishabha.end}`]] : []),
        ...(x.bhadra ? [[tt('Bhadra'), `${x.bhadra.start} – ${x.bhadra.end}`]] : []),
        ...(x.muhurat ? [[keyLabel(tt, f), `${x.muhurat.start} – ${x.muhurat.end}`]] : []),
        ...(x.sandhyaArghya ? [[tt('Sandhya Arghya (sunset)'), x.sandhyaArghya], [tt('Usha Arghya (next sunrise)'), x.ushaArghya]] : []),
      ];
      const faq = [
        [tt('When is {festival} {year} in {city}?', { festival: fest, year, city }), tt('{festival} falls on {day} in {city}.', { festival: fest, day, city })],
        [tt('What time is {festival} in {city}?', { festival: fest, city }), answer],
      ];
      return page({
        lang, base: baseOf(req), path: `/festivals/${f.slug}/${c.slug}`, image: `${baseOf(req)}/og/festival-${f.slug}/${c.slug}.png`,
        title: titles[f.kind],
        description: fit(answer, tt('Also sunrise, sunset, moonrise and tithi times for {city}.', { city })),
        h1: tt('{festival} {year} in {city}', { festival: fest, year, city }), lede: day,
        crumbs: [[tt('Festivals'), '/festivals'], [fest, `/festivals/${f.slug}`], [city, `/festivals/${f.slug}/${c.slug}`]],
        jsonld: faqLd(faq),
        body: `<p class="answer">${esc(answer)}</p>
          ${x.muhurat || f.kind === 'moonrise' || f.kind === 'chhath' ? `<div class="card now"><div class="sub">${esc(keyLabel(tt, f))}</div><div class="big">${esc(keyTime(f, x))}</div><div class="sub">${esc(day)}</div></div>` : ''}
          <div class="table-wrap card"><table><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td><strong>${esc(v)}</strong></td></tr>`).join('')}</tbody></table></div>
          <section class="card"><p>${esc(dt(FESTIVAL_INFO[f.slug] || ''))}</p></section>
          <p class="method hint">${esc(tt('Calculated for {city} ({lat}, {lon}, {tz}) from local sunrise {sunrise} and sunset {sunset}, with the Lahiri ayanamsa. Updated at {time} local time.', { city, lat: c.lat.toFixed(2), lon: c.lon.toFixed(2), tz: c.tz, sunrise: x.sunrise, sunset: x.sunset, time: nowIn(c.tz) }))} ${esc(tt('Festival rules differ between regions and traditions. Rekha follows the common North Indian Panchang; check with your local priest for family ceremonies.'))}</p>
          ${cta(tt('Choghadiya on the day'), `/choghadiya/${c.slug}`, tt('Good and bad times for {city}, from local sunrise.', { city }))}
          ${faqHtml(faq)}
          <section class="block"><h2>${esc(tt('{festival} in other cities', { festival: fest }))}</h2><ul class="link-grid">${CITY.filter((o) => o.slug !== c.slug).slice(0, 60).map((o) => `<li><a href="/festivals/${f.slug}/${o.slug}">${esc(dt(o.name))}</a></li>`).join('')}</ul>
          <p><a href="/festivals/${f.slug}">${esc(tt('{festival} {year}', { festival: fest, year }))}</a> · <a href="/festivals">${esc(tt('All festivals'))}</a></p></section>`,
      });
    }), 3600);
  });

  // ---------- crawlers ----------
  // Sitemap index: one file per language for the daily pages, one for festivals per language,
  // one for the guides. Each stays far below the 50,000-address limit as cities are added.
  const DAILY = ['choghadiya', 'rahu-kaal', 'panchang'];
  const sitemapPages = (lang, kind) => {
    const today = todayIn('Asia/Kolkata');
    if (kind === 'pages') {
      return [
        ['/', today, 'daily', '1.0'], ['/insights', UPDATED, 'weekly', '0.8'], ['/horoscope', today, 'daily', '0.9'], ['/festivals', today, 'daily', '0.9'],
        ...DAILY.map((x) => [`/${x}`, today, 'daily', '0.8']),
        ...SIGN_SLUGS.map((s) => [`/horoscope/${s}`, today, 'daily', '0.8']),
        ...CITY.flatMap((c) => [
          ...DAILY.map((x) => [`/${x}/${c.slug}`, today, 'daily', '0.7']),
          ...DAILY.map((x) => [`/${x}/${c.slug}/tomorrow`, today, 'daily', '0.6']),
          [`/panchang/${c.slug}/calendar`, today, 'weekly', '0.6'],
        ]),
      ].map(([u, ...rest]) => [localePath(lang, u), ...rest]);
    }
    if (kind === 'festivals') {
      return FESTIVALS.filter((f) => nextFestivalDate(f.slug)).flatMap((f) => [[`/festivals/${f.slug}`, today, 'weekly', '0.8'], ...(f.city ? CITY.map((c) => [`/festivals/${f.slug}/${c.slug}`, today, 'weekly', '0.6']) : [])])
        .map(([u, ...rest]) => [localePath(lang, u), ...rest]);
    }
    return [
      ...ARTICLES.flatMap((a) => articleLangs(a).map((l) => [localePath(l, `/insights/${a.slug}`), UPDATED, 'monthly', '0.7'])),
      // /privacy and /terms are added once the lawyer-reviewed versions are in place (LEGAL_PAGES_FINAL=1).
      ...(process.env.LEGAL_PAGES_FINAL === '1' ? [['/privacy', UPDATED, 'yearly', '0.2'], ['/terms', UPDATED, 'yearly', '0.2']] : []),
    ];
  };
  const urlset = (base, urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d, f, p]) => `<url><loc>${base}${u}</loc><lastmod>${d}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`).join('\n')}
</urlset>`;
  app.get('/sitemap.xml', (req, res) => {
    const base = baseOf(req); const today = todayIn('Asia/Kolkata');
    const files = [...readyLangs().flatMap((l) => [`pages-${l}`, `festivals-${l}`]), 'insights'];
    res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map((f) => `<sitemap><loc>${base}/sitemaps/${f}.xml</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}
</sitemapindex>`);
  });
  app.get('/sitemaps/:file.xml', (req, res, next) => {
    const m = /^(pages|festivals)-([a-z]{2})$|^(insights)$/.exec(req.params.file); if (!m) return next();
    const lang = m[2] || 'en';
    if (m[2] && !readyLangs().includes(lang)) return next();
    res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(urlset(baseOf(req), sitemapPages(lang, m[1] || m[3])));
  });
  /** Every indexable address (English and the live languages), for IndexNow. */
  app.locals.allUrls = (base) => [...readyLangs().flatMap((l) => [...sitemapPages(l, 'pages'), ...sitemapPages(l, 'festivals')]), ...sitemapPages('en', 'insights')].map(([u]) => `${base}${u}`);

  // Machine-readable daily data for AI assistants and developers: the same numbers as the pages.
  app.get('/data/:type/:city.json', (req, res, next) => {
    const c = CITY_BY_SLUG.get(req.params.city);
    if (!c || !DAILY.includes(req.params.type)) return next();
    const { date, t, p } = dayData(c);
    const base = baseOf(req);
    const out = {
      source: `${base}/${req.params.type}/${c.slug}`, method: `${base}/insights/how-rekha-works`, license: 'Free to cite with a link to the source page.',
      city: { name: c.name, lat: c.lat, lon: c.lon, timezone: c.tz }, date, generatedAt: new Date().toISOString(),
      sunrise: t.sunrise, sunset: t.sunset, ayanamsa: 'Lahiri',
    };
    if (req.params.type === 'choghadiya') Object.assign(out, { day: t.choghadiya.day, night: t.choghadiya.night, bestWindows: t.bestWindows.general, avoid: t.badTimes });
    if (req.params.type === 'rahu-kaal') Object.assign(out, { rahuKaal: t.badTimes.find((b) => b.name === 'Rahu Kaal'), periodsToAvoid: t.badTimes, auspicious: t.goodTimes.filter((g) => !g.skip) });
    if (req.params.type === 'panchang') Object.assign(out, { tithi: p.tithi, nakshatra: p.nakshatra, yoga: p.yoga, karana: p.karana, vara: p.vara, masa: p.masa, moonrise: p.moonrise, moonset: p.moonset, moonSign: p.moonSign, sunSign: p.sunSign, festivals: p.festivals });
    res.set({ 'Cache-Control': 'public, max-age=900, s-maxage=1800', 'Access-Control-Allow-Origin': '*' }).json(out);
  });
  app.get('/data/festivals.json', (req, res) => {
    const base = baseOf(req);
    res.set({ 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }).json({
      source: `${base}/festivals`, method: `${base}/insights/how-rekha-works`, reference: 'Dates for India (Delhi). Other time zones can differ by a day; see each city page.',
      festivals: festivalCalendar().map((f) => ({ slug: f.slug, name: f.name, date: f.date, page: `${base}/festivals/${f.slug}` })),
    });
  });

  // Share images (1200 x 630) for each city page: city, date and the key time, readable in a chat preview.
  app.get('/og/:kind/:city.png', async (req, res, next) => {
    const c = CITY_BY_SLUG.get(req.params.city); if (!c) return next();
    const kind = req.params.kind;
    const fest = kind.startsWith('festival-') ? FESTIVAL_BY_SLUG.get(kind.slice(9)) : null;
    const offset = kind.endsWith('-tomorrow') ? 1 : 0;
    const type = kind.replace(/-tomorrow$/, '');
    if (!fest && !DAILY.includes(type)) return next();
    try {
      let title, big, sub, date;
      if (fest) {
        const x = festivalIn(fest.slug, c, todayIn('Asia/Kolkata')); if (!x) return next();
        date = x.date; title = `${fest.name} ${x.date.slice(0, 4)} in ${c.name}`;
        big = fest.kind === 'moonrise' ? `Moonrise ${x.moonrise}` : fest.kind === 'chhath' ? `Arghya ${x.sandhyaArghya} / ${x.ushaArghya}` : x.muhurat ? `${x.muhurat.start} to ${x.muhurat.end}` : `Pradosh ${x.pradosh?.start} to ${x.pradosh?.end}`;
        sub = fest.kind === 'lakshmi' ? 'Puja muhurat' : fest.kind === 'nishita' ? 'Nishita puja time' : fest.kind === 'pradosh' ? 'Holika Dahan' : 'Local times';
      } else {
        const d = dayData(c, offset); date = d.date;
        const rk = d.t.badTimes.find((b) => b.name === 'Rahu Kaal'); const best = d.t.bestWindows.general[0];
        title = `${type === 'rahu-kaal' ? 'Rahu Kaal' : type === 'panchang' ? 'Panchang' : 'Choghadiya'} ${offset ? 'tomorrow' : 'today'} in ${c.name}`;
        big = type === 'panchang' ? `${d.p.paksha} ${d.p.tithi[0].name}` : type === 'rahu-kaal' || !best ? `Rahu Kaal ${rk.start} to ${rk.end}` : `Best ${best.start} to ${best.end}`;
        sub = type === 'panchang' ? `${d.p.nakshatra[0].name} nakshatra · Sunrise ${d.p.sunrise}` : `Sunrise ${d.t.sunrise} · Sunset ${d.t.sunset}`;
      }
      const png = await shareImage({ title, big, sub, date: pretty(date, 'en') });
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=21600').type('image/png').send(png);
    } catch (e) { next(e); }
  });

  // IndexNow: tells Bing (which feeds ChatGPT search and Copilot), Yandex and others when pages change.
  app.get('/:key.txt', (req, res, next) => (req.params.key === indexNowKey() ? res.type('text/plain').send(indexNowKey()) : next()));


  // Search engines and AI crawlers are welcome on public pages; private areas are excluded.
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /*?paid=

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${baseOf(req)}/sitemap.xml
`);
  });

  // llms.txt: a short map of the site for AI assistants (https://llmstxt.org).
  app.get('/llms.txt', (req, res) => {
    const base = baseOf(req);
    const live = readyLangs().filter((l) => l !== 'en');
    const india = priceFor('solo', 'IN');
    const byCat = CATEGORY_ORDER.map((cat) => [cat, ARTICLES.filter((a) => a.category === cat)]).filter(([, l]) => l.length);
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('text/plain').send(`# Rekha

> Rekha (rekha.io) is a free web app for Hindu timekeeping and astrology: daily Choghadiya, Rahu Kaal, Hora and Panchang calculated from each city's local sunrise, a Vedic kundli (birth chart) with dasha and Sade Sati, kundli matching (36 gun), a daily Moon-sign horoscope, and AI palm and face reading. It works in ${live.length + 1} languages and installs as an app from the browser.

Key facts:
- Timings use the sunrise and sunset of the chosen city, sidereal positions with Lahiri ayanamsa, and the Hindu day running from sunrise to sunrise. They were checked against a reference almanac (Drik Panchang) for sample cities.
- Daily pages cover ${CITY.length} cities in India, Southeast Asia, the Gulf and elsewhere; the app itself searches about 7,000 cities worldwide.
- Free: timings, Panchang, festival calendar, kundli, matching score, daily horoscope and daily timing alerts. Palm and face reading and a short AI reading work without an account. Premium (Solo, Couple, Family) adds personal day ratings, daily AI guidance and full readings at one flat price per month or year, set per country (in India from ₹${india.amount} a month or ₹${priceFor('solo', 'IN', 'year').amount} a year).
- No wallet, no per-minute fees, no human astrologers, no gemstones or remedies for sale, no ads. Readings are labelled as AI-written and list the calculated facts each section is based on. Details: ${base}/insights/how-rekha-works
- Face reading runs on the user's phone; only measurements are sent. Palm photos are deleted after reading.
- Content is for entertainment and self-reflection, not medical, legal or financial advice.

## Daily pages
- [Choghadiya today by city](${base}/choghadiya): Amrit, Shubh, Labh, Char, Udveg, Kaal and Rog periods for the day and night
- [Rahu Kaal today by city](${base}/rahu-kaal): Rahu Kaal, Yamaganda, Gulika, Dur Muhurtam and Abhijit Muhurat
- [Panchang today by city](${base}/panchang): tithi, nakshatra, yoga, karana, vara, month, sunrise, moonrise and festivals
- [Daily horoscope by rashi](${base}/horoscope): all 12 Moon signs, with love, career, money and energy ratings
- Address patterns for ${CITY.length} cities: /choghadiya/<city>, /rahu-kaal/<city>, /panchang/<city>, each also with /tomorrow, and /panchang/<city>/calendar (two months)
- Example: [Choghadiya today in Mumbai](${base}/choghadiya/mumbai), [Rahu Kaal tomorrow in London](${base}/rahu-kaal/london/tomorrow), [Panchang calendar for Ahmedabad](${base}/panchang/ahmedabad/calendar)

## Festivals
- [Upcoming Hindu festivals](${base}/festivals): next dates of ${FESTIVALS.length} festivals
${festivalCalendar().slice(0, 8).map((f) => `- [${f.name} ${f.date.slice(0, 4)}](${base}/festivals/${f.slug}): ${f.date}${f.city ? `, with ${f.kind === 'moonrise' ? 'moonrise' : f.kind === 'chhath' ? 'arghya' : 'muhurat'} times for every city at /festivals/${f.slug}/<city>` : ''}`).join('\n')}

## Data (JSON, free to cite with a link)
- ${base}/data/choghadiya/<city>.json, ${base}/data/rahu-kaal/<city>.json, ${base}/data/panchang/<city>.json: today's values for a city, with the method and the source page
- ${base}/data/festivals.json: next festival dates

${byCat.map(([cat, list]) => `## Guides: ${cat}\n${list.map((a) => `- [${a.h1}](${base}/insights/${a.slug}): ${a.description}`).join('\n')}`).join('\n\n')}
${live.length ? `
## Languages
Every page also exists in ${live.map((l) => LANGS[l].english).join(', ')}, at ${base}/<code>/... (for example ${base}/hi/choghadiya/mumbai). English is at the root.
${live.map((l) => `- [${LANGS[l].english} (${LANGS[l].name})](${base}${localePath(l, '/')})`).join('\n')}
` : ''}
## App
- [Open the free app](${base}/): personal best times for an activity, kundli, matching, palm and face reading
- [Full text of all guides](${base}/llms-full.txt)
- [Sitemap](${base}/sitemap.xml)

## Optional
- [Privacy policy](${base}/privacy)
- [Terms of use](${base}/terms)
`);
  });

  // The full text of every English guide in one file, for AI assistants that read it whole.
  app.get('/llms-full.txt', (req, res) => {
    const base = baseOf(req);
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('text/plain').send(`# Rekha guides: full text\n\nSource: ${base}/insights. Updated ${UPDATED}. For entertainment and self-reflection; traditions differ between regions and schools.\n\n${ARTICLES.map((a) => `---\n\n# ${a.h1}\n\nURL: ${base}/insights/${a.slug}\n\n${a.body.trim()}\n\n${(a.faq || []).map(([q, ans]) => `### ${q}\n${ans}`).join('\n\n')}`).join('\n\n')}\n`);
  });
}
