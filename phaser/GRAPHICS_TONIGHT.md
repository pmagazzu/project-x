# Graphics Drop-In Guide (Tonight)

Quick workflow for adding **unit counters**, **buildings**, and **terrain tiles** for up to **6 teams**.

Live build: <https://pmagazzu.github.io/project-x/> — hard refresh after push (`Ctrl+Shift+R`).

---

## 1. Where files go

```
phaser/public/user_art/
  units/
    p1_infantry.png
    p2_infantry.png
    ...
  buildings/
    barracks.png
    mine.png
    ...
  terrain/
    plains.png
    forest.png
    ...
```

You can also paste PNGs in Cursor chat — we'll wire them up.

---

## 2. Unit art (6 teams × unit types)

### Current mode (map)
- **Units:** blue/red **rectangle counters** — staying for now.
- **Buildings:** same **team-tinted counter chips** with 2-letter codes (HQ, Ba, Mi, Ny…). Procedural building sprites are **off**.

### Recommended PNG spec
| Setting | Value |
|--------|--------|
| Size | **128×128 px** (we scale down on hex) |
| Format | PNG, **transparent** background |
| Style | Isometric-ish top-down, **pixel/arcade**, readable at small size |
| Light | Top-left highlight, soft ground shadow optional |
| Facing | Default “south-east” or neutral top-down |

### Team colors (match counters)
| Team | Color | Hex |
|------|-------|-----|
| P1 | Blue | `#4488ff` |
| P2 | Red | `#ff4444` |
| P3 | Green | `#44cc66` |
| P4 | Gold | `#ffcc44` |
| P5 | Purple | `#cc66ff` |
| P6 | Orange | `#ff8844` |

### Naming (pick one scheme)
**Per team + type:**
```
p1_infantry.png  p2_infantry.png  …  p6_infantry.png
p1_tank.png      p2_tank.png      …
```

**Single neutral + we tint in-engine** (less art, more reuse):
```
infantry.png   tank.png   artillery.png
```
We tint by `PLAYER_COLORS` unless you mark `noTint` for a key.

### Minimum set for a good first pass
- **Infantry**, **Tank**, **Artillery**, **Engineer**, **Recon**
- **Patrol boat**, **Destroyer** (if naval map)
- **Biplane** or **Fighter** (if air)

### Tier display
- **T0–T5 actionable tonight:** one sprite per type is enough; tier stays as **colored pips** on the counter.
- **Later:** optional `p1_infantry_t3.png` for tier-specific silhouettes.

---

## 3. Building art

### Spec
| Setting | Value |
|--------|--------|
| Size | **96×96** or **128×128** |
| Anchor | Bottom-center sits on hex |
| Style | Match units — chunky pixel, strong silhouette |

### Core buildings
```
hq.png  barracks.png  vehicle_depot.png  mine.png  oil_pump.png
farm.png  lumber_camp.png  naval_yard.png  harbor.png
airfield.png  science_lab.png  bunker.png  (fort tiers can share one bunker.png)
road.png  (optional — roads are often procedural)
```

Buildings use `BUILDING_ART` keys in `GraphicsAssets.js` (`px_bld_*` today).

---

## 4. Terrain / tile overlays

Terrain **base fill** is still procedural hex color. Optional **overlay sprites** per terrain type:

| Type | File idea |
|------|-----------|
| Plains | `plains.png` (subtle texture) |
| Forest | `forest.png` |
| Mountain | `mountain.png` |
| Water / coast | `water.png`, `coast.png` |
| Farm tile | `farm_tile.png` |
| Sand | `sand.png` |

**64×64 or 128×128**, seamless edges helpful but not required for v1.

---

## 5. AI → Canva workflow (recap)

1. Generate in Grok / Midjourney / etc. (JPEG OK).
2. **Canva** → remove background → export **PNG**.
3. Drop in `phaser/public/user_art/` or send in Discord/Cursor.
4. We add map entries + bump version + push.

---

## 6. What we enable after your drop

In `GraphicsAssets.js`:
```javascript
export const USE_UNIT_SPRITE_ART = true; // when ready for everyone

export const USER_UNIT_ART = {
  '1:INFANTRY': 'user_p1_infantry',
  '2:INFANTRY': 'user_p2_infantry',
  // ...
};
export const USER_UNIT_ART_FILES = {
  user_p1_infantry: 'user_art/units/p1_infantry.png',
};
```

Preload in `GameScene.preload()` — we handle chroma-key if needed.

---

## 7. Checklist before bed

- [ ] 128×128 transparent PNGs
- [ ] P1 blue + P2 red infantry at minimum
- [ ] Optional: barracks + mine + forest tile
- [ ] File names match table above
- [ ] Paste in chat or drop in `user_art/` folder

We’ll wire, build, push, and send the playtest link.
