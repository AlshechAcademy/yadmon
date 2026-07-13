# YADMON — Build Plan (v1.0)
**A pixel companion that runs your workday, tracks your numbers, and grows with your business.**
Working title "YADMON" — your companion is a Yadmon. Rename anytime. Single user: Steven, Alshech Academy. Total running cost: $0.

---

## 0. How to use this document

This plan is fed to **Claude Cowork** one phase at a time (see §12). Each phase tells Cowork exactly what to build, tells you exactly what you'll do (all clicking, no coding), and ends with an acceptance test you can verify with your own eyes.

**Workflow:** this file lives in the working folder (and in the repo) as `PLAN.md`, so every session can read all of it — you never paste the plan itself. You start each phase by pasting that phase's short kickoff prompt into a Cowork session; Cowork reads the referenced sections, works, and asks you for whatever it needs along the way (sign-ins, choices, testing). A phase is done only when you've watched its acceptance test pass. At the end of every phase, Cowork must update `PROGRESS.md` (what's done / what's next / open issues) so the next session orients itself in seconds. The owner — not Claude — decides when to start the next phase.

Sections §1–§11 are the specification. Cowork treats them as the source of truth. Anywhere this document says "config," the value lives in Appendix A and is changeable without touching code logic.

---

## 1. Final rulings register

These are the judgment calls made where the owner's answers were silent or ambiguous. Each is implemented as specified below. If any is wrong, correct it before Phase 2.

1. **Workweek is Sunday–Thursday** (owner-confirmed; the original spec stands). Friday and Saturday are the only rest days — the companion sleeps those two days regardless of calendar. Workdays are a config array (`[0,1,2,3,4]` in JavaScript `getDay()` convention, where 0 = Sunday) so expanding to 7 days later is a one-line change.
2. **Every calendar date gets a Firestore row ("no empty cells"), but rest-day rows are flagged `rest: true` and excluded from ALL math** — averages, comparisons, streaks, neglect. Missed *workdays* are written as 0 and ARE included in averages.
3. **A confirmed 0 never counts as care.** Care requires a confirmed value ≥ 1. (Otherwise reporting 0 after a 0 would feed the pet forever.) The ≥50% test only applies when the previous workday's value was ≥ 1.
4. **Metric 11 (calls) counts on the day the call occurs** — that's when the app sees it, asks about it, and asks the follow-ups.
5. **After a death, the new companion starts at base form**: all trait levels 0, maturity stage 0, all neglect states cleared (birth grace). The dead companion is archived at its final appearance and becomes a background NPC. The business data in Firestore is never touched — baselines for the 50% rule continue from real history.
6. **If a month ends with zero improved metrics, the evolution still fires**: the least-declined metric wins, framed as "held the line." The monthly growth ritual never skips.
7. **Default calendar = the account's primary calendar** (`calendarId: "primary"` in config; changeable in Settings if the blocks live on a sub-calendar).
8. **The companion's day closes at 2:30 PM.** Any unconfirmed number at close becomes a miss (0). Confirm prompts stay on screen until answered or close.
9. **No preset companion dialogue, ever.** Every speech bubble is a live Gemini generation. Static text is allowed only for app chrome (buttons, labels, system alerts). If the Gemini API is unreachable, the companion emotes silently ("…!") — it never falls back to canned lines.
10. **Music quality bar**: original compositions only, written in the idiom of classic Game Boy soundtracks (catchy pulse-wave leads, arpeggiated harmony, noise-channel percussion). Never reproduce actual Nintendo/Game Freak melodies — style, not songs. Phase 5 includes a listen/veto/recompose loop until the owner approves every theme.
11. **Sprites are deterministic data, never runtime-generated art** (see §8). AI image generation is permitted only at build time for concepting, after which everything is transcribed to pixel matrices and frozen.

---

## 2. Stack & architecture

**Form factor:** a single-page web app. Pure HTML + CSS + vanilla JavaScript ES modules. No framework, no build step, no bundler, no compiler — the repo IS the app. Runs in Chrome on the second monitor; Chrome menu → Cast/Save → "Install app" gives it a chromeless standalone window; F11 for fullscreen.

**Hosting:** GitHub Pages from a public repo on the owner's free GitHub account (free plan requires the repo to be public — this is fine because the repo contains zero secrets; see below). URL: `https://<username>.github.io/yadmon/`.

