// Share images for chat and social previews, drawn as SVG and rendered to PNG with resvg.
// Latin text only (city names in English), so one bundled font covers every image.
import { createRequire } from 'node:module';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const fontDir = path.dirname(require.resolve('@expo-google-fonts/inter/package.json'));
const FONTS = [path.join(fontDir, '400Regular', 'Inter_400Regular.ttf'), path.join(fontDir, '700Bold', 'Inter_700Bold.ttf')];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cache = new Map();

/** PNG buffer for { title, big, sub, date }. */
export async function shareImage({ title, big, sub, date }) {
  const key = JSON.stringify([title, big, sub, date]);
  if (cache.has(key)) return cache.get(key);
  const fit = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b1840"/><stop offset="1" stop-color="#6b2d3c"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1090" cy="110" r="190" fill="#f08a3e" opacity="0.12"/>
  <circle cx="110" cy="96" r="34" fill="#f08a3e"/>
  <text x="110" y="108" font-family="Inter" font-size="30" font-weight="700" fill="#2b1840" text-anchor="middle">R</text>
  <text x="166" y="108" font-family="Inter" font-size="34" font-weight="700" fill="#ffffff">Rekha</text>
  <text x="80" y="250" font-family="Inter" font-size="56" font-weight="700" fill="#ffffff">${esc(fit(title, 34))}</text>
  <text x="80" y="370" font-family="Inter" font-size="84" font-weight="700" fill="#f0b27a">${esc(fit(big, 24))}</text>
  <text x="80" y="450" font-family="Inter" font-size="36" fill="#f2ebf7">${esc(fit(sub, 52))}</text>
  <text x="80" y="560" font-family="Inter" font-size="30" fill="#cdbfdb">${esc(date)}  ·  rekha.io</text>
</svg>`;
  const png = new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, png);
  return png;
}
