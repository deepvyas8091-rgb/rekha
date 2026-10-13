// Public surface of the astrology engine.
import { kundli, birthInstant } from './kundli.js';
import { bazi, thaiColours, numerology, westernSunSign } from './world.js';

export { panchang, sunTimes } from './panchang.js';
export { goodBadTimes, personalStrength, monthCalendar, ACTIVITIES } from './muhurta.js';
export { kundli, birthInstant, transits, sadeSati } from './kundli.js';
export { gunMilan } from './matching.js';
export { bazi, thaiColours, thaiColourOfDay, numerology, westernSunSign } from './world.js';

/** Everything the app knows from birth data alone, across all traditions. */
export function birthProfile(b) {
  const utc = birthInstant(b);
  const k = kundli(b);
  return {
    vedic: k,
    chinese: bazi(utc, b.tz),
    thai: thaiColours(utc, b.tz),
    western: { sunSign: westernSunSign(utc) },
    numerology: numerology(b.date, b.name),
  };
}
