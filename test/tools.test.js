// The free calculators at /tools: results from the engine, pages, sitemap and indexing rules.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;
const { default: app } = await import('../src/server.js');
const { TOOLS } = await import('../src/content/tools-info.js');
const { sadeSatiPeriods } = await import('../src/seo/tools.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); server.keepAliveTimeout = 60000; }));
after(() => server.close());
const get = (p) => fetch(base + p, { redirect: 'manual' });
const calc = (slug, body) => fetch(`${base}/api/tools/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const A = { date: '1990-08-15', time: '10:30', lat: 23.0225, lon: 72.5714, tz: 'Asia/Kolkata', city: 'Ahmedabad' };
const B = { date: '1992-03-02', time: '14:10', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', city: 'Mumbai' };

test('each calculator answers from the birth details', async () => {
  const out = {};
  for (const t of TOOLS) {
    const r = await calc(t.slug, { a: A, b: B });
    assert.equal(r.status, 200, t.slug);
    out[t.kind] = await r.json();
    assert.ok(out[t.kind].headline && out[t.kind].rows.length >= 2, t.slug);
  }
  // 15 Aug 1990, 10:30, Ahmedabad: Moon in Rohini (Taurus), Virgo rising.
  assert.match(out.moon.headline, /Vrishabha \(Taurus\)/);
  assert.match(out.nakshatra.headline, /Rohini, pada 3/);
  assert.match(out.lagna.headline, /Kanya \(Virgo\)/);
  assert.equal(out.dasha.table.rows.length, 9);
  assert.equal(out.dasha.table.rows[0][0], 'Moon');
  assert.match(out.manglik.headline, /Manglik/);
  assert.equal(out.match.table.rows.length, 8);
  assert.match(out.match.headline, /^\d+(\.5)? out of 36$/);
});

test('Sade Sati dates follow Saturn through the three signs around the Moon', () => {
  // Taurus Moon: Saturn enters sidereal Aries in early June 2027 and leaves Gemini in July 2034.
  const next = sadeSatiPeriods(1).find((p) => p.start > '2026-12-01');
  assert.ok(next.start >= '2027-05-28' && next.start <= '2027-06-08', next.start);
  assert.ok(next.end >= '2034-07-01' && next.end <= '2034-07-25', next.end);
  for (let s = 0; s < 12; s++) for (const p of sadeSatiPeriods(s)) if (!p.open) { const y = (new Date(p.end) - new Date(p.start)) / 31557600000; assert.ok(y > 6.5 && y < 9.2, `${s}: ${y}`); }
});

test('a missing birth time is handled honestly', async () => {
  const noTime = { ...A, time: '' };
  const lagna = await (await calc('ascendant-calculator', { a: noTime })).json();
  assert.match(lagna.headline, /birth time is needed/);
  const mang = await (await calc('manglik-dosha-checker', { a: noTime })).json();
  assert.ok(!mang.rows.some(([l]) => l === 'From the Lagna'));
  const moon = await (await calc('moon-sign-calculator', { a: noTime })).json();
  assert.equal(moon.notes.length, 1);
});

test('bad input is refused and other languages get translated results', async () => {
  assert.equal((await calc('moon-sign-calculator', { a: { ...A, date: '1890-01-01' } })).status, 400);
  assert.equal((await calc('moon-sign-calculator', { a: { ...A, tz: 'Nowhere/None' } })).status, 400);
  assert.equal((await calc('kundli-matching', { a: A })).status, 400);
  assert.equal((await calc('no-such-tool', { a: A })).status, 404);
  const hi = await (await calc('moon-sign-calculator', { a: A, lang: 'hi' })).json();
  assert.match(hi.headline, /चंद्र राशि/);
});

test('tool pages render with a form, questions and schema; English only in search', async () => {
  const hub = await (await get('/tools')).text();
  for (const t of TOOLS) assert.match(hub, new RegExp(`href="/tools/${t.slug}"`));
  for (const t of TOOLS) {
    const r = await get(`/tools/${t.slug}`);
    assert.equal(r.status, 200, t.slug);
    const html = await r.text();
    assert.match(html, /id="toolForm"/); assert.match(html, /"@type":"FAQPage"/); assert.match(html, /"@type":"WebApplication"/);
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.match(html, new RegExp(`/insights/${t.article}"`));
  }
  assert.equal((await get('/tools/none')).status, 404);
  const hi = await (await get('/hi/tools/moon-sign-calculator')).text();
  assert.match(hi, /<meta name="robots" content="noindex, follow"/);
  const sm = await (await get('/sitemaps/pages-en.xml')).text();
  assert.match(sm, /\/tools\/kundli-matching</); assert.match(sm, /\/tools</);
  assert.doesNotMatch(await (await get('/sitemaps/pages-hi.xml')).text(), /\/tools/);
  assert.match(await (await get('/llms.txt')).text(), /\/tools\/sade-sati-calculator/);
});
