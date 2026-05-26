# AI Handoff / Job Description for Attrition (`project-x`)

Use this file as the fast reflash document whenever chat context resets.

## Project Identity

- **Project name:** Attrition
- **Repo:** `github.com/pmagazzu/project-x`
- **Primary active codebase:** `project-x/phaser/`
- **Engine / stack:** Phaser 3 + JavaScript + Vite
- **Legacy code also exists:** Godot files are in the repo, but the active playable version is the Phaser build unless explicitly stated otherwise.
- **Live playtest URL:** <https://pmagazzu.github.io/project-x/>

## What the AI is supposed to do

The normal workflow is:

1. Discuss proposed changes with Hot Ziti in the `#attrition` channel.
2. Make the requested code fixes/updates in the workspace.
3. Keep changes clean, consistent with the existing project structure, and avoid random rewrites.
4. **After every code patch (full update — no partial handoffs):**
   - bump the in-game version (`GAME_VERSION` in `phaser/src/GameScene.js`, and any other version strings)
   - run the production build: `cd phaser && npm run build` (updates `docs/assets/game.js` for GitHub Pages)
   - `git add` **every** changed file (source, built bundle, lockfiles if they changed, etc.)
   - `git commit` with a clear message
   - `git push` to `main` (working tree should be clean afterward)
5. **Always tell the user in the reply:**
   - short summary of what changed
   - **game version** (exact string, e.g. `v1.14.0`)
   - GitHub commit link
   - playtest link: <https://pmagazzu.github.io/project-x/>

## Operating rules

### 1) Active repo assumptions

- Treat `project-x/` as the canonical repo.
- Treat `project-x/phaser/` as the main gameplay client to edit.
- Read the existing code before changing it.
- Prefer targeted edits over broad refactors unless explicitly requested.

### 2) Versioning rule

**Always bump the game version for every patch or gameplay/code update.**

When making a change:
- update the version string in the game code if present (for example `GAME_VERSION` in `phaser/src/GameScene.js`)
- keep versioning monotonic and obvious
- mention the new version in the final reply

If multiple files carry version info, keep them in sync.

### 3) Git / GitHub rule (full update every time)

After a successful code change, always ship the **complete** update:
- `cd phaser && npm run build` before committing (so Pages serves the new bundle)
- `git add` all relevant changes — not just source files; include `docs/assets/game.js`, `phaser/package-lock.json` when deps changed, etc.
- `git commit -m "<clear short message>"`
- `git push origin main`
- verify `git status` is clean (nothing left unstaged/unpushed)

Do **not** stop after committing only `phaser/src/*` while leaving the built `docs/` bundle or lockfile behind.

If push fails due to auth, tell the user — but after they authorize the machine, retry and push everything.

### 4) Playtest handoff rule

After pushing, always return:
- what changed
- commit link
- version number
- playtest link: <https://pmagazzu.github.io/project-x/>

If the playtest build is not yet updated, say what still needs to be run.

### 5) Channel workflow rule

The expected collaboration loop is:
- discuss changes in Discord
- implement them in code
- push them
- send back the test link

Do not stop at “here’s a patch idea” if the request was to actually change the game.

### 6) Ask only when necessary

If something is unclear:
- ask **one short clarifying question**
- otherwise proceed

Do not make the user re-explain the whole project every reset.

## Response format after doing game work

Keep the response short and practical. **Always include all four items:**

- what changed (1–3 bullets)
- **version:** `vX.Y.Z` — the in-game `GAME_VERSION` string
- **commit:** `<GitHub commit URL>`
- **playtest:** <https://pmagazzu.github.io/project-x/>

## Project-specific context to remember

- Attrition is a **turn-based military strategy game**.
- Themes/features include:
  - base building
  - unit design
  - industrial warfare
  - 1935-era tech
- The project is already beyond a basic prototype.
- Recent known focus areas include:
  - economy warning UI / upkeep debt / desertion risk
  - naval systems
  - supply systems
  - research systems
  - procedural map generation
  - Tier 1 stability / regression cleanup

## Current known priorities

### AI overhaul (active — playtest reference: **v1.14.0**)

The AI was underperforming on most maps (island FFA VP turtling, same-island unit blobs, no navy, browser lag from uncapped recruits). **v1.14.0** started the doctrine pass (`phaser/src/AIDoctrine.js` + `AIPlayer.js`):

- army/recruit caps (anti-spam / perf)
- FFA primary-enemy pick + local closing pressure
- VP-first objectives; `safeAtHome` toned down for VP/FFA
- stronger anti-blob when stacking with no good fight

**Next AI phases** (unless user redirects):

1. **Phase 2 — Theater graph** — landmass ↔ VP ↔ owner; missions target real theaters, not north/center/south lanes.
2. **Phase 3 — Expedition playbook** — forced naval yard → transports → assault on water/VP maps; supply ports/ships/trucks as expansion enablers.
3. **Phase 4 — Same-island combat quality** — flanks, chokes, hold/fire support; stop feeding unsupported hexes.
4. **Phase 5 — Strategy personalities** — raider / expander / naval doctrines that actually diverge.

**Reference scenario for tuning:** 5-player island map, victory points mode.

### Other gameplay priorities

If no new priority is stated, also valuable:
- combat logic verification / cleanup (`resolveImmediateAttack()` in `GameState.js`)
- destroyer vs submarine combat behavior
- combat log / breakdown visibility
- engineer auto-road continuation verification
- patrol boat sprint / double-move validation
- Tier 1 regression checklist items

## Style expectations

- Keep replies fun, short, and useful.
- No giant explanations unless asked.
- Be competent, direct, and execution-focused.

## Definition of done for a normal coding request

A normal request is not done until all of this is true:
- code is changed
- in-game version is bumped (when gameplay/code changed)
- `npm run build` in `phaser/` was run and `docs/assets/game.js` is included if source changed
- **all** changed files are committed (full update)
- changes are pushed to `main`; working tree clean
- user gets: summary, **game version**, commit link, playtest link

## Fast startup checklist for future resets

When re-entering this project:
1. Read this file.
2. Read `project-x/AGENTS.md`.
3. Confirm active code is in `project-x/phaser/`.
4. Check current `GAME_VERSION` in `GameScene.js`.
5. Make requested change.
6. Bump version (gameplay patches).
7. `cd phaser && npm run build`
8. `git add` everything changed → commit → `git push origin main`
9. Reply with summary + **version** + commit link + playtest link
