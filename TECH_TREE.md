# Project X — Full Tech Tree
*Living document. Last updated: 2026-03-04*
*For GDD context see: GDD.md §11*

---

## Overview

The tech tree is organized into **8 research branches**, displayed as tabs in the Research screen. All nations share the same base tree (nation-specific variants are [TBD]).

**Research Currency:** Research Points (RP), generated per turn by citizens assigned as Scientists.

**Science Lab Gate System:**
- Science Lab Lvl 1 → Tier 1 unlocked
- Science Lab Lvl 2 → Tier 2 unlocked
- Science Lab Lvl 3 → Tier 3 unlocked
- Science Lab Lvl 4 → Tier 4 unlocked
- Science Lab Lvl 5 → Tier 5 unlocked

You can research within a tier freely once the lab level is met, but you cannot jump ahead. Science branch (§8) provides specific bonuses that accelerate research and reduce costs — it is not a gated tree itself.

**RP Cost Scale:**
| Tier | Typical Cost Range |
|------|-------------------|
| 1    | 10–40 RP          |
| 2    | 40–80 RP          |
| 3    | 80–150 RP         |
| 4    | 150–280 RP        |
| 5    | 280–500 RP        |

---

## Module System Summary

Units are designed using a **Base Chassis + Module** system. Each chassis has a **Weight Budget** (WB). Modules consume weight. Better modules = more weight. This creates meaningful tradeoffs (fast vs. armored; gunpower vs. range).

Module categories per domain are described within each branch.

---

## Branch 1: Commercial / Civil

*Governs population growth, trade, citizen productivity, logistics, and economic infrastructure. Not combat-focused — but underpins everything.*

### Sub-Categories
- **Population & Housing** — grow your nation's labor force
- **Trade & Commerce** — gold generation, market access
- **Transportation Networks** — roads, rail, logistics speed
- **Agriculture** — food production efficiency
- **Communications** — command range, intel relay

---

### Tier 0 (Starting Baseline — No Research)
- **Dirt Roads:** Basic movement network. Units on roads move at 0.5x cost.
- **Open-Air Market:** +2 Gold/turn base.
- **Subsistence Farm:** Basic food output. Supports up to 20 citizens per farm.
- **Telegraph Line:** Basic comms. HQ command radius: 15 hexes.
- **Mud Hut Housing:** Supports 5 citizens per housing unit.

---

### Tier 1 (Science Lab Lvl 1)

#### Population & Housing
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Tenement Housing** | 15 RP | — | Housing capacity +10 citizens/unit |
| **Public Sanitation** | 20 RP | Tenement Housing | Population growth rate +15% |
| **Community Well** | 10 RP | — | Reduces food required per citizen by 10% |

#### Trade & Commerce
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Merchant Guild** | 20 RP | — | +5 Gold/turn per active market |
| **Import Licensing** | 15 RP | Merchant Guild | Can trade for Iron or Oil once per 3 turns [TBD: trade mechanics] |
| **Banking System** | 25 RP | Merchant Guild | Gold stockpile earns 2% interest per turn |

#### Transportation
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Gravel Roads** | 15 RP | — | Road movement cost reduced to 0.4x |
| **Horse-Drawn Supply Wagons** | 20 RP | — | Unlocks Supply Wagon unit (logistics) |
| **River Ferry System** | 25 RP | — | Units can cross rivers at designated hexes without a bridge |

#### Agriculture
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Crop Rotation** | 15 RP | — | Farm output +20% |
| **Fertilizer Use** | 20 RP | Crop Rotation | Farm output +15% additional |
| **Livestock Farming** | 15 RP | — | Unlocks Pasture building (+food, +cavalry upkeep bonus) |

#### Communications
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Telephone Network** | 20 RP | — | HQ command radius +5 hexes |
| **Improved Telegraph** | 15 RP | — | Reduces turn submission intel delay [TBD] |

---

### Tier 2 (Science Lab Lvl 2)

#### Population & Housing
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Apartment Blocks** | 45 RP | Tenement Housing | Housing capacity +25 citizens/unit |
| **Public Healthcare** | 50 RP | Public Sanitation | Reduces attrition losses in sustained combat by 10% |
| **Vocational Training Schools** | 55 RP | Apartment Blocks | Citizen → Scientist conversion time halved |

#### Trade & Commerce
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Stock Exchange** | 60 RP | Banking System | +10 Gold/turn flat bonus |
| **Industrial Trade Agreements** | 50 RP | Import Licensing | Unlock resource-for-resource trade with neutral AIs [TBD] |
| **Black Market Access** | 40 RP | Merchant Guild | Can purchase small resource bundles at premium gold cost |

#### Transportation
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Paved Highways** | 50 RP | Gravel Roads | Road movement cost 0.3x. Ground vehicles +1 move on roads |
| **Railway Network** | 65 RP | Gravel Roads | Unlock Rail Lines (link two cities; units move 3× speed along rail) |
| **Motor Truck Logistics** | 45 RP | Horse-Drawn Supply Wagons | Replaces wagon with Motorized Supply Truck (faster, higher capacity) |

#### Agriculture
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Mechanized Plowing** | 55 RP | Fertilizer Use | Farm output +25%, reduces farmers needed by 10% |
| **Grain Silos** | 40 RP | Crop Rotation | Stores up to 50 Food as emergency reserve |

#### Communications
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Radio Broadcasting** | 50 RP | Telephone Network | HQ command radius +10 hexes. Unlocks propaganda mechanic [TBD] |
| **Field Radio Units** | 55 RP | Improved Telegraph | Artillery spotters can relay to indirect fire units +2 hexes |

---

### Tier 3 (Science Lab Lvl 3)

#### Population & Housing
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Urban Planning** | 90 RP | Apartment Blocks | New city districts: designate hex as Industrial/Residential/Military |
| **Mass Conscription System** | 100 RP | Vocational Training Schools | Conscript citizen-soldiers at 50% normal cost (lower stats) [TBD] |
| **Worker Unions** | 85 RP | Public Healthcare | Factory production speed +10% |

#### Trade & Commerce
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **War Economy** | 110 RP | Stock Exchange | Gold → Resource conversion rate improved. Non-military gold drain reduced |
| **Rationing System** | 90 RP | — | Reduces all unit food upkeep by 15% |

#### Transportation
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Military Rail Priority** | 100 RP | Railway Network | Units can redeploy via rail in 1 turn across connected cities |
| **All-Season Roads** | 95 RP | Paved Highways | Weather no longer degrades road movement [TBD: weather system] |
| **Supply Depot Network** | 110 RP | Motor Truck Logistics | Build Supply Depot buildings — units within 3 hexes get +1 movement |

#### Agriculture
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Agricultural Mechanization** | 100 RP | Mechanized Plowing | Farm workers reduced by 25% for same output |
| **Food Preservation** | 90 RP | Grain Silos | Emergency food reserve increased to 150 |

#### Communications
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Encrypted Signals** | 120 RP | Radio Broadcasting | Enemy cannot intercept your intel from Listening Posts [TBD] |
| **Frontline Command Posts** | 110 RP | Field Radio Units | Forward HQ concept — deploy mobile command unit [TBD unit] |

---

### Tier 4 (Science Lab Lvl 4)

| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Industrial Welfare State** | 180 RP | Worker Unions + Urban Planning | All production buildings +15% output |
| **Autobahn Construction** | 160 RP | All-Season Roads | Special highway hexes: ground vehicles move at 0.2x cost |
| **Civilian Aviation Network** | 170 RP | Military Rail Priority | Unlock civilian cargo plane unit (logistics only, no combat) |
| **Wartime Propaganda Ministry** | 155 RP | War Economy | Morale mechanic boost [TBD]; reduces desertion/attrition |
| **Centralized Food Authority** | 165 RP | Agricultural Mechanization | Nation-wide food redistribution; no farm required within 3 hexes of any city |

---

### Tier 5 (Science Lab Lvl 5)

| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Total War Economy** | 400 RP | Industrial Welfare State + War Economy | All resource extraction +25%. Civilian production repurposed for military. |
| **National Railway Command** | 380 RP | Military Rail Priority + Autobahn | Units redeploy via rail in same turn. Rail can now transport heavy armor. |
| **Strategic Propaganda Apparatus** | 350 RP | Wartime Propaganda Ministry | Can attempt to reduce enemy citizen morale [TBD: diplomacy/morale system] |
| **Emergency Mobilization** | 420 RP | Mass Conscription + Total War Economy | One-time: double unit production for 3 turns at cost of 50% gold reserve |

---

## Branch 2: Industrial

*Governs production speed, resource extraction efficiency, factory output, and the capacity to build advanced military hardware.*

### Sub-Categories
- **Resource Extraction** — mine/well/farm efficiency
- **Manufacturing** — production queue speed, unit cost reduction
- **Heavy Industry** — unlocks advanced vehicle/weapon production
- **Energy** — fuel efficiency, power for advanced facilities [TBD: electricity mechanic?]
- **Materials Science** — advanced alloys, composites, fuels

---

### Tier 0 (Starting Baseline)
- **Iron Mine (Basic):** +3 Iron/turn per mine.
- **Oil Well (Basic):** +2 Oil/turn per well.
- **Forge (Basic):** Allows Iron → Equipment conversion.
- **Workshop:** Basic vehicle/weapon repair at full cost.
- **Manual Assembly:** Units take full production turns to build.

---

### Tier 1 (Science Lab Lvl 1)

#### Resource Extraction
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Improved Mine Shafts** | 20 RP | — | Iron Mine output +25% |
| **Oil Pump Efficiency** | 20 RP | — | Oil Well output +20% |
| **Blast Furnace (Basic)** | 25 RP | Improved Mine Shafts | Iron → Steel conversion available. Steel required for Tier 2+ vehicles |
| **Open Pit Mining** | 30 RP | Improved Mine Shafts | New Mine type: cheaper, lower output but no shaft depth limit |

