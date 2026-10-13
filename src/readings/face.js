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

const ELEMENT = {
  Wood: 'Growth-minded and principled; keeps learning and building.',
  Fire: 'Passionate and quick-thinking; brings energy to a room.',
  Metal: 'Decisive and disciplined; values fairness and structure.',
  Water: 'Adaptable and sociable; good at reading people.',
  Earth: 'Balanced and reliable; people trust your judgement.',
};

export function interpretFace(g) {
  const facts = [];
  // Face shape mapped to Chinese five-element face types (Mian Xiang).
  let shape;
  if (g.widthToHeight < 0.74) shape = ['Long', 'Wood']; // TUNE
  else if (g.jawToCheek < 0.78) shape = ['Heart-shaped', 'Fire'];
  else if (g.widthToHeight > 0.86 && g.jawToCheek > 0.9) shape = ['Square', 'Metal'];
  else if (g.widthToHeight > 0.86) shape = ['Round', 'Water'];
  else shape = ['Oval', 'Earth'];
  facts.push({ group: 'Face type', source: 'Overall face shape', fact: `${shape[0]} face, ${shape[1]} element`, meaning: ELEMENT[shape[1]] });

  // Three courts (San Ting): upper = early life and intellect, middle = drive
  // and career years, lower = later life and stability.
  const courts = { upper: g.upperCourt, middle: g.middleCourt, lower: g.lowerCourt };
  const spread = Math.max(...Object.values(courts)) - Math.min(...Object.values(courts));
  const top = Object.entries(courts).sort((a, b) => b[1] - a[1])[0][0];
  const COURT = {
    upper: ['Upper court (hairline to eyebrows) is strongest', 'Thoughtful planner; strong early learning and ideas. Traditionally linked to the years up to about 30.'],
    middle: ['Middle court (eyebrows to nose tip) is strongest', 'Driven and ambitious; effort in the working years brings results. Traditionally linked to about 31 to 50.'],
    lower: ['Lower court (nose tip to chin) is strongest', 'Patient builder; stability and comfort grow with time. Traditionally linked to 51 and later.'],
  };
  if (spread < 0.04) facts.push({ group: 'Three courts (San Ting)', source: 'Forehead, mid-face and lower face', fact: 'Evenly balanced', meaning: 'Steady fortune across all phases of life.' });
  else facts.push({ group: 'Three courts (San Ting)', source: 'Forehead, mid-face and lower face', fact: COURT[top][0], meaning: COURT[top][1] });

  if (g.eyeSpacing > 1.1) facts.push({ group: 'Features', source: 'Eyes', fact: 'Wide-set', meaning: 'Big-picture thinker; tolerant and open to new views.' });
  else if (g.eyeSpacing < 0.9) facts.push({ group: 'Features', source: 'Eyes', fact: 'Close-set', meaning: 'Focused and detail-oriented.' });
  else facts.push({ group: 'Features', source: 'Eyes', fact: 'Evenly spaced', meaning: 'Balances detail with the bigger picture.' });

  if (g.browLength > 1.25) facts.push({ group: 'Features', source: 'Eyebrows', fact: 'Long', meaning: 'Loyal to friends and family; values long relationships.' });
  else facts.push({ group: 'Features', source: 'Eyebrows', fact: 'Medium length', meaning: 'Selective with close friends; quality over quantity.' });

  if (g.noseWidth > 0.27) facts.push({ group: 'Features', source: 'Nose', fact: 'Broad base', meaning: 'Traditionally linked with good money management and saving.' });
  else facts.push({ group: 'Features', source: 'Nose', fact: 'Narrow base', meaning: 'Traditionally linked with careful, considered spending.' });

  if (g.lipFullness > 0.12) facts.push({ group: 'Features', source: 'Lips', fact: 'Fuller', meaning: 'Generous and expressive.' });
  else if (g.lipFullness < 0.08) facts.push({ group: 'Features', source: 'Lips', fact: 'Thinner', meaning: 'Measured speaker; chooses words with care.' });
  else facts.push({ group: 'Features', source: 'Lips', fact: 'Medium', meaning: 'Speaks openly but thinks first.' });

  if (g.jawToCheek > 0.9) facts.push({ group: 'Features', source: 'Jaw and chin', fact: 'Strong, wide jaw', meaning: 'Determined and steady; finishes what is started.' });
  else if (g.jawToCheek < 0.8) facts.push({ group: 'Features', source: 'Jaw and chin', fact: 'Tapered jaw', meaning: 'Diplomatic and flexible; adapts to people easily.' });

  return { faceType: shape[1], facts };
}

// Words the narration must never apply to a face reading.
export const FACE_BANNED_TOPICS = ['skin colour or tone', 'attractiveness or beauty ranking', 'ethnicity, caste or religion', 'age guess', 'health or illness', 'intelligence', 'criminality or honesty'];
