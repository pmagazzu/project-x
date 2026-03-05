# Attrition — Game Design Document
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

> **Full Tech Tree:** See [`TECH_TREE.md`](TECH_TREE.md) for the complete, branch-by-branch tech tree with all tiers, module options, RP costs, and prerequisites.

### Overview

- Uniform base tree available to all nations (nation-specific variants: [TBD])
- **Tier 0:** Starting units — no research needed (1935 baseline: bolt-action rifles, early tanks, biplanes, early subs)
- **Tiers 1–5:** Researched with Research Points (RP). Tier 5 = late WWII tech (jets, heavy tanks, V-weapons, advanced subs)
- **Science Lab building level** gates tier access (Lvl 1 → Tier 1, ..., Lvl 5 → Tier 5)

### 8 Research Branches (Tabs on Research Screen)

| # | Branch | Focus |
|---|--------|-------|
| 1 | **Commercial / Civil** | Population, trade, roads, rail, agriculture, communications |
| 2 | **Industrial** | Mining, manufacturing, materials science, heavy industry |
| 3 | **Foot Soldiers** | Small arms, support weapons, AT infantry, training doctrines |
| 4 | **Ground Vehicles** | Scout cars → super-heavy tanks, SPGs, halftracks — deepest tree |
| 5 | **Air Vehicles** | Fighters, bombers, recon, transports, early jets |
| 6 | **Naval Vessels** | Submarines, destroyers, cruisers, battleships, carriers — most detailed tree |
| 7 | **Engineering** | Fortifications, bridges, minefields, obstacles, demolition |
| 8 | **Science** | Meta-research: RP bonuses, parallel tracks, cross-branch discounts |

### Unit Design System Integration

All vehicle/naval/aircraft branches produce **modules** (guns, armor, engines, sensors, add-ons) that are equipped via the **Unit Design UI** (GDD §9). Researching a tech unlocks its module for use when designing custom units.

### Key Cross-Branch Dependencies

- Medium/Heavy tanks require Industrial (Steel Foundry, Heavy Press Forging)
- Jet aircraft require Industrial (Jet Fuel Synthesis)
- Carriers require Industrial (Advanced Naval Construction)
- Paratroopers require Foot Soldiers + Engineering
- Rockets require Industrial (Rocket Propellant Industry)

### Research Economics

- RP generated by citizens assigned as Scientists
- ~20 scientists ≈ 36 RP/turn (mid-game typical)
- Tier 2 tech: ~2 turns; Tier 4: ~6 turns; Tier 5: ~12 turns
- Science branch unlocks parallel research tracks (default: 1 at a time)

*Full details, all module options, and open design questions: see [`TECH_TREE.md`](TECH_TREE.md)*

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

## 19. Veterancy System

Units gain experience through combat and advance through ranks:

| Rank | How Obtained | Stat Bonus |
|---|---|---|
| Recruit | Default on training | Base stats |
| Trained | Training Facility building, or combat | +5% attack/defense, +5 morale |
| Veteran | Extended combat | +15% attack/defense, +15 morale |
| Elite | Prolonged survival + combat | +30% attack/defense, +30 morale, special abilities |

- **Training Facility** building allows units to start at Trained rank instead of Recruit
- Elite units are precious — losing them hurts strategically and psychologically
- Veterancy is tied to the specific unit, not the unit type

---

## 20. Fog of War — Partial Visibility

Two-tier visibility system:

- **Detected:** You can see something is in a hex (silhouette/unknown icon) but don't know what it is
- **Identified:** A recon unit (Scout, Recon Plane, Listening Post, etc.) has ID'd the unit — you see exact type, estimated health, owner

Enemy units outside your LOS: hidden completely
Enemy units in your LOS but not ID'd: shown as unknown contact marker
Enemy units in your LOS AND ID'd by recon: fully visible with stats

Ghost icons (last known position) fade after 2 turns as before.

This makes recon units essential — you can't counter what you can't identify.

## 21. Unit Visual Identification System

**Design Rule: Shape = class, Size/detail = tier, Color dot = threat level, Stats = recon only**

### Visibility Tiers (ties into Fog of War §20)

| Intel Level | What You See |
|---|---|
| Hidden (no LOS) | Nothing |
| Detected (LOS, no recon ID) | Silhouette/question mark — you know something is there |
| Basic ID (LOS) | Unit type icon (tank, infantry, artillery) + threat color dot |
| Full ID (recon unit nearby) | Unit name, approximate health bar, known loadout details |

