# YADMON — Progress Log

_Single source of truth for "what's done / what's next / open issues." Every session updates this._

Last updated: 2026-07-13 (Phase 5 — generative audio; owner listen pending)

---

## Status by phase

- [x] **Phase −1 — Wire up Cowork + GitHub** ✅ DONE
- [x] GitHub Pages enabled by owner → https://alshechacademy.github.io/yadmon/
- [x] **Phase 0 — Accounts & keys** ✅ DONE
- [x] **Phase 1 — Skeleton + calendar** ✅ ACCEPTED (owner verified 2026-07-13: all 10 blocks color-matched, non-core flagged, live drag-sync confirmed)
- [x] **Phase 2 — Engine + data (+ time machine)** ✅ ACCEPTED (owner verified 2026-07-13: compressed day ran, Firestore row written)
- [~] **Phase 3 — Rules engine** 🟡 BUILT — owner accept test pending
- [x] **Phase 4 — Sprites** ✅ (5 species, renderer, 10 trait systems, scene integration; owner chose Aquafin)
- [~] **Phase 5 — Audio** 🟡 BUILT — owner listen/veto/recompose pending
- [ ] **Phase 6 — Brain (Gemini)** ← next after audio approved
- [ ] Phase 7 — Shakedown

---

## Phase −1 — what got done

- File access confirmed: `hello.txt` written to the working folder.
- Shell + tooling confirmed: `git` 2.34.1 ✓, `node` v22.22.3 ✓, `curl`/`wget` present. No `gh` CLI.
- Repo initialized and first commit made.
- GitHub repo created: **https://github.com/AlshechAcademy/yadmon** (public).
- GitHub Pages enabled → https://alshechacademy.github.io/yadmon/

## Environment notes (important for every future session)

- **Git metadata cannot live inside the mounted Windows folder** (`unlink`/rename returns "Operation not permitted" on the mount). Workaround: the git directory lives at `/tmp/yadmon.git` on the sandbox's native filesystem, with `GIT_WORK_TREE` pointed at the mounted project folder. Before any git command:
  - `export GIT_DIR=/tmp/yadmon.git GIT_WORK_TREE=<mounted Yadmon path>`
  - `/tmp` is wiped between sessions — future sessions must re-init the git dir and re-add the `origin` remote (or re-clone from GitHub into `/tmp` and point the work tree at the folder).
- **The GitHub REST API is blocked by the sandbox proxy** (`403 from proxy after CONNECT` to `api.github.com`). Git-over-HTTPS to `github.com` IS allowed. Repo creation and Pages enablement are done by the owner in the GitHub web UI; Cowork handles commits/pushes via git.
- **Git change-detection quirk:** the Windows file editor preserves file mtime, so `git add` may report "nothing to commit" after a real edit. Fix: `touch <file>` before `git add`.
- **Mount write lag (IMPORTANT):** the Linux mount sometimes serves **truncated** copies of files right after the file tools write/edit them (git deploys from the mount, so this would ship a broken file). Detect via `node --check` (JS) and marker/byte-count checks (html/css/md); heal by rewriting the file **through bash** (`cat > file <<'EOF' ... EOF`). Always verify integrity on the mount before `git commit`.
- Auth for pushes uses a classic PAT (`repo` scope) supplied by the owner at push time. Never written to a file or committed — passed inline to the push URL only. A fresh token is needed each session.

## Phase 0 — what got done

- **Google Cloud** project `yadmon`; OAuth consent **Internal**; Calendar API enabled; OAuth **Web** client, JS origin `https://alshechacademy.github.io`.
  - OAuth Client ID (public): `131501271611-f63fh6pgtr6llevj8aauq37id6g2vs9p.apps.googleusercontent.com`
  - Client *secret* is unused (browser token client is a public client) — owner keeps it, never committed.
- **Gemini API key** created in AI Studio, tied to `yadmon`. Held by owner; pasted into the app only at Phase 6, never committed.
- **Firebase** (Spark) on the `yadmon` cloud project. Web app registered. Google Auth on. `alshechacademy.github.io` authorized. Firestore created. §7 security rules published — all reads/writes locked to `steven@alshechacademy.org`.
- **Config committed** to `js/config.js`: Firebase web config + OAuth Client ID (both public per §2) + all Appendix A values. Zero secrets in the repo.