#### Manufacturing
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Assembly Line (Basic)** | 25 RP | — | Infantry unit production -10% time |
| **Standardized Parts** | 20 RP | Assembly Line | Repair costs -15% for all units |
| **Tool & Die Making** | 25 RP | Standardized Parts | Vehicle production -10% time |

#### Materials Science
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Basic Steel Alloys** | 20 RP | Blast Furnace | Unlocks Steel Armor modules for Tier 1 vehicles |
| **Rubber Processing** | 15 RP | — | Tire-equipped units no longer penalized on certain terrain [TBD] |

---

### Tier 2 (Science Lab Lvl 2)

#### Resource Extraction
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Deep Shaft Mining** | 50 RP | Improved Mine Shafts | Iron Mine +40% output total |
| **Oil Refinery** | 60 RP | Oil Pump Efficiency | Oil Well +30%. Unlocks Refined Fuel (required by Tier 3 vehicles) |
| **Coal Mining** | 45 RP | Open Pit Mining | Unlocks Coal resource — fuels factories without oil |
| **Gold Dredging** | 50 RP | — | Gold Mine output +30% |

#### Manufacturing
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Mass Production Techniques** | 60 RP | Assembly Line (Basic) | All unit production -20% time (cumulative with T1) |
| **Specialized Factories** | 65 RP | Tool & Die Making | Build Vehicle Factory (separate from general factory) — +30% vehicle production |
| **Maintenance Depots** | 55 RP | Standardized Parts | Units adjacent to depot repair 2 HP/turn automatically |

#### Heavy Industry
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Steel Foundry** | 70 RP | Blast Furnace (Basic) | Unlock Heavy Steel modules. Required for Medium Tank chassis |
| **Casting & Forging** | 65 RP | Steel Foundry | Reduces cost of armor modules by 15% |

#### Materials Science
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **High-Carbon Steel** | 55 RP | Basic Steel Alloys | +5% armor effectiveness on steel modules |
| **Synthetic Rubber** | 50 RP | Rubber Processing | No longer dependent on natural rubber imports [TBD] |
| **Aviation Aluminum** | 60 RP | — | Unlock Aluminum Airframe modules (lighter, faster aircraft) |

---

### Tier 3 (Science Lab Lvl 3)

#### Resource Extraction
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Industrial Mining Complex** | 100 RP | Deep Shaft Mining | Iron Mine produces +60% total. Requires more workers |
| **Cracking Towers** | 110 RP | Oil Refinery | Oil produces 2x as many vehicle-fueling units from same oil |
| **Strategic Resource Rationing** | 90 RP | — | Reduce oil/iron upkeep of all units by 10% |

#### Manufacturing
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Modular Construction** | 120 RP | Specialized Factories | Ships and heavy vehicles produced in sections (parallel production) [TBD] |
| **Night Shift Production** | 100 RP | Mass Production Techniques | Factories produce 24-hour equivalent per turn |
| **Quality Control Bureau** | 95 RP | Standardized Parts + Maintenance Depots | Unit base HP +5% (all new units) |

#### Heavy Industry
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Armor Rolling Mills** | 130 RP | Steel Foundry | Unlocks Rolled Homogeneous Armor (RHA) modules for vehicles |
| **Heavy Press Forging** | 120 RP | Casting & Forging | Unlock Super-Heavy Chassis (required for Tier 4+ heavy tanks) |
| **Naval Shipyard Expansion** | 140 RP | Steel Foundry | Shipyard can build up to Cruiser-class vessels |

#### Materials Science
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Chromium Steel Alloy** | 130 RP | High-Carbon Steel | Armor module weight reduced 10% for same protection |
| **Synthetic Fuel (Coal-to-Oil)** | 150 RP | Cracking Towers + Coal Mining | Coal can substitute for Oil in vehicle upkeep at 2:1 ratio |
| **Hardened Tool Steel** | 110 RP | High-Carbon Steel | AP ammo modules +10% penetration |

---

### Tier 4 (Science Lab Lvl 4)

| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Automated Factory Lines** | 200 RP | Night Shift Production + Modular Construction | All unit production -35% time total |
| **Cermet Armor Research** | 180 RP | Chromium Steel Alloy | Unlock Composite Armor modules (weight-efficient, high protection) |
| **High-Output Refineries** | 190 RP | Cracking Towers | Oil extraction nodes produce +80% total |
| **Strategic Industrial Reserve** | 175 RP | Strategic Resource Rationing | Store 200 Iron/Oil for emergency use without upkeep drain |
| **Advanced Naval Construction** | 210 RP | Naval Shipyard Expansion | Shipyard can build Battleship and Carrier class hulls |
| **Jet Fuel Synthesis** | 220 RP | Synthetic Fuel | Unlock Jet Engine modules for Tier 5 aircraft |

---

### Tier 5 (Science Lab Lvl 5)

| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Super-Factory Complex** | 450 RP | Automated Factory Lines | One designated hex becomes a Super-Factory; produces at 2× speed, requires 3× workers |
| **Tungsten Carbide Tooling** | 400 RP | Cermet Armor Modules | AP ammo +20% penetration total. Armor modules +10% effectiveness total |
| **Synthetic Oil Independence** | 420 RP | High-Output Refineries + Synthetic Fuel | Oil upkeep eliminated for ground vehicles (using coal-derived fuel) |
| **Rocket Propellant Industry** | 480 RP | Jet Fuel Synthesis | Unlock rocket weapon modules and V-weapon class units |
| **War Production Board** | 390 RP | Super-Factory + Strategic Reserve | Allocate excess resources into instant-build queues [TBD mechanic] |

---

## Branch 3: Foot Soldiers

*Infantry weapons, training, specialist roles, equipment, and doctrine. The backbone of every army.*

### Sub-Categories
- **Small Arms** — rifles, SMGs, LMGs, pistols
- **Support Weapons** — mortars, HMGs, flamethrowers, AT rifles
- **Anti-Tank** — bazooka-type weapons, AT mines, tank hunter squads
- **Equipment & Kit** — boots, gear, cold weather, NBC [TBD]
- **Training & Doctrine** — assault, recon, engineer, airborne, mountain
- **Medical & Logistics** — medic units, field hospitals, ammunition mules

---

### Tier 0 (Starting Baseline)
- **Bolt-Action Rifle Squad** — basic infantry. Range 2, Attack 4, Defense 2, Move 2.
- **Scout (Unarmed Recon)** — vision 5, no attack, move 4.
- **Light Mortar Team** — Range 3–6, indirect, 2-man team.
- **HQ Guard Unit** — defends HQ, range 1, higher HP.

---

### Infantry Module System

When designing an infantry unit, choose:
1. **Base Type** (Rifle Squad, SMG Squad, LMG Team, Sniper, AT Team, Mortar, Engineer, Medic, Recon)
2. **Weapon Loadout** (from Small Arms or Support Weapons tree)
3. **Equipment Package** (from Equipment & Kit tree)
4. **Training Doctrine** (from Training & Doctrine tree)

Each base type has a **Manpower Cost** and a **Module Slot** count. Better weapons/training = higher slot usage.

---

### Tier 1 (Science Lab Lvl 1)

#### Small Arms
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Semi-Automatic Rifle** | 15 RP | — | Garand-style rifle: +1 Attack, same range as bolt-action |
| **Submachine Gun (Basic)** | 15 RP | — | SMG Squad unit: high attack at range 1, weak at range 2+ |
| **Light Machine Gun** | 20 RP | — | LMG suppression capability: hit unit loses 1 move next turn |
| **Pistol Sidearm** | 10 RP | — | All command/officer units get +1 range-0 defense |
| **Bayonet Doctrine** | 10 RP | Bolt-action rifles | Infantry melee attack +2 when assaulting at range 0 |

#### Support Weapons
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Heavy Machine Gun (Basic)** | 20 RP | LMG | HMG Team: suppression +2, Range 3, but cannot move and fire same turn |
| **60mm Mortar** | 15 RP | Light Mortar Team | Replace starter mortar; +1 range, +1 damage |
| **Grenade Training** | 10 RP | — | Infantry units can throw grenades (short range burst vs. infantry) |

#### Anti-Tank
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **AT Rifle (Boys / PTRD type)** | 25 RP | — | AT Rifle Team: vs. Tier 1 light armor only. Cheap, portable |
| **Molotov Cocktail Doctrine** | 10 RP | — | Infantry adjacent to vehicle can attempt incendiary attack. Low damage, high risk |

#### Equipment & Kit
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Steel Helmet** | 10 RP | — | All infantry Defense +1 |
| **Leather Boots (Improved)** | 10 RP | — | Infantry move on rough terrain at -0.5x cost instead of -1x |
| **Field Radio (Backpack)** | 20 RP | — | Radio Kit module: unit can spot for artillery at +3 hex |
| **Entrenching Tools** | 15 RP | — | Infantry can dig foxhole (cover) in 1 turn — +2 defense |

#### Training & Doctrine
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Assault Infantry Doctrine** | 25 RP | SMG + Grenade Training | Assault Squad type: Move 3, Attack melee +3, Defense -1 |
| **Basic Recon Training** | 20 RP | — | Recon Scout: Vision 6, Stealth (harder to spot) |

---

### Tier 2 (Science Lab Lvl 2)

#### Small Arms
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Selective-Fire Battle Rifle** | 45 RP | Semi-Auto Rifle | Upgrade base squad rifle: can switch fire mode (single vs. auto) |
| **Assault Carbine** | 50 RP | SMG + Semi-Auto | Early assault rifle concept: Range 2 with SMG-level attack |
| **Scoped Sniper Rifle** | 40 RP | — | Sniper unit: Range 5, very high damage vs. single target, slow fire |
| **Anti-Material Rifle** | 55 RP | AT Rifle | Improved AT rifle: penetrates Tier 2 armor, slows vehicle for 1 turn |

