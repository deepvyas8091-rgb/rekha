// Background translation job. Translates only what is missing, so running it again is
// cheap and safe: after the first full run it only picks up new or edited strings.
// Starts by itself a minute after each deploy (TRANSLATE_AUTO=0 turns that off), and
// can be started from the owner dashboard. Everything is stored in the database.
import { catalog, GROUPS } from './catalog.js';
import { OTHER_LANGS, isLang, dictFor, invalidate, articleFields, hash, HAND_PACKS } from './index.js';
import * as store from '../db.js';
import { translateItems, demoMode } from '../ai/reader.js';

const BATCH_CHARS = 5000;
const BATCH_ITEMS = 60;

export const status = { running: false, startedAt: null, finishedAt: null, current: null, done: 0, failed: 0, error: null, log: [] };
const note = (msg) => { status.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`); if (status.log.length > 60) status.log.shift(); };

function batches(list) {
  const out = []; let cur = []; let size = 0;
  for (const s of list) {
    if (cur.length && (size + s.length > BATCH_CHARS || cur.length >= BATCH_ITEMS)) { out.push(cur); cur = []; size = 0; }
    cur.push(s); size += s.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Strings of a group still missing in a language. */
export function missingStrings(lang, groups = GROUPS) {
  const c = catalog(); const dict = dictFor(lang);
  return groups.flatMap((g) => c[g]).filter((s, i, a) => !dict[s] && a.indexOf(s) === i);
}

/** Articles whose translation is missing or older than the English. */
export function missingArticles(lang, articles) {
  return articles.filter((a) => {
    const rows = new Map(store.getTranslations(lang, `article:${a.slug}`).map((r) => [r.src, r.src_hash]));
    return Object.entries(articleFields(a)).some(([k, en]) => rows.get(k) !== hash(en));
  });
}

async function translateStrings(lang, list) {
  for (const batch of batches(list)) {
    status.current = `${lang}: ${batch.length} strings`;
    const out = await translateItems(batch, lang);
    const rows = batch.map((src, i) => ({ src, text: out[i] })).filter((r) => r.text);
    store.putTranslations(lang, 'ui', rows);
    status.done += rows.length; status.failed += batch.length - rows.length;
    invalidate(lang);
  }
}

async function translateArticle(lang, a) {
  status.current = `${lang}: ${a.slug}`;
  const fields = Object.entries(articleFields(a));
  const out = await translateItems(fields.map(([, v]) => v), lang, { context: 'article' });
  if (out.some((x) => !x)) { status.failed += 1; note(`${lang} ${a.slug}: rejected, will retry next run`); return; }
  store.putTranslations(lang, `article:${a.slug}`, fields.map(([k, en], i) => ({ src: k, text: out[i], srcHash: hash(en) })));
  status.done += 1;
  invalidate(lang);
}

/**
 * Run the job. opts: { langs: ['ta', ...] (default all), articles: list of article objects, scope: 'all' | 'strings' | 'articles' }
 * Languages run one after another; interface strings first (so pages go live sooner), then articles.
 */
export async function runTranslations({ langs = OTHER_LANGS, articles = [], scope = 'all' } = {}) {
  if (status.running) return status;
  if (demoMode) { status.error = 'Translation needs ANTHROPIC_API_KEY'; return status; }
  Object.assign(status, { running: true, startedAt: Date.now(), finishedAt: null, done: 0, failed: 0, error: null, log: [] });
  try {
    for (const lang of langs.filter((l) => isLang(l) && l !== 'en')) {
      if (scope !== 'articles') {
        // Interface strings in order of importance: app, page templates, names, explanations.
        for (const g of ['app', 'seo', 'data', 'guide']) {
          const list = missingStrings(lang, [g]);
          if (list.length) { note(`${lang} ${g}: ${list.length} to translate`); await translateStrings(lang, list); }
        }
      }
      if (scope !== 'strings') {
        for (const a of missingArticles(lang, articles)) await translateArticle(lang, a);
      }
      note(`${lang}: done`);
    }
  } catch (e) {
    status.error = e.message;
    note(`stopped: ${e.message}`);
  } finally {
    Object.assign(status, { running: false, finishedAt: Date.now(), current: null });
  }
  return status;
}

/** Everything for one language, for native-speaker review in a spreadsheet or editor. */
export function exportLang(lang, articles = []) {
  const c = catalog(); const dict = dictFor(lang);
  const human = new Set(store.getTranslations(lang, 'ui').filter((r) => r.origin === 'human').map((r) => r.src));
  const hand = HAND_PACKS[lang] || {};
  const strings = GROUPS.flatMap((g) => c[g].map((en) => ({
    group: g, en, text: dict[en] || '', source: human.has(en) ? 'human' : hand[en] ? 'hand' : dict[en] ? 'ai' : 'missing',
  })));
  const arts = articles.map((a) => {
    const rows = new Map(store.getTranslations(lang, `article:${a.slug}`).map((r) => [r.src, r]));
    return { slug: a.slug, fields: Object.fromEntries(Object.entries(articleFields(a)).map(([k, en]) => [k, { en, text: rows.get(k)?.text || '', source: rows.get(k)?.origin || 'missing' }])) };
  });
  return { lang, exportedAt: new Date().toISOString(), strings, articles: arts };
}

/**
 * Import reviewed text (the same shape as the export). A line counts as reviewed, and is
 * locked against machine updates, if its text was changed or its source was set to "human".
 */
export function importLang(lang, data, articles = []) {
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  const dict = dictFor(lang);
  const rows = (data.strings || []).filter((s) => s.en && s.text && (s.source === 'human' || s.text !== dict[s.en]))
    .map((s) => ({ src: s.en, text: s.text, origin: 'human' }));
  store.putTranslations(lang, 'ui', rows);
  let n = rows.length;
  for (const a of data.articles || []) {
    const en = bySlug.get(a.slug); if (!en) continue;
    const current = articleFields(en);
    const stored = new Map(store.getTranslations(lang, `article:${a.slug}`).map((r) => [r.src, r.text]));
    const list = Object.entries(a.fields || {}).filter(([k, f]) => current[k] && f.text && (f.source === 'human' || f.text !== stored.get(k)))
      .map(([k, f]) => ({ src: k, text: f.text, srcHash: hash(current[k]), origin: 'human' }));
    store.putTranslations(lang, `article:${a.slug}`, list); n += list.length;
  }
  invalidate(lang);
  return n;
}
