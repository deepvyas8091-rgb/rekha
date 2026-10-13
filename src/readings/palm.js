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
  const facts = [{ source: 'hand shape', fact: `${type} hand`, meaning: HAND[type] }];

  if (g.indexToRing > 1.03) facts.push({ source: 'index vs ring finger', fact: 'Index finger longer (Jupiter)', meaning: 'Natural confidence and leadership drive; likes to set direction.' });
  else if (g.indexToRing < 0.97) facts.push({ source: 'index vs ring finger', fact: 'Ring finger longer (Apollo)', meaning: 'Creative, comfortable taking risks, values recognition.' });
  else facts.push({ source: 'index vs ring finger', fact: 'Index and ring balanced', meaning: 'Balances ambition with harmony in relationships.' });

  if (g.pinkyReach > 0.02) facts.push({ source: 'little finger', fact: 'Little finger reaches past the ring finger top joint (Mercury)', meaning: 'Persuasive communicator; good at negotiation and business talk.' });
  else if (g.pinkyReach < -0.05) facts.push({ source: 'little finger', fact: 'Shorter little finger', meaning: 'Prefers actions over words; may hold back in big groups.' });

  if (g.thumbToIndex > 0.85) facts.push({ source: 'thumb', fact: 'Long thumb', meaning: 'Strong willpower and logic; finishes what is started.' });
  else if (g.thumbToIndex < 0.7) facts.push({ source: 'thumb', fact: 'Shorter thumb', meaning: 'Flexible and adaptable; guided more by feeling than plan.' });

  return { handType: type, facts };
}

const LINE_MEANING = {
  heart: {
    long: 'Open-hearted and expressive in relationships.',
    short: 'Practical about love; shows care through actions.',
    'strongly curved': 'Warm and emotionally generous.',
    straight: 'Thoughtful and steady with feelings.',
  },
  head: {
    long: 'Thorough thinker who weighs options carefully.',
    short: 'Quick, decisive and direct.',
    straight: 'Logical and structured in thinking.',
    'strongly curved': 'Imaginative and creative in thinking.',
    forkAtEnd: '"Writer\'s fork": sees several sides of a problem.',
  },
  life: {
    'strongly curved': 'Lively energy and enthusiasm for life.',
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
  },
};

export function interpretLines(v) {
  const facts = [];
  if (!v || !v.isPalm) return { facts, warning: 'No palm detected in the photo.' };
  for (const [name, l] of Object.entries(v.lines || {})) {
    if (!l || (l.confidence ?? 0) < 0.4) continue; // do not read what we cannot see
    const M = LINE_MEANING[name] || {};
    if (name === 'fate' || name === 'sun') {
      const m = l.present ? M.present : M.absent;
      if (m) facts.push({ source: `${name} line`, fact: l.present ? `${name} line visible` : `no clear ${name} line`, meaning: m });
      continue;
    }
    if (!l.present) continue;
    for (const key of [l.length, l.shape, l.depth, l.forkAtEnd ? 'forkAtEnd' : null]) {
      if (key && M[key]) facts.push({ source: `${name} line`, fact: `${name} line: ${key === 'forkAtEnd' ? 'forked end' : key}`, meaning: M[key] });
    }
    if (l.breaks) facts.push({ source: `${name} line`, fact: `${name} line has a break`, meaning: 'A turning point or change of direction in this area of life.' });
  }
  if (v.headLifeJoinedAtStart === false) facts.push({ source: 'head and life lines', fact: 'Separated at start', meaning: 'Independent; made own decisions early.' });
  if (v.marks?.includes('mystic cross')) facts.push({ source: 'marks', fact: 'Mystic cross', meaning: 'Traditionally linked with intuition and spiritual interest.' });
  if (v.marks?.includes('star')) facts.push({ source: 'marks', fact: 'Star mark', meaning: 'Traditionally a sign of a sudden opportunity or success.' });
  if (v.marks?.includes('simian line')) facts.push({ source: 'marks', fact: 'Single crease (heart and head joined)', meaning: 'Intense focus; thinking and feeling move together.' });
  return { facts, photoQuality: v.photoQuality };
}
