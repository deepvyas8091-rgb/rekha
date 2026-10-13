// AI layer: palm line extraction (vision), narrated reports, and follow-up chat.
// Model split for cost: Sonnet for vision + full reports, Haiku for daily
// messages, free teasers and chat. Without ANTHROPIC_API_KEY it runs in demo mode.
//
// Cost controls in this file:
// 1. Prompt caching, switched on only when it saves money (see cacheMode below).
// 2. Palm results cached by photo hash in the database (no second paid call).
// 3. A monthly AI budget: free-tier AI pauses at 80%, all AI pauses at 100%.
// 4. Exact cost logging, including cache writes and reads, for the dashboard.
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { LINE_SCHEMA } from '../readings/palm.js';
import { FACE_BANNED_TOPICS } from '../readings/face.js';
import { logAi, aiSpendThisMonth, getPalmCache, putPalmCache } from '../db.js';

const MODEL_VISION = process.env.MODEL_VISION || 'claude-sonnet-5-5';
const MODEL_REPORT = process.env.MODEL_REPORT || 'claude-sonnet-5-5';
const MODEL_CHAT = process.env.MODEL_CHAT || 'claude-haiku-5-5';

let client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export let demoMode = !client;
/** Tests inject a fake client to inspect requests without spending money. */
export function _setClient(c) { client = c; demoMode = !c; }

export const LANGUAGES = {
  en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi', ta: 'Tamil', te: 'Telugu',
  bn: 'Bengali', kn: 'Kannada', ml: 'Malayalam', th: 'Thai', vi: 'Vietnamese',
  id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', tl: 'Filipino', zh: 'Simplified Chinese',
};

// ---- pricing (USD per million tokens). Source: Anthropic pricing page, Oct 2026.
// readMult = cache read as a share of the input price. Cache writes (5 min) cost 1.25x.
export const PRICE = {
  'claude-sonnet-5-5': { in: 2, out: 10, readMult: 0.05 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, readMult: 0.1 },
};
const WRITE_MULT = 1.25;

export function costOf(model, u) {
  const p = PRICE[model] || PRICE['claude-sonnet-5-5'];
  const write = u.cache_creation_input_tokens || 0;
  const read = u.cache_read_input_tokens || 0;
  return ((u.input_tokens || 0) * p.in + write * p.in * WRITE_MULT + read * p.in * p.readMult + (u.output_tokens || 0) * p.out) / 1e6;
}

function track(kind, model, u) {
  if (!u) return;
  logAi({
    kind, model,
    tokensIn: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    tokensOut: u.output_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: costOf(model, u),
  });
}

// ---- prompt caching ----------------------------------------------------------
// A cache write costs 1.25x and only pays off if the same prefix is reused within
// 5 minutes (a read costs 0.05x to 0.1x). At low traffic, caching every call would
// cost MORE. "auto" therefore flags a prefix for caching only once another call
// with the same prefix happened in the last 5 minutes. AI_CACHE=always|never overrides.
const recentCalls = new Map();
export function cacheMode(prefixKey) {
  const mode = process.env.AI_CACHE || 'auto';
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  const now = Date.now();
  const arr = (recentCalls.get(prefixKey) || []).filter((t) => now - t < 5 * 60000);
  arr.push(now);
  recentCalls.set(prefixKey, arr);
  return arr.length >= 2;
}
const ephemeral = { type: 'ephemeral' };

// ---- monthly budget -------------------------------------------------------------
export class BudgetError extends Error {
  constructor(msg) { super(msg); this.status = 503; this.code = 'ai_paused'; }
}
/** Free-tier AI pauses at 80% of AI_MONTHLY_BUDGET_USD; all AI pauses at 100%. */
export function checkBudget(paid) {
  const budget = +process.env.AI_MONTHLY_BUDGET_USD;
  if (!budget) return;
  const spent = aiSpendThisMonth();
  if (spent >= budget) throw new BudgetError('AI readings are paused for a short while. Your timings, panchang and kundli still work.');
  if (!paid && spent >= budget * 0.8) throw new BudgetError('Free AI readings are paused for the rest of this month. Your timings, panchang and kundli still work.');
}

