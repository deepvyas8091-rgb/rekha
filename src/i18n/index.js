// Server-side translation lookups.
// Priority for each string: human-reviewed import > hand-written pack (hi, gu) >
// machine translation > English. A missing translation always falls back to English.
import crypto from 'node:crypto';
import { LANGS, OTHER_LANGS, isLang } from './languages.js';
import { catalog } from './catalog.js';
import hi from './packs/hi.js';
import gu from './packs/gu.js';
import * as store from '../db.js';

export * from './languages.js';
export const HAND_PACKS = { hi, gu };
export const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

// ---- short strings ----------------------------------------------------------
const dicts = new Map(); // lang -> { dict, at }
const TTL = 60000;
export function dictFor(lang) {
  if (!isLang(lang) || lang === 'en') return {};
  const hit = dicts.get(lang);
  if (hit && Date.now() - hit.at < TTL) return hit.dict;
  const rows = store.getTranslations(lang, 'ui');
  const dict = {};
  for (const r of rows) if (r.origin !== 'human') dict[r.src] = r.text;
  Object.assign(dict, HAND_PACKS[lang] || {});
  for (const r of rows) if (r.origin === 'human') dict[r.src] = r.text;
  dicts.set(lang, { dict, at: Date.now() });
  return dict;
}
export function invalidate(lang) { if (lang) dicts.delete(lang); else dicts.clear(); readyCache = null; articleCache.clear(); }

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);
/** t(lang, 'English text', { vars }) */
export function t(lang, s, vars) {
  const tr = lang && lang !== 'en' ? dictFor(lang)[s] : null;
  return fill(tr ?? s, vars);
}
/** A translator bound to one language, for templates: const tt = tFor('hi'); tt('Today') */
export const tFor = (lang) => (s, vars) => t(lang, s, vars);
/** Names from the engine (Choghadiya, tithi ...): exact match, then word by word for short compounds. */
export function dataT(lang, s) {
  if (!s || lang === 'en') return s ?? '';
  const dict = dictFor(lang);
  if (dict[s]) return dict[s];
  if (String(s).split(' ').length > 5) return s;
  return String(s).replace(/[A-Z][\w']*(?: [A-Z][\w']*){0,2}/g, (m) => dict[m] ?? m.split(' ').map((w) => dict[w] ?? w).join(' '));
}

/** A Hindu month name in a language ("Magha", "Ashwin (Adhika)"). */
export function monthT(lang, m) {
  if (!m) return '';
  const [name, extra] = String(m).split(/ (?=\()/);
  const tr = lang === 'en' ? name : dictFor(lang)[`${name} (month)`] ?? name;
  return extra ? `${tr} ${dataT(lang, extra)}` : tr;
}

/** The strings the browser needs (interface, explanations, engine names). */
export function packFor(lang) {
  const c = catalog();
  const dict = dictFor(lang);
  const strings = {};
  for (const s of [...c.app, ...c.guide, ...c.data]) if (dict[s] && dict[s] !== s) strings[s] = dict[s];
  return { lang, version: hash(JSON.stringify(strings)), strings };
}

/** Share of each group translated, 0 to 1. */
export function coverage(lang) {
  if (lang === 'en') return { app: 1, guide: 1, data: 1, seo: 1 };
  const c = catalog(); const dict = dictFor(lang);
  const out = {};
  for (const [g, list] of Object.entries(c)) out[g] = list.length ? list.filter((s) => dict[s]).length / list.length : 1;
  return out;
}

/** Languages whose site pages are translated well enough to be indexed (95% of the interface and page text). */
let readyCache = null;
export function readyLangs() {
  if (readyCache && Date.now() - readyCache.at < TTL) return readyCache.list;
  const list = ['en', ...OTHER_LANGS.filter((l) => { const c = coverage(l); return c.app >= 0.95 && c.seo >= 0.95; })];
  readyCache = { list, at: Date.now() };
  return list;
}
export const isReady = (lang) => readyLangs().includes(lang);

// ---- articles -----------------------------------------------------------------
/** The translatable fields of an article, flattened: { title, description, h1, body, tool, 'faq.0.q', ... } */
export function articleFields(a) {
  const f = { title: a.title, description: a.description, h1: a.h1, body: a.body };
  if (a.tool) f.tool = a.tool[0];
  (a.faq || []).forEach(([q, ans], i) => { f[`faq.${i}.q`] = q; f[`faq.${i}.a`] = ans; });
  return f;
}
const articleCache = new Map();
/** The article in this language, or null if any field is missing or out of date. */
export function articleFor(lang, a) {
  if (lang === 'en') return a;
  const key = `${lang}:${a.slug}`;
  const hit = articleCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const rows = new Map(store.getTranslations(lang, `article:${a.slug}`).map((r) => [r.src, r]));
  const fields = articleFields(a);
  let value = null;
  if (Object.entries(fields).every(([k, en]) => rows.get(k)?.src_hash === hash(en))) {
    const tr = (k) => rows.get(k).text;
    value = {
      ...a, title: tr('title'), description: tr('description'), h1: tr('h1'), body: tr('body'),
      tool: a.tool ? [tr('tool'), a.tool[1]] : a.tool,
      faq: (a.faq || []).map((_, i) => [tr(`faq.${i}.q`), tr(`faq.${i}.a`)]),
      lang,
    };
  }
  articleCache.set(key, { value, at: Date.now() });
  return value;
}
/** Languages an article can be read in (English plus complete translations in ready languages). */
export const articleLangs = (a) => readyLangs().filter((l) => l === 'en' || articleFor(l, a));

export const languageNames = () => Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, v.name]));
