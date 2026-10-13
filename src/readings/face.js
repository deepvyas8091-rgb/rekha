// Deterministic face reading from MediaPipe Face Landmarker ratios.
// The face photo never leaves the device: only these ratios reach the server.
// GUARDRAILS: never comment on skin colour, attractiveness, ethnicity, age,
// health, intelligence or morality. Only traditional character themes.
// Thresholds marked TUNE need calibration on a diverse, consented sample.

/** Ratios from 478 Face Landmarker points (normalised x,y). */
export function faceGeometry(lm) {
  if (!Array.isArray(lm) || lm.length < 468) throw new Error('Expected 468+ face landmarks');
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const faceH = d(10, 152); // forehead top to chin
  const faceW = d(234, 454); // cheek to cheek
  const jawW = d(172, 397);
  const browY = (lm[105].y + lm[334].y) / 2;
  const noseBaseY = lm[2].y;
  const upper = browY - lm[10].y;
  const middle = noseBaseY - browY;
  const lower = lm[152].y - noseBaseY;
  const courts = upper + middle + lower;
  const eyeW = (d(33, 133) + d(362, 263)) / 2;
  return {
    widthToHeight: +(faceW / faceH).toFixed(3),
    jawToCheek: +(jawW / faceW).toFixed(3),
    upperCourt: +(upper / courts).toFixed(3),
    middleCourt: +(middle / courts).toFixed(3),
    lowerCourt: +(lower / courts).toFixed(3),
    eyeSpacing: +(d(133, 362) / eyeW).toFixed(3),
    noseWidth: +(d(129, 358) / faceW).toFixed(3),
    lipFullness: +((d(0, 17)) / faceH).toFixed(3),
    browLength: +(((d(70, 105) + d(300, 334)) / 2) / eyeW).toFixed(3),
  };
}

export function interpretFace(g) {
  const facts = [];
  // Face shape mapped to Chinese five-element face types (Mian Xiang).
  let shape;
  if (g.widthToHeight < 0.74) shape = ['Long', 'Wood', 'Growth-minded and principled; keeps learning and building.']; // TUNE
  else if (g.jawToCheek < 0.78) shape = ['Heart', 'Fire', 'Passionate and quick-thinking; brings energy to a room.'];
  else if (g.widthToHeight > 0.86 && g.jawToCheek > 0.9) shape = ['Square', 'Metal', 'Decisive and disciplined; values fairness and structure.'];
  else if (g.widthToHeight > 0.86) shape = ['Round', 'Water', 'Adaptable and sociable; good at reading people.'];
  else shape = ['Oval', 'Earth', 'Balanced and reliable; people trust your judgement.'];
  facts.push({ source: 'face shape', fact: `${shape[0]} face (${shape[1]} element)`, meaning: shape[2] });

  // Three courts (San Ting): upper = early life and intellect, middle = drive
  // and career years, lower = later life and stability.
  const courts = { upper: g.upperCourt, middle: g.middleCourt, lower: g.lowerCourt };
  const top = Object.entries(courts).sort((a, b) => b[1] - a[1])[0][0];
  const COURT = {
    upper: 'Upper court strongest: thoughtful planner; strong early learning and ideas.',
    middle: 'Middle court strongest: driven and ambitious; peak effort years bring results.',
    lower: 'Lower court strongest: patient builder; stability and comfort grow with time.',
  };
  if (Math.max(...Object.values(courts)) - Math.min(...Object.values(courts)) < 0.04) {
    facts.push({ source: 'three courts', fact: 'Balanced three courts', meaning: 'Steady fortune across all phases of life.' });
  } else facts.push({ source: 'three courts', fact: `${top} court strongest`, meaning: COURT[top] });

  if (g.eyeSpacing > 1.1) facts.push({ source: 'eyes', fact: 'Wide-set eyes', meaning: 'Big-picture thinker; tolerant and open to new views.' });
  else if (g.eyeSpacing < 0.9) facts.push({ source: 'eyes', fact: 'Close-set eyes', meaning: 'Focused and detail-oriented.' });

  if (g.browLength > 1.25) facts.push({ source: 'eyebrows', fact: 'Long eyebrows', meaning: 'Loyal to friends and family; values long relationships.' });

  if (g.noseWidth > 0.27) facts.push({ source: 'nose', fact: 'Broad nose bridge area', meaning: 'Traditionally linked with good money management.' });

  if (g.lipFullness > 0.12) facts.push({ source: 'lips', fact: 'Fuller lips', meaning: 'Generous and expressive.' });
  else if (g.lipFullness < 0.08) facts.push({ source: 'lips', fact: 'Thinner lips', meaning: 'Measured speaker; chooses words with care.' });

  return { faceType: shape[1], facts };
}

// Words the narration must never apply to a face reading.
export const FACE_BANNED_TOPICS = ['skin colour or tone', 'attractiveness or beauty ranking', 'ethnicity, caste or religion', 'age guess', 'health or illness', 'intelligence', 'criminality or honesty'];
