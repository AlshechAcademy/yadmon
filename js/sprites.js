// YADMON — sprites.js
// Renderer + trait systems. (PLAN.md §9)
// Base pose matrices (sprites-data.js) are FROZEN. Everything here is a
// DETERMINISTIC transform of that data — size, modular mecha attachments,
// particle counts, neglect tint, maturity — so evolution can't break
// continuity. Attachments are plated pieces that LAYER (spines behind →
// harness → pauldrons → collar/chain → visor/crown → floating FX).

import { SPECIES } from "./sprites-data.js";

const cache = new Map();
export function getPose(speciesIdx, pose) {
  const key = speciesIdx + ":" + pose;
  if (cache.has(key)) return cache.get(key);
  const rows = SPECIES[speciesIdx].poses[pose] || SPECIES[speciesIdx].poses.idle1;
  const m = rows.map((r) => r.split("").map((ch) => (ch === "." ? 0 : Number(ch))));
  cache.set(key, m);
  return m;
}

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
  return a.frames[Math.floor((tMs / 1000) * a.fps) % a.frames.length];
}

// --- color helpers ----------------------------------------------------------
const hexToRgb = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const rgbToHex = (r,g,b) => "#" + [r,g,b].map((v)=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
const desat = (h,a)=>{const [r,g,b]=hexToRgb(h);const l=0.3*r+0.59*g+0.11*b;return rgbToHex(r+(l-r)*a,g+(l-g)*a,b+(l-b)*a);};
const darken = (h,a)=>{const [r,g,b]=hexToRgb(h);return rgbToHex(r*(1-a),g*(1-a),b*(1-a));};
const lighten = (h,a)=>{const [r,g,b]=hexToRgb(h);return rgbToHex(r+(255-r)*a,g+(255-g)*a,b+(255-b)*a);};
const rnd = (i)=>{const x=Math.sin(i*12.9898)*43758.5453;return x-Math.floor(x);};

// --- draw primitives (grid = 32x32 sprite space) ----------------------------
function drawMatrix(ctx, m, palette, cx, cy, s, flip) {
  const ox = cx - 16*s, oy = cy - 16*s;
  for (let y=0;y<32;y++) for (let x=0;x<32;x++){
    const c=m[y][x]; if(!c) continue; const col=palette[c]; if(!col) continue;
    const dx = flip ? 31-x : x;
    ctx.fillStyle=col; ctx.fillRect(Math.floor(ox+dx*s), Math.floor(oy+y*s), Math.ceil(s), Math.ceil(s));
  }
}
function pxRect(ctx, cx, cy, s, gx, gy, w, h, color) {
  const ox = cx-16*s, oy = cy-16*s;
  ctx.fillStyle=color; ctx.fillRect(Math.floor(ox+gx*s), Math.floor(oy+gy*s), Math.ceil(w*s), Math.ceil(h*s));
}
// modular plate: base + top highlight + bottom/right shadow → 3D mecha look
function plate(ctx, cx, cy, s, gx, gy, w, h, col) {
  pxRect(ctx, cx, cy, s, gx, gy, w, h, col);
  pxRect(ctx, cx, cy, s, gx, gy, w, 1, lighten(col, 0.45));
  pxRect(ctx, cx, cy, s, gx, gy + h - 1, w, 1, darken(col, 0.4));
  pxRect(ctx, cx, cy, s, gx + w - 1, gy, 1, h, darken(col, 0.25));
}
const STEEL = "#9fb3cc", GOLD = "#e8c24a", TECH = "#38d0ff", STRAP = "#3a4358";

// --- main draw --------------------------------------------------------------
export function drawCompanion(o) {
  const { ctx, cx, cy, tMs = 0 } = o;
  const idx = o.speciesIdx || 0;
  const sp = SPECIES[idx];
  const T = o.traitLevels || {};
  const lvl = (i) => T["t" + i] || 0;
  const neg = o.neglect || {};
  const isNeg = (i) => neg["m" + i] && neg["m" + i].state === "NEGLECTED";
  const anyNeg = Object.keys(neg).some((k) => neg[k].state === "NEGLECTED");

  let palette = sp.palette.slice();
  if (anyNeg) palette = palette.map((c) => (c ? darken(desat(c, 0.5), 0.15) : c));

  const s = (o.px || 6) * (1 + 0.04 * lvl(2)) * (1 + 0.06 * (o.maturityStage || 0));
  const bounce = (o.anim === "play" || o.anim === "celebrate") ? Math.round(Math.sin(tMs/90)*2) : Math.round(Math.sin(tMs/500));
  const cyB = cy - bounce * s * 0.4;
  const pose = poseForAnim(o.anim || "idle", tMs);
  const m = getPose(idx, pose);
  const flip = o.facing === -1;

  // ---- BEHIND layer: aura + coat spines --------------------------------
  if (lvl(6) > 0 && !isNeg(6)) { // clean aura
    ctx.save(); ctx.globalAlpha = Math.min(0.05 + lvl(6)*0.012, 0.4);
    ctx.fillStyle = lighten(palette[2], 0.6);
    ctx.beginPath(); ctx.arc(cx, cyB, 15*s, 0, 7); ctx.fill(); ctx.restore();
  }
  if (lvl(10) >= 4 && !isNeg(10)) { // serenity calm aura + floating halo
    ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = "#8a94ff";
    ctx.beginPath(); ctx.arc(cx, cyB, 16*s, 0, 7); ctx.fill(); ctx.restore();
    const hy = cyB - 15*s + Math.sin(tMs/500)*s;   // floating
    ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1, s*0.5);
    ctx.beginPath(); ctx.ellipse(cx, hy, 7*s, 2.4*s, 0, 0, 7); ctx.stroke(); ctx.restore();
  }
  if (lvl(7) > 0 && !isNeg(7)) { // coat -> mech spine ridge behind head
    const n = Math.min(2 + Math.floor(lvl(7)/2), 9);
    for (let i=0;i<n;i++){ const gx = 8 + (i/(n-1||1))*15, hh = 1 + (lvl(7)>16?2:1);
      plate(ctx, cx, cyB, s, gx, 3 - hh, 1, hh + 1, i%2 ? STEEL : darken(STEEL,0.2)); }
  }

  // ---- BASE (frozen) ----------------------------------------------------
  drawMatrix(ctx, m, palette, cx, cyB, s, flip);

  // ---- FRONT layer: modular mecha attachments (z-ordered) --------------
  // 4 Explorer — tech harness (steel), layered first
  if (lvl(4) > 0 && !isNeg(4)) {
    plate(ctx, cx, cyB, s, 11, 16, 10, 1, STRAP);                 // collar strap
    for (let i=0;i<4;i++) plate(ctx, cx, cyB, s, 12+i*2, 16+i, 2, 2, STRAP); // diagonal sash
    if (lvl(4) >= 8)  plate(ctx, cx, cyB, s, 10, 22, 12, 1, STEEL);          // belt
    if (lvl(4) >= 16) plate(ctx, cx, cyB, s, 22, 15, 4, 6, STEEL);          // backpack
    if (lvl(4) >= 24) { plate(ctx, cx, cyB, s, 24, 10, 1, 5, STEEL); pxRect(ctx, cx, cyB, s, 24, 9, 1, 1, TECH); } // antenna
  }
  // 8 Buff — pauldrons (steel), grow + layer over harness
  if (lvl(8) > 0 && !isNeg(8)) {
    const b = Math.min(1 + Math.floor(lvl(8)/8), 4);
    plate(ctx, cx, cyB, s, 5 - b, 16, b + 1, 4, STEEL);
    plate(ctx, cx, cyB, s, 26, 16, b + 1, 4, STEEL);
    if (lvl(8) >= 20) { pxRect(ctx, cx, cyB, s, 5-b, 16, 1, 1, TECH); pxRect(ctx, cx, cyB, s, 26+b, 16, 1, 1, TECH); }
  }
  // 9 Bling — royal mech: collar → gem → chain → crown
  if (lvl(9) > 0 && !isNeg(9)) {
    plate(ctx, cx, cyB, s, 11, 16, 10, 1, GOLD);
    for (let x=12;x<21;x+=2) pxRect(ctx, cx, cyB, s, x, 16, 1, 1, darken(GOLD,0.4)); // segments
    if (lvl(9) >= 8) { plate(ctx, cx, cyB, s, 15, 16, 2, 2, TECH); pxRect(ctx, cx, cyB, s, 15, 16, 1, 1, "#eaffff"); }
    if (lvl(9) >= 16) plate(ctx, cx, cyB, s, 12, 18, 8, 1, GOLD);
    if (lvl(9) >= 24) { // crown
      plate(ctx, cx, cyB, s, 12, 1, 8, 2, GOLD);
      pxRect(ctx, cx, cyB, s, 13, 0, 1, 1, GOLD); pxRect(ctx, cx, cyB, s, 15, -1, 1, 1, GOLD); pxRect(ctx, cx, cyB, s, 18, 0, 1, 1, GOLD);
      pxRect(ctx, cx, cyB, s, 15, 1, 1, 1, TECH);
    }
  }
  // 10 Serenity — nightcap (front) stages
  if (lvl(10) > 0 && !isNeg(10)) {
    if (lvl(10) >= 1) plate(ctx, cx, cyB, s, 12, 3, 8, 2, "#6f7bff");
    if (lvl(10) >= 8) plate(ctx, cx, cyB, s, 13, 1, 6, 2, "#8a94ff");
    if (lvl(10) >= 16) pxRect(ctx, cx, cyB, s, 19, 1, 2, 2, "#ffffff");
  }
  // 1 Shine — highlight speckles + floating sparkles
  if (lvl(1) > 0 && !isNeg(1)) {
    const hi = lighten(palette[2], 0.5), n = Math.min(2 + lvl(1), 18);
    for (let i=0;i<n;i++) pxRect(ctx, cx, cyB, s, 8 + rnd(i)*16, 8 + rnd(i+99)*12, 1, 1, hi);
    for (let i=0;i<Math.floor(lvl(1)/4);i++){ const a=tMs/400+i*2.1, r=15+Math.sin(tMs/300+i)*2; sparkle(ctx, cx+Math.cos(a)*r*s, cyB+Math.sin(a)*r*s*0.7, s); }
  }
  // 3 Affection — blush + floating hearts
  if (lvl(3) > 0 && !isNeg(3)) {
    pxRect(ctx, cx, cyB, s, 9, 12, 2, 2, "#ff6f91"); pxRect(ctx, cx, cyB, s, 21, 12, 2, 2, "#ff6f91");
    const n = Math.min(Math.floor(lvl(3)/3), 8);
    for (let i=0;i<n;i++){ const a=tMs/700+(i/n)*6.28; heart(ctx, cx+Math.cos(a)*17*s, cyB+Math.sin(a)*17*s*0.7, s, "#ff5c8a"); }
  }
  // 6 Clean — floating soap bubbles
  if (lvl(6) > 0 && !isNeg(6)) {
    const n = Math.min(2 + Math.floor(lvl(6)/2), 12);
    for (let i=0;i<n;i++){ const t=(tMs/1000+i)%3, bx=8+rnd(i)*16, by=26-t*8; bubble(ctx, cx+(bx-16)*s, cyB+(by-16)*s, s*(0.6+rnd(i+5))); }
  }
  // 5 Play — toys on a floor shelf, OFFSET beside the creature (no overlap)
  if (lvl(5) > 0 && !isNeg(5)) {
    const n = Math.min(Math.floor(lvl(5)/3) + 1, 8), floorY = cyB + 15*s;
    for (let i=0;i<n;i++){ const bx = cx - 16*s - (i+1)*3.2*s;  // shelf to the left, clear of the body
      ctx.fillStyle=["#ff6b6b","#4fa8ff","#ffd83a","#7bd88f"][i%4];
      ctx.fillRect(Math.floor(bx), Math.floor(floorY), Math.ceil(2*s), Math.ceil(2*s));
      ctx.fillStyle="rgba(0,0,0,0.25)"; ctx.fillRect(Math.floor(bx), Math.floor(floorY+2*s), Math.ceil(2*s), Math.ceil(0.5*s)); }
  }
  // neglect dirt specks
  if (anyNeg) for (let i=0;i<6;i++) pxRect(ctx, cx, cyB, s, 9 + rnd(i)*14, 14 + rnd(i+7)*10, 1, 1, "#5a4a30");
}