const GUARDRAILS = `
Rules you must always follow:
- This is for entertainment and self-reflection. Never claim certainty about the future.
- Never predict death, accidents, serious illness, divorce dates, or exam/lottery results.
- Never give medical, legal or financial advice. Suggest a professional instead.
- Never use fear to sell. Do not say a dosha or planet will "destroy" anything.
- Never recommend paid remedies, gemstones or rituals unless the user asks; if asked, say they are optional traditions.
- Face readings must never mention: ${FACE_BANNED_TOPICS.join(', ')}.
- Only use the facts provided. If a fact is missing, do not invent it. Say what was not visible.
- Be warm, specific and encouraging. Short paragraphs. No em dashes.
`;
// One shared system prompt for every reading type and language, so all calls to a
// model share one cacheable prefix. Per-call details go in the user message.
const READER_SYSTEM = `You are Rekha, a kind astrologer and palm and face reader for users in India and Southeast Asia.${GUARDRAILS}`;
const CHAT_SYSTEM = `You are Rekha, answering follow-up questions about the user's own reading. Answer in under 150 words, citing which system (palm, face, chart, timing) each point comes from.${GUARDRAILS}`;
const PALM_SYSTEM = 'You are a careful palmistry line annotator. Report only what is visibly present in the photo. '
  + 'If a line is unclear, set present=false or a low confidence. Never guess. Never comment on health.';

// Messages that should get support, not a reading.
const DISTRESS = /\b(suicid|kill myself|end my life|want to die|self[- ]?harm|no reason to live|मरना चाहत|आत्महत्या)/i;
export function distressCheck(text = '') {
  if (!DISTRESS.test(text)) return null;
  return {
    distress: true,
    message: 'It sounds like you are going through something really hard. A reading cannot help with this, but people can. '
      + 'In India you can call Tele-MANAS on 14416 (free, 24x7). If you are elsewhere, please contact a local helpline or someone you trust. '
      + 'If you are in immediate danger, call your local emergency number.',
  };
}

/** Vision extraction of palm lines to strict JSON via a forced tool call. */
export async function extractPalmLines(base64, mediaType = 'image/jpeg', { paid = false } = {}) {
  const key = crypto.createHash('sha256').update(base64).digest('hex');
  const hit = getPalmCache(key);
  if (hit) return { ...hit, cached: true };
  if (!client) return demoPalm();
  checkBudget(paid);

  // The tool schema + system (~930 tokens) are identical for every user: cacheable.
  const cache = cacheMode('palm');
  const res = await client.messages.create({
    model: MODEL_VISION,
    max_tokens: 1200,
    system: PALM_SYSTEM,
    tools: [{ name: 'record_palm', description: 'Record the visible palm features', input_schema: LINE_SCHEMA, ...(cache ? { cache_control: ephemeral } : {}) }],
    tool_choice: { type: 'tool', name: 'record_palm' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'Annotate the major palm lines, marriage lines and marks in this photo.' },
      ],
    }],
  });
  track('palm-vision', MODEL_VISION, res.usage);
  const out = res.content.find((c) => c.type === 'tool_use')?.input;
  if (!out) throw new Error('Vision model returned no structured result');
  putPalmCache(key, out);
  return out;
}

const BRIEFS = {
  teaser: 'Write a short free reading in 150 to 200 words: three warm, specific sentences on who this person is from the chart, one line from the palm or face if present, and today\'s best window if given. End with one sentence on what the full reading adds (love, career, current phase, best days). No pressure, no fear.',
  full: 'Write a unified destiny profile. Sections: Who you are, Love and relationships, Career and money, Your current phase (use the dasha and transits), Your best days and times this week, One thing to work on. Where palm, face and chart agree, say so explicitly ("your palm and chart both point to..."). 450 to 650 words.',
  daily: 'Write today\'s personal guidance in 80 to 120 words: the day rating, the best window today and what to use it for, one window to avoid, and one encouraging line.',
  match: 'Explain this compatibility result in 250 to 350 words: strengths first, then doshas calmly with the note that an expert can review cancellation rules.',
};
// Output caps sized for the word targets, with room for Indic scripts.
const MAX_OUT = { teaser: 600, full: 1500, daily: 400, match: 900 };