#### Support Weapons
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **81mm Mortar** | 50 RP | 60mm Mortar | Range 4–8, +2 damage, crew of 3 required |
| **Tripod HMG** | 45 RP | HMG (Basic) | HMG suppression area = 2 hexes (cone). Range 4 |
| **Flamethrower** | 60 RP | — | Flamethrower Team: devastating vs. infantry in cover/bunkers, range 1–2, fragile |

#### Anti-Tank
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Panzerfaust (Basic)** | 55 RP | Molotov Doctrine | Single-use AT weapon at close range. Available as unit equipment |
| **AT Mine Kit** | 50 RP | Entrenching Tools | Engineer squad can lay AT mines in a hex |
| **Shaped Charge Grenades** | 45 RP | Grenade Training | Infantry can attack vehicles at range 0 with high AP damage |

#### Equipment & Kit
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Combat Pack (Medium)** | 45 RP | Leather Boots | Infantry supply duration +2 turns (no attrition) |
| **Winter Gear** | 50 RP | Steel Helmet | Units ignore movement/attack penalties in snow/ice terrain |
| **Smoke Grenade Kit** | 40 RP | — | Unit can deploy smoke screen hex (blocks LOS for 1 turn) |
| **Medic Kit (Field)** | 45 RP | — | Medic unit: adjacent friendly infantry recover 1 HP/turn |

#### Training & Doctrine
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Infiltration Tactics** | 60 RP | Basic Recon + Assault Doctrine | Infiltrator unit: ignores ZoC on entry, high stealth |
| **Engineer Combat Training** | 55 RP | Entrenching Tools | Combat Engineer squad: can destroy bridges, clear minefields, breach wire |
| **Fire & Maneuver Doctrine** | 50 RP | Assault Infantry | Assault units can move then attack (previously attack OR move) |

---

### Tier 3 (Science Lab Lvl 3)

#### Small Arms
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Sturmgewehr-Pattern Assault Rifle** | 100 RP | Assault Carbine | Full assault rifle: Range 2, Attack +5, Fire Mode toggle |
| **Semi-Auto Sniper System** | 90 RP | Scoped Sniper | Sniper can fire twice per turn. Range 6 |
| **Silenced Weapons** | 95 RP | Scoped Sniper | Equip Recon units with silenced pistol/carbine; attacks don't reveal position |

#### Support Weapons
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **120mm Heavy Mortar** | 120 RP | 81mm Mortar | Indirect fire with near-artillery damage. Requires truck transport |
| **Recoilless Rifle** | 110 RP | Tripod HMG | Recoilless gun team: AT role, range 3, lighter than AT gun |
| **Portable Flamethrower (Improved)** | 100 RP | Flamethrower | Longer range (1–3), more fuel, same crew. Can destroy fortifications |

#### Anti-Tank
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Bazooka / Panzerschreck** | 130 RP | Panzerfaust | Reloadable AT rocket launcher. Range 2, high AP vs. Tier 3 armor |
| **Tank Hunter Squad Doctrine** | 120 RP | AT Mine + Shaped Charge | Special unit designed around AT role — gets +3 to all AT attacks |
| **Sticky Bomb** | 95 RP | Shaped Charge Grenades | Very close range but near-certain penetration vs. any Tier 1–2 vehicle |

#### Equipment & Kit
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Mountain Warfare Kit** | 120 RP | Winter Gear + Leather Boots | Units ignore mountain movement penalty. +2 defense in mountain hexes |
| **Airborne Drop Pack** | 130 RP | Combat Pack | Prerequisite for Paratrooper training. Unit can be air-dropped |
| **NBC Basic Protection** | 100 RP | — | Units resist chemical/gas attacks [TBD: chem warfare] |

#### Training & Doctrine
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Paratrooper Training** | 140 RP | Airborne Drop Pack + Engineer | Unlock Paratrooper unit type (deployed by air from Airfield) |
| **Tank Rider Doctrine** | 120 RP | Fire & Maneuver | Infantry can mount friendly tank units; transported, disembark on contact |
| **Urban Combat Training** | 110 RP | Assault Infantry + Engineer | Urban Warfare units: +3 attack and defense in urban hexes |
| **Guerrilla Warfare** | 130 RP | Infiltration Tactics | Partisan-type units: spawn in occupied hexes behind enemy lines [TBD] |

---

### Tier 4 (Science Lab Lvl 4)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Volkssturmgewehr (Cheap Assault Rifle)** | 160 RP | Assault Rifle | Mass-produce assault rifles at 60% cost |
| **PTRS Long-Range AT Rifle** | 175 RP | Anti-Material Rifle | Range 4 AT rifle; penetrates Tier 3 armor |
| **Portable Rocket Battery** | 200 RP | Bazooka | Infantry-carried rocket frame: 3 shots, range 3, AA capable |
| **Commando Training** | 220 RP | Paratrooper + Urban Combat | Elite Commando unit: combines infiltration, AT, and assault capabilities |
| **Chemical Warfare Gear** | 180 RP | NBC Basic Protection | Enable chemical weapon unit attachment [TBD — controversial, needs design] |
| **Anti-Air Infantry** | 190 RP | LMG + Radio Kit | Flak Infantry team: quad-barrel HMG with limited AA capability |

---

### Tier 5 (Science Lab Lvl 5)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **StG-44 Elite Loadout** | 380 RP | Assault Rifle + Commando | Top infantry unit: assault rifle, AT grenades, elite training. Best all-around squad |
| **Panzerfaust 150** | 350 RP | Bazooka | Disposable AT — Range 3, penetrates Tier 5 armor |
| **Special Operations Doctrine** | 400 RP | Commando Training | Commando unit can sabotage buildings (deal building HP damage) |
| **Sapper Assault Platoon** | 420 RP | Urban + Engineer + Commando | Elite engineer-assault hybrid: demolishes fortifications in 1 turn |
| **Volkssturm Levée en Masse** | 300 RP | Mass Conscription (Civil) + Cheap Assault Rifle | Emergency: spawn 3 low-quality infantry per turn at 0 gold cost for 5 turns |

---

## Branch 4: Ground Vehicles

*The deepest tree. Scout cars through super-heavy tanks, artillery, halftracks, and tank destroyers. Extensive module customization.*

### Sub-Categories
- **Scout & Recon Vehicles**
- **Light Armored Vehicles** (armored cars, light tanks)
- **Medium Tanks**
- **Heavy Tanks**
- **Super-Heavy Tanks**
- **Tank Destroyers / Assault Guns**
- **Self-Propelled Artillery**
- **Halftracks & Transports**
- **Specialized Vehicles** (bridgelayers, ARVs, engineering vehicles)

---

### Ground Vehicle Module System

Every vehicle is designed using:

| Module Slot | Options |
|-------------|---------|
| **Chassis** | Defines base HP, armor, speed, weight budget |
| **Main Gun** | Primary weapon (cannon, howitzer, none) |
| **Secondary Armament** | MG, AA gun, additional cannon |
| **Armor Package** | Light, Medium, Heavy, Spaced, Sloped, Composite |
| **Engine** | Speed, reliability, fuel efficiency |
| **Suspension** | Cross-country performance |
| **Radio** | Command capability, range |
| **Special Add-ons** | Smoke launchers, extra fuel tanks, mine rollers, etc. |
| **Crew Compartment** | Size (1–5 crew affects capability) |

**Weight Budget:** Each chassis has a max WB (Weight Budget points). Modules consume WB. Exceeding WB is not possible. Tradeoffs are the core of tank design.

---

### Tier 0 (Starting Baseline)

- **Utility Truck (2t):** Basic transport. Carries 1 infantry squad. No armor. Move 4, Road move 6.
- **Scout Car (Basic):** Vision 5, Light MG, No armor. Move 5.
- **Field Artillery (75mm):** Pulled gun. Range 6–12. Requires truck to move. Indirect fire.
- **Light Tank Mk.I (Generic):** 37mm gun, light armor, Move 3. (Tankette-tier, 1935 standard)

---

### Tier 1 (Science Lab Lvl 1)

#### Scout & Recon Vehicles
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Armored Scout Car** | 30 RP | — | Armored Car chassis: Vision 6, HMG, Light Armor, Move 5 |
| **Motorcycle Recon** | 15 RP | — | Motorcycle Scout: Move 7 on roads, no armor, Vision 5 |
| **Scout Car Radio Package** | 15 RP | Field Radio Kit (Infantry) | Scout vehicles can spot for artillery at +4 hex |

#### Chassis Unlocks
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Light Tank Chassis Mk.II** | 30 RP | Light Tank Mk.I | Improved light tank: +5 HP, 37mm gun, WB 8 |
| **Armored Car Chassis (4-wheel)** | 25 RP | Armored Scout Car | 4-wheel armored car: Move 6, WB 6, 20mm cannon option |
| **Light Halftrack** | 25 RP | — | Halftrack chassis: Move 4, can carry 1 infantry, WB 5 |

#### Gun Modules (Tier 1 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **20mm Autocannon** | 20 RP | 2 | Anti-infantry, light AA capable. Range 3 |
| **37mm AT Gun (towed)** | 20 RP | — | Light AT gun. Penetrates Tier 1 armor |
| **45mm Tank Gun** | 25 RP | 3 | Upgrade: better AP than 37mm. Standard light tank gun |
| **47mm Tank Gun** | 25 RP | 3 | French/Italian style: similar to 45mm, slight accuracy bonus |

#### Armor Modules (Tier 1 Unlocks)
| Module | Cost | WB Cost | Protection |
|--------|------|---------|------------|
| **Riveted Steel Armor (Light)** | 15 RP | 1 | +3 Defense |
| **Welded Steel Armor (Light)** | 20 RP | 1 | +4 Defense, slightly cheaper to repair |
| **Gun Shield** | 10 RP | 1 | Protect crew of towed gun from small arms |

