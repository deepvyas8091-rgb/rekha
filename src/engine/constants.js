// Shared reference tables for the Vedic, Chinese, Thai and Western engines.
// Every table here is traditional data. Items marked VERIFY should be reviewed
// by the astrology consultant before launch, because published sources differ.

export const RASHI = [
  { en: 'Aries', sa: 'Mesha', hi: 'मेष', lord: 'Mars' },
  { en: 'Taurus', sa: 'Vrishabha', hi: 'वृषभ', lord: 'Venus' },
  { en: 'Gemini', sa: 'Mithuna', hi: 'मिथुन', lord: 'Mercury' },
  { en: 'Cancer', sa: 'Karka', hi: 'कर्क', lord: 'Moon' },
  { en: 'Leo', sa: 'Simha', hi: 'सिंह', lord: 'Sun' },
  { en: 'Virgo', sa: 'Kanya', hi: 'कन्या', lord: 'Mercury' },
  { en: 'Libra', sa: 'Tula', hi: 'तुला', lord: 'Venus' },
  { en: 'Scorpio', sa: 'Vrishchika', hi: 'वृश्चिक', lord: 'Mars' },
  { en: 'Sagittarius', sa: 'Dhanu', hi: 'धनु', lord: 'Jupiter' },
  { en: 'Capricorn', sa: 'Makara', hi: 'मकर', lord: 'Saturn' },
  { en: 'Aquarius', sa: 'Kumbha', hi: 'कुंभ', lord: 'Saturn' },
  { en: 'Pisces', sa: 'Meena', hi: 'मीन', lord: 'Jupiter' },
];

// lord = Vimshottari dasha lord. gana / yoni used by Gun Milan.
export const NAKSHATRA = [
  { name: 'Ashwini', lord: 'Ketu', gana: 'Deva', yoni: 'Horse' },
  { name: 'Bharani', lord: 'Venus', gana: 'Manushya', yoni: 'Elephant' },
  { name: 'Krittika', lord: 'Sun', gana: 'Rakshasa', yoni: 'Sheep' },
  { name: 'Rohini', lord: 'Moon', gana: 'Manushya', yoni: 'Serpent' },
  { name: 'Mrigashira', lord: 'Mars', gana: 'Deva', yoni: 'Serpent' },
  { name: 'Ardra', lord: 'Rahu', gana: 'Manushya', yoni: 'Dog' },
  { name: 'Punarvasu', lord: 'Jupiter', gana: 'Deva', yoni: 'Cat' },
  { name: 'Pushya', lord: 'Saturn', gana: 'Deva', yoni: 'Sheep' },
  { name: 'Ashlesha', lord: 'Mercury', gana: 'Rakshasa', yoni: 'Cat' },
  { name: 'Magha', lord: 'Ketu', gana: 'Rakshasa', yoni: 'Rat' },
  { name: 'Purva Phalguni', lord: 'Venus', gana: 'Manushya', yoni: 'Rat' },
  { name: 'Uttara Phalguni', lord: 'Sun', gana: 'Manushya', yoni: 'Cow' },
  { name: 'Hasta', lord: 'Moon', gana: 'Deva', yoni: 'Buffalo' },
  { name: 'Chitra', lord: 'Mars', gana: 'Rakshasa', yoni: 'Tiger' },
  { name: 'Swati', lord: 'Rahu', gana: 'Deva', yoni: 'Buffalo' },
  { name: 'Vishakha', lord: 'Jupiter', gana: 'Rakshasa', yoni: 'Tiger' },
  { name: 'Anuradha', lord: 'Saturn', gana: 'Deva', yoni: 'Deer' },
  { name: 'Jyeshtha', lord: 'Mercury', gana: 'Rakshasa', yoni: 'Deer' },
  { name: 'Mula', lord: 'Ketu', gana: 'Rakshasa', yoni: 'Dog' },
  { name: 'Purva Ashadha', lord: 'Venus', gana: 'Manushya', yoni: 'Monkey' },
  { name: 'Uttara Ashadha', lord: 'Sun', gana: 'Manushya', yoni: 'Mongoose' },
  { name: 'Shravana', lord: 'Moon', gana: 'Deva', yoni: 'Monkey' },
  { name: 'Dhanishta', lord: 'Mars', gana: 'Rakshasa', yoni: 'Lion' },
  { name: 'Shatabhisha', lord: 'Rahu', gana: 'Rakshasa', yoni: 'Horse' },
  { name: 'Purva Bhadrapada', lord: 'Jupiter', gana: 'Manushya', yoni: 'Lion' },
  { name: 'Uttara Bhadrapada', lord: 'Saturn', gana: 'Manushya', yoni: 'Cow' },
  { name: 'Revati', lord: 'Mercury', gana: 'Deva', yoni: 'Elephant' },
];

export const TITHI = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami',
  'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];

export const YOGA = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma',
  'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra',
  'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha',
  'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];
