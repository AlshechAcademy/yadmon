// YADMON — debug.js  (the TIME MACHINE, PLAN.md §12 Phase 2)
// Set a fake "now," compress a day to minutes, feed a sim schedule (with an
// overlap case), autoplay a hands-free day, inject fake history, wipe/export.
// This is how death, month rollovers, and neglect get tested in minutes.

import { config } from "./config.js";
import { hhmmToMinutes, dayBoundsRFC3339, minutesToLabel } from "./time.js";
import * as clock from "./clock.js";
import * as store from "./store.js";

// Canonical sim day (default block times from §3) + one overlapping call to
// exercise the early-cut rule (call 12:35–12:55 overlaps Refine Website 12:30–12:50).
const SIM_BLOCKS = [
  { id: 1, s: "09:00", e: "09:30", title: "LinkedIn Outbound - AA Outreach" },
  { id: 2, s: "09:30", e: "09:50", title: "WhatsApp Outbound - AA Outreach" },
  { id: 3, s: "10:00", e: "10:20", title: "Mass Email/SMS - AA Outreach" },
  { id: 4, s: "10:20", e: "10:50", title: "Outbound Social Media - AA Outreach" },
  { id: 5, s: "11:00", e: "11:50", title: "Respond to Inbounds - AA Outreach" },
  { id: 6, s: "12:00", e: "12:30", title: "Serve Oasis Members - AA Fulfillment" },
  { id: 7, s: "12:30", e: "12:50", title: "Refine Website - AA Marketing" },
  { id: 8, s: "13:00", e: "13:30", title: "One Unique Content Piece - AA Marketing" },
  { id: 9, s: "13:30", e: "13:50", title: "Automation Development - AA Ops" },
  { id: 10, s: "13:50", e: "14:00", title: "Trello Task Update - AA Ops" },
];
const SIM_CALL = { id: "call1", s: "12:35", e: "12:55", title: "Discovery call - Acme" };

function blockById(id) {
  const b = config.blockRegistry.find((x) => x.id === id);
  return { id: b.id, care: b.care, metric: b.metric };
}

export function buildSimDay(ymd) {
  const evs = SIM_BLOCKS.map((b) => ({
    id: `sim-${ymd}-${b.id}`,
    title: b.title,
    start: `${ymd}T${b.s}:00`,
    end: `${ymd}T${b.e}:00`,
    startMin: hhmmToMinutes(b.s),
    endMin: hhmmToMinutes(b.e),
    core: true,
    block: blockById(b.id),
  }));
  evs.push({
    id: `sim-${ymd}-${SIM_CALL.id}`,
    title: SIM_CALL.title,
    start: `${ymd}T${SIM_CALL.s}:00`,
    end: `${ymd}T${SIM_CALL.e}:00`,
    startMin: hhmmToMinutes(SIM_CALL.s),
    endMin: hhmmToMinutes(SIM_CALL.e),
    core: false,
    block: null,
  });
  evs.sort((a, b) => a.startMin - b.startMin);
  return evs;
}

// --- module state -----------------------------------------------------------
let simOn = false;
let autoplayOn = false;
let onChange = () => {};

export function isAutoplay() { return autoplayOn; }

// Events override for the engine/timeline. Returns sim events for the current
// virtual day, or null to use live calendar events.
export function overrideEvents() {
  if (!simOn) return null;
  const ymd = dayBoundsRFC3339(clock.now()).ymd;
  return buildSimDay(ymd);
}

// --- panel UI ---------------------------------------------------------------
export function init(opts = {}) {
  onChange = opts.onChange || (() => {});
  const toggle = document.getElementById("debug-toggle");
  if (toggle) toggle.addEventListener("click", openPanel);
}

function todayDefault() {
  return dayBoundsRFC3339(new Date()).ymd;
}

