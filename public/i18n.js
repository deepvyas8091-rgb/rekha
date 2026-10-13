// Client-side translation. Strings are keyed by their English text, so English needs
// no pack and any missing translation simply shows the English original.
//   t('Sign in')                      interface text (exact match only)
//   t('Hello {name}', { name })       with placeholders
//   d('Amrit')                        a value from the server (names, notes); short
//                                     compound values such as "Shukla Ekadashi" are
//                                     translated word by word as a fallback.
export const lang = document.documentElement.dataset.lang || 'en';
let dict = {};
let termRe = null;

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);
export function t(s, vars) { return fill(dict[s] ?? s, vars); }
export function d(s) {
  if (s == null || s === '') return s ?? '';
  s = String(s);
  if (dict[s]) return dict[s];
  if (!termRe || s.split(' ').length > 5) return s;
  return s.replace(termRe, (m) => dict[m] ?? m);
}

/** A Hindu month name, e.g. "Magha" or "Ashwin (Adhika)" (months have their own keys; see catalog.js). */
export function month(m) {
  if (!m) return '';
  const [name, extra] = String(m).split(/ (?=\()/);
  const key = `${name} (month)`;
  const tr = dict[key] ?? name;
  return extra ? `${tr} ${d(extra)}` : tr;
}

export async function loadPack() {
  if (lang === 'en') return;
  try {
    const v = document.documentElement.dataset.i18nv || '';
    const res = await fetch(`/api/i18n/${lang}?v=${v}`);
    if (res.ok) setDict((await res.json()).strings);
  } catch { /* offline: English fallback */ }
}
export function setDict(strings) {
  dict = strings || {};
  // Short names (one to three words, starting with a capital) used for compound values.
  const names = Object.keys(dict).filter((k) => /^[A-Z][\w']*( [A-Z]?[\w']+){0,2}$/.test(k) && k.length > 2)
    .sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  termRe = names.length ? new RegExp(`\\b(${names.join('|')})\\b`, 'g') : null;
}

/** Same page in another language. */
export function pathFor(code, path = location.pathname) {
  const bare = path.replace(/^\/[a-z]{2}(?=\/|$)/, (m) => (m.slice(1) === lang && lang !== 'en' ? '' : m)) || '/';
  return code === 'en' ? bare : bare === '/' ? `/${code}/` : `/${code}${bare}`;
}
/** Link to a page of the site in the current language. */
export const href = (path) => pathFor(lang, path);

export const locale = () => document.documentElement.dataset.locale || 'en-IN';
export const fmtDate = (date, opts) => new Date(date).toLocaleDateString(locale(), opts);
/** Marks a string for translation without translating it yet (used for labels looked up later with t()). */
export const N = (s) => s;
