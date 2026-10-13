// Plain-language explanations shown next to every Panchang, Kundli, timing,
// palm and face item. Traditional meanings; for entertainment and reflection.
// The astrology consultant should review this file with the VERIFY tables.
// Every string here is translated through the language packs (keyed by its English text).
import { t } from './i18n.js';

// ---------------- Today: good and bad times ----------------
export const TIMES = {
  choghadiya: {
    title: 'What is Choghadiya?',
    body: 'The day (sunrise to sunset) and the night are each split into 8 parts of about 1.5 hours. Each part is ruled by a planet and has a quality. Amrit, Shubh and Labh are good for starting things. Char is good for travel. Udveg, Kaal and Rog are best avoided for new beginnings. Choghadiya is widely used in Gujarat, Rajasthan and Maharashtra to pick a time to open a shop, sign a deal, travel or buy something.',
  },
  types: [
    ['Amrit', 'best', 'Nectar. Best for anything important.'],
    ['Shubh', 'good', 'Auspicious. Ceremonies, marriage, worship.'],
    ['Labh', 'good', 'Profit. Business, trade, study.'],
    ['Char', 'neutral', 'Moving. Travel and vehicles.'],
    ['Udveg', 'bad', 'Anxiety. Only official or government work.'],
    ['Kaal', 'bad', 'Loss. Avoid new beginnings.'],
    ['Rog', 'bad', 'Trouble. Avoid; disputes are more likely.'],
  ],
  avoid: {
    title: 'Why avoid these times?',
    body: 'Rahu Kaal (about 90 minutes a day) is ruled by Rahu and is the most widely followed time to avoid starting new work, journeys or purchases, especially in South India. Yamaganda and Gulika Kaal are similar daily periods. Dur Muhurtam is a short inauspicious window. Bhadra (Vishti karana) is avoided for ceremonies. The times shift every day with your local sunrise, so they are calculated for your city.',
  },
  good: {
    title: 'What are auspicious windows?',
    body: 'Abhijit Muhurta is the window around local noon, traditionally good for any important start. Brahma Muhurta, before sunrise, is ideal for prayer, meditation and study. Vijaya Muhurta favours competitions and legal matters. Godhuli (the cow-dust hour at sunset) is traditional for weddings.',
  },
  best: {
    title: 'How the best time is picked',
    body: 'Rekha takes the good Choghadiya periods for your chosen activity, removes Rahu Kaal, Yamaganda, Gulika, Dur Muhurtam and Bhadra, and ranks what is left. Windows that also fall in a matching planetary hour (Hora) rank higher.',
  },
  hora: {
    title: 'What is Hora?',
    body: 'Each day and night is split into 12 planetary hours. The first hour after sunrise belongs to the planet of the weekday (Sun on Sunday, Moon on Monday and so on). Use a Jupiter or Venus hora for celebrations and money matters, Mercury for business and study, and Moon for travel and meeting people.',
  },
  personal: {
    title: 'Your personal day rating',
    body: 'Tarabalam compares today\'s Moon nakshatra with your birth nakshatra. Chandrabalam checks which house today\'s Moon is in, counted from your birth Moon sign. Both good means a strong day for you; both weak means go slow on big decisions.',
  },
};

