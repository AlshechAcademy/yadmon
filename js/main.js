// YADMON — main.js (Phase 2)
// Boot + wiring: Firebase sign-in (owner-gated), Firestore store, GIS calendar,
// the state-machine engine, and the time machine. (PLAN.md §2, §3, §4, §12)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { config, firebaseConfig } from "./config.js";
import { initTokenClient, requestToken, hasValidToken, fetchTodayEvents } from "./calendar.js";
import * as ui from "./ui.js";
import * as store from "./store.js";
import * as engine from "./engine.js";
import * as clock from "./clock.js";
import * as debug from "./debug.js";
import { drawCompanion } from "./sprites.js";
import * as audio from "./audio.js";
import * as brain from "./brain.js";
import { zoneMinutes, hhmmToMinutes, dayBoundsRFC3339 } from "./time.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope("email");

let currentUser = null;
let engineRunning = false;
let liveEvents = [];
let livePollTimer = null;
let uiTimer = null;
let audioReady = false;
const CARE_EMOJI = { water:"💧", fruit:"🍓", love:"❤️", walk:"🐾", play:"⚽", bath:"🫧", groom:"✨", exercise:"💪", treats:"🍪", rest:"💤" };
let curX = 0, behavior = { name: "idle", until: 0, dir: 1, start: 0 };
let giveEffects = [], reactUntil = 0;
function spawnGive(care) { giveEffects.push({ care, born: performance.now(), seed: (Math.random()*2-1) }); reactUntil = performance.now() + 480; }
const audioHook = {
  sfx: (n) => audio.playSfx(n),
  tap: (care) => audio.playSfx("tap_" + care),
  theme: (n, o) => audio.playTheme(n, o),
  stop: () => audio.stopTheme(),
};
const brainHook = {
  speak: async (moment, data, opts = {}) => {
    let r;
    try { r = await brain.say(moment, data, opts); }
    catch { ui.emoteSilent(); ui.setBrainDot("bad"); return; }
    if (r && r.text) { ui.showBubble(r.text); audio.playSfx("talk"); ui.setBrainDot("ok"); }
    else if (r && r.reason === "nokey") { ui.emoteSilent(); ui.setBrainDot("warn"); }
    // rate-skip → no bubble
  },
};
const CORE_START = hhmmToMinutes(config.coreWindowStart);
const WIN_S = hhmmToMinutes(config.windowStart), WIN_E = hhmmToMinutes(config.windowEnd);

// Events the engine + timeline should use right now: sim override or live.
function currentEvents() {
  return debug.overrideEvents() ?? liveEvents;
}

// --- boot -------------------------------------------------------------------
async function boot() {
  store.initStore(app);
  ui.setStatus("loading…");
  ui.setClock(clock.now());
  ui.setCareHandlers({
    onTap: (id) => { engine.addTally(id); const c = config.blockRegistry.find((b) => b.id === id); if (c) spawnGive(c.care); },
    onUndo: engine.undoTally,
  });
  debug.init({ onChange: renderNow });

  uiTimer = setInterval(uiTick, 1000);

  // Wire buttons + auth listener FIRST so sign-in works even if the Google
  // Identity SDK is slow/blocked. The token client inits lazily on demand.
  wireButtons();

  onAuthStateChanged(auth, (user) => {
    if (user && user.email === config.ownerEmail) {
      currentUser = user;
      ui.clearError();
      ui.setStatus(`signed in · ${user.email}`, "ok");
      ui.showDay();
      startEngine();
      // auto-reconnect calendar silently while the Google session is active (no click needed)
      if (hasValidToken()) startLivePoll();
      else requestToken({ interactive: false }).then(() => startLivePoll()).catch(() => {});
      if (brain.hasKey()) brain.verifyAndPickModel().then((r) => ui.setBrainDot(r.ok ? "ok" : "bad")).catch(() => ui.setBrainDot("bad"));
    } else if (user) {
      ui.showError(`Locked to ${config.ownerEmail}. You signed in as ${user.email}.`);
      signOut(auth);
    } else {
      currentUser = null;
      stopEngine();
      stopLivePoll();
      ui.hideCareButton();
      ui.setStatus("signed out");
      ui.showSignedOut();
    }
  });

  // pre-warm the GIS token client without blocking boot
  initTokenClient().catch(() => {});
}