/** Turn deterministic facts into a narrated report in the user's language. */
export async function narrate({ kind, facts, language = 'en', name, paid = false }) {
  const lang = LANGUAGES[language] || 'English';
  if (!client) return demoNarration(kind, facts);
  checkBudget(paid);
  // Cheaper model for short, high-volume texts (daily guidance, free teaser).
  const model = kind === 'daily' || kind === 'teaser' ? MODEL_CHAT : MODEL_REPORT;
  const cache = cacheMode(`narrate:${model}`);
  const res = await client.messages.create({
    model,
    max_tokens: MAX_OUT[kind] || 800,
    // Below the 512-token minimum this flag is ignored at no charge; it takes
    // effect automatically if the shared instructions grow past it.
    system: [{ type: 'text', text: READER_SYSTEM, ...(cache ? { cache_control: ephemeral } : {}) }],
    messages: [{
      role: 'user',
      content: `${BRIEFS[kind] || 'Write a short reading.'}\nWrite in ${lang}.${name ? ` The user's name is ${name}.` : ''}\nFacts (JSON):\n${JSON.stringify(facts)}`,
    }],
  });
  track(`narrate-${kind}`, model, res.usage);
  return res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

/** Follow-up question answered from stored facts plus recent chat history. */
export async function ask({ question, facts, history = [], language = 'en', paid = false }) {
  const d = distressCheck(question);
  if (d) return d.message;
  if (!client) return 'Demo mode: add ANTHROPIC_API_KEY to get answers from your palm, face and chart.';
  checkBudget(paid);
  const res = await client.messages.create({
    model: MODEL_CHAT,
    max_tokens: 600,
    // Automatic caching: follow-up questions minutes apart reuse the system prompt,
    // facts and earlier turns at the cache-read price. Prefixes under 512 tokens
    // are simply not cached, at no extra charge.
    cache_control: ephemeral,
    system: CHAT_SYSTEM,
    messages: [
      { role: 'user', content: `My reading facts (JSON): ${JSON.stringify(facts)}\nPlease answer in ${LANGUAGES[language] || 'English'}.` },
      { role: 'assistant', content: 'Thank you. I have your reading. What would you like to know?' },
      ...history.slice(-8),
      { role: 'user', content: question },
    ],
  });
  track('chat', MODEL_CHAT, res.usage);
  return res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

function demoPalm() {
  return {
    demo: true, photoQuality: 'usable', isPalm: true, hand: 'right',
    lines: {
      heart: { present: true, length: 'long', depth: 'clear', shape: 'strongly curved', confidence: 0.8 },
      head: { present: true, length: 'long', depth: 'clear', shape: 'gently curved', forkAtEnd: true, confidence: 0.8 },
      life: { present: true, length: 'long', depth: 'deep', shape: 'strongly curved', confidence: 0.85 },
      fate: { present: true, length: 'medium', depth: 'faint', confidence: 0.55 },
      sun: { present: false, confidence: 0.5 },
    },
    headLifeJoinedAtStart: true, marriageLines: 1, marks: [],
  };
}

function demoNarration(kind, facts) {
  const lines = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (o.meaning) lines.push(`- ${o.fact}: ${o.meaning}`);
      Object.values(o).forEach(walk);
    }
  };
  walk(facts);
  const c = facts.chart;
  if (c) {
    lines.unshift(
      `- Ascendant ${c.lagna}, Moon sign ${c.moonSign}, birth nakshatra ${c.nakshatra}`,
      c.currentDasha ? `- Current phase: ${c.currentDasha.mahadasha} mahadasha, ${c.currentDasha.antardasha} antardasha` : '',
      `- Sade Sati: ${c.sadeSati?.active ? c.sadeSati.phase : 'not active'}; ${c.manglik}`,
      c.chinese ? `- Chinese zodiac ${c.chinese.zodiac.chinese}, day master ${c.chinese.dayMaster}` : '',
    );
  }
  if (facts.today?.personal) lines.push(`- Today: ${facts.today.personal.dayRating}`);
  if (facts.today?.bestWindows?.[0]) lines.push(`- Best window today: ${facts.today.bestWindows[0].start} to ${facts.today.bestWindows[0].end}`);
  if (facts.gunMilan) lines.push(`- Gun milan ${facts.gunMilan.total}/36: ${facts.gunMilan.verdict}`);
  return `Demo ${kind} reading (add ANTHROPIC_API_KEY for the AI-written version):\n${[...new Set(lines.filter(Boolean))].slice(0, 16).join('\n')}`;
}
