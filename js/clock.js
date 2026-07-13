// YADMON — clock.js
// Single source of "now" for the whole app. The time machine (debug.js) can put
// this into simulated mode with a speed multiplier so a full day compresses into
// minutes. All engine logic reads clock.now() — never `new Date()` directly.
// (PLAN.md §12, §15 — absolute wall-clock comparisons, never accumulated timers.)

let mode = "real";        // "real" | "sim"
let simBaseVirtual = 0;   // virtual epoch ms at the moment sim started/rebased
let simBaseReal = 0;      // real epoch ms at that same moment
let speed = 1;            // virtual seconds per real second

export function now() {
  if (mode === "real") return new Date();
  return new Date(simBaseVirtual + (Date.now() - simBaseReal) * speed);
}

export function isSim() {
  return mode === "sim";
}

export function getSpeed() {
  return speed;
}

// Enter sim mode anchored at `virtualDate`, running at `spd`x.
export function setSim(virtualDate, spd = 1) {
  mode = "sim";
  simBaseVirtual = virtualDate.getTime();
  simBaseReal = Date.now();
  speed = spd;
}

// Change speed mid-run without jumping virtual time (rebase to current virtual now).
export function setSpeed(spd) {
  if (mode !== "sim") return;
  simBaseVirtual = now().getTime();
  simBaseReal = Date.now();
  speed = spd;
}

// Back to real time.
export function reset() {
  mode = "real";
  speed = 1;
}
