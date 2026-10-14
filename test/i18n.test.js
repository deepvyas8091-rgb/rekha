// Languages: URL prefixes, hreflang, hand-written packs, the translation job (with a
// fake model), export/import, and the rekha.io canonical-host redirect.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'admin-test-token';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.PUBLIC_URL;

const reader = await import('../src/ai/reader.js');
const i18n = await import('../src/i18n/index.js');
const { catalog } = await import('../src/i18n/catalog.js');
const { runTranslations, missingStrings } = await import('../src/i18n/jobs.js');
const { ARTICLES } = await import('../src/seo/routes.js');
const { default: app } = await import('../src/server.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => { reader._setClient(null); server.close(); });
const get = (p, opts) => fetch(base + p, { redirect: 'manual', ...opts });
const admin = { 'x-admin-token': 'admin-test-token', 'content-type': 'application/json' };

test('hand-written Hindi and Gujarati cover the whole interface and page text', () => {
  const c = catalog();
  for (const lang of ['hi', 'gu']) {
    const pack = i18n.HAND_PACKS[lang];
    for (const g of ['app', 'seo']) assert.deepEqual(c[g].filter((s) => !pack[s]), [], `${lang} ${g} missing`);
    for (const [k, v] of Object.entries(pack)) {
      const marks = (s) => (s.match(/\{\w+\}|<\/?\w+/g) || []).sort().join();
      assert.equal(marks(v), marks(k), `${lang} placeholders differ: ${k}`);
    }
  }
  assert.deepEqual(i18n.readyLangs().slice(0, 3), ['en', 'hi', 'gu']);
});

test('language pages: html lang, translated text, hreflang, prefixed links', async () => {
  const html = await (await get('/gu/choghadiya/vadodara')).text();
  assert.match(html, /<html lang="gu" data-lang="gu"/);
  assert.match(html, /<h1>વડોદરામાં આજનાં ચોઘડિયાં<\/h1>/);
  assert.match(html, /hreflang="hi" href="[^"]+\/hi\/choghadiya\/vadodara"/);
  assert.match(html, /hreflang="x-default" href="[^"]+\/choghadiya\/vadodara"/);
  assert.match(html, /href="\/gu\/rahu-kaal\/vadodara"/);
  assert.match(html, /Noto\+Sans\+Gujarati/);
  assert.doesNotMatch(html, /name="robots" content="noindex/);
  const shell = await (await get('/hi/')).text();
  assert.match(shell, /<title>Rekha: चौघड़िया/);
  assert.match(shell, /data-i18n>साइन इन</);
  assert.match(shell, /placeholder="मेरी कुंडली/);
  // English stays at the root; /en/ redirects there.
  assert.equal((await get('/en/insights')).headers.get('location'), '/insights');
});

test('a language that is not translated yet is served but not indexed', async () => {
  const html = await (await get('/ta/panchang/chennai')).text();
  assert.match(html, /<html lang="ta"/);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.match(html, /rel="canonical" href="[^"]+\/panchang\/chennai"/);
  const sitemap = await (await get('/sitemap.xml')).text();
  assert.match(sitemap, /\/gu\/panchang\/vadodara/);
  assert.doesNotMatch(sitemap, /\/ta\//);
  // Articles are only listed in a language once translated.
  assert.doesNotMatch(sitemap, /\/hi\/insights\/what-is-choghadiya/);
  const art = await (await get('/hi/insights/what-is-choghadiya')).text();
  assert.match(art, /अभी हिन्दी में उपलब्ध नहीं/);
  assert.match(art, /noindex/);
});

test('returning visitor with a saved language gets it at the root', async () => {
  const r = await get('/', { headers: { cookie: 'rk_lang=gu' } });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/gu/');
  assert.equal((await get('/')).status, 200);
});

test('browser pack holds only translated strings and is versioned', async () => {
  const p = await (await get('/api/i18n/gu')).json();
  assert.equal(p.strings['Sign in'], 'સાઇન ઇન');
  assert.equal(p.strings['Magha (month)'], 'મહા');
  assert.ok(!('Rekha: Choghadiya, Kundli, Palm and Face Reading' in p.strings), 'page-only strings stay on the server');
  assert.ok(p.version);
  assert.equal((await get('/api/i18n/xx')).status, 404);
});

test('translation job: fake model, only missing strings, placeholders checked, articles go live', async () => {
  const calls = [];
  // The fake "translates" by tagging each item, keeping placeholders and markup intact.
  reader._setClient({
    messages: {
      create: async (params) => {
        calls.push(params);
        const items = JSON.parse(params.messages[0].content.split('\n').slice(1).join('\n'));
        // Item 3 loses a placeholder, item 5 comes back in Hindi: both must be rejected.
        const out = items.map((s, i) => (i === 3 && !params.messages[0].content.includes('article') ? 'broken {nope}'
          : i === 5 && !params.messages[0].content.includes('article') ? 'यह हिंदी में है, तमिल में नहीं' : `தமிழ்:${s}`));
        return { usage: { input_tokens: 100, output_tokens: 100 }, content: [{ type: 'tool_use', input: { translations: out } }] };
      },
    },
  });
  const before = missingStrings('ta').length;
  const st = await runTranslations({ langs: ['ta'], articles: ARTICLES.slice(0, 2) });
  assert.equal(st.error, null);
  const failed1 = st.failed;
  assert.ok(failed1 > 0, 'a translation that lost a placeholder is rejected');
  assert.equal(missingStrings('ta').length, failed1);
  assert.ok(before > 1000);
  assert.ok(calls.every((c) => c.model === 'claude-haiku-5-5'));
  assert.match(calls[0].system[0].text, /Keep every \{placeholder\}/);

  // Second run: only the rejected strings are retried.
  calls.length = 0;
  await runTranslations({ langs: ['ta'], articles: ARTICLES.slice(0, 2) });
  const sent = calls.flatMap((c) => JSON.parse(c.messages[0].content.split('\n').slice(1).join('\n')));
  assert.equal(sent.length, failed1);

  // Tamil is now live: indexed, in the sitemap, with its two translated articles.
  i18n.invalidate();
  assert.ok(i18n.readyLangs().includes('ta'));
  const sitemap = await (await get('/sitemap.xml')).text();
  assert.match(sitemap, new RegExp(`/ta/insights/${ARTICLES[0].slug}`));
  assert.doesNotMatch(sitemap, new RegExp(`/ta/insights/${ARTICLES[5].slug}<`));
  const art = await (await get(`/ta/insights/${ARTICLES[0].slug}`)).text();
  assert.match(art, /<h1>தமிழ்:/);
  assert.match(art, /hreflang="ta"/);
  reader._setClient(null);
});

test('export and import for native review; reviewed lines are never overwritten by AI', async () => {
  assert.equal((await get('/api/admin/translations/ta')).status, 403);
  const exp = await (await get('/api/admin/translations/ta', { headers: admin })).json();
  const row = exp.strings.find((s) => s.en === 'Sign in');
  assert.equal(row.source, 'ai');
  row.text = 'உள்நுழை';
  const r = await (await fetch(`${base}/api/admin/translations/ta`, { method: 'POST', headers: admin, body: JSON.stringify({ strings: [row] }) })).json();
  assert.equal(r.imported, 1);
  i18n.invalidate();
  assert.equal(i18n.t('ta', 'Sign in'), 'உள்நுழை');
  const { putTranslations } = await import('../src/db.js');
  putTranslations('ta', 'ui', [{ src: 'Sign in', text: 'தமிழ்:machine again' }]);
  i18n.invalidate();
  assert.equal(i18n.t('ta', 'Sign in'), 'உள்நுழை');
  const status = await (await get('/api/admin/translations', { headers: admin })).json();
  assert.ok(status.langs.find((l) => l.lang === 'ta').live);
});

test('canonical host: other hosts redirect to PUBLIC_URL, the API does not', async () => {
  // A separate app instance is not needed: the middleware reads PUBLIC_URL at startup,
  // so this checks the behaviour through a request with a different Host header instead.
  const { default: http } = await import('node:http');
  process.env.PUBLIC_URL = 'https://rekha.io';
  const mod = await import(`../src/server.js?host=${Date.now()}`);
  const s2 = mod.default.listen(0);
  await new Promise((r) => s2.once('listening', r));
  const port = s2.address().port;
  const req = (path) => new Promise((resolve) => http.get({ port, path, headers: { host: 'rekha-production-12c6.up.railway.app' } }, (res) => { res.resume(); resolve(res); }));
  const page = await req('/gu/panchang?x=1');
  assert.equal(page.statusCode, 301);
  assert.equal(page.headers.location, 'https://rekha.io/gu/panchang?x=1');
  assert.equal((await req('/api/meta')).statusCode, 200);
  s2.close();
  delete process.env.PUBLIC_URL;
});

test('behind Cloudflare, rate limits use the visitor IP, not Cloudflare\'s', async () => {
  const { clientIp } = await import('../src/env.js');
  const req = (h) => ({ ip: '172.64.0.1', get: (k) => h[k.toLowerCase()] });
  assert.equal(clientIp(req({ 'cf-connecting-ip': '49.36.1.2', 'cf-ray': 'abc-DXB' })), '49.36.1.2');
  assert.equal(clientIp(req({ 'cf-connecting-ip': '49.36.1.2' })), '172.64.0.1', 'header ignored without CF-Ray');
  assert.equal(clientIp(req({ 'cf-connecting-ip': 'x; drop', 'cf-ray': 'a' })), '172.64.0.1');
});

test('translations in the wrong script are rejected and purged', async () => {
  const { scriptOk } = await import('../src/i18n/script.js');
  assert.equal(scriptOk('ta', 'சௌகடியா என்றால் என்ன'), true);
  assert.equal(scriptOk('ta', 'चौघड़िया क्या है'), false, 'Hindi is not Tamil');
  assert.equal(scriptOk('gu', 'This sentence was never translated at all'), false);
  assert.equal(scriptOk('gu', 'Rekha'), true, 'brand names stay');
  assert.equal(scriptOk('vi', 'Choghadiya là gì'), true);
  const { putTranslations, getTranslations } = await import('../src/db.js');
  const { purgeWrongScript } = await import('../src/i18n/jobs.js');
  putTranslations('te', 'article:what-is-choghadiya', [{ src: 'h1', text: 'चौघड़िया क्या है?', srcHash: 'x' }, { src: 'title', text: 'చౌఘడియా అంటే ఏమిటి?', srcHash: 'y' }]);
  assert.equal(purgeWrongScript('te'), 1);
  assert.deepEqual(getTranslations('te', 'article:what-is-choghadiya').map((r) => r.src), ['title']);
});
