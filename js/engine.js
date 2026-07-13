// YADMON — engine.js
// Daily state machine + scheduler (§4) with the §6 rules engine applied.
// Resolves SLEEP/WORK/FREE, runs block lifecycles, the call funnel, day close,
// neglect/death, monthly evolution, and the 2:25 recap.

import { config } from "./config.js";
import {
  zoneMinutes, hhmmToMinutes, dayBoundsRFC3339, isWorkday,
} from "./time.js";
import * as rules from "./rules.js";

const WIN_START = hhmmToMinutes(config.windowStart);
const WIN_END = hhmmToMinutes(config.windowEnd);
const RECAP = hhmmToMinutes(config.recapTime);

// --- pure state resolver (unit-tested) --------------------------------------
export function resolveState(nowMin, events) {
  const covering = events.filter((e) => nowMin >= e.startMin && nowMin < e.endMin);
  const nonCore = covering.find((e) => !e.core);
  if (nonCore) {
    return { mode: "SLEEP", event: nonCore, overlappedCore: covering.find((e) => e.core) || null };
  }
  const core = covering.find((e) => e.core);
  if (core) return { mode: "WORK", event: core, block: core.block };
  return { mode: "FREE" };
}

// --- small helpers ----------------------------------------------------------
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function ymd(d) { return dayBoundsRFC3339(d).ymd; }
function prevMonthStr(d) {
  let [y, m] = ymd(d).split("-").map(Number);
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthBefore(ym) {
  let [y, m] = ym.split("-").map(Number);
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// --- stateful engine --------------------------------------------------------
let ctx = null;
let timer = null;

let today = null;
let closed = false;
let busy = false;
let curMode = null;

let tallies = {};
let activeEvtId = null;
let finalizedEvt = new Set();
let askedCall = new Set();
let callInfo = {};
let followupQueue = [];
let recapShown = false;
let celebrateUntil = 0; // real-ms transient for scene animation
let faintUntil = 0;

let historyRows = [];   // workday rows before today (baselines)
let companion = null;   // live companion state

function priorVals(metricId) { return historyRows.map((r) => r["m" + metricId] ?? 0); }
function priorMonthVals(metricId, ym) {
  return historyRows.filter((r) => r.date.startsWith(ym)).map((r) => r["m" + metricId] ?? 0);
}
function lastPrior(metricId) { const v = priorVals(metricId); return v.length ? v[v.length - 1] : 0; }

function resetDay(date) {
  today = date; closed = false; recapShown = false;
  tallies = {}; activeEvtId = null;
  finalizedEvt = new Set(); askedCall = new Set(); callInfo = {}; followupQueue = [];
  curMode = null;
}

export function start(context) {
  ctx = context;
  if (timer) clearInterval(timer);
  timer = setInterval(() => { tick().catch((e) => console.error("engine tick", e)); }, 1000);
  tick().catch((e) => console.error("engine tick", e));
}
export function stop() { if (timer) clearInterval(timer); timer = null; }

export function addTally(blockId) { tallies[blockId] = (tallies[blockId] || 0) + 1; ctx?.ui.updateTally(tallies[blockId]); }
export function undoTally(blockId) { tallies[blockId] = Math.max(0, (tallies[blockId] || 0) - 1); ctx?.ui.updateTally(tallies[blockId]); }
export function getTally(blockId) { return tallies[blockId] || 0; }
export function getCompanion() { return companion; }
export function snapshot() {
  return { today, closed, curMode, activeEvtId, tallies: { ...tallies },
    finalized: [...finalizedEvt], companion };
}

async function onNewDay(date, now) {
  resetDay(date);
  await ctx.store.ensureDayRow(date, !isWorkday(now));
  historyRows = await ctx.store.historyBefore(date);
  companion = await ctx.store.ensureCompanion();
  if (isWorkday(now)) await maybeRunEvolution(now);
}

async function tick() {
  if (busy || !ctx) return;
  busy = true;
  try {
    const now = ctx.now();
    const date = ymd(now);
    const nowMin = zoneMinutes(now);

    if (date !== today) await onNewDay(date, now);

    if (!isWorkday(now)) { setMode("SLEEP"); ctx.ui.showState("SLEEP", { reason: "rest day — see you next workday" }); return; }
    if (nowMin < WIN_START) { setMode("SLEEP"); ctx.ui.showState("SLEEP", { reason: `asleep — wakes at ${config.windowStart}` }); return; }
    if (nowMin >= WIN_END) {
      if (!closed) await runClose();
      setMode("SLEEP"); ctx.ui.showState("SLEEP", { reason: "day closed — good night" }); return;
    }

    // 2:25 recap
    if (nowMin >= RECAP && !recapShown) { recapShown = true; await showRecap(); }

    const events = ctx.getEvents() || [];

    // 1) call tagging (one prompt per tick)
    for (const ev of events) {
      if (!ev.core && nowMin >= ev.startMin && !askedCall.has(ev.id)) {
        askedCall.add(ev.id);
        const isCall = ctx.autoplay() ? true : await ctx.ui.askYesNo(`New event "${ev.title}" — sales call?`);
        callInfo[ev.id] = { isCall, followedUp: false, ev };
        if (isCall) await ctx.store.logCall(today, ev);
        break;
      }
    }
    // 2) enqueue follow-ups for ended tagged calls
    for (const id of Object.keys(callInfo)) {
      const info = callInfo[id];
      if (info.isCall && !info.followedUp && nowMin >= info.ev.endMin && !followupQueue.includes(id)) followupQueue.push(id);
    }
    // 3) process one follow-up
    if (followupQueue.length) {
      const id = followupQueue[0]; const info = callInfo[id];
      const attended = ctx.autoplay() ? Math.random() < 0.7 : await ctx.ui.askYesNo(`Call "${info.ev.title}" — did they show?`);
      let signedUp = false;
      if (attended) signedUp = ctx.autoplay() ? Math.random() < 0.4 : await ctx.ui.askYesNo(`"${info.ev.title}" — did they sign up?`);
      await ctx.store.updateCallFollowup(today, id, { attended, signedUp });
      info.followedUp = true; followupQueue.shift();
    }

    // 4) resolve
    const st = resolveState(nowMin, events);
    if (st.mode === "SLEEP") {
      if (activeEvtId) await finalizeBlock(activeEvtId);
      setMode("SLEEP"); ctx.ui.hideCareButton();
      ctx.ui.showState("SLEEP", { reason: `event: ${st.event.title}` });
      return;
    }
    if (st.mode === "WORK") {
      if (activeEvtId && activeEvtId !== st.event.id) await finalizeBlock(activeEvtId);
      if (activeEvtId !== st.event.id) {
        activeEvtId = st.event.id;
        if (tallies[st.block.id] == null) tallies[st.block.id] = 0;
        ctx.ui.showCareButton(st.block, tallies[st.block.id]);
      }
      if (ctx.autoplay() && tallies[st.block.id] < 40) { tallies[st.block.id] += 1; ctx.ui.updateTally(tallies[st.block.id]); }
      setMode("WORK"); ctx.ui.showState("WORK", { block: st.block, event: st.event });
      return;
    }
    // FREE
    if (activeEvtId) await finalizeBlock(activeEvtId);
    setMode("FREE"); ctx.ui.hideCareButton(); ctx.ui.showState("FREE", {});
  } finally {
    busy = false;
  }
}

function setMode(m) { if (m !== curMode) curMode = m; }

// Confirm a block: real §6.1 care + §6.2 celebration tier, then write.
async function finalizeBlock(evtId) {
  if (finalizedEvt.has(evtId)) { if (activeEvtId === evtId) activeEvtId = null; return; }
  const ev = (ctx.getEvents() || []).find((e) => e.id === evtId);
  if (!ev || !ev.core) { if (activeEvtId === evtId) activeEvtId = null; return; }

  const block = ev.block;
  const tally = tallies[block.id] || 0;
  let value = tally;
  if (!ctx.autoplay()) value = await ctx.ui.confirmCount(block, tally, ev);

  const B = lastPrior(block.id);
  const care = rules.careReceived(value, true, B);
  const tier = rules.celebrationTier(value, priorVals(block.id), priorMonthVals(block.id, today.slice(0, 7)));

  await ctx.store.writeMetric(today, block.id, value, care, false);
  finalizedEvt.add(evtId);
  if (activeEvtId === evtId) activeEvtId = null;
  ctx.ui.hideCareButton();
  ctx.ui.showCelebration?.(tier, block, value);
  if (tier !== "DISAPPOINTMENT") celebrateUntil = Date.now() + 2200;
  ctx.ui.toast(`Logged ${value} — ${block.metric}`);
}

// Day close: finalize active, write misses for EVERY unconfirmed metric
// (absent block = 0, §4), no-show open calls, then §6.3 neglect + §6.4 death.
async function runClose() {
  if (activeEvtId) await finalizeBlock(activeEvtId);

  let row = (await ctx.store.getDay(today)) || {};
  for (let i = 1; i <= 10; i++) {
    if (row["m" + i] == null) { await ctx.store.writeMetric(today, i, 0, false, true); }
  }
  for (const id of Object.keys(callInfo)) {
    const info = callInfo[id];
    if (info.isCall && !info.followedUp) { await ctx.store.updateCallFollowup(today, id, { attended: false, signedUp: false }); info.followedUp = true; }
  }

  // reload the finalized row and run the rules
  row = (await ctx.store.getDay(today)) || {};
  if (!companion) companion = await ctx.store.ensureCompanion();
  for (let i = 1; i <= 10; i++) {
    const missed = row["missed" + i] === true;
    const v = row["m" + i] ?? 0;
    const confirmed = !missed && row["m" + i] != null;
    const care = rules.careReceived(v, confirmed, lastPrior(i));
    companion.neglect["m" + i] = rules.neglectStep(
      companion.neglect["m" + i] || rules.freshNeglect(),
      { careReceived: care, confirmed, v }
    );
  }

  const death = rules.deathCheck(companion.neglect);
  if (death.dead) {
    const cause = Object.keys(companion.neglect).filter((k) => companion.neglect[k].state === "NEGLECTED");
    await ctx.store.archiveCompanion(companion, cause);
    const next = ctx.store.newCompanion((companion.speciesIdx + 1) % ctx.store.SPECIES_COUNT, Date.now());
    next.lastEvolvedForMonth = companion.lastEvolvedForMonth; // baselines continue (ruling #5)
    ctx.ui.showDeath?.(cause, companion);
    faintUntil = Date.now() + 2600;
    companion = next;
    await ctx.store.setCompanion(companion);
  } else {
    await ctx.store.setCompanion(companion);
  }
  closed = true;
  ctx.ui.toast("Day closed — numbers locked in.");
}

// §6.5 monthly evolution at first wake of a new month.
async function maybeRunEvolution(now) {
  const doneMonth = prevMonthStr(now);
  if (!companion) companion = await ctx.store.ensureCompanion();
  if (companion.lastEvolvedForMonth === doneMonth) return;

  const doneRows = await ctx.store.monthRows(doneMonth);
  if (!doneRows.length) return; // nothing to evolve from yet

  const prevMonth = monthBefore(doneMonth);
  const prevRows = await ctx.store.monthRows(prevMonth);
  const before = await ctx.store.historyBefore(doneMonth + "-01");
  const firstMonthEver = before.length === 0;

  const perMetric = [];
  for (let i = 1; i <= 10; i++) {
    perMetric.push({ id: i, aM: mean(doneRows.map((r) => r["m" + i] ?? 0)), aMprev: mean(prevRows.map((r) => r["m" + i] ?? 0)) });
  }
  const { winnerId, framing } = rules.evolutionWinner(perMetric, { firstMonthEver });
  if (winnerId) {
    companion.traitLevels["t" + winnerId] = (companion.traitLevels["t" + winnerId] || 0) + 1;
    const total = Object.values(companion.traitLevels).reduce((a, b) => a + b, 0);
    const newStage = rules.maturityStageFor(total);
    const stageBump = newStage > companion.maturityStage;
    companion.maturityStage = newStage;
    ctx.ui.showEvolution?.(winnerId, framing, stageBump, companion);
  }
  companion.lastEvolvedForMonth = doneMonth;
  await ctx.store.setCompanion(companion);
}

// 2:25 recap scorecard + funnel.
async function showRecap() {
  const row = (await ctx.store.getDay(today)) || {};
  const trailing = (await ctx.store.historyBefore(today)).slice(-7);
  const funnel = {
    memos: (row.m1 || 0) + (row.m2 || 0) + (row.m4 || 0),
    calls: row.m11_calls || 0, attended: row.m12_attended || 0, signups: row.m13_signups || 0,
    trailing7: trailing.reduce((a, r) => ({
      memos: a.memos + (r.m1 || 0) + (r.m2 || 0) + (r.m4 || 0),
      calls: a.calls + (r.m11_calls || 0), attended: a.attended + (r.m12_attended || 0), signups: a.signups + (r.m13_signups || 0),
    }), { memos: 0, calls: 0, attended: 0, signups: 0 }),
  };
  const neglectWarn = companion ? Object.keys(companion.neglect).filter((k) => companion.neglect[k].state === "NEGLECTED") : [];
  ctx.ui.showRecap?.({ row, funnel, neglect: neglectWarn, companion });
}

// --- scene animation (for the room canvas) ---------------------------------
export function getMode() { return curMode; }
export function getScene() {
  const c = companion;
  const now = Date.now();
  const anyNeg = c && Object.values(c.neglect || {}).some((n) => n.state === "NEGLECTED");
  let anim;
  if (now < faintUntil) anim = "faint";
  else if (now < celebrateUntil) anim = "celebrate";
  else if (anyNeg) anim = "sad";
  else anim = curMode === "SLEEP" ? "sleep" : curMode === "WORK" ? "play" : "walk";
  return {
    speciesIdx: c ? c.speciesIdx : (config.starterSpecies || 0),
    anim,
    traitLevels: c ? c.traitLevels : {},
    maturityStage: c ? c.maturityStage : 0,
    neglect: c ? c.neglect : {},
  };
}

// --- test hooks -------------------------------------------------------------
export async function _testTick(context) { if (context) ctx = context; return tick(); }
export function _testReset() {
  today = null; closed = false; busy = false; activeEvtId = null;
  finalizedEvt = new Set(); askedCall = new Set(); callInfo = {};
  followupQueue = []; tallies = {}; curMode = null; recapShown = false;
  historyRows = []; companion = null;
}
