// YADMON — calendar.js
// Google Calendar read-only access via GIS token client + Calendar REST API.
// Polls today's events and tags core blocks by keyword. (PLAN.md §2, §3, §4)

import { config, googleClientId, googleScopes } from "./config.js";
import { dayBoundsRFC3339, zoneMinutes } from "./time.js";

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0; // epoch ms

// --- GIS token client -------------------------------------------------------

// Wait until the GIS script (accounts.google.com/gsi/client) has loaded.
function waitForGis(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function check() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error("GIS failed to load"));
      setTimeout(check, 100);
    })();
  });
}

export async function initTokenClient() {
  await waitForGis();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: googleClientId,
    scope: googleScopes,
    callback: () => {}, // overridden per-request below
  });
}

// Request an access token. `interactive` shows the consent/account popup;
// non-interactive attempts a silent refresh (requires an active Google session).
export async function requestToken({ interactive = true } = {}) {
  if (!tokenClient) await initTokenClient(); // lazy init if not pre-warmed
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("token client not ready"));
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error));
      accessToken = resp.access_token;
      // expires_in is seconds; refresh a minute early.
      const ttl = (Number(resp.expires_in) || 3600) * 1000;
      tokenExpiry = Date.now() + ttl - 60000;
      resolve(accessToken);
    };
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
    } catch (e) {
      reject(e);
    }
  });
}

export function hasValidToken() {
  return accessToken && Date.now() < tokenExpiry;
}

async function ensureToken() {
  if (hasValidToken()) return accessToken;
  // Try silent first, fall back to interactive if it fails.
  try {
    return await requestToken({ interactive: false });
  } catch {
    return await requestToken({ interactive: true });
  }
}

// --- Fetch + shape events ---------------------------------------------------

// Returns array of shaped events for today, sorted by start.
export async function fetchTodayEvents() {
  await ensureToken();
  const { timeMin, timeMax } = dayBoundsRFC3339();
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("timeZone", config.timezone);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    // token died — force a refresh and retry once
    accessToken = null; tokenExpiry = 0;
    await ensureToken();
    const res2 = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res2.ok) throw new Error(`Calendar API ${res2.status}`);
    return shape((await res2.json()).items || []);
  }
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = await res.json();
  return shape(data.items || []);
}

function shape(items) {
  const out = [];
  for (const ev of items) {
    // Ignore all-day events (§4).
    if (!ev.start?.dateTime || !ev.end?.dateTime) continue;
    // Ignore events marked "Free"/available (§4).
    if (ev.transparency === "transparent") continue;

    const startDate = new Date(ev.start.dateTime);
    const endDate = new Date(ev.end.dateTime);
    const block = matchBlock(ev.summary || "");

    out.push({
      id: ev.id,
      title: ev.summary || "(untitled)",
      description: (ev.description || "").trim(),
      location: (ev.location || "").trim(),
      start: startDate,
      end: endDate,
      startMin: zoneMinutes(startDate),
      endMin: zoneMinutes(endDate),
      core: !!block,
      block, // {id, care, metric} or null
    });
  }
  out.sort((a, b) => a.startMin - b.startMin);
  return out;
}

// Keyword match on the title (case-insensitive substring). (§3)
export function matchBlock(title) {
  const t = title.toLowerCase();
  for (const b of config.blockRegistry) {
    if (b.match.some((k) => t.includes(k))) {
      return { id: b.id, care: b.care, metric: b.metric };
    }
  }
  return null;
}
