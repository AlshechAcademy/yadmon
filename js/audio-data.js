// YADMON — audio-data.js
// Original Game Boy–idiom compositions as tracker note arrays (PLAN.md §10).
// Steps are 16th notes; "-" = rest. voice: "pulse" | "tri" | "noise".
// noise symbols: K kick, S snare, H hat. All melodies are original — GB style,
// never actual Nintendo songs (ruling #10). Phase 5 = listen/veto/recompose.

// ---------- looping THEMES ----------
export const THEMES = {
  // WAKE — gentle ~72bpm sunrise lullaby (C major), sparse & warm
  wake: {
    bpm: 72, loop: true,
    tracks: [
      { voice: "pulse", duty: 0.5, gain: 0.16, len: 0.95, pattern: [
        "C4","-","-","-","E4","-","-","-","G4","-","-","-","A4","-","G4","-",
        "F4","-","-","-","A4","-","-","-","G4","-","-","-","E4","-","C4","-" ] },
      { voice: "pulse", duty: 0.25, gain: 0.07, len: 0.9, pattern: [
        "C3","E3","G3","E3","C3","E3","G3","E3","F3","A3","C4","A3","F3","A3","C4","A3",
        "F3","A3","C4","A3","F3","A3","C4","A3","G3","B3","D4","B3","G3","B3","D4","B3" ] },
      { voice: "tri", gain: 0.24, len: 1, pattern: [
        "C2","-","-","-","-","-","-","-","F2","-","-","-","-","-","-","-",
        "F2","-","-","-","-","-","-","-","G2","-","-","-","-","-","G2","-" ] },
    ],
  },

  // FOCUS — driving low-intensity arpeggio loop (A minor), ~132bpm. Seeded key.
  focus: {
    bpm: 132, loop: true,
    tracks: [
      { voice: "pulse", duty: 0.25, gain: 0.14, len: 0.85, pattern: [
        "A4","C5","E5","C5","A4","C5","E5","C5","G4","B4","D5","B4","G4","B4","D5","B4",
        "F4","A4","C5","A4","F4","A4","C5","A4","E4","G4","B4","G4","E4","G4","B4","G4" ] },
      { voice: "pulse", duty: 0.5, gain: 0.09, len: 0.6, pattern: [
        "A5","-","-","-","-","-","E5","-","-","-","-","-","D5","-","-","-",
        "C5","-","-","-","-","-","G5","-","-","-","-","-","B4","-","-","-" ] },
      { voice: "tri", gain: 0.24, len: 1, pattern: [
        "A2","-","A2","-","A2","-","-","-","G2","-","G2","-","G2","-","-","-",
        "F2","-","F2","-","F2","-","-","-","E2","-","E2","-","E2","-","G2","-" ] },
      { voice: "noise", gain: 0.16, pattern: [
        "K","-","-","-","H","-","S","-","K","-","K","-","H","-","S","-" ] },
    ],
  },

  // FREE — bouncy major-key energizer (C major), ~144bpm
  free: {
    bpm: 144, loop: true,
    tracks: [
      { voice: "pulse", duty: 0.5, gain: 0.16, len: 0.8, pattern: [
        "G4","-","G4","A4","G4","-","E4","-","C4","-","E4","G4","-","-","E4","-",
        "F4","-","F4","G4","A4","-","F4","-","G4","-","E4","-","C4","-","-","-" ] },
      { voice: "pulse", duty: 0.25, gain: 0.08, len: 0.5, pattern: [
        "C4","E4","G4","E4","C4","E4","G4","E4","F3","A3","C4","A3","F3","A3","C4","A3",
        "C4","E4","G4","E4","C4","E4","G4","E4","G3","B3","D4","B3","G3","B3","D4","B3" ] },
      { voice: "tri", gain: 0.24, len: 1, pattern: [
        "C2","-","-","-","G2","-","-","-","A2","-","-","-","F2","-","-","-",
        "C2","-","-","-","G2","-","-","-","F2","-","-","-","G2","-","G2","-" ] },
      { voice: "noise", gain: 0.16, pattern: [
        "K","-","H","-","S","-","H","-","K","-","H","K","S","-","H","-" ] },
    ],
  },
};

// ---------- one-shot SFX / jingles ----------
const tap = (note, duty = 0.5, gain = 0.22) => ({ bpm: 300, loop: false, tracks: [{ voice: "pulse", duty, gain, len: 0.7, pattern: [note] }] });

