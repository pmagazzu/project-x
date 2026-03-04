# Project X — Phase 1 Prototype Technical Spec

## Goal
Build a playable 2-player turn-based strategy game prototype in Godot 4. Two players take turns simultaneously on a hex grid map, build a barracks, train infantry, move units, and fight. If your HQ is destroyed, you lose.

## Engine & Setup
- **Godot 4** (latest stable)
- **3D mode** — the hex map is actual 3D geometry
- **Isometric camera** — angled top-down view, can pan (WASD or middle mouse), zoom (scroll wheel), and rotate (Q/E or right mouse drag)
- **Export target:** Web (HTML5) — must be playable in a browser

## Architecture Overview

### Turn System (Simultaneous)
- Both players plan at the same time
- Each player has a "Submit Turn" button
- When BOTH players submit → turn resolves
- Resolution order: Movement → Combat → Resource collection → Production tick
- For prototype: hotseat mode (same screen, player 1 plans then passes to player 2, then resolve)

### Game State
A single GameState object holds:
- Current turn number
- Whose planning phase it is (hotseat)
- All units (position, owner, stats, orders)
- All buildings (position, owner, type)
- All hex tile data (terrain, resources)
- Resource counts per player (iron only for prototype)
- Orders queue per player

---

## Map

### Hex Grid
- **Size:** 25x25 hex grid
- **Hex orientation:** Flat-top hexes
- **3D geometry:** Each hex is a flat 3D mesh (low cylinder or extruded hex shape)
- **Coordinate system:** Axial coordinates (q, r)

### Terrain Types (Phase 1 — 3 types)
| Type | Color (placeholder) | Movement Cost | Defense Bonus | Vision Block |
|---|---|---|---|---|
| Plains | Green | 1 | 0 | No |
| Forest | Dark Green | 2 | +1 | Partial (reduces vision by 1) |
| Hills | Brown | 2 | +1 | Yes (blocks LOS from lower ground) |

### Map Generation (Phase 1)
Simple procedural: start with all plains, randomly place clusters of forest (30% of hexes) and hills (15% of hexes). Place iron deposits on 8 random hexes.

### Starting Positions
- Player 1 HQ: top-left quadrant
- Player 2 HQ: bottom-right quadrant
- Each player starts with their HQ and 2 Rifle Squads adjacent to it

---

## Resources (Phase 1: Iron only)

- Each player starts with 50 iron
- Iron deposits on map must have an Iron Mine built on them to produce
- Iron Mine produces +10 iron per turn
- Building costs iron
- Training units costs iron

---

## Buildings

### HQ (Town Hall)
- Every player starts with 1
- **If destroyed → player loses**
- HP: 100
- Cannot be moved
- Placeholder: large brown cube with player color flag

### Barracks
- Cost: 30 iron
- Build time: 2 turns
- Allows training infantry units
- HP: 40
- Placeholder: medium brown cube

### Iron Mine
- Cost: 20 iron
- Must be placed ON an iron deposit hex
- Produces +10 iron per turn automatically
- Build time: 1 turn
- HP: 20
- Placeholder: grey cube with iron icon

---

## Units

### Rifle Squad
- Cost: 15 iron
- Train time: 1 turn (from Barracks)
- HP: 30
- Movement: 3 hexes/turn
- Attack Range: 2 hexes
- Attack Power: 8
- Defense: 2
- Vision Range: 3 hexes
- Placeholder sprite: small green/red cluster of 3 tiny soldier pixels (billboard sprite)

### Scout
- Cost: 10 iron
- Train time: 1 turn (from Barracks)
- HP: 15
- Movement: 5 hexes/turn
- Attack Range: 1 hex
- Attack Power: 3
- Defense: 1
- Vision Range: 6 hexes
- Placeholder sprite: single blue/red dot with small antenna

### Field Artillery
- Cost: 40 iron
- Train time: 2 turns (from Barracks for prototype)
- HP: 25
- Movement: 1 hex/turn
- Attack Range: 8 hexes
- Attack Power: 20
- Defense: 0
- Vision Range: 2 hexes (needs spotter — if no friendly unit within 3 hexes, accuracy -50%)
- Cannot attack units adjacent to it (min range: 3 hexes)
- Placeholder sprite: grey rectangle with long barrel line

---

## Combat System

### Line of Sight
- Direct fire units (Rifle Squad, Scout) require clear LOS to target
- Indirect fire units (Artillery) do NOT require LOS but get -50% damage without a friendly unit within 3 hexes of target
- LOS calculation: Bresenham's line between attacker and target hex; blocked by Hills terrain

