# YADMON — Progress Log

_Single source of truth for "what's done / what's next / open issues." Every session updates this._

Last updated: 2026-07-13 (Phase 2 built — awaiting owner accept test)

---

## Status by phase

- [x] **Phase −1 — Wire up Cowork + GitHub** ✅ DONE
- [x] GitHub Pages enabled by owner → https://alshechacademy.github.io/yadmon/
- [x] **Phase 0 — Accounts & keys** ✅ DONE
- [x] **Phase 1 — Skeleton + calendar** ✅ ACCEPTED (owner verified 2026-07-13: all 10 blocks color-matched, non-core flagged, live drag-sync confirmed)
- [~] **Phase 2 — Engine + data (+ time machine)** 🟡 BUILT — owner accept test pending
- [ ] Phase 3 — Rules engine ← next after accept
- [ ] Phase 4 — Sprites
- [ ] Phase 5 — Audio
- [ ] Phase 6 — Brain (Gemini)
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
