// YADMON — engine.js
// The daily state machine + scheduler. (PLAN.md §4)
// Resolves SLEEP / WORK / FREE each tick by priority, drives block lifecycles
// (begin → tally → confirm → write), early-cuts overlapped blocks, runs the call
// funnel, and closes the day (unconfirmed → miss). Rules math (care/celebration/
// neglect/death/evolution, §6) is Phase 3 — here `care` is a simple placeholder.

import { config } from "./config.js";
import { zoneMinutes, hhmmToMinutes, dayBoundsRFC3339, isWorkday, minutesToLabel } from "./time.js";

const WIN_START = hhmmToMinutes(config.windowStart);
const WIN_END = hhmmToMinutes(config.windowEnd);

// --- pure state resolver (unit-tested) --------------------------------------
// Given minutes-of-day and today's events, what state are we in right now?
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

// --- stateful engine --------------------------------------------------------
let ctx = null;
let timer = null;

let today = null;
let closed = false;
let busy = false;
let curMode = null;

let tallies = {};          // blockId -> count (today)
let activeEvtId = null;    // event id of the core block in WORK
let finalizedEvt = new Set();
let askedCall = new Set(); // non-core event ids already asked "sales call?"
let callInfo = {};         // eventId -> {isCall, followedUp}
let followupQueue = [];    // eventIds of ended tagged-calls awaiting follow-up

function ymd(d) { return dayBoundsRFC3339(d).ymd; }

function resetDay(date) {
  today = date;
  closed = false;
  tallies = {};
  activeEvtId = null;
  finalizedEvt = new Set();
  askedCall = new Set();
  callInfo = {};
  followupQueue = [];
  curMode = null;
}

