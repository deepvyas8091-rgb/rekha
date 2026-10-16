// Speed, caching, festivals, more cities and AI-search features.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;
const { default: app } = await import('../src/server.js');
const { festivalIn, nextFestivalDate } = await import('../src/engine/festivals.js');
const { submitIndexNow, indexNowKey } = await import('../src/seo/indexnow.js');
const { fitTitle } = await import('../src/seo/layout.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); server.keepAliveTimeout = 60000; }));
after(() => server.close());
const get = (p) => fetch(base + p, { redirect: 'manual' });

test('hashed, minified files with a one-year cache; fonts from rekha.io; no Google Fonts', async () => {
  const html = await (await get('/hi/')).text();
  const js = html.match(/src="(\/assets\/app\.[0-9a-f]{10}\.js)"/)[1];
  const css = html.match(/href="(\/assets\/styles\.[0-9a-f]{10}\.css)"/)[1];
  assert.match(html, /rel="modulepreload" href="\/assets\/guide\.[0-9a-f]{10}\.js"/);
  assert.match(html, /rel="preload" href="\/api\/i18n\/hi\?v=/);
  assert.match(html, /window\.__early=/);
  assert.doesNotMatch(html, /googleapis/);
  const r = await get(js);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const body = await r.text();
  const source = (await import('node:fs')).readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').length;
  assert.ok(body.length < source * 0.8, `app.js is minified (${body.length} of ${source} bytes)`);
  assert.match(body, /from"\/assets\/guide\.[0-9a-f]{10}\.js"/, 'imports point at hashed files');
  assert.equal((await get(css)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  // An old hash still works (briefly cached), so a cached page never loads a broken app.
  assert.equal((await get('/assets/app.0000000000.js')).status, 200);
  const font = html.match(/url\((\/fonts\/noto-sans-devanagari\/[^)]+\.woff2)\)/)[1];
  const f = await get(font);
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const sw = await (await get('/sw.js')).text();
  assert.match(sw, /const CACHE = 'rekha-[0-9a-f]{10}'/);
  assert.ok(sw.includes(js), 'service worker pre-caches the current files');
});

test('cache headers: shared pages cacheable by the CDN, personal and root responses not', async () => {
  assert.match((await get('/choghadiya/mumbai')).headers.get('cache-control'), /s-maxage=\d+, stale-while-revalidate/);
  assert.equal((await get('/')).headers.get('cache-control'), 'private, no-cache');
  assert.match((await get('/gu/')).headers.get('cache-control'), /^public/);
  assert.match((await get('/api/timings?lat=19.07&lon=72.87&tz=Asia/Kolkata')).headers.get('cache-control'), /^public/);
  assert.match((await get('/api/meta')).headers.get('cache-control'), /^public/);
});

test('festival muhurat matches the published reference (Diwali 2025, Delhi: 19:08 to 20:18)', () => {
  const x = festivalIn('diwali', { lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' }, '2025-10-15');
  assert.equal(x.date, '2025-10-20');
  const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
  assert.ok(Math.abs(mins(x.muhurat.start) - mins('19:08')) <= 2, x.muhurat.start);
  assert.ok(Math.abs(mins(x.muhurat.end) - mins('20:18')) <= 2, x.muhurat.end);
  assert.ok(nextFestivalDate('navratri', '2026-10-14') <= '2026-10-11', 'Navratri found mid-way, counted back to day 1');
});

test('festival pages: hub, festival, city; tomorrow and calendar pages; more cities', async () => {
  const hub = await (await get('/festivals')).text();
  assert.match(hub, /href="\/festivals\/diwali"/);
  const city = await (await get('/festivals/diwali/london')).text();
  assert.match(city, /<p class="answer">Diwali puja muhurat in London on/);
  assert.match(city, /og:image" content="[^"]+\/og\/festival-diwali\/london\.png"/);
  assert.match(await (await get('/hi/festivals/karwa-chauth/delhi')).text(), /चंद्रोदय/);
  assert.equal((await get('/festivals/navratri/london')).status, 404, 'only muhurat festivals have city pages');
  assert.match(await (await get('/rahu-kaal/brampton/tomorrow')).text(), /<h1>Rahu Kaal tomorrow in Brampton<\/h1>/);
  assert.match(await (await get('/panchang/houston/calendar')).text(), /<table class="cal-table">/);
  const cg = await (await get('/choghadiya/suva')).text();
  assert.match(cg, /<p class="answer">On /);
  assert.match(cg, /Calculated for Suva \(-18\.\d\d, 178\.\d\d, Pacific\/Fiji\)/);
  assert.match(cg, /"@type":"Organization"/);
  assert.match(cg, /"@type":"WebSite"/);
});

test('JSON data, share images and IndexNow', async () => {
  const d = await (await get('/data/rahu-kaal/mumbai.json')).json();
  assert.match(d.rahuKaal.start, /^\d\d:\d\d$/);
  assert.match(d.source, /\/rahu-kaal\/mumbai$/);
  assert.ok((await (await get('/data/festivals.json')).json()).festivals.length > 10);
  const png = await get('/og/choghadiya/mumbai.png');
  assert.equal(png.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await png.arrayBuffer());
  assert.equal(buf.readUInt32BE(16), 1200); assert.equal(buf.readUInt32BE(20), 630);
  assert.equal((await get('/og/festival-diwali/delhi.png')).status, 200);
  assert.equal(await (await get(`/${indexNowKey()}.txt`)).text(), indexNowKey());
  const sent = [];
  const st = await submitIndexNow('https://rekha.io', app.locals.allUrls('https://rekha.io'), async (url, o) => { sent.push(JSON.parse(o.body)); return { status: 200 }; });
  assert.deepEqual(st, [200]);
  assert.equal(sent[0].host, 'rekha.io');
  assert.ok(sent[0].urlList.includes('https://rekha.io/festivals/diwali/mumbai'));
  const robots = await (await get('/robots.txt')).text();
  assert.doesNotMatch(robots, /Disallow: \/data/);
  assert.match(await (await get('/llms.txt')).text(), /## Festivals[\s\S]*## Data \(JSON/);
});

test('long generated titles are shortened at a natural break', () => {
  assert.equal(fitTitle('Panchang Calendar November 2026 for Thiruvananthapuram: Tithi and Festivals'), 'Panchang Calendar November 2026 for Thiruvananthapuram');
});
