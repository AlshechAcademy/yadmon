// YADMON — compose.js
// Generative music (PLAN.md §10 "authored motifs + a seed so nothing loops
// stale"). Each theme has a FIXED authored foundation — scale, chord
// progression, bass + drum templates, tempo/key ranges — and a PROCEDURAL
// melody + arpeggio generated per phrase. Phrases regenerate continuously, so
// the tune never actually repeats; a daily seed gives each day its own key,
// tempo, and character. Original by construction (ruling #10).

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 9, 10],
};
const QUAL = { maj: [0, 4, 7], min: [0, 3, 7] };
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiToName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// deterministic RNG (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Authored foundations. prog entries = [semitones-from-key-root, quality].
const SPECS = {
  wake: {
    scale: "major", roots: [0, 2, 5, 7, 9], bpmRange: [66, 78],
    prog: [[0, "maj"], [5, "maj"], [7, "maj"], [9, "min"]], // I IV V vi
    density: 0.32, reg: [4, 5], leadDuty: 0.5, leadGain: 0.15, arpDuty: 0.25, arpGain: 0.06,
    bassGain: 0.22, drums: false,
  },
  focus: {
    scale: "minor", roots: [9, 7, 4, 2, 0], bpmRange: [126, 138],
    prog: [[0, "min"], [8, "maj"], [3, "maj"], [7, "maj"]], // i VI III VII
    density: 0.6, reg: [4, 5], leadDuty: 0.25, leadGain: 0.13, arpDuty: 0.5, arpGain: 0.09,
    bassGain: 0.24, drums: true,
  },
  free: {
    scale: "major", roots: [0, 5, 7, 2], bpmRange: [138, 150],
    prog: [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]], // I V vi IV
    density: 0.55, reg: [4, 5], leadDuty: 0.5, leadGain: 0.15, arpDuty: 0.25, arpGain: 0.07,
    bassGain: 0.24, drums: true,
  },
};
export const THEME_NAMES = Object.keys(SPECS);

const PHRASE = 64; // 4 bars × 16 steps

function chordPCs(keyPc, degSemi, q) { return QUAL[q].map((iv) => (keyPc + degSemi + iv) % 12); }

function genLead(spec, keyPc, prog, r) {
  const scalePCs = SCALES[spec.scale].map((iv) => (keyPc + iv) % 12);
  const pat = new Array(PHRASE).fill("-");
  let prev = 12 * (spec.reg[0] + 1) + keyPc; // start near key
  for (let s = 0; s < PHRASE; s++) {
    const [deg, q] = prog[Math.floor(s / 16) % prog.length];
    const strong = s % 4 === 0;
    const breath = s % 32 >= 29; // rest to phrase-end for breathing
    let p = strong ? 0.9 : spec.density;
    if (breath) p = 0.05;
    if (r() > p) continue;
    const pcSet = strong ? chordPCs(keyPc, deg, q) : scalePCs;
    const cands = [];
    for (let oct = spec.reg[0]; oct <= spec.reg[1]; oct++)
      for (const pc of pcSet) cands.push(12 * (oct + 1) + pc);
    cands.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
    const pick = cands[Math.floor(r() * Math.min(4, cands.length))];
    prev = pick; pat[s] = midiToName(pick);
  }
  return pat;
}

function genArp(spec, keyPc, prog, r) {
  const pat = new Array(PHRASE).fill("-");
  const every = spec.arpDuty === 0.5 ? 2 : 4; // busier for focus
  let i = 0;
  for (let s = 0; s < PHRASE; s++) {
    if (s % every !== 0) continue;
    const [deg, q] = prog[Math.floor(s / 16) % prog.length];
    const tones = QUAL[q];
    const iv = tones[i % tones.length]; i++;
    pat[s] = midiToName(12 * (spec.reg[0] + 1) + ((keyPc + deg + iv) % 12) - 12);
  }
  return pat;
}

function genBass(spec, keyPc, prog) {
  const pat = new Array(PHRASE).fill("-");
  for (let s = 0; s < PHRASE; s++) {
    const inBar = s % 16;
    const [deg] = prog[Math.floor(s / 16) % prog.length];
    const root = (keyPc + deg) % 12;
    if (inBar === 0 || inBar === 8) pat[s] = midiToName(12 * (2 + 1) + root);
    else if (inBar === 12) pat[s] = midiToName(12 * (2 + 1) + ((keyPc + deg + 7) % 12));
  }
  return pat;
}

function genDrums(r) {
  const pat = new Array(PHRASE).fill("-");
  for (let s = 0; s < PHRASE; s++) {
    const inBar = s % 16;
    if (inBar === 0 || inBar === 8 || inBar === 10) pat[s] = "K";
    else if (inBar === 4 || inBar === 12) pat[s] = "S";
    else if (inBar % 2 === 0) pat[s] = "H";
    if (Math.floor(s / 16) === 3 && inBar >= 12 && r() < 0.45) pat[s] = r() < 0.5 ? "S" : "K";
  }
  return pat;
}

// Build one fresh phrase. daySeed fixes key+tempo (stable per day); phraseIdx
// varies the melody so it evolves continuously.
export function generatePhrase(name, daySeed, phraseIdx) {
  const spec = SPECS[name];
  if (!spec) return null;
  const dr = rng((daySeed >>> 0) * 2654435761 >>> 0);
  const keyPc = spec.roots[Math.floor(dr() * spec.roots.length)];
  const bpm = Math.round(spec.bpmRange[0] + dr() * (spec.bpmRange[1] - spec.bpmRange[0]));
  const r = rng(((daySeed >>> 0) * 1000003) ^ ((phraseIdx * 2246822519) >>> 0));

  const tracks = [
    { voice: "pulse", duty: spec.leadDuty, gain: spec.leadGain, len: 0.9, pattern: genLead(spec, keyPc, spec.prog, r) },
    { voice: "pulse", duty: spec.arpDuty, gain: spec.arpGain, len: 0.55, pattern: genArp(spec, keyPc, spec.prog, r) },
    { voice: "tri", gain: spec.bassGain, len: 1, pattern: genBass(spec, keyPc, spec.prog) },
  ];
  if (spec.drums) tracks.push({ voice: "noise", gain: 0.16, pattern: genDrums(r) });
  return { bpm, steps: PHRASE, tracks };
}
