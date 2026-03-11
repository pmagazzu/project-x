# Tier 1 Playtest / Stability Log

## 2026-03-11 — v1.3.0 Sprint Log

### Scope logged
- Build menu grouping pass
- Trade contracts v2 (expiry/cap/fairness hints)
- Tier 1 exit checklist creation
- Recent hotfix chain stabilization context

### Implemented in v1.3.0
- Build submenu grouped under headers:
  - ROADS
  - RESOURCE EXTRACTION
  - LAND MILITARY
  - NAVAL
  - DEFENSE & OBSTACLES
  - ECONOMY & RESEARCH
- Trade v2:
  - Offer expiry after 3 turns
  - Max 5 pending outgoing offers per player
  - Fairness hint labels on incoming offers
  - Turns-left display on incoming offers
- Added `TIER1_EXIT_CHECKLIST.md`

### Stability context from immediate prior patches
- v1.2.6: designer anti-duplication pointer guard
- v1.2.7: build menu polish + road discovery/fog visibility rule
- v1.2.8: designer rebuild re-attach to UI layer (module-click duplication)
- v1.2.9: infantry AT module + tier labels + custom recruit card parity
- v1.2.10: supply overlay deterministic render (no camera-dependent cull)

### Current status snapshot (not full manual matrix yet)
- Code/build status: PASS (build succeeds)
- Full 3-map x 10-turn manual matrix: PENDING

### Next logged action
- Run matrix:
  1) Tiny custom
  2) Archipelago
  3) Naval supremacy
- Record per-item pass/fail against `TIER1_EXIT_CHECKLIST.md`
