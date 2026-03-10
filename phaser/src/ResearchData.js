// ResearchData.js -- Tech tree definitions for Attrition
// Tier 1 MVP: ~20 techs across 6 branches
// Each tech: { id, name, branch, tier, cost (RP), prereqs[], desc, effect{} }
// effect keys: buildingBonus, unitBonus, unlocks, statDelta, etc.

export const RESEARCH_BRANCHES = {
  industrial:   { label: 'Industrial',   icon: '⚙' },
  infantry:     { label: 'Infantry',     icon: '●' },
  vehicles:     { label: 'Vehicles',     icon: '■' },
  air:          { label: 'Air',          icon: '✈' },
  naval:        { label: 'Naval',        icon: '◖' },
  engineering:  { label: 'Engineering',  icon: '◆' },
  science:      { label: 'Science',      icon: '⚗' },
};

// ── Tier 1 Techs ─────────────────────────────────────────────────────────────
export const TECH_TREE = {

  // ── Industrial ─────────────────────────────────────────────────────────────
  improved_mines: {
    id: 'improved_mines', branch: 'industrial', tier: 1,
    name: 'Improved Mine Shafts',
    desc: 'Deeper shafts increase iron output.',
    cost: 20,
    prereqs: [],
    effect: { buildingBonus: { MINE: { ironPerTurn: 1 } } },
  },
  oil_efficiency: {
    id: 'oil_efficiency', branch: 'industrial', tier: 1,
    name: 'Oil Pump Efficiency',
    desc: 'Better pump engineering extracts more oil per well.',
    cost: 20,
    prereqs: [],
    effect: { buildingBonus: { OIL_PUMP: { oilPerTurn: 1 } } },
  },
  assembly_line: {
    id: 'assembly_line', branch: 'industrial', tier: 1,
    name: 'Assembly Line (Basic)',
    desc: 'Standardized parts reduce unit build time by 1 turn (min 1).',
    cost: 25,
    prereqs: [],
    effect: { globalBuildTimeBonus: 1 },
  },
  blast_furnace: {
    id: 'blast_furnace', branch: 'industrial', tier: 1,
    name: 'Blast Furnace',
    desc: 'Enables Vehicle Depot to be built 1 turn faster.',
    cost: 30,
    prereqs: ['improved_mines'],
    effect: { buildingBonus: { VEHICLE_DEPOT: { buildTurns: -1 } } },
  },
  market_trade: {
    id: 'market_trade', branch: 'industrial', tier: 1,
    name: 'Market Economy',
    desc: 'Markets generate +1 gold per turn.',
    cost: 20,
    prereqs: [],
    effect: { buildingBonus: { MARKET: { goldPerTurn: 1 } } },
  },
  farm_yield: {
    id: 'farm_yield', branch: 'industrial', tier: 1,
    name: 'Crop Rotation',
    desc: 'Farm food output +1 per turn.',
    cost: 15,
    prereqs: [],
    effect: { buildingBonus: { FARM: { foodPerTurn: 1 } } },
  },

  // ── Infantry ─────────────────────────────────────────────────────────────
  steel_helmet: {
    id: 'steel_helmet', branch: 'infantry', tier: 1,
    name: 'Steel Helmet',
    desc: 'All infantry units gain +1 defense.',
    cost: 10,
    prereqs: [],
    effect: { unitStatBonus: { INFANTRY: { defense: 1 }, ENGINEER: { defense: 1 }, MEDIC: { defense: 1 } } },
  },
  entrenching_tools: {
    id: 'entrenching_tools', branch: 'infantry', tier: 1,
    name: 'Entrenching Tools',
    desc: 'Unlocks the Trench building (built by Engineers).',
    cost: 15,
    prereqs: [],
    effect: { unlockBuilding: 'TRENCH' },
  },
  at_rifle_upgrade: {
    id: 'at_rifle_upgrade', branch: 'infantry', tier: 1,
    name: 'AT Rifle (Improved)',
    desc: 'Anti-Tank units gain +1 pierce and +1 hard attack.',
    cost: 25,
    prereqs: [],
    effect: { unitStatBonus: { ANTI_TANK: { pierce: 1, hard_attack: 1 } } },
  },
  field_medic_kit: {
    id: 'field_medic_kit', branch: 'infantry', tier: 1,
    name: 'Field Medic Kit',
    desc: 'Medic range increased by 1.',
    cost: 15,
    prereqs: [],
    effect: { unitStatBonus: { MEDIC: { range: 1, sight: 1 } } },
  },

  // ── Vehicles ───────────────────────────────────────────────────────────────
  light_tank_mk2: {
    id: 'light_tank_mk2', branch: 'vehicles', tier: 1,
    name: 'Light Tank Mk.II',
    desc: 'Improved light tank: +1 health, +1 armor.',
    cost: 30,
    prereqs: [],
    effect: { unitStatBonus: { TANK: { health: 1, armor: 1 } } },
  },
  engine_upgrade: {
    id: 'engine_upgrade', branch: 'vehicles', tier: 1,
    name: 'High-Speed Engine',
    desc: 'Tanks and Recon gain +1 move.',
    cost: 25,
    prereqs: [],
    effect: { unitStatBonus: { TANK: { move: 1 }, RECON: { move: 1 } } },
  },
  artillery_range: {
    id: 'artillery_range', branch: 'vehicles', tier: 1,
    name: 'Long Barrel Artillery',
    desc: 'Artillery range +1, soft attack +1.',
    cost: 20,
    prereqs: [],
    effect: { unitStatBonus: { ARTILLERY: { range: 1, soft_attack: 1 } } },
  },

  // ── Air ────────────────────────────────────────────────────────────────────
  monoplane_fighter: {
    id: 'monoplane_fighter', branch: 'air', tier: 1,
    name: 'Monoplane Fighter',
    desc: 'Biplanes upgraded: +1 move, +1 attack, +1 evasion.',
    cost: 30,
    prereqs: [],
    effect: { unitStatBonus: { BIPLANE_FIGHTER: { move: 1, attack: 1, evasion: 1 } } },
  },
  dive_bomber: {
    id: 'dive_bomber', branch: 'air', tier: 1,
    name: 'Dive Bomber Mk.I',
    desc: 'Light Bombers gain +1 hard attack and +2 accuracy.',
    cost: 30,
    prereqs: [],
    effect: { unitStatBonus: { LIGHT_BOMBER: { hard_attack: 1, accuracy: 2 } } },
  },
  fuel_tanks: {
    id: 'fuel_tanks', branch: 'air', tier: 1,
    name: 'Extended Fuel Tanks',
    desc: 'All air units gain +2 max fuel.',
    cost: 20,
    prereqs: [],
    effect: { unitStatBonus: { BIPLANE_FIGHTER: { fuelMax: 2 }, LIGHT_BOMBER: { fuelMax: 2 }, OBS_PLANE: { fuelMax: 2 } } },
  },

  // ── Engineering ────────────────────────────────────────────────────────────
  pontoon_bridge: {
    id: 'pontoon_bridge', branch: 'engineering', tier: 1,
    name: 'Pontoon Bridge',
    desc: 'Engineers can build Pontoon Bridges over shallow water hexes.',
    cost: 25,
    prereqs: [],
    effect: { unlockBuilding: 'PONTOON_BRIDGE' },
  },
  at_ditch: {
    id: 'at_ditch', branch: 'engineering', tier: 1,
    name: 'Anti-Tank Ditch',
    desc: 'Engineers can dig AT Ditches — impassable to vehicles.',
    cost: 20,
    prereqs: ['entrenching_tools'],
    effect: { unlockBuilding: 'AT_DITCH' },
  },

  // ── Science ────────────────────────────────────────────────────────────────
  research_protocols: {
    id: 'research_protocols', branch: 'science', tier: 1,
    name: 'Research Protocols',
    desc: 'Base RP generation +1 per Science Lab.',
    cost: 15,
    prereqs: [],
    effect: { rpBonusPerLab: 1 },
  },
  dual_research: {
    id: 'dual_research', branch: 'science', tier: 1,
    name: 'Parallel Research',
    desc: 'Unlocks a second simultaneous research slot.',
    cost: 40,
    prereqs: ['research_protocols'],
    effect: { extraResearchSlots: 1 },
  },
};