### Collected public values (in js/config.js)
- Firebase projectId `yadmon` · authDomain `yadmon.firebaseapp.com` · messagingSenderId `131501271611`
- App/rules email `steven@alshechacademy.org` · timezone `America/New_York` · calendarId `primary`

## Phase 1 — what got built (ACCEPTED)

Files: `index.html`, `css/app.css`, `js/time.js`, `js/calendar.js`, `js/ui.js`, `js/main.js`.

- Firebase Google sign-in gated to the owner email.
- GIS token client + Calendar REST API, 60 s poll, re-poll on tab-visible. All-day + "Free" events ignored (§4).
- Keyword block recognition → 10 core blocks with care type + metric (§3).
- Timeline strip: 8:30–2:30 window, gridlines, care-colored bars, live now-cursor, countdown. Day panel lists events.
- All positioning is America/New_York wall-clock via `Intl`, DST-safe. 21 unit tests pass.
- Owner verified in browser: blocks color-matched, non-core flagged, live drag-sync in <60 s.

## Phase 2 — what got built

New files: `js/clock.js` (virtual clock), `js/store.js` (Firestore §7 data layer), `js/engine.js` (state machine §4), `js/debug.js` (time machine). Extended: `js/ui.js` (care dock, modal, number pad, toasts, state banner), `js/main.js`, `index.html`, `css/app.css`.

- **State machine (§4):** every 1 s the engine resolves SLEEP / WORK / FREE by priority. Non-core event → SLEEP; core block → WORK; else FREE. Wake before `windowStart`, close at `windowEnd`, rest days skip.
- **Block lifecycle:** entering a core block shows the themed care button; taps = +1 tally, undo decrements. Block end → confirmation modal (Yes = tally, No = number pad) → Firestore write.
- **Early-cut (§4 rule 1):** a non-core event overlapping a running core block finalizes it *with the full confirmation* before sleep. Proven in the self-test (Refine Website cut at 12:35 → m7 = 5, confirmed not missed).
- **Call funnel (§3):** new non-core event → "sales call?" → m11; on end → "did they show?" → m12; "sign up?" → m13; full `callLog`. Unanswered at close → no-show.
- **Day close:** unconfirmed core blocks written as misses (v=0, missed=true).
- **Firestore (§7):** `days/{YYYY-MM-DD}` rows: m1..m10, care/missed flags, m11–m13, callLog. Plus `ensureDayRow`, `writeMetric`, `logCall`, `updateCallFollowup`, `fixField`, `seedDay`, `wipeDate`, `exportCSV`.
- **Time machine (⏳ bottom-right):** virtual now, speed (1×/6×/18×/60×), sim schedule (10 blocks + overlapping call), autoplay, inject history, wipe date, export CSV. "▶ Run a compressed day" one-click.
- **Care rule placeholder:** `care = value>=1` for now — real §6 math lands in Phase 3.

### Self-test (headless, passed)
29/29 assertions. A full compressed day writes a complete `days/2026-07-13` row: all 10 metrics confirmed, m7=5 (early-cut proof), m11_calls=1 with follow-up, no missed blocks. `resolveState` spot-checks for WORK/SLEEP/overlap/FREE all correct.

