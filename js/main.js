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
let giveEffects = [], reactUntil = 0, worldX = 0;
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
// --- endless parallax world (Phase 7b) --------------------------------------
const mod = (a, n) => ((a % n) + n) % n;
const whash = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
function fitCanvas(cv) { const w = cv.parentElement; if (!w) return; const cw = w.clientWidth, ch = w.clientHeight; if (cw && ch && (cv.width !== cw || cv.height !== ch)) { cv.width = cw; cv.height = ch; } }
function wCloud(g, x, y) { g.beginPath(); g.arc(x, y, 12, 0, 7); g.arc(x + 14, y + 3, 10, 0, 7); g.arc(x - 14, y + 3, 10, 0, 7); g.fill(); }
function wHills(g, W, off, crestY, amp, color, freq) { g.fillStyle = color; g.beginPath(); for (let x = 0; x <= W; x += 6) { const y = crestY - amp * Math.sin((x + off) * freq) - amp * 0.5 * Math.sin((x + off) * freq * 2.3 + 1); if (x === 0) g.moveTo(0, y); else g.lineTo(x, y); } g.lineTo(W, 99999); g.lineTo(0, 99999); g.closePath(); g.fill(); }
function wTree(g, x, gy, night) { g.fillStyle = night ? "#241a34" : "#5a3a1e"; g.fillRect(x - 2, gy - 20, 4, 20); g.fillStyle = night ? "#1e2c52" : "#3f8a4a"; g.beginPath(); g.arc(x, gy - 24, 11, 0, 7); g.arc(x - 7, gy - 18, 8, 0, 7); g.arc(x + 7, gy - 18, 8, 0, 7); g.fill(); }
function wBush(g, x, gy, night) { g.fillStyle = night ? "#1c2a4e" : "#3f8a4a"; g.beginPath(); g.arc(x, gy - 5, 8, 0, 7); g.arc(x - 7, gy - 2, 6, 0, 7); g.arc(x + 7, gy - 2, 6, 0, 7); g.fill(); }
function wFlower(g, x, gy, night) { g.strokeStyle = night ? "#2a3a5a" : "#3d7d34"; g.lineWidth = 2; g.beginPath(); g.moveTo(x, gy); g.lineTo(x, gy - 10); g.stroke(); g.fillStyle = ["#ff6b6b", "#ffd83a", "#ff6bd6", "#4fa8ff"][Math.floor(whash(x) * 4)]; g.fillRect(x - 2, gy - 13, 4, 4); }
function wRock(g, x, gy, night) { g.fillStyle = night ? "#28324e" : "#8a8f9c"; g.beginPath(); g.arc(x, gy - 2, 5, Math.PI, 0); g.fill(); }
function drawWorld(g, W, H, wx, night) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  if (night) { sky.addColorStop(0, "#0a1030"); sky.addColorStop(1, "#182246"); }
  else { sky.addColorStop(0, "#2a4d72"); sky.addColorStop(0.6, "#4785a4"); sky.addColorStop(1, "#86c6cc"); }
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const groundY = Math.round(H * 0.72), a1 = H * 0.10, a2 = H * 0.06;
  if (night) {
    g.fillStyle = "#eef"; for (let i = 0; i < 46; i++) { g.globalAlpha = 0.4 + whash(i + 5) * 0.6; g.fillRect(whash(i) * W, whash(i + 99) * groundY * 0.85, 2, 2); } g.globalAlpha = 1;
    g.fillStyle = "#f2f0d8"; g.beginPath(); g.arc(W * 0.8, H * 0.18, 20, 0, 7); g.fill();
  } else { g.fillStyle = "#ffe6a0"; g.beginPath(); g.arc(W * 0.82, H * 0.2, 24, 0, 7); g.fill(); }
  g.fillStyle = night ? "rgba(180,190,220,0.14)" : "rgba(255,255,255,0.55)";
  const cs = 240, co = mod(wx * 0.12, cs);
  for (let x = -cs; x < W + cs; x += cs) { const i = Math.round((x + wx * 0.12) / cs); wCloud(g, x - co + whash(i) * 90, 28 + whash(i + 2) * 44); }
  wHills(g, W, wx * 0.18, groundY - a1, a1 * 0.9, night ? "#182146" : "#39636e", 0.010);
  wHills(g, W, wx * 0.42, groundY - a2, a2 * 0.9, night ? "#1e2c54" : "#3f8a55", 0.017);
  g.fillStyle = night ? "#16204a" : "#4a9a3e"; g.fillRect(0, groundY, W, H - groundY);
  g.fillStyle = night ? "#0f1838" : "#3d7d34"; g.fillRect(0, groundY, W, 4);
  const ds = 130, doo = mod(wx, ds);
  for (let x = -ds; x < W + ds; x += ds) { const i = Math.round((x + wx) / ds); const dx = x - doo + whash(i) * 46; const kind = Math.floor(whash(i + 3) * 4); if (kind === 0) wTree(g, dx, groundY, night); else if (kind === 1) wBush(g, dx, groundY, night); else if (kind === 2) wFlower(g, dx, groundY, night); else wRock(g, dx, groundY, night); }
  return groundY;
}