function wireButtons() {
  document.getElementById("signin-btn").addEventListener("click", async () => {
    ui.clearError();
    try { ui.setStatus("opening Google…"); await signInWithPopup(auth, provider); }
    catch (e) { ui.showError("Sign-in failed: " + (e.code || e.message)); ui.setStatus("sign-in failed", "bad"); }
  });

  document.getElementById("connect-live-btn").addEventListener("click", async () => {
    ui.clearError();
    try { ui.setStatus("connecting calendar…"); await requestToken({ interactive: true }); startLivePoll(); }
    catch (e) { ui.showError("Calendar connect failed: " + e.message); ui.setStatus("calendar failed", "bad"); }
  });

  document.getElementById("signout-btn").addEventListener("click", () => signOut(auth));

  // audio unlock on first gesture + HUD controls
  document.addEventListener("click", () => { audio.unlock(); audioReady = true; }, { once: true });
  const vol = document.getElementById("vol");
  if (vol) vol.addEventListener("input", (e) => audio.setVolume(e.target.value / 100));
  const mb = document.getElementById("mute-btn");
  if (mb) mb.addEventListener("click", (e) => { e.target.textContent = audio.toggleMute() ? "🔇" : "🔊"; });
  const kb = document.getElementById("key-btn");
  if (kb) kb.addEventListener("click", async () => {
    const k = prompt("Paste your Gemini API key (stored only in this browser, never uploaded):", brain.getKey());
    if (k == null) return;
    brain.setKey(k);
    if (!brain.hasKey()) { ui.setBrainDot("warn"); return; }
    ui.setBrainDot("warn");
    const r = await brain.verifyAndPickModel();
    if (r.ok) { ui.setBrainDot("ok"); audio.playSfx("talk"); alert("✅ Aquafin's brain is connected!\nModel: " + r.model + "  (" + r.count + " available)"); }
    else { ui.setBrainDot("bad"); alert("❌ Couldn't connect: " + r.error + "\n\nMake sure it's a valid Gemini API key with the Generative Language API enabled."); }
  });
  const nb = document.getElementById("numbers-btn");
  if (nb) nb.addEventListener("click", async () => {
    const t = engine.getToday(); if (!t) return;
    const row = (await store.getDay(t)) || {};
    ui.showNumbersPanel(config.blockRegistry, row, async (changes) => {
      for (const id of Object.keys(changes.metrics)) await engine.setMetric(+id, changes.metrics[id]);
      for (const f of Object.keys(changes.fields)) await engine.setField(f, changes.fields[f]);
      renderNow();
    });
  });
  const sb = document.getElementById("stats-btn");
  if (sb) sb.addEventListener("click", async () => { ui.showStats(await store.allDays(), config.blockRegistry); });
  ui.setBrainDot(brain.hasKey() ? "" : "warn");
}

// --- engine -----------------------------------------------------------------
function startEngine() {
  if (engineRunning) return;
  engine.start({
    now: clock.now,
    getEvents: currentEvents,
    autoplay: debug.isAutoplay,
    store,
    ui,
    audio: audioHook,
    brain: brainHook,
  });
  engineRunning = true;
}
function stopEngine() { engine.stop(); engineRunning = false; }

// --- live calendar polling --------------------------------------------------
function startLivePoll() {
  poll();
  if (livePollTimer) clearInterval(livePollTimer);
  livePollTimer = setInterval(poll, config.pollSeconds * 1000);
  document.addEventListener("visibilitychange", onVisible);
  document.getElementById("connect-live-btn").hidden = true;
}
function stopLivePoll() {
  if (livePollTimer) clearInterval(livePollTimer);
  livePollTimer = null;
  document.removeEventListener("visibilitychange", onVisible);
  const b = document.getElementById("connect-live-btn");
  if (b) b.hidden = false;
}
function onVisible() { if (document.visibilityState === "visible") poll(); }

async function poll() {
  if (debug.overrideEvents()) return; // sim mode owns the events
  try {
    ui.setStatus("syncing calendar…", "ok");
    liveEvents = await fetchTodayEvents();
    ui.setLastPoll(clock.now());
    ui.setStatus(`synced · ${liveEvents.length} event${liveEvents.length === 1 ? "" : "s"} today`, "ok");
    renderNow();
  } catch (e) {
    ui.setStatus("sync error: " + e.message, "bad");
  }
}

