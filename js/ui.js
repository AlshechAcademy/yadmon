// YADMON — ui.js (Phase 1)
// Timeline strip renderer, HUD status, and day panel. The full HUD/drawer/
// inputs come in later phases; this covers what Phase 1 needs to see.

import { config } from "./config.js";
import { hhmmToMinutes, minutesToLabel, zoneMinutes } from "./time.js";

const CARE_COLORS = {
  water: "--care-water", fruit: "--care-fruit", love: "--care-love",
  walk: "--care-walk", play: "--care-play", bath: "--care-bath",
  groom: "--care-groom", exercise: "--care-exercise", treats: "--care-treats",
  rest: "--care-rest",
};

const WIN_START = hhmmToMinutes(config.windowStart); // 8:30 -> 510
const WIN_END = hhmmToMinutes(config.windowEnd);     // 14:30 -> 870
const WIN_SPAN = WIN_END - WIN_START;

const $ = (id) => document.getElementById(id);

export function setStatus(text, level = "") {
  $("status-text").textContent = text;
  const dot = $("status-dot");
  dot.className = "dot" + (level ? " " + level : "");
}

export function setClock(date = new Date()) {
  const m = zoneMinutes(date);
  $("clock").textContent = minutesToLabel(m).replace(/ [AP]M$/, (x) => x.toLowerCase());
}

function pctFromMin(min) {
  return ((min - WIN_START) / WIN_SPAN) * 100;
}

// Draw hour gridlines + labels once.
function drawGrid(track) {
  track.innerHTML = "";
  for (let h = Math.ceil(WIN_START / 60); h * 60 <= WIN_END; h++) {
    const min = h * 60;
    const line = document.createElement("div");
    line.className = "gridline";
    line.style.left = pctFromMin(min) + "%";
    track.appendChild(line);
    const label = document.createElement("div");
    label.className = "gridlabel";
    label.style.left = pctFromMin(min) + "%";
    label.textContent = minutesToLabel(min).replace(":00", "");
    track.appendChild(label);
  }
}

export function renderTimeline(events) {
  const track = $("timeline-track");
  drawGrid(track);

  for (const ev of events) {
    // clamp to window
    const s = Math.max(ev.startMin, WIN_START);
    const e = Math.min(ev.endMin, WIN_END);
    if (e <= WIN_START || s >= WIN_END) continue; // outside window

    const bar = document.createElement("div");
    bar.className = "evt " + (ev.core ? "core" : "noncore");
    bar.style.left = pctFromMin(s) + "%";
    bar.style.width = Math.max(pctFromMin(e) - pctFromMin(s), 1.2) + "%";
    if (ev.core) {
      const varName = CARE_COLORS[ev.block.care] || "--noncore";
      bar.style.background = `var(${varName})`;
    }
    bar.title = `${minutesToLabel(ev.startMin)}–${minutesToLabel(ev.endMin)}  ${ev.title}`;
    bar.textContent = ev.title;
    track.appendChild(bar);
  }
  renderLegend(events);
}

function renderLegend(events) {
  const legend = $("timeline-legend");
  const seen = new Map();
  for (const ev of events) {
    if (ev.core) seen.set(ev.block.care, ev.block.metric);
  }
  legend.innerHTML = "";
  for (const [care, metric] of seen) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = `var(${CARE_COLORS[care] || "--noncore"})`;
    item.appendChild(sw);
    item.appendChild(document.createTextNode(care));
    legend.appendChild(item);
  }
  if (events.some((e) => !e.core)) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = "var(--noncore)";
    item.appendChild(sw);
    item.appendChild(document.createTextNode("other / non-core"));
    legend.appendChild(item);
  }
}

// Now-cursor + countdown to the next boundary (start/end of any event, or window edges).
export function updateNowCursor(events, now = new Date()) {
  const cursor = $("now-cursor");
  const nowMin = zoneMinutes(now);
  if (nowMin < WIN_START || nowMin > WIN_END) {
    cursor.hidden = true;
    $("countdown").textContent = "";
    return;
  }
  cursor.hidden = false;
  cursor.style.left = pctFromMin(nowMin) + "%";

  const boundaries = [WIN_START, WIN_END];
  for (const ev of events) {
    boundaries.push(ev.startMin, ev.endMin);
  }
  const next = boundaries.filter((b) => b > nowMin + 0.001).sort((a, b) => a - b)[0];
  if (next != null) {
    const mins = next - nowMin;
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const s = Math.floor((mins * 60) % 60);
    const txt = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    $("countdown").textContent = `next boundary in ${txt}`;
  } else {
    $("countdown").textContent = "";
  }
}

export function renderDayPanel(events) {
  const core = events.filter((e) => e.core);
  const other = events.filter((e) => !e.core);
  $("lineup").textContent =
    `${core.length} core block${core.length === 1 ? "" : "s"} on the board` +
    (other.length ? ` · ${other.length} other event${other.length === 1 ? "" : "s"}` : "");

  const list = $("event-list");
  list.innerHTML = "";
  for (const ev of events) {
    const li = document.createElement("li");
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = `${minutesToLabel(ev.startMin)}–${minutesToLabel(ev.endMin)}`;
    const tag = document.createElement("span");
    tag.className = "tag" + (ev.core ? "" : " noncore");
    if (ev.core) {
      tag.style.background = `var(${CARE_COLORS[ev.block.care] || "--noncore"})`;
      tag.textContent = ev.block.care;
    } else {
      tag.textContent = "—";
    }
    const title = document.createElement("span");
    title.textContent = ev.title;
    li.append(time, tag, title);
    list.appendChild(li);
  }
  if (!events.length) {
    const li = document.createElement("li");
    li.textContent = "No timed events on the calendar today.";
    list.appendChild(li);
  }
}

export function showSignedOut() {
  $("signin-panel").hidden = false;
  $("day-panel").hidden = true;
  $("signin-btn").hidden = false;
  $("calendar-btn").hidden = true;
}

export function showNeedsCalendar(email) {
  $("signin-panel").hidden = false;
  $("day-panel").hidden = true;
  $("signin-btn").hidden = true;
  $("calendar-btn").hidden = false;
  $("signin-copy").textContent = `Signed in as ${email}. One more tap to read your calendar.`;
}

export function showDay() {
  $("signin-panel").hidden = true;
  $("day-panel").hidden = false;
}

export function showError(msg) {
  const el = $("signin-error");
  el.hidden = false;
  el.textContent = msg;
}

export function clearError() {
  $("signin-error").hidden = true;
}

export function setLastPoll(date = new Date()) {
  $("last-poll").textContent = "last synced " + minutesToLabel(zoneMinutes(date));
}