#### Engine Modules (Tier 1 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Petrol Engine Mk.I** | 15 RP | 1 | Standard. Move 3 off-road, Move 5 road |
| **High-Speed Petrol** | 20 RP | 2 | Move 4 off-road, Move 6 road. Less reliable |

#### Add-on Modules (Tier 1 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Pintle MG Mount** | 10 RP | 1 | Secondary MG for anti-infantry |
| **Crew Radio** | 15 RP | 1 | Vehicle can receive orders at extended command range |
| **Extra Fuel Canister** | 10 RP | 1 | +2 operational range [TBD: range system] |

---

### Tier 2 (Science Lab Lvl 2)

#### Scout & Recon Vehicles
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **8-Rad Heavy Armored Car** | 55 RP | 4-Wheel Armored Car | 8-wheeled chassis: Move 7 road, 50mm gun option, WB 10 |
| **Light Recon Tank** | 50 RP | Light Tank Mk.II | Fast tank for scouting: Vision 7, Move 5, thin armor |

#### Chassis Unlocks
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Medium Tank Chassis Mk.I** | 65 RP | Steel Foundry (Industrial) | First medium tank: 30 HP, WB 14, Move 3 |
| **Tank Destroyer Chassis (Light)** | 55 RP | Light Tank Mk.II | Casemate-style TD: no turret, fixed gun, cheaper, +2 gun penetration |
| **Heavy Halftrack** | 50 RP | Light Halftrack | Carries 2 infantry squads, can mount AA gun |
| **Armored Personnel Carrier** | 55 RP | Heavy Halftrack | Full-track APC: Move 4, Armor Light, Carries 2 infantry |

#### Gun Modules (Tier 2 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **50mm L/42 Tank Gun** | 50 RP | 4 | Effective vs. Tier 2 armor at medium range |
| **50mm L/60 Tank Gun** | 55 RP | 5 | Higher velocity — better AP |
| **75mm KwK Short (Howitzer-type)** | 50 RP | 5 | Low velocity, good HE vs. infantry; weak AP |
| **75mm AT Gun (towed)** | 55 RP | — | Medium AT gun; effective vs. Tier 2 armor |
| **76mm Soviet-style** | 55 RP | 5 | Good balance AP/HE. Soviet design flavor |
| **40mm Bofors (AA/AT)** | 50 RP | 4 | Dual-purpose: AA + light AT. Range 4 |

#### Armor Modules (Tier 2 Unlocks)
| Module | Cost | WB Cost | Protection |
|--------|------|---------|------------|
| **Sloped Armor (Medium)** | 55 RP | 3 | +6 Defense. Angling reduces effective penetration |
| **Riveted Steel Armor (Medium)** | 45 RP | 2 | +5 Defense |
| **Welded Steel Armor (Medium)** | 50 RP | 3 | +6 Defense, cheaper repairs |
| **Spaced Armor Add-on** | 40 RP | 2 | +2 Defense vs. HEAT/shaped charge attacks |

#### Engine Modules (Tier 2 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Diesel Engine Mk.I** | 50 RP | 2 | Less fire risk. Fuel efficiency +15% |
| **Petrol Engine Mk.II** | 45 RP | 2 | +1 Move off-road vs. Mk.I |
| **Christie Suspension** | 55 RP | 3 | +1 Move all terrain; less reliable |

#### Suspension Modules (Tier 2 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Volute Spring Suspension** | 40 RP | 1 | Cross-country penalty reduced 10% |
| **Torsion Bar Suspension** | 50 RP | 2 | Cross-country penalty reduced 20%; standard for medium tanks |

---

### Tier 3 (Science Lab Lvl 3)

#### Chassis Unlocks
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Medium Tank Chassis Mk.II** | 110 RP | Medium Tank Mk.I | Improved medium: 45 HP, WB 18, Move 3 |
| **Heavy Tank Chassis Mk.I** | 140 RP | Heavy Press Forging (Industrial) | First heavy tank: 60 HP, WB 24, Move 2 |
| **Tank Destroyer (Medium Chassis)** | 100 RP | TD Light + Medium Tank | Casemate TD on medium chassis: higher-velocity gun options |
| **Assault Gun Chassis** | 110 RP | Medium Tank Mk.I | Infantry support vehicle: hull-mounted howitzer, strong frontal armor |
| **Self-Propelled Gun (Light)** | 100 RP | Medium Tank Chassis | SPG: artillery on a tank chassis. Indirect fire range 8–14 |

#### Gun Modules (Tier 3 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **75mm L/48 (Panzer IV late-style)** | 100 RP | 6 | Good AP+HE balance. Penetrates Tier 3 medium armor |
| **76mm M1 (Sherman-style)** | 100 RP | 6 | Similar capability, US flavor |
| **85mm Soviet Gun** | 110 RP | 7 | High AP. Penetrates early heavy armor |
| **88mm Flak/AT (mounted)** | 130 RP | 8 | Excellent range and AP. Heavy chassis required |
| **105mm Howitzer (hull)** | 110 RP | 7 | Devastating HE vs. infantry/structures; poor AP |
| **57mm High-Velocity AT** | 95 RP | 6 | Good penetration on light/medium. Cheap module |
| **128mm PaK 44 (TD only)** | 150 RP | 10 | Extreme AT; penetrates all Tier 3–4 armor. Heavy chassis required |

#### Armor Modules (Tier 3 Unlocks)
| Module | Cost | WB Cost | Protection |
|--------|------|---------|------------|
| **Sloped Armor (Heavy)** | 120 RP | 4 | +10 Defense. Required for heavy tank feel |
| **Cast Steel Armor** | 110 RP | 3 | +8 Defense, rounded shape — easier to produce |
| **Schürzen Side Skirts** | 90 RP | 2 | +4 Defense vs. HEAT and AT rifles on sides |
| **Appliqué Armor Plates** | 100 RP | 3 | Add-on: +5 Defense to existing armor |

#### Engine Modules (Tier 3 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Diesel Engine Mk.II** | 100 RP | 3 | +1 Move, fuel efficiency +25% |
| **Petrol Engine Mk.III (V12)** | 110 RP | 3 | Move 3 off-road for heavy tanks (normally 2) |
| **Wide-Track System** | 95 RP | 2 | Mud/snow penalty reduced 50% (critical Eastern Front style) |

#### Suspension Modules (Tier 3 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Heavy Torsion Bar** | 100 RP | 3 | Required for heavy tank chassis smooth cross-country |
| **Bogey Wheel Assembly** | 90 RP | 2 | Cheaper alternative; maintenance penalty |

#### Add-on Modules (Tier 3 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Smoke Launchers** | 80 RP | 1 | Deploy smoke screen; unit can retreat without being hit |
| **Commander Cupola** | 90 RP | 1 | Vision +2, command range +2 |
| **Mine Roller** | 100 RP | 3 | Detonate AT mines without damage (reduces Move by 1) |
| **Dozer Blade** | 90 RP | 3 | Create field fortification in 1 turn; reduce movement in forests |

---

### Tier 4 (Science Lab Lvl 4)

#### Chassis Unlocks
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Medium Tank Chassis Mk.III** | 180 RP | Medium Mk.II | Refined medium: 55 HP, WB 22, Move 3 |
| **Heavy Tank Chassis Mk.II** | 220 RP | Heavy Mk.I | Improved heavy: 80 HP, WB 30, Move 2 |
| **Super-Heavy Tank Chassis** | 280 RP | Heavy Mk.II + Heavy Press Forging | Maus/TOG-class: 120 HP, WB 40, Move 1. Rare, expensive |
| **Tank Destroyer (Heavy Chassis)** | 210 RP | TD Medium + Heavy Mk.I | Heavy casemate TD: extreme gun options, limited traverse |
| **Self-Propelled Gun (Heavy)** | 200 RP | SPG Light + Heavy Chassis | Heavy SPG: Range 10–18 indirect fire |
| **Armored Recovery Vehicle** | 175 RP | Heavy Halftrack | ARV: recover disabled friendly vehicles (battlefield repair) |

#### Gun Modules (Tier 4 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **75mm L/70 (Panther-style)** | 175 RP | 7 | High-velocity, excellent AP at all ranges |
| **88mm KwK 43 (Tiger II-style)** | 200 RP | 9 | Best heavy AT of era; penetrates all Tier 4 armor |
| **100mm Soviet Field Gun (mounted)** | 185 RP | 8 | High-velocity, similar capability to 88mm |
| **152mm Howitzer (hull-mount)** | 195 RP | 10 | Devastating vs. anything. ISU-152 style. Slow reload (every 2 turns) |
| **20mm Quad AA Mount** | 165 RP | 5 | Effective anti-air. Can engage Tier 3–4 aircraft |

#### Armor Modules (Tier 4 Unlocks)
| Module | Cost | WB Cost | Protection |
|--------|------|---------|------------|
| **Face-Hardened Armor** | 180 RP | 5 | +14 Defense on frontal arc |
| **Sloped Composite (Early)** | 195 RP | 5 | +12 Defense all-round, lighter than steel equivalent |
| **Zimmerit Paste Coating** | 150 RP | 1 | Immune to magnetic AT charges (sticky bombs, infantry AT) |
| **Internal Spall Liner** | 160 RP | 2 | Crew death reduced on penetrating hits |

#### Engine Modules (Tier 4 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Petrol V12 (Maybach-style)** | 185 RP | 4 | Move 2 for super-heavy; Move 3 for heavy |
| **Diesel V12** | 180 RP | 4 | As above, lower fire risk, fuel efficiency +30% |
| **Gas Turbine (Prototype)** | 220 RP | 5 | Move 3 for heavy; very high fuel cost [TBD balance] |

