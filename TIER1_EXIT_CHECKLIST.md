# Tier 1 Exit Checklist (Lock Gate)

## Stability / Regression (must pass)
- [ ] P1/P2 unit visibility stable across clicks, recruit, build, and end-turn
- [ ] Unit Designer no duplication on chassis/module clicks
- [ ] Recruit/build/context panels do not bleed clicks to world
- [ ] Construction progress advances every turn for P1 and P2
- [ ] Patrol boat sprint (double-move) works reliably
- [ ] Supply overlay deterministic regardless of camera position
- [ ] Roads through fog: enemy roads hidden until discovered, then persist if still existing
- [ ] Tiny/custom/naval proc-gen starts without black screen

## UX / Menu polish
- [x] Build menu grouped by category (Roads / Resource / Land Military / Naval / Defense / Economy)
- [ ] Full spacing/alignment audit on all context/build menu rows
- [ ] Tier labels visible and correct for all standard/custom units

## Economy / Trade
- [x] Trade contracts v1 (offer / accept / decline)
- [x] Trade v2: expiry + max pending cap + fairness hint
- [ ] Trade history panel (accepted/declined/expired in current session)

## Procedural setup
- [x] Size + land profile + quick start flow
- [ ] Placeholder entries shown for future options (players/win conditions)

## Tier 1 lock
- [ ] Run 3 smoke sessions (tiny, archipelago, naval supremacy) 10 turns each with zero blockers
- [ ] Freeze Tier 1 branch (bugfix-only)
- [ ] Open Tier 2 planning branch
