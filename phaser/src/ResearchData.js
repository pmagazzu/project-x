// ResearchData.js -- Tech tree definitions for Attrition
// Research unlocks new CHASSIS (designer options) and stat/building bonuses.
// unlockChassis: when researched, adds a new unit type to the Unit Designer
//   and auto-creates a base Mk.0 design for the player immediately.

export const RESEARCH_BRANCHES = {
  industrial:  { label: 'Industrial',  icon: '⚙' },
  infantry:    { label: 'Infantry',    icon: '●' },
  vehicles:    { label: 'Vehicles',    icon: '■' },
  air:         { label: 'Air',         icon: '✈' },
  naval:       { label: 'Naval',       icon: '◖' },
  engineering: { label: 'Engineering', icon: '◆' },
  science:     { label: 'Science',     icon: '⚗' },
};

// Tech object fields:
//   id, branch, tier (0=root, 1,2...), name, desc, cost (RP), prereqs[]
//   effect: {
//     buildingBonus, unitStatBonus, globalBuildTimeBonus, rpBonusPerLab,
//     extraResearchSlots, unlockBuilding, unlockChassis (new designer chassis),
//     moveCostRoad (road tier upgrade)
//   }
//   kind: 'stat' | 'chassis' | 'building' | 'economy' | 'research'
//         'chassis' = unlocks a new unit type in the designer