export const SFX = {
  // per care-button taps (each a distinct blip)
  tap_water:    tap("C5", 0.5),
  tap_fruit:    tap("E5", 0.5),
  tap_love:     tap("G5", 0.25),
  tap_walk:     tap("A4", 0.5),
  tap_play:     tap("D5", 0.25),
  tap_bath:     tap("F5", 0.5),
  tap_groom:    tap("B4", 0.25),
  tap_exercise: tap("C4", 0.5),
  tap_treats:   tap("E4", 0.5),
  tap_rest:     tap("A3", 0.5),

  confirm:   { bpm: 260, loop: false, tracks: [{ voice: "pulse", duty: 0.5, gain: 0.2, pattern: ["E5", "-", "G5"] }] },
  chirp:     { bpm: 300, loop: false, tracks: [{ voice: "pulse", duty: 0.25, gain: 0.18, pattern: ["A5", "C6"] }] },
  getReady:  { bpm: 240, loop: false, tracks: [{ voice: "pulse", duty: 0.5, gain: 0.18, pattern: ["E5", "-", "E5"] }] },
  blockStart:{ bpm: 200, loop: false, tracks: [{ voice: "pulse", duty: 0.5, gain: 0.2, pattern: ["C5", "E5", "G5"] }] },
  callTag:   { bpm: 260, loop: false, tracks: [{ voice: "pulse", duty: 0.25, gain: 0.18, pattern: ["G4", "C5"] }] },

  // celebration tiers 1→4 (escalating)
  celeb1: { bpm: 260, loop: false, tracks: [{ voice: "pulse", duty: 0.5, gain: 0.22, pattern: ["C5", "E5"] }] },
  celeb2: { bpm: 240, loop: false, tracks: [{ voice: "pulse", duty: 0.5, gain: 0.22, pattern: ["C5", "E5", "G5", "C6"] }] },
  celeb3: { bpm: 220, loop: false, tracks: [
    { voice: "pulse", duty: 0.5, gain: 0.22, pattern: ["G4", "C5", "E5", "G5", "C6", "-", "C6", "-"] },
    { voice: "tri", gain: 0.22, pattern: ["C3", "-", "E3", "-", "G3", "-", "C4", "-"] },
  ] },
  celeb4: { bpm: 200, loop: false, tracks: [
    { voice: "pulse", duty: 0.5, gain: 0.24, pattern: ["C5", "E5", "G5", "C6", "E6", "-", "C6", "-", "G5", "C6", "E6", "G6", "-", "-", "C6", "-"] },
    { voice: "pulse", duty: 0.25, gain: 0.12, pattern: ["E4", "G4", "C5", "G4", "E4", "G4", "C5", "G4", "G4", "C5", "E5", "C5", "G4", "C5", "E5", "C5"] },
    { voice: "tri", gain: 0.24, pattern: ["C3", "-", "-", "-", "G3", "-", "-", "-", "E3", "-", "-", "-", "C3", "-", "C3", "-"] },
    { voice: "noise", gain: 0.16, pattern: ["K", "-", "H", "-", "S", "-", "H", "-", "K", "-", "H", "K", "S", "-", "S", "-"] },
  ] },

  firstEver: { bpm: 240, loop: false, tracks: [
    { voice: "pulse", duty: 0.25, gain: 0.22, pattern: ["C5", "E5", "G5", "C6", "E5", "G5", "C6", "-"] },
    { voice: "pulse", duty: 0.5, gain: 0.10, pattern: ["C4", "-", "E4", "-", "G4", "-", "C5", "-"] },
  ] },

  disappoint: { bpm: 150, loop: false, tracks: [{ voice: "pulse", duty: 0.25, gain: 0.16, len: 1.4, pattern: ["E4", "D4", "C4", "-"] }] },
  neglect:    { bpm: 120, loop: false, tracks: [
    { voice: "pulse", duty: 0.125, gain: 0.14, len: 1.6, pattern: ["C4", "-", "F#3", "-"] },
    { voice: "noise", gain: 0.10, pattern: ["S", "-", "-", "-"] },
  ] },

  evolve: { bpm: 176, loop: false, tracks: [
    { voice: "pulse", duty: 0.5, gain: 0.22, pattern: ["C4", "E4", "G4", "C5", "E5", "G5", "C6", "-", "G5", "C6", "E6", "-", "C6", "-", "-", "-"] },
    { voice: "pulse", duty: 0.25, gain: 0.11, pattern: ["C3", "E3", "G3", "C4", "E4", "G4", "C5", "-", "E4", "G4", "C5", "-", "E5", "-", "-", "-"] },
    { voice: "tri", gain: 0.24, pattern: ["C2", "-", "-", "-", "G2", "-", "-", "-", "C3", "-", "-", "-", "C3", "-", "-", "-"] },
  ] },

  death: { bpm: 88, loop: false, tracks: [
    { voice: "pulse", duty: 0.25, gain: 0.16, len: 1.6, pattern: ["A3", "-", "-", "G3", "-", "-", "F3", "-", "-", "E3", "-", "-", "A2", "-", "-", "-"] },
    { voice: "tri", gain: 0.22, len: 1.6, pattern: ["A2", "-", "-", "-", "-", "-", "F2", "-", "-", "-", "-", "-", "E2", "-", "-", "-"] },
  ] },
};

export default { THEMES, SFX };
