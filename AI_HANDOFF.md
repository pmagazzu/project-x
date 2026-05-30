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

### AI overhaul — master plan (playtest reference: **v1.15.3**)

Canonical code: `phaser/src/AIDoctrine.js`, `phaser/src/AIPlayer.js`, `phaser/src/AIDesigner.js`, export/UI in `GameScene.js`.

#### Shipped (baseline for new work)

| Version | What landed |
|---------|-------------|
| **v1.14.0** | Doctrine module; army caps (~44 units / ~34 combat); FFA `pickPrimaryEnemyHQ`; local closing pressure; VP-first; anti-blob; `safeAtHome` off for VP/FFA |
| **v1.15.0** | `closing` phase + HQ rush missions; theater intel (`buildTheaterIntel`); stockpile spend pressure; **AI Lab** dev panel (☰ MORE) |
| **v1.15.1** | Larger AI Lab UI; **JSON run export** (MORE / Settings / AI Lab); per-turn economy + AI debug timeline |
| **v1.15.2** | JSON download on **victory / game-over** screen |
| **v1.15.3** | Perf: cached landmass index, theater resource bucketing, slim/deferred turn snapshots (fix tab freeze) |
| **v1.15.4** | Late-game perf: fix Dijkstra queue sort, AI light refresh (no full redraw per move), supply cache, road hard cap, thinner turn logging |
| **v1.21.0** | **Per-VTC train queues** (`VtcProduction.js`): each VTC has `trainQueue[]` / `readyUnits[]`; PRODUCE/DEPLOY in build menu when VTC selected; facility-gated recruits |
| **v1.21.1** | **AI uses VTC UPGRADE + per-VTC queues** (`AIPlayer.js`): `planAIVtcUpgrades`, `filterRecruitPrioForVtc`, `pickBestVTCToQueue`; naval via coastal VTC `naval_yard` upgrade, not engineer yards |

**Dev tools (for playtest feedback):**

- ☰ MORE → **🤖 AI LAB** — live doctrine/economy/missions per AI
- ☰ MORE → **📥 EXPORT JSON** or victory screen **DOWNLOAD JSON** — feed files back to agent for analysis
- Settings → DOWNLOAD JSON REPORT (same payload)

Export payload: `meta`, `turns[]` (economy per player per turn), `current`, `lastAiPlans`, `combatLog`, `gameLog`. Known export bugs to fix: **duplicate turn rows** (2 snapshots per game-turn in 1v1), **move actions** sometimes `[null,null]` (use `toQ`/`toR`).

---

#### Playtest findings (consolidated)

**Scenario A — 4 AI, small 1-continent (elimination)**  
- Fight quality improved vs old AI.  
- P2 did not **finish** P1 when advantaged (no final push).  
- Heavy **resource hoarding**.  
- Hard to see research/designer usage → led to AI Lab + JSON export.  
- **Browser/OS stress** from unit spam → caps helped; v1.15.3 fixed logging-induced freezes.

**Scenario B — 1v1 AI, 35×35 custom, elimination, 11 turns** (`attrition-run-game-end-turn11-*.json`, P1 win)  

*Doctrine / combat*

- **Asymmetric endgame:** P1 in `closing` (80% endgame, 6× `closing` missions) from ~turn 3; P2 stayed in **`expand`** (20% endgame) despite similar army size — “could have ended it but didn’t” on the loser side too.
- **Closing doesn’t close:** P1 final turn = 14 moves, 5 road builds, **0 attacks**, `logistics_override` + 3 unsupplied while sitting on **60+ iron**.
- **Theater mode on** (south lane, objective `enemy_hq`) — lanes/theater wired but logistics and phase timing override kill push.
- P1 won by **capturing P2 HQ** (owned both HQs); tanks decisive late.

*Economy (main lesson: extraction ≫ conversion)*

- Both ended **~64–70 iron** (~5–6 turns of income banked); `stockpilePressure` only ~0.18 — spend thresholds too weak.
- **Net iron ~10–14/turn**; upkeep negligible — army size not the bottleneck.
- **Zero research entire game:** 0 RP, 0 labs, 0 techs, 0 components — designer fired for P1 (3 customs) but **no industrial spine**.
- **P1:** 2 oil pumps, oil inc 4/turn, 2 tanks, 3 trucks — balanced war economy tilt.  
- **P2:** **4 mines**, **1 oil pump**, oil inc 2/turn — **iron-rich, oil-poor**; wrong macro for tanks/logistics.
- **Wood capped** (~14–15) → roads absorbed wood; **food comfortable** (~25).
- **Logistics vs treasury:** rich stocks + **unsupplied units** — trucks/depots/roads band-aid, not enough supply capacity for front length.

---

#### Master phases (updated order)

**Phase 1 — Budgets & FFA focus** ✅ *shipped v1.14.0 (tune ongoing)*  
- Caps, VP-first, primary enemy, anti-blob.

**Phase 2 — Theater graph** 🟡 *partial v1.15.0*  
- `buildTheaterIntel` + cached landmass; missions can use theater objective.  
- **Still needed:** lane fallback only when appropriate; don’t enter `closing` on turn 3 with 3 combat units; **both** AIs get symmetric endgame when enemy HQ is weak/near.

