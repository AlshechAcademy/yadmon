// YADMON — sprites.js
// Renderer + trait systems. (PLAN.md §9)
// The base pose matrices in sprites-data.js are FROZEN and never edited.
// Everything here is a DETERMINISTIC transformation of that data (size, trait
// overlays, particle counts, neglect tint, maturity) so evolution can never
// break continuity — it's guaranteed by construction.

import { SPECIES, PALETTES } from "./sprites-data.js";

// --- pose matrix cache ------------------------------------------------------
const cache = new Map();
export function getPose(speciesIdx, pose) {
  const key = speciesIdx + ":" + pose;
  if (cache.has(key)) return cache.get(key);
  const rows = SPECIES[speciesIdx].poses[pose] || SPECIES[speciesIdx].poses.idle1;
  const m = rows.map((r) => r.split("").map((ch) => (ch === "." ? 0 : Number(ch))));
  cache.set(key, m);
  return m;
}

// --- animation catalog ------------------------------------------------------
export const ANIM = {
  idle:      { frames: ["idle1", "idle1", "idle1", "idle2"], fps: 2 },
  walk:      { frames: ["walk1", "walk2"], fps: 6, moves: true },
  sleep:     { frames: ["sleep1", "sleep2"], fps: 1 },
  eat:       { frames: ["eat", "idle1"], fps: 4 },
  play:      { frames: ["play", "idle1"], fps: 6 },
  sad:       { frames: ["sad", "sad", "sad", "idle2"], fps: 1.5 },
  celebrate: { frames: ["celebrate1", "celebrate2"], fps: 7 },
  faint:     { frames: ["faint"], fps: 1 },
};
export function poseForAnim(anim, tMs) {
  const a = ANIM[anim] || ANIM.idle;
  const i = Math.floor((tMs / 1000) * a.fps) % a.frames.length;
  return a.frames[i];
}

// --- color helpers ----------------------------------------------------------
function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function rgbToHex(r, g, b) { return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function desat(hex, amt) { const [r, g, b] = hexToRgb(hex); const l = 0.3 * r + 0.59 * g + 0.11 * b; return rgbToHex(r + (l - r) * amt, g + (l - g) * amt, b + (l - b) * amt); }
function darken(hex, amt) { const [r, g, b] = hexToRgb(hex); return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt)); }
function lighten(hex, amt) { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt); }

// deterministic pseudo-random for particle placement
function rnd(i) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }

// --- core matrix draw -------------------------------------------------------
// cx,cy = center in canvas px; s = pixel size; flip mirrors horizontally.
function drawMatrix(ctx, m, palette, cx, cy, s, flip) {
  const ox = cx - 16 * s, oy = cy - 16 * s;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const c = m[y][x];
      if (!c) continue;
      const col = palette[c];
      if (!col) continue;
      const dx = flip ? 31 - x : x;
      ctx.fillStyle = col;
      ctx.fillRect(Math.floor(ox + dx * s), Math.floor(oy + y * s), Math.ceil(s), Math.ceil(s));
    }
  }
}
function pxRect(ctx, cx, cy, s, gx, gy, w, h, color) {
  const ox = cx - 16 * s, oy = cy - 16 * s;
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(ox + gx * s), Math.floor(oy + gy * s), Math.ceil(w * s), Math.ceil(h * s));
}

