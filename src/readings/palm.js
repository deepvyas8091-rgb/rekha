// Deterministic palm interpretation. Geometry comes from on-device MediaPipe
// hand landmarks; line facts come from the vision model as structured JSON.
// The AI only writes prose from these facts, so the same palm reads the same way.
// Thresholds marked TUNE should be calibrated on real labelled scans.

export const LINE_SCHEMA = {
  type: 'object',
  properties: {
    photoQuality: { type: 'string', enum: ['good', 'usable', 'poor'], description: 'Can the major lines be seen clearly?' },
    isPalm: { type: 'boolean', description: 'True only if the image shows the inside of a human hand' },
    hand: { type: 'string', enum: ['left', 'right', 'unknown'] },
    lines: {
      type: 'object',
      properties: Object.fromEntries(['heart', 'head', 'life', 'fate', 'sun'].map((l) => [l, {
        type: 'object',
        properties: {
          present: { type: 'boolean' },
          length: { type: 'string', enum: ['short', 'medium', 'long'] },
          depth: { type: 'string', enum: ['faint', 'clear', 'deep'] },
          shape: { type: 'string', enum: ['straight', 'gently curved', 'strongly curved', 'wavy'] },
          breaks: { type: 'boolean' },
          forkAtEnd: { type: 'boolean' },
          islands: { type: 'boolean' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['present', 'confidence'],
      }])),
      required: ['heart', 'head', 'life'],
    },
    headLifeJoinedAtStart: { type: 'boolean' },
    heartLineEndsUnder: { type: 'string', enum: ['index', 'between index and middle', 'middle', 'unclear'] },
    mounts: {
      type: 'object',
      description: 'Fleshy pads of the palm. Rate each only if the photo angle and light let you judge it; otherwise "unclear".',
      properties: Object.fromEntries(['jupiter', 'saturn', 'sun', 'mercury', 'venus', 'moon', 'mars'].map((m) => [m, {
        type: 'string', enum: ['flat', 'normal', 'prominent', 'unclear'],
      }])),
    },
    marriageLines: { type: 'integer', minimum: 0, maximum: 5 },
    marks: { type: 'array', items: { type: 'string', enum: ['star', 'cross', 'triangle', 'square', 'island', 'mystic cross', 'simian line'] } },
    notes: { type: 'string', description: 'One short neutral sentence about anything unusual. No health claims.' },
  },
  required: ['photoQuality', 'isPalm', 'lines'],
};

/** Geometry features from 21 MediaPipe hand landmarks (normalised x,y). */
export function palmGeometry(lm) {
  if (!Array.isArray(lm) || lm.length !== 21) throw new Error('Expected 21 hand landmarks');
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const palmLen = d(0, 9);
  const palmWidth = d(5, 17);
  const finger = (mcp, tip) => d(mcp, tip);
  // Project onto the wrist -> middle-knuckle axis to compare finger heights.
  const ax = { x: (lm[9].x - lm[0].x) / palmLen, y: (lm[9].y - lm[0].y) / palmLen };
  const proj = (i) => (lm[i].x - lm[0].x) * ax.x + (lm[i].y - lm[0].y) * ax.y;
  return {
    palmShapeRatio: +(palmLen / palmWidth).toFixed(3),
    fingerToPalm: +(finger(9, 12) / palmLen).toFixed(3),
    indexToRing: +(finger(5, 8) / finger(13, 16)).toFixed(3),
    thumbToIndex: +(finger(2, 4) / finger(5, 8)).toFixed(3),
    pinkyReach: +((proj(20) - proj(15)) / palmLen).toFixed(3),
  };
}

export function interpretGeometry(g) {
  const longPalm = g.palmShapeRatio > 1.12; // TUNE
  const longFingers = g.fingerToPalm > 0.82; // TUNE
  const type = longPalm
    ? (longFingers ? 'Water' : 'Fire')
    : (longFingers ? 'Air' : 'Earth');
  const HAND = {
    Earth: 'Practical, steady and dependable; prefers working with tangible results.',
    Air: 'Curious, analytical and communicative; energised by ideas and conversation.',
    Fire: 'Energetic, bold and action-oriented; likes to lead and start new things.',
    Water: 'Intuitive, sensitive and imaginative; reads people and moods easily.',
  };
  const facts = [{ group: 'Hand shape', source: 'hand shape', fact: `${type} hand`, meaning: HAND[type] }];

  if (g.indexToRing > 1.03) facts.push({ group: 'Fingers', source: 'index vs ring finger', fact: 'Index finger longer (Jupiter)', meaning: 'Natural confidence and leadership drive; likes to set direction.' });
  else if (g.indexToRing < 0.97) facts.push({ group: 'Fingers', source: 'index vs ring finger', fact: 'Ring finger longer (Apollo)', meaning: 'Creative, comfortable taking risks, values recognition.' });
  else facts.push({ group: 'Fingers', source: 'index vs ring finger', fact: 'Index and ring balanced', meaning: 'Balances ambition with harmony in relationships.' });

  if (g.pinkyReach > 0.02) facts.push({ group: 'Fingers', source: 'little finger', fact: 'Little finger reaches past the ring finger top joint (Mercury)', meaning: 'Persuasive communicator; good at negotiation and business talk.' });
  else if (g.pinkyReach < -0.05) facts.push({ group: 'Fingers', source: 'little finger', fact: 'Shorter little finger', meaning: 'Prefers actions over words; may hold back in big groups.' });

  if (g.thumbToIndex > 0.85) facts.push({ group: 'Fingers', source: 'thumb', fact: 'Long thumb', meaning: 'Strong willpower and logic; finishes what is started.' });
  else if (g.thumbToIndex < 0.7) facts.push({ group: 'Fingers', source: 'thumb', fact: 'Shorter thumb', meaning: 'Flexible and adaptable; guided more by feeling than plan.' });

  return { handType: type, facts };
}

const LINE_MEANING = {
  heart: {
    long: 'Open-hearted and expressive in relationships.',
    medium: 'Balanced in love: affectionate, with healthy boundaries.',
    short: 'Practical about love; shows care through actions more than words.',
    'strongly curved': 'Warm and emotionally generous.',
    'gently curved': 'Affectionate but sensible; feelings and thinking work together.',
    straight: 'Thoughtful and steady with feelings.',
    deep: 'Feelings run deep and loyalty is strong.',
    faint: 'Keeps feelings private; trust is earned slowly.',
    forkAtEnd: 'Forked end: can see both sides in relationships; a natural peacemaker.',
  },
  head: {
    long: 'Thorough thinker who weighs options carefully.',
    medium: 'Clear, practical thinker who decides at a sensible pace.',
    short: 'Quick, decisive and direct.',
    straight: 'Logical and structured in thinking.',
    'gently curved': 'Balances logic with imagination.',
    'strongly curved': 'Imaginative and creative in thinking.',
    deep: 'Strong concentration and memory.',
    faint: 'Mind works best with variety; benefits from writing plans down.',
    forkAtEnd: '"Writer\'s fork": sees several sides of a problem.',
  },
  life: {
    long: 'Long, clear life line: steady energy and resilience (it does not measure lifespan).',
    'strongly curved': 'Lively energy and enthusiasm for life.',
    'gently curved': 'Even, sustainable energy; pace matters more than bursts.',
    straight: 'Cautious and measured with energy and people.',
    deep: 'Strong vitality and stamina.',
    faint: 'Energy rises and falls; benefits from routine and rest.',
  },
  fate: {
    present: 'A clear sense of direction and purpose in career.',
    absent: 'Self-made path; career shaped by choice rather than duty.',
  },
  sun: {
    present: 'Potential for recognition, creativity and public appreciation.',
    absent: 'Success comes through steady work rather than public recognition, which is common.',
  },
};
const LINE_NAME = { heart: 'Heart line (Hriday rekha)', head: 'Head line (Mastishk rekha)', life: 'Life line (Jeevan rekha)', fate: 'Fate line (Bhagya rekha)', sun: 'Sun line (Surya rekha)' };

// Mounts (parvat): traditional meanings when prominent or flat.
const MOUNT = {
  jupiter: { name: 'Mount of Jupiter (Guru parvat), below the index finger', prominent: 'Ambition, leadership and self-confidence; enjoys guiding others.', flat: 'Prefers to support rather than lead; modest about achievements.' },
  saturn: { name: 'Mount of Saturn (Shani parvat), below the middle finger', prominent: 'Serious, responsible and wise; values time alone to think.', flat: 'Easy-going; may need help with long-term planning.' },
  sun: { name: 'Mount of the Sun (Surya parvat), below the ring finger', prominent: 'Creativity, charm and a love of beauty; enjoys being appreciated.', flat: 'Prefers a quieter life away from the spotlight.' },
  mercury: { name: 'Mount of Mercury (Budh parvat), below the little finger', prominent: 'Quick wit, good with words, numbers and business.', flat: 'Thinks before speaking; more reserved in deal-making.' },
  venus: { name: 'Mount of Venus (Shukra parvat), at the base of the thumb', prominent: 'Warm, affectionate and full of life; loves good food, music and company.', flat: 'Calm and self-contained; shows love through loyalty more than display.' },
  moon: { name: 'Mount of the Moon (Chandra parvat), at the outer base of the palm', prominent: 'Imaginative, intuitive and drawn to travel and stories.', flat: 'Practical and grounded; trusts facts over hunches.' },
  mars: { name: 'Mounts of Mars (Mangal parvat), middle edges of the palm', prominent: 'Courage and drive; stands firm under pressure.', flat: 'Avoids conflict; prefers to solve things calmly.' },
};

const MARKS = {
  'mystic cross': 'Traditionally linked with intuition and spiritual interest.',
  star: 'Traditionally a sign of a sudden opportunity or success in that area.',
  triangle: 'Traditionally a sign of skill and clear thinking in that area.',
  square: 'Traditionally a "protection" mark: help arrives in difficult times.',
  cross: 'Traditionally a sign of a decision point or change.',
  island: 'A period where energy in that area was divided; usually passes.',
  'simian line': 'Single crease (heart and head joined): intense focus; thinking and feeling move together.',
};

export function interpretLines(v) {
  const facts = [];
  const notVisible = [];
  if (!v || !v.isPalm) return { facts, notVisible, warning: 'No palm detected in the photo.' };
  for (const [name, l] of Object.entries(v.lines || {})) {
    const label = LINE_NAME[name] || `${name} line`;
    if (!l || (l.confidence ?? 0) < 0.4) { notVisible.push(label); continue; } // do not read what we cannot see
    const M = LINE_MEANING[name] || {};
    if (name === 'fate' || name === 'sun') {
      const m = l.present ? M.present : M.absent;
      if (m) facts.push({ group: 'Major lines', source: label, fact: l.present ? 'Visible' : 'No clear line', meaning: m });
      continue;
    }
    if (!l.present) { notVisible.push(label); continue; }
    for (const key of [l.length, l.shape, l.depth, l.forkAtEnd ? 'forkAtEnd' : null]) {
      if (key && M[key]) facts.push({ group: 'Major lines', source: label, fact: key === 'forkAtEnd' ? 'Forked end' : key[0].toUpperCase() + key.slice(1), meaning: M[key] });
    }
    if (l.breaks) facts.push({ group: 'Major lines', source: label, fact: 'Has a break', meaning: 'A turning point or change of direction in this area of life.' });
  }
  if (v.headLifeJoinedAtStart === false) facts.push({ group: 'Major lines', source: 'Head and life lines', fact: 'Separated at the start', meaning: 'Independent; made own decisions early.' });
  if (v.headLifeJoinedAtStart === true) facts.push({ group: 'Major lines', source: 'Head and life lines', fact: 'Joined at the start', meaning: 'Thoughtful and careful; values family advice before big steps.' });
  const endHeart = { index: 'Ideals in love: looks for a partner to admire.', 'between index and middle': 'Balanced in love: warm and realistic.', middle: 'Practical in love; values actions over words.' }[v.heartLineEndsUnder];
  if (endHeart) facts.push({ group: 'Major lines', source: LINE_NAME.heart, fact: `Ends below the ${v.heartLineEndsUnder} finger${v.heartLineEndsUnder.startsWith('between') ? 's' : ''}`, meaning: endHeart });

  for (const [m, level] of Object.entries(v.mounts || {})) {
    const M = MOUNT[m];
    if (!M || level === 'unclear' || level === 'normal' || !M[level]) continue;
    facts.push({ group: 'Mounts', source: M.name, fact: level === 'prominent' ? 'Prominent' : 'Flat', meaning: M[level] });
  }
  const normalMounts = Object.entries(v.mounts || {}).filter(([, l]) => l === 'normal').map(([m]) => MOUNT[m]?.name.split(' (')[0]).filter(Boolean);
  if (normalMounts.length) facts.push({ group: 'Mounts', source: 'Other mounts', fact: 'Balanced', meaning: `${normalMounts.join(', ')}: evenly developed, so these qualities stay in balance.` });

  if (Number.isInteger(v.marriageLines)) {
    const ml = v.marriageLines;
    facts.push({
      group: 'Relationship lines',
      source: 'Relationship lines (Vivah rekha), edge of the palm below the little finger',
      fact: ml === 0 ? 'None clearly visible' : `${ml} line${ml > 1 ? 's' : ''}`,
      meaning: ml === 0 ? 'Bonds tend to grow slowly out of friendship and shared values.'
        : ml === 1 ? 'One deep, lasting bond is the main theme.'
          : 'Several meaningful bonds or strong attachments; the clearest line shows the most important one.',
    });
  }
  for (const mark of v.marks || []) {
    if (MARKS[mark]) facts.push({ group: 'Special marks', source: 'Marks', fact: mark[0].toUpperCase() + mark.slice(1), meaning: MARKS[mark] });
  }
  return { facts, notVisible, photoQuality: v.photoQuality, hand: v.hand };
}
