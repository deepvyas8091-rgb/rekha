// AI cost controls, verified against a fake Anthropic client that records every request.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DEV_LOGIN = '1';
delete process.env.ANTHROPIC_API_KEY;

const reader = await import('../src/ai/reader.js');
const store = await import('../src/db.js');
const { default: app } = await import('../src/server.js');

const calls = [];
const fake = {
  messages: {
    create: async (params) => {
      calls.push(params);
      const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      if (params.tool_choice?.name === 'write_reading') {
        return { usage, content: [{ type: 'tool_use', input: { sections: [
          { heading: 'Who you are', text: `Reading (${params.model})`, basis: ['F1', 'F2', 'F999', 'f3'] },
          { heading: 'Your current phase', text: 'A calm phase.', basis: [] },
        ] } }] };
      }
      if (params.tool_choice) return { usage, content: [{ type: 'tool_use', input: { isPalm: true, photoQuality: 'good', lines: { heart: { present: true, length: 'long', confidence: 0.9 } } } }] };
      return { usage, content: [{ type: 'text', text: `Reading (${params.model})` }] };
    },
  },
};
reader._setClient(fake);
beforeEach(() => { calls.length = 0; delete process.env.AI_CACHE; delete process.env.AI_MONTHLY_BUDGET_USD; });

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => server.close());

