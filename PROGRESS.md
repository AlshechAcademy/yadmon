# YADMON — Progress Log

_Single source of truth for "what's done / what's next / open issues." Every session updates this._

Last updated: 2026-07-13 (Phase −1)

---

## Status by phase

- [x] **Phase −1 — Wire up Cowork + GitHub** ✅ DONE
- [ ] **Phase 0 — Accounts & keys** ← NEXT (owner + walkthrough)
- [ ] Phase 1 — Skeleton + calendar
- [ ] Phase 2 — Engine + data (+ time machine)
- [ ] Phase 3 — Rules engine
- [ ] Phase 4 — Sprites
- [ ] Phase 5 — Audio
- [ ] Phase 6 — Brain (Gemini)
- [ ] Phase 7 — Shakedown

---

## Phase −1 — what got done

- File access confirmed: `hello.txt` written to the working folder.
- Shell + tooling confirmed in the build environment: `git` 2.34.1 ✓, `node` v22.22.3 ✓, `curl`/`wget` present. No `gh` CLI.
- Repo initialized and first commit made (`Phase -1: initial commit`).
- GitHub repo created: **https://github.com/AlshechAcademy/yadmon** (public).
- Pushed `main` with: `PLAN.md`, `YADMON-build-plan.md` (original), `hello.txt`, `.gitignore`.
- GitHub Pages: **owner action pending** — enable in repo Settings → Pages (see open issues).

## Environment notes (important for every future session)

- **Git metadata cannot live inside the mounted Windows folder** (`unlink`/rename returns "Operation not permitted" on the mount). Workaround in use: the git directory lives at `/tmp/yadmon.git` on the sandbox's native filesystem, with `GIT_WORK_TREE` pointed at the mounted project folder. Set both env vars before any git command:
  - `export GIT_DIR=/tmp/yadmon.git GIT_WORK_TREE=<mounted Yadmon path>`
  - NOTE: `/tmp` is wiped between sessions — future sessions must re-init the git dir and re-add the `origin` remote, or re-clone from GitHub into `/tmp` and point the work tree at the folder.
- **The GitHub REST API is blocked by the sandbox proxy** (`403 from proxy after CONNECT` to `api.github.com`). Git-over-HTTPS to `github.com` IS allowed. Consequence: repo creation and Pages enablement must be done by the owner in the GitHub web UI; Cowork handles commits/pushes via git.
- Auth for pushes uses a classic PAT (`repo` scope) supplied by the owner at push time. The token is **never** written to a file or committed — it is passed inline to the push URL only. A fresh token will be needed in future sessions (or store it in the OS credential manager).

## Open issues / owner to-dos before Phase 0 "accept"

1. **Enable GitHub Pages:** repo → Settings → Pages → Source "Deploy from a branch" → branch `main`, folder `/ (root)` → Save. Live URL will be **https://alshechacademy.github.io/yadmon/**.

---

## Phase 0 needs (next session)

Per PLAN.md §13 checklist — all owner-driven, Cowork dictates the clicks:

1. Google Cloud project "yadmon" (Workspace) → OAuth consent screen **Internal** → enable Calendar API → OAuth Web client with JS origin `https://alshechacademy.github.io`.
2. AI Studio Gemini API key (kept restricted to Gemini API; pasted into the app later, never committed).
3. Firebase project (Spark) → Auth Google provider on → add `alshechacademy.github.io` to authorized domains → create Firestore → paste §7 security rules.
4. GitHub Pages (see open issue #1 above).
5. First-run flow (needs app built — later).
6. Confirm timezone America/New_York + calendar ID.

**The only handshake into chat:** the (non-secret) Firebase web config object — owner pastes it so it can be committed into `js/config` per §2.