### Visual Design Rules for Sprites
- **Shape** communicates unit class — scout/light = small fast silhouette, medium tank = wide low profile, heavy = massive/imposing, infantry = humanoid cluster
- **Size and detail level** communicates tier — Tier 0 is small/boxy/simple, Tier 2 has longer barrels/more detail, Tier 4-5 is visually intimidating and clearly different
- **Threat color dot** (under unit tile): 🟢 Green = low threat, 🟡 Yellow = moderate, 🔴 Red = high threat
- Threat dot is based on estimated tier (visible from basic LOS), not exact stats

### Player Experience Goal
A player looks across the map and sees a large, detailed, red-dot unit and immediately knows: "that's a high-tier heavy — I need anti-tank weapons before engaging." They don't know the exact cannon or armor spec without spending a recon unit to ID it. That intel costs something, which makes recon valuable.

## 21. Unit Visual Identification System

**Design Rule: Shape = class, Size/detail = tier, Color dot = threat level, Stats = recon only**

### Visibility Tiers (ties into Fog of War §20)

| Intel Level | What You See |
|---|---|
| Hidden (no LOS) | Nothing |
| Detected (LOS, no recon ID) | Silhouette/question mark — you know something is there |
| Basic ID (LOS) | Unit type icon (tank, infantry, artillery) + threat color dot |
| Full ID (recon unit nearby) | Unit name, approximate health bar, known loadout details |

### Visual Design Rules for Sprites
- **Shape** communicates unit class — scout/light = small fast silhouette, medium tank = wide low profile, heavy = massive/imposing, infantry = humanoid cluster
- **Size and detail level** communicates tier — Tier 0 is small/boxy/simple, Tier 2 has longer barrels/more detail, Tier 4-5 is visually intimidating and clearly different
- **Threat color dot** (under unit tile): 🟢 Green = low threat, 🟡 Yellow = moderate, 🔴 Red = high threat
- Threat dot is based on estimated tier (visible from basic LOS), not exact stats

### Player Experience Goal
A player looks across the map and sees a large, detailed, red-dot unit and immediately knows: "that's a high-tier heavy — I need anti-tank weapons before engaging." They don't know the exact cannon or armor spec without spending a recon unit to ID it. That intel costs something, which makes recon valuable.

## 22. Victory Types & Game Modes

### Victory Types
- **Annihilation** — destroy all enemy HQs. No turn limit. Core mode.
- **King of the Hill** — 1, 3, or 5 control points on map. Each point controlled = points per turn. First to X points wins, or most points at turn limit. Control points placed at contested terrain (passes, resource nodes, high ground).

### Game Modes
- **Skirmish** — pick map, nation, opponents (human or AI). Core mode.
- **vs AI** — solo skirmish against AI opponents/teammates
- *(future)* Historic Scenarios
- *(future)* Attack/Defense mode

---

## 23. Nations

Fictional universe — same tech tree for all, minor starting differences only. No huge advantages.

**Differentiation model:**
- Different Tier 0 starting units (minor stat variation, equalizes by Tier 2)
- 1 free Tier 1 research unlock at game start
- 1 small passive bonus (≤10% effect, nothing that snowballs)
- Distinct visual aesthetic per nation

**6 Placeholder Nations:**
| Nation | Free Research | Passive |
|---|---|---|
| 🔴 Ardenian Compact | Iron Mine efficiency | +5% iron output |
| 🟤 Khalessi Dominion | Oil extraction | +5% oil output |
| 🟢 Verath Republic | Infantry Rifles Mk1 | — |
| 🔵 Morrean Sovereignty | Destroyer hull | +1 naval unit movement |
| ⚫ Irongate Federation | Military Training | Units start as Trained |
| 🟡 Solenne Union | Farm efficiency | +5% food output |

---

## 24. Buildings System

### Core Principle
Buildings upgrade Tier 1→5 by physically adding on — each tier adds a new structure/function, not just a stat bump. A Tier 4 Barracks looks fortified and busy. A Tier 1 is a wooden shack. Visual progression helps players read the battlefield.

### Barracks Upgrade Chain (template for all buildings)
- **T1** — Basic structure, slow production, Tier 0-1 units only
- **T2** — + Training Yard: units start as Trained, faster production, Tier 2 units
- **T3** — + Defensive addition (MG nest, repair bay, control tower, etc.), Tier 3 units
- **T4** — + Armory/Advanced facility, better starting equipment, Tier 4 units
- **T5** — + Elite facility, rare bonuses, Tier 5 units

