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
  const index = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(index, /<sitemapindex/);
  const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  assert.ok(files.includes('/sitemaps/pages-en.xml') && files.includes('/sitemaps/festivals-en.xml') && files.includes('/sitemaps/insights.xml'));
  const all = [];
  for (const f of files) {
    const r = await fetch(base + f); assert.equal(r.status, 200, f);
    all.push(...[...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
  }
  assert.ok(all.length >= 3000, `only ${all.length} URLs`);
  assert.equal(new Set(all).size, all.length, 'no duplicate addresses');
  // Every hub, guide and English city type is rendered; the many city pages are sampled.
  const urls = all.filter((u, i) => !/\/(choghadiya|rahu-kaal|panchang|festivals\/[\w-]+)\/[\w-]+/.test(u) || i % 23 === 0 || /\/(mumbai|london|new-york)(\/|$)/.test(u));
  const links = new Set();
  for (const u of urls) {
    const res = await fetch(base + u);
    assert.equal(res.status, 200, u);
    const html = await res.text();
    assert.ok(!/undefined|NaN|\[object Object\]/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), `bad value on ${u}`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
    if (!/^\/([a-z]{2}\/)?$/.test(u)) { // the app shell has one h1 per tab
      assert.match(html, /<title>[^<]{10,}<\/title>/, `title on ${u}`);
      // Search results cut titles at about 60 to 70 characters and descriptions at about 160.
      const title = html.match(/<title>([^<]*)<\/title>/)[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const desc = html.match(/<meta name="description" content="([^"]*)"/)[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      assert.ok([...title].length <= 70, `title too long on ${u}: ${title}`);
      assert.ok([...desc].length <= 170, `description too long on ${u} (${[...desc].length})`);
      assert.match(html, /<meta name="description" content="[^"]{50,}"/, `description on ${u}`);
      assert.match(html, /<link rel="canonical"/, `canonical on ${u}`);
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `one h1 on ${u}`);
    }
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) links.add(m[1]);
  }
  const linkList = [...links].filter((l, i) => !/\/(choghadiya|rahu-kaal|panchang|festivals\/[\w-]+)\/[\w-]+/.test(l) || i % 17 === 0);
  for (const l of linkList) {
    if (/\.(css|svg|png|json|woff2)$/.test(l)) continue;
    const r = await fetch(base + l);
    assert.equal(r.status, 200, `broken internal link ${l}`);
  }
});

test('robots.txt allows search and AI crawlers, blocks private paths', async () => {
  const t = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(t, /Disallow: \/api\//);
  assert.match(t, /User-agent: GPTBot\nAllow: \//);
  assert.match(t, /Sitemap: http/);
  assert.match(t, /Disallow: \/\*\?paid=/);
  const llms = await (await fetch(`${base}/llms.txt`)).text();
  assert.match(llms, /^# Rekha\n\n> /);
  assert.match(llms, /Choghadiya today by city/);
  assert.match(llms, /## Languages[\s\S]*Hindi[\s\S]*Gujarati/);
  assert.match(llms, /in India from ₹49 a month/);
  const full = await (await fetch(`${base}/llms-full.txt`)).text();
  assert.ok(full.length > 50000, 'full text of every guide');
  assert.equal((full.match(/^URL: /gm) || []).length, ARTICLES.length);
});

test('unknown pages get a friendly 404', async () => {
  const r = await fetch(`${base}/insights/does-not-exist`);
  assert.equal(r.status, 404);
  assert.match(await r.text(), /Page not found/);
});

test('legal pages: absolute canonical, kept out of search while drafts', async () => {
  const h = await (await fetch(`${base}/privacy`)).text();
  assert.match(h, /<title>Privacy Policy: Rekha/);
  assert.match(h, /<link rel="canonical" href="http/);
  assert.match(h, /noindex/);
  assert.doesNotMatch(h, /Razorpay\. We never/);
  assert.doesNotMatch(await (await fetch(`${base}/sitemap.xml`)).text(), /\/privacy</);
  const r = await fetch(`${base}/hi/terms`, { redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/terms');
});

test('trust page: listed, linked from every page, short link, honest labels', async () => {
  const page = await fetch(`${base}/insights/how-rekha-works`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /No wallet, no per-minute fees, no shop/);
  assert.match(html, /FAQPage/);
  const r = await fetch(`${base}/hi/trust`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/hi/insights/how-rekha-works');
  // Footer of the public pages and the app shell link to it.
  assert.match(await (await fetch(`${base}/choghadiya/mumbai`)).text(), /href="\/insights\/how-rekha-works"/);
  assert.match(await (await fetch(`${base}/`)).text(), /href="\/insights\/how-rekha-works"/);
  assert.match(await (await fetch(`${base}/llms.txt`)).text(), /No wallet, no per-minute fees/);
  // Horoscope pages explain the Indian vs Western sign difference; the rules-based
  // fallback text (demo mode) is not labelled as AI.
  const horo = await (await fetch(`${base}/horoscope`)).text();
  assert.match(horo, /Why is my sign different here\?/);
  assert.doesNotMatch(await (await fetch(`${base}/horoscope/aries`)).text(), /class="ai-label"/);
});
