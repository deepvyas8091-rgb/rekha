// AI layer: palm line extraction (vision), narrated reports, and follow-up chat.
// Model split for cost: Sonnet for vision + full reports, Haiku for daily
// messages and chat. Without ANTHROPIC_API_KEY the app runs in demo mode.
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { LINE_SCHEMA } from '../readings/palm.js';
import { FACE_BANNED_TOPICS } from '../readings/face.js';
import { logAi } from '../db.js';

const MODEL_VISION = process.env.MODEL_VISION || 'claude-sonnet-5-5';
const MODEL_REPORT = process.env.MODEL_REPORT || 'claude-sonnet-5-5';
const MODEL_CHAT = process.env.MODEL_CHAT || 'claude-haiku-5-5';

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const demoMode = !client;

// Same photo -> same extraction. Production: swap for Redis with a TTL.
const palmCache = new Map();

export const LANGUAGES = {
  en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi', ta: 'Tamil', te: 'Telugu',
  bn: 'Bengali', kn: 'Kannada', ml: 'Malayalam', th: 'Thai', vi: 'Vietnamese',
  id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', tl: 'Filipino', zh: 'Simplified Chinese',
};

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

// USD per million tokens (input, output). Update if Anthropic prices change.
const PRICE = { 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
function track(kind, model, usage) {
  if (!usage) return;
  const [pi, po] = PRICE[model] || [2, 10];
  const cacheRead = usage.cache_read_input_tokens || 0;
  const costUsd = ((usage.input_tokens + cacheRead * 0.05) * pi + usage.output_tokens * po) / 1e6;
  logAi({ kind, model, tokensIn: usage.input_tokens + cacheRead, tokensOut: usage.output_tokens, costUsd });
}

/** Vision extraction of palm lines to strict JSON via a forced tool call. */
export async function extractPalmLines(base64, mediaType = 'image/jpeg') {
  const key = crypto.createHash('sha256').update(base64).digest('hex');
  if (palmCache.has(key)) return { ...palmCache.get(key), cached: true };
  if (!client) return demoPalm();

  const res = await client.messages.create({
    model: MODEL_VISION,
    max_tokens: 1200,
    system: 'You are a careful palmistry line annotator. Report only what is visibly present in the photo. '
      + 'If a line is unclear, set present=false or a low confidence. Never guess. Never comment on health.',
    tools: [{ name: 'record_palm', description: 'Record the visible palm features', input_schema: LINE_SCHEMA }],
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
  palmCache.set(key, out);
  return out;
}

/** Turn deterministic facts into a narrated report in the user's language. */
export async function narrate({ kind, facts, language = 'en', name }) {
  const lang = LANGUAGES[language] || 'English';
  if (!client) return demoNarration(kind, facts);
  const brief = {
    teaser: 'Write a short free reading in 150 to 200 words: three warm, specific sentences on who this person is from the chart, one line from the palm or face if present, and today\'s best window if given. End with one sentence on what the full reading adds (love, career, current phase, best days). No pressure, no fear.',
    full: 'Write a unified destiny profile. Sections: Who you are, Love and relationships, Career and money, Your current phase (use the dasha and transits), Your best days and times this week, One thing to work on. Where palm, face and chart agree, say so explicitly ("your palm and chart both point to..."). 450 to 650 words.',
    daily: 'Write today\'s personal guidance in 80 to 120 words: the day rating, the best window today and what to use it for, one window to avoid, and one encouraging line.',
    palm: 'Write a palm reading in 250 to 350 words, organised by line, then hand type.',
    face: 'Write a face reading in 200 to 300 words: face type, three courts, then features.',
    match: 'Explain this compatibility result in 250 to 350 words: strengths first, then doshas calmly with the note that an expert can review cancellation rules.',
  }[kind] || 'Write a short reading.';
  // Cheaper model for short, high-volume texts (daily guidance, free teaser).
  const model = kind === 'daily' || kind === 'teaser' ? MODEL_CHAT : MODEL_REPORT;
  const res = await client.messages.create({
    model,
    max_tokens: kind === 'daily' ? 400 : kind === 'teaser' ? 600 : 1500,
    // The static system block is cached: repeat calls bill it at the cache-read rate.
    system: [{ type: 'text', text: `You are Rekha, a kind astrologer and palm and face reader for users in India and Southeast Asia.${GUARDRAILS}`, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `${brief}\nWrite in ${lang}.${name ? ` The user's name is ${name}.` : ''}\nFacts (JSON):\n${JSON.stringify(facts)}`,
    }],
  });
  track(`narrate-${kind}`, model, res.usage);
  return res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

/** Follow-up question answered from stored facts plus recent chat history. */
export async function ask({ question, facts, history = [], language = 'en' }) {
  const d = distressCheck(question);
  if (d) return d.message;
  if (!client) return 'Demo mode: add ANTHROPIC_API_KEY to get answers from your palm, face and chart.';
  const res = await client.messages.create({
    model: MODEL_CHAT,
    max_tokens: 600,
    system: [{ type: 'text', text: `You are Rekha, answering follow-up questions about the user's own reading. Answer in ${LANGUAGES[language] || 'English'} in under 150 words, citing which system (palm, face, chart, timing) each point comes from.${GUARDRAILS}`, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: `My reading facts (JSON): ${JSON.stringify(facts)}` },
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