### Owner accept test (browser at https://alshechacademy.github.io/yadmon/)
1. Sign in → open ⏳ **Time Machine** (bottom-right) → **▶ Run a compressed day now** (today's date, 18×, sim schedule, autoplay).
2. Watch the state banner cycle WORK/SLEEP/FREE and the now-cursor sweep the strip in ~20 min.
3. Firebase console → Firestore → `days/<today>`: verify m1..m10 filled, care/missed flags, m11_calls≥1, callLog populated; the overlap block (Refine Website) cut early but confirmed.
4. Optional manual run: speed 1×, sim off, connect calendar, tap the real care button through a live block to test confirmation + number pad by hand.
5. When done, use **Wipe a day row** to clear sim dates from real data.

## Phase 3 needs (next)
Per PLAN.md §6: care test, celebration tiers, neglect state machine, death, monthly evolution, bootstrapping — plus the 2:25 recap. Ship with the 8-scenario time-machine suite (§12 Phase 3). Replace the Phase-2 `care=value>=1` placeholder with the real §6.1 rule.

## Phase 3 — what got built

New file `js/rules.js` (pure §6 math). Extended `js/store.js` (history + companion state), `js/engine.js` (rules applied at confirm/close/wake/recap), `js/ui.js` (celebration + recap + ceremony UI).

- **Care test (§6.1):** `careReceived = confirmed AND v≥1 AND (B<1 OR 2v≥B)`. Replaces the Phase-2 placeholder. Written to `care{i}` at confirm.
- **Celebration tiers (§6.2):** FIRST → MONTH_BEST → BEATS_7 → BEATS_3 → BEATS_YEST → DISAPPOINTMENT, evaluated against history strictly before today. Shown as tier badges/toasts (no companion dialogue — that's Phase 6).
- **Neglect machine (§6.3):** per-metric OK/NEGLECTED with the counter + two-day clear protocol. Runs at day close. Absent core blocks count as 0/miss (§4).
- **Death (§6.4):** 3+ metrics NEGLECTED at close → archive to `companions/{id}`, spawn next species at base form (neglect cleared, traits 0), business data untouched (ruling #5).
- **Monthly evolution (§6.5):** first wake of a new month evaluates the just-ended month vs the prior; winner trait +1; every 6 cumulative levels → maturity stage +1; all-decline → "held the line".
- **2:25 recap (§4):** scorecard of all 10 metrics + funnel (today + trailing 7 workdays) + neglect warnings.
- **Firestore (§7):** `state/companion` now carries `traitLevels`, `maturityStage`, `neglect{}`, `lastEvolvedForMonth`; `companions/{id}` archives on death.

### Self-test (headless, passed)
- **33/33** rules unit tests: care test, all 6 celebration tiers + priority, neglect accrual (3 misses), successful 2-day clear, failed clear (<50% day two), miss resets, death at 3, evolution scoring (finite / new-from-zero / all-decline / first-month / tie-breaks), maturity stages.
- **17/17** engine integration: first day + cut-short + FIRST celebrations; 3-miss neglect → death → new species + archive; month-rollover evolution + trait bump; MONTH_BEST tier priority.
- Covers all 8 PLAN.md §12 Phase-3 scenarios.

### Owner accept test (browser — use the ⏳ Time Machine)
1. **First day:** wipe today's row, Run a compressed day → confirm celebrations fire and Firestore `care{i}` flags look right.
2. **Neglect → death:** set a virtual date, turn sim ON + autoplay OFF is slow; easiest is: use Inject History with low numbers, then run several compressed empty days (sim off, no events) so metrics miss 3× → watch a death ceremony + a new companion; verify `companions/{id}` archive + reset `state/companion` in Firestore.
3. **Evolution:** Inject history for a prior month, set virtual date to the 1st of the next month, run wake → watch the evolution toast; verify `traitLevels` bumped in `state/companion`.
4. **Recap:** let a compressed day reach 2:25 → the recap card appears.

## Phase 4 — what got built

New: `js/sprites-data.js` (FROZEN 5-species pose matrices), `js/sprites.js` (renderer + trait systems), `preview.html` (approval harness). Wired into `index.html`/`css`/`js/main.js` scene; `js/config.js` starterSpecies; `js/store.js` starter-aware ensureCompanion; `js/engine.js` getScene/getMode + celebrate/faint transients.

- **5 species** sharing one rig (§9): Sproutling(green/sprout), Emberpup(red/flame), Aquafin(blue/fin) ← **chosen starter**, Voltkit(yellow/bolt), Nocthorn(purple/horns). Each: 12 frozen 32×32 poses (idle×2, walk×2, sleep×2, eat, play, sad, celebrate×2, faint).
- **Renderer** (`sprites.js`): nearest-neighbor pixel draw, animation catalog, deterministic transforms only — base matrices never edited (continuity guaranteed by construction, ruling #11 / §9).
- **10 trait systems** as modular plated MECHA attachments that layer (spines behind → steel harness → pauldrons → gold collar/gem/chain/crown → floating halo/hearts/sparkles/bubbles). Size + maturity scale the whole sprite. Toys sit on a floor shelf (offset, no overlap).
- **Neglect visuals**: desaturated/darkened palette + dirt specks + forced sad pose when any metric neglected.
- **Scene integration**: `#room-canvas` in the day panel; `main.js` rAF loop draws `engine.getScene()` → SLEEP=sleep, WORK=play, FREE=walk (wanders), celebration/death transients, neglect=sad. Starter defaults to Aquafin even before first tick.
- **Preview/approval** (`/preview.html`): species picker + per-trait 0→40 sliders + maturity + neglect toggles + pose buttons. Owner-approved.
- `drawRetiree()` ready for background retiree minis (appear after deaths).

### Owner accept (§12 Phase 4)
Owner approved the direction and scrubbed traits 0→40 with zero continuity breaks; chose **Aquafin**. ✅

### Notes
- Companion shows SLEEP outside the 8:30–2:30 window / on rest days — use the ⏳ Time Machine to see it wake/work/celebrate on demand.
- Species pool cycles on death: next = (speciesIdx+1) % 5.

## Phase 5 — what got built

New: `js/audio.js` (GB synth engine), `js/audio-data.js` (compositions), `audio-lab.html` (listen/veto/recompose tool). Wired: HUD volume/mute (`index.html`/`css`), audio unlock + theme-by-state (`main.js`), SFX triggers (`engine.js`).

- **Engine (§10):** Web Audio, 4 voices — pulse ×2 (duty-cycle PeriodicWaves 12.5/25/50/75%), triangle, noise (K/S/H percussion). Lookahead scheduler (25ms tick, 120ms ahead) for tight timing. Master volume + mute. Unlocks on first user gesture.
- **Themes (loop):** WAKE (~72bpm C-major lullaby, sparse), FOCUS (~132bpm A-minor arpeggio, seeded key/tempo per block), FREE (~144bpm C-major energizer). Daily-seed varies tempo ±6% and (focus) key.
- **Jingles/SFX:** 10 per-care taps, confirm blip, T-60/T-2 chirps, block-start, call-tag, celebration tiers 1→4 (escalating: 2-note → riff → fanfare+bass → 4-bar mega w/ harmony+drums), first-ever, disappointment, neglect sting, evolution theme, death dirge.
- **Triggers (engine):** care tap → per-care blip; block start → jingle; confirm tier → matching celebration/first-ever/disappointment; call tagged → call-tag; newly neglected → sting; death → dirge; evolution → theme. Theme-by-state in `main.js`: wake window → WAKE, WORK → FOCUS(seeded), FREE → FREE, SLEEP/out-of-window → silence.
- Smoke-tested in browser: plays with **zero console errors**, scheduler + oscillators run.

### Owner listen/veto/recompose (§10 — nothing ships until approved)
Open **/audio-lab.html**, click through every theme + jingle. For each: keep / veto / "recompose that one." Sleep = silence is by design. Original melodies only (ruling #10).

### Notes
- Audio defaults ON at 0.5 volume; mute + volume live in the app HUD (top-right).
- In the app, themes only start after the first click (browser autoplay policy) — the sign-in click covers it.

## Phase 5 — generative themes (owner request)

New `js/compose.js`. Themes are no longer static loops — each has an authored FOUNDATION (scale, chord progression, bass + drum templates, tempo/key ranges) with a PROCEDURALLY generated melody + arpeggio. Phrases (4 bars) regenerate continuously via a seeded RNG, so the tune never repeats. A **daySeed** (from the date) fixes each day's key + tempo; WORK also folds the block number in so each block has its own character. `audio.js` now calls `generatePhrase(name, daySeed, phraseIdx)` and regenerates at each phrase boundary. Deterministic (same seed → same phrase) but effectively endless within a day. Verified in-browser: plays clean, phrases evolve, no errors.