// ---------------- Panchang ----------------
export const PANCHANG = {
  intro: 'The Panchang ("five limbs") is the Hindu almanac for the day. The five limbs are tithi, vara, nakshatra, yoga and karana. Together they decide festivals, fasts and good days. The Hindu day starts at sunrise, so these values are for your city\'s sunrise.',
  terms: {
    Tithi: 'The lunar day. There are 30 tithis in a lunar month, one for every 12 degrees the Moon moves away from the Sun. Festivals and fasts are set by tithi, and a tithi can start or end at any time of day.',
    Nakshatra: 'The Moon\'s star. The sky is divided into 27 nakshatras and the Moon passes through one roughly every day. Each has a nature that suits some activities more than others.',
    Yoga: 'A combination of the Sun\'s and Moon\'s positions. There are 27 yogas; most are good, and nine are traditionally avoided for new beginnings.',
    Karana: 'Half of a tithi, so there are two each lunar day. Vishti karana, also called Bhadra, is avoided for ceremonies and new starts.',
    Vara: 'The weekday. Each is ruled by a planet and suits different kinds of work.',
    Month: 'The lunar month (masa). Amanta months end on the new moon (used in Gujarat, Maharashtra and South India); Purnimanta months end on the full moon (used in North India). An extra month (Adhika masa) is added about every three years.',
    'Sunrise / Sunset': 'The Hindu day runs from sunrise to the next sunrise, so every timing in the app is measured from your local sunrise.',
    'Moonrise / Moonset': 'When the Moon rises and sets at your location. Used for fasts such as Karwa Chauth and Sankashti Chaturthi.',
    'Moon sign': 'The zodiac sign the Moon is in today (sidereal, Lahiri). Your daily Chandrabalam is counted from it.',
    'Ritu / Ayana': 'Ritu is one of the six Indian seasons. Ayana is the Sun\'s half-year: Uttarayana (northward, from Makar Sankranti) is traditionally preferred for auspicious events.',
    'Vikram Samvat': 'The traditional Hindu calendar era, 57 years ahead of the common era. Shaka Samvat is India\'s national calendar era.',
    Festivals: 'Festivals and fasts falling on this day for your location, worked out from the tithi at the right time of day (for example Diwali at dusk).',
  },
  tithiGroup: (n) => {
    // n = 1..15 within the paksha
    if (n === 15) return null;
    return [
      null,
      ['Nanda', 'Joyful: good for celebrations, arts and new clothes.'],
      ['Bhadra', 'Good for steady, practical and health-related work.'],
      ['Jaya', 'Victory: good for competitions and decisive action.'],
      ['Rikta', 'Empty: traditionally avoided for new beginnings.'],
      ['Purna', 'Complete: good for most auspicious work.'],
    ][((n - 1) % 5) + 1];
  },
  special: { Purnima: 'Full moon: auspicious for worship, fasting and charity.', Amavasya: 'New moon: for honouring ancestors; avoided for new beginnings.' },
  paksha: { Shukla: 'Shukla paksha (waxing moon): a growing phase, traditionally better for starting things.', Krishna: 'Krishna paksha (waning moon): a phase for finishing, clearing and reflection.' },
  vara: {
    Sunday: 'Ruled by the Sun: government work, health, meeting people in authority.',
    Monday: 'Ruled by the Moon: travel, family, home matters.',
    Tuesday: 'Ruled by Mars: energy, sports, property; avoid starting agreements.',
    Wednesday: 'Ruled by Mercury: trade, writing, learning, communication.',
    Thursday: 'Ruled by Jupiter: education, ceremonies, finance, advice.',
    Friday: 'Ruled by Venus: arts, romance, shopping, beauty.',
    Saturday: 'Ruled by Saturn: hard work, repairs, discipline; slow for new starts.',
  },
  karana: { Vishti: 'Vishti (Bhadra): avoid ceremonies and new starts while it lasts.' },
};

// Nakshatra natures (Muhurta classification).
const NAK_NATURE = {
  Dhruva: ['Fixed', 'Good for foundations, buying a home, planting and anything meant to last.', ['Rohini', 'Uttara Phalguni', 'Uttara Ashadha', 'Uttara Bhadrapada']],
  Chara: ['Movable', 'Good for travel, vehicles and change.', ['Punarvasu', 'Swati', 'Shravana', 'Dhanishta', 'Shatabhisha']],
  Ugra: ['Fierce', 'Not for auspicious events; suits bold or difficult tasks.', ['Bharani', 'Magha', 'Purva Phalguni', 'Purva Ashadha', 'Purva Bhadrapada']],
  Mishra: ['Mixed', 'Fine for routine and practical work.', ['Krittika', 'Vishakha']],
  Kshipra: ['Swift', 'Good for trade, learning, starting treatment and quick tasks.', ['Ashwini', 'Pushya', 'Hasta']],
  Mridu: ['Gentle', 'Good for arts, friendship, romance and new clothes.', ['Mrigashira', 'Chitra', 'Anuradha', 'Revati']],
  Tikshna: ['Sharp', 'Not for auspicious events; suits ending things and hard decisions.', ['Ardra', 'Ashlesha', 'Jyeshtha', 'Mula']],
};
export function nakshatraNature(name) {
  const hit = Object.values(NAK_NATURE).find(([, , list]) => list.includes(name));
  return hit ? t('{nature} nakshatra: {meaning}', { nature: t(hit[0]), meaning: t(hit[1]) }) : '';
}

