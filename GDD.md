# Project X — Game Design Document
*Living document. Last updated: 2026-03-03*

---

## 1. Overview

**Genre:** Turn-based military strategy / nation builder
**Scale:** Regional (think Eastern Front or Western Europe — not global)
**Era:** 1935 starting tech, advancing through WWII-era technology
**Perspective:** Isometric 3D (Godot engine, 3D terrain, billboarded unit sprites)
**Platform:** Browser (Godot web export) + potential desktop wrap later
**Players:** 1–8 (up to 4v4), teams submit turns simultaneously
**AI:** Yes — AI opponents and AI teammates supported

---

## 2. Core Vision

A deep, rewarding military strategy game where players build an industrial nation from scratch, design their own military units, and wage war across large hex-based maps. The signature experience: your army is *yours* — every unit reflects decisions you made. Infantry specialized for anti-armor. Custom tank designs tuned for mountain terrain. Air wings built to hunt enemy supply nodes.

Combat is tactical and meaningful at the squad/platoon/vehicle scale. Losses hurt. Terrain matters. Intel is power.

---

## 3. Win Condition

**Eliminate all enemy HQs.**

- Each player/team starts with one HQ building
- Players can construct additional HQs (very expensive, late-game investment)
- Last team with a standing HQ wins
- *Revisit later: point-based victory, time limits, surrender mechanics*

---

## 4. Turn Structure

### Simultaneous Turns ("We-Go")
All players plan simultaneously. When all players submit, the turn resolves.

**On Your Turn (Active Phase):**
- Deploy units from buildings
- Move units across the map
- Issue attack orders
- Construct buildings
- Queue unit production
- Assign citizens
- Spend research points

**Off-Turn (Planning Phase — always available):**
- Pre-plan unit movements (queued, execute next turn)
- Change production queues
- Design new units
- Review map, intel, stats
- Adjust research priorities

**Turn Resolution Order (per turn):**
1. Movement executes
2. Combat resolves (simultaneous fire)
3. Resources collected
4. Production ticks (buildings build, units train)
5. Research ticks
6. Population grows
7. New planning phase begins

*Turn represents approximately 1 week of in-game time (TBD)*

---

## 5. Map

### Grid: Hexagonal
- Large maps (size TBD — target: 100x100+ hexes for full game)
- Each hex represents roughly 5–10 km across

### Perspective: Isometric 3D
- Godot 3D mode with rotating camera
- Pan, zoom, full 360° rotation
- Terrain is actual 3D geometry (elevation visible)
- Unit sprites are billboarded (always face camera)

### Terrain Types
| Terrain | Movement Cost | Defense Bonus | LOS |
|---|---|---|---|
| Plains | 1 | — | Clear |
| Forest | 2 | +2 | Blocks partial |
| Hills | 2 | +1 | Blocks from below |
| Mountains | 3–impassable | +3 | Blocks most |
| River | impassable* | — | Clear |
| Urban | 1 | +2 | Blocks partial |
| Ocean/Lake | Naval only | — | Clear |
| Road | 0.5 | — | Clear |
| Trench | 1 | +4 | Partial |

*Rivers crossable at bridges or ford hexes*

### Fog of War
- Players see only what their units can see (vision range per unit type)
- **Ghost icons:** Last known enemy position shown at low opacity, fades after 2 turns
- Forests, hills, mountains block line of sight
- High ground sees further
- Recon units have extended vision range

### Map Generation
- **Hand-crafted scenarios** (curated maps with lore/objectives)
- **Procedural generation** (random maps for skirmish/multiplayer)

---

## 6. Resources

### Resource Types
| Resource | Source | Used For |
|---|---|---|
| 🌾 Food | Farms on fertile hexes | Population growth, unit upkeep |
| 🏭 Iron | Iron mines on iron deposits | Equipment, vehicles, buildings |
| ⛽ Oil | Oil wells on oil deposits | Vehicles, aircraft, naval units |
| 💰 Gold | Gold mines, trade | Commerce, advanced purchases |
| 👷 Citizens | Population growth (housing) | Units, industry, research |
| 🔬 Research Points | Scientists (assigned citizens) | Tech tree unlocks |

