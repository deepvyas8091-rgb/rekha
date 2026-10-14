// Checks that a translation is written in the right script. The model sometimes answers
// in a neighbouring language (Hindi instead of Tamil, for example), which a length or
// placeholder check cannot catch.
const RANGES = {
  deva: /[ऀ-ॿ]/g, gujr: /[઀-૿]/g, beng: /[ঀ-৿]/g, taml: /[஀-௿]/g,
  telu: /[ఀ-౿]/g, knda: /[ಀ-೿]/g, mlym: /[ഀ-ൿ]/g, thai: /[฀-๿]/g,
  han: /[㐀-鿿]/g, latn: /[A-Za-zÀ-ɏḀ-ỿ]/g,
};
const SCRIPT_OF = { hi: 'deva', mr: 'deva', gu: 'gujr', bn: 'beng', ta: 'taml', te: 'telu', kn: 'knda', ml: 'mlym', th: 'thai', zh: 'han', vi: 'latn', id: 'latn', ms: 'latn', tl: 'latn' };
const count = (s, re) => (String(s).match(re) || []).length;

/** True if `text` looks like it is written in `lang`'s script. Short or Latin-only strings pass for non-Latin targets (brand names, "AI"). */
export function scriptOk(lang, text) {
  const want = SCRIPT_OF[lang];
  if (!want) return true;
  const plain = String(text).replace(/<[^>]+>|\{\w+\}|\]\([^)]*\)|https?:\/\/\S+/g, '');
  const scores = Object.fromEntries(Object.entries(RANGES).map(([k, re]) => [k, count(plain, re)]));
  const own = scores[want];
  // Any letters from a different non-Latin script than the target: wrong language.
  const foreign = Object.entries(scores).filter(([k]) => k !== want && k !== 'latn').reduce((a, [, n]) => a + n, 0);
  if (foreign > Math.max(2, own * 0.1)) return false;
  // A non-Latin target with plenty of letters but none in its own script: untranslated.
  if (want !== 'latn' && own === 0 && scores.latn >= 25) return false;
  return true;
}
