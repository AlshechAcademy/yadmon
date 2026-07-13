// YADMON — config.js
// Appendix A seed values + committed PUBLIC cloud config (see PLAN.md §2).
//
// SECRETS POLICY: this file contains ZERO secrets and is safe in a public repo.
//   - The Firebase web `apiKey` below is public by design; security is enforced
//     by Firestore rules + Auth (locked to steven@alshechacademy.org), not by
//     hiding this value.
//   - The OAuth Client ID is public by design; it only works from the
//     authorized JavaScript origin (https://alshechacademy.github.io).
//   - The Gemini API key is NEVER in this file. It lives only in the browser's
//     localStorage, pasted once via the in-app setup screen (Phase 6).

// ---------------------------------------------------------------------------
// Public cloud config (committed, per §2) — provisioned in Phase 0
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "AIzaSyDvwmxFYUuNv1GdchkGMkqFMcHFVbT97Es",
  authDomain: "yadmon.firebaseapp.com",
  projectId: "yadmon",
  storageBucket: "yadmon.firebasestorage.app",
  messagingSenderId: "131501271611",
  appId: "1:131501271611:web:2d64e66f14645910ba4a1e",
};

// Google Identity Services (GIS) token client
export const googleClientId =
  "131501271611-f63fh6pgtr6llevj8aauq37id6g2vs9p.apps.googleusercontent.com";

// Read-only Google Calendar scope
export const googleScopes =
  "https://www.googleapis.com/auth/calendar.readonly";

// ---------------------------------------------------------------------------
// Appendix A — app behavior config (editable in Settings; mirrored to Firestore
// config/app). Changing values here changes behavior without touching logic.
// ---------------------------------------------------------------------------
export const config = {
  workdays: [0, 1, 2, 3, 4], // Sun–Thu, JS getDay() convention (0 = Sunday)
  timezone: "America/New_York",
  windowStart: "08:30",
  windowEnd: "14:30",
  coreWindowStart: "09:00",
  recapTime: "14:25",
  calendarId: "primary",
  pollSeconds: 60,
  ownerEmail: "steven@alshechacademy.org",
  starterSpecies: 2, // Aquafin (chosen starter)
  geminiModel: "gemini-2.5-flash-lite",
  dailyBrainCap: 120,
  toneDirective:
    "You're my scrappy pixel sidekick and hype-man: talk like a sharp best friend — casual, punchy, playful, a little cheeky, always real, never corporate. Celebrate hard when my numbers earn it, be honest when they don't, keep every bubble under 25 words, and only ever reference the real numbers you're given.",
  selfCareSeeds: [
    "stretch",
    "step outside",
    "make tea",
    "rebounding",
    "tai chi",
    "shadowboxing",
    "hang from the pull-up bar",
    "pull-ups",
    "push-ups",
    "burpees and squats",
    "give the dogs some love",
    "smoke weed",
  ],
  blockRegistry: [
    { id: 1, match: ["linkedin outbound"], care: "water", metric: "LinkedIn voice memos sent" },
    { id: 2, match: ["whatsapp outbound"], care: "fruit", metric: "WhatsApp voice memos sent" },
    { id: 3, match: ["mass email"], care: "love", metric: "connections contacted" },
    { id: 4, match: ["outbound social media"], care: "walk", metric: "voice memos/DMs to new social connections" },
    { id: 5, match: ["respond to inbounds"], care: "play", metric: "inbound messages responded to" },
    { id: 6, match: ["serve oasis"], care: "bath", metric: "Oasis lessons/posts created" },
    { id: 7, match: ["refine website"], care: "groom", metric: "website updates made" },
    { id: 8, match: ["one unique content"], care: "exercise", metric: "content pieces posted" },
    { id: 9, match: ["automation development"], care: "treats", metric: "automations created/updated" },
    { id: 10, match: ["trello task update"], care: "rest", metric: "tasks moved to Done" },
  ],
};

export default config;
