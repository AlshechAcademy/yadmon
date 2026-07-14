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

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
export function renderDayPanel(events) {
  const core = events.filter((e) => e.core);
  const other = events.filter((e) => !e.core);
  $("lineup").textContent =
    `${core.length} core block${core.length === 1 ? "" : "s"} on the board` +
    (other.length ? ` · ${other.length} other event${other.length === 1 ? "" : "s"}` : "");
  const list = $("event-list");
  list.innerHTML = "";
  for (const ev of events) {
    const item = document.createElement("li"); item.className = "evt-item";
    const head = document.createElement("div"); head.className = "evt-head";
    const time = document.createElement("span"); time.className = "time";
    time.textContent = `${minutesToLabel(ev.startMin)}–${minutesToLabel(ev.endMin)}`;
    const tag = document.createElement("span"); tag.className = "tag" + (ev.core ? "" : " noncore");
    if (ev.core) { tag.style.background = `var(${CARE_COLORS[ev.block.care] || "--noncore"})`; tag.textContent = ev.block.care; }
    else tag.textContent = "—";
    const title = document.createElement("span"); title.textContent = ev.title;
    const chev = document.createElement("span"); chev.className = "chev"; chev.textContent = "▸";
    head.append(time, tag, title, chev);
    const desc = document.createElement("div"); desc.className = "evt-desc"; desc.hidden = true;
    desc.innerHTML = (ev.location ? `<span class="loc">📍 ${escapeHtml(ev.location)}</span>\n` : "") +
      (ev.description ? escapeHtml(ev.description) : "(no description)");
    head.addEventListener("click", () => { desc.hidden = !desc.hidden; chev.textContent = desc.hidden ? "▸" : "▾"; });
    item.append(head, desc);
    list.appendChild(item);
  }
  if (!events.length) { const li = document.createElement("li"); li.textContent = "No timed events on the calendar today."; list.appendChild(li); }
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

// ===========================================================================
// Phase 2 — state banner, care dock, modal (confirm / yes-no / number pad)
// ===========================================================================

const CARE_ICON = {
  water: "💧", fruit: "🍓", love: "❤️", walk: "🐾", play: "⚽",
  bath: "🫧", groom: "✨", exercise: "💪", treats: "🍪", rest: "💤",
};

let careHandlers = { onTap: () => {}, onUndo: () => {} };
let currentBlock = null;

export function setCareHandlers(h) { careHandlers = { ...careHandlers, ...h }; }

export function showState(mode, info = {}) {
  const banner = $("state-banner");
  if (!banner) return;
  banner.className = mode;
  $("state-mode").textContent =
    mode === "WORK" ? "● WORK" : mode === "FREE" ? "○ FREE" : "z SLEEP";
  let reason = info.reason || "";
  if (mode === "WORK" && info.block) reason = `${info.event.title} — tap to log ${info.block.care}`;
  if (mode === "FREE") reason = "free time — live your life";
  $("state-reason").textContent = reason;
}

export function showCareButton(block, tally = 0) {
  currentBlock = block;
  const dock = $("care-dock");
  dock.hidden = false;
  const varName = "--care-" + block.care;
  $("care-btn").style.background = `var(${varName})`;
  $("care-icon").textContent = CARE_ICON[block.care] || "⭐";
  $("care-label").textContent = block.care;
  $("care-tally").textContent = tally;
}

export function updateTally(n) { $("care-tally").textContent = n; }

export function hideCareButton() {
  $("care-dock").hidden = true;
  currentBlock = null;
}

// wire care buttons once (module scripts run after DOM is parsed)
$("care-btn").addEventListener("click", () => { if (currentBlock) careHandlers.onTap(currentBlock.id); });
$("care-undo").addEventListener("click", () => { if (currentBlock) careHandlers.onUndo(currentBlock.id); });

// --- modal core -------------------------------------------------------------
function openModal() { $("modal").hidden = false; }
function closeModal() {
  $("modal").hidden = true;
  $("modal-pad").hidden = true;
  $("modal-chips").innerHTML = "";
}

// Yes/No question → Promise<boolean>
export function askYesNo(question) {
  return new Promise((resolve) => {
    $("modal-q").textContent = question;
    $("modal-pad").hidden = true;
    const chips = $("modal-chips");
    chips.innerHTML = "";
    const yes = document.createElement("button");
    yes.className = "chip yes"; yes.textContent = "Yes";
    const no = document.createElement("button");
    no.className = "chip no"; no.textContent = "No";
    yes.onclick = () => { closeModal(); resolve(true); };
    no.onclick = () => { closeModal(); resolve(false); };
    chips.append(yes, no);
    openModal();
  });
}

// Confirm a block tally → Promise<int>. Yes = tally; No opens the number pad.
export function confirmCount(block, tally, ev) {
  return new Promise((resolve) => {
    $("modal-q").textContent =
      `${ev ? ev.title : block.metric}: you logged ${tally} — ${block.metric}. Correct?`;
    $("modal-pad").hidden = true;
    const chips = $("modal-chips");
    chips.innerHTML = "";
    const yes = document.createElement("button");
    yes.className = "chip yes"; yes.textContent = `Yes, ${tally}`;
    const no = document.createElement("button");
    no.className = "chip no"; no.textContent = "No, fix it";
    yes.onclick = () => { closeModal(); resolve(tally); };
    no.onclick = () => { openPad(tally, (v) => { closeModal(); resolve(v); }); };
    chips.append(yes, no);
    openModal();
  });
}

// Number pad
function openPad(initial, done) {
  $("modal-chips").innerHTML = "";
  const pad = $("modal-pad");
  pad.hidden = false;
  let val = String(initial ?? 0);
  const disp = $("pad-display");
  const render = () => { disp.textContent = val; };
  render();

  const keys = $("pad-keys");
  keys.innerHTML = "";
  const layout = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
  for (const k of layout) {
    const b = document.createElement("button");
    b.textContent = k;
    b.onclick = () => {
      if (k === "⌫") val = val.length > 1 ? val.slice(0, -1) : "0";
      else if (k === "✓") { finish(); return; }
      else val = val === "0" ? k : val + k;
      render();
    };
    keys.appendChild(b);
  }
  const finish = () => done(parseInt(val, 10) || 0);
  $("pad-ok").onclick = finish;
  $("pad-cancel").onclick = () => done(initial ?? 0);
}

// --- toasts -----------------------------------------------------------------
export function toast(msg, ms = 3200) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ===========================================================================
// Phase 3 — celebrations, recap, evolution + death ceremonies (§6)
// Note: no companion *dialogue* here (that is live Gemini in Phase 6). These
// are app-chrome ceremonies: tier badges, scorecards, ceremony cards.
// ===========================================================================

const TIER_UI = {
  FIRST: ["🌟", "first ever!"],
  MONTH_BEST: ["🏆", "month best!"],
  BEATS_7: ["🔥", "beats your 7-day avg"],
  BEATS_3: ["✨", "beats your 3-day avg"],
  BEATS_YEST: ["👍", "beats yesterday"],
  DISAPPOINTMENT: ["🥺", "wants more next time"],
};

export function showCelebration(tier, block, value) {
  const [ic, txt] = TIER_UI[tier] || ["", ""];
  toast(`${ic} ${block.metric}: ${value} — ${txt}`);
}

export function showEvolution(winnerId, framing, stageBump) {
  toast(`🧬 EVOLUTION — trait #${winnerId} leveled up · ${framing}`, 6000);
  if (stageBump) toast("⬆️ your companion matured to a new stage!", 6000);
}

// A simple ceremony card reusing the modal overlay, dismissed with OK.
function showCard(title, html) {
  $("modal-q").innerHTML = `<strong>${title}</strong><br><br>${html}`;
  $("modal-pad").hidden = true;
  const chips = $("modal-chips");
  chips.innerHTML = "";
  const okb = document.createElement("button");
  okb.className = "chip yes";
  okb.textContent = "OK";
  okb.onclick = () => { $("modal").hidden = true; $("modal-q").textContent = ""; };
  chips.append(okb);
  $("modal").hidden = false;
}

export function showDeath(cause, dead) {
  const metrics = (cause || []).map((c) => "#" + String(c).replace("m", "")).join(", ");
  showCard("💀 A companion has passed",
    `Neglected too long: ${metrics}.<br>A new companion is born at base form. Its predecessor now roams the background.`);
}

export function showRecap(data) {
  const r = data.row || {};
  const f = data.funnel || {};
  let grid = "";
  for (let i = 1; i <= 10; i++) {
    const v = r["m" + i];
    grid += `#${i}: <b>${v == null ? "—" : v}</b>${r["missed" + i] ? " (miss)" : ""}&nbsp;&nbsp;`;
    if (i % 2 === 0) grid += "<br>";
  }
  const t7 = f.trailing7 || {};
  const funnel =
    `today: memos ${f.memos} → calls ${f.calls} → attended ${f.attended} → signups ${f.signups}` +
    `<br>7-day: memos ${t7.memos || 0} → calls ${t7.calls || 0} → attended ${t7.attended || 0} → signups ${t7.signups || 0}`;
  const neg = data.neglect && data.neglect.length
    ? `<br><br>⚠️ neglected: ${data.neglect.map((c) => "#" + String(c).replace("m", "")).join(", ")}`
    : "";
  showCard("📋 Daily recap", `${grid}<br><b>Funnel:</b><br>${funnel}${neg}<br><br>Good night.`);
}


// ===========================================================================
// Phase 6 — companion speech bubble (live Gemini text) / silent emote (§8)
// ===========================================================================
let _bubbleTimer = null;
export function showBubble(text, ms = 5200) {
  const b = $("speech-bubble"); if (!b) return;
  b.textContent = text; b.hidden = false; b.classList.remove("silent");
  clearTimeout(_bubbleTimer); _bubbleTimer = setTimeout(() => { b.hidden = true; }, ms);
}
export function emoteSilent() {
  const b = $("speech-bubble"); if (!b) return;
  b.textContent = "…!"; b.hidden = false; b.classList.add("silent");
  clearTimeout(_bubbleTimer); _bubbleTimer = setTimeout(() => { b.hidden = true; }, 1600);
}
export function setBrainDot(state) { // "" | "ok" | "warn" | "bad"
  const d = $("brain-dot"); if (d) d.className = "dot" + (state ? " " + state : "");
}


// ===========================================================================
// Phase 7 — numbers panel (edit any metric anytime) + stats drawer
// ===========================================================================
export function showNumbersPanel(blocks, row, onSave) {
  const d = $("numbers-drawer");
  d.innerHTML = '<div class="dhead"><h2>📊 Today\'s numbers</h2><button class="dclose">✕ Close</button></div><div class="wrap" id="num-wrap"></div>';
  const wrap = d.querySelector("#num-wrap");
  const inputs = {};
  for (const b of blocks) {
    const r = document.createElement("div"); r.className = "num-row";
    r.innerHTML = `<span class="ic">${CARE_ICON[b.care] || "⭐"}</span><span class="lab">${b.metric} <small>${row["missed" + b.id] ? "· was missed" : ""}</small></span>`;
    const inp = document.createElement("input"); inp.type = "number"; inp.min = "0";
    inp.value = row["m" + b.id] == null ? "" : row["m" + b.id];
    inputs["m" + b.id] = inp; r.appendChild(inp); wrap.appendChild(r);
  }
  const fdefs = [["m11_calls", "📞 Calls generated"], ["m12_attended", "✅ Calls attended"], ["m13_signups", "⭐ Signups"]];
  for (const [f, l] of fdefs) {
    const r = document.createElement("div"); r.className = "num-row";
    r.innerHTML = `<span class="ic">·</span><span class="lab">${l}</span>`;
    const inp = document.createElement("input"); inp.type = "number"; inp.min = "0"; inp.value = row[f] ?? 0;
    inputs[f] = inp; r.appendChild(inp); wrap.appendChild(r);
  }
  const actions = document.createElement("div"); actions.className = "num-actions";
  const save = document.createElement("button"); save.className = "btn"; save.textContent = "Save all";
  const cancel = document.createElement("button"); cancel.className = "btn btn-ghost"; cancel.textContent = "Cancel";
  actions.append(save, cancel); wrap.appendChild(actions);
  const close = () => { d.hidden = true; };
  d.querySelector(".dclose").onclick = close; cancel.onclick = close;
  save.onclick = async () => {
    save.textContent = "Saving…"; save.disabled = true;
    const changes = { metrics: {}, fields: {} };
    for (const b of blocks) { const v = inputs["m" + b.id].value; if (v !== "") changes.metrics[b.id] = parseInt(v, 10) || 0; }
    for (const [f] of fdefs) changes.fields[f] = parseInt(inputs[f].value, 10) || 0;
    await onSave(changes); toast("Numbers saved ✓"); close();
  };
  d.hidden = false;
}

function drawLine(cv, data, colorVar) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height, pad = 8;
  g.clearRect(0, 0, W, H);
  if (!data.length) return;
  const mx = Math.max(1, ...data), mn = Math.min(0, ...data);
  const col = getComputedStyle(document.documentElement).getPropertyValue(colorVar || "--accent").trim() || "#7bd88f";
  const X = (i) => pad + (i / Math.max(1, data.length - 1)) * (W - 2 * pad);
  const Y = (v) => H - pad - ((v - mn) / Math.max(1, mx - mn)) * (H - 2 * pad);
  const avg = data.reduce((a, c) => a + c, 0) / data.length;
  g.strokeStyle = "rgba(255,255,255,0.12)"; g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(pad, Y(avg)); g.lineTo(W - pad, Y(avg)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
  data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
  g.fillStyle = col; data.forEach((v, i) => g.fillRect(X(i) - 1.5, Y(v) - 1.5, 3, 3));
}

export function showStats(rows, blocks) {
  const d = $("stats-drawer");
  let tf = 30;
  d.innerHTML = '<div class="dhead"><h2>📈 Stats</h2><button class="dclose">✕ Close</button></div><div class="wrap"><div class="filters" id="stat-filters"></div><div id="stat-cards"></div></div>';
  d.querySelector(".dclose").onclick = () => { d.hidden = true; };
  const filters = d.querySelector("#stat-filters");
  const cards = d.querySelector("#stat-cards");
  [["7", "Week"], ["30", "Month"], ["90", "3 months"], ["9999", "All"]].forEach(([v, l]) => {
    const b = document.createElement("button"); b.textContent = l; if (+v === tf) b.classList.add("on");
    b.onclick = () => { tf = +v; [...filters.children].forEach((c) => c.classList.remove("on")); b.classList.add("on"); render(); };
    filters.appendChild(b);
  });
  function render() {
    const wd = rows.filter((r) => !r.rest).slice(-tf);
    cards.innerHTML = "";
    if (!wd.length) { cards.innerHTML = '<p style="color:var(--ink-dim)">No data yet — come back after a few workdays.</p>'; return; }
    for (const b of blocks) {
      const series = wd.map((r) => r["m" + b.id] ?? 0);
      const avg = Math.round(series.reduce((a, c) => a + c, 0) / series.length);
      const card = document.createElement("div"); card.className = "stat-card";
      card.innerHTML = `<div class="sh"><span class="nm">${CARE_ICON[b.care] || ""} ${b.metric}</span><span class="mm">avg ${avg} · max ${Math.max(...series)} · last ${series[series.length - 1]}</span></div>`;
      const cv = document.createElement("canvas"); cv.width = 700; cv.height = 70; card.appendChild(cv);
      cards.appendChild(card); drawLine(cv, series, CARE_COLORS[b.care]);
    }
    // funnel totals over timeframe
    const t = wd.reduce((a, r) => ({ memos: a.memos + (r.m1 || 0) + (r.m2 || 0) + (r.m4 || 0), calls: a.calls + (r.m11_calls || 0), att: a.att + (r.m12_attended || 0), sign: a.sign + (r.m13_signups || 0) }), { memos: 0, calls: 0, att: 0, sign: 0 });
    const fc = document.createElement("div"); fc.className = "stat-card";
    fc.innerHTML = `<div class="sh"><span class="nm">🎯 Funnel (this range)</span></div><div style="font-size:13px">${t.memos} memos → ${t.calls} calls → ${t.att} attended → ${t.sign} signups</div>`;
    cards.appendChild(fc);
  }
  render(); d.hidden = false;
}