### Attack Resolution (per attack order)
1. Check range and LOS
2. Base damage = attacker's Attack Power
3. Modifiers:
   - Defender terrain Defense Bonus reduces damage (subtract from damage)
   - Range penalty: -10% damage per hex beyond half max range
   - Artillery without spotter: -50%
4. Apply damage to defender HP
5. If HP ≤ 0: unit is destroyed, removed from map

### Simultaneous Resolution
All combat orders resolve simultaneously within a turn (no order advantage).

---

## Fog of War

- Each hex has a visibility state per player: Visible, Fog (last seen), Hidden
- Visible: at least one friendly unit has LOS to this hex this turn
- Fog: was visible in a previous turn, shows last-known state at 50% opacity
- Hidden: never seen, shows as black/dark
- Vision range per unit type (see above)
- Vision recalculates each turn after movement resolves

---

## Player Orders (per turn)

Players can queue these actions during their planning phase:
1. **Move** — select unit, select destination hex (pathfinding respects movement cost)
2. **Attack** — select unit, select target hex/unit
3. **Build** — select empty hex, select building type (costs iron immediately)
4. **Train** — select Barracks, select unit type (costs iron, queues for N turns)
5. **Do Nothing** — unit stays

A unit can Move AND Attack in the same turn (move first, then attack from new position).

---

## UI (Minimal Prototype)

### HUD Elements
- Top bar: Player name, Iron count, Turn number
- Bottom bar: Selected unit/building info panel (name, HP, stats, current orders)
- "End Turn / Submit" button (big, hard to miss)
- Turn indicator: "PLAYER 1 PLANNING" or "PLAYER 2 PLANNING" or "RESOLVING..."

### Interaction
- Left click hex: select unit or building on that hex
- Left click empty hex (with unit selected): move order
- Right click unit/building (with unit selected): attack order
- Click building button in HUD: build at selected hex
- Escape: deselect

### Camera Controls
- WASD or arrow keys: pan
- Scroll wheel: zoom
- Q/E or right-mouse drag: rotate around focal point
- Middle mouse button: pan

---

## Visual Style

### Hex Tiles
- Flat 3D hex meshes
- Plains: flat green
- Forest: dark green, add small tree billboard sprites (simple green cone/circle)
- Hills: brown, slightly raised mesh (actual elevation)
- Iron deposit: grey hex with small ore icon

### Units (placeholder pixel sprites, billboarded)
- All units are billboard sprites (always face camera)
- Player 1: blue tint
- Player 2: red tint
- Draw pixel art directly in Godot using ImageTexture or load PNG files
- Keep sprites at 16x16 or 32x32 pixels

### Buildings
- Simple 3D box meshes, player color material
- HQ: tall, distinctive shape
- Barracks: medium box
- Iron Mine: small grey box

---

## File Structure
```
project-x/
├── project.godot
├── scenes/
│   ├── Main.tscn          # Root scene
│   ├── HexMap.tscn        # The hex grid
│   ├── HexTile.tscn       # Individual hex tile
│   ├── Unit.tscn          # Unit scene (billboard sprite)
│   ├── Building.tscn      # Building scene (3D mesh)
│   └── UI.tscn            # HUD overlay
├── scripts/
│   ├── GameState.gd       # Central game state
│   ├── TurnManager.gd     # Turn resolution logic
│   ├── HexGrid.gd         # Hex math utilities
│   ├── Unit.gd            # Unit logic
│   ├── Building.gd        # Building logic
│   ├── CombatResolver.gd  # Combat calculations
│   ├── FogOfWar.gd        # Visibility system
│   ├── PathFinder.gd      # A* on hex grid
│   └── UI.gd              # HUD logic
├── assets/
│   ├── sprites/           # Unit pixel art PNGs
│   └── textures/          # Tile textures
└── PROTOTYPE_SPEC.md
```

---

## Success Criteria for Phase 1

The prototype is "done" when:
- [ ] Hex map renders in 3D isometric view with rotating camera
- [ ] Two players can take turns (hotseat)
- [ ] Units can move across the map using pathfinding
- [ ] Units can attack each other with damage calculation
- [ ] HQ destruction ends the game
- [ ] Barracks can be built and trains Rifle Squads
- [ ] Iron mines can be built on deposits and generate iron per turn
- [ ] Fog of war works (each player sees only their units' vision)
- [ ] Basic UI shows resources, turn number, selected unit stats
- [ ] Game runs in Godot editor without crashes

---

## Notes for Developer
- Use GDScript (not C#)
- Prioritize working mechanics over visual polish
- Hardcode map for first pass, add procedural generation second
- Hotseat (same screen) is fine for prototype — no networking needed yet
- Comment all major functions
- Keep GameState as single source of truth — no state stored in individual nodes
