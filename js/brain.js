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

// --- model discovery / self-heal (Phase 7) ----------------------------------
// The plan's default model id may not exist on a given key. List the account's
// usable models and auto-pick the best flash-lite/flash, saving it. Fixes the
// perpetual "…!" caused by an invalid model id.
const MODEL_PREFS = [
  "gemini-2.5-flash-lite", "gemini-2.5-flash-lite-preview-06-17",
  "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash",
  "gemini-1.5-flash-8b", "gemini-1.5-flash",
];

export async function listModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(getKey())}`);
  if (!res.ok) throw new Error("models list HTTP " + res.status);
  const d = await res.json();
  return (d.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}

// A model can be *listed* yet still 404 on generateContent for a given key/
// region. So we TEST an actual tiny generation and pick the first that works.
async function testModel(model) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(getKey())}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 5 } }),
    });
    return res.ok;
  } catch { return false; }
}

// Verify the key + pick a model that ACTUALLY responds to generateContent.
export async function verifyAndPickModel() {
  if (!hasKey()) return { ok: false, error: "no key set" };
  let models;
  try { models = await listModels(); }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
  if (!models.length) return { ok: false, error: "this key has no models that support generateContent" };
  const pref = MODEL_PREFS.filter((p) => models.includes(p));
  const flashes = models.filter((m) => /flash/.test(m) && !pref.includes(m));
  const rest = models.filter((m) => !pref.includes(m) && !flashes.includes(m));
  for (const c of [...pref, ...flashes, ...rest]) {
    if (await testModel(c)) { setModel(c); return { ok: true, model: c, count: models.length }; }
  }
  return { ok: false, error: `none of ${models.length} models answered generateContent — check the Generative Language API is enabled for this key` };
}
