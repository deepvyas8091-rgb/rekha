// Supported languages. English is the source; every other language is served under
// its own URL prefix (/hi/, /gu/ ...) so search engines index each one separately.
// `font` is the Google Fonts family for that script (Latin scripts use Inter only).

export const LANGS = {
  en: { name: 'English', english: 'English', locale: 'en-IN', hreflang: 'en' },
  hi: { name: 'हिन्दी', english: 'Hindi', locale: 'hi-IN', hreflang: 'hi', font: 'Noto Sans Devanagari' },
  gu: { name: 'ગુજરાતી', english: 'Gujarati', locale: 'gu-IN', hreflang: 'gu', font: 'Noto Sans Gujarati' },
  mr: { name: 'मराठी', english: 'Marathi', locale: 'mr-IN', hreflang: 'mr', font: 'Noto Sans Devanagari' },
  bn: { name: 'বাংলা', english: 'Bengali', locale: 'bn-IN', hreflang: 'bn', font: 'Noto Sans Bengali' },
  ta: { name: 'தமிழ்', english: 'Tamil', locale: 'ta-IN', hreflang: 'ta', font: 'Noto Sans Tamil' },
  te: { name: 'తెలుగు', english: 'Telugu', locale: 'te-IN', hreflang: 'te', font: 'Noto Sans Telugu' },
  kn: { name: 'ಕನ್ನಡ', english: 'Kannada', locale: 'kn-IN', hreflang: 'kn', font: 'Noto Sans Kannada' },
  ml: { name: 'മലയാളം', english: 'Malayalam', locale: 'ml-IN', hreflang: 'ml', font: 'Noto Sans Malayalam' },
  th: { name: 'ไทย', english: 'Thai', locale: 'th-TH-u-ca-gregory', hreflang: 'th', font: 'Noto Sans Thai' },
  vi: { name: 'Tiếng Việt', english: 'Vietnamese', locale: 'vi-VN', hreflang: 'vi' },
  id: { name: 'Bahasa Indonesia', english: 'Indonesian', locale: 'id-ID', hreflang: 'id' },
  ms: { name: 'Bahasa Melayu', english: 'Malay', locale: 'ms-MY', hreflang: 'ms' },
  tl: { name: 'Filipino', english: 'Filipino', locale: 'fil-PH', hreflang: 'fil' },
  zh: { name: '简体中文', english: 'Simplified Chinese', locale: 'zh-CN', hreflang: 'zh-Hans', font: 'Noto Sans SC' },
};
export const LANG_CODES = Object.keys(LANGS);
export const OTHER_LANGS = LANG_CODES.filter((l) => l !== 'en');
export const isLang = (l) => Object.hasOwn(LANGS, l);

/** Path for a page in a language: /insights -> /hi/insights, / -> /hi/ */
export function localePath(lang, path = '/') {
  if (!lang || lang === 'en') return path;
  return path === '/' ? `/${lang}/` : `/${lang}${path}`;
}

/** Google Fonts stylesheet for a page in this language. */
export function fontHref(lang) {
  const fams = ['family=Fraunces:opsz,wght@9..144,500;9..144,700', 'family=Inter:wght@400;500;600'];
  const f = LANGS[lang]?.font;
  if (f) fams.push(`family=${f.replace(/ /g, '+')}:wght@400;600`);
  if (lang === 'en') fams.push('family=Noto+Sans+Devanagari:wght@400;600'); // brand mark and Hindi sign names
  return `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap`;
}