// ---------------- Kundli ----------------
export const SIGN_TRAIT = {
  Mesha: 'Aries: bold, energetic, a natural starter.',
  Vrishabha: 'Taurus: steady, loyal, enjoys comfort and beauty.',
  Mithuna: 'Gemini: curious, talkative, quick learner.',
  Karka: 'Cancer: caring, protective, home-loving.',
  Simha: 'Leo: confident, generous, born to lead.',
  Kanya: 'Virgo: practical, careful, good with detail.',
  Tula: 'Libra: fair, diplomatic, values partnership.',
  Vrishchika: 'Scorpio: intense, determined, deeply loyal.',
  Dhanu: 'Sagittarius: optimistic, adventurous, a seeker.',
  Makara: 'Capricorn: disciplined, ambitious, patient.',
  Kumbha: 'Aquarius: independent, inventive, community-minded.',
  Meena: 'Pisces: intuitive, compassionate, imaginative.',
};
export const PLANET = {
  Sun: 'Soul, confidence, father, authority and recognition.',
  Moon: 'Mind, emotions, mother, comfort and the public.',
  Mars: 'Energy, courage, siblings, property and drive.',
  Mercury: 'Intellect, speech, trade, learning and wit.',
  Jupiter: 'Wisdom, teachers, children, wealth and good fortune.',
  Venus: 'Love, marriage, beauty, art and comforts.',
  Saturn: 'Discipline, hard work, patience, delays and lasting results.',
  Rahu: 'Ambition, desire, foreign lands and the unconventional.',
  Ketu: 'Detachment, spirituality, past skills and letting go.',
};
export const HOUSE = [
  null,
  'Self, body, personality',
  'Wealth, family, speech',
  'Courage, siblings, communication, short trips',
  'Home, mother, property, vehicles, happiness',
  'Children, creativity, education, romance',
  'Daily work, service, competition, obstacles',
  'Marriage, partnerships, business deals',
  'Change, hidden matters, inheritance, research',
  'Luck, faith, father, higher learning, long journeys',
  'Career, status, reputation',
  'Income, gains, friends, wishes fulfilled',
  'Expenses, foreign lands, spirituality, rest',
];
export const DASHA = {
  Ketu: 'An inward phase: letting go, spirituality, finishing old business.',
  Venus: 'Relationships, comforts, creativity and enjoying life.',
  Sun: 'Recognition, authority, confidence and leadership.',
  Moon: 'Emotions, home, family, travel and dealing with the public.',
  Mars: 'Action, energy, property and courage.',
  Rahu: 'Ambition and big changes, often foreign links or unusual paths.',
  Jupiter: 'Growth, learning, children, guidance and good fortune.',
  Saturn: 'Hard work and discipline; slow but lasting results.',
  Mercury: 'Business, study, communication and networking.',
};
export const KUNDLI_TERMS = {
  Lagna: 'The ascendant: the sign rising on the eastern horizon at your birth. It shapes your personality and body, and sets the order of the 12 houses. It changes about every two hours, which is why birth time matters.',
  Rashi: 'Your Moon sign: the sign the Moon was in at birth. Indian horoscopes, daily predictions and Sade Sati are read from it.',
  Nakshatra: 'Your birth star: the nakshatra the Moon was in. It sets your dasha periods and is used for naming and marriage matching.',
  Dasha: 'Vimshottari dasha divides life into periods ruled by the nine planets, 120 years in total. The Mahadasha is the main period; the Antardasha is the sub-period inside it. They show which themes are active now.',
  'Sade Sati': 'The 7.5 years when Saturn passes through the sign before your Moon sign, your Moon sign and the one after. Traditionally a period of hard work, responsibility and growth. Shani Dhaiya is a shorter 2.5-year Saturn period.',
  Manglik: 'Mangal dosha: Mars in certain houses (1, 2, 4, 7, 8 or 12). It is checked before marriage. Many exceptions cancel it, so an astrologer should confirm.',
  Houses: 'The chart has 12 houses, each covering an area of life. A planet in a house brings its energy to that area.',
  Retrograde: '(R) means the planet appears to move backwards from Earth. Its themes turn inward or need revisiting.',
  BaZi: 'Chinese "Four Pillars": the year, month, day and hour of birth, each written as a heavenly stem and an earthly branch. The day stem is your Day Master, your core element.',
  'Life path': 'Numerology: the digits of your birth date added down to one number (11, 22 and 33 are kept as master numbers).',
  'Thai birth colour': 'In Thailand, each weekday has a colour. The colour of the day you were born is your lucky colour.',
};
export const LIFE_PATH = {
  1: 'Leader and pioneer; independent and driven.', 2: 'Peacemaker; sensitive, cooperative, diplomatic.',
  3: 'Creative communicator; joyful and expressive.', 4: 'Builder; practical, reliable, hard-working.',
  5: 'Free spirit; adaptable, loves change and travel.', 6: 'Nurturer; responsible, family-minded, caring.',
  7: 'Seeker; thoughtful, spiritual, analytical.', 8: 'Achiever; ambitious, good with money and power.',
  9: 'Humanitarian; generous, wise, compassionate.', 11: 'Master number 11: intuitive and inspiring.',
  22: 'Master number 22: a master builder of big plans.', 33: 'Master number 33: a master teacher and healer.',
};
export const CHINESE_ANIMAL = {
  Rat: 'Quick-witted and resourceful.', Ox: 'Diligent and dependable.', Tiger: 'Brave and confident.',
  Rabbit: 'Gentle, elegant and kind.', Dragon: 'Ambitious and charismatic.', Snake: 'Wise and intuitive.',
  Horse: 'Energetic and free-spirited.', Goat: 'Calm, creative and caring.', Monkey: 'Clever and curious.',
  Rooster: 'Observant and hard-working.', Dog: 'Loyal and honest.', Pig: 'Generous and warm-hearted.',
};
export const ELEMENT = {
  Wood: 'growth and kindness', Fire: 'passion and warmth', Earth: 'stability and trust',
  Metal: 'discipline and fairness', Water: 'wisdom and flexibility',
};

