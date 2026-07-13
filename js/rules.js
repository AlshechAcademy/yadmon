// YADMON — rules.js
// Exact rules-engine math. (PLAN.md §6) Pure, deterministic, unit-tested.
// All values are per metric on workday-close integers; misses count as 0.
// Rest days are excluded upstream (callers pass only workday values).

// --- helpers ----------------------------------------------------------------
export function meanLastN(vals, n) {
  if (!vals.length) return 0;
  const slice = vals.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// --- 6.1 Care test ----------------------------------------------------------
// B = previous workday's stored value (may be 0). Any confirmed >=1 counts as
// care when yesterday was 0/miss (baseline reset); else must be >=50% of B.
// Integer-safe via 2*v >= B.
export function careReceived(v, confirmed, B) {
  if (!confirmed) return false;
  if (v < 1) return false;
  if (B < 1) return true;
  return 2 * v >= B;
}

// --- 6.2 Celebration tiers --------------------------------------------------
// Evaluated at confirmation against history strictly BEFORE today.
//   priorWorkdays: prior workday values for this metric, oldest->newest (misses 0)
//   priorThisMonth: subset of priorWorkdays within the current calendar month
// Returns one of: FIRST | MONTH_BEST | BEATS_7 | BEATS_3 | BEATS_YEST | DISAPPOINTMENT
export function celebrationTier(v, priorWorkdays, priorThisMonth = []) {
  if (priorWorkdays.length === 0) return "FIRST";
  if (priorThisMonth.length >= 1 && v > Math.max(...priorThisMonth)) return "MONTH_BEST";
  if (v > meanLastN(priorWorkdays, 7)) return "BEATS_7";
  if (v > meanLastN(priorWorkdays, 3)) return "BEATS_3";
  if (v > priorWorkdays[priorWorkdays.length - 1]) return "BEATS_YEST";
  return "DISAPPOINTMENT";
}

export const TIER_RANK = {
  FIRST: "first", MONTH_BEST: 4, BEATS_7: 3, BEATS_3: 2, BEATS_YEST: 1, DISAPPOINTMENT: 0,
};

// --- 6.3 Neglect state machine (per metric) ---------------------------------
// state = { state:"OK"|"NEGLECTED", c, clearStep, vClear }
export function freshNeglect() {
  return { state: "OK", c: 0, clearStep: 0, vClear: null };
}

// Advance one workday close. `careReceived` is the §6.1 result for today (used
// only in OK); NEGLECTED uses the two-day clear protocol on confirmed/v.
export function neglectStep(prev, { careReceived, confirmed, v }) {
  const s = { ...prev };
  if (s.state === "OK") {
    if (careReceived) s.c = 0;
    else {
      s.c += 1;
      if (s.c >= 3) { s.state = "NEGLECTED"; s.clearStep = 0; s.vClear = null; }
    }
    return s;
  }
  // NEGLECTED
  if (s.clearStep === 0) {
    if (confirmed && v >= 1) { s.clearStep = 1; s.vClear = v; }   // day one: any number
    else { s.clearStep = 0; }                                      // miss or 0 → stay
    return s;
  }
  // clearStep === 1
  if (confirmed && v >= 1 && 2 * v >= s.vClear) {
    return { state: "OK", c: 0, clearStep: 0, vClear: null };     // CLEARED
  }
  // confirmed underreport (2v<vClear) OR missed → reset to step 0, stay neglected
  s.clearStep = 0;
  s.vClear = null;
  return s;
}

// --- 6.4 Death --------------------------------------------------------------
// 3+ metrics simultaneously NEGLECTED after a close → death.
export function deathCheck(neglectByMetric) {
  const neglected = Object.values(neglectByMetric).filter((n) => n.state === "NEGLECTED");
  return { dead: neglected.length >= 3, count: neglected.length };
}

// --- 6.5 Monthly evolution --------------------------------------------------
// perMetric: [{ id, aM, aMprev }] where aM/aMprev are monthly workday means.
// Returns { winnerId, framing } per the ruling set.
export function evolutionScore(aM, aMprev) {
  if (aMprev > 0) return (aM - aMprev) / aMprev;   // finite
  if (aMprev === 0 && aM > 0) return Infinity;      // new-from-zero
  return null;                                       // both 0 → ineligible
}

export function evolutionWinner(perMetric, { firstMonthEver = false } = {}) {
  if (firstMonthEver) {
    // winner = largest total (aM), tie → lowest id
    let best = null;
    for (const m of perMetric) {
      if (!best || m.aM > best.aM || (m.aM === best.aM && m.id < best.id)) best = m;
    }
    return { winnerId: best ? best.id : null, framing: "first bloom" };
  }

  const scored = perMetric.map((m) => ({ ...m, score: evolutionScore(m.aM, m.aMprev), gain: m.aM - m.aMprev }));
  const eligible = scored.filter((m) => m.score !== null);
  if (!eligible.length) return { winnerId: null, framing: "dormant" };

  const anyPositive = eligible.some((m) => m.score > 0 || m.score === Infinity);
  // pick highest score; tie → larger absolute gain; still tie → lowest id
  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.gain !== a.gain) return b.gain - a.gain;
    return a.id - b.id;
  });
  const winner = eligible[0];
  const framing = anyPositive ? (winner.score === Infinity ? "sprang from nothing" : "grew the most") : "held the line";
  return { winnerId: winner.id, framing };
}

// maturity: every 6 cumulative trait levels → +1 stage.
export function maturityStageFor(totalLevels) {
  return Math.floor(totalLevels / 6);
}
