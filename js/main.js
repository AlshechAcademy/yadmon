// YADMON — main.js (Phase 1)
// Boot + wiring: Firebase Google sign-in (owner-gated), GIS calendar token,
// 60s poll loop, timeline strip. (PLAN.md §2, §3, §4)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { config, firebaseConfig } from "./config.js";
import { initTokenClient, requestToken, hasValidToken, fetchTodayEvents } from "./calendar.js";
import * as ui from "./ui.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope("email");

let currentUser = null;
let pollTimer = null;
let tickTimer = null;
let events = [];

// --- boot -------------------------------------------------------------------

async function boot() {
  ui.setStatus("booting…");
  ui.setClock();
  tickTimer = setInterval(onTick, 1000);

  try {
    await initTokenClient();
  } catch (e) {
    ui.setStatus("calendar SDK blocked", "bad");
  }

  onAuthStateChanged(auth, (user) => {
    if (user && user.email === config.ownerEmail) {
      currentUser = user;
      ui.clearError();
      ui.setStatus(`signed in · ${user.email}`, "ok");
      ui.showNeedsCalendar(user.email);
      // If a calendar token is already live (same session), jump straight in.
      if (hasValidToken()) startCalendar();
    } else if (user) {
      // signed in as the wrong account
      ui.showError(`This app is locked to ${config.ownerEmail}. You signed in as ${user.email}.`);
      signOut(auth);
    } else {
      currentUser = null;
      stopCalendar();
      ui.setStatus("signed out");
      ui.showSignedOut();
    }
  });

  wireButtons();
}

function wireButtons() {
  document.getElementById("signin-btn").addEventListener("click", async () => {
    ui.clearError();
    try {
      ui.setStatus("opening Google…");
      await signInWithPopup(auth, provider);
    } catch (e) {
      ui.showError("Sign-in failed: " + (e.code || e.message));
      ui.setStatus("sign-in failed", "bad");
    }
  });

  document.getElementById("calendar-btn").addEventListener("click", async () => {
    ui.clearError();
    try {
      ui.setStatus("connecting calendar…");
      await requestToken({ interactive: true });
      startCalendar();
    } catch (e) {
      ui.showError("Calendar connect failed: " + e.message);
      ui.setStatus("calendar failed", "bad");
    }
  });

  document.getElementById("signout-btn").addEventListener("click", () => {
    signOut(auth);
  });
}

// --- calendar loop ----------------------------------------------------------

function startCalendar() {
  ui.showDay();
  poll();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, config.pollSeconds * 1000);
  // Re-poll immediately when the tab becomes visible again (throttling guard, §15).
  document.addEventListener("visibilitychange", onVisible);
}

function stopCalendar() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener("visibilitychange", onVisible);
}

function onVisible() {
  if (document.visibilityState === "visible") poll();
}

async function poll() {
  try {
    ui.setStatus("syncing calendar…", "ok");
    events = await fetchTodayEvents();
    ui.renderTimeline(events);
    ui.updateNowCursor(events);
    ui.renderDayPanel(events);
    ui.setLastPoll();
    ui.setStatus(`synced · ${events.length} event${events.length === 1 ? "" : "s"} today`, "ok");
  } catch (e) {
    ui.setStatus("sync error: " + e.message, "bad");
  }
}

// --- 1s UI tick -------------------------------------------------------------

function onTick() {
  ui.setClock();
  if (currentUser && pollTimer) ui.updateNowCursor(events);
}

boot();
