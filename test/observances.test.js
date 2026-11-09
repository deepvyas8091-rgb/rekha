// Makar Sankranti, Pongal and Lohri; Bhai Dooj, Govardhan and Kartik Purnima muhurat; monthly vrat
// dates; the embeddable widget. Reference values were checked against Drik Panchang (New Delhi).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;
const { default: app } = await import('../src/server.js');
const { makarSankranti, sankrantiDay, festivalIn } = await import('../src/engine/festivals.js');
const { vratDates } = await import('../src/engine/vrat.js');

const DELHI = { lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' };
const TORONTO = { lat: 43.6532, lon: -79.3832, tz: 'America/Toronto' };
const mins = (a, b) => { const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)); return Math.abs(m(a) - m(b)); };

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); server.keepAliveTimeout = 60000; }));
after(() => server.close());
const get = (p) => fetch(base + p, { redirect: 'manual' });

test('Makar Sankranti 2027 matches the almanac: night transit moves it to the next day', () => {
  const t = makarSankranti('2026-12-01');
  const d = sankrantiDay(t, DELHI);
  // Drik Panchang, New Delhi 2027: moment 21:14 on 14 Jan; festival 15 Jan; Punya 07:15-17:46; Maha 07:15-09:00.
  assert.equal(d.date, '2027-01-15');
  assert.equal(d.at, 'night');
  const fmt = (x) => new Intl.DateTimeFormat('en-GB', { timeZone: DELHI.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(x);
  assert.ok(mins(fmt(t), '21:14') <= 20, `transit ${fmt(t)}`);
  assert.ok(mins(fmt(d.punya[0]), '07:15') <= 2 && mins(fmt(d.punya[1]), '17:46') <= 2);
  assert.ok(mins(fmt(d.maha[1]), '09:00') <= 2);
  // Toronto sees the transit at 10:30 in the morning of 14 Jan, so it keeps the festival that day.
  assert.equal(sankrantiDay(t, TORONTO).date, '2027-01-14');
});

test('Lohri is the eve of Makar Sankranti, Pongal the same day, in each city', () => {
  const ms = festivalIn('makar-sankranti', DELHI, '2026-12-01');
  const lohri = festivalIn('lohri', DELHI, '2026-12-01');
  const pongal = festivalIn('pongal', DELHI, '2026-12-01');
  assert.equal(pongal.date, ms.date);
  assert.equal(new Date(`${lohri.date}T12:00:00Z`).getTime(), new Date(`${ms.date}T12:00:00Z`).getTime() - 86400000);
  assert.match(lohri.bonfire, /^\d\d:\d\d$/);
});

test('Bhai Dooj tilak in Aparahna, Govardhan in the first and last fifth of the day, Dev Diwali in Pradosh', () => {
  const bd = festivalIn('bhai-dooj', DELHI, '2026-11-01');
  assert.equal(bd.date, '2026-11-11');
  assert.ok(bd.muhurat.start > '12:00' && bd.muhurat.end < '16:00');
  const gp = festivalIn('govardhan-puja', DELHI, '2026-11-01');
  assert.equal(gp.muhurat.start, gp.sunrise); assert.equal(gp.evening.end, gp.sunset);
  const kp = festivalIn('kartik-purnima', DELHI, '2026-11-01');
  assert.equal(kp.muhurat.start, kp.sunset);
});

test('Ekadashi dates and tithi times match the almanac; parana falls the next day', () => {
  const list = vratDates('ekadashi', DELHI, '2026-11-09');
  const by = Object.fromEntries(list.map((x) => [x.name, x]));
  // Drik Panchang, New Delhi 2026.
  assert.equal(by['Devutthana Ekadashi'].date, '2026-11-20');
  assert.equal(by['Utpanna Ekadashi'].date, '2026-12-04');
  assert.equal(by['Mokshada Ekadashi'].date, '2026-12-20');
  assert.ok(mins(by['Utpanna Ekadashi'].starts.slice(11), '23:03') <= 2 && mins(by['Utpanna Ekadashi'].ends.slice(11), '23:44') <= 2);
  assert.ok(list.length >= 23 && list.length <= 27, `${list.length} Ekadashis in a year`);
  for (const x of list) if (x.parana) assert.ok(x.parana.date > x.date && x.parana.start < x.parana.end);
});

test('Purnima, Amavasya, Pradosh and Sankashti for a city a year ahead', () => {
  const amav = vratDates('amavasya', DELHI, '2026-11-09');
  assert.equal(amav[0].date, '2026-11-09'); assert.equal(amav[0].masa, 'Kartik'); // the Diwali new moon, North Indian month name
  assert.ok(vratDates('purnima', DELHI, '2026-11-09').some((x) => x.date === '2026-11-24'));
  const sk = vratDates('sankashti-chaturthi', DELHI, '2026-11-09');
  assert.ok(sk.length >= 11 && sk.every((x) => /^\d\d:\d\d$/.test(x.moonrise)));
  const pr = vratDates('pradosh', TORONTO, '2026-11-09');
  assert.ok(pr.length >= 22 && pr.every((x) => x.puja));
});

test('vrat and new festival pages render with answers, and are in the sitemap', async () => {
  for (const [path, re] of [
    ['/vrat', /Monthly vrat dates/],
    ['/vrat/ekadashi', /parana/],
    ['/vrat/ekadashi/toronto', /Ekadashi .* in Toronto: Dates and Parana Times/],
    ['/vrat/sankashti-chaturthi/mumbai', /Moonrise is at \d\d:\d\d/],
    ['/festivals/makar-sankranti/ahmedabad', /Punya Kaal in Ahmedabad: \d\d:\d\d to \d\d:\d\d/],
    ['/festivals/lohri/amritsar', /Lohri fire is lit/],
    ['/festivals/bhai-dooj/pune', /Tilak Muhurat in Pune/],
    ['/hi/vrat/ekadashi/delhi', /पारण/],
  ]) {
    const r = await get(path);
    assert.equal(r.status, 200, path);
    assert.match(await r.text(), re, path);
  }
  const d = await (await get('/data/vrat/ekadashi/delhi.json')).json();
  assert.ok(d.dates.length > 20 && d.rule);
  const sm = await (await get('/sitemaps/festivals-en.xml')).text();
  assert.match(sm, /\/vrat\/pradosh\/london</);
  assert.match(sm, /\/festivals\/makar-sankranti\/delhi</);
});

test('embeddable widget can be framed, is not indexed, and the widgets page gives code with a link', async () => {
  const r = await get('/embed/today/toronto');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-security-policy'), 'frame-ancestors *');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  const html = await r.text();
  assert.match(html, /Rahu Kaal/); assert.match(html, /href="[^"]*\/choghadiya\/toronto"/);
  const w = await (await get('/widgets')).text();
  assert.match(w, /embed\/today\//); assert.match(w, /by Rekha/);
});