### Resource Extraction
- Resource deposits are visible on the map (iron, oil, gold, fertile land)
- Must build appropriate extraction facility on or adjacent to deposit
- Facility auto-produces X resource per turn once built
- Facilities require workers (citizen allocation)
- No manual hauling — ownership = production

### Citizens
- Abstract resource (no individual characters on map)
- Population grows each turn if food supply is sufficient + housing available
- Citizens are allocated to roles:
  - **Workers** → staff mines, farms, factories
  - **Soldiers** → consumed when training units
  - **Scientists** → generate research points per turn
- Build housing to increase population cap

---

## 7. Buildings

### City Chain (HQ line)
- Town Hall → City Hall → Government HQ
- Unlocks higher tier buildings, more citizen capacity
- **HQ = win condition target. Very expensive to rebuild.**

### Production Buildings
| Building | Produces |
|---|---|
| Barracks | Infantry units |
| Motor Pool / Armory | Ground vehicles |
| Airfield | Aircraft |
| Shipyard | Naval vessels |
| Artillery Depot | Artillery, heavy weapons |

### Industrial Buildings
| Building | Function |
|---|---|
| Iron Mine | +X iron/turn |
| Oil Well | +X oil/turn |
| Farm | +X food/turn |
| Gold Mine | +X gold/turn |
| Factory | Speeds up unit/building production |
| Housing | Increases population cap |
| Research Lab | +X research points/turn (requires scientists) |
| Listening Post | Extended recon/intel range |
| Trench Network | Fortifies hex tiles |

---

## 8. Unit System

### Tiers
- **Tier 0:** Starting units. Basic, cheap, cannon fodder. Available immediately.
- **Tier 1–4:** Unlocked via tech tree + unit design
- **Tier 5:** Late-game. Powerful, expensive, requires deep research.

### Unit Domains
- **Infantry** (squads, platoons, specialist teams)
- **Ground Vehicles** (light/medium/heavy/super-heavy armor, recon vehicles, trucks)
- **Artillery** (field guns, heavy artillery, rocket artillery, AT guns)
- **Aircraft** (fighters, bombers, recon planes, ground attack)
- **Naval** (destroyers, cruisers, battleships, submarines, transports)
- **Special Weapons** (TBD — flamethrowers, chemical, early rockets)

### Default Tier 0 Units (every nation starts with these)
- Rifle Squad (bolt-action infantry, 2-3 hex range)
- Scout (high vision, light weapons)
- Field Artillery (6-10 hex range, indirect fire)
- Light Truck (logistics/transport)

### Unit Stats (preliminary)
- HP
- Movement (hexes per turn)
- Attack Range (hexes)
- Attack Power
- Defense
- Vision Range
- Upkeep Cost (food/oil per turn)
- Special Abilities (if any)

---

## 9. Unit Design System *(Signature Feature)*

Players can design custom units in a **Unit Design UI**, accessible from production buildings.

### How It Works
1. Select a **base chassis** (e.g., Ground Soldier, Light Tank, Medium Tank, Fighter Airframe)
2. Equip **modules** from your researched tech tree
3. Name the unit
4. Set it into production

### Infantry Modules (examples)
- **Weapons:** Bolt-action rifle, Semi-auto rifle, SMG, LMG, Sniper rifle, Bazooka, AT mine kit, Mortar, Flamethrower
- **Equipment:** Basic boots, Mountain boots, Cold weather gear, Radio kit, Medical kit
- **Training:** Basic, Assault, Recon, Engineer, Paratrooper

### Vehicle Modules (examples)
- **Chassis:** Light tank, Medium tank, Heavy tank, Super-heavy tank, Halftrack, Armored car
- **Main gun:** 37mm, 57mm, 75mm, 88mm, 105mm howitzer
- **Armor:** Standard, Sloped, Reinforced, Spaced
- **Engine:** Standard, High-speed, Heavy-duty
- **Add-ons:** Radio, Smoke launchers, Extra fuel, AA mount

### Aircraft Modules (examples)
- **Airframe:** Fighter, Bomber, Dive bomber, Recon plane
- **Engine:** Standard, High-altitude, High-speed
- **Weapons:** Machine guns, Cannons, Bombs, Rockets, Torpedoes
- **Equipment:** Drop tanks (extended range), Camera (recon)

### Design Constraints
- Each module has a **weight/cost value** — chassis has a max capacity
- Better modules require research
- Designing a unit costs gold/resources
- Units must be produced in appropriate buildings