// --- floating particle primitives -------------------------------------------
function sparkle(ctx,x,y,s){ctx.fillStyle="#fffbe0";const u=Math.ceil(s);ctx.fillRect(x-u,y,u,u);ctx.fillRect(x+u,y,u,u);ctx.fillRect(x,y-u,u,u);ctx.fillRect(x,y+u,u,u);ctx.fillRect(x,y,u,u);}
function heart(ctx,x,y,s,col){ctx.fillStyle=col;const u=Math.ceil(s);ctx.fillRect(x-u,y-u,u,u);ctx.fillRect(x+u,y-u,u,u);ctx.fillRect(x-u,y,3*u,u);ctx.fillRect(x,y+u,u,u);}
function bubble(ctx,x,y,s){ctx.save();ctx.globalAlpha=0.5;ctx.strokeStyle="#ffffff";ctx.lineWidth=Math.max(1,s*0.4);ctx.beginPath();ctx.arc(x,y,s*1.4,0,7);ctx.stroke();ctx.restore();}

// retiree mini
export function drawRetiree(ctx, x, y, speciesIdx, tMs) {
  drawCompanion({ ctx, cx: x, cy: y, px: 2.5, speciesIdx, anim: "walk", tMs, facing: Math.sin(tMs/2000) > 0 ? 1 : -1, traitLevels: {}, maturityStage: 0, neglect: {} });
}