export const TECH_TREE = {

  // ─────────────────────────────────────────────────────────────────────────
  // INDUSTRIAL
  // ─────────────────────────────────────────────────────────────────────────
  improved_mines: {
    id: 'improved_mines', branch: 'industrial', tier: 0, kind: 'economy',
    name: 'Improved Mine Shafts',
    desc: 'Deeper shafts increase iron output. Iron Mines +1/turn.',
    cost: 20, prereqs: [],
    effect: { buildingBonus: { MINE: { ironPerTurn: 1 } } },
  },
  oil_efficiency: {
    id: 'oil_efficiency', branch: 'industrial', tier: 0, kind: 'economy',
    name: 'Oil Pump Efficiency',
    desc: 'Better pump engineering. Oil Pumps +1/turn.',
    cost: 20, prereqs: [],
    effect: { buildingBonus: { OIL_PUMP: { oilPerTurn: 1 } } },
  },
  farm_yield: {
    id: 'farm_yield', branch: 'industrial', tier: 0, kind: 'economy',
    name: 'Crop Rotation',
    desc: 'Farm food output +1 per turn.',
    cost: 15, prereqs: [],
    effect: { buildingBonus: { FARM: { foodPerTurn: 1 } } },
  },
  market_trade: {
    id: 'market_trade', branch: 'industrial', tier: 0, kind: 'economy',
    name: 'Market Economy',
    desc: 'Markets generate +1 gold per turn.',
    cost: 20, prereqs: [],
    effect: { buildingBonus: { MARKET: { goldPerTurn: 1 } } },
  },
  assembly_line: {
    id: 'assembly_line', branch: 'industrial', tier: 1, kind: 'stat',
    name: 'Assembly Line',
    desc: 'Standardized parts reduce all unit build times by 1 turn (min 1).',
    cost: 30, prereqs: ['improved_mines'],
    effect: { globalBuildTimeBonus: 1 },
  },
  blast_furnace: {
    id: 'blast_furnace', branch: 'industrial', tier: 2, kind: 'stat',
    name: 'Blast Furnace',
    desc: 'Vehicle Depot builds 1 turn faster. Enables heavier vehicle production.',
    cost: 35, prereqs: ['assembly_line'],
    effect: { buildingBonus: { VEHICLE_DEPOT: { buildTurns: -1 } } },
  },
  concrete_roads: {
    id: 'concrete_roads', branch: 'industrial', tier: 1, kind: 'building',
    name: 'Concrete Roads',
    desc: 'Engineers can upgrade Dirt Roads to Concrete Roads (faster movement).',
    cost: 25, prereqs: ['improved_mines'],
    effect: { unlockBuilding: 'CONCRETE_ROAD' },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INFANTRY
  // ─────────────────────────────────────────────────────────────────────────
  steel_helmet: {
    id: 'steel_helmet', branch: 'infantry', tier: 0, kind: 'stat',
    name: 'Steel Helmet',
    desc: 'All infantry gain +1 defense.',
    cost: 10, prereqs: [],
    effect: { unitStatBonus: { INFANTRY: { defense: 1 }, ENGINEER: { defense: 1 }, MEDIC: { defense: 1 } } },
  },
  entrenching_tools: {
    id: 'entrenching_tools', branch: 'infantry', tier: 0, kind: 'building',
    name: 'Entrenching Tools',
    desc: 'Engineers can build Trenches for defensive fortification.',
    cost: 15, prereqs: [],
    effect: { unlockBuilding: 'TRENCH' },
  },
  at_rifle_upgrade: {
    id: 'at_rifle_upgrade', branch: 'infantry', tier: 1, kind: 'stat',
    name: 'AT Rifle (Improved)',
    desc: 'Anti-Tank units +1 pierce and +1 hard attack.',
    cost: 25, prereqs: ['steel_helmet'],
    effect: { unitStatBonus: { ANTI_TANK: { pierce: 1, hard_attack: 1 } } },
  },
  field_medic_kit: {
    id: 'field_medic_kit', branch: 'infantry', tier: 1, kind: 'stat',
    name: 'Field Medic Kit',
    desc: 'Medic range +1, sight +1.',
    cost: 15, prereqs: ['steel_helmet'],
    effect: { unitStatBonus: { MEDIC: { range: 1, sight: 1 } } },
  },
  assault_infantry: {
    id: 'assault_infantry', branch: 'infantry', tier: 2, kind: 'chassis',
    name: 'Assault Infantry',
    desc: '🔓 NEW CHASSIS — Heavily armed close-assault troops. High soft attack, short range.',
    cost: 40, prereqs: ['at_rifle_upgrade'],
    effect: { unlockChassis: 'ASSAULT_INFANTRY' },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VEHICLES
  // ─────────────────────────────────────────────────────────────────────────
  light_tank_armor: {
    id: 'light_tank_armor', branch: 'vehicles', tier: 0, kind: 'stat',
    name: 'Improved Light Tank',
    desc: 'Tanks +1 health, +1 armor.',
    cost: 30, prereqs: [],
    effect: { unitStatBonus: { TANK: { health: 1, armor: 1 } } },
  },
  engine_upgrade: {
    id: 'engine_upgrade', branch: 'vehicles', tier: 0, kind: 'stat',
    name: 'High-Speed Engine',
    desc: 'Tanks and Recon +1 movement.',
    cost: 25, prereqs: [],
    effect: { unitStatBonus: { TANK: { move: 1 }, RECON: { move: 1 } } },
  },
  artillery_range: {
    id: 'artillery_range', branch: 'vehicles', tier: 0, kind: 'stat',
    name: 'Long Barrel Artillery',
    desc: 'Artillery range +1, soft attack +1.',
    cost: 20, prereqs: [],
    effect: { unitStatBonus: { ARTILLERY: { range: 1, soft_attack: 1 } } },
  },
  medium_tank: {
    id: 'medium_tank', branch: 'vehicles', tier: 1, kind: 'chassis',
    name: 'Medium Tank',
    desc: '🔓 NEW CHASSIS — Heavier tank with better armor and firepower than the light tank.',
    cost: 45, prereqs: ['light_tank_armor'],
    effect: { unlockChassis: 'MEDIUM_TANK' },
  },
  self_propelled_gun: {
    id: 'self_propelled_gun', branch: 'vehicles', tier: 1, kind: 'chassis',
    name: 'Self-Propelled Gun',
    desc: '🔓 NEW CHASSIS — Artillery mounted on a tank chassis. Mobile heavy fire support.',
    cost: 40, prereqs: ['artillery_range'],
    effect: { unlockChassis: 'SPG' },
  },
  armored_car: {
    id: 'armored_car', branch: 'vehicles', tier: 1, kind: 'chassis',
    name: 'Armored Car',
    desc: '🔓 NEW CHASSIS — Fast wheeled recon vehicle with light armament.',
    cost: 30, prereqs: ['engine_upgrade'],
    effect: { unlockChassis: 'ARMORED_CAR' },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AIR
  // ─────────────────────────────────────────────────────────────────────────
  fuel_tanks: {
    id: 'fuel_tanks', branch: 'air', tier: 0, kind: 'stat',
    name: 'Extended Fuel Tanks',
    desc: 'All air units +2 max fuel.',
    cost: 20, prereqs: [],
    effect: { unitStatBonus: {
      BIPLANE_FIGHTER: { fuelMax: 2 },
      LIGHT_BOMBER:    { fuelMax: 2 },
      OBS_PLANE:       { fuelMax: 2 },
    }},
  },
  monoplane_fighter: {
    id: 'monoplane_fighter', branch: 'air', tier: 1, kind: 'chassis',
    name: 'Monoplane Fighter',
    desc: '🔓 NEW CHASSIS — Faster, more maneuverable than the biplane. Superior air superiority.',
    cost: 40, prereqs: ['fuel_tanks'],
    effect: { unlockChassis: 'MONOPLANE_FIGHTER' },
  },
  dive_bomber: {
    id: 'dive_bomber', branch: 'air', tier: 1, kind: 'chassis',
    name: 'Dive Bomber',
    desc: '🔓 NEW CHASSIS — Precision attack bomber. High accuracy vs ground targets.',
    cost: 40, prereqs: ['fuel_tanks'],
    effect: { unlockChassis: 'DIVE_BOMBER' },
  },
  heavy_bomber: {
    id: 'heavy_bomber', branch: 'air', tier: 2, kind: 'chassis',
    name: 'Heavy Bomber',
    desc: '🔓 NEW CHASSIS — Long-range strategic bomber. High damage, slow, short fuel.',
    cost: 60, prereqs: ['dive_bomber', 'monoplane_fighter'],
    effect: { unlockChassis: 'HEAVY_BOMBER' },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NAVAL
  // ─────────────────────────────────────────────────────────────────────────
  naval_gunnery: {
    id: 'naval_gunnery', branch: 'naval', tier: 0, kind: 'stat',
    name: 'Naval Gunnery',
    desc: 'All surface ships +1 naval attack.',
    cost: 25, prereqs: [],
    effect: { unitStatBonus: {
      DESTROYER: { naval_attack: 1 }, CRUISER_LT: { naval_attack: 1 },
      CRUISER_HV: { naval_attack: 1 }, BATTLESHIP: { naval_attack: 1 },
    }},
  },
  torpedo_upgrade: {
    id: 'torpedo_upgrade', branch: 'naval', tier: 0, kind: 'stat',
    name: 'Torpedo Improvement',
    desc: 'MTB and Submarine +1 hard attack, +1 pierce.',
    cost: 20, prereqs: [],
    effect: { unitStatBonus: { MTB: { hard_attack: 1, pierce: 1 }, SUBMARINE: { hard_attack: 1, pierce: 1 } } },
  },
  carrier: {
    id: 'carrier', branch: 'naval', tier: 1, kind: 'chassis',
    name: 'Aircraft Carrier',
    desc: '🔓 NEW CHASSIS — Floating airfield. Air units can refuel and rearm at sea.',
    cost: 80, prereqs: ['naval_gunnery'],
    effect: { unlockChassis: 'CARRIER' },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ENGINEERING
  // ─────────────────────────────────────────────────────────────────────────
  pontoon_bridge: {
    id: 'pontoon_bridge', branch: 'engineering', tier: 0, kind: 'building',
    name: 'Pontoon Bridge',
    desc: 'Engineers can build Pontoon Bridges over shallow water.',
    cost: 25, prereqs: [],
    effect: { unlockBuilding: 'PONTOON_BRIDGE' },
  },
  at_ditch: {
    id: 'at_ditch', branch: 'engineering', tier: 1, kind: 'building',
    name: 'Anti-Tank Ditch',
    desc: 'Engineers can dig AT Ditches — blocks vehicles.',
    cost: 20, prereqs: ['pontoon_bridge'],
    effect: { unlockBuilding: 'AT_DITCH' },
  },
  field_fortifications: {
    id: 'field_fortifications', branch: 'engineering', tier: 1, kind: 'stat',
    name: 'Field Fortification Doctrine',
    desc: 'Bunkers give +2 defense bonus (stacks with existing).',
    cost: 30, prereqs: ['pontoon_bridge'],
    effect: { buildingBonus: { BUNKER: { defenseBonus: 2 } } },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SCIENCE
  // ─────────────────────────────────────────────────────────────────────────
  research_protocols: {
    id: 'research_protocols', branch: 'science', tier: 0, kind: 'research',
    name: 'Research Protocols',
    desc: 'Base RP generation +1 per Science Lab.',
    cost: 15, prereqs: [],
    effect: { rpBonusPerLab: 1 },
  },
  dual_research: {
    id: 'dual_research', branch: 'science', tier: 1, kind: 'research',
    name: 'Parallel Research',
    desc: 'Unlocks a 2nd simultaneous research slot.',
    cost: 40, prereqs: ['research_protocols'],
    effect: { extraResearchSlots: 1 },
  },
  triple_research: {
    id: 'triple_research', branch: 'science', tier: 2, kind: 'research',
    name: 'Research Division',
    desc: 'Unlocks a 3rd simultaneous research slot.',
    cost: 60, prereqs: ['dual_research'],
    effect: { extraResearchSlots: 1 },
  },
};

export function techsByBranch(branch) {
  return Object.values(TECH_TREE).filter(t => t.branch === branch);
}

export function prereqsMet(techId, unlockedSet) {
  const tech = TECH_TREE[techId];
  if (!tech) return false;
  return tech.prereqs.every(p => unlockedSet.has(p));
}

export function computeTechBonuses(unlockedArr) {
  const unlockedSet = unlockedArr instanceof Set ? unlockedArr : new Set(unlockedArr);
  const bonuses = {
    buildingBonus:       {},
    unitStatBonus:       {},
    globalBuildTimeBonus: 0,
    rpBonusPerLab:       0,
    extraResearchSlots:  0,
    unlockedBuildings:   new Set(),
    unlockedChassis:     new Set(),  // NEW — chassis available in designer
  };
  for (const techId of unlockedSet) {
    const tech = TECH_TREE[techId];
    if (!tech) continue;
    const e = tech.effect;
    if (e.buildingBonus) {
      for (const [bt, delta] of Object.entries(e.buildingBonus)) {
        if (!bonuses.buildingBonus[bt]) bonuses.buildingBonus[bt] = {};
        for (const [k, v] of Object.entries(delta))
          bonuses.buildingBonus[bt][k] = (bonuses.buildingBonus[bt][k] || 0) + v;
      }
    }
    if (e.unitStatBonus) {
      for (const [ut, delta] of Object.entries(e.unitStatBonus)) {
        if (!bonuses.unitStatBonus[ut]) bonuses.unitStatBonus[ut] = {};
        for (const [k, v] of Object.entries(delta))
          bonuses.unitStatBonus[ut][k] = (bonuses.unitStatBonus[ut][k] || 0) + v;
      }
    }
    if (e.globalBuildTimeBonus) bonuses.globalBuildTimeBonus += e.globalBuildTimeBonus;
    if (e.rpBonusPerLab)        bonuses.rpBonusPerLab        += e.rpBonusPerLab;
    if (e.extraResearchSlots)   bonuses.extraResearchSlots   += e.extraResearchSlots;
    if (e.unlockBuilding)       bonuses.unlockedBuildings.add(e.unlockBuilding);
    if (e.unlockChassis)        bonuses.unlockedChassis.add(e.unlockChassis);
  }
  return bonuses;
}
