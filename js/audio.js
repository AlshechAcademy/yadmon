// YADMON — audio.js
// Game Boy–class synth engine (PLAN.md §10). Four classic voices: pulse ×2
// (duty-cycle waves), triangle, and noise, driven by tracker-style note arrays
// from audio-data.js. Lookahead scheduler for tight timing. Master volume/mute.
// Audio unlocks on the first user gesture (browser autoplay policy). Original
// compositions only — style, never songs (ruling #10).

import { THEMES, SFX } from "./audio-data.js";

let ctx = null;
let master = null;
let muted = false;
let volume = 0.5;

const pulseWaves = {}; // duty -> PeriodicWave
let noiseBuffer = null;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  // pre-build duty waves
  for (const d of [0.125, 0.25, 0.5, 0.75]) pulseWaves[d] = makePulse(d);
  // white noise buffer
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function makePulse(duty, n = 24) {
  const real = new Float32Array(n), imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty);
  return ctx.createPeriodicWave(real, imag);
}

// --- unlock + master --------------------------------------------------------
export function unlock() {
  ensureCtx();
  if (ctx.state === "suspended") ctx.resume();
}
export function setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master && !muted) master.gain.value = volume; }
export function getVolume() { return volume; }
export function setMuted(m) { muted = m; if (master) master.gain.value = muted ? 0 : volume; }
export function isMuted() { return muted; }
export function toggleMute() { setMuted(!muted); return muted; }

// --- note helpers -----------------------------------------------------------
const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
function freq(name, transpose = 0) {
  if (!name || name === "-" || name === ".") return null;
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) return null;
  const midi = NOTE[m[1]] + (Number(m[2]) + 1) * 12 + transpose;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// --- one note ---------------------------------------------------------------
function playNote(voice, f, t, dur, gain, duty) {
  if (f == null) return;
  const g = ctx.createGain();
  const peak = gain;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);        // fast attack
  g.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.5); // decay
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);        // release
  g.connect(master);
  const osc = ctx.createOscillator();
  if (voice === "tri") osc.type = "triangle";
  else osc.setPeriodicWave(pulseWaves[duty || 0.5]);
  osc.frequency.value = f;
  osc.connect(g);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
function playNoise(kind, t, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const g = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  let dur = 0.06;
  if (kind === "K") { filt.type = "lowpass"; filt.frequency.value = 400; dur = 0.10; }
  else if (kind === "S") { filt.type = "bandpass"; filt.frequency.value = 1800; dur = 0.09; }
  else { filt.type = "highpass"; filt.frequency.value = 6000; dur = 0.03; } // H hat
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

// --- sequencer (lookahead) --------------------------------------------------
let current = null; // active looping theme
let schedTimer = null;

function patLen(comp) { return Math.max(...comp.tracks.map((tr) => tr.pattern.length)); }

function scheduleStep(comp, step, t, transpose) {
  for (const tr of comp.tracks) {
    const sym = tr.pattern[step % tr.pattern.length];
    if (!sym || sym === "-" || sym === ".") continue;
    const stepDur = 60 / (comp.bpm * (comp._bpmScale || 1)) / 4;
    const dur = stepDur * (tr.len || 0.9);
    if (tr.voice === "noise") playNoise(sym, t, tr.gain ?? 0.2);
    else playNote(tr.voice, freq(sym, (transpose || 0) + (tr.oct ? tr.oct * 12 : 0)), t, dur, tr.gain ?? 0.2, tr.duty);
  }
}

function runScheduler() {
  if (!current) return;
  const ahead = 0.12;
  const comp = current.comp;
  const stepDur = 60 / (comp.bpm * (comp._bpmScale || 1)) / 4;
  while (current.nextTime < ctx.currentTime + ahead) {
    scheduleStep(comp, current.step, current.nextTime, current.transpose);
    current.nextTime += stepDur;
    current.step++;
    if (current.step >= patLen(comp)) {
      if (comp.loop === false) { current = null; return; }
      current.step = 0;
    }
  }
}

// --- public: themes + sfx ---------------------------------------------------
// Play a looping theme by name. opts.seed varies key/tempo (daily/per-block).
export function playTheme(name, opts = {}) {
  ensureCtx();
  if (ctx.state === "suspended") ctx.resume();
  const base = THEMES[name];
  if (!base) return;
  if (current && current.name === name && current.seed === opts.seed) return; // already playing
  const comp = { ...base, tracks: base.tracks };
  const seed = opts.seed || 0;
  comp._bpmScale = 1 + (((seed % 5) - 2) * 0.03);      // ±6% tempo
  const transpose = (name === "focus") ? [0, 2, 4, 5, 7][seed % 5] : 0; // seeded key for focus
  current = { name, comp, seed: opts.seed, step: 0, transpose, nextTime: ctx.currentTime + 0.06 };
  if (!schedTimer) schedTimer = setInterval(runScheduler, 25);
  runScheduler();
}
export function stopTheme() { current = null; }
export function currentTheme() { return current ? current.name : null; }

// One-shot jingle/sfx (non-looping little composition).
export function playSfx(name) {
  ensureCtx();
  if (ctx.state === "suspended") ctx.resume();
  const comp = SFX[name];
  if (!comp) return;
  let t = ctx.currentTime + 0.02;
  const stepDur = 60 / comp.bpm / 4;
  const len = patLen(comp);
  for (let s = 0; s < len; s++) { scheduleStep(comp, s, t, 0); t += stepDur; }
}