test('cost math includes cache writes (1.25x) and cache reads (0.05x Sonnet, 0.1x Haiku)', () => {
  const sonnet = reader.costOf('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 0, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 });
  assert.equal(+sonnet.toFixed(4), 2 + 2.5 + 0.1);
  const haiku = reader.costOf('claude-haiku-5-5', { input_tokens: 0, output_tokens: 1e6, cache_read_input_tokens: 1e6 });
  assert.equal(+haiku.toFixed(4), 0.5 + 0.01);
});

test('palm: no cache write when traffic is quiet; cached prefix once calls cluster', async () => {
  await reader.extractPalmLines('photoA', 'image/jpeg');
  assert.equal(calls[0].model, 'claude-haiku-5-5', 'palm scans default to Haiku 5.5');
  assert.equal(calls[0].tools[0].cache_control, undefined, 'first call in a quiet period must not pay the 1.25x write');
  await reader.extractPalmLines('photoB', 'image/jpeg');
  assert.deepEqual(calls[1].tools[0].cache_control, { type: 'ephemeral' }, 'second call within 5 minutes caches the shared prefix');
});

test('palm: the same photo is never paid for twice (stored in the database)', async () => {
  await reader.extractPalmLines('photoSame', 'image/jpeg');
  const again = await reader.extractPalmLines('photoSame', 'image/jpeg');
  assert.equal(calls.length, 1);
  assert.equal(again.cached, true);
  assert.ok(store.getPalmCache(crypto.createHash('sha256').update('photoSame').digest('hex')));
});

test('AI_CACHE=never and =always override the automatic choice', async () => {
  process.env.AI_CACHE = 'never';
  await reader.extractPalmLines('p1'); await reader.extractPalmLines('p2');
  assert.ok(calls.every((c) => !c.tools[0].cache_control));
  process.env.AI_CACHE = 'always';
  await reader.extractPalmLines('p3');
  assert.deepEqual(calls[2].tools[0].cache_control, { type: 'ephemeral' });
});

test('readings: one shared system prompt across languages and reading types (one cache entry per model)', async () => {
  await reader.narrate({ kind: 'full', facts: { a: 1 }, language: 'en' });
  await reader.narrate({ kind: 'match', facts: { b: 2 }, language: 'hi' });
  await reader.narrate({ kind: 'teaser', facts: { c: 3 }, language: 'ta' });
  await reader.narrate({ kind: 'daily', facts: { d: 4 }, language: 'gu' });
  const texts = calls.map((c) => c.system[0].text);
  assert.equal(new Set(texts).size, 1);
  assert.ok(calls.every((c) => c.model === 'claude-haiku-5-5'), 'every reading type defaults to Haiku 5.5');
  assert.match(calls[1].messages[0].content, /Write in Hindi/);
});

test('chat: automatic caching on, and system prompt identical across languages', async () => {
  await reader.ask({ question: 'career?', facts: { x: 1 }, language: 'hi' });
  await reader.ask({ question: 'love?', facts: { x: 1 }, language: 'th' });
  assert.deepEqual(calls[0].cache_control, { type: 'ephemeral' });
  assert.equal(calls[0].system, calls[1].system);
  assert.equal(calls[0].model, 'claude-haiku-5-5');
});

test('monthly budget: free AI pauses at 80%, all AI at 100%, timings unaffected', async () => {
  const spent = store.aiSpendThisMonth();
  process.env.AI_MONTHLY_BUDGET_USD = String(spent / 0.85); // 85% used
  await assert.rejects(() => reader.narrate({ kind: 'teaser', facts: {}, paid: false }), { code: 'ai_paused' });
  await reader.narrate({ kind: 'full', facts: {}, paid: true }); // paid still works
  process.env.AI_MONTHLY_BUDGET_USD = String(spent / 2); // over budget
  await assert.rejects(() => reader.narrate({ kind: 'full', facts: {}, paid: true }), { code: 'ai_paused' });
  const t = await fetch(`${base}/api/timings?lat=22.3&lon=73.18&tz=Asia/Kolkata`);
  assert.equal(t.status, 200);
});

test('saved reading is reused free; refresh makes a new one and uses allowance', async () => {
  let cookie = '';
  const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  await call('/api/auth/dev', { email: 'reuse@example.com' });
  const prof = (await call('/api/profiles', { name: 'Me', birth: { date: '1990-05-15', time: '08:30', lat: 23.02, lon: 72.57, tz: 'Asia/Kolkata' } })).body;
  // Free plan allows 1 reading a month.
  const first = await call('/api/reading', { profileId: prof.id, language: 'en', location: { lat: 22.3, lon: 73.18, tz: 'Asia/Kolkata' } });
  assert.equal(first.status, 200);
  const n = calls.length;
  const second = await call('/api/reading', { profileId: prof.id, language: 'en', location: { lat: 22.3, lon: 73.18, tz: 'Asia/Kolkata' } });
  assert.equal(second.status, 200);
  assert.equal(second.body.cached, true);
  assert.equal(calls.length, n, 'no API call for an unchanged reading');
  const fresh = await call('/api/reading', { profileId: prof.id, language: 'en', refresh: true });
  assert.equal(fresh.status, 402, 'a fresh rewrite counts against the allowance (free = 1)');
  const other = await call('/api/reading', { profileId: prof.id, language: 'hi' });
  assert.equal(other.status, 402, 'a new language is a new reading');
});

test('owner dashboard reports cache and budget figures', async () => {
  process.env.ADMIN_TOKEN = 'adm';
  const r = await (await fetch(`${base}/api/admin/stats`, { headers: { 'x-admin-token': 'adm' } })).json();
  assert.ok(r.ai.spentUsd > 0);
  assert.equal(typeof r.ai.cacheHitPct, 'number');
  assert.ok(r.aiByKind.length >= 3);
});

// ---- the competitor-gap fixes ---------------------------------------------------
test('readings show their working: sections cite only facts they were given', async () => {
  let cookie = '';
  const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  await call('/api/auth/dev', { email: 'basis@example.com' });
  const prof = (await call('/api/profiles', { name: 'Asha', birth: { date: '1990-05-15', time: '08:30', lat: 23.03, lon: 72.58, tz: 'Asia/Kolkata' } })).body;
  const r = await call('/api/reading', { profileId: prof.id, language: 'en' });
  assert.equal(r.status, 200);
  const req = calls.find((c) => c.tool_choice?.name === 'write_reading');
  assert.match(req.messages[0].content, /F1 Lagna \(ascendant\): Mithuna/);
  assert.match(req.messages[0].content, /Moon: Dhanu \(house 7\)/);
  assert.deepEqual(r.body.sections[0].basis, ['F1', 'F2', 'F3'], 'unknown ids dropped, case fixed');
  assert.deepEqual(r.body.sections[1].basis, []);
  assert.equal(r.body.basis.find((b) => b.id === 'F1').value, 'Mithuna');
  assert.match(r.body.text, /^Who you are\n/);
  // Saved with its working, and returned again from the profile.
  assert.equal((await call(`/api/reading/${prof.id}`)).body.sections.length, 2);
});

test('see before you pay: palm lines and a short reading work without an account, 2 a day', async () => {
  const fd = () => { const f = new FormData(); f.append('photo', new Blob([crypto.randomBytes(64)], { type: 'image/jpeg' }), 'p.jpg'); return f; };
  const ip = { 'x-forwarded-for': '203.0.113.77' };
  const p1 = await fetch(`${base}/api/palm`, { method: 'POST', body: fd(), headers: ip });
  assert.equal(p1.status, 200);
  const b1 = await p1.json();
  assert.equal(b1.saved, false);
  assert.ok(b1.palm.facts.length > 0, 'full line reading for a visitor');
  assert.equal((await fetch(`${base}/api/palm`, { method: 'POST', body: fd(), headers: ip })).status, 200);
  const third = await fetch(`${base}/api/palm`, { method: 'POST', body: fd(), headers: ip });
  assert.equal(third.status, 401);
  assert.equal((await third.json()).code, 'signin');

  const birth = { date: '1990-05-15', time: '08:30', lat: 23.03, lon: 72.58, tz: 'Asia/Kolkata' };
  const post = (body) => fetch(`${base}/api/reading`, { method: 'POST', headers: { 'content-type': 'application/json', ...ip }, body: JSON.stringify(body) });
  const g = await post({ birth, name: 'Asha', palm: b1.palm, language: 'en' });
  assert.equal(g.status, 200);
  const gb = await g.json();
  assert.equal(gb.guest, true);
  assert.equal(gb.kind, 'teaser');
  assert.ok(gb.basis.some((b) => b.group === 'palm'), 'the visitor\'s palm scan is part of the facts');
  // Nothing to read without birth details.
  assert.equal((await post({ profileId: 'x' })).status, 401);
});

test('an empty AI answer is never shown or cached: the calculated horoscope is used instead', async () => {
  const { horoscopeFor } = await import('../src/server.js');
  const empty = { messages: { create: async () => ({ usage: { input_tokens: 10, output_tokens: 0 }, stop_reason: 'end_turn', content: [{ type: 'text', text: '  \n' }] }) } };
  reader._setClient(empty);
  try {
    const h = await horoscopeFor(7, 'en', '2026-10-16');
    assert.equal(h.ai, false);
    assert.ok(h.text.trim().length > 50, 'rules-based text instead of a blank');
    assert.equal(store.getHoroscope('2026-10-16', 7, 'en'), undefined, 'nothing cached, so AI is tried again');
    await assert.rejects(() => reader.narrate({ kind: 'daily', facts: {} }), { code: 'ai_empty' });
  } finally { reader._setClient(fake); }
  await new Promise((r) => setTimeout(r, 1100)); // let the in-flight entry clear
  const again = await horoscopeFor(7, 'en', '2026-10-16');
  assert.equal(again.ai, true);
  assert.match(again.text, /^Reading/);
});