export function start(context) {
  ctx = context;
  if (timer) clearInterval(timer);
  timer = setInterval(() => { tick().catch((e) => console.error("engine tick", e)); }, 1000);
  tick().catch((e) => console.error("engine tick", e));
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

// care-button callbacks
export function addTally(blockId) {
  tallies[blockId] = (tallies[blockId] || 0) + 1;
  ctx?.ui.updateTally(tallies[blockId]);
}
export function undoTally(blockId) {
  tallies[blockId] = Math.max(0, (tallies[blockId] || 0) - 1);
  ctx?.ui.updateTally(tallies[blockId]);
}
export function getTally(blockId) { return tallies[blockId] || 0; }
export function snapshot() {
  return { today, closed, curMode, activeEvtId, tallies: { ...tallies },
    finalized: [...finalizedEvt], calls: { ...callInfo } };
}

async function tick() {
  if (busy || !ctx) return;
  busy = true;
  try {
    const now = ctx.now();
    const date = ymd(now);
    const nowMin = zoneMinutes(now);

    if (date !== today) {
      resetDay(date);
      await ctx.store.ensureDayRow(date, !isWorkday(now));
    }

    // rest day
    if (!isWorkday(now)) {
      setMode("SLEEP");
      ctx.ui.showState("SLEEP", { reason: "rest day — see you next workday" });
      return;
    }
    // before wake
    if (nowMin < WIN_START) {
      setMode("SLEEP");
      ctx.ui.showState("SLEEP", { reason: `asleep — wakes at ${config.windowStart}` });
      return;
    }
    // after close
    if (nowMin >= WIN_END) {
      if (!closed) await runClose();
      setMode("SLEEP");
      ctx.ui.showState("SLEEP", { reason: "day closed — good night" });
      return;
    }

    const events = ctx.getEvents() || [];

    // 1) call tagging — ask once per non-core timed event that has started
    for (const ev of events) {
      if (!ev.core && nowMin >= ev.startMin && !askedCall.has(ev.id)) {
        askedCall.add(ev.id);
        const isCall = ctx.autoplay() ? true : await ctx.ui.askYesNo(`New event "${ev.title}" — sales call?`);
        callInfo[ev.id] = { isCall, followedUp: false, ev };
        if (isCall) await ctx.store.logCall(today, ev);
        break; // one prompt per tick
      }
    }

    // 2) enqueue follow-ups for ended tagged calls
    for (const id of Object.keys(callInfo)) {
      const info = callInfo[id];
      if (info.isCall && !info.followedUp && nowMin >= info.ev.endMin && !followupQueue.includes(id)) {
        followupQueue.push(id);
      }
    }
    // 3) process one follow-up
    if (followupQueue.length) {
      const id = followupQueue[0];
      const info = callInfo[id];
      const attended = ctx.autoplay() ? Math.random() < 0.7 : await ctx.ui.askYesNo(`Call "${info.ev.title}" — did they show?`);
      let signedUp = false;
      if (attended) {
        signedUp = ctx.autoplay() ? Math.random() < 0.4 : await ctx.ui.askYesNo(`"${info.ev.title}" — did they sign up?`);
      }
      await ctx.store.updateCallFollowup(today, id, { attended, signedUp });
      info.followedUp = true;
      followupQueue.shift();
    }

    // 4) resolve current state
    const st = resolveState(nowMin, events);

    if (st.mode === "SLEEP") {
      if (activeEvtId) await finalizeBlock(activeEvtId); // early-cut overlapped core
      setMode("SLEEP");
      ctx.ui.hideCareButton();
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
      if (ctx.autoplay() && tallies[st.block.id] < 40) {
        tallies[st.block.id] += 1;
        ctx.ui.updateTally(tallies[st.block.id]);
      }
      setMode("WORK");
      ctx.ui.showState("WORK", { block: st.block, event: st.event });
      return;
    }

    // FREE
    if (activeEvtId) await finalizeBlock(activeEvtId);
    setMode("FREE");
    ctx.ui.hideCareButton();
    ctx.ui.showState("FREE", {});
  } finally {
    busy = false;
  }
}

function setMode(m) {
  if (m !== curMode) curMode = m;
}

// Confirm a block's tally, write it, mark finalized. (§4 confirmation flow)
async function finalizeBlock(evtId) {
  if (finalizedEvt.has(evtId)) { if (activeEvtId === evtId) activeEvtId = null; return; }
  const ev = (ctx.getEvents() || []).find((e) => e.id === evtId);
  if (!ev || !ev.core) { if (activeEvtId === evtId) activeEvtId = null; return; }

  const block = ev.block;
  const tally = tallies[block.id] || 0;

  let value = tally;
  if (!ctx.autoplay()) {
    value = await ctx.ui.confirmCount(block, tally, ev);
  }
  // Placeholder care rule (real §6 rule arrives in Phase 3): any confirmed ≥1.
  const care = value >= 1;
  await ctx.store.writeMetric(today, block.id, value, care, false);

  finalizedEvt.add(evtId);
  if (activeEvtId === evtId) activeEvtId = null;
  ctx.ui.hideCareButton();
  ctx.ui.toast(`Logged ${value} — ${block.metric}`);
}

// Day close: finalize active block, write misses for unconfirmed core blocks,
// no-show any un-answered calls. (§3, §4)
async function runClose() {
  const events = ctx.getEvents() || [];
  if (activeEvtId) await finalizeBlock(activeEvtId);

  for (const ev of events) {
    if (ev.core && !finalizedEvt.has(ev.id)) {
      await ctx.store.writeMetric(today, ev.block.id, 0, false, true); // miss
      finalizedEvt.add(ev.id);
    }
  }
  for (const id of Object.keys(callInfo)) {
    const info = callInfo[id];
    if (info.isCall && !info.followedUp) {
      await ctx.store.updateCallFollowup(today, id, { attended: false, signedUp: false });
      info.followedUp = true;
    }
  }
  closed = true;
  ctx.ui.toast("Day closed — numbers locked in.");
}

// --- test hooks (used by the headless self-test; harmless in the browser) ---
export async function _testTick(context) {
  if (context) ctx = context;
  return tick();
}
export function _testReset() {
  today = null; closed = false; busy = false; activeEvtId = null;
  finalizedEvt = new Set(); askedCall = new Set(); callInfo = {};
  followupQueue = []; tallies = {}; curMode = null;
}
