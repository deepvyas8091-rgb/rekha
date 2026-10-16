// Fast static files:
// 1. JavaScript and CSS are minified once at start and served under a content hash
//    (/assets/app.3f9c1a2b.js) with a one-year immutable cache. A new deploy changes the
//    hash, so browsers and Cloudflare never serve an old file.
// 2. Fonts are served from rekha.io (no Google Fonts request before the first paint),
//    split by script with unicode-range so a page only downloads the letters it shows.
// 3. The service worker is generated with the current file list.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { LANGS } from './i18n/languages.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (f) => path.join(root, 'public', f);
const hashOf = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const IMMUTABLE = 'public, max-age=31536000, immutable';

// ---- minified, hashed JS and CSS ------------------------------------------------------
// Order matters: a file's hash includes the hashed names of the files it imports.
const BUNDLE = ['i18n.js', 'countries.js', 'guide.js', 'app.js', 'styles.css'];
const built = new Map(); // name -> { url, body, type }
const byUrl = new Map();
function build() {
  built.clear(); byUrl.clear();
  for (const name of BUNDLE) {
    let src = fs.readFileSync(pub(name), 'utf8');
    const css = name.endsWith('.css');
    if (!css) src = src.replace(/(from\s+|import\()(['"])\.\/([\w-]+\.js)\2/g, (m, pre, q, f) => (built.has(f) ? `${pre}${q}${built.get(f).url}${q}` : m));
    let body = src;
    try { body = transformSync(src, { loader: css ? 'css' : 'js', minify: true, format: css ? undefined : 'esm', target: css ? ['chrome90', 'safari14'] : 'es2020', legalComments: 'none' }).code; } catch (e) { console.warn(`Minify ${name} failed, serving as is: ${e.message}`); }
    const [base, ext] = name.split('.');
    const url = `/assets/${base}.${hashOf(body)}.${ext}`;
    const item = { url, body, type: css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' };
    built.set(name, item); byUrl.set(url, item);
  }
}
build();
/** Hashed URL for a public file, e.g. asset('app.js') -> /assets/app.1a2b3c4d5e.js */
export const asset = (name) => built.get(name)?.url || `/${name}`;
export const assetVersion = () => hashOf(BUNDLE.map(asset).join('|'));
/** In development the files are rebuilt when they change, so edits show without a restart. */
export function rebuildIfChanged() {
  if (process.env.NODE_ENV === 'production') return;
  const stamp = BUNDLE.map((n) => fs.statSync(pub(n)).mtimeMs).join(',');
  if (stamp !== rebuildIfChanged.last) { rebuildIfChanged.last = stamp; if (built.size) build(); }
}
rebuildIfChanged.last = BUNDLE.map((n) => fs.statSync(pub(n)).mtimeMs).join(',');

// ---- self-hosted fonts --------------------------------------------------------------
const require = createRequire(import.meta.url);
const FONT_PKGS = {
  inter: 'Inter', fraunces: 'Fraunces', 'noto-sans-devanagari': 'Noto Sans Devanagari', 'noto-sans-gujarati': 'Noto Sans Gujarati',
  'noto-sans-bengali': 'Noto Sans Bengali', 'noto-sans-tamil': 'Noto Sans Tamil', 'noto-sans-telugu': 'Noto Sans Telugu',
  'noto-sans-kannada': 'Noto Sans Kannada', 'noto-sans-malayalam': 'Noto Sans Malayalam', 'noto-sans-thai': 'Noto Sans Thai', 'noto-sans-sc': 'Noto Sans SC',
};
const PKG_OF = Object.fromEntries(Object.entries(FONT_PKGS).map(([k, v]) => [v, k]));
const pkgDir = (pkg) => { try { return path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)); } catch { return null; } };

/** @font-face rules for one font package and weight, keeping only the wanted subsets. */
function faces(pkg, weight, subsets) {
  const dir = pkgDir(pkg); if (!dir) return '';
  let css; try { css = fs.readFileSync(path.join(dir, `${weight}.css`), 'utf8'); } catch { return ''; }
  return css.split(/(?=\/\* )/).filter((block) => {
    const name = /\/\* ([^ ]+) \*\//.exec(block)?.[1] || '';
    if (!name.endsWith('-normal')) return false; // no italics
    const sub = name.slice(pkg.length + 1).replace(/-\d{3}-normal$/, '');
    return block.includes('@font-face') && (!subsets || subsets.includes(sub));
  }).map((block) => block
    .replace(/\/\*[^*]*\*\//, '')
    .replace(/url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)(, url\([^)]+\) format\('woff'\))?/g, `url(/fonts/${pkg}/$1) format('woff2')`)
    .replace(/\s+/g, ' ').trim()).join('');
}
const fontCache = new Map();
/** The @font-face CSS a page in this language needs. */
export function fontCss(lang) {
  if (fontCache.has(lang)) return fontCache.get(lang);
  const latin = lang === 'vi' ? ['latin', 'latin-ext', 'vietnamese'] : ['latin', 'latin-ext'];
  let css = [400, 500, 600].map((w) => faces('inter', w, latin)).join('') + [500, 700].map((w) => faces('fraunces', w, latin)).join('');
  const script = LANGS[lang]?.font || (lang === 'en' ? 'Noto Sans Devanagari' : null);
  const pkg = script && PKG_OF[script];
  if (pkg) {
    const own = pkg === 'noto-sans-sc' ? null : [pkg.replace('noto-sans-', '')];
    css += (pkg === 'noto-sans-sc' ? [400] : [400, 600]).map((w) => faces(pkg, w, own)).join('');
  }
  const out = { css, href: `/fonts/css/${lang}.${hashOf(css)}.css`, preload: '/fonts/inter/inter-latin-400-normal.woff2' };
  fontCache.set(lang, out);
  return out;
}
/** <head> tags for fonts: small rule sets inline (no extra request), large ones (Chinese) as a cached file. */
export function fontTags(lang) {
  const f = fontCss(lang);
  const preload = `<link rel="preload" href="${f.preload}" as="font" type="font/woff2" crossorigin>`;
  return f.css.length < 16000 ? `${preload}<style id="fontCss">${f.css}</style>` : `${preload}<link rel="stylesheet" href="${f.href}" id="fontCss">`;
}

// ---- routes ----------------------------------------------------------------------------
export function assetRoutes(app) {
  app.get('/assets/:file', (req, res, next) => {
    rebuildIfChanged();
    const item = byUrl.get(`/assets/${req.params.file}`);
    if (!item) {
      // An old hashed name (from a cached page): send the current file briefly cached, never a 404.
      const name = /^([\w-]+)\.[0-9a-f]{10}\.(js|css)$/.exec(req.params.file);
      const cur = name && built.get(`${name[1]}.${name[2]}`);
      if (!cur) return next();
      res.set('Cache-Control', 'public, max-age=300');
      return res.type(cur.type).send(cur.body);
    }
    res.set('Cache-Control', IMMUTABLE).type(item.type).send(item.body);
  });
  app.get('/fonts/css/:file', (req, res, next) => {
    const lang = /^([a-z]{2})\.[0-9a-f]{10}\.css$/.exec(req.params.file)?.[1];
    if (!lang || !LANGS[lang]) return next();
    res.set('Cache-Control', IMMUTABLE).type('text/css; charset=utf-8').send(fontCss(lang).css);
  });
  app.get('/fonts/:pkg/:file', (req, res, next) => {
    const dir = FONT_PKGS[req.params.pkg] && pkgDir(req.params.pkg);
    if (!dir || !/^[\w.[\]-]+\.woff2$/.test(req.params.file)) return next();
    res.set({ 'Cache-Control': IMMUTABLE, 'Access-Control-Allow-Origin': '*' });
    res.sendFile(path.join(dir, 'files', req.params.file), (err) => { if (err) next(); });
  });
  // The service worker, with the current file list and a version that changes on every deploy.
  app.get('/sw.js', (_req, res) => {
    rebuildIfChanged();
    const src = fs.readFileSync(pub('sw.js'), 'utf8')
      .replace(/const CACHE = '[^']*';/, `const CACHE = 'rekha-${assetVersion()}';`)
      .replace(/const SHELL = \[[^\]]*\];/, `const SHELL = ${JSON.stringify(['/manifest.json', '/icon.svg', '/icons/icon-192.png', ...BUNDLE.map(asset)])};`);
    res.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }).type('text/javascript').send(src);
  });
}