### Building Categories
**Production:** Barracks, Motor Pool, Artillery Depot, Airfield, Naval Yard
**Industrial:** Iron Mine, Oil Well, Farm, Gold Mine, Factory, Power Plant, Housing, Trade Post
**Science/Intel:** Research Lab, Intelligence Bureau, Listening Post, Radio Tower
**City Chain:** Town Hall → City Hall → Government HQ (HQ = win condition target)
**Forward Operating Base (FOB):** Field mini-HQ, trains T0-1 units, gathers local resources, T1-3 upgrades only
**Defensive:** Trench Network, Concrete Bunker, Defensive Wall, AA Battery, Coastal Artillery, Naval Minefield, Land Minefield, Artillery Emplacement, Observation Tower, Radar Station

More building types to be added in future design passes.

---

## §25 — Combat System (Full Design)

### Combat Stats

**Offensive:**
- `soft_attack` — damage vs infantry, engineers, unarmored units
- `hard_attack` — damage vs armored targets
- `pierce` — armor penetration value; compared directly to target's `armor`
- `range` — attack range in hexes
- `accuracy` — modifier to combat score roll

**Defensive:**
- `armor` — compared directly to attacker's `pierce`; reduces hard damage if pierce < armor
- `defense` — general damage reduction (training, cover, entrenchment)
- `evasion` — shifts outcome roll toward better results (recon/fast units)

**Operational:**
- `movement` — hexes per turn (terrain + road modified)
- `supply_use` — supply consumed per turn (future)
- `sight` — fog of war vision radius
- `reliability` — breakdown chance under stress (future)

### Pierce vs Armor

- If `pierce ≥ armor`: full damage (penetrated)
- If `pierce < armor`: damage scaled down by ratio — `dmg × (pierce / armor)`
- Example: pierce 3 vs armor 5 → 60% damage; pierce 6 vs armor 5 → 100%

### Combat Outcome Tiers (replaces miss/hit)

Roll a combat score from attacker vs defender stats. Result:

| Tier | Score Range | Effect |
|---|---|---|
| Catastrophic Failure | 0–19 | Heavy attacker losses, defender unharmed |
| Repelled | 20–39 | Attacker takes damage |
| Neutral | 40–59 | Half damage both ways |
| Effective | 60–79 | Full damage to defender |
| Overwhelming | 80–100 | Full damage + defender suppressed (loses next action) |

**Score modifiers:**
- Pierce vs armor ratio (major)
- Terrain defense bonus: forest +10, mountain +20, trench +15
- Dug-in: +8 defender
- Flanking (multiple attackers same target): +10 per additional attacker
- Morale: ±5–15 (future)
- Veterancy: ±5–20 (future)

### Transparency Principle

All combat math is shown to the player. After resolution:
- Full breakdown: attack values, armor comparison, terrain modifiers, score, outcome tier
- Enemy stats shown based on intel level:
  - No recon: unit type + rough health only
  - Friendly recon unit adjacent: armor + attack class
  - Dedicated recon unit in range: full stats
- Goal: players can reverse-engineer exactly why they lost and redesign accordingly

### Design Intent

Transparent stats drive unit customization. Players should be able to look at a combat breakdown, identify the gap ("their armor is 6, my pierce is 2"), and solve it through the unit designer. This loop — see stats → understand → redesign → retry — is the core engagement driver for veteran players.

---

## §26 — Building System

### Assignment
- **HQ**: trains Engineers (future: Recon, research/upgrade actions)
- **Barracks**: trains Infantry
- **Vehicle Depot** (TBD): trains Tanks, Artillery, armored units
- **Iron Mine**: +2 iron/turn (engineer builds on iron deposit hex)
- **Oil Pump**: +2 oil/turn (engineer builds on oil deposit hex)
- **Road**: reduces all terrain movement costs to 1 (engineer builds on any hex, costs 1 iron)

### Construction
- Engineers build most structures (spend move action, costs iron)
- Infantry can "Dig In" (field fortification, minor defense bonus, lost on move)
- Future: researched Trench building — permanent structure, survives unit, destroyable

### Building Capture
- Move a unit onto an enemy-owned building → ownership flips at turn resolution
- HQ capture = game over for that player (King of the Hill win condition)

---

## §27 — Combat Intel UI

When attacking, show side-by-side panel:
- Left: attacker full stats
- Right: enemy stats (filtered by intel level)
- Preview: estimated outcome range based on known values
- After resolution: full breakdown with all modifiers shown