function openPanel() {
  if (document.getElementById("debug")) return; // already open
  const el = document.createElement("div");
  el.id = "debug";
  el.innerHTML = `
    <button class="close" id="dbg-close">✕</button>
    <h3>⏳ Time Machine</h3>
    <div class="mini">Test days in minutes. Sim writes real Firestore rows at the virtual date — wipe them when done.</div>

    <div class="grp">
      <label>Virtual date</label>
      <input type="date" id="dbg-date" value="${todayDefault()}" />
      <label>Start time</label>
      <input type="time" id="dbg-time" value="08:29" />
      <label>Speed (virtual sec per real sec)</label>
      <select id="dbg-speed">
        <option value="1">1× (real)</option>
        <option value="6">6×</option>
        <option value="18" selected>18× (~20-min day)</option>
        <option value="60">60×</option>
      </select>
      <div class="row2">
        <button class="btn" id="dbg-set">Set virtual now</button>
        <button class="btn btn-ghost" id="dbg-real">Reset to real</button>
      </div>
    </div>

    <div class="grp">
      <label><input type="checkbox" id="dbg-sim" /> Use sim schedule (10 blocks + overlapping call)</label>
      <label><input type="checkbox" id="dbg-auto" /> Autoplay (auto-tap + auto-confirm)</label>
      <button class="btn" id="dbg-run">▶ Run a compressed day now</button>
      <div class="mini" id="dbg-status">real time</div>
    </div>

    <div class="grp">
      <label>Inject fake history (workdays before virtual date)</label>
      <input type="number" id="dbg-hist" value="10" min="1" max="60" />
      <button class="btn" id="dbg-inject">Inject history</button>
    </div>

    <div class="grp">
      <label>Wipe a day row</label>
      <input type="date" id="dbg-wipe" value="${todayDefault()}" />
      <button class="btn btn-ghost" id="dbg-wipe-btn">Delete that date</button>
      <button class="btn" id="dbg-csv">⬇ Export CSV backup</button>
    </div>
  `;
  document.body.appendChild(el);

  const $ = (id) => document.getElementById(id);
  const status = () => {
    $("dbg-status").textContent =
      (clock.isSim() ? `SIM · ${clock.getSpeed()}×` : "real time") +
      (simOn ? " · sim schedule" : "") + (autoplayOn ? " · autoplay" : "");
  };

  $("dbg-close").onclick = () => el.remove();

  $("dbg-set").onclick = () => {
    const d = $("dbg-date").value, t = $("dbg-time").value || "08:29";
    const virtual = new Date(`${d}T${t}:00`);
    clock.setSim(virtual, Number($("dbg-speed").value));
    status(); onChange();
  };
  $("dbg-real").onclick = () => { clock.reset(); status(); onChange(); };
  $("dbg-speed").onchange = () => { if (clock.isSim()) clock.setSpeed(Number($("dbg-speed").value)); status(); };

  $("dbg-sim").onchange = (e) => { simOn = e.target.checked; status(); onChange(); };
  $("dbg-auto").onchange = (e) => { autoplayOn = e.target.checked; status(); };

  $("dbg-run").onclick = () => {
    simOn = true; $("dbg-sim").checked = true;
    autoplayOn = true; $("dbg-auto").checked = true;
    const d = $("dbg-date").value;
    clock.setSim(new Date(`${d}T08:29:00`), Number($("dbg-speed").value || 18));
    status(); onChange();
  };

  $("dbg-inject").onclick = async () => {
    const n = Number($("dbg-hist").value) || 10;
    const base = $("dbg-date").value;
    await injectHistory(n, base);
    alert(`Injected ${n} workdays of history before ${base}.`);
  };

  $("dbg-wipe-btn").onclick = async () => {
    const d = $("dbg-wipe").value;
    if (confirm(`Delete days/${d}?`)) { await store.wipeDate(d); alert(`Deleted ${d}.`); }
  };

  $("dbg-csv").onclick = async () => {
    const csv = await store.exportCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "yadmon-export.csv";
    a.click();
  };

  status();
}

// Write N workday rows going backward from `baseYmd` (exclusive), skipping
// rest days. Random-ish values so averages/neglect have something to chew on.
async function injectHistory(n, baseYmd) {
  const restDays = new Set([5, 6]); // Fri, Sat (getDay)
  let d = new Date(`${baseYmd}T12:00:00`);
  let written = 0;
  while (written < n) {
    d = new Date(d.getTime() - 24 * 3600 * 1000);
    if (restDays.has(d.getDay())) continue;
    const ymd = dayBoundsRFC3339(d).ymd;
    const metrics = {};
    for (let i = 1; i <= 10; i++) metrics["m" + i] = 4 + Math.floor(Math.random() * 20);
    metrics.m11_calls = Math.floor(Math.random() * 4);
    metrics.m12_attended = Math.floor(Math.random() * metrics.m11_calls);
    metrics.m13_signups = Math.floor(Math.random() * (metrics.m12_attended + 1));
    await store.seedDay(ymd, metrics, false);
    written++;
  }
}
