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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope("email");

let currentUser = null;
let engineRunning = false;
let liveEvents = [];
let livePollTimer = null;
let uiTimer = null;

// Events the engine + timeline should use right now: sim override or live.
function currentEvents() {
  return debug.overrideEvents() ?? liveEvents;
}

// --- boot -------------------------------------------------------------------
async function boot() {
  store.initStore(app);
  ui.setStatus("loading…");
  ui.setClock(clock.now());
  ui.setCareHandlers({ onTap: engine.addTally, onUndo: engine.undoTally });
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
      if (hasValidToken()) startLivePoll();
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

function uiTick() {
  ui.setClock(clock.now());
  if (currentUser) {
    ui.updateNowCursor(currentEvents(), clock.now());
    if (clock.isSim()) renderNow();
  }
}

// --- companion room animation (Phase 4) -------------------------------------
function companionLoop(t) {
  const cv = document.getElementById("room-canvas");
  if (cv && currentUser) {
    const cctx = cv.getContext("2d");
    cctx.clearRect(0, 0, cv.width, cv.height);
    cctx.fillStyle = "rgba(0,0,0,0.28)";
    cctx.fillRect(0, cv.height - 22, cv.width, 22);
    const sc = engine.getScene();
    let cx = cv.width / 2, facing = 1;
    if (sc.anim === "walk") { cx = cv.width / 2 + Math.sin(t / 2200) * (cv.width * 0.26); facing = Math.cos(t / 2200) > 0 ? 1 : -1; }
    drawCompanion({ ctx: cctx, cx, cy: cv.height / 2 + 18, px: 4.5, speciesIdx: sc.speciesIdx, anim: sc.anim, tMs: t, traitLevels: sc.traitLevels, maturityStage: sc.maturityStage, neglect: sc.neglect, facing });
  }
  requestAnimationFrame(companionLoop);
}

boot();
requestAnimationFrame(companionLoop);