---

## 10. Combat

### Range & Line of Sight
- Every unit has an attack range measured in hexes
- Direct fire (infantry, tanks) requires clear LOS
- Indirect fire (artillery) does NOT require LOS — but accuracy reduced without a spotter unit in range
- Terrain blocks/modifies LOS (forests partial, mountains full)
- High ground advantage: units on hills/mountains see and shoot further

### Combat Resolution
- Simultaneous fire within a turn
- Attack roll modified by: attacker stats, defender terrain bonus, range penalty, flanking bonus
- Results: damage dealt, possible suppression (unit can't move next turn), possible rout

### Encirclement / Supply
- No active supply line management
- If a unit is **fully surrounded** (all adjacent hexes controlled by enemy) for 2+ turns → attrition damage each turn
- Encourages players to maintain corridors and avoid pockets

---

## 11. Tech Tree

- Uniform base tree available to all nations
- Tiered 1–5 (Tier 5 = late war, expensive)
- Organized by branch:
  - **Infantry Weapons** (Rifles Mk1→Mk5, SMGs, AT weapons, etc.)
  - **Armor** (engine upgrades, cannon upgrades, armor upgrades)
  - **Air** (engine tiers, weapons, airframe improvements)
  - **Naval** (hull upgrades, weapons, propulsion)
  - **Defenses** (trench improvements, bunkers, AA, fortifications)
  - **Industry** (faster production, resource bonuses)
  - **Field Tech** (recon upgrades, communications, field medicine)
  - **Special** (late-game unique capabilities)
- Research costs: Research Points (generated by scientists)
- Some techs also require buildings (e.g., need Airfield to research air tech)

---

## 12. Recon & Intel System *(Develop Later)*

- Fog of war: see only what your units see
- Ghost icons for last-known enemy positions (fade after 2 turns)
- Recon units: extended vision, can ID enemy unit types
- Listening Posts: static intel structures
- Intel capture: capturing enemy buildings may reveal their unit roster or tech
- Spies/agents: potential future system

---

## 13. Nations

- All nations start with the same base units and tech tree
- **Optional:** Nation-specific bonuses, starting units, or unique tech branches
- **Monetization hook:** 2-3 base nations free; additional nations unlocked via purchase
- Nation design is a late-stage feature — build generic first

---

## 14. Multiplayer & Accounts

- User accounts required (email/password or OAuth)
- Game lobby system: create game, invite players, set map/settings
- Simultaneous turn submission with timer (TBD — e.g., 24 hours per turn for async)
- AI opponents and AI teammates supported
- Solo vs AI fully supported

---

## 15. Monetization *(Back Burner)*

- Free tier: access to 2-3 nations
- Paid: unlock additional nations
- Potential: cosmetic unit skins, map packs
- No pay-to-win. Ever.

---

## 16. Tech Stack

| Layer | Technology |
|---|---|
| Game Engine | Godot 4 (3D mode) |
| Export Target | Web (HTML5) + Windows/Mac |
| Backend | Node.js |
| Database | PostgreSQL or SQLite |
| Auth | User accounts (JWT) |
| Hosting | TBD |

---

## 17. Development Phases

### Phase 1 — Prototype (Start Here)
- Basic hex map (3D, isometric, rotating camera)
- 2 players, 1 resource (iron), 1 building type, 3 unit types
- Simple movement + combat
- Turn submission + resolution loop
- Fog of war

### Phase 2 — Core Loop
- Full resource system
- Base building chain
- Unit design UI (infantry + vehicles)
- Basic tech tree (Tier 1-2)
- AI opponent (Phase 1 AI)

### Phase 3 — Depth
- Full tech tree
- All unit domains (air, naval)
- Full terrain system
- Multiplayer polish
- Recon system

### Phase 4 — Polish & Launch
- Hand-crafted maps
- Procedural map generator
- Nation-specific bonuses
- Monetization system
- AI improvements

---

## 18. Open Questions / Revisit Later
- Turn time limit (24h async vs live sessions?)
- Exact resource numbers and balance
- Full nation roster
- Specific tech tree entries (full list)
- Naval combat details
- Air combat details (dogfighting?)
- Special weapons scope
- Victory variants (points, time limit, surrender)
- Map sizes and player count scaling