// ---------------- Palm and face guides ----------------
export const PALM_GUIDE = {
  intro: 'Your palm scan reads up to six areas. Hand shape and finger lengths are measured on your phone; the lines, mounts and marks are read from the photo. Anything the photo does not show clearly is listed as "not visible" rather than guessed.',
  sections: [
    ['Hand shape', 'Palm length vs width and finger length give one of four types: Earth (practical), Air (curious, communicative), Fire (energetic, bold) or Water (intuitive, sensitive).'],
    ['Fingers', 'Index vs ring finger (ambition vs creativity), little finger length (communication and business sense) and thumb length (willpower).'],
    ['Major lines', 'Heart line (Hriday rekha): emotions and relationships. Head line (Mastishk rekha): thinking style. Life line (Jeevan rekha): energy and vitality, not lifespan. Fate line (Bhagya rekha): career direction. Sun line (Surya rekha): recognition. Length, depth, curve, breaks and forks are all read.'],
    ['Mounts (parvat)', 'The raised pads under the fingers and around the palm: Guru (Jupiter), Shani (Saturn), Surya (Sun), Budh (Mercury), Shukra (Venus), Chandra (Moon) and Mangal (Mars). Prominent or flat mounts show which qualities are strongest.'],
    ['Relationship lines', 'The short lines on the edge of the palm below the little finger (Vivah rekha), read for the main relationship themes.'],
    ['Special marks', 'Stars, triangles, squares, crosses, islands and the mystic cross, each with a traditional meaning.'],
  ],
  tips: ['Use your dominant hand (the one you write with).', 'Open the palm flat, fingers together, filling the frame.', 'Daylight from a window works best; avoid flash and shadows.'],
};
export const FACE_GUIDE = {
  intro: 'Face reading follows Chinese Mian Xiang and Indian Samudrik Shastra. Your phone measures facial proportions; only those numbers are sent, never the photo.',
  sections: [
    ['Face type', 'Overall shape mapped to the five elements: Wood (long), Fire (heart-shaped), Earth (oval), Metal (square) and Water (round).'],
    ['Three courts (San Ting)', 'Upper (hairline to eyebrows): intellect and early life. Middle (eyebrows to nose tip): drive and the working years. Lower (nose tip to chin): stability and later life. The strongest court shows where your energy is focused.'],
    ['Eyes', 'Spacing shows big-picture vs detail focus.'],
    ['Eyebrows', 'Length is traditionally linked to loyalty and lasting friendships.'],
    ['Nose', 'Called the "wealth palace" in Mian Xiang; linked to how you handle money.'],
    ['Lips and jaw', 'Lips show how you express yourself; the jaw shows determination and flexibility.'],
  ],
  never: 'Never read or mentioned: skin colour, looks or attractiveness, age, ethnicity, caste, religion or health.',
  tips: ['Face the camera straight on, at eye level.', 'Even light, no strong shadows; remove glasses if you can.', 'Neutral expression, hair away from the forehead.'],
};

