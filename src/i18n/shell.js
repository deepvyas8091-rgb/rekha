// HTML helpers shared by the app shell and the public pages: the translated app shell,
// the language menu, hreflang tags and language-prefixed links.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, LANGS, LANG_CODES, localePath, fontHref, readyLangs, packFor } from './index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Attributes for <html>: language, locale, and the script font for non-Latin languages. */
export function htmlAttrs(lang, extra = '') {
  const L = LANGS[lang] || LANGS.en;
  const font = L.font && lang !== 'en' ? ` data-script style="--script:'${L.font}'"` : '';
  return `lang="${L.hreflang}" data-lang="${lang}" data-locale="${L.locale}"${font}${extra}`;
}

/** <link rel="alternate" hreflang> for every language the page exists in, plus x-default. */
export function hreflangTags(base, pagePath, langs) {
  if (!base) return '';
  const tags = langs.map((l) => `<link rel="alternate" hreflang="${LANGS[l].hreflang}" href="${esc(base + localePath(l, pagePath))}">`);
  tags.push(`<link rel="alternate" hreflang="x-default" href="${esc(base + pagePath)}">`);
  return tags.join('\n');
}

/** Language menu: plain links, so it works without JavaScript and crawlers can follow it. */
export function langMenu(lang, pagePath, langs = LANG_CODES) {
  const items = langs.map((l) => `<li><a href="${esc(localePath(l, pagePath))}" hreflang="${LANGS[l].hreflang}" lang="${LANGS[l].hreflang}" data-l="${l}"${l === lang ? ' aria-current="true"' : ''}>${esc(LANGS[l].name)}</a></li>`).join('');
  return `<details class="lang-menu" id="langMenu"><summary class="chip-btn" aria-label="${esc(t(lang, 'Language'))}"><span class="globe" aria-hidden="true">🌐</span> <span class="lang-name">${esc(LANGS[lang].name)}</span></summary><ul>${items}</ul></details>`;
}

const NO_PREFIX = /^\/(api|admin|privacy|terms)(\/|$)|\.[a-z0-9]{2,5}($|\?)/i;
/** Prefix internal page links with the language (skips assets, the API and the language menu). */
export function localizeLinks(html, lang) {
  if (lang === 'en') return html;
  return html.replace(/<a\b([^>]*?)\shref="(\/[^"]*)"([^>]*)>/g, (m, pre, href, post) => {
    if (/\shreflang=/.test(pre + post) || NO_PREFIX.test(href) || href.startsWith(`/${lang}/`) || href === `/${lang}`) return m;
    const [p, q = ''] = href.split(/(?=[?#])/);
    return `<a${pre} href="${localePath(lang, p)}${q}"${post}>`;
  });
}

// ---- the app shell (public/index.html), translated on the server --------------
const shellPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'index.html');
let template = null;
const shellCache = new Map();

export function renderShell(lang, base) {
  const pack = lang === 'en' ? null : packFor(lang);
  const key = `${lang}:${base}:${pack?.version || ''}:${readyLangs().join(',')}`;
  const hit = shellCache.get(key);
  if (hit) return hit;
  if (!template || process.env.NODE_ENV !== 'production') template = fs.readFileSync(shellPath, 'utf8');
  const tr = (s) => t(lang, s);
  let html = template;
  // Marked text, inner HTML, placeholders and aria labels.
  html = html.replace(/<(\w+)\b([^>]*?)\sdata-i18n(-html)?(?=[\s>])([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, a, isHtml, b, inner) => {
    const src = isHtml ? inner.trim() : decode(inner.trim());
    const out = isHtml ? tr(src) : esc(tr(src));
    return `<${tag}${a} data-i18n${isHtml || ''}${b}>${out}</${tag}>`;
  });
  html = html.replace(/<\w+\b[^>]*\sdata-i18n-(ph|aria)\b[^>]*>/g, (tagHtml) => tagHtml
    .replace(/placeholder="([^"]*)"/, (m, v) => (/data-i18n-ph/.test(tagHtml) ? `placeholder="${esc(tr(decode(v)))}"` : m))
    .replace(/aria-label="([^"]*)"/, (m, v) => (/data-i18n-aria/.test(tagHtml) ? `aria-label="${esc(tr(decode(v)))}"` : m)));

  const title = t(lang, 'Rekha: Choghadiya, Kundli, Palm and Face Reading');
  const desc = t(lang, "Today's Choghadiya, Rahu Kaal and best times, your kundli, AI palm and face reading in your language. Free tools, family plans from ₹49 a month.");
  const ready = readyLangs();
  const indexable = ready.includes(lang);
  const canonical = base ? `${base}${localePath(lang, '/')}` : '';
  html = html
    .replace('<html lang="en" data-lang="en" data-locale="en-IN">', `<html ${htmlAttrs(lang, pack ? ` data-i18nv="${pack.version}"` : '')}>`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/(<link rel="stylesheet" href=")[^"]*(" id="fontCss">)/, `$1${fontHref(lang)}$2`)
    .replace('<!--HEAD-->', [
      canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '',
      indexable ? hreflangTags(base, '/', ready) : '<meta name="robots" content="noindex, follow">',
      canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
      `<meta property="og:locale" content="${LANGS[lang].locale.slice(0, 5).replace('-', '_')}">`,
    ].filter(Boolean).join('\n  '))
    .replace('<!--LANGMENU-->', langMenu(lang, '/'));
  html = localizeLinks(html, lang);
  shellCache.set(key, html);
  if (shellCache.size > 100) shellCache.delete(shellCache.keys().next().value);
  return html;
}