// Get all techs for a given branch
export function techsByBranch(branch) {
  return Object.values(TECH_TREE).filter(t => t.branch === branch);
}

// Get all prereqs recursively satisfied check
export function prereqsMet(techId, unlockedSet) {
  const tech = TECH_TREE[techId];
  if (!tech) return false;
  return tech.prereqs.every(p => unlockedSet.has(p));
}

// Compute all active bonuses for a player's unlocked tech set
// Returns: { buildingBonus: {TYPE: {stat: delta}}, unitStatBonus: {TYPE: {stat: delta}},
//            globalBuildTimeBonus: N, rpBonusPerLab: N, extraResearchSlots: N,
//            unlockedBuildings: Set<string> }
export function computeTechBonuses(unlockedSet) {
  const bonuses = {
    buildingBonus:      {},  // { BUILDING_TYPE: { stat: delta } }
    unitStatBonus:      {},  // { UNIT_TYPE: { stat: delta } }
    globalBuildTimeBonus: 0,
    rpBonusPerLab:      0,
    extraResearchSlots: 0,
    unlockedBuildings:  new Set(),
  };
  for (const techId of unlockedSet) {
    const tech = TECH_TREE[techId];
    if (!tech) continue;
    const e = tech.effect;
    if (e.buildingBonus) {
      for (const [btype, delta] of Object.entries(e.buildingBonus)) {
        if (!bonuses.buildingBonus[btype]) bonuses.buildingBonus[btype] = {};
        for (const [k, v] of Object.entries(delta))
          bonuses.buildingBonus[btype][k] = (bonuses.buildingBonus[btype][k] || 0) + v;
      }
    }
    if (e.unitStatBonus) {
      for (const [utype, delta] of Object.entries(e.unitStatBonus)) {
        if (!bonuses.unitStatBonus[utype]) bonuses.unitStatBonus[utype] = {};
        for (const [k, v] of Object.entries(delta))
          bonuses.unitStatBonus[utype][k] = (bonuses.unitStatBonus[utype][k] || 0) + v;
      }
    }
    if (e.globalBuildTimeBonus) bonuses.globalBuildTimeBonus += e.globalBuildTimeBonus;
    if (e.rpBonusPerLab)        bonuses.rpBonusPerLab        += e.rpBonusPerLab;
    if (e.extraResearchSlots)   bonuses.extraResearchSlots   += e.extraResearchSlots;
    if (e.unlockBuilding)       bonuses.unlockedBuildings.add(e.unlockBuilding);
  }
  return bonuses;
}
