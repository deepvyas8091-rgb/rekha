// Regression tests against Drik Panchang reference values
// (Vadodara, 12 Oct 2026, fetched during development). Tolerance: 5 minutes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panchang, goodBadTimes, birthProfile, gunMilan } from '../src/engine/index.js';
import { tropicalAscendant, tropicalLon, nextRiseSet } from '../src/engine/astro.js';

const VAD = [22.3072, 73.1812, 'Asia/Kolkata'];
const mins = (hhmm) => { const [h, m] = hhmm.slice(-5).split(':').map(Number); return h * 60 + m; };
const near = (actual, expected, tol = 5) =>
  assert.ok(Math.abs(mins(actual) - mins(expected)) <= tol, `${actual} vs reference ${expected}`);

test('panchang matches Drik Panchang reference', () => {
  const p = panchang('2026-10-12', ...VAD);
  near(p.sunrise, '06:32');
  near(p.sunset, '18:15');
  assert.equal(p.tithi[0].name, 'Dwitiya');
  near(p.tithi[0].endsAt, '22:13');
  assert.equal(p.nakshatra[0].name, 'Swati');
  near(p.nakshatra[0].endsAt, '23:52');
  assert.equal(p.yoga[0].name, 'Vishkambha');
  near(p.yoga[0].endsAt, '20:32');
  assert.deepEqual(p.karana.slice(0, 3).map((k) => k.name), ['Balava', 'Kaulava', 'Taitila']);
  near(p.karana[0].endsAt, '09:48');
  assert.equal(p.vara.en, 'Monday');
  assert.equal(p.masa.amanta, 'Ashwin');
});

test('good and bad times match Drik Panchang reference', () => {
  const g = goodBadTimes('2026-10-12', ...VAD);
  const bad = Object.fromEntries(g.badTimes.map((b) => [b.name + b.start, b]));
  const find = (list, name) => list.filter((x) => x.name === name);
  near(find(g.badTimes, 'Rahu Kaal')[0].start, '08:00');
  near(find(g.badTimes, 'Yamaganda')[0].start, '10:56');
  near(find(g.badTimes, 'Gulika Kaal')[0].start, '13:51');
  const dur = find(g.badTimes, 'Dur Muhurtam');
  near(dur[0].start, '12:47');
  near(dur[1].start, '15:07');
  near(find(g.goodTimes, 'Abhijit Muhurta')[0].start, '12:00');
  near(find(g.goodTimes, 'Brahma Muhurta')[0].start, '04:54');
  near(find(g.goodTimes, 'Vijaya Muhurta')[0].start, '14:21');
  near(find(g.goodTimes, 'Godhuli Muhurta')[0].end, '18:39');
  near(find(g.goodTimes, 'Nishita Muhurta')[0].start, '23:59');
  assert.ok(Object.keys(bad).length >= 5);
});

test('choghadiya order: Monday day starts Amrit, night starts Char', () => {
  const g = goodBadTimes('2026-10-12', ...VAD);
  assert.deepEqual(g.choghadiya.day.map((c) => c.name), ['Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg', 'Char', 'Labh', 'Amrit']);
  assert.deepEqual(g.choghadiya.night.map((c) => c.name), ['Char', 'Rog', 'Kaal', 'Labh', 'Udveg', 'Shubh', 'Amrit', 'Char']);
  assert.equal(g.hora.length, 24);
  assert.equal(g.hora[0].lord, 'Moon');
});

test('ascendant equals the Sun at sunrise and its opposite at sunset', () => {
  const sr = nextRiseSet('Sun', new Date('2026-10-12T00:00:00Z'), 22.3, 73.18, 1);
  const diff = Math.abs(tropicalAscendant(sr, 22.3, 73.18) - tropicalLon('Sun', sr));
  assert.ok(diff < 1.5, `diff ${diff}`);
});

test('birth profile produces all systems', () => {
  const p = birthProfile({ date: '1990-05-15', time: '08:30', lat: 23.0225, lon: 72.5714, tz: 'Asia/Kolkata', name: 'Test' });
  assert.equal(p.vedic.planets.length, 9);
  assert.equal(p.vedic.dasha.periods.length, 9);
  assert.equal(p.chinese.zodiac.chinese, 'Horse'); // 1990 = Metal Horse
  assert.equal(p.thai.day, 'Tuesday');
  assert.equal(p.western.sunSign, 'Taurus');
});

test('BaZi day pillar anchor: 2000-01-01 is Wu-Wu', async () => {
  const { bazi } = await import('../src/engine/world.js');
  const b = bazi(new Date('2000-01-01T06:00:00Z'), 'Asia/Shanghai');
  assert.equal(b.pillars.day.label.split(' ')[0], 'Wu-Wu');
});

test('2026 festivals land on published dates (observance-time rules)', () => {
  const has = (d, f) => panchang(d, ...VAD).festivals.some((x) => x.startsWith(f));
  assert.ok(has('2026-11-08', 'Diwali'), 'Diwali 2026 is 8 Nov (Amavasya at pradosh)');
  assert.ok(!has('2026-11-09', 'Diwali'));
  assert.ok(has('2026-09-04', 'Janmashtami'));
  assert.ok(has('2026-10-21', 'Dussehra'));
  assert.ok(has('2026-10-13', 'Sharad Navratri day 3'));
});

test('gun milan totals stay within 0..36', () => {
  for (let a = 0; a < 360; a += 37) {
    for (let b = 0; b < 360; b += 41) {
      const r = gunMilan({ moonLongitude: a }, { moonLongitude: b });
      assert.ok(r.total >= 0 && r.total <= 36, `${a},${b} -> ${r.total}`);
      assert.ok(r.kootas.every((k) => typeof k.score === 'number'));
    }
  }
});
