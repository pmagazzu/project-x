# Attrition — TODO List

## 🔴 HIGH PRIORITY

### Combat
- [ ] **Combat calculations/logic unclear** — Pete flagged this. Need to:
  - Review `resolveImmediateAttack()` in GameState.js end-to-end
  - Verify soft_attack vs hard_attack selection logic (armored vs unarmored targets)
  - Verify pierce/armor ratio math produces intuitive results
  - Verify retaliation gating (range, suppressed, indirect fire, blind fire)
  - Verify 5-tier outcome system thresholds feel right in play
  - Test destroyer vs submarine specifically (Pete noted this looked wrong)
  - Add a combat log / breakdown panel players can reference mid-game

### Bugs (known)
- [ ] Engineer auto-road — verify multi-turn continuation works after v0.4.3 fix
- [ ] VEHICLE_DEPOT oil cost missing: `_onBuildStructure('VEHICLE_DEPOT', 8)` should be `('VEHICLE_DEPOT', 8, 2)`

---

## 🟡 MEDIUM PRIORITY

### Art
- [ ] Terrain tiles — Pete making by hand in Photopea (started: sand + grass first)
  - Spec: 96×48px, flat-top hex, 2:1 iso squish, transparent bg
  - Files needed: grass_tile, sand_tile, grass_hill, mountain_tile, sand_hill, water_shallow_tile, ocean_deep_tile
- [ ] Unit sprites — Pete making manually; PixelLab API too inconsistent
  - Files needed: all units + buildings (see `phaser/public/user_art/` for filenames)
- [ ] Wire user_art sprites behind ENABLE_USER_ART flag — do AFTER visual QA

### Features
- [ ] Reactions/overwatch system (units fire on enemies entering range during enemy turn)
- [ ] Tech tree UI — currently defined in TECH_TREE.md but no in-game implementation
- [ ] Scenario balance pass — unit counts/placement for all 4 scenarios
- [ ] Win condition polish — victory screen needs work

---

## 🟢 LOW PRIORITY / FUTURE

- [ ] Multiplayer (long-term)
- [ ] Regional-scale maps
- [ ] Full unit customization via Unit Designer
- [ ] Engineer auto-road bug: only executes first move — verify v0.4.3 fixed it fully
- [ ] Blender script for terrain tiles (guaranteed consistency) — revisit when Pete has time
- [ ] PixelLab API — not reliable for style consistency; revisit if API improves

---

## ✅ RECENTLY FIXED (v0.4.x)

- [x] IGOUGO fully implemented
- [x] Movement bug (v0.4.2): after move, stay in select mode
- [x] Roads redraw on refresh (v0.4.3)
- [x] Auto-road added to resolveEndOfTurn (v0.4.3)
- [x] Building sight values (v0.4.3 land, v0.4.5 naval)
- [x] Fog refresh on building placement (v0.4.6)
- [x] Auto-move standing orders for all units (v0.4.4)
- [x] AP display restored in bottom bar (v0.4.8)
- [x] Bottom bar shows SA/HA/PRC/ARM stats (v0.4.7/v0.4.8)