// Yogas traditionally avoided for new work.
export const INAUSPICIOUS_YOGA = new Set(['Vishkambha', 'Atiganda', 'Shula', 'Ganda', 'Vyaghata', 'Vajra', 'Vyatipata', 'Parigha', 'Vaidhriti']);

export const KARANA_MOVABLE = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'];

export const MASA = [
  'Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada',
  'Ashwin', 'Kartik', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna',
];

export const VARA = [
  { en: 'Sunday', sa: 'Ravivara', lord: 'Sun' },
  { en: 'Monday', sa: 'Somavara', lord: 'Moon' },
  { en: 'Tuesday', sa: 'Mangalavara', lord: 'Mars' },
  { en: 'Wednesday', sa: 'Budhavara', lord: 'Mercury' },
  { en: 'Thursday', sa: 'Guruvara', lord: 'Jupiter' },
  { en: 'Friday', sa: 'Shukravara', lord: 'Venus' },
  { en: 'Saturday', sa: 'Shanivara', lord: 'Saturn' },
];

// Choghadiya cycle. Day sequence advances +1, night sequence advances -2 (mod 7).
export const CHOGHADIYA = [
  { name: 'Udveg', lord: 'Sun', quality: 'bad', use: 'Government or official work only' },
  { name: 'Char', lord: 'Venus', quality: 'neutral', use: 'Travel, movement' },
  { name: 'Labh', lord: 'Mercury', quality: 'good', use: 'Business, trade, education' },
  { name: 'Amrit', lord: 'Moon', quality: 'best', use: 'All auspicious work' },
  { name: 'Kaal', lord: 'Saturn', quality: 'bad', use: 'Avoid new beginnings' },
  { name: 'Shubh', lord: 'Jupiter', quality: 'good', use: 'Ceremonies, marriage, worship' },
  { name: 'Rog', lord: 'Mars', quality: 'bad', use: 'Avoid; disputes and illness' },
];
// Index into CHOGHADIYA of the first segment, by weekday (0 = Sunday).
export const CHOGHADIYA_DAY_START = [0, 3, 6, 2, 5, 1, 4];
export const CHOGHADIYA_NIGHT_START = [5, 1, 4, 0, 3, 6, 2];

// 1-based segment (of 8 equal day segments) by weekday, Sunday first.
export const RAHU_KAAL_SEG = [8, 2, 7, 5, 6, 4, 3];
export const YAMAGANDA_SEG = [5, 4, 3, 2, 1, 7, 6];
export const GULIKA_SEG = [7, 6, 5, 4, 3, 2, 1];

// Dur Muhurtam: 1-based day muhurta (of 15). Night entries flagged. VERIFY.
export const DUR_MUHURTAM = [
  [{ part: 'day', n: 14 }],
  [{ part: 'day', n: 9 }, { part: 'day', n: 12 }],
  [{ part: 'day', n: 4 }, { part: 'night', n: 7 }],
  [{ part: 'day', n: 8 }],
  [{ part: 'day', n: 6 }, { part: 'day', n: 12 }],
  [{ part: 'day', n: 4 }, { part: 'day', n: 9 }],
  [{ part: 'day', n: 1 }, { part: 'day', n: 2 }],
];

// Chaldean order used for Hora.
export const HORA_ORDER = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
export const HORA_USE = {
  Sun: { quality: 'neutral', use: 'Government work, meeting authority, health' },
  Moon: { quality: 'good', use: 'Travel, meeting people, home matters' },
  Mars: { quality: 'bad', use: 'Sports, property disputes; avoid agreements' },
  Mercury: { quality: 'good', use: 'Trade, writing, learning, communication' },
  Jupiter: { quality: 'good', use: 'Ceremonies, finance, teaching, marriage talks' },
  Venus: { quality: 'good', use: 'Romance, shopping, arts, new clothes' },
  Saturn: { quality: 'bad', use: 'Labour, repairs; avoid new starts' },
};

export const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
export const DASHA_YEARS = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };

// Naisargika (natural) friendships, used by Graha Maitri.
export const PLANET_FRIENDS = {
  Sun: { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon: { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars: { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus: { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn: { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
};

// Tarabalam names (count from birth nakshatra, mod 9).
export const TARA = [
  { name: 'Janma', quality: 'mixed' },
  { name: 'Sampat', quality: 'good' },
  { name: 'Vipat', quality: 'bad' },
  { name: 'Kshema', quality: 'good' },
  { name: 'Pratyari', quality: 'bad' },
  { name: 'Sadhana', quality: 'good' },
  { name: 'Naidhana', quality: 'bad' },
  { name: 'Mitra', quality: 'good' },
  { name: 'Param Mitra', quality: 'good' },
];

// Chandrabalam: transit Moon house from natal Moon sign that is favourable.
export const CHANDRABALAM_GOOD = new Set([1, 3, 6, 7, 10, 11]);
