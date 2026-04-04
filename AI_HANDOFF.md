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
4. **After every code patch:**
   - update the game version
   - commit the changes
   - push to GitHub
5. Give back:
   - a short summary
   - the new version number
   - the GitHub commit link
   - the playtest link

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

### 3) Git / GitHub rule

After a successful code change, always:
- `git add` changed files
- `git commit -m "<clear short message>"`
- `git push` to the main branch

If deployment/build steps are part of the repo workflow, run them too.

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

Keep the response short and practical.

Preferred format:

- what changed
- version: `vX.Y.Z` (or current project style)
- commit: `<GitHub commit URL>`
- playtest: <https://pmagazzu.github.io/project-x/>

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

If no new priority is stated, likely high-value areas are:
- combat logic verification / cleanup
- `resolveImmediateAttack()` review in `phaser/src/GameState.js`
- destroyer vs submarine combat behavior
- combat log / breakdown visibility for the player
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
- version is bumped
- changes are committed
- changes are pushed
- user gets commit link
- user gets playtest link

## Fast startup checklist for future resets

When re-entering this project:
1. Read this file.
2. Read `project-x/AGENTS.md`.
3. Confirm active code is in `project-x/phaser/`.
4. Check current version string.
5. Make requested change.
6. Bump version.
7. Commit + push.
8. Reply with summary + commit link + playtest link.