---

### Tier 5 (Science Lab Lvl 5)

#### Chassis Unlocks
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Main Battle Tank Prototype** | 420 RP | Medium Mk.III + Heavy Mk.II | Post-war concept applied to late WWII: combines Medium mobility with Heavy protection |
| **Super-Heavy Mk.II** | 480 RP | Super-Heavy Mk.I | 150 HP, WB 50, Move 1. Landship-class. Near-impregnable |
| **Rocket Artillery Platform** | 400 RP | SPG Heavy + Rocket Propellant (Industrial) | Multiple rocket launcher: massive area damage, long range, slow reload |
| **Armored Flamethrower Tank** | 380 RP | Heavy Mk.II + Flamethrower (Infantry) | Crocodile-style: devastating vs. bunkers/infantry, short range |

#### Gun Modules (Tier 5 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **128mm KwK (Super-Heavy)** | 400 RP | 12 | Most powerful tank gun: penetrates all armor at any range |
| **300mm Howitzer (SPG)** | 450 RP | 14 | Near-siege weapon. Destroys fortifications in 1 hit |
| **Infrared Spotlight** | 350 RP | 2 | Night combat capability (ignore night penalty) [TBD] |

#### Armor Modules (Tier 5 Unlocks)
| Module | Cost | WB Cost | Protection |
|--------|------|---------|------------|
| **Full Composite Armor** | 380 RP | 6 | +18 Defense all-round; reduces HEAT effectiveness |
| **Active Defense System (Schürzen+)** | 400 RP | 4 | First-hit projectile deflection (reduces damage 50% once per battle) |

---

## Branch 5: Air Vehicles

*Fighters, bombers, dive bombers, ground attack, reconnaissance, and transport aircraft. Includes early jet research.*

### Sub-Categories
- **Fighter Airframes**
- **Bomber Airframes**
- **Dive Bomber / Ground Attack**
- **Reconnaissance Aircraft**
- **Transport & Airborne**
- **Aircraft Engines**
- **Weapons & Payload**
- **Avionics & Equipment**

---

### Aircraft Module System

| Module Slot | Options |
|-------------|---------|
| **Airframe** | Determines HP, speed, maneuverability, payload |
| **Engine** | Speed, altitude, reliability |
| **Primary Weapons** | Machine guns, cannon |
| **Payload** | Bombs, rockets, torpedoes, recon camera |
| **Equipment** | Drop tanks, armor plate, radar, camera |
| **Crew** | Pilot only, Pilot+Gunner, Pilot+Bombardier, etc. |

**Weight Budget** same as ground vehicles — limits payload vs. armor vs. range.

---

### Tier 0 (Starting Baseline)
- **Biplane Fighter:** Move 8, Attack 3, Vision 6, Fragile. Two MGs.
- **Biplane Bomber:** Move 6, Bomb payload small. Range limited.
- **Observation Plane:** Vision 8, no weapons. Artillery spotter.

---

### Tier 1 (Science Lab Lvl 1)

#### Fighter Airframes
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Monoplane Fighter Mk.I** | 30 RP | — | First monoplane: Move 9, better guns, HP 15 |
| **Biplane Upgrade Kit** | 15 RP | Biplane Fighter | Biplane +1 move, +1 attack. Bridge tech before monoplanes |

#### Bomber Airframes
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Light Bomber Mk.I** | 30 RP | — | Twin-engine, medium payload, better range than biplane |
| **Dive Bomber Mk.I** | 30 RP | — | Precision attack: +3 damage vs. single target, -1 area |

#### Engines
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Inline Piston Engine Mk.I** | 20 RP | 2 | Standard fighter engine. 350 km/h equiv |
| **Radial Engine Mk.I** | 20 RP | 3 | Tougher, wider. Better for bombers |

#### Weapons
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Twin .30 cal MG** | 15 RP | 1 | Standard fighter: anti-air, light ground attack |
| **Twin .50 cal HMG** | 20 RP | 2 | Better damage vs. aircraft and light ground |
| **50 kg Bombs (x2)** | 15 RP | 2 | Light bomb load |
| **100 kg Bombs (x2)** | 20 RP | 3 | Medium load, requires Light Bomber chassis |

---

### Tier 2 (Science Lab Lvl 2)

#### Fighter Airframes
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Monoplane Fighter Mk.II** | 55 RP | Monoplane Mk.I | Better aerodynamics, +1 Move, enclosed cockpit |
| **Heavy Fighter / Destroyer** | 60 RP | Monoplane Mk.I | Twin-engine heavy fighter: better range, bomber escort role |
| **Early Interceptor** | 55 RP | Monoplane Mk.II | Optimized for altitude; bonus vs. high-altitude bombers |

#### Bomber Airframes
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Medium Bomber Mk.I** | 65 RP | Light Bomber | 4-engine option later; now twin-engine with bigger payload |
| **Torpedo Bomber Mk.I** | 60 RP | Light Bomber | Can carry torpedo; effective vs. ships at sea-level approach |
| **Ground Attack Mk.I** | 55 RP | Dive Bomber | Armored ground attack: harder to shoot down, limited vs. air |

#### Recon Aircraft
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Long-Range Recon Plane** | 50 RP | Observation Plane | Vision 10, range doubled, no weapons |

#### Engines
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **High-Performance Inline Mk.II** | 50 RP | Inline Mk.I | +1 Move for fighters |
| **Supercharged Radial Mk.I** | 50 RP | Radial Mk.I | High-altitude performance bonus |
| **Twin-Bank Radial** | 55 RP | Radial Mk.I | Required for medium bombers |

#### Weapons
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **20mm Hispano Cannon** | 50 RP | 3 | Fighter cannon: higher damage vs. aircraft, penetrates light armor |
| **250 kg Bomb** | 50 RP | 4 | Significant ground attack payload |
| **Naval Torpedo Mk.I** | 55 RP | 5 | Anti-ship weapon; must approach at low altitude |
| **Recon Camera (Medium)** | 40 RP | 2 | Reveals units in vision area for 2 turns after overfly |

#### Equipment
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Drop Tanks** | 40 RP | 2 | +3 range before must return to airfield |
| **Pilot Armor Plate** | 45 RP | 1 | Pilot survives 1 more hit before aircraft destroyed |

---

### Tier 3 (Science Lab Lvl 3)

#### Fighter Airframes
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Advanced Fighter Mk.III** | 110 RP | Monoplane Mk.II | 1940s generation: laminar flow wing, high speed, WB 14 |
| **Long-Range Escort Fighter** | 120 RP | Heavy Fighter | P-47/P-38 style: range enough to escort deep bombing raids |
| **Night Fighter** | 115 RP | Advanced Fighter | Dark paint, exhaust dampeners, optional radar: operates at night [TBD] |

#### Bomber Airframes
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Heavy Bomber Mk.I** | 130 RP | Medium Bomber | 4-engine: massive payload, slow, requires escort |
| **Fast Medium Bomber** | 120 RP | Medium Bomber | De Havilland style: fast enough to evade fighters, light payload |
| **Dive Bomber Mk.II** | 110 RP | Dive Bomber Mk.I | Improved Stuka-style: faster dive, heavier bomb |

#### Engines
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Merlin / DB-605 Equiv.** | 110 RP | Inline Mk.II | Top piston engine of era. +2 Move, altitude performance excellent |
| **4-Engine Radial Config** | 130 RP | Twin-Bank Radial | Required for Heavy Bomber chassis |
| **Twin Inline (Escort)** | 120 RP | Twin-Bank Radial | Escort fighter range doubled |

#### Weapons
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **37mm Airborne Cannon** | 110 RP | 5 | Jericho/ground attack: punches through medium armor |
| **500 kg Bomb** | 100 RP | 5 | Heavy strike payload |
| **1000 kg "Hermann"** | 130 RP | 7 | Single massive bomb. Destroys most structures |
| **Unguided Rockets (x6)** | 100 RP | 4 | Ground attack rockets; effective vs. armor columns |
| **Naval Torpedo Mk.II** | 110 RP | 6 | Higher speed, depth setting, better vs. evasive ships |

#### Equipment
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Oxygen System** | 95 RP | 1 | Required for high-altitude operations (heavy bomber escort, recon) |
| **Belly Turret** | 110 RP | 3 | Bomber defensive gunner covering underside |
| **Tail Gunner Position** | 95 RP | 2 | Bomber gets rear defense attack vs. pursuing fighters |

---

### Tier 4 (Science Lab Lvl 4)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Advanced Fighter Mk.IV** | 190 RP | Mk.III + Merlin Engine | Late-war piston fighter: P-51D/Fw-190D level |
| **Heavy Bomber Mk.II** | 210 RP | Heavy Bomber Mk.I | B-17G/Lancaster style: 12 defensive guns, huge payload |
| **Strategic Recon Aircraft** | 180 RP | Long-Range Recon | Pressurized, flies at 12km altitude. Cannot be intercepted except by best fighters |
| **Ground Attack Mk.III (Armored)** | 195 RP | Ground Attack Mk.I | Il-2 style: near-impervious to small arms. Slow but devastating |
| **Airborne Transport** | 185 RP | Long-Range Escort | Large transport: drops Paratrooper squads anywhere on map |
| **Jet Engine (Early)** | 220 RP | Jet Fuel Synthesis (Industrial) | Unlocks Tier 5 jet airframes |

#### Weapons (Tier 4)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **4× 20mm Cannon Wing Mount** | 185 RP | 6 | Devastating air-to-air. Best dogfighter loadout |
| **2000 kg Blockbuster** | 195 RP | 8 | Destroys entire hex worth of structures |
| **Anti-Shipping Rocket (RP-3 style)** | 180 RP | 5 | Precision anti-ship strike |
| **Radar Pod** | 175 RP | 3 | Night/weather operations: no detection penalty |

