// YADMON — brain.js
// The companion's brain (PLAN.md §8). One utterance = one Gemini call. ZERO
// canned companion lines (ruling #9). Key lives ONLY in browser localStorage —
// never committed. On any failure the companion emotes silently ("…!") — never
// a fallback canned line. Token-bucket rate limiter + daily cap.

import { config } from "./config.js";

const KEY_LS = "yadmon_gemini_key";
const MODEL_LS = "yadmon_gemini_model";

export function getKey() { return localStorage.getItem(KEY_LS) || ""; }
export function setKey(k) { if (k == null) return; localStorage.setItem(KEY_LS, k.trim()); }
export function hasKey() { return !!getKey(); }
export function getModel() { return localStorage.getItem(MODEL_LS) || config.geminiModel; }
export function setModel(m) { localStorage.setItem(MODEL_LS, m); }

// Verbatim system directive + the appended hard rules (§8).
const HARD_RULES =
  "\n\nHard rules: speak in first person as the companion; never invent or " +
  "estimate numbers; if a number isn't in the context packet, don't mention " +
  "numbers; keep it under 25 words, one or two short sentences; output plain " +
  "text only (no markdown, no quotes).";

// --- rate limiter: token bucket 8/min + daily cap ---------------------------
let tokens = 8, lastRefill = Date.now();
let dailyCount = 0, dailyDate = null;
function today() { return new Date().toISOString().slice(0, 10); }
function refill() {
  const now = Date.now();
  tokens = Math.min(8, tokens + ((now - lastRefill) / 60000) * 8);
  lastRefill = now;
}
export function budgetLeft() {
  if (dailyDate !== today()) return config.dailyBrainCap;
  return Math.max(0, config.dailyBrainCap - dailyCount);
}

// Try to reserve a call slot. Ambient chatter is dropped first under pressure.
function reserve(ambient) {
  if (dailyDate !== today()) { dailyDate = today(); dailyCount = 0; }
  if (dailyCount >= config.dailyBrainCap) return false;
  refill();
  if (ambient && tokens < 2) return false; // shed ambient first
  if (tokens < 1) return false;
  tokens -= 1; dailyCount += 1;
  return true;
}

// --- the call ---------------------------------------------------------------
// Returns { text } on success, { skip:true } when deliberately not calling
// (no key / rate-limited), or throws on network/API error (→ silent emote).
export async function say(moment, ctxPacket, { ambient = false } = {}) {
  if (!hasKey()) return { skip: true, reason: "nokey" };
  if (!reserve(ambient)) return { skip: true, reason: "rate" };

  const system = config.toneDirective + HARD_RULES;
  const user =
    `Moment: ${moment}\n` +
    `Context packet (only real numbers; do not invent any):\n${JSON.stringify(ctxPacket)}\n` +
    `Say ONE short in-character line for this exact moment.`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 80, topP: 0.95 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent?key=${encodeURIComponent(getKey())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("gemini " + res.status);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("empty");
  return { text: text.replace(/^["']|["']$/g, "") };
}