**Backend:** Firebase Spark plan (free, no credit card).
- **Firebase Auth** — Google sign-in, locked to `steven@alshechacademy.org`.
- **Cloud Firestore** — all metric data + companion state (§7).
- No Cloud Functions, no Cloud Storage (removed from Spark in 2026 anyway) — not needed.

**Google Calendar:** read-only, called directly from the browser via Google Identity Services (GIS) token client + Calendar API `events.list`. The OAuth consent screen is set to **Internal** (possible because the account is Google Workspace) — no verification, no user cap, no 7-day token expiry, no warning screens. Silent token renewal while the Google session is active.

**Companion brain:** Gemini API free tier. Key created in Google AI Studio (works with Workspace accounts; it's on by default org-wide, and the owner is the admin if a toggle is needed; fallback: create the key from a personal Gmail — a key is a key). Default model `gemini-2.5-flash-lite` (highest free daily quota), with a model picker in Settings.

**Secrets policy (critical, because the repo is public):**
- The Gemini API key is NEVER committed. On first run the app shows a one-time setup screen; the owner pastes the key; it lives only in the browser's `localStorage`.
- The Firebase web config object IS committed — it is public by design; security lives in Firestore rules + Auth.
- The OAuth client ID is committed — also public by design; it only works from the authorized origin.
- Recommended hardening: the AI Studio key is restricted to the Gemini API (new AI Studio keys are restricted "auth keys" by default as of 2026).

**Repo layout:**
```
/index.html          app shell
/css/app.css
/js/main.js          boot + wiring
/js/engine.js        state machine & scheduler (§5)
/js/calendar.js      GIS auth + Calendar polling
/js/rules.js         care / celebration / neglect / death / evolution math (§6)
/js/store.js         Firestore reads/writes + data model (§7)
/js/brain.js         Gemini client, context packets, rate budget (§8... §7 brain)
/js/sprites.js       renderer + trait systems (§8)
/js/sprites-data.js  species matrices & overlay stages (generated in Phase 4)
/js/audio.js         GB-style synth engine (§9)
/js/audio-data.js    note-array compositions (generated in Phase 5)
/js/ui.js            HUD, drawer, inputs (§10)
/js/config.js        Appendix A values
/js/debug.js         time machine (§12, Phase 2)
```

---

## 3. Block registry & the 13 metrics

Core blocks are recognized by **keyword matching on event titles** (case-insensitive, match on the distinctive prefix so minor edits or truncation never break detection). The calendar is the source of truth for *times* — blocks may move day to day and the app follows. Default times below are documentation only.

| # | Match keyword(s) | Canonical title | Default time | Care type | Metric (integer/day) | Care button |
|---|---|---|---|---|---|---|
| 1 | `linkedin outbound` | LinkedIn Outbound - AA Outreach | 9:00–9:30 | Give water | LinkedIn voice memos sent | Water droplet (splash per tap) |
| 2 | `whatsapp outbound` | WhatsApp Outbound - AA Outreach | 9:30–9:50 | Give fruit | WhatsApp voice memos sent | Fruit bouquet (random fruit per tap) |
| 3 | `mass email` / `mass email/sms` | Mass Email/SMS - AA Outreach | 10:00–10:20 | Love & pets | Connections contacted | Petting hand (hearts per tap) |
| 4 | `outbound social media` | Outbound Social Media - AA Outreach | 10:20–10:50 | Go for a walk | Voice memos/DMs to new social connections | Leash (footsteps per tap) |
| 5 | `respond to inbounds` | Respond to Inbounds - AA Outreach | 11:00–11:50 | Playtime with toy | Inbound messages responded to | Toy ball (bounce per tap) |
| 6 | `serve oasis` | Serve Oasis Members - AA Fulfillment | 12:00–12:30 | Bath/wash | Lessons/posts created in The Oasis | Soap bar (bubbles per tap) |
| 7 | `refine website` | Refine Website - AA Marketing | 12:30–12:50 | Grooming | Website updates/changes made | Brush (sparkle-stroke per tap) |
| 8 | `one unique content` | One Unique Content Piece - AA Marketing | 1:00–1:30 | Exercise | Content pieces posted | Dumbbell (flex per tap) |
| 9 | `automation development` | Automation Development - AA Ops | 1:30–1:50 | Treats | Automations created/updated | Treat cookie (chomp per tap) |
| 10 | `trello task update` | Trello Task Update - AA Ops | 1:50–2:00 | Rest / put to bed | Tasks moved to Done today | Pillow (yawn per tap) |

**The call funnel (metrics 11–13)** — dynamically logged, **excluded** from care, celebrations, neglect, and evolution; **included** in analytics and the brain's context:

| # | Metric | How it's captured |
|---|---|---|
| 11 | Calls generated (occurring today) | Any non-core timed event → companion asks "sales call?" [Yes/No]. Yes = +1. |
| 12 | Calls attended | On wake after each tagged call: "did they show?" [Yes/No]. |
| 13 | Signups from calls | If attended: "did they sign up for something?" [Yes/No]. |

Unanswered call follow-ups are re-asked at the next free moment; still unanswered at 2:30 → recorded as no-show and flagged in the recap with a one-tap fix. A "Fix a number" panel in Settings allows correcting any of today's 13 values before day close.

---

## 4. The daily state machine

Active window (config): **8:30 AM – 2:30 PM, Sunday–Thursday**, America/New_York, all times wall-clock (DST-safe because event boundaries come from the calendar).

**8:30 — WAKE.** Sunrise animation, slow wake-up music. The companion runs its own visible little morning routine (stretch → splash face → tiny snack) while asking one dynamic open question about the owner's 8:00–8:30 morning routine (free-text or quick-reply; not stored as a metric). Then the **DAY SCAN**: fetch today's calendar, render the timeline strip, announce the lineup, and flag anomalies — a missing core block ("no Refine Website on the board today — that's a 0 at close unless it shows up"), moved blocks, and "sales call?" questions for every visible non-core timed event. On the first workday of a new month, the **evolution ceremony** (§6.5) runs here.

**9:00–2:30 — MAIN LOOP.** At every tick (1 s UI tick; 60 s calendar re-poll) the engine resolves the current state by priority:

1. **NON-CORE TIMED EVENT in progress → SLEEP.** Silence. Sleeping sprite. If a core block is overlapped, it **ends early with the full normal ending** — confirmation, celebration/disappointment, Firestore write — executed right before sleep begins. On wake, if the event was a tagged call, run the attended/signup follow-ups, then resume whatever the calendar says is next.
2. **CORE BLOCK in progress → WORK.** Focus music (per-block seeded variation). The block's themed care button is live: each tap = +1 tally with its unique animation/SFX; an undo button decrements. T−60 s warning chirp. At block end: confirmation flow — "you sent 18 LinkedIn voice memos — correct?" [Yes/No → number pad if No] → celebration tier or disappointment (§6.2) → write.
3. **Otherwise → FREE TIME.** Energizing music. The companion lives its ambient life and periodically (≥ 15 min spacing) delivers a dynamic self-care nudge — roughly half the time drawing on the owner's seed list (Appendix A), otherwise its own inspiration — always framed as "the #1 thing that would refill your cup right now." T−2 min "get ready" chirp before the next block.

Edge rules: core blocks are recognized only inside 9:00–2:30; if two core blocks overlap each other, the earlier start wins and the later begins when it ends; a block running past 2:30 clamps at 2:30. All-day events are ignored entirely. Events marked "Free" are ignored. New events appearing mid-day are detected within 60 s and trigger the call question as a small non-blocking toast (queued if a block is live).

**2:25 — RECAP.** The daily ceremony: scorecard of all 10 metrics with their celebration badges, the funnel line (memos → calls → attended → signups, today and trailing 7 workdays), any neglect warnings, one data-grounded suggestion (§11), goodnight.

**2:30 — SLEEP** until the next workday's 8:30. Opening the app on Friday/Saturday or outside the window shows the sleeping scene (silent) with the next wake time.

---

## 5. (Reserved — merged into §4.)

## 6. Rules engine — exact math

All rules operate per metric m ∈ {1..10} on workday close values. `v(D)` = confirmed integer for day D. Missed = no confirmation by 2:30 → `v = 0`, `missed = true`. Rest days excluded everywhere.

### 6.1 Care test
Let `B` = previous workday's stored value (may be 0).
```
careReceived = confirmed AND v ≥ 1 AND (B < 1 OR 2·v ≥ B)
```
That is: any confirmed value ≥ 1 counts as care when yesterday was a 0/miss (baseline reset, per owner); otherwise the value must be at least 50% of the previous workday. Integer-safe via `2·v ≥ B`. Exception: while a metric is NEGLECTED, this test is suspended and §6.3's two-day protocol governs.

### 6.2 Celebration tiers (evaluated at confirmation, against history strictly before today)
Averages use the last N *workday* rows (misses included as 0; partial windows allowed if fewer exist).
Priority order — pick exactly one:
1. **FIRST-EVER** — no prior workday data exists for m → special "first!" jingle.
2. **MONTH BEST** (tier 4 mega-fanfare) — `v > max(prior workdays this calendar month)`, requires ≥ 1 prior day this month.
3. **BEATS 7-DAY** (tier 3) — `v > mean(last 7 workdays)`.
4. **BEATS 3-DAY** (tier 2) — `v > mean(last 3 workdays)`.
5. **BEATS YESTERDAY** (tier 1) — `v > previous workday's v`.
6. Else → **disappointment**: the companion visibly wants more of that specific care type.

### 6.3 Neglect state machine (per metric)
State: `OK(counter c)` or `NEGLECTED(clearStep)`.
- **OK, at each workday close:** `careReceived → c = 0`; else `c += 1`; if `c ≥ 3` → NEGLECTED (`clearStep = 0`), trait shows its neglect visual, alert sting plays.
- **NEGLECTED, at each workday close:**
  - `clearStep 0`: confirmed `v ≥ 1` → `clearStep = 1`, remember `vClear = v` (any number qualifies for day one, per owner). Missed or 0 → stay at step 0.
  - `clearStep 1`: confirmed AND `v ≥ 1` AND `2·v ≥ vClear` → **CLEARED** (state OK, `c = 0`). Confirmed but `2·v < vClear` → that day is itself an underreport: stay NEGLECTED, `clearStep` resets to 0. Missed → `clearStep` resets to 0.

### 6.4 Death
After all metrics update at a workday close: if **3 or more metrics are NEGLECTED simultaneously → immediate death**. Brief respectful 8-bit dirge + memorial card. Archive the companion (final trait snapshot, dates, the three cause metrics). Spawn the next species from the pool at base form, all neglect cleared (ruling #5). Retired companions render as 16×16 minis roaming the scene background forever. No hibernate toggle exists. Hardcore by design.

### 6.5 Monthly evolution
Trigger: first wake of a new calendar month. For each metric, `a(M)` = mean over month M's workdays (misses = 0). Score:
```
score = (a(M) − a(M−1)) / a(M−1)          if a(M−1) > 0
score = +∞ tier, ranked by a(M)            if a(M−1) = 0 and a(M) > 0
ineligible                                  if both 0
```
Winner = highest score; tie → larger absolute gain; still tied → lowest block number. First month ever: winner = largest total. All-decline month: least-negative score wins ("held the line," ruling #6). Winner's **trait milestone level += 1** with a full evolution ceremony (theme music, flash, before/after). Every **6 cumulative milestone levels** across all traits → **maturity stage += 1** (silhouette grows — the year-one "stage 3" arc: ~12 levels/yr ≈ 2 stages/yr, unlimited forever).

### 6.6 Bootstrapping (week one)
No baselines yet → every confirmed `v ≥ 1` is care; first confirmation of each metric fires FIRST-EVER; averages use whatever partial history exists from day two onward.

---

## 7. Firestore data model & security

```
days/{YYYY-MM-DD}
  rest: bool
  m1..m10: int          // confirmed or 0
  care1..care10: bool
  missed1..missed10: bool
  m11_calls: int
  m12_attended: int
  m13_signups: int
  callLog: [{title, start, end, attended, signedUp}]

state/companion
  id, name, speciesIdx, bornDate
  traitLevels: {t1..t10: int}
  maturityStage: int
  neglect: { m1: {state, c, clearStep, vClear}, ... m10 }

companions/{id}          // archive, written on death
  speciesIdx, name, born, died, traitSnapshot, causeMetrics

config/app               // mirrors Appendix A; editable in Settings
```

Rows are created lazily; rest-day rows are backfilled at the next wake. Security rules (whole database):

```
match /{document=**} {
  allow read, write: if request.auth != null
    && request.auth.token.email == "steven@alshechacademy.org";
}
```

Settings includes **Export CSV** (all `days` rows, dates × 13 metrics) as the standing backup.

---

## 8. The companion's brain (Gemini)

**Model:** `gemini-2.5-flash-lite` (default; picker in Settings). **Key:** pasted once into Settings → `localStorage` only.

**One utterance = one API call. Zero canned companion lines** (ruling #9). Each call sends:

- **System directive** (verbatim, per owner's request for "a sentence or two"):
  > You're my scrappy pixel sidekick and hype-man: talk like a sharp best friend — casual, punchy, playful, a little cheeky, always real, never corporate. Celebrate hard when my numbers earn it, be honest when they don't, keep every bubble under 25 words, and only ever reference the real numbers you're given.
- **Hard rules appended:** speak in first person as the companion; never invent or estimate numbers; if a number isn't in the context packet, don't mention numbers; output plain text only.
- **Context packet (JSON):** `{ moment, clock, todayBlocks+status, metricStats (yesterday / 3-day / 7-day / monthBest for the relevant metric), neglectStates, funnel (today + trailing 7 workdays), streaks, celebrationTier, selfCareList (free-time moments only), calendarDelta }`.

**Moment catalog & daily budget (~55–60 calls typical, hard cap 120):** wake 1 · morning-routine exchange 1–2 · day scan 1 · block starts 10 · confirmation intros 10 · celebration/disappointment reactions 10 · free-time nudges ≤ 6 · call tagging ≤ 4 · call follow-ups ≤ 4 · recap 1 · ambient chatter ≤ 8 (min 20-min spacing) · event moments (neglect/evolution/death) ≤ 3. Rate limiter: token bucket at 8/min with a queue; on 429, exponential backoff and ambient chatter is dropped first. Scheduled beats fire the request ~10 s early so the bubble lands on time.

**Failure mode:** network/API error → companion emotes silently ("…!" bubble + animation), small status dot in the HUD, retry at the next moment. Never canned dialogue.

---

## 9. Sprite system — continuity-guaranteed evolution

**The owner's #1 art requirement:** upgrades must never break continuity — nothing changes except the upgraded trait. The solution: **the base sprite is data and is never redrawn.** All evolution is deterministic transformation of that data. Continuity isn't a goal we aim for; it's guaranteed by construction.

**Format:** 32×32 palette-indexed matrices stored as code (`sprites-data.js`), 4 colors + outline + transparent per sprite (Game Boy Color–era feel, matching the colorful care buttons), rendered to canvas with `imageSmoothingEnabled = false` and integer nearest-neighbor scaling — crisp at any window size.

**Species pool:** 5 original creatures (original species — legally distinct from Pokémon or any existing IP), each with a pose set: idle ×2, walk ×2, sleep ×2, eat, drink, play, bathe, flex, sad, celebrate ×2, faint. Authored in Phase 4 via a live preview page; the owner approves every base before lock. Optional: AI-generate concept images first for the owner to pick a direction, then transcribe to matrices (build-time only, ruling #11).

**Ten trait systems** — mostly *parametric* (a number drives pixels, so "level 23" needs no unique artwork), with a few small authored overlay stages anchored to fixed rig points (~4 stages per trait ≈ 40 small overlays total, not 300–400):

| Trait (block) | Level 1→∞ expression |
|---|---|
| Shine (LinkedIn/water) | Highlight-pixel density ramp + sparkle particle count scales with level |
| Size (WhatsApp/fruit) | Body scale 1 + 0.04·level in integer-safe steps |
| Affection (Mass Email/love) | Blush intensity + orbiting heart particles |
| Explorer (Social/walk) | Stance widens; overlay stages: bandana → boots → satchel → map |
| Play (Inbounds/toy) | Toys accumulate on the scene shelf; bounce animation speeds up |
| Clean (Oasis/bath) | Outline glow + soap-bubble particle aura |
| Coat (Website/grooming) | Hair strands extend procedurally + luster highlights; mane overlay stages |
| Buff (Content/exercise) | Limb pixel bulk at stages + unlocked flex pose |
| Bling (Automation/treats) | Collar → gem collar → chain → tiny crown overlay stages + sparkle |
| Serenity (Trello/rest) | Nightcap stages + calm aura + slower, contented blink |

**Maturity stages** (every 6 total levels): silhouette extension per species, 3 authored stages to start; stage 4+ continues via parametric growth. **Neglect visuals:** each trait's inverse (dull, shrunken, dirty, matted, weak, restless…) plus a sad idle whenever any neglect exists. **Death variants:** the next species in the pool — different silhouette and palette, same rig, same trait systems. **Retirees:** 16×16 minis rendered from their archived trait snapshot, wandering the background.

---

## 10. Audio — Game Boy–class engine

**Engine:** Web Audio API, four classic voices — pulse ×2 (selectable duty cycles), triangle/wave, and noise — driven by tracker-style note arrays in `audio-data.js`. Master volume + mute in the HUD. Audio unlocks on the first user click (browser autoplay policy), which the wake screen naturally provides.

**Themes** (authored motifs + a daily seed that varies key, tempo ±, and arrangement order so nothing loops stale):
- **WAKE** — gentle ~70 bpm sunrise lullaby (8:30–9:00)
- **FOCUS** — driving, low-intensity arpeggio loop, seeded per block (during core blocks)
- **FREE** — bouncy major-key energizer (unblocked time)
- **Silence** — sleep mode, always (ruling: sleep = absolute silence)

**SFX/jingle set:** block-start countdown · T−60 s chirp · T−2 min get-ready chirp · confirm-ask blip · celebration tiers 1–4 (escalating: two-note chirp → riff → fanfare → full 4-bar mega-fanfare) · FIRST-EVER jingle · disappointment motif · neglect sting · evolution ceremony theme · death dirge · call-tag blip · tap sounds unique to each care button.

**Quality bar:** iconic-Game-Boy caliber comes from *composition*, not synthesis. Phase 5 is an explicit listen → veto → recompose loop; nothing ships until the owner approves each theme. Original melodies only (ruling #10).

---

## 11. UI layout & the intelligence layer

**Layout:** the scene canvas (companion's room — toys, trophies, and retirees accumulate over months) fills the window. Top: today's timeline strip with a now-cursor and countdown to the next boundary. Above the companion: the speech bubble. Bottom-right: the **care button** (block-themed, huge, satisfying) with the live tally and an undo. Quick-reply chips for Yes/No, a number pad for corrections, one small text input for open exchanges. A slide-in drawer holds **Stats** (10 sparkline cards, funnel view, month view) and **Settings** (Gemini key, model, calendar ID, volume, workdays, fix-a-number, export CSV, time machine). Everything scales by integer pixel factors — clean windowed or fullscreen.

**Intelligence layer (the "make me money" engine):** every recap and a deeper Thursday **week debrief** feed the brain a stats packet including funnel conversion math — memos sent (m1+m2+m4) → calls generated (m11) → attended (m12) → signups (m13) — per-channel trends, and metric correlations across trailing 30 workdays. The suggestion rule: **the companion may only recommend actions justified by the owner's own numbers, and must cite them** ("your WhatsApp memos are booking calls at ~2× your LinkedIn rate this month — steal 10 minutes from block 1 for block 2"). Verified means verified against the database, never generic guru advice.

---

## 12. Build phases for Claude Cowork

Each phase: kickoff prompt → Cowork builds → owner clicks through the acceptance test. Phase 2 delivers the **time machine** (debug panel: set a fake "now," compress a day to 20 minutes, inject fake history) — this is how death, month rollovers, and neglect get tested in minutes instead of weeks.

**Phase −1 — Wire up Cowork (one time, ~15–20 min).** Install or update Claude Desktop for Windows (Cowork requires the latest Windows version), open Cowork from the mode picker, and run `/setup-cowork` in your first session for the guided setup. Create a folder `Documents\yadmon`, put this file in it as `PLAN.md`, and select that folder via "Work in a folder." Recommended: make YADMON a Project, since Projects carry files, instructions, and memory across Cowork sessions. Note what does NOT need connecting: Firebase, Google Cloud, and AI Studio have no Cowork hookup at all — they're browser consoles you click through in Phase 0 while Cowork dictates every click; the only handshake is pasting the (non-secret) Firebase web config into chat. GitHub is the one real connection, established once by the verification prompt below — Cowork will use whichever path its environment provides (the GitHub connector, or git with a one-time repo-scoped token it walks you through creating).

*Verification prompt (paste verbatim as your first message):* "Before we build anything: (1) create hello.txt in this folder so I can confirm you have file access; (2) tell me whether you can run shell commands and whether git is available in your environment; (3) connect to my GitHub account — walk me through every click of the one-time authorization — then create a public repo named yadmon, push this folder including PLAN.md, enable GitHub Pages on main, and give me the live URL; (4) write PROGRESS.md recording what's done and what Phase 0 needs. If any step isn't possible in your environment, stop and tell me the simplest workaround before doing anything else."

*Accept:* the `yadmon` repo is visible on github.com with `PLAN.md` inside, hello.txt appeared in your folder, and the Pages URL loads in your browser.

**Phase 0 — Accounts & keys (owner + Cowork walkthrough, ~45 min).** Checklist in §13. Accept: all six checklist items done.

**Phase 1 — Skeleton + calendar.** Repo created, GitHub Pages live, Google sign-in works, calendar polls every 60 s, timeline strip renders the real day, core blocks recognized by keyword.
*Accept:* strip matches Google Calendar; drag an event in GCal → strip updates within 60 s.
*Kickoff prompt:* "Read PLAN.md §2, §3, §4 and PROGRESS.md. Build Phase 1 exactly as specified and walk me through deploying it to GitHub Pages." (Every later phase follows the same pattern: "Read PLAN.md §X and PROGRESS.md. Build Phase N. Update PROGRESS.md when done.")

**Phase 2 — Engine + data.** Full state machine (§4): sleep/work/free resolution, early-cut blocks with full ending flow, call tagging + follow-ups, care button + tally + undo, confirmation flow, Firestore writes, fix-a-number, **time machine**.
*Accept:* run a fake 20-minute day via time machine; verify every row and field in the Firestore console; verify an overlap cuts a block early with a full confirmation.

**Phase 3 — Rules engine.** §6 exactly, plus recap. Ship with a scripted scenario suite run through the time machine:
(1) first day ever, (2) three misses → neglect, (3) successful 2-day clear, (4) failed clear via <50% day two, (5) three simultaneous neglects → death → new companion + retiree, (6) month rollover → evolution + maturity bump, (7) cut-short block, (8) tier priority (month-best beats all).
*Accept:* all 8 scenarios pass on screen and in Firestore.

**Phase 4 — Sprites.** §9: renderer, 5 species, pose sets, 10 trait systems, neglect visuals, maturity stages, retirees, preview page.
*Accept:* owner approves each species and scrubs a "level slider" 0→40 per trait with zero continuity breaks.

**Phase 5 — Audio.** §10: engine, 3 themes, full jingle set, daily-seed variation.
*Accept:* listen/veto/recompose loop until every theme is approved; sleep is verified silent.

**Phase 6 — Brain.** §8: Gemini client, context packets, moment catalog, budget/limiter, silent-failure mode, tone directive.
*Accept:* a full simulated day via time machine with live dialogue at every moment; pull the network cable → companion emotes silently.

**Phase 7 — Shakedown.** One real week Sun–Thu with the owner reporting bugs to Cowork daily; polish, CSV export verified, done.

---

## 13. One-time setup checklist (Phase 0)

1. **Google Cloud project** "yadmon" under the Workspace account → **OAuth consent screen: Internal** (Workspace superpower: no verification, no user cap, no token expiry) → enable **Google Calendar API** → create **OAuth Web client** with authorized JavaScript origin `https://<username>.github.io`.
2. **AI Studio key**: aistudio.google.com → Create API key (Workspace accounts supported; it's enabled by default org-wide — if blocked, the owner flips the Admin console toggle, or creates the key from a personal Gmail as fallback). Keep restricted to Gemini API.
3. **Firebase project** (Spark) → Authentication → Google provider on → add `<username>.github.io` to authorized domains → create Firestore → paste security rules from §7.
4. **GitHub**: create public repo `yadmon` → Settings → Pages → deploy from `main`. (Already done if Phase −1 completed.)
5. Open the live URL → first-run setup screen → paste Gemini key → sign in with Google → grant calendar read-only.
6. Confirm timezone America/New_York and calendar ID in Settings.

## 14. Free-tier budget (worst case vs. quota)

| Resource | YADMON daily use | Free quota | Headroom |
|---|---|---|---|
| Gemini API | ≤ 120 requests (typ. ~60) | ~500/day (2.5 Flash), more on Flash-Lite | ≥ 4× |
| Firestore writes | ~30 | 20,000/day | 600× |
| Firestore reads | ~300 | 50,000/day | 160× |
| Calendar API | ~600 polls | ~1M/day | vast |
| GitHub Pages | ~5 MB site, 1 user | 1 GB site / 100 GB-mo soft | vast |
| **Total cost** | | | **$0, no card on file anywhere** |

## 15. Risks & mitigations

- **Background-tab throttling:** the app lives visible on monitor 2; the scheduler uses absolute wall-clock comparisons (never accumulated timeouts) and re-syncs on the Page Visibility event, so even a throttled tab lands every boundary correctly.
- **Gemini outage / 429:** silent emote + backoff; ambient chatter sheds first; data capture never depends on the brain.
- **Key exposure:** key never in the repo; 2026 AI Studio auth-keys are API-restricted with leaked-key enforcement; worst case = revoke and paste a new one; Firestore data is protected by rules regardless.
- **Laptop closed mid-day:** confirm prompts persist on reopen; anything unconfirmed at 2:30 is a miss — hardcore by design, owner's explicit choice (no hibernate).
- **Calendar renames:** keyword matching absorbs edits; the 8:30 day scan flags anything unrecognized so the owner fixes the board before 9:00.
- **Public repo visibility:** no secrets committed; block names are visible in code — if that ever bothers the owner, the swap is Firebase Hosting + a GitHub Action (one-time setup, still $0).
- **DST:** all boundaries come from calendar wall-clock times; nothing hardcodes UTC offsets.

---

## Appendix A — Seed config (`config.js` initial values)

```json
{
  "workdays": [0, 1, 2, 3, 4],
  "timezone": "America/New_York",
  "windowStart": "08:30",
  "windowEnd": "14:30",
  "coreWindowStart": "09:00",
  "recapTime": "14:25",
  "calendarId": "primary",
  "pollSeconds": 60,
  "ownerEmail": "steven@alshechacademy.org",
  "geminiModel": "gemini-2.5-flash-lite",
  "dailyBrainCap": 120,
  "toneDirective": "You're my scrappy pixel sidekick and hype-man: talk like a sharp best friend — casual, punchy, playful, a little cheeky, always real, never corporate. Celebrate hard when my numbers earn it, be honest when they don't, keep every bubble under 25 words, and only ever reference the real numbers you're given.",
  "selfCareSeeds": [
    "stretch", "step outside", "make tea", "rebounding", "tai chi",
    "shadowboxing", "hang from the pull-up bar", "pull-ups", "push-ups",
    "burpees and squats", "give the dogs some love", "smoke weed"
  ],
  "blockRegistry": [
    { "id": 1,  "match": ["linkedin outbound"],        "care": "water",    "metric": "LinkedIn voice memos sent" },
    { "id": 2,  "match": ["whatsapp outbound"],        "care": "fruit",    "metric": "WhatsApp voice memos sent" },
    { "id": 3,  "match": ["mass email"],               "care": "love",     "metric": "connections contacted" },
    { "id": 4,  "match": ["outbound social media"],    "care": "walk",     "metric": "voice memos/DMs to new social connections" },
    { "id": 5,  "match": ["respond to inbounds"],      "care": "play",     "metric": "inbound messages responded to" },
    { "id": 6,  "match": ["serve oasis"],              "care": "bath",     "metric": "Oasis lessons/posts created" },
    { "id": 7,  "match": ["refine website"],           "care": "groom",    "metric": "website updates made" },
    { "id": 8,  "match": ["one unique content"],       "care": "exercise", "metric": "content pieces posted" },
    { "id": 9,  "match": ["automation development"],   "care": "treats",   "metric": "automations created/updated" },
    { "id": 10, "match": ["trello task update"],       "care": "rest",     "metric": "tasks moved to Done" }
  ]
}
```

*End of plan. Feed §12 phase by phase to Claude Cowork with this file attached.*