---

### Tier 5 (Science Lab Lvl 5)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Jet Fighter Mk.I** | 400 RP | Jet Engine (Early) | Me-262 style: Move +4 vs. piston fighters, weaker guns |
| **Jet Ground Attack** | 380 RP | Jet Fighter Mk.I | Fast jet striker: can't be intercepted by Tier 1–3 fighters |
| **V-1 Flying Bomb** | 420 RP | Rocket Propellant Industry | Expendable cruise missile: Area bomb, no pilot, range 20+ |
| **Guided Bomb (Fritz-X style)** | 450 RP | Strategic Recon + 2000 kg Bomb | First guided weapon: +50% accuracy vs. naval targets |
| **Jet Engine Mk.II** | 480 RP | Jet Fighter Mk.I | Full jet speed. Move +6. Unlocks fastest aircraft configs |

---

## Branch 6: Naval Vessels

*The most detailed branch. Surface ships, submarines, and carriers — all with deep module customization.*

### Sub-Categories
- **Submarine Doctrine** — ocean denial, stealth raiding
- **Coastal Defense** — torpedo boats, minelayers, patrol craft
- **Destroyers** — escort, anti-sub, torpedo attack
- **Cruisers** — fire support, fleet protection
- **Battleships** — heavy bombardment, sea control
- **Carriers** — force projection, air operations at sea
- **Logistics Vessels** — transport, replenishment, landing craft

---

### Naval Module System

| Module Slot | Options |
|-------------|---------|
| **Hull** | Size class, HP, draft, speed potential |
| **Engine/Propulsion** | Speed, range, noise (sub critical) |
| **Primary Armament** | Main guns, torpedo tubes, missile tubes |
| **Secondary Armament** | AA guns, depth charges, secondary guns |
| **Armor Belt** | Deck and belt armor thickness |
| **Sensor Suite** | ASDIC/Sonar, radar, range-finding optics |
| **Special Systems** | Mine laying, snorkel (sub), floatplane, catapult |
| **Crew Complement** | Affects max module count and repair speed |
| **Fuel Tanks / Range** | Extend operational range before resupply |

**Submarine-Specific Modules:**
| Module Slot | Options |
|-------------|---------|
| **Pressure Hull** | Dive depth rating (shallow / medium / deep) |
| **Ballast Systems** | Dive/surface speed |
| **Stealth Coating** | Acoustic dampening |
| **Torpedo Array** | Bow, stern, number of tubes |
| **Snorkel** | Run diesel submerged |
| **Acoustic Decoy** | Evade depth charges |

---

### Tier 0 (Starting Baseline)
- **River Gunboat:** Shallow draft, 1× 75mm gun, armor light. Inland waterways only.
- **Coastal Patrol Boat:** Move 8, 2× HMG, no armor. Coastal hexes.
- **Type VII Submarine (Early equiv.):** Dive depth shallow, 4 torpedo tubes, Move 6 surface / 3 submerged.
- **Troop Transport (Basic):** Moves 2 infantry units per trip. No armor, no weapons.

---

### Tier 1 (Science Lab Lvl 1)

#### Coastal Defense & Patrol
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Torpedo Boat Mk.I** | 30 RP | Coastal Patrol Boat | Fast attack craft: Move 10, 2 torpedo tubes, no armor |
| **Minelayer Vessel** | 25 RP | — | Lays sea mines (hazard for enemy ships). 20-mine capacity |
| **Motor Gunboat** | 25 RP | Coastal Patrol | 40mm Bofors + HMG. Better firepower for coast |

#### Destroyer Class
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Destroyer Mk.I** | 35 RP | — | First destroyer: HP 25, 4× 127mm guns, 4 torpedo tubes, Move 8 |
| **ASDIC (Basic Sonar)** | 25 RP | — | Destroyers can detect submarines within 3 hexes |

#### Submarine
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Improved Torpedo (Type I)** | 20 RP | — | Torpedo range +1, damage +1 |
| **Dive Protocol Mk.I** | 20 RP | — | Submarine submerges in 1 turn instead of 2 |
| **Extended Range Fuel Tanks** | 25 RP | — | Submarine operational range +3 hexes |

#### Hull Modules (Tier 1 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Light Destroyer Hull** | 25 RP | — | HP 25, Speed 8, draft medium |
| **Submarine Hull Mk.I** | 25 RP | — | HP 20, dive depth shallow (200m), Speed 6 surface / 3 sub |

#### Engine Modules (Tier 1 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Steam Turbine Mk.I** | 20 RP | 2 | Standard destroyer engine |
| **Diesel-Electric (Sub)** | 20 RP | 2 | Standard submarine drive: surface diesel, electric submerged |

---

### Tier 2 (Science Lab Lvl 2)

#### Destroyer Class
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Destroyer Mk.II** | 60 RP | Destroyer Mk.I | HP 35, 4× 127mm + 40mm AA, 8 torpedo tubes |
| **Depth Charge System** | 55 RP | ASDIC Basic | Destroyers carry depth charges: attack submerged subs in detection range |
| **Anti-Sub Destroyer Doctrine** | 55 RP | Depth Charge + ASDIC | ASW specialist destroyer: +2 detection range, carries 40 depth charges |

#### Cruiser Class
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Light Cruiser Mk.I** | 70 RP | Destroyer Mk.I + Naval Shipyard Expansion | HP 50, 8× 152mm guns, light belt armor |
| **Heavy Cruiser Mk.I** | 75 RP | Light Cruiser | HP 65, 8× 203mm guns, medium armor, seaplane catapult |

#### Coastal Defense
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Fast Attack Torpedo Boat Mk.II** | 55 RP | Torpedo Boat Mk.I | Move 12, 4 tubes, radar basic |
| **Submarine Tender** | 60 RP | — | Support ship: submarines within 3 hexes repair 2 HP/turn |

#### Submarine
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Submarine Hull Mk.II** | 65 RP | Submarine Hull Mk.I | HP 28, dive depth medium (350m), Speed 7/4 |
| **Electric Drive Upgrade** | 60 RP | Diesel-Electric | Submerged speed +1, battery range +2 hexes |
| **Torpedo Type II (Acoustic)** | 65 RP | Improved Torpedo Type I | Acoustic homing: +15% hit chance |
| **Deck Gun (100mm)** | 55 RP | Submarine Hull Mk.I | Surface-fire gun; useful vs. unarmed ships/coast |

#### Hull Modules (Tier 2 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Heavy Destroyer Hull** | 55 RP | — | HP 35, Speed 8, more weapon slots |
| **Light Cruiser Hull** | 65 RP | — | HP 50, Speed 6, armor belt 75mm |

