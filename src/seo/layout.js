// Server-rendered HTML for SEO pages: full content without JavaScript, so search
// engines and AI crawlers read everything. Shares the app's stylesheet.

import { tFor, LANGS, localePath, readyLangs } from '../i18n/index.js';
import { asset, fontTags } from '../assets.js';
import { analyticsHead, consentBar } from '../analytics.js';
import { htmlAttrs, hreflangTags, langMenu, localizeLinks } from '../i18n/shell.js';

export const SITE = {
  name: 'Rekha',
  tagline: 'Choghadiya, Panchang, Kundli, Palm and Face Reading',
  url: () => (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Tiny Markdown subset: ## and ### headings, paragraphs, - lists, 1. lists, **bold**, [text](/link), | tables |. */
export function md(src) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((\/[^)\s]*|https:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  const blocks = src.trim().split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.trim());
    if (lines[0].startsWith('### ')) { out.push(`<h3>${inline(lines[0].slice(4))}</h3>`); if (lines.length > 1) out.push(`<p>${inline(lines.slice(1).join(' '))}</p>`); continue; }
    if (lines[0].startsWith('## ')) { out.push(`<h2 id="${slugify(lines[0].slice(3))}">${inline(lines[0].slice(3))}</h2>`); if (lines.length > 1) out.push(`<p>${inline(lines.slice(1).join(' '))}</p>`); continue; }
    if (lines.every((l) => l.startsWith('- '))) { out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`); continue; }
    if (lines.every((l) => /^\d+\. /.test(l))) { out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`); continue; }
    if (lines.every((l) => l.startsWith('|'))) {
      const rows = lines.filter((l) => !/^\|[\s|:-]+\|$/.test(l)).map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      out.push(`<div class="table-wrap"><table><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    out.push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return out.join('\n');
}

export const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

/**
 * Full page. opts: { lang, title, description, path, h1, lede, body, jsonld: [], crumbs: [[label, href]], noindex,
 *   langs: languages this page exists in (for hreflang; default: all ready languages) }
 * `path` and crumb links are English paths; they are prefixed with the language here.
 */
// Search results cut titles at about 60 to 70 characters and descriptions at about 160.
// Long city and festival names can push generated text over; shorten it here, at word boundaries.
const len = (s) => [...s].length;
const clip = (s, n) => { if (len(s) <= n) return s; const cut = [...s].slice(0, n - 1).join(''); return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6)).replace(/[\s,;:.]+$/, '')}…`; };
export function fitTitle(t) {
  let out = t;
  while (len(out) > 70 && out.lastIndexOf(': ') > 20) out = out.slice(0, out.lastIndexOf(': '));
  return clip(out, 70);
}
export const fitDescription = (d) => clip(d, 165);

export function page(opts) {
  opts = { ...opts, title: fitTitle(opts.title), description: fitDescription(opts.description) };
  const lang = opts.lang || 'en';
  const tt = tFor(lang);
  const base = (opts.base || SITE.url()).replace(/\/$/, '');
  const langs = opts.langs || readyLangs();
  const indexable = !opts.noindex && langs.includes(lang);
  const canonical = `${base}${localePath(langs.includes(lang) ? lang : 'en', opts.path)}`;
  const crumbs = opts.crumbs || [];
  const crumbLd = crumbs.length ? [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [[tt('Home'), '/'], ...crumbs].map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${base}${localePath(lang, href)}` })),
  }] : [];
  // Who publishes the site, on every page (search and AI engines use it to tie pages to one brand).
  // SOCIAL_LINKS (comma-separated profile URLs) adds sameAs once Rekha has public profiles.
  const sameAs = (process.env.SOCIAL_LINKS || '').split(',').map((x) => x.trim()).filter((x) => /^https:\/\//.test(x));
  const siteLd = base ? [{
    '@context': 'https://schema.org', '@type': 'Organization', '@id': `${base}/#org`, name: 'Rekha', url: `${base}/`,
    logo: `${base}/icons/icon-512.png`, ...(sameAs.length ? { sameAs } : {}),
  }, {
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${base}/#website`, name: 'Rekha', url: `${base}/`,
    publisher: { '@id': `${base}/#org` }, inLanguage: langs.map((l) => LANGS[l].hreflang),
  }] : [];
  const ld = [...siteLd, ...crumbLd, ...(opts.jsonld || [])].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
  const html = `<!doctype html>
<html ${htmlAttrs(lang)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
${base ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
${indexable ? '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">' : '<meta name="robots" content="noindex, follow">'}
${indexable ? hreflangTags(base, opts.path, langs) : ''}
<meta property="og:type" content="${opts.ogType || 'website'}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:locale" content="${LANGS[lang].locale.slice(0, 5).replace('-', '_')}">
${base ? `<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(opts.image || `${base}/icons/og.png`)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#2b1840">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${fontTags(lang)}
<link rel="stylesheet" href="${asset('styles.css')}">
${ld}
${analyticsHead()}
</head>
<body class="seo">
<header class="site-head">
  <div class="bar">
    <a class="brand" href="/" style="text-decoration:none"><img class="mark" src="/icons/logo-64.png" width="32" height="32" alt="" aria-hidden="true"> Rekha</a>
    <div class="top-actions">${langMenu(lang, opts.path, langs.includes(lang) ? langs : [...langs, lang])}<a class="chip-btn premium" href="/">${esc(tt('Open app'))}</a></div>
  </div>
  <nav class="tabs" aria-label="${esc(tt('Sections'))}">
    <a href="/">${esc(tt('Today'))}</a><a href="/choghadiya">${esc(tt('Choghadiya'))}</a><a href="/panchang">${esc(tt('Panchang'))}</a><a href="/festivals">${esc(tt('Festivals'))}</a><a href="/horoscope">${esc(tt('Horoscope'))}</a><a href="/insights">${esc(tt('Insights'))}</a><a href="/?tab=chart">${esc(tt('Kundli'))}</a><a href="/?tab=scan">${esc(tt('Palm & Face'))}</a>
  </nav>
</header>
${opts.notice ? `<div class="lang-note">${opts.notice}</div>` : ''}
<main class="article">
  ${crumbs.length ? `<nav class="crumbs" aria-label="${esc(tt('Breadcrumb'))}"><a href="/">${esc(tt('Home'))}</a>${crumbs.map(([l, h], i) => ` <span aria-hidden="true">›</span> ${i === crumbs.length - 1 ? `<span>${esc(l)}</span>` : `<a href="${esc(h)}">${esc(l)}</a>`}`).join('')}</nav>` : ''}
  <header class="page-head"><h1>${esc(opts.h1 || opts.title)}</h1>${opts.lede ? `<p class="lede">${esc(opts.lede)}</p>` : ''}</header>
  ${opts.body}
</main>
${footer(lang)}
${consentBar(lang)}
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (window.rk) rk('page_view');
document.cookie = 'rk_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax';</script>
</body>
</html>`;
  return localizeLinks(html, lang);
}

let footerLinks = null;
/** Called once at startup with a function returning the big internal-link lists for a language. */
export function setFooterLinks(fn) { footerLinks = fn; }
function footer(lang) {
  const tt = tFor(lang);
  const f = footerLinks ? footerLinks(lang) : { cities: [], signs: [], insights: [], festivals: [] };
  const list = (items) => `<ul>${items.map(([l, h]) => `<li><a href="${esc(h)}">${esc(l)}</a></li>`).join('')}</ul>`;
  return `<footer class="site-foot">
  <div class="foot-cols">
    <div><h3>${esc(tt('Choghadiya today'))}</h3>${list(f.cities.slice(0, 12))}</div>
    <div><h3>${esc(tt('Horoscope today'))}</h3>${list(f.signs)}</div>
    <div><h3>${esc(tt('Festivals'))}</h3>${list((f.festivals || []).slice(0, 12))}</div>
    <div><h3>${esc(tt('Learn'))}</h3>${list(f.insights.slice(0, 12))}</div>
  </div>
  <p class="foot">${esc(tt('For entertainment and self-reflection. Not medical, legal or financial advice.'))} <a href="/insights/how-rekha-works">${esc(tt('How Rekha works'))}</a> · <a href="/privacy">${esc(tt('Privacy'))}</a> · <a href="/terms">${esc(tt('Terms'))}</a> · <a href="/insights">${esc(tt('All insights'))}</a></p>
</footer>`;
}
