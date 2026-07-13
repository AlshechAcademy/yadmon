# YADMON — Progress Log

_Single source of truth for "what's done / what's next / open issues." Every session updates this._

Last updated: 2026-07-13 (Phase 1 ACCEPTED)

---

## Status by phase

- [x] **Phase −1 — Wire up Cowork + GitHub** ✅ DONE
- [x] GitHub Pages enabled by owner → https://alshechacademy.github.io/yadmon/ (placeholder until Phase 1 ships index.html)
- [x] **Phase 0 — Accounts & keys** ✅ DONE
- [x] **Phase 1 — Skeleton + calendar** ✅ ACCEPTED (owner verified 2026-07-13: all 10 blocks color-matched, non-core flagged, live drag-sync confirmed)
- [ ] **Phase 2 — Engine + data (+ time machine)** ← NEXT
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
- **Git change-detection quirk:** the Windows file editor preserves file mtime, so `git add` may report "nothing to commit" even after a real edit (git's stat cache misses it). Fix: `touch <file>` in bash before `git add`, which bumps the mtime and forces git to re-hash. Verify with `git hash-object <file>` vs `git rev-parse :<file>` if in doubt.
- Auth for pushes uses a classic PAT (`repo` scope) supplied by the owner at push time. The token is **never** written to a file or committed — it is passed inline to the push URL only. A fresh token will be needed in future sessions (or store it in the OS credential manager).

## Open issues / owner to-dos

_None blocking. Phase −1 fully accepted: repo live, pushed, Pages enabled._

---

## Phase 0 — what got done

- **Google Cloud** project `yadmon` created; OAuth consent screen set to **Internal**; Calendar API enabled; OAuth **Web** client created with JS origin `https://alshechacademy.github.io`.
  - OAuth Client ID (public): `131501271611-f63fh6pgtr6llevj8aauq37id6g2vs9p.apps.googleusercontent.com`
  - Client *secret* is NOT used 