function companionLoop(t) {
  const cv = document.getElementById("room-canvas");
  if (cv && currentUser && cv.parentElement) {
    fitCanvas(cv);
    const g = cv.getContext("2d");
    const W = cv.width, H = cv.height, now = performance.now();
    const sc = engine.getScene();
    const night = sc.anim === "sleep";
    let anim = sc.anim, facing = 1, hop = 0, speed = night ? 0 : 0.5;
    if (sc.anim === "walk") {
      if (t > behavior.until) { const opts = ["idle", "idle", "idle", "hop", "lookL", "lookR", "wander", "wander"]; behavior = { name: opts[(Math.random() * opts.length) | 0], until: t + 1400 + Math.random() * 2600, dir: Math.random() < 0.5 ? -1 : 1, start: t }; }
      if (behavior.name === "wander") { anim = "walk"; facing = behavior.dir; speed = 1.7 * behavior.dir; }
      else if (behavior.name === "lookL") { anim = "idle"; facing = -1; speed = 0.3; }
      else if (behavior.name === "lookR") { anim = "idle"; facing = 1; speed = 0.3; }
      else if (behavior.name === "hop") { anim = "idle"; hop = Math.max(0, Math.sin(((t - behavior.start) / 260) * Math.PI)) * 14; speed = 0.4; }
      else { anim = "idle"; speed = 0.5; }
    }
    if (now < reactUntil) anim = "eat";
    worldX += speed;
    const groundY = drawWorld(g, W, H, worldX, night);
    const px = Math.max(3, Math.round(H / 58)), cx = W / 2, cy = groundY - 12 * px - hop;
    drawCompanion({ ctx: g, cx, cy, px, speciesIdx: sc.speciesIdx, anim, tMs: t, traitLevels: sc.traitLevels, maturityStage: sc.maturityStage, neglect: sc.neglect, facing });
    giveEffects = giveEffects.filter((e) => now - e.born < 720);
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const e of giveEffects) {
      const p = Math.min(1, (now - e.born) / 430);
      const sx = W / 2 + e.seed * W * 0.34, sy = H - 20, tx = cx, ty = cy - 4;
      const ix = sx + (tx - sx) * p, iy = sy + (ty - sy) * p - Math.sin(p * Math.PI) * 46;
      if (p < 1) { g.font = Math.round(px * 5) + "px serif"; g.fillText(CARE_EMOJI[e.care] || "⭐", ix, iy); }
      else { const bp = (now - e.born - 430) / 290; g.fillStyle = "#fff3a0"; for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283, r = bp * 20; g.fillRect(tx + Math.cos(a) * r - 1, ty + Math.sin(a) * r - 1, 3, 3); } }
    }
    g.textAlign = "start"; g.textBaseline = "alphabetic";
  }
  requestAnimationFrame(companionLoop);
}

boot();
requestAnimationFrame(companionLoop);