// --- render loop (timeline follows virtual/real time) -----------------------
function renderNow() {
  const events = currentEvents();
  ui.renderTimeline(events);
  ui.updateNowCursor(events, clock.now());
  ui.renderDayPanel(events);
}

function updateTheme() {
  if (!currentUser) { audio.stopTheme(); return; }
  const mode = engine.getMode();
  const now = clock.now();
  const nowMin = zoneMinutes(now);
  if (mode === "SLEEP" || nowMin < WIN_S || nowMin >= WIN_E) { audio.stopTheme(); return; }
  const daySeed = Number(dayBoundsRFC3339(now).ymd.replace(/-/g, "")); // e.g. 20260713
  if (nowMin < CORE_START) audio.playTheme("wake", { daySeed });
  // each work block gets its own key/tempo character; melody still evolves within it
  else if (mode === "WORK") audio.playTheme("focus", { daySeed: daySeed * 100 + Math.floor(nowMin / 30) });
  else audio.playTheme("free", { daySeed });
}

function uiTick() {
  ui.setClock(clock.now());
  if (currentUser) {
    ui.updateNowCursor(currentEvents(), clock.now());
    if (clock.isSim()) renderNow();
    if (audioReady) updateTheme();
  }
}

// --- companion room animation (Phase 4) -------------------------------------
function companionLoop(t) {
  const cv = document.getElementById("room-canvas");
  if (cv && currentUser) {
    const g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(0, cv.height - 22, cv.width, 22);
    const sc = engine.getScene();
    const baseCy = cv.height / 2 + 18, maxX = cv.width * 0.30, now = performance.now();
    let anim = sc.anim, facing = 1, cx = cv.width / 2, hop = 0;

    if (sc.anim === "walk") {
      // varied idle behaviours so it never looks static (free time)
      if (t > behavior.until) {
        const opts = ["idle", "idle", "idle", "hop", "lookL", "lookR", "wander", "wander"];
        behavior = { name: opts[(Math.random() * opts.length) | 0], until: t + 1400 + Math.random() * 2600, dir: Math.random() < 0.5 ? -1 : 1, start: t };
      }
      if (behavior.name === "wander") { curX += behavior.dir * 0.5; facing = behavior.dir; anim = "walk"; }
      else if (behavior.name === "lookL") { facing = -1; anim = "idle"; }
      else if (behavior.name === "lookR") { facing = 1; anim = "idle"; }
      else if (behavior.name === "hop") { anim = "idle"; hop = Math.max(0, Math.sin(((t - behavior.start) / 260) * Math.PI)) * 13; }
      else anim = "idle";
      curX = Math.max(-maxX, Math.min(maxX, curX));
      cx = cv.width / 2 + curX;
    } else curX = 0;
    if (now < reactUntil) anim = "eat"; // chomp when you give it something

    drawCompanion({ ctx: g, cx, cy: baseCy - hop, px: 4.5, speciesIdx: sc.speciesIdx, anim, tMs: t, traitLevels: sc.traitLevels, maturityStage: sc.maturityStage, neglect: sc.neglect, facing });

    // flying care-give items → satisfying dopamine per tap
    giveEffects = giveEffects.filter((e) => now - e.born < 720);
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const e of giveEffects) {
      const p = Math.min(1, (now - e.born) / 430);
      const sx = cv.width / 2 + e.seed * cv.width * 0.32, sy = cv.height - 24;
      const tx = cx, ty = baseCy - 6;
      const ix = sx + (tx - sx) * p, iy = sy + (ty - sy) * p - Math.sin(p * Math.PI) * 42;
      if (p < 1) { g.font = "20px serif"; g.fillText(CARE_EMOJI[e.care] || "⭐", ix, iy); }
      else { const bp = (now - e.born - 430) / 290; g.fillStyle = "#fff3a0"; for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.283; const r = bp * 18; g.fillRect(tx + Math.cos(a) * r - 1, ty + Math.sin(a) * r - 1, 3, 3); } }
    }
    g.textAlign = "start"; g.textBaseline = "alphabetic";
  }
  requestAnimationFrame(companionLoop);
}

boot();
requestAnimationFrame(companionLoop);