// Simple labelled diagrams (inline SVG, colours follow the theme).
export const PALM_SVG = () => `<svg viewBox="0 0 220 260" class="diagram" role="img" aria-label="${t('Palm diagram showing the major lines and mounts')}">
  <path d="M60 250 C40 200 38 160 44 128 L40 70 C40 58 56 56 58 70 L64 112 L66 40 C66 26 84 26 84 40 L86 104 L94 30 C94 16 112 16 112 30 L110 104 L120 42 C122 28 140 30 138 44 L130 112 L148 76 C154 64 170 70 164 84 L146 150 C140 190 150 220 156 250 Z" fill="var(--surface)" stroke="var(--muted)" stroke-width="2"/>
  <path d="M58 132 C90 120 120 118 146 126" stroke="#d14b72" stroke-width="3" fill="none"/>
  <path d="M54 150 C82 146 110 152 132 168" stroke="#3a7bd5" stroke-width="3" fill="none"/>
  <path d="M60 140 C76 170 74 210 84 244" stroke="#2f9e6a" stroke-width="3" fill="none"/>
  <path d="M104 244 C102 200 100 170 98 130" stroke="#c9631b" stroke-width="2.5" fill="none" stroke-dasharray="5 4"/>
  <path d="M126 236 C124 210 122 190 120 150" stroke="#b58a12" stroke-width="2.5" fill="none" stroke-dasharray="2 4"/>
  <g font-size="9" fill="var(--ink)" font-family="Inter, sans-serif">
    <text x="150" y="122">${t('Heart')}</text><text x="134" y="176">${t('Head')}</text><text x="40" y="200">${t('Life')}</text>
    <text x="94" y="256">${t('Fate')}</text><text x="128" y="244">${t('Sun')}</text>
  </g>
  <g font-size="8" fill="var(--muted)" font-family="Inter, sans-serif">
    <text x="64" y="118">${t('Guru')}</text><text x="88" y="112">${t('Shani')}</text><text x="112" y="116">${t('Surya')}</text><text x="134" y="124">${t('Budh')}</text>
    <text x="52" y="226">${t('Shukra')}</text><text x="128" y="206">${t('Chandra')}</text>
  </g>
</svg>`;
export const FACE_SVG = () => `<svg viewBox="0 0 240 240" class="diagram" role="img" aria-label="${t('Face diagram showing the three courts')}">
  <ellipse cx="104" cy="124" rx="64" ry="90" fill="var(--surface)" stroke="var(--muted)" stroke-width="2"/>
  <line x1="32" y1="90" x2="186" y2="90" stroke="var(--accent)" stroke-dasharray="4 4"/>
  <line x1="32" y1="148" x2="186" y2="148" stroke="var(--accent)" stroke-dasharray="4 4"/>
  <path d="M72 84 q14 -8 26 0 M110 84 q14 -8 26 0" stroke="var(--ink)" stroke-width="2" fill="none"/>
  <ellipse cx="85" cy="102" rx="9" ry="5" fill="none" stroke="var(--ink)"/><ellipse cx="123" cy="102" rx="9" ry="5" fill="none" stroke="var(--ink)"/>
  <path d="M104 106 L98 138 Q104 144 110 138" stroke="var(--ink)" fill="none"/>
  <path d="M88 170 Q104 180 120 170" stroke="var(--ink)" stroke-width="2" fill="none"/>
  <path d="M60 182 Q104 222 148 182" stroke="var(--muted)" fill="none" stroke-dasharray="2 3"/>
  <g font-size="11" fill="var(--ink)" font-family="Inter, sans-serif" font-weight="600">
    <text x="190" y="66">${t('Upper')}</text><text x="190" y="122">${t('Middle')}</text><text x="190" y="186">${t('Lower')}</text>
  </g>
  <g font-size="8" fill="var(--muted)" font-family="Inter, sans-serif">
    <text x="190" y="78">${t('intellect')}</text><text x="190" y="134">${t('drive')}</text><text x="190" y="198">${t('stability')}</text>
  </g>
</svg>`;
