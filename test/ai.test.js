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
  assert.equal(calls[0].model, 'claude-sonnet-5-5');
  assert.equal(calls[2].model, 'claude-haiku-5-5', 'free teaser uses the cheaper model');
  assert.equal(calls[3].model, 'claude-haiku-5-5', 'daily guidance uses the cheaper model');
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