**Phase 2b — War economy (NEW — highest ROI from Scenario B)**  
- **Stockpile:** if `iron ≥ 40` or `oil ≥ 15` → force recruit/spend (`stockpilePressure` curve steeper).  
- **Oil heuristic:** if enemy oil income ≥ 1.5× yours and you have 3+ mines → prioritize **OIL_PUMP** over mine #4.  
- **Research floor:** by turn 8, if `iron > 35` and no LAB → build lab + queue tech.  
- **Components:** tie designer recruits to component spend; don’t register designs with 0 industrial loop.  
- **Logistics tax:** if `unsupplied > 0` and `iron > 30` → recruit trucks / depots; **block road spam** until supply clear.

**Phase 3 — Closing / final push** 🟡 *partial v1.15.0*  
- `closing` missions exist but **logistics_override must not zero attacks** when `endgamePressure > 0.6`.  
- Mirror `getEndgamePressure` for **trailing AI** when ahead locally (not only leader).  
- Require min army before `closing`: e.g. turn ≥ 8, `myCombat ≥ 6`, or local 1.3× enemy near HQ.

**Phase 4 — Expedition playbook** 🟡 *partial v1.21.x*  
- Naval yard → transports → assault on water / multi-landmass / VP maps; supply ports as expansion enablers.

#### VTC production & upgrades (v1.21+ — read before touching recruits/settlements)

**Human UI:** Select an owned VTC → bottom-right panel (taller when VTC focused) → tabs **UPGRADE | PRODUCE | DEPLOY**. Engineers build **roads, defenses, extractors only** — not barracks/labs (those are menu purchases).

**Code map:**

| Module | Role |
|--------|------|
| `SettlementSystem.js` | `getVtcUpgradeMenu`, `purchaseVtcUpgrade`, `upgradeSettlement`, `vtcUpgrades` on building |
| `VtcProduction.js` | Per-VTC `trainQueue` / `readyUnits`, `queueGlobalRecruit` → picks VTC, `tickVtcProduction`, deploy only from training VTC |
| `GameScene.js` | Panel + executes AI `vtc_upgrade` / `upgrade_settlement` / `recruit` with `global: true` |
| `AIPlayer.js` | Must buy facilities **before** queuing gated units; see below |

**AI contract (`AIPlayer.js`):**

- Turn ≥ 4: `planAIVtcUpgrades()` — forward VTCs first; village prio `barracks → local_farm → road_link → housing`; town+ adds `factory`, `science_lab`, `naval_yard`, etc.; may `upgrade_settlement` when `menu.canPromote.ok`.
- Recruits: use `queueGlobalRecruit` via actions `{ type: 'recruit', global: true, unitType, buildingId? }` and `pickBestVTCToQueue` (shortest queue, facility-aware).
- Never assume global `pendingGlobalRecruits`; filter with `filterRecruitPrioForVtc` so AI only queues buildable types.
- Naval on water maps: buy `naval_yard` on coastal forward town+ VTC (`vtc_upgrade`), then queue `PATROL_BOAT` / `SUPPLY_SHIP` when coastal + yard complete.
- Deploy: `global_deploy` from `readyUnits` on the VTC that trained them (`enumerateVtcDeployHexes`).

**Phase 5 — Same-island combat quality** ⬜  
- Flanks, chokes, hold/fire support; stop feeding unsupported hexes (tie to logistics tax).

**Phase 6 — Strategy personalities** ⬜  
- Raider / expander / naval doctrines that diverge in economy + mission mix.

**Phase 7 — Telemetry & export hygiene** 🟡 *partial*  
- Dedupe `turns[]` to **one row per game turn** (not per player end-turn).  
- Fix `_summarizeAIAction` for moves (`toQ`, `toR`).  
- Optional: AI Lab sparkline (iron stock vs unsupplied per turn).

---

#### Reference scenarios for tuning

| Scenario | Use for |
|----------|---------|
| **5p island, VP mode** | FFA, navy, VP contest, blob perf |
| **4p 1-continent elimination** | mid-game fights, hoarding, final push |
| **1v1 ~35 custom elimination** | economy conversion, oil vs mines, closing vs expand |

---

#### ▶ NEXT IMPLEMENTATION STEP (after current playtest data)

**Ship v1.16.0 — Phase 2b + Phase 3 tightening** (single focused patch):

1. **Economy spend doctrine** (`AIDoctrine.js` + recruit/build in `AIPlayer.js`): steeper `getStockpileSpendPressure`, oil-vs-mine heuristic, research floor, logistics tax (no roads while OOS + rich).
2. **Closing gates + attack priority:** min turn/army for `closing`; in `closing`, cap engineer/road actions and **guarantee attacks** toward `focusEnemyHQ` over `logistics_override`.
3. **Symmetric endgame:** if enemy HQ weak/near, **both** players evaluate `getEndgamePressure` → `closing` (fix P2 stuck in `expand`).
4. **Export fix:** dedupe turn snapshots; fix move coordinates in JSON.

**While user playtests:** collect `attrition-run-*.json` from victory screen or AI Lab; compare iron/oil curves, `strategicPhase`, `missions`, and unsupplied counts turn-over-turn.

**Do not start** Phase 4 naval expedition until 2b+3 show in JSON: falling iron stocks midgame, oil parity, at least one research unlock, and winner’s last 2 turns with `attack > 0` in `closing`.

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
4. Check current `GAME_VERSION` in `GameScene.js` (as of last handoff update: **v1.21.1**).
5. Read **AI overhaul — master plan** (above) before changing `AIDoctrine.js` / `AIPlayer.js`.
6. Make requested change (default: **Phase 2b + 3** per master plan unless user redirects).
7. Bump version (gameplay patches).
8. `cd phaser && npm run build`
9. `git add` everything changed → commit → `git push origin main`
10. Reply with summary + **version** + commit link + playtest link