// --- main draw --------------------------------------------------------------
// o: { ctx, cx, cy, px, speciesIdx, anim, tMs, traitLevels{t1..t10},
//      maturityStage, neglect{m1..m10:{state}}, facing }
export function drawCompanion(o) {
  const { ctx, cx, cy, tMs = 0 } = o;
  const sp = SPECIES[o.speciesIdx || 0];
  const T = o.traitLevels || {};
  const lvl = (i) => T["t" + i] || 0;
  const neg = o.neglect || {};
  const isNeg = (i) => neg["m" + i] && neg["m" + i].state === "NEGLECTED";
  const anyNeg = Object.keys(neg).some((k) => neg[k].state === "NEGLECTED");

  // palette with neglect tint (dull + darker) — trait 6 "clean" inverse etc.
  let palette = PALETTES[sp.palette].slice();
  if (anyNeg) palette = palette.map((c) => (c ? darken(desat(c, 0.5), 0.15) : c));

  // size (trait 2) + maturity scale, deterministic
  const s = (o.px || 6) * (1 + 0.04 * lvl(2)) * (1 + 0.06 * (o.maturityStage || 0));

  // idle bounce / play bounce
  const bounce = o.anim === "play" || o.anim === "celebrate" ? Math.round(Math.sin(tMs / 90) * 2) : Math.round(Math.sin(tMs / 500));
  const cyB = cy - bounce * s * 0.4;

  const pose = poseForAnim(o.anim || "idle", tMs);
  const m = getPose(o.speciesIdx || 0, pose);
  const flip = o.facing === -1;

  // clean aura (trait 6) behind sprite
  if (lvl(6) > 0 && !isNeg(6)) {
    ctx.save(); ctx.globalAlpha = Math.min(0.05 + lvl(6) * 0.01, 0.4);
    ctx.fillStyle = lighten(palette[2], 0.6);
    ctx.beginPath(); ctx.arc(cx, cyB, 15 * s, 0, 7); ctx.fill(); ctx.restore();
  }

  drawMatrix(ctx, m, palette, cx, cyB, s, flip);

  // ---- deterministic trait overlays (anchored to frozen rig points) ----
  // 1 Shine: highlight speckles + sparkles scaling with level
  if (lvl(1) > 0 && !isNeg(1)) {
    const hi = lighten(palette[2], 0.5);
    const n = Math.min(2 + lvl(1), 20);
    for (let i = 0; i < n; i++) {
      const gx = 8 + rnd(i) * 16, gy = 8 + rnd(i + 99) * 12;
      pxRect(ctx, cx, cyB, s, gx, gy, 1, 1, hi);
    }
    const sp2 = Math.floor(lvl(1) / 4);
    for (let i = 0; i < sp2; i++) {
      const a = tMs / 400 + i * 2.1, r = 15 + Math.sin(tMs / 300 + i) * 2;
      sparkle(ctx, cx + Math.cos(a) * r * s, cyB + Math.sin(a) * r * s * 0.7, s);
    }
  }
  // 3 Affection: blush + orbiting hearts
  if (lvl(3) > 0 && !isNeg(3)) {
    pxRect(ctx, cx, cyB, s, 9, 12, 2, 2, "#ff6f91");
    pxRect(ctx, cx, cyB, s, 21, 12, 2, 2, "#ff6f91");
    const n = Math.min(Math.floor(lvl(3) / 3), 8);
    for (let i = 0; i < n; i++) {
      const a = tMs / 700 + (i / n) * 6.28, r = 17;
      heart(ctx, cx + Math.cos(a) * r * s, cyB + Math.sin(a) * r * s * 0.7, s, "#ff5c8a");
    }
  }
  // 4 Explorer: overlay stages bandana -> boots -> satchel -> map
  if (lvl(4) > 0 && !isNeg(4)) {
    if (lvl(4) >= 1) pxRect(ctx, cx, cyB, s, 10, 9, 12, 2, "#c94f4f"); // bandana
    if (lvl(4) >= 8) { pxRect(ctx, cx, cyB, s, 10, 27, 4, 2, "#5a3a1a"); pxRect(ctx, cx, cyB, s, 18, 27, 4, 2, "#5a3a1a"); } // boots
    if (lvl(4) >= 16) pxRect(ctx, cx, cyB, s, 22, 16, 4, 5, "#8a5a2a"); // satchel
    if (lvl(4) >= 24) pxRect(ctx, cx, cyB, s, 6, 16, 4, 4, "#e8d8a0"); // map
  }
  // 6 Clean: soap bubbles
  if (lvl(6) > 0 && !isNeg(6)) {
    const n = Math.min(2 + Math.floor(lvl(6) / 2), 14);
    for (let i = 0; i < n; i++) {
      const t = (tMs / 1000 + i) % 3;
      const bx = 8 + rnd(i) * 16, by = 26 - t * 8;
      bubble(ctx, cx + (bx - 16) * s, cyB + (by - 16) * s, s * (0.6 + rnd(i + 5)));
    }
  }
  // 7 Coat: hair strands + luster
  if (lvl(7) > 0 && !isNeg(7)) {
    const n = Math.min(2 + Math.floor(lvl(7) / 2), 12);
    for (let i = 0; i < n; i++) {
      const gx = 9 + (i / n) * 14, len = 1 + (lvl(7) > 12 ? 2 : 1);
      pxRect(ctx, cx, cyB, s, gx, 5 - len, 1, len, darken(palette[2], 0.15));
    }
  }
  // 8 Buff: limb bulk at stages
  if (lvl(8) > 0 && !isNeg(8)) {
    const b = Math.min(1 + Math.floor(lvl(8) / 8), 4);
    pxRect(ctx, cx, cyB, s, 6 - b, 18, b, 4, palette[2]);
    pxRect(ctx, cx, cyB, s, 26, 18, b, 4, palette[2]);
  }
  // 9 Bling: collar -> gem -> chain -> crown + sparkle
  if (lvl(9) > 0 && !isNeg(9)) {
    if (lvl(9) >= 1) pxRect(ctx, cx, cyB, s, 11, 16, 10, 1, "#d4af37"); // collar
    if (lvl(9) >= 8) pxRect(ctx, cx, cyB, s, 15, 16, 2, 2, "#38d0ff"); // gem
    if (lvl(9) >= 16) pxRect(ctx, cx, cyB, s, 12, 18, 8, 1, "#d4af37"); // chain
    if (lvl(9) >= 24) { pxRect(ctx, cx, cyB, s, 12, 1, 8, 2, "#ffd83a"); pxRect(ctx, cx, cyB, s, 13, 0, 1, 1, "#ffd83a"); pxRect(ctx, cx, cyB, s, 18, 0, 1, 1, "#ffd83a"); }
    if (lvl(9) >= 4) sparkle(ctx, cx + 9 * s, cyB - 9 * s, s);
  }
  // 10 Serenity: nightcap stages + calm aura + slower blink handled via anim
  if (lvl(10) > 0 && !isNeg(10)) {
    if (lvl(10) >= 1) pxRect(ctx, cx, cyB, s, 12, 3, 8, 2, "#6f7bff");
    if (lvl(10) >= 8) pxRect(ctx, cx, cyB, s, 13, 1, 6, 2, "#8a94ff");
    if (lvl(10) >= 16) pxRect(ctx, cx, cyB, s, 19, 1, 2, 2, "#ffffff"); // pom
    if (lvl(10) >= 4) { ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = "#8a94ff"; ctx.beginPath(); ctx.arc(cx, cyB, 16 * s, 0, 7); ctx.fill(); ctx.restore(); }
  }
  // 5 Play: toys accumulate near feet
  if (lvl(5) > 0 && !isNeg(5)) {
    const n = Math.min(Math.floor(lvl(5) / 3) + 1, 8);
    for (let i = 0; i < n; i++) {
      const bx = cx + (i - n / 2) * 4 * s;
      ctx.fillStyle = ["#ff6b6b", "#4fa8ff", "#ffd83a", "#7bd88f"][i % 4];
      ctx.fillRect(Math.floor(bx), Math.floor(cyB + 15 * s), Math.ceil(2 * s), Math.ceil(2 * s));
    }
  }
  // neglect dirt specks
  if (anyNeg) {
    for (let i = 0; i < 6; i++) pxRect(ctx, cx, cyB, s, 9 + rnd(i) * 14, 14 + rnd(i + 7) * 10, 1, 1, "#5a4a30");
  }
}

