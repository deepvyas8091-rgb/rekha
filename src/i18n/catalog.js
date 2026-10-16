// The list of English strings to translate, read straight from the source files at
// startup, so a new t('...') in the code is picked up without any extra step.
//   app   - the web app's interface (public/app.js, index.html)
//   guide - the explanations in public/guide.js
//   data - names and notes the server sends (Choghadiya names, tithis, palm meanings ...)
//   seo  - the public pages (src/seo, the app shell's title and description)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASA } from '../engine/constants.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const unescapeJs = (s) => s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => (c[0] === 'u' && c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : c === 'n' ? '\n' : c));
const decodeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const STR = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|\x60((?:[^\x60\\$]|\\.|\$(?!\{))*)\x60`;

/** Arguments of t('...'), t(lang, '...'), tt('...') and N('...') calls. */
export function callStrings(src) {
  const out = [];
  const re = new RegExp(String.raw`\b(?:t|tt|N)\(\s*(?:lang\s*,\s*)?(?:${STR})`, 'g');
  for (const m of src.matchAll(re)) out.push(unescapeJs(m[1] ?? m[2] ?? m[3]));
  return out;
}

/** Every quoted string literal in a file (not template literals). */
export function literalStrings(src) {
  const out = [];
  const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) out.push(unescapeJs(m[1] ?? m[2]));
  return out;
}

/** Text the app shell marks with data-i18n / data-i18n-html / -ph / -aria. */
export function htmlStrings(html) {
  const out = [];
  for (const m of html.matchAll(/<(\w+)\b([^>]*?)\sdata-i18n(-html)?(?=[\s>])([^>]*)>([\s\S]*?)<\/\1>/g)) {
    out.push(m[3] ? m[5].trim() : decodeHtml(m[5].trim()));
  }
  for (const m of html.matchAll(/<\w+\b[^>]*\sdata-i18n-ph\b[^>]*>/g)) {
    const ph = m[0].match(/placeholder="([^"]*)"/); if (ph) out.push(decodeHtml(ph[1]));
  }
  for (const m of html.matchAll(/<\w+\b[^>]*\sdata-i18n-aria\b[^>]*>/g)) {
    const a = m[0].match(/aria-label="([^"]*)"/); if (a) out.push(decodeHtml(a[1]));
  }
  return out;
}

// Literal values that look like code rather than text.
const notText = (s) => s.length < 2 || s.length > 600 || !/[A-Za-z]{2}/.test(s)
  || /^[a-z0-9_$.:/#?=&@*+-]+$/.test(s) // identifiers, keys, paths
  || /^[A-Z0-9_]+$/.test(s) // ENV_NAMES
  || /^[a-z]+[A-Z]\w*$/.test(s) // camelCase keys
  || /^[A-Z][a-z]+\/[A-Za-z_/-]+$/.test(s) // time zones
  || /^(https?:|claude-|SELECT |INSERT |UPDATE |DELETE |CREATE )/.test(s)
  || /[<>{}]|\$\{/.test(s)
  || /^\/|^[A-Z][a-z]+-[A-Z][a-z]+$|max-age|=|^; |^[a-z]{2}-[A-Z]{2}$|^trust proxy$/.test(s); // paths, headers, settings
// Lowercase words the app shows as labels (quality pills, ratings).
const SHOWN_LOWERCASE = ['best', 'good', 'neutral', 'bad', 'mixed', 'excellent', 'average', 'avoid', 'high', 'medium', 'low',
  'flat', 'normal', 'prominent', 'unclear', 'rising', 'peak', 'setting', 'hand shape', 'or'];

const DATA_FILES = [
  'src/engine/constants.js', 'src/engine/muhurta.js', 'src/engine/panchang.js', 'src/engine/kundli.js', 'src/engine/matching.js',
  'src/engine/world.js', 'src/engine/horoscope.js', 'src/readings/palm.js', 'src/readings/face.js', 'src/plans.js',
  'src/data/cities.js', 'src/data/seo-cities.js', 'src/engine/festivals.js', 'src/content/festivals-info.js', 'src/server.js', 'src/auth.js', 'src/billing.js', 'src/ai/reader.js',
];

// Values the engine builds from parts, listed in full so they translate as a whole.
// Month names get their own key because Jyeshtha, Shravana and Magha are also nakshatras.
const GENERATED = [
  ...MASA.map((m) => `${m} (month)`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `Sharad Navratri day ${d}`),
  'Shukla Ekadashi (fasting day)', 'Krishna Ekadashi (fasting day)', 'Shukla Trayodashi (Pradosh)', 'Krishna Trayodashi (Pradosh)',
  'Panchak',
];

let built = null;
export function catalog() {
  if (built) return built;
  const uniq = (arr) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
  const guide = read('public/guide.js');
  const app = uniq([
    ...callStrings(read('public/app.js')),
    ...callStrings(guide),
    ...htmlStrings(read('public/index.html')),
  ]);
  const guideText = uniq(literalStrings(guide.slice(0, guide.indexOf('export const PALM_SVG'))).filter((s) => !notText(s) && /\s|^[A-Z]/.test(s)))
    .filter((s) => !app.includes(s));
  const seoSrc = ['src/seo/routes.js', 'src/seo/layout.js', 'src/i18n/shell.js', 'src/server.js', 'src/push.js', 'src/subscribers.js', 'src/email.js', 'src/analytics.js', 'src/engagement.js', 'src/monthly.js'].map(read).join('\n');
  const seo = uniq(callStrings(seoSrc)).filter((s) => !app.includes(s));
  const inApp = new Set([...app, ...guideText, ...seo]);
  const data = uniq([
    ...DATA_FILES.flatMap((f) => literalStrings(read(f)).filter((s) => !notText(s) && (f !== 'src/ai/reader.js' || /paused|Tele-MANAS|Demo mode/.test(s)))),
    ...SHOWN_LOWERCASE,
    ...GENERATED,
  ]).filter((s) => !inApp.has(s));
  built = { app, guide: guideText, data, seo };
  return built;
}
export const allStrings = () => { const c = catalog(); return [...c.app, ...c.guide, ...c.data, ...c.seo]; };
export const GROUPS = ['app', 'guide', 'data', 'seo'];