#### Armor Modules (Tier 2 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Light Belt Armor** | 50 RP | 2 | +8 Defense for cruiser/larger |
| **Deck Armor (Basic)** | 45 RP | 2 | Reduces plunging fire damage (long-range |

#### Armament Modules (Tier 2 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Twin 127mm Gun Mount** | 50 RP | 3 | Destroyer main battery |
| **Twin 152mm Gun Mount** | 60 RP | 4 | Light cruiser main battery |
| **Quad Torpedo Tube Bank** | 55 RP | 3 | 4-tube set per bank |
| **AA Battery (40mm Bofors ×4)** | 50 RP | 3 | Anti-air defense for ship |

---

### Tier 3 (Science Lab Lvl 3)

#### Cruiser Class
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Heavy Cruiser Mk.II** | 115 RP | Heavy Cruiser Mk.I | HP 80, triple 203mm turrets, heavy armor |
| **AA Cruiser Doctrine** | 110 RP | Light Cruiser Mk.I | Cruiser optimized for fleet AA: +3 to all AA attacks within 2 hexes of fleet |
| **Mine-Laying Cruiser** | 100 RP | Heavy Cruiser Mk.I | Can lay 40 sea mines per sortie |

#### Battleship Class
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Battlecruiser Mk.I** | 140 RP | Heavy Cruiser Mk.I + Advanced Naval Construction | Fast capital ship: HP 100, triple 305mm, speed 7 |
| **Battleship Mk.I** | 150 RP | Battlecruiser Mk.I | Slower, heavier: HP 140, triple 406mm, belt armor 300mm |

#### Submarine
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Submarine Hull Mk.III (Ocean)** | 130 RP | Submarine Mk.II | HP 38, Dive depth deep (500m), Speed 8/5. Open ocean operations |
| **Snorkel System** | 120 RP | Electric Drive Upgrade | Sub can run diesel engines at periscope depth. Massively extends range. |
| **Wolfpack Doctrine** | 140 RP | Submarine Mk.III | Multiple subs can coordinate attacks: combined attack bonus +25% |
| **Acoustic Decoy (T1)** | 110 RP | — | Sub releases decoy when depth-charged: 50% chance attack misses |
| **Magnetic Torpedo Exploder** | 130 RP | Torpedo Type II | Torpedo detonates under keel: double damage vs. capital ships |
| **Mine-Laying Submarine** | 120 RP | Submarine Mk.II | Sub can lay 10 mines per sortie at stealth |

#### Sensors & Electronics
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **ASDIC Active Sonar (Mk.II)** | 110 RP | 2 | Detection range 5 hexes. Sub detected even at depth |
| **Basic Radar (Surface)** | 105 RP | 2 | Ships detect other ships at night/fog +4 hexes |
| **Rangefinder Optics** | 100 RP | 1 | +10% accuracy at long range for main guns |

#### Armor Modules (Tier 3 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Medium Belt Armor (200mm)** | 120 RP | 4 | Battlecruiser protection level |
| **Heavy Belt Armor (300mm)** | 140 RP | 6 | Battleship protection level |
| **Torpedo Defense Bulge** | 110 RP | 3 | Reduces torpedo damage by 30% |

#### Armament Modules (Tier 3 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Triple 305mm Gun Turret** | 130 RP | 7 | Battlecruiser main armament |
| **Triple 406mm Gun Turret** | 150 RP | 9 | Battleship main armament |
| **Depth Charge Thrower (Mk.II)** | 115 RP | 2 | Range 3 depth charge pattern; +2 vs. subs |
| **Twin 127mm DP Mount** | 110 RP | 4 | Dual-purpose: AA + surface fire |

---

### Tier 4 (Science Lab Lvl 4)

#### Carrier Class
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Escort Carrier Mk.I** | 185 RP | Advanced Naval Construction + Airfield | Small carrier: 12 aircraft, Move 5, light armor. Convoy escort role. |
| **Fleet Carrier Mk.I** | 220 RP | Escort Carrier | Full carrier: 36 aircraft, Move 7, armored flight deck |
| **Carrier Air Wing Doctrine** | 200 RP | Fleet Carrier | Carrier-based aircraft get +1 range; carrier counts as airfield for launch |

#### Battleship Class
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Battleship Mk.II** | 215 RP | Battleship Mk.I | HP 170, four triple 406mm, improved AA, speed 6 |
| **Super-Battleship** | 260 RP | Battleship Mk.II | Yamato-class equivalent: HP 220, triple 460mm, extremely expensive |

#### Submarine
| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Type XXI Submarine** | 210 RP | Submarine Hull Mk.III + Snorkel | Revolutionary: submerged speed 7 (equal to surface). Battery banks 3×. |
| **Acoustic Decoy (T2)** | 190 RP | Acoustic Decoy T1 | 75% chance to evade depth charge pattern |
| **Stealth Coating (Rubber)** | 195 RP | — | ASDIC detection range reduced by 2 hexes |
| **Submarine Radar** | 180 RP | Basic Radar + Submarine Mk.III | Sub can detect surface ships at night. Safer surface travel |
| **Long-Range Patrol Sub** | 200 RP | Type XXI | Extended range sub: fuel tanks triple, crew quarters for 90-day patrols |

#### Sensors & Electronics (Tier 4)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Surface Search Radar** | 185 RP | 3 | Ship detects all surface contacts within 8 hexes |
| **Hydrophone Array (Passive Sonar)** | 180 RP | 2 | Detect moving submarines within 6 hexes without pinging (stealth) |
| **Fire Control Computer** | 195 RP | 2 | Main gun accuracy +20% at all ranges |

#### Armament Modules (Tier 4 Unlocks)
| Module | Cost | WB Cost | Effect |
|--------|------|---------|--------|
| **Triple 460mm Gun Turret** | 250 RP | 12 | Super-battleship only. Devastating range and damage |
| **Catapult Floatplane** | 175 RP | 3 | Cruiser/BB: launch 1 recon floatplane for spotting |
| **Hedgehog ASW Mortar** | 185 RP | 3 | 24-bomb pattern ahead of ship: +30% sub kill chance |

---

### Tier 5 (Science Lab Lvl 5)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Fleet Carrier Mk.II** | 420 RP | Fleet Carrier Mk.I | 60-aircraft capacity, armored deck, 36 AA guns |
| **Super-Carrier Concept** | 480 RP | Fleet Carrier Mk.II | 80 aircraft, speed 8. [TBD: balance, very expensive] |
| **Type XXI Mk.II** | 400 RP | Type XXI Sub | Snorkel + rubber coating + acoustic decoys + radar all standard. Near-undetectable |
| **Submarine Missile Tube** | 450 RP | Rocket Propellant (Industrial) + Type XXI | Sub can fire V-1 type cruise missile from surface |
| **Advanced ASDIC Network** | 380 RP | Hydrophone Array | Passive sonar web: share submarine detections across all ships in 10-hex radius |
| **Kamikaze Doctrine** | 350 RP | Carrier Air Wing | [TBD: needs sensitive design discussion] Special attack aircraft option |
| **Naval Strike Doctrine** | 400 RP | Carrier Mk.II + Battleship Mk.II | Carrier air wing + capital ship gunfire = coordinated strike; combined attack bonus |

---

### Carrier Module Deep-Dive

| Carrier Module | Cost | Effect |
|----------------|------|--------|
| **Armored Flight Deck** | 180 RP | Deck survives bomb hit without loss of operations |
| **Hangar Deck Extension** | 160 RP | +12 aircraft capacity |
| **Aircraft Elevator (Fast)** | 150 RP | Launch/recover 2 aircraft per turn instead of 1 |
| **Carrier Fighter Direction** | 170 RP | CAP aircraft get +2 intercept range |
| **Replenishment Deck** | 140 RP | Carrier can refuel/rearm at sea (reduces need to return to port) |
| **Anti-Torpedo Blisters** | 130 RP | Torpedo damage -40% |
| **Catapult Array** | 145 RP | Can launch aircraft every turn (without elevator bottleneck) |

---

## Branch 7: Engineering

*Fortifications, bridges, minefields, bunkers, obstacle lines, and field engineering. Turns terrain into advantage.*

### Sub-Categories
- **Field Fortifications** — trenches, foxholes, wire, sandbags
- **Permanent Fortifications** — bunkers, pillboxes, AT walls
- **Obstacle Warfare** — minefields, dragon's teeth, hedgehogs
- **Bridge & River Crossing** — pontoon bridges, bridgelaying
- **Logistics Engineering** — supply depots, airfield construction
- **Demolition** — bridge demolition, building destruction

---

### Tier 0 (Starting Baseline)
- **Infantry Foxhole:** +2 defense in current hex. Takes 1 turn.
- **Wire Obstacle:** Slows enemy infantry 1 extra MP to enter hex.
- **Demolition Kit:** Engineers can destroy a bridge (1 use per unit).
- **Basic Field Fortification:** Sandbag emplacement — +1 defense for gun crew.

---

### Tier 1 (Science Lab Lvl 1)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Trench System Mk.I** | 20 RP | Foxhole | Build connected trench hexes: +4 defense, infantry only |
| **Pontoon Bridge** | 25 RP | — | Engineer unit can place temporary bridge (lasts 5 turns, destroyed by artillery) |
| **AT Ditch** | 20 RP | — | Dig anti-tank ditch in 2 turns: impassable to vehicles |
| **Barbed Wire Entanglement** | 15 RP | Wire Obstacle | Extended wire: 2-hex wide obstacle belt |
| **Sandbag Emplacement (Improved)** | 15 RP | Basic Field Fort | +2 defense (improved), artillery crews immune to small arms |
| **Signal Flare System** | 15 RP | — | Artillery can fire on hex without spotter (area bombardment, low accuracy) |

---

### Tier 2 (Science Lab Lvl 2)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Trench System Mk.II (Connected)** | 50 RP | Trench Mk.I | Trench network with connecting tunnels; units can move between hexes underground |
| **Pillbox (Basic)** | 55 RP | Sandbag Improved | Concrete gun emplacement: +6 defense, can be built in 3 turns |
| **Minefield (AT)** | 50 RP | AT Ditch | Lay AT mines across hex; triggers on vehicle entry |
| **Minefield (AP)** | 45 RP | Wire Entanglement | Lay AP mines; triggers on infantry entry |
| **Permanent Bridge** | 55 RP | Pontoon Bridge | Build stone/metal bridge — permanent. Survives 3 artillery hits |
| **Forward Airfield** | 60 RP | — | Engineer-built rough airfield: aircraft can land/launch within 5 turns of build |

---

### Tier 3 (Science Lab Lvl 3)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Concrete Bunker Mk.I** | 110 RP | Pillbox Basic | Full bunker: HP 30, +8 defense, holds 2 units inside |
| **Dragon's Teeth (AT Obstacles)** | 100 RP | AT Ditch | Permanent concrete obstacles: impassable to vehicles, very hard to clear |
| **Tank Trap Field** | 95 RP | Dragon's Teeth | Combined obstacle: mines + dragon's teeth + wire |
| **Fortified Artillery Position** | 110 RP | Concrete Bunker + Sandbag | Covered gun position: artillery unit immune to counter-battery fire |
| **Demolition Charge (Bridge)** | 90 RP | Demolition Kit + Permanent Bridge | Pre-placed explosive: destroy your own bridge instantly as action |
| **Supply Depot (Field)** | 100 RP | Forward Airfield | Engineer-built depot: units within 3 hexes +1 move and auto-resupply |
| **Coastal Artillery Emplacement** | 120 RP | Fortified Artillery | Shore battery: fires on naval units in adjacent sea hexes |

---

### Tier 4 (Science Lab Lvl 4)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Reinforced Bunker Mk.II** | 180 RP | Bunker Mk.I | HP 50, +12 defense, holds 4 units. Requires direct hit from 150mm+ to damage |
| **Maginot-Style Fortress** | 220 RP | Reinforced Bunker + Coastal Artillery | Permanent hex-spanning fortress: multiple gun positions, underground connections |
| **Automated Minefield** | 190 RP | Tank Trap Field | Mine density increased; self-resetting (enemy must clear multiple times) |
| **Mobile Bridgelaying Tank** | 185 RP | Permanent Bridge + Medium Tank | Tank variant that deploys bridge in 1 turn (no engineer wait) |
| **Engineer Combat Bulldozer** | 175 RP | Dragon's Teeth | Armored dozer: clears dragon's teeth/wire in 1 turn |
| **Underground Tunnel System** | 200 RP | Trench Mk.II | Connect two hexes underground: move unit from A to B in 1 turn, hidden |

---

### Tier 5 (Science Lab Lvl 5)

| Tech | Cost | Prerequisites | Unlocks |
|------|------|---------------|---------|
| **Deep Fortress Complex** | 420 RP | Maginot Fortress + Underground Tunnel | Self-contained fortress hex: +20 defense, holds 6 units, production capable |
| **Strategic Demolition System** | 380 RP | Demo Charge + Explosives expertise | Destroy any building structure in enemy-held hex remotely [TBD: balance] |
| **Rapid Deployment Bridge** | 350 RP | Mobile Bridgelayer | Build a full bridge in 0 turns (immediate action) |
| **Acoustic Mine** | 400 RP | Automated Minefield + Acoustic Torpedo tech | Naval version: auto-targets ships entering minefield hex |
| **Seawall & Harbor Defense** | 390 RP | Coastal Artillery + Reinforced Bunker | Build harbor defense complex: resists naval bombardment and amphibious landing |

---

## Branch 8: Science

*Science is the gating mechanism for tier unlocks rather than a traditional research tree. It also provides cross-branch bonuses and enables advanced research capabilities.*

**Design Note:** Science Lab building levels are built in the city chain — Science branch researches are relatively cheap bonuses purchased with RP that make ALL other research more efficient or unlock cross-cutting capabilities. This tab should feel like "meta-research."

### Science Lab Upgrade Path (Building — Not Research)
| Level | Cost to Build | Unlocks |
|-------|--------------|---------|
| Lvl 1 | 50 Iron + 20 turns | Tier 1 research in all branches |
| Lvl 2 | 120 Iron + 40 turns | Tier 2 research in all branches |
| Lvl 3 | 250 Iron + 60 turns | Tier 3 research in all branches |
| Lvl 4 | 500 Iron + 80 turns | Tier 4 research in all branches |
| Lvl 5 | 1000 Iron + 100 turns | Tier 5 research in all branches |

*[TBD: Should Science Lab also require Gold? Oil? Needs economy tuning.]*

---

### Science Branch Research (Bonuses, Not Gate)

#### Tier 1 (Science Lab Lvl 1)
| Tech | Cost | Effect |
|------|------|--------|
| **Scientific Method Protocols** | 15 RP | Research RP generation +10% |
| **Research Library** | 20 RP | Reveals full tech tree (all tiers visible, not just current) |
| **Scientific Procurement** | 15 RP | Tier 1 research costs -5% |
| **Inter-Department Communication** | 20 RP | Two branches can research simultaneously (default: one at a time) [TBD] |

#### Tier 2 (Science Lab Lvl 2)
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Applied Research Institute** | 55 RP | Scientific Method | +15% RP generation |
| **Dual Research Tracks** | 60 RP | Inter-Department | Three simultaneous research tracks active |
| **Technology Transfer** | 50 RP | Research Library | Capture enemy tech lab — chance to capture 1 random tech they've researched |
| **Scientific Espionage** | 55 RP | Technology Transfer | Scout units adjacent to enemy lab reveal enemy research queue [TBD] |

#### Tier 3 (Science Lab Lvl 3)
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Advanced Research Complex** | 110 RP | Applied Institute | +25% RP generation total |
| **Cross-Disciplinary Research** | 120 RP | Dual Research Tracks | Completing tech in Branch A reduces cost of related tech in Branch B by 10% |
| **Emergency Research Program** | 100 RP | — | For 5 turns: double RP generation at cost of -20% production |
| **Patent Licensing System** | 95 RP | Technology Transfer | Sell researched tech to AI nations for Gold [TBD: diplomacy] |

#### Tier 4 (Science Lab Lvl 4)
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **National Research Academy** | 185 RP | Advanced Complex | +35% RP generation total. Scientists generate 50% more RP |
| **Accelerated Development Program** | 200 RP | Emergency Research | Any single tech can be "rushed" for 2× Gold → completes in 1 turn |
| **Four Research Tracks** | 190 RP | Three Simultaneous | Four branches can research simultaneously |
| **Captured Technology Analysis** | 175 RP | Scientific Espionage | Analyzing captured unit gives 25% rebate on its tech tree path |

#### Tier 5 (Science Lab Lvl 5)
| Tech | Cost | Prerequisites | Effect |
|------|------|---------------|--------|
| **Manhattan-Scale Research** | 420 RP | National Academy + Four Tracks | One designated research project completes at 3× speed for duration of game |
| **Total Scientific Mobilization** | 400 RP | Accelerated Development + Emergency Program | All citizens assigned as Scientists gain 2× output (other roles suffer) |
| **Reverse Engineering Mastery** | 380 RP | Captured Tech Analysis | Capturing enemy vehicle/ship gives full tech unlock (not just discount) |
| **Scientific Victory Condition** | [TBD] | All Tier 5 Science techs | [TBD: secret weapon / war-ending device? Needs design decision] |

---

## Cross-Branch Dependencies (Key Prerequisites Summary)

| To Unlock | You Need |
|-----------|---------|
| Medium Tank Chassis | Steel Foundry (Industrial T2) |
| Heavy Tank Chassis | Heavy Press Forging (Industrial T3) |
| Super-Heavy Tank | Heavy Press Forging + Heavy Tank Chassis |
| Jet Engine (Aircraft) | Jet Fuel Synthesis (Industrial T4) |
| V-1 Flying Bomb | Rocket Propellant (Industrial T5) |
| Rocket Artillery | Rocket Propellant (Industrial T5) |
| Carrier (Ship) | Advanced Naval Construction (Industrial T4) + Airfield |
| Paratrooper | Airborne Drop Pack (Infantry T3) + Engineer Training |
| Coastal Artillery | Fortified Artillery Position (Engineering T3) |
| Submarine Missile Tube | Rocket Propellant (Industrial T5) + Type XXI |
| Mass Conscription | Vocational Training (Civil T2) |

---

## Research Point Economics (Rough Guideline)

| Scientists Assigned | RP/Turn |
|--------------------|---------|
| 1–5 | 2–10 |
| 6–15 | 12–25 |
| 16–30 | 28–50 |
| 31–50 | 55–90 |
| 51+ | 95–150+ |

*[TBD: exact formula — likely: RP/turn = Scientists × 1.8, with diminishing returns above 50]*

A typical mid-game player allocating 20 scientists generates ~36 RP/turn.
- Tier 2 tech (60 RP avg) takes ~2 turns to research.
- Tier 4 tech (220 RP avg) takes ~6 turns.
- Tier 5 tech (420 RP avg) takes ~12 turns.

This creates meaningful decisions about *when* to push to the next tier vs. breadth-investing in current tier modules.

---

## Design Notes & Open Questions [TBD]

1. **Nation-Specific Techs:** Should certain nations have unique Tier 4–5 techs that others can't access? (e.g., Soviet T-34 production efficiency bonus, German 88mm optimization). Needs design.
2. **Weather System:** Several techs reference weather (all-season roads, winter gear, night fighter). Weather system needs full design before these are finalized.
3. **Night Combat:** Referenced in several places. Needs its own design doc.
4. **Chemical Warfare:** Infantry T4 references this. Needs explicit go/no-go design decision.
5. **Diplomacy / Trade:** Civil branch references trade and selling tech. Diplomacy system needed.
6. **Morale System:** Several techs reference morale and attrition. Define morale mechanics.
7. **Supply / Attrition:** Civil transport and engineering depot techs assume a supply system. GDD §10 mentions encirclement. Needs formalization.
8. **Science Victory:** Science T5 hints at a secret weapon win condition. Needs design.
9. **Kamikaze Doctrine:** Flagged as sensitive — needs explicit design discussion before including.
10. **Module Weight Budget Numbers:** All WB costs are placeholder estimates. Needs full spreadsheet balance pass.
11. **Research Parallelism:** Science branch unlocks multiple simultaneous research tracks. Default (1 track) needs to be confirmed as baseline.
12. **Carrier Aircraft:** How many aircraft slots? How does carrier air work in combat? Needs its own design section.
13. **Submarine Stealth Detection:** The sonar vs. stealth cat-and-mouse is the core of sub gameplay. Needs its own detailed design doc.
14. **Amphibious Landings:** Naval branch has transports and landing craft implied. Full amphibious system not designed.
15. **Rail Combat:** Military rail priority has units moving by rail in 1 turn — needs rules for attacking rail lines, rail interdiction.

---

*For GDD context and overview, see GDD.md §11.*
*Last updated: 2026-03-04*

---

## Design Decisions (Resolved 2026-03-04)

1. **Nation-specific techs** — TBD, revisit later
2. **Weather/Seasons** — YES. Every few turns weather/time-of-day cycles. Affects combat, movement, visibility. Needs full design doc.
3. **Night combat** — Part of weather/season system. Cycles every few turns. Techs that reference night combat are confirmed.
4. **Chemical warfare** — NO. Removed from tree.
5. **Trade routes** — YES. Roads on map, players auto-deploy trucks on trade routes. Passive resource income. Needs design doc.
6. **Morale system** — YES. Lower morale = worse combat performance. Morale determined by: unit health, flanking exposure, veterancy, supply, nearby losses, weather. Needs full design doc.
7. **Supply/attrition** — TBD
8. **Science victory** — NO. Removed.
9. **Kamikaze doctrine** — Included (accepted).
10. **Balance numbers** — Later pass.
11. **Research parallelism** — Start with 2 slots. Each tier of Science research unlocks +1 slot. Max 7 slots (2 base + 5 tiers). Elegant progression.
12. **Carrier aircraft** — Carriers = mobile airfields. Aircraft have limited fuel/move range before needing to return to airfield or carrier. Different carrier classes have different hangar sizes. Carriers accept compatible aircraft for refuel/storage.
13. **Submarine stealth/detection** — Confirmed as core mechanic. Needs detailed design doc.
14. **Amphibious landings** — Simple dock-and-unload. Move transport to shore hex, hit Unload, select target hex. Like Empire Earth / AoE.
15. **Rail system** — YES, player-built. Players construct rail lines across map. Rail enables fast unit movement. Rail lines can be attacked/destroyed. Needs design doc.