// --- particle primitives ----------------------------------------------------
function sparkle(ctx, x, y, s) { ctx.fillStyle = "#fffbe0"; const u = Math.ceil(s); ctx.fillRect(x - u, y, u, u); ctx.fillRect(x + u, y, u, u); ctx.fillRect(x, y - u, u, u); ctx.fillRect(x, y + u, u, u); ctx.fillRect(x, y, u, u); }
function heart(ctx, x, y, s, col) { ctx.fillStyle = col; const u = Math.ceil(s); ctx.fillRect(x - u, y - u, u, u); ctx.fillRect(x + u, y - u, u, u); ctx.fillRect(x - u, y, 3 * u, u); ctx.fillRect(x, y + u, u, u); }
function bubble(ctx, x, y, s) { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, s * 0.4); ctx.beginPath(); ctx.arc(x, y, s * 1.4, 0, 7); ctx.stroke(); ctx.restore(); }

// --- retiree mini (16x16-ish, from archived trait snapshot) -----------------
export function drawRetiree(ctx, x, y, speciesIdx, tMs) {
  drawCompanion({ ctx, cx: x, cy: y, px: 2.5, speciesIdx, anim: "walk", tMs, facing: Math.sin(tMs / 2000) > 0 ? 1 : -1, traitLevels: {}, maturityStage: 0, neglect: {} });
}
