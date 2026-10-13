// SEO pages: every sitemap URL renders, internal links resolve, structured data parses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;
const { default: app } = await import('../src/server.js');
const { ARTICLES } = await import('../src/seo/routes.js');
const { dailyHoroscope } = await import('../src/engine/horoscope.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => server.close());

test('daily horoscope: 12 signs, scores 1 to 5, deterministic', () => {
  for (let i = 0; i < 12; i++) {
    const h = dailyHoroscope('2026-10-13', i);
    for (const v of Object.values(h.scores)) assert.ok(v >= 1 && v <= 5);
    assert.deepEqual(h, dailyHoroscope('2026-10-13', i));
  }
  // Saturn in Pisces (2025 to 2027): Aquarius setting, Pisces peak, Aries rising.
  assert.equal(dailyHoroscope('2026-10-13', 10).sadeSati, 'setting');
  assert.equal(dailyHoroscope('2026-10-13', 11).sadeSati, 'peak');
  assert.equal(dailyHoroscope('2026-10-13', 0).sadeSati, 'rising');
});

test('horoscope API returns text in demo mode', async () => {
  const r = await (await fetch(`${base}/api/horoscope?sign=4&lang=hi`)).json();
  assert.equal(r.sign.en, 'Leo');
  assert.ok(r.text.length > 50);
  assert.equal((await fetch(`${base}/api/horoscope?sign=12`)).status, 400);
});

test('articles are complete', () => {
  assert.ok(ARTICLES.length >= 25);
  const slugs = new Set();
  for (const a of ARTICLES) {
    assert.ok(!slugs.has(a.slug), `duplicate ${a.slug}`); slugs.add(a.slug);
    assert.ok(a.title.length <= 70, `title too long: ${a.slug} (${a.title.length})`);
    assert.ok(a.description.length >= 90 && a.description.length <= 170, `description length ${a.slug}: ${a.description.length}`);
    assert.ok(a.body.split(/\s+/).length >= 380, `too short: ${a.slug}`);
    assert.ok(a.faq.length >= 2, `faq ${a.slug}`);
    for (const r of a.related) assert.ok(ARTICLES.some((x) => x.slug === r), `${a.slug} relates to missing ${r}`);
  }
});

test('every sitemap URL renders and every internal link resolves', async () => {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  assert.ok(urls.length >= 160, `only ${urls.length} URLs`);
  const links = new Set();
  for (const u of urls) {
    const res = await fetch(base + u);
    assert.equal(res.status, 200, u);
    const html = await res.text();
    assert.ok(!/undefined|NaN|\[object Object\]/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), `bad value on ${u}`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
    if (!/^\/([a-z]{2}\/)?$/.test(u)) { // the app shell has one h1 per tab
      assert.match(html, /<title>[^<]{10,}<\/title>/, `title on ${u}`);
      assert.match(html, /<meta name="description" content="[^"]{50,}"/, `description on ${u}`);
      assert.match(html, /<link rel="canonical"/, `canonical on ${u}`);
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `one h1 on ${u}`);
    }
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) links.add(m[1]);
  }
  for (const l of links) {
    if (/\.(css|svg|png|json)$/.test(l)) continue;
    const r = await fetch(base + l);
    assert.equal(r.status, 200, `broken internal link ${l}`);
  }
});

test('robots.txt allows search and AI crawlers, blocks private paths', async () => {
  const t = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(t, /Disallow: \/api\//);
  assert.match(t, /User-agent: GPTBot\nAllow: \//);
  assert.match(t, /Sitemap: http/);
  assert.match(await (await fetch(`${base}/llms.txt`)).text(), /Choghadiya today by city/);
});

test('unknown pages get a friendly 404', async () => {
  const r = await fetch(`${base}/insights/does-not-exist`);
  assert.equal(r.status, 404);
  assert.match(await r.text(), /Page not found/);
});
