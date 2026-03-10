// GameState.js — Core game state for Attrition prototype
// Phase 1: 2-player hotseat, iron + oil, 4 unit types, simultaneous turns (we-go)

// ── Unit stat guide ────────────────────────────────────────────────────────
// soft_attack : damage vs infantry / unarmored
// hard_attack : damage vs armored targets
// pierce      : armor penetration (vs target.armor)
// armor       : damage reduction when pierce < armor; dmg × (pierce/armor)
// defense     : flat reduction applied to incoming damage
// evasion     : shifts outcome score upward (fast/recon units)
// accuracy    : shifts outcome score (attacker side)
// ── indirectFire flag: unit can fire over terrain (artillery-style arc) ────
// These units bypass LOS terrain blocking in fire-at-tile mode.
const INDIRECT_FIRE = new Set(['ARTILLERY', 'MORTAR']);

export const UNIT_TYPES = {
  //              name          mv  atk  hp  rng  cost                   shape      canDigIn canBuild canHeal sight | soft  hard  pierce armor def  eva  acc
  //                                                                                                                                                                                          buildTime = turns to produce
  // range in hexes (1 hex ≈ 250m)
  INFANTRY:  { name:'Infantry',  move:2, attack:2, health:3, range:1, cost:{iron:2,oil:0}, shape:'circle',   canDigIn:true,  canBuild:false, canHeal:false, sight:2, soft_attack:3, hard_attack:1, pierce:1, armor:1, defense:1, evasion:0,  accuracy:0,  buildTime:1 },
  TANK:      { name:'Tank',      move:4, attack:3, health:6, range:3, cost:{iron:4,oil:2}, shape:'square',   canDigIn:false, canBuild:false, canHeal:false, sight:4, soft_attack:2, hard_attack:4, pierce:5, armor:6, defense:2, evasion:5,  accuracy:5,  buildTime:3 },
  ARTILLERY: { name:'Artillery', move:1, attack:4, health:2, range:8, cost:{iron:3,oil:2}, shape:'triangle', canDigIn:false, canBuild:false, canHeal:false, sight:2, soft_attack:5, hard_attack:3, pierce:3, armor:1, defense:0, evasion:0,  accuracy:5,  buildTime:2 },
  ENGINEER:  { name:'Engineer',  move:2, attack:1, health:2, range:1, cost:{iron:3,oil:0}, shape:'diamond',  canDigIn:false, canBuild:true,  canHeal:false, sight:2, soft_attack:1, hard_attack:0, pierce:1, armor:1, defense:0, evasion:0,  accuracy:-5, buildTime:1 },
  RECON:     { name:'Recon',     move:4, attack:1, health:2, range:2, cost:{iron:3,oil:1}, shape:'star',     canDigIn:false, canBuild:false, canHeal:false, sight:6, soft_attack:2, hard_attack:0, pierce:1, armor:1, defense:0, evasion:15, accuracy:5,  buildTime:1 },
  ANTI_TANK: { name:'Anti-Tank', move:2, attack:1, health:2, range:3, cost:{iron:3,oil:0}, shape:'arrow',    canDigIn:true,  canBuild:false, canHeal:false, sight:3, soft_attack:1, hard_attack:3, pierce:6, armor:1, defense:1, evasion:0,  accuracy:0,  buildTime:2 },
  MORTAR:    { name:'Mortar',    move:2, attack:3, health:2, range:4, cost:{iron:2,oil:0}, shape:'triangle', canDigIn:false, canBuild:false, canHeal:false, sight:2, soft_attack:4, hard_attack:1, pierce:2, armor:1, defense:0, evasion:0,  accuracy:0,  buildTime:2 },
  MEDIC:     { name:'Medic',     move:2, attack:0, health:2, range:0, cost:{iron:2,oil:0}, shape:'cross',    canDigIn:false, canBuild:false, canHeal:true,  sight:2, soft_attack:0, hard_attack:0, pierce:0, armor:1, defense:0, evasion:0,  accuracy:0,  buildTime:1 },

  // ── Naval units ──────────────────────────────────────────────────────────
  // naval:true       = can traverse ocean (type 5) and shallow (type 4)
  // canEnterShallow  = can enter shallow water (type 4) hexes
  // canEnterSand     = can land on sand/beach (type 6) hexes — amphibious
  // stealthy:N       = detection difficulty (enemy needs detection >= N/2 to spot)
  // detection:N      = sonar/sight range for revealing stealthy units
  // naval_attack:N   = effectiveness vs land targets (replaces soft/hard vs land)
  // immobile:true    = cannot move (coastal battery, fortifications)
  // capacity:{infantry,vehicle} = how many embarked units this transport holds
  //
  PATROL_BOAT:   { name:'Patrol Boat',    move:4, attack:2, health:2, range:2, cost:{iron:2,oil:1}, shape:'boat_sm',  canDigIn:false, canBuild:false, canHeal:false, sight:5,  naval:true, canEnterShallow:true,  canEnterSand:false, stealthy:0, detection:1, naval_attack:1, soft_attack:2, hard_attack:1, pierce:2, armor:1, defense:0, evasion:5,  accuracy:0,  buildTime:1, canSprint:true, sprintMove:2 },
  MTB:           { name:'Motor Torpedo Boat', move:5, attack:3, health:3, range:2, cost:{iron:3,oil:2}, shape:'mtb', canDigIn:false, canBuild:false, canHeal:false, sight:4, naval:true, canEnterShallow:true, canEnterSand:false, stealthy:2, detection:0, naval_attack:3, soft_attack:1, hard_attack:5, pierce:7, armor:1, defense:0, evasion:8, accuracy:5, buildTime:2, torpedoBonus:true },
  SUBMARINE:     { name:'Submarine',      move:3, attack:3, health:4, range:3, cost:{iron:4,oil:2}, shape:'sub',      canDigIn:false, canBuild:false, canHeal:false, sight:3,  naval:true, canEnterShallow:true,  canEnterSand:false, stealthy:5, detection:0, naval_attack:0, soft_attack:1, hard_attack:4, pierce:6, armor:2, defense:1, evasion:5, accuracy:5,  buildTime:3, noSurfaceRetaliation:true },
  DESTROYER:     { name:'Destroyer',      move:3, attack:3, health:5, range:3, cost:{iron:5,oil:2}, shape:'destroyer', canDigIn:false,canBuild:false, canHeal:false, sight:4,  naval:true, canEnterShallow:false, canEnterSand:false, stealthy:0, detection:2, naval_attack:2, soft_attack:3, hard_attack:4, pierce:5, armor:2, defense:1, evasion:5,  accuracy:10, buildTime:3, antiSub:true },
  CRUISER_LT:    { name:'Light Cruiser',  move:3, attack:3, health:6, range:4, cost:{iron:6,oil:3}, shape:'cruiser',   canDigIn:false,canBuild:false, canHeal:false, sight:4,  naval:true, canEnterShallow:false, canEnterSand:false, stealthy:0, detection:1, naval_attack:3, soft_attack:3, hard_attack:3, pierce:3, armor:3, defense:2, evasion:3,  accuracy:5,  buildTime:4 },
  CRUISER_HV:    { name:'Heavy Cruiser',  move:2, attack:4, health:8, range:5, cost:{iron:8,oil:4}, shape:'cruiser_hv',canDigIn:false,canBuild:false, canHeal:false, sight:4,  naval:true, canEnterShallow:false, canEnterSand:false, stealthy:0, detection:1, naval_attack:5, soft_attack:4, hard_attack:4, pierce:4, armor:5, defense:2, evasion:1,  accuracy:5,  buildTime:5 },
  BATTLESHIP:    { name:'Battleship',     move:1, attack:5, health:12, range:7, cost:{iron:12,oil:6},shape:'battleship',canDigIn:false,canBuild:false, canHeal:false, sight:5,  naval:true, canEnterShallow:false, canEnterSand:false, stealthy:0, detection:1, naval_attack:7, soft_attack:5, hard_attack:5, pierce:5, armor:8, defense:3, evasion:0,  accuracy:5,  buildTime:7 },
  LANDING_CRAFT: { name:'Landing Craft',  move:2, attack:0, health:2, range:0, cost:{iron:2,oil:1}, shape:'landing',   canDigIn:false,canBuild:false, canHeal:false, sight:2,  naval:true, canEnterShallow:true,  canEnterSand:true,  stealthy:0, detection:0, naval_attack:0, soft_attack:0, hard_attack:0, pierce:0, armor:1, defense:0, evasion:0,  accuracy:0,  buildTime:2, capacity:{infantry:1,vehicle:0} },
  TRANSPORT_SM:  { name:'Transport (S)',  move:2, attack:0, health:3, range:0, cost:{iron:3,oil:1}, shape:'transport', canDigIn:false,canBuild:false, canHeal:false, sight:2,  naval:true, canEnterShallow:true,  canEnterSand:false, stealthy:0, detection:0, naval_attack:0, soft_attack:0, hard_attack:0, pierce:0, armor:1, defense:0, evasion:0,  accuracy:0,  buildTime:2, capacity:{infantry:2,vehicle:1} },
  TRANSPORT_MD:  { name:'Transport (M)',  move:2, attack:0, health:4, range:0, cost:{iron:5,oil:2}, shape:'transport', canDigIn:false,canBuild:false, canHeal:false, sight:2,  naval:true, canEnterShallow:true,  canEnterSand:false, stealthy:0, detection:0, naval_attack:0, soft_attack:0, hard_attack:0, pierce:0, armor:2, defense:0, evasion:0,  accuracy:0,  buildTime:3, capacity:{infantry:4,vehicle:2} },
  TRANSPORT_LG:  { name:'Transport (L)',  move:2, attack:0, health:5, range:0, cost:{iron:7,oil:3}, shape:'transport', canDigIn:false,canBuild:false, canHeal:false, sight:2,  naval:true, canEnterShallow:true,  canEnterSand:false, stealthy:0, detection:0, naval_attack:0, soft_attack:0, hard_attack:0, pierce:0, armor:2, defense:0, evasion:0,  accuracy:0,  buildTime:4, capacity:{infantry:6,vehicle:4} },
  // Coastal Battery — built by engineer, immobile, fires at water and land targets
  COASTAL_BATTERY:{ name:'Coastal Battery', move:0, attack:4, health:4, range:6, cost:{iron:6,oil:1}, shape:'battery', canDigIn:false,canBuild:false, canHeal:false, sight:5, naval:false, canEnterShallow:false, canEnterSand:false, stealthy:0, detection:0, naval_attack:4, soft_attack:4, hard_attack:3, pierce:4, armor:3, defense:2, evasion:0, accuracy:5, buildTime:0, immobile:true },

  // ── Air units ─────────────────────────────────────────────────────────────
  // air:true         = flies over any terrain, can share hex with friendly ground units
  // antiAir:true     = can intercept/attack other air units with priority
  // Air units are based at an Airfield; move across any terrain at cost 1 per hex.
  // Sight is high — they can see further from altitude.
  BIPLANE_FIGHTER: { name:'Biplane Fighter', move:8,  attack:3, health:3, range:2, cost:{iron:4,oil:2}, shape:'aircraft', canDigIn:false, canBuild:false, canHeal:false, sight:5, soft_attack:4, hard_attack:2, pierce:2, armor:1, defense:0, evasion:10, accuracy:5,  buildTime:2, air:true, antiAir:true,  fuelMax:6  },
  LIGHT_BOMBER:    { name:'Light Bomber',    move:6,  attack:4, health:3, range:1, cost:{iron:5,oil:3}, shape:'aircraft', canDigIn:false, canBuild:false, canHeal:false, sight:4, soft_attack:7, hard_attack:5, pierce:3, armor:1, defense:0, evasion:5,  accuracy:3,  buildTime:3, air:true, antiAir:false, fuelMax:4  },
  OBS_PLANE:       { name:'Obs. Plane',      move:10, attack:0, health:2, range:0, cost:{iron:3,oil:2}, shape:'aircraft', canDigIn:false, canBuild:false, canHeal:false, sight:8, soft_attack:0, hard_attack:0, pierce:0, armor:1, defense:0, evasion:8,  accuracy:0,  buildTime:1, air:true, antiAir:false, fuelMax:8  },
};

// ── Module system ─────────────────────────────────────────────────────────
// Each module has: name, tier, validChassis[], statDelta{}, designCost{iron,oil}, trainCost{iron,oil}
// statDelta values are added to the chassis base stats when the unit is trained.
// Negative trainCost = savings (debuffs reduce recurring cost).
export const MODULES = {
  AT_RIFLE:      { name: 'Anti-Tank Rifle',  tier: 1, chassis: ['INFANTRY','ENGINEER'],            statDelta: { pierce: 2, hard_attack: 1 },           designCost: { iron: 2, oil: 0 }, trainCost: { iron: 1,  oil:  0 } },
  FIELD_RADIO:   { name: 'Field Radio',      tier: 1, chassis: ['INFANTRY','ENGINEER','RECON'],     statDelta: { sight: 1, accuracy: 3 },               designCost: { iron: 1, oil: 0 }, trainCost: { iron: 1,  oil:  0 } },
  BETTER_ENGINE: { name: 'Better Engine',    tier: 1, chassis: ['TANK','ARTILLERY','RECON'],        statDelta: { move: 1 },                             designCost: { iron: 2, oil: 1 }, trainCost: { iron: 0,  oil:  1 } },
  EXTRA_ARMOR:   { name: 'Extra Armor',      tier: 1, chassis: ['TANK'],                            statDelta: { armor: 2, defense: 1, move: -1 },      designCost: { iron: 3, oil: 0 }, trainCost: { iron: 2,  oil:  0 } },
  EXTRA_FUEL:    { name: 'Extra Fuel Tank',  tier: 1, chassis: ['TANK','ARTILLERY'],                statDelta: { move: 1, defense: -1 },                designCost: { iron: 1, oil: 1 }, trainCost: { iron: 0,  oil:  1 } },
  RED_BALL:      { name: 'Red Ball (speed)', tier: 1, chassis: ['RECON'],                           statDelta: { move: 2, defense: -1 },                designCost: { iron: 1, oil: 1 }, trainCost: { iron: 0,  oil:  2 } },
  REINFORCED_POS:{ name: 'Reinforced Pos.',  tier: 1, chassis: ['MORTAR','ARTILLERY'],              statDelta: { defense: 2, move: -1 },                designCost: { iron: 2, oil: 0 }, trainCost: { iron: 1,  oil:  0 } },
  SKELETON_CREW: { name: 'Skeleton Crew',    tier: 0, chassis: ['INFANTRY','ENGINEER','MEDIC'],     statDelta: { health: -1, defense: -1 },             designCost: { iron: 0, oil: 0 }, trainCost: { iron: -1, oil:  0 } },
  LONG_RANGE:    { name: 'Long Barrel',      tier: 1, chassis: ['ARTILLERY','MORTAR'],              statDelta: { range: 1, soft_attack: 1, move: -1 },  designCost: { iron: 2, oil: 0 }, trainCost: { iron: 1,  oil:  0 } },
};

// Which building trains which chassis types (for design registration)
export const CHASSIS_BUILDINGS = {
  INFANTRY:        'BARRACKS',
  TANK:            'VEHICLE_DEPOT',
  ARTILLERY:       'VEHICLE_DEPOT',
  ENGINEER:        'HQ',
  RECON:           'HQ',
  ANTI_TANK:       'BARRACKS',
  MORTAR:          'BARRACKS',
  MEDIC:           'BARRACKS',
  // Naval
  PATROL_BOAT:     'NAVAL_YARD',
  SUBMARINE:       'NAVAL_YARD',
  LANDING_CRAFT:   'NAVAL_YARD',
  TRANSPORT_SM:    'NAVAL_YARD',
  TRANSPORT_MD:    'NAVAL_YARD',
  TRANSPORT_LG:    'NAVAL_YARD',
  DESTROYER:       'DRY_DOCK',
  CRUISER_LT:      'DRY_DOCK',
  CRUISER_HV:      'DRY_DOCK',
  BATTLESHIP:      'NAVAL_BASE',
  // Air
  BIPLANE_FIGHTER: 'AIRFIELD',
  LIGHT_BOMBER:    'AIRFIELD',
  OBS_PLANE:       'AIRFIELD',
};

// Naval unit types set (for movement/terrain checks)
export const NAVAL_UNITS = new Set(['PATROL_BOAT','MTB','SUBMARINE','DESTROYER','CRUISER_LT','CRUISER_HV','BATTLESHIP','LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG']);
// Air unit types set
export const AIR_UNITS = new Set(['BIPLANE_FIGHTER','LIGHT_BOMBER','OBS_PLANE']);
// Units that can enter shallow water (type 4)
export const SHALLOW_UNITS = new Set(['PATROL_BOAT','SUBMARINE','LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG']);
// Units that can land on sand/beach (type 6) — amphibious disembark
export const AMPHIBIOUS_UNITS = new Set(['LANDING_CRAFT']);

export const MAX_DESIGNS_PER_PLAYER = 4; // design slots per player
export const DESIGN_BASE_COST = { iron: 3, oil: 0 }; // flat registration fee + module costs

// Compute the full stat block for a custom design
export function computeDesignStats(chassis, moduleKeys) {
  const base = { ...UNIT_TYPES[chassis] };
  for (const key of moduleKeys) {
    const mod = MODULES[key];
    if (!mod) continue;
    for (const [stat, delta] of Object.entries(mod.statDelta)) {
      base[stat] = (base[stat] || 0) + delta;
    }
  }
  // Clamp sanity
  base.health  = Math.max(1, base.health);
  base.move    = Math.max(1, base.move);
  base.range   = Math.max(0, base.range);
  base.pierce  = Math.max(0, base.pierce);
  base.armor   = Math.max(0, base.armor);
  base.defense = Math.max(0, base.defense);
  return base;
}

// Total cost to register a design (base fee + sum of module design costs)
export function designRegistrationCost(moduleKeys) {
  const cost = { iron: DESIGN_BASE_COST.iron, oil: DESIGN_BASE_COST.oil };
  for (const key of moduleKeys) {
    const mod = MODULES[key];
    if (!mod) continue;
    cost.iron += mod.designCost.iron;
    cost.oil  += mod.designCost.oil;
  }
  return cost;
}

// Per-unit training cost for a custom design (base chassis cost + module train costs)
export function designTrainCost(chassis, moduleKeys) {
  const base = { ...UNIT_TYPES[chassis].cost };
  for (const key of moduleKeys) {
    const mod = MODULES[key];
    if (!mod) continue;
    base.iron = (base.iron || 0) + mod.trainCost.iron;
    base.oil  = (base.oil  || 0) + mod.trainCost.oil;
  }
  base.iron = Math.max(0, base.iron);
  base.oil  = Math.max(0, base.oil);
  return base;
}

export function registerDesign(state, player, chassis, moduleKeys, designName) {
  const designs = state.designs[player];
  if (designs.length >= MAX_DESIGNS_PER_PLAYER) return { ok: false, reason: `Max ${MAX_DESIGNS_PER_PLAYER} designs reached` };
  const cost = designRegistrationCost(moduleKeys);
  if (state.players[player].iron < cost.iron) return { ok: false, reason: `Need ${cost.iron} iron` };
  if (state.players[player].oil  < cost.oil)  return { ok: false, reason: `Need ${cost.oil} oil` };
  state.players[player].iron -= cost.iron;
  state.players[player].oil  -= cost.oil;
  const id = _nextId++;
  designs.push({ id, chassis, modules: moduleKeys, name: designName || `Custom ${UNIT_TYPES[chassis].name}`, stats: computeDesignStats(chassis, moduleKeys), trainCost: designTrainCost(chassis, moduleKeys) });
  return { ok: true, id };
}

// ── Combat modifier notes (future) ────────────────────────────────────────
// - Attack after move: -1 attack penalty (most units)
// - Spec ops / recon: no penalty after move
// - Stationary: neutral (baseline)
// - Fortified (trench): -1 incoming damage for defender
// - Dug-in (infantry field): -1 incoming damage, lost on move

export const BUILDING_TYPES = {
  HQ:            { name: 'HQ',             ironPerTurn: 3, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 0, canRecruit: ['ENGINEER','RECON'],                   buildCost: null,               color: 0xffdd00, sight: 3 },
  MINE:          { name: 'Iron Mine',      ironPerTurn: 2, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 2, canRecruit: [], buildCost: { iron: 4, oil: 0 },         color: 0xaaaaaa, sight: 2 },
  OIL_PUMP:      { name: 'Oil Pump',       ironPerTurn: 0, oilPerTurn: 2, woodPerTurn: 0, buildTurns: 2, canRecruit: [], buildCost: { iron: 4, oil: 0 },         color: 0x222244, sight: 2 },
  BARRACKS:      { name: 'Barracks',       ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 2, canRecruit: ['INFANTRY','ANTI_TANK','MORTAR','MEDIC'], buildCost: { iron: 4, oil: 0, wood: 4 }, color: 0xaa6644, sight: 2 },
  VEHICLE_DEPOT: { name: 'Vehicle Depot',  ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 3, canRecruit: ['TANK','ARTILLERY'],                      buildCost: { iron: 8, oil: 2 }, color: 0x557799, sight: 2 },
  BUNKER:        { name: 'Bunker',         ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 2, canRecruit: [], buildCost: { iron: 3, oil: 0, wood: 2 }, color: 0x888866, sight: 2 },
  OBS_POST:      { name: 'Obs. Post',      ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 1, canRecruit: [], buildCost: { iron: 3, oil: 0, wood: 0 }, color: 0x88aacc, sight: 4 },
  ROAD:          { name: 'Road',           ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 0, canRecruit: [], buildCost: { iron: 0, oil: 0, wood: 1 }, color: 0xccbbaa, sight: 0 },
  LUMBER_CAMP:   { name: 'Lumber Camp',    ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 2, buildTurns: 1, canRecruit: [], buildCost: { iron: 2, oil: 0, wood: 0 }, color: 0x7a5020, sight: 2 },
  // Naval buildings
  NAVAL_YARD:    { name: 'Naval Yard',     ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 3, canRecruit: ['PATROL_BOAT','MTB','DESTROYER','SUBMARINE','LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG'], buildCost: { iron: 8, oil: 2 }, color: 0x3366aa, sight: 2 },
  HARBOR:        { name: 'Harbor',         ironPerTurn: 1, oilPerTurn: 1, woodPerTurn: 0, buildTurns: 3, canRecruit: [],                         buildCost: { iron: 5, oil: 1 }, color: 0x4488cc, sight: 2, repairsNaval: true },
  DRY_DOCK:      { name: 'Dry Dock',       ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 4, canRecruit: ['DESTROYER','CRUISER_LT','CRUISER_HV'],  buildCost: { iron:12, oil: 4 }, color: 0x225588, sight: 2 },
  NAVAL_BASE:    { name: 'Naval Base',     ironPerTurn: 1, oilPerTurn: 2, woodPerTurn: 0, buildTurns: 4, canRecruit: ['BATTLESHIP'],             buildCost: { iron:16, oil: 6 }, color: 0x113366, sight: 3 },
  // Air buildings
  AIRFIELD:      { name: 'Airfield',       ironPerTurn: 0, oilPerTurn: 0, woodPerTurn: 0, buildTurns: 2, canRecruit: ['BIPLANE_FIGHTER','LIGHT_BOMBER','OBS_PLANE'], buildCost: { iron: 6, oil: 2, wood: 2 }, color: 0x888844, sight: 3 },
};

export const RESOURCE_TYPES = {
  IRON:   { name: 'Iron Deposit',   buildingType: 'MINE',     color: 0xbbbbcc },
  OIL:    { name: 'Oil Deposit',    buildingType: 'OIL_PUMP', color: 0x334466 },
};

export const PLAYER_COLORS = { 1: 0x4488ff, 2: 0xff4444 };

export const STARTING_IRON      = 15;
export const STARTING_OIL       = 4;
export const BASE_IRON_PER_TURN = 3;
export const BASE_OIL_PER_TURN  = 0;

let _nextId = 1;

export function createUnit(type, owner, q, r) {
  const def = UNIT_TYPES[type];
  const unit = { id: _nextId++, type, owner, q, r,
    health: def.health, maxHealth: def.health,
    moved: false, attacked: false, dugIn: false, building: false };
  // Air units start with a full fuel tank
  if (def.fuelMax) { unit.fuel = def.fuelMax; unit.fuelMax = def.fuelMax; }
  return unit;
}

export function createBuilding(type, owner, q, r) {
  return { id: _nextId++, type, owner, q, r };
}

export function createGameState(scenario = 'default') {
  _nextId = 1; // reset IDs on new game
  const state = {
    turn: 1, phase: 'planning', currentPlayer: 1,
    scenario,
    players: {
      1: { iron: STARTING_IRON, oil: STARTING_OIL, wood: 0, submitted: false },
      2: { iron: STARTING_IRON, oil: STARTING_OIL, wood: 0, submitted: false },
    },
    units: [], buildings: [], resourceHexes: {},
    pendingMoves: {}, pendingAttacks: {}, pendingRecruits: [],
    designs: { 1: [], 2: [] },
  };

  if (scenario === 'random') {
    // Terrain + spawns placed procedurally by GameScene after terrain gen
    state.players[1].iron = 20; state.players[1].oil = 6;
    state.players[2].iron = 20; state.players[2].oil = 6;

  } else if (scenario === 'scout') {
    // Two engineers each, far apart — explore and build
    state.units.push(createUnit('ENGINEER', 1, 3, 4));
    state.units.push(createUnit('ENGINEER', 1, 4, 4));
    state.units.push(createUnit('ENGINEER', 2, 20, 19));
    state.units.push(createUnit('ENGINEER', 2, 21, 19));
    state.buildings.push(createBuilding('HQ', 1, 3, 5));
    state.buildings.push(createBuilding('HQ', 2, 21, 20));
    for (const [q,r] of [[12,11],[12,12],[10,13],[11,10],[13,11],[13,14],[9,9],[15,14]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    for (const [q,r] of [[11,13],[12,9],[14,10],[13,15]])
      state.resourceHexes[`${q},${r}`] = { type: 'OIL' };


  } else if (scenario === 'naval') {
    // Island layout (ms=35, islandRow=16):
    //   P1 island: offsetToAxial(4, 16)  = {q:4,  r:14}, radius=5
    //   P2 island: offsetToAxial(25, 16) = {q:25, r:4},  radius=5
    //   Center-to-center ~21 hexes; 2-ring shallow → 7 ocean hexes between shores

    // ── P1 starting buildings ──────────────────────────────────────────────
    state.buildings.push(createBuilding('HQ',         1,  4, 14));
    state.buildings.push(createBuilding('MINE',       1,  3, 14)); // iron hex adjacent to HQ
    state.buildings.push(createBuilding('OIL_PUMP',   1,  5, 13)); // oil hex
    state.buildings.push(createBuilding('BARRACKS',   1,  4, 16)); // inland, dist-2 from HQ
    state.buildings.push(createBuilding('NAVAL_YARD', 1,  9, 14)); // east coast, borders shallow water

    // ── P2 starting buildings ──────────────────────────────────────────────
    state.buildings.push(createBuilding('HQ',         2, 25,  4));
    state.buildings.push(createBuilding('MINE',       2, 24,  4)); // iron hex adjacent to HQ
    state.buildings.push(createBuilding('OIL_PUMP',   2, 25,  3)); // oil hex
    state.buildings.push(createBuilding('BARRACKS',   2, 25,  6)); // inland, dist-2 from HQ
    state.buildings.push(createBuilding('NAVAL_YARD', 2, 20,  4)); // west coast, borders shallow water

    // ── Starting engineers (repositioned away from resource hexes) ─────────
    state.units.push(createUnit('ENGINEER', 1,  6, 14));
    state.units.push(createUnit('ENGINEER', 1,  7, 14));
    state.units.push(createUnit('ENGINEER', 2, 23,  4));
    state.units.push(createUnit('ENGINEER', 2, 24,  3));
    // Patrol boats in the ocean channel between islands
    state.units.push(createUnit('PATROL_BOAT', 1, 11, 11));
    state.units.push(createUnit('PATROL_BOAT', 1, 11, 12));
    state.units.push(createUnit('PATROL_BOAT', 2, 18,  7));
    state.units.push(createUnit('PATROL_BOAT', 2, 18,  8));
    // Starting heavier naval presence: 1 submarine + 1 destroyer per side
    state.units.push(createUnit('SUBMARINE', 1, 12, 11));
    state.units.push(createUnit('DESTROYER', 1, 10, 12));
    state.units.push(createUnit('SUBMARINE', 2, 17,  7));
    state.units.push(createUnit('DESTROYER', 2, 19,  7));
    // P1 island resources
    for (const [q,r] of [[3,14],[4,15],[5,14],[3,15]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    for (const [q,r] of [[4,13],[5,13]])
      state.resourceHexes[`${q},${r}`] = { type: 'OIL' };
    // P2 island resources
    for (const [q,r] of [[24,4],[25,5],[26,4]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    for (const [q,r] of [[25,3],[24,5]])
      state.resourceHexes[`${q},${r}`] = { type: 'OIL' };
    // Mid-channel neutral island resources (q=14,r=9)
    for (const [q,r] of [[14,9],[13,9]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    for (const [q,r] of [[14,8],[15,9]])
      state.resourceHexes[`${q},${r}`] = { type: 'OIL' };
    // Far-right island resources
    for (const [q,r] of [[31,1],[32,1]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    state.players[1].iron = 20; state.players[1].oil = 6;
    state.players[2].iron = 20; state.players[2].oil = 6;

  } else if (scenario === 'combat') {
    // All unit types lined up 5 tiles apart — centered on the 20×10 map
    // Units at q=7 (P1) and q=12 (P2), 8 rows starting at r=1
    const p1q = 7, p2q = 12;
    const types = ['INFANTRY','TANK','ARTILLERY','ENGINEER','RECON','ANTI_TANK','MORTAR','MEDIC'];
    types.forEach((t, i) => {
      state.units.push(createUnit(t, 1, p1q, i + 1));
      state.units.push(createUnit(t, 2, p2q, i + 1));
    });
    state.buildings.push(createBuilding('HQ', 1, 5, 4));
    state.buildings.push(createBuilding('HQ', 2, 14, 4));
    state.players[1].iron = 20; state.players[1].oil = 10;
    state.players[2].iron = 20; state.players[2].oil = 10;

  } else if (scenario === 'grand') {
    // Large map — full starting armies
    state.units.push(createUnit('INFANTRY', 1, 4,  5));
    state.units.push(createUnit('INFANTRY', 1, 5,  5));
    state.units.push(createUnit('INFANTRY', 1, 4,  6));
    state.units.push(createUnit('TANK',     1, 5,  6));
    state.units.push(createUnit('TANK',     1, 6,  5));
    state.units.push(createUnit('ARTILLERY',1, 3,  6));
    state.units.push(createUnit('RECON',    1, 6,  4));
    state.units.push(createUnit('ENGINEER', 1, 3,  5));
    state.units.push(createUnit('ENGINEER', 1, 4,  7));
    state.units.push(createUnit('ANTI_TANK',1, 5,  7));

    state.units.push(createUnit('INFANTRY', 2, 113, 68));
    state.units.push(createUnit('INFANTRY', 2, 112, 68));
    state.units.push(createUnit('INFANTRY', 2, 113, 67));
    state.units.push(createUnit('TANK',     2, 112, 67));
    state.units.push(createUnit('TANK',     2, 111, 68));
    state.units.push(createUnit('ARTILLERY',2, 114, 67));
    state.units.push(createUnit('RECON',    2, 111, 69));
    state.units.push(createUnit('ENGINEER', 2, 114, 68));
    state.units.push(createUnit('ENGINEER', 2, 113, 66));
    state.units.push(createUnit('ANTI_TANK',2, 112, 66));

    state.buildings.push(createBuilding('HQ',       1, 3,   7));
    state.buildings.push(createBuilding('BARRACKS',  1, 2,   7));
    state.buildings.push(createBuilding('HQ',       2, 115, 66));
    state.buildings.push(createBuilding('BARRACKS',  2, 116, 66));

    for (const [q,r] of [[58,38],[59,38],[57,39],[60,37],[56,40],[61,38],[55,39],[62,37]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    for (const [q,r] of [[58,40],[59,36],[57,37],[60,39]])
      state.resourceHexes[`${q},${r}`] = { type: 'OIL' };

  } else if (scenario === 'air_test') {
    // Air Testing -- 20x20 open plains, both airfields within ~10 hexes
    // Planes start in play; everything you need to test air combat
    state.players[1] = { iron: 20, oil: 10, wood: 8, submitted: false };
    state.players[2] = { iron: 20, oil: 10, wood: 8, submitted: false };
    // P1 cluster (top-left)
    state.buildings.push(createBuilding('HQ',       1,  4,  4));
    state.buildings.push(createBuilding('AIRFIELD', 1,  5,  4));
    state.buildings.push(createBuilding('BARRACKS', 1,  4,  5));
    // P2 cluster (bottom-right) -- airfields ~10 hex apart
    state.buildings.push(createBuilding('HQ',       2, 14, 14));
    state.buildings.push(createBuilding('AIRFIELD', 2, 13, 14));
    state.buildings.push(createBuilding('BARRACKS', 2, 14, 13));
    // P1 starting air + ground
    state.units.push(createUnit('BIPLANE_FIGHTER', 1,  4,  3));
    state.units.push(createUnit('OBS_PLANE',       1,  5,  3));
    state.units.push(createUnit('INFANTRY',        1,  3,  5));
    state.units.push(createUnit('ENGINEER',        1,  3,  4));
    // P2 starting air + ground
    state.units.push(createUnit('BIPLANE_FIGHTER', 2, 14, 15));
    state.units.push(createUnit('LIGHT_BOMBER',    2, 13, 15));
    state.units.push(createUnit('INFANTRY',        2, 15, 13));
    state.units.push(createUnit('ENGINEER',        2, 15, 14));
    // Resources scattered mid-map
    for (const [q,r] of [[7,7],[9,9],[11,7],[8,10],[6,8]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    for (const [q,r] of [[10,8],[7,11],[12,10]])
      state.resourceHexes[`${q},${r}`] = { type: 'OIL' };

  } else {
    // default -- close combat test (original layout)
    state.units.push(createUnit('INFANTRY', 1, 9,  11));
    state.units.push(createUnit('INFANTRY', 1, 10, 10));
    state.units.push(createUnit('TANK',     1, 10, 11));
    state.units.push(createUnit('ENGINEER', 1, 8,  11));
    state.units.push(createUnit('ENGINEER', 1, 9,  10));
    state.units.push(createUnit('INFANTRY', 2, 15, 12));
    state.units.push(createUnit('INFANTRY', 2, 14, 13));
    state.units.push(createUnit('TANK',     2, 14, 12));
    state.units.push(createUnit('ENGINEER', 2, 16, 12));
    state.units.push(createUnit('ENGINEER', 2, 15, 13));
    state.buildings.push(createBuilding('HQ',       1, 8,  12));
    state.buildings.push(createBuilding('BARRACKS', 1, 7,  12));
    state.buildings.push(createBuilding('HQ',       2, 16, 11));
    state.buildings.push(createBuilding('BARRACKS', 2, 17, 11));
    for (const [q,r] of [[12,11],[12,12],[10,13],[11,10],[13,11],[13,14],[9,9],[15,14]])
      state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
    for (const [q,r] of [[11,13],[12,9],[14,10],[13,15]])
      state.resourceHexes[`${q},${r}`] = { type: 'OIL' };
  }

  return state;
}

// ── Accessors ──────────────────────────────────────────────────────────────
export function unitAt(state, q, r) {
  return state.units.find(u => u.q === q && u.r === r) || null;
}
export function buildingAt(state, q, r) {
  return state.buildings.find(b => b.q === q && b.r === r) || null;
}
export function roadAt(state, q, r) {
  return state.buildings.find(b => b.type === 'ROAD' && b.q === q && b.r === r) || null;
}
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1-q2) + Math.abs(q1+r1-q2-r2) + Math.abs(r1-r2)) / 2;
}

// ── Full-map pathfinding for standing orders (e.g., auto-road) ────────────
// Returns an array of {q,r} hexes from start (exclusive) to dest (inclusive),
// or null if no path exists.  Uses Dijkstra with terrain costs; ignores units
// (standing-order units move around obstacles each turn by re-pathing).
export function findPath(terrain, mapSize, startQ, startR, destQ, destR, unitType = 'ENGINEER') {
  const dist  = new Map();
  const prev  = new Map();
  const visited = new Set();
  const startKey = `${startQ},${startR}`;
  dist.set(startKey, 0);
  const queue = [{ q: startQ, r: startR, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { q, r, cost } = queue.shift();
    const nodeKey = `${q},${r}`;
    if (visited.has(nodeKey)) continue;
    visited.add(nodeKey);
    if (q === destQ && r === destR) break; // reached destination

    for (const [dq, dr] of HEX_NEIGHBORS) {
      const nq = q + dq, nr = r + dr;
      if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
      const key = `${nq},${nr}`;
      if (visited.has(key)) continue;
      const ttype = terrain[key] ?? 0;
      if (!canEnterTerrain(unitType, ttype)) continue;
      // Use raw terrain cost (no road boost — roads don't exist yet on planned route)
      const moveCost = getMoveCost(ttype, false, unitType);
      const realCost = moveCost >= 999 ? 10 : moveCost; // treat impassable-for-vehicles as expensive but not infinite for path search
      const newCost = cost + realCost;
      if (!dist.has(key) || newCost < dist.get(key)) {
        dist.set(key, newCost);
        prev.set(key, { q, r });
        queue.push({ q: nq, r: nr, cost: newCost });
      }
    }
  }

  const destKey = `${destQ},${destR}`;
  if (!dist.has(destKey)) return null; // no path

  // Reconstruct path
  const path = [];
  let cur = destKey;
  while (cur && cur !== startKey) {
    const [cq, cr] = cur.split(',').map(Number);
    path.unshift({ q: cq, r: cr });
    const p = prev.get(cur);
    cur = p ? `${p.q},${p.r}` : null;
  }
  return path.length > 0 ? path : null;
}

// ── Terrain movement ───────────────────────────────────────────────────────
// Wheeled/tracked vehicles that are badly hampered by forest
const HEAVY_UNITS = new Set(['TANK', 'ARTILLERY', 'ANTI_TANK', 'VEHICLE_DEPOT']);

// terrain: 0=plains, 1=forest, 2=mountain, 3=hill
// Move costs: plains=1, forest=2(infantry)/999(vehicles), mountain=3(foot only), hill=2(all)
export function getMoveCost(terrainType, hasRoad, unitType = '') {
  // Air units: fly over everything at cost 1, roads don't help
  if (AIR_UNITS.has(unitType)) return 1;
  // Naval units: ocean/shallow cost 1, can't enter land terrain
  if (NAVAL_UNITS.has(unitType)) {
    if (terrainType === 5) return 1; // ocean: free sailing
    if (terrainType === 4) return NAVAL_UNITS.has(unitType) ? 1 : 999; // shallow: all naval ships can enter (subs get debuff)
    if (terrainType === 6) return AMPHIBIOUS_UNITS.has(unitType) ? 1 : 999; // sand: amphibious only
    return 999; // land terrain: impassable for naval
  }
  if (hasRoad) return 0.5;
  if (terrainType === 1 && HEAVY_UNITS.has(unitType)) return 999; // dense forest: vehicles blocked
  // 0=plains, 1=dense forest, 2=mountain, 3=hill, 4=shallow, 5=ocean, 6=sand, 7=light woods
  if (terrainType === 7) return 1.5; // light woods: slight move penalty, all units allowed
  return [1, 2, 3, 2, 999, 999, 1][terrainType] ?? 1;
}
export function canEnterTerrain(unitType, terrainType) {
  // Air units: can fly over any terrain
  if (AIR_UNITS.has(unitType)) return true;
  // Naval units: can only enter water/beach terrain
  if (NAVAL_UNITS.has(unitType)) {
    if (terrainType === 5) return true;  // ocean: all naval
    if (terrainType === 4) return NAVAL_UNITS.has(unitType); // shallow: all naval ships can enter
    if (terrainType === 6) return AMPHIBIOUS_UNITS.has(unitType); // sand: amphibious only
    return false; // no land terrain for naval
  }
  // Coastal Battery — immobile, treated as a unit that never moves
  if (unitType === 'COASTAL_BATTERY') return false;
  // Land units
  if (terrainType === 2) return unitType === 'INFANTRY' || unitType === 'ENGINEER'; // mountains: foot only
  if (terrainType === 4 || terrainType === 5) return false; // shallow/ocean: no land units
  return true; // hills, forest, light woods, sand, plains: all land units allowed
}

// Terrain that blocks line-of-sight beyond 1 hex (for future LOS system)
// 7=light woods: partial block (units inside are concealed but can still see out 1 hex)
export const LOS_BLOCKING = new Set([1, 2, 3, 7]); // dense forest, mountain, hill, light woods
// Units ON a hill get a sight bonus (elevated position)
export const HILL_SIGHT_BONUS = 2;

// ── Pathfinding (Dijkstra for terrain costs) ───────────────────────────────
export function getReachableHexes(state, unit, terrain, mapSize) {
  const maxMove = UNIT_TYPES[unit.type].move;
  const dist  = new Map();
  const visited = new Set();
  const queue = [{ q: unit.q, r: unit.r, cost: 0 }];
  dist.set(`${unit.q},${unit.r}`, 0);
  const result = [];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { q, r, cost } = queue.shift();
    const nodeKey = `${q},${r}`;
    if (visited.has(nodeKey)) continue; // already settled at minimum cost
    visited.add(nodeKey);

    for (const [dq, dr] of HEX_NEIGHBORS) {
      const nq = q + dq, nr = r + dr;
      if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
      const key = `${nq},${nr}`;
      if (visited.has(key)) continue;
      const ttype = terrain[key] ?? 0;
      const hasRoad = !!roadAt(state, nq, nr);
      if (!canEnterTerrain(unit.type, ttype)) continue;
      const moveCost = getMoveCost(ttype, hasRoad, unit.type);
      const newCost = cost + moveCost;
      // Min-1-hex guarantee: unit can always reach an adjacent passable hex on its first step
      // BUT forest/mountain-cost hexes reached this way do NOT propagate further (newCost stays huge)
      const isFirstStep = cost === 0;
      const withinBudget = newCost <= maxMove || (isFirstStep && maxMove >= 1);
      if (!withinBudget) continue;
      // Enemy units: block movement only at their DISPLAY position (origQ/origR if they moved).
      // Using actual positions would leak P2's planned moves to P1 during planning phase.
      const occupant = state.units.find(u => {
        if (u.dead) return false;
        const dq = (u._origQ !== undefined) ? u._origQ : u.q;
        const dr = (u._origR !== undefined) ? u._origR : u.r;
        return dq === nq && dr === nr;
      });
      if (occupant && occupant.owner !== unit.owner) continue;
      if (!dist.has(key) || newCost < dist.get(key)) {
        dist.set(key, newCost);
        queue.push({ q: nq, r: nr, cost: newCost });
      }
    }
  }

  // Collect all reachable hexes — exclude any that have a unit on them (can't end there)
  // Exception: air units can share a hex with friendly ground units (not other air)
  const isAir = AIR_UNITS.has(unit.type);
  for (const [key] of dist) {
    const [q, r] = key.split(',').map(Number);
    if (q === unit.q && r === unit.r) continue; // skip origin
    const occupant = unitAt(state, q, r);
    if (!occupant || occupant.id === unit.id) { result.push({ q, r }); continue; }
    // Air can land on hex with friendly ground unit (not another air unit)
    if (isAir && occupant.owner === unit.owner && !AIR_UNITS.has(occupant.type)) result.push({ q, r });
  }
  return result;
}

// Returns hexes occupied by visible enemies — used for "known target" highlighting
// fog: optional Set of visible hex keys `"q,r"` — if provided, only enemies in fog-visible hexes are returned
// Enemy units with pending moves are treated as being at their ORIGINAL (turn-start) position —
// prevents revealing where enemies moved to before the turn resolves.
export function getAttackableHexes(state, unit, fromQ, fromR, fog) {
  const def = UNIT_TYPES[unit.type];
  return state.units
    .filter(u => {
      if (u.owner === unit.owner || u.dead) return false;
      // Use display position (orig if moved) — same as what the player sees
      const dq = (u._origQ !== undefined) ? u._origQ : u.q;
      const dr = (u._origR !== undefined) ? u._origR : u.r;
      if (hexDistance(fromQ, fromR, dq, dr) > def.range) return false;
      if (fog && !fog.has(`${dq},${dr}`)) return false; // hidden in fog
      return true;
    })
    .map(u => {
      const dq = (u._origQ !== undefined) ? u._origQ : u.q;
      const dr = (u._origR !== undefined) ? u._origR : u.r;
      return { q: dq, r: dr, targetId: u.id };
    });
}

// ── Line-of-sight helpers ─────────────────────────────────────────────────
// Returns all hexes on the line from (q1,r1) to (q2,r2) using cube-coord lerp.
function hexLine(q1, r1, q2, r2) {
  const N = hexDistance(q1, r1, q2, r2);
  if (N === 0) return [{ q: q1, r: r1 }];
  const s1 = -q1 - r1, s2 = -q2 - r2;
  const hexes = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const fx = q1 + (q2 - q1) * t + 1e-6;
    const fy = r1 + (r2 - r1) * t + 1e-6;
    const fz = s1 + (s2 - s1) * t - 2e-6;
    let rx = Math.round(fx), ry = Math.round(fy), rz = Math.round(fz);
    const dx = Math.abs(rx - fx), dy = Math.abs(ry - fy), dz = Math.abs(rz - fz);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    hexes.push({ q: rx, r: ry });
  }
  return hexes;
}

// Returns true if there is an unobstructed LOS between two hexes.
// Intermediate hexes (not the source or target) that are forest or mountain block LOS.
function hasLOS(fromQ, fromR, toQ, toR, terrain) {
  if (!terrain) return true;
  const line = hexLine(fromQ, fromR, toQ, toR);
  for (let i = 1; i < line.length - 1; i++) {
    const t = terrain[`${line[i].q},${line[i].r}`] ?? 0;
    if (t === 1 || t === 2) return false; // forest (1) or mountain (2) blocks
  }
  return true;
}

// Returns ALL hexes within attack range — for blind fire targeting
// terrain: optional — if provided, LOS is checked (indirect-fire units bypass this)
export function getAttackRangeHexes(mapSize, unit, fromQ, fromR, terrain) {
  const range = UNIT_TYPES[unit.type].range;
  const indirect = INDIRECT_FIRE.has(unit.type);
  const result = [];
  for (let q = 0; q < mapSize; q++) {
    for (let r = 0; r < mapSize; r++) {
      const dist = hexDistance(fromQ, fromR, q, r);
      if (dist < 1 || dist > range) continue;
      // Direct-fire units need clear LOS; indirect fire (arty/mortar) always allowed
      if (!indirect && terrain && !hasLOS(fromQ, fromR, q, r, terrain)) continue;
      result.push({ q, r });
    }
  }
  return result;
}

// ── Fog of war ─────────────────────────────────────────────────────────────
// terrain: optional map `"q,r" → terrainType` (0=plains,1=forest,2=mountain)
// LOS rules: forest costs 2 sight points to pass through; mountain blocks sight beyond the hex itself.
// ── Sub stealth detection ──────────────────────────────────────────────────
// Returns true if the enemy unit (stealthy) is spotted by any of player's units.
// Detection roll: attacker.detection vs unit.stealth.
// Visibility if: adjacent to enemy unit (always reveals), OR
//   any own unit with detection > 0 is within detection range AND roll passes.
export function isStealthDetected(state, stealthyUnit, byPlayer) {
  let stealthVal = UNIT_TYPES[stealthyUnit.type]?.stealthy || 0;
  if (!stealthVal) return true; // not stealthy — always visible
  // Submarine shallow-water debuff: can't dive deep → stealth drops from 5 to 2
  if (stealthyUnit.type === 'SUBMARINE' && state._terrain) {
    const ttype = state._terrain[`${stealthyUnit.q},${stealthyUnit.r}`] ?? 5;
    if (ttype === 4) stealthVal = 2; // shallow water: easily detectable
  }
  for (const u of state.units.filter(u => u.owner === byPlayer)) {
    const dist = hexDistance(u.q, u.r, stealthyUnit.q, stealthyUnit.r);
    if (dist <= 1) return true; // adjacent always spots
    const det = UNIT_TYPES[u.type]?.detection || 0;
    if (det > 0 && dist <= det + 2) {
      // Detection check: detection success if det >= stealthVal/2
      if (det * 2 >= stealthVal) return true;
    }
  }
  return false;
}

export function computeFog(state, player, mapSize, terrain) {
  const visible = new Set();

  // Sight sources: friendly units + observation posts
  const sources = [
    ...state.units.filter(u => u.owner === player).map(u => ({ q: u.q, r: u.r, sight: UNIT_TYPES[u.type].sight })),
    ...state.buildings.filter(b => b.owner === player && BUILDING_TYPES[b.type].sight > 0)
                      .map(b => ({ q: b.q, r: b.r, sight: BUILDING_TYPES[b.type].sight })),
  ];

  for (const src of sources) {
    // Use Dijkstra-style expansion tracking accumulated sight cost
    const cost = new Map();
    const startKey = `${src.q},${src.r}`;
    cost.set(startKey, 0);
    const queue = [{ q: src.q, r: src.r, spent: 0 }];
    while (queue.length > 0) {
      queue.sort((a, b) => a.spent - b.spent);
      const { q, r, spent } = queue.shift();
      const key = `${q},${r}`;
      if (spent > (cost.get(key) ?? Infinity)) continue; // stale entry
      visible.add(key);
      if (spent >= src.sight) continue;

      for (const [dq, dr] of HEX_NEIGHBORS) {
        const nq = q + dq, nr = r + dr;
        if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
        const nkey = `${nq},${nr}`;
        const t = terrain ? (terrain[nkey] ?? 0) : 0;

        // Mountains: always visible themselves but block sight beyond
        const stepCost = t === 2 ? src.sight : // entering mountain exhausts all remaining sight
                         t === 1 ? 2          : // forest costs 2 sight points
                         1;                     // plains / road: 1 sight point

        const newSpent = spent + stepCost;
        if (newSpent > src.sight) {
          // Can see the blocking tile itself (not beyond)
          if (t !== 0) visible.add(nkey); // reveal the mountain/forest edge
          continue;
        }
        if (newSpent < (cost.get(nkey) ?? Infinity)) {
          cost.set(nkey, newSpent);
          queue.push({ q: nq, r: nr, spent: newSpent });
        }
      }
    }
  }
  return visible;
}

// ── Income ─────────────────────────────────────────────────────────────────
export function calcIncome(state, player) {
  let iron = BASE_IRON_PER_TURN, oil = BASE_OIL_PER_TURN, wood = 0;
  for (const b of state.buildings) {
    if (b.owner !== player) continue;
    if (b.underConstruction) continue; // no income while building
    const def = BUILDING_TYPES[b.type];
    iron += def.ironPerTurn;
    oil  += def.oilPerTurn;
    wood += def.woodPerTurn || 0;
  }
  return { iron, oil, wood };
}

// ── Recruitment ────────────────────────────────────────────────────────────
// unitType can be a standard type key OR a design id (number)
export function canRecruit(state, player, unitType, buildingId) {
  const b = state.buildings.find(b => b.id === buildingId && b.owner === player);
  if (!b) return { ok: false, reason: 'No building' };
  if (b.underConstruction) return { ok: false, reason: 'Still under construction' };

  // Custom design
  if (typeof unitType === 'number') {
    const design = state.designs[player].find(d => d.id === unitType);
    if (!design) return { ok: false, reason: 'Design not found' };
    const expectedBuilding = CHASSIS_BUILDINGS[design.chassis];
    if (b.type !== expectedBuilding) return { ok: false, reason: 'Wrong building for this design' };
    if (state.players[player].iron < design.trainCost.iron) return { ok: false, reason: `Need ${design.trainCost.iron} iron` };
    if (state.players[player].oil  < design.trainCost.oil)  return { ok: false, reason: `Need ${design.trainCost.oil} oil` };
    return { ok: true };
  }

  if (!BUILDING_TYPES[b.type].canRecruit.includes(unitType)) return { ok: false, reason: 'Wrong building' };
  const def = UNIT_TYPES[unitType];
  if (state.players[player].iron < def.cost.iron) return { ok: false, reason: 'Not enough iron' };
  if (state.players[player].oil  < def.cost.oil)  return { ok: false, reason: 'Not enough oil' };
  return { ok: true };
}

export function queueRecruit(state, player, unitType, buildingId) {
  const result = canRecruit(state, player, unitType, buildingId);
  if (!result.ok) return result;

  if (typeof unitType === 'number') {
    const design = state.designs[player].find(d => d.id === unitType);
    state.players[player].iron -= design.trainCost.iron;
    state.players[player].oil  -= design.trainCost.oil;
    const buildTime = UNIT_TYPES[design.chassis]?.buildTime ?? 1;
    state.pendingRecruits.push({ owner: player, designId: unitType, buildingId, turnsLeft: buildTime });
    return { ok: true };
  }

  const def = UNIT_TYPES[unitType];
  state.players[player].iron -= def.cost.iron;
  state.players[player].oil  -= def.cost.oil;
  state.pendingRecruits.push({ owner: player, type: unitType, buildingId, turnsLeft: def.buildTime ?? 1 });
  return { ok: true };
}

// ── Turn resolution ────────────────────────────────────────────────────────
export function resolveTurn(state, terrain) {
  const events = [];
  state._terrain = terrain; // make terrain accessible to combat resolution

  // Phase 1: Moves
  // destinations: key -> array of unit ids that attempted to enter this hex
  const moveLog = []; // explicit move playback log (pre-combat)
  const destinations = {};
  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    if (!destinations[key]) destinations[key] = [];
    destinations[key].push(parseInt(idStr));
  }

  // Same-hex opposing collision => panic clash (forced combat, no move)
  const panicClashes = [];
  for (const [key, ids] of Object.entries(destinations)) {
    if (ids.length < 2) continue;
    const [q, r] = key.split(',').map(Number);
    const units = ids.map(id => state.units.find(u => u.id === id)).filter(Boolean);
    const owners = new Set(units.map(u => u.owner));
    if (units.length === 2 && owners.size === 2) {
      panicClashes.push({ aId: units[0].id, bId: units[1].id, q, r });
      events.push(`Panic clash at (${q},${r}) — both units crash into same hex`);
    } else {
      events.push(`Move collision at (${q},${r})`);
    }
  }

  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    const ids = destinations[key] || [];
    // Move only when this destination is uncontested
    if (ids.length === 1 && ids[0] === parseInt(idStr)) {
      const unit = state.units.find(u => u.id === parseInt(idStr));
      if (unit) {
        // During planning, units are already displayed at planned q/r.
        // For resolution playback we need TRUE start-of-turn positions from _origQ/_origR.
        const fromQ = (unit._origQ !== undefined) ? unit._origQ : unit.q;
        const fromR = (unit._origR !== undefined) ? unit._origR : unit.r;
        unit.q = dest.q; unit.r = dest.r; unit.dugIn = false;
        moveLog.push({ unitId: unit.id, owner: unit.owner, from: { q: fromQ, r: fromR }, to: { q: dest.q, r: dest.r } });
        events.push(`${UNIT_TYPES[unit.type].name} (P${unit.owner}) → (${dest.q},${dest.r})`);
      }
    }
  }
  state._lastMoveLog = moveLog;
  // Snapshot state immediately after movement (before any combat damage)
  state._unitsAfterMoves = state.units.map(u => ({ ...u }));

  // Phase 2: Attacks (post-move positions) — full GDD combat system
  const damage = {};
  const combatLog = []; // detailed breakdowns for UI

  // Panic clashes from same-hex opposing move attempts
  for (const clash of panicClashes) {
    const a = state.units.find(u => u.id === clash.aId);
    const b = state.units.find(u => u.id === clash.bId);
    if (!a || !b) continue;
    const aDef = UNIT_TYPES[a.type], bDef = UNIT_TYPES[b.type];
    const aPower = Math.max(1, Math.round(((aDef.soft_attack || 1) + (aDef.hard_attack || 1)) / 2));
    const bPower = Math.max(1, Math.round(((bDef.soft_attack || 1) + (bDef.hard_attack || 1)) / 2));
    const roll = Math.floor(Math.random() * 21) - 10; // panic chaos
    const score = Math.max(0, Math.min(100, 50 + (aPower - bPower) * 6 + roll));
    let tier = 'Neutral', dmg = 1, attackerDmg = 1;
    if (score < 35)  { tier = 'Repelled';             dmg = 0; attackerDmg = 1; }
    else if (score < 65) { tier = 'Neutral';          dmg = 1; attackerDmg = 1; }
    else if (score < 85) { tier = 'Effective';        dmg = 2; attackerDmg = 1; }
    else                 { tier = 'Overwhelming';     dmg = 2; attackerDmg = 0; }

    dmg = Math.max(0, dmg - (bDef.defense || 0));
    attackerDmg = Math.max(0, attackerDmg - (aDef.defense || 0));
    if (dmg > 0) damage[b.id] = (damage[b.id] || 0) + dmg;
    if (attackerDmg > 0) damage[a.id] = (damage[a.id] || 0) + attackerDmg;

    combatLog.push({
      type: 'combat', panic: true, hex: { q: clash.q, r: clash.r },
      attackerId: a.id, attackerType: a.type, attackerHex: { q: a.q, r: a.r },
      attackerName: aDef.name, attackerOwner: a.owner,
      targetId: b.id, targetType: b.type, targetHex: { q: b.q, r: b.r },
      targetName: bDef.name, targetOwner: b.owner,
      isArmored: (bDef.armor || 0) > 2, baseAttack: aPower, pierce: aDef.pierce || 1, armor: bDef.armor || 1,
      pierceRatio: 1, accuracy: 0, evasion: 0, terrainMod: 0, dugInMod: 0, bunkerMod: 0, flankMod: 0,
      roll, blindFirePenalty: 0, score, tier, dmg, attackerDmg, suppressed: false, blindFire: false,
    });
    events.push(`[PANIC] ${aDef.name}(P${a.owner}) ↔ ${bDef.name}(P${b.owner}) at (${clash.q},${clash.r}) | ${tier} | dmg:${dmg}/${attackerDmg}`);
  }

  // Resolve hex-targeted (blind fire) attacks → look up what's there now
  // pendingAttacks values can be: unitId (number) OR { hex: {q,r} }
  const resolvedAttacks = {}; // attackerId → targetUnitId (or null for clean miss)
  for (const [idStr, attack] of Object.entries(state.pendingAttacks)) {
    if (typeof attack === 'object' && attack.hex) {
      const unit = state.units.find(u => u.q === attack.hex.q && u.r === attack.hex.r && !u.dead);
      const attacker = state.units.find(u => u.id === parseInt(idStr));
      if (unit && attacker && unit.owner !== attacker.owner) {
        resolvedAttacks[idStr] = { id: unit.id, blindFire: true };
      } else {
        // Blind fire hit empty hex
        const attacker2 = state.units.find(u => u.id === parseInt(idStr));
        const aDef = attacker2 ? UNIT_TYPES[attacker2.type] : null;
        events.push(`${aDef?.name || 'Unit'} (P${attacker2?.owner}) fires at (${attack.hex.q},${attack.hex.r}) — no target`);
        combatLog.push({ type: 'blind_miss', attackerId: attacker2?.id, attackerType: attacker2?.type, attackerHex: attacker2 ? { q: attacker2.q, r: attacker2.r } : null, attackerName: aDef?.name, attackerOwner: attacker2?.owner, hex: attack.hex, targetHex: attack.hex });
      }
    } else {
      resolvedAttacks[idStr] = { id: attack, blindFire: false }; // direct unit target
    }
  }

  // Count how many attackers are targeting each unit (flanking bonus)
  const attackerCount = {};
  for (const atk of Object.values(resolvedAttacks)) {
    if (atk?.id) attackerCount[atk.id] = (attackerCount[atk.id] || 0) + 1;
  }

  for (const [idStr, atk] of Object.entries(resolvedAttacks)) {
    if (!atk?.id) continue;
    const targetId = atk.id;
    const blindFire = atk.blindFire;
    const attacker = state.units.find(u => u.id === parseInt(idStr));
    const target   = state.units.find(u => u.id === targetId);
    if (!attacker || !target) continue;
    const aDef = UNIT_TYPES[attacker.type];
    const tDef = UNIT_TYPES[target.type];
    const dist = hexDistance(attacker.q, attacker.r, target.q, target.r);
    if (dist > aDef.range) {
      events.push(`${aDef.name} (P${attacker.owner}) missed — target moved out of range`);
      combatLog.push({ type: 'miss', attackerId: attacker.id, attackerType: attacker.type, attackerHex: { q: attacker.q, r: attacker.r }, attackerName: aDef.name, attackerOwner: attacker.owner, targetId: target.id, targetType: target.type, targetHex: { q: target.q, r: target.r }, targetName: tDef.name, targetOwner: target.owner });
      continue;
    }

    // Naval vs land: ships attacking land targets use naval_attack stat (lower effectiveness)
    const attackerIsNaval = NAVAL_UNITS.has(attacker.type) || attacker.type === 'COASTAL_BATTERY';
    const targetIsNaval   = NAVAL_UNITS.has(target.type);
    const targetTerrain   = (state._terrain && state._terrain[`${target.q},${target.r}`]) ?? 0;
    const targetOnLand    = targetTerrain <= 3 || targetTerrain === 6 || targetTerrain === 7; // plains/forest/mtn/hill/sand/lightwoods
    // Ships attacking land: use naval_attack, halved effectiveness
    const navalVsLand = attackerIsNaval && targetOnLand && !targetIsNaval;
    const navalVsNaval = attackerIsNaval && targetIsNaval;

    // Determine if target is armored (armor > 2 = armored)
    const isArmored = tDef.armor > 2;
    let baseAttack = isArmored ? aDef.hard_attack : aDef.soft_attack;
    if (navalVsLand) baseAttack = Math.floor((aDef.naval_attack || 1) * 0.6); // naval bombardment: 60% naval_attack

    // Pierce vs armor ratio
    let pierceRatio = 1;
    if (aDef.pierce < tDef.armor) pierceRatio = aDef.pierce / tDef.armor;

    // Base combat score (50 = neutral starting point)
    let score = 50;
    score += aDef.accuracy;
    // Blind fire penalty: firing at a hex without confirmed intel = -20 score
    const blindFirePenalty = blindFire ? 20 : 0;
    score -= blindFirePenalty;
    score += target.evasion_penalty || 0; // suppressed units lose evasion

    // Terrain modifier for defender
    const ttype = (state._terrain && state._terrain[`${target.q},${target.r}`]) ?? 0;
    let terrainMod = 0;
    if (ttype === 7) terrainMod = 5;  // light woods: slight cover
    if (ttype === 1) terrainMod = 10; // dense forest: good cover
    if (ttype === 2) terrainMod = 20; // mountain: strong cover
    score -= terrainMod; // terrain helps defender = hurts attacker score

    // Submarine shallow-water debuff: exposed, can't dive → -10 evasion in combat
    const subShallowPenalty = (target.type === 'SUBMARINE' && ttype === 4) ? 10 : 0;
    score += subShallowPenalty; // makes sub easier to hit

    // MTB torpedo bonus: +15 score vs armored ships (armor > 3)
    const mtbTorpedoBonus = (aDef.torpedoBonus && tDef.armor > 3) ? 15 : 0;
    score += mtbTorpedoBonus;

    // Dug-in bonus
    let dugInMod = 0;
    if (target.dugIn) { dugInMod = 8; score -= dugInMod; }

    // Bunker bonus
    let bunkerMod = 0;
    const onBunker = state.buildings.find(b => b.type === 'BUNKER' && b.q === target.q && b.r === target.r && b.owner === target.owner);
    if (onBunker) { bunkerMod = 15; score -= bunkerMod; }

    // Evasion (defender)
    score -= tDef.evasion;

    // Flanking bonus (multiple attackers on same target)
    const flankers = Math.max(0, (attackerCount[targetId] || 1) - 1);
    const flankMod = flankers * 10;
    score += flankMod;

    // Pierce ratio shifts score
    score += Math.round((pierceRatio - 0.5) * 20); // pierce=armor → +10; pierce=0 → -10

    // Random roll ±15
    const roll = Math.floor(Math.random() * 31) - 15;
    score += roll;
    score = Math.max(0, Math.min(100, score));

    // Outcome tier
    let tier, dmg = 0, attackerDmg = 0, suppressed = false;
    if (score < 20) {
      tier = 'Catastrophic Failure';
      attackerDmg = Math.ceil(baseAttack * 0.5);
    } else if (score < 40) {
      tier = 'Repelled';
      attackerDmg = 1;
    } else if (score < 60) {
      tier = 'Neutral';
      dmg = Math.max(1, Math.round(baseAttack * pierceRatio * 0.5));
      attackerDmg = 1;
    } else if (score < 80) {
      tier = 'Effective';
      dmg = Math.max(1, Math.round(baseAttack * pierceRatio));
    } else {
      tier = 'Overwhelming';
      dmg = Math.max(1, Math.round(baseAttack * pierceRatio));
      suppressed = true;
    }

    // Defense flat reduction
    dmg = Math.max(0, dmg - tDef.defense);

    // Accumulate damage
    if (dmg > 0)        damage[targetId]  = (damage[targetId]  || 0) + dmg;
    if (attackerDmg > 0) damage[attacker.id] = (damage[attacker.id] || 0) + attackerDmg;
    if (suppressed) target.suppressed = true;

    const entry = {
      type: 'combat',
      attackerId: attacker.id, attackerType: attacker.type, attackerHex: { q: attacker.q, r: attacker.r },
      attackerName: aDef.name, attackerOwner: attacker.owner,
      targetId: target.id, targetType: target.type, targetHex: { q: target.q, r: target.r },
      targetName: tDef.name,   targetOwner: target.owner,
      isArmored, baseAttack, pierce: aDef.pierce, armor: tDef.armor, pierceRatio,
      accuracy: aDef.accuracy, evasion: tDef.evasion,
      terrainMod, dugInMod, bunkerMod, flankMod, roll, blindFirePenalty,
      score, tier, dmg, attackerDmg, suppressed, blindFire,
    };
    combatLog.push(entry);
    events.push(`[COMBAT] ${aDef.name}(P${attacker.owner}) → ${tDef.name}(P${target.owner}) | Score:${score} | ${tier} | Def dmg:${dmg} Att dmg:${attackerDmg}${suppressed?' SUPPRESSED':''}`);
  }

  // Apply all damage
  for (const [idStr, dmg] of Object.entries(damage)) {
    const t = state.units.find(u => u.id === parseInt(idStr));
    if (t && dmg > 0) {
      t.health -= dmg;
      if (t.health <= 0) events.push(`${UNIT_TYPES[t.type].name} (P${t.owner}) destroyed!`);
    }
  }
  state.units = state.units.filter(u => u.health > 0);
  state._lastCombatLog = combatLog; // stored for UI to read

  // Phase 2.5: Medic healing + Harbor naval repair
  for (const medic of state.units.filter(u => u.type === 'MEDIC')) {
    for (const [dq, dr] of HEX_NEIGHBORS) {
      const target = unitAt(state, medic.q + dq, medic.r + dr);
      if (target && target.owner === medic.owner && target.health < target.maxHealth) {
        target.health = Math.min(target.maxHealth, target.health + 1);
        events.push(`Medic (P${medic.owner}) heals ${UNIT_TYPES[target.type].name}`);
      }
    }
  }
  // Harbor: repair 1hp to naval units docked on or adjacent to harbor
  for (const harbor of state.buildings.filter(b => b.type === 'HARBOR')) {
    for (const [dq, dr] of [[0,0], ...HEX_NEIGHBORS]) {
      const target = unitAt(state, harbor.q + dq, harbor.r + dr);
      if (target && target.owner === harbor.owner && NAVAL_UNITS.has(target.type) && target.health < target.maxHealth) {
        target.health = Math.min(target.maxHealth, target.health + 1);
        events.push(`Harbor (P${harbor.owner}) repairs ${UNIT_TYPES[target.type].name}`);
      }
    }
  }

  // Phase 2.6: Auto-road standing orders
  // Engineers with a roadOrder automatically advance one step and build road.
  // Cancel conditions: enemy within 2 tiles, iron shortage, destination reached.
  // Uses actual post-Phase-1 positions (enemies at their resolved locations).
  const _autoRoadNextId = () => {
    const maxId = Math.max(0, ...state.units.map(u => u.id || 0), ...state.buildings.map(b => isNaN(b.id) ? 0 : (b.id || 0)));
    return maxId + 1;
  };
  for (const unit of state.units.filter(u => u.type === 'ENGINEER' && u.roadOrder)) {
    const order = unit.roadOrder;
    const owner = unit.owner;

    // Cancel if enemy within 2 tiles (post-Phase-1 positions)
    const threatened = state.units.some(e => {
      if (e.owner === owner) return false;
      return hexDistance(unit.q, unit.r, e.q, e.r) <= 2;
    });
    if (threatened) {
      events.push(`Engineer (P${owner}) auto-road cancelled — enemy nearby`);
      delete unit.roadOrder; continue;
    }

    // Cancel if iron insufficient
    if (state.players[owner].iron < 1) {
      events.push(`Engineer (P${owner}) auto-road paused — no iron`);
      delete unit.roadOrder; continue;
    }

    // Already at destination?
    if (unit.q === order.destQ && unit.r === order.destR) {
      events.push(`Engineer (P${owner}) auto-road complete`);
      delete unit.roadOrder; continue;
    }

    // Re-pathfind from current position each turn
    const mapSz = state._mapSize || 25;
    const path = findPath(terrain, mapSz, unit.q, unit.r, order.destQ, order.destR, 'ENGINEER');
    if (!path || path.length === 0) {
      events.push(`Engineer (P${owner}) auto-road blocked — no path to (${order.destQ},${order.destR}) from (${unit.q},${unit.r})`);
      delete unit.roadOrder; continue;
    }

    // Move one step along path
    const next = path[0];
    const nq = next.q, nr = next.r;

    // Don't step on a unit that isn't the engineer itself
    const blocker = state.units.find(u => u.q === nq && u.r === nr && u.id !== unit.id && !u.embarked);
    if (blocker) {
      events.push(`Engineer (P${owner}) auto-road stalled — hex (${nq},${nr}) occupied by ${UNIT_TYPES[blocker.type]?.name}`);
      continue; // keep order, try again next turn
    }

    unit.q = nq; unit.r = nr; unit.moved = true;

    // Build road on the new hex if none exists
    if (!roadAt(state, nq, nr)) {
      state.buildings.push({ id: _autoRoadNextId(), type: 'ROAD', q: nq, r: nr, owner });
      state.players[owner].iron -= 1;
      events.push(`Engineer (P${owner}) auto-builds road at (${nq},${nr})`);
    } else {
      events.push(`Engineer (P${owner}) advances along existing road at (${nq},${nr})`);
    }

    // Update stored path preview
    order.path = path.slice(1);

    // Clear order if destination reached
    if (nq === order.destQ && nr === order.destR) {
      events.push(`Engineer (P${owner}) auto-road order complete`);
      delete unit.roadOrder;
    }
  }

  // Phase 3: Captures
  for (const b of state.buildings) {
    if (b.type === 'ROAD') continue;
    const unit = unitAt(state, b.q, b.r);
    if (unit && unit.owner !== b.owner) {
      events.push(`P${unit.owner} captures ${BUILDING_TYPES[b.type].name}!`);
      b.owner = unit.owner;
    }
  }

  // Phase 4: Tick recruit timers — spawn when turnsLeft reaches 0
  for (const recruit of state.pendingRecruits) {
    recruit.turnsLeft = Math.max(0, (recruit.turnsLeft ?? 1) - 1);
  }
  const toSpawn = state.pendingRecruits.filter(r => r.turnsLeft <= 0);
  state.pendingRecruits = state.pendingRecruits.filter(r => r.turnsLeft > 0);
  for (const recruit of toSpawn) {
    const b = state.buildings.find(b => b.id === recruit.buildingId);
    if (!b || b.owner !== recruit.owner) continue;
    // Determine the chassis type for terrain-aware spawn placement
    const spawnChassis = recruit.designId !== undefined
      ? (state.designs[recruit.owner].find(d => d.id === recruit.designId)?.chassis ?? null)
      : (recruit.type ?? null);
    const spawnHex = findFreeAdjacentHex(state, b.q, b.r, spawnChassis, state._terrain);
    if (spawnHex) {
      if (recruit.designId !== undefined) {
        // Custom design spawn
        const design = state.designs[recruit.owner].find(d => d.id === recruit.designId);
        if (design) {
          const unit = createUnit(design.chassis, recruit.owner, spawnHex.q, spawnHex.r);
          // Apply custom stats
          Object.assign(unit, { ...design.stats, q: spawnHex.q, r: spawnHex.r, owner: recruit.owner, id: unit.id, type: design.chassis, health: design.stats.health, maxHealth: design.stats.health, moved: false, attacked: false, dugIn: false, building: false, suppressed: false, designId: design.id, designName: design.name });
          state.units.push(unit);
          events.push(`P${recruit.owner} recruits ${design.name}`);
        }
      } else {
        state.units.push(createUnit(recruit.type, recruit.owner, spawnHex.q, spawnHex.r));
        events.push(`P${recruit.owner} recruits ${UNIT_TYPES[recruit.type].name}`);
      }
    } else {
      events.push(`P${recruit.owner} recruit failed — no space`);
    }
  }

  // Phase 4b: Air unit fuel (both players)
  for (const player of [1, 2]) {
    for (const unit of state.units.filter(u => u.owner === player && u.fuel !== undefined)) {
      const onAirfield = state.buildings.find(
        b => b.q === unit.q && b.r === unit.r && b.type === 'AIRFIELD' &&
             b.owner === player && !b.underConstruction
      );
      if (onAirfield) {
        unit.fuel = unit.fuelMax;
      } else {
        unit.fuel = Math.max(0, unit.fuel - 1);
        if (unit.fuel === 0) { unit.health = 0; events.push(`${UNIT_TYPES[unit.type].name} (P${player}) crashed — out of fuel!`); }
      }
    }
  }
  state.units = state.units.filter(u => u.health > 0);

  // Phase 5: Income
  for (const player of [1, 2]) {
    const inc = calcIncome(state, player);
    state.players[player].iron += inc.iron;
    state.players[player].oil  += inc.oil;
    events.push(`P${player} +${inc.iron} iron, +${inc.oil} oil`);
  }

  // Reset
  for (const unit of state.units) {
    unit.moved = false; unit.attacked = false; unit.building = false; unit.suppressed = false; unit.sprinted = false;
    delete unit._origQ; delete unit._origR; // clear undo anchors
  }
  state.pendingMoves = {}; state.pendingAttacks = {};
  state.players[1].submitted = false; state.players[2].submitted = false;
  // IGOUGO: alternate the active player each resolution
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  state.phase = 'planning'; state.turn++;

  return events;
}

// ── IGOUGO: resolve a single immediate attack (Civ-style) ────────────────────
// Call when the attacker clicks attack during their turn.
// Returns a combatLog entry (single entry array) for UI display.
export function resolveImmediateAttack(state, attackerId, targetId, blindFire = false) {
  const attacker = state.units.find(u => u.id === attackerId);
  const target   = state.units.find(u => u.id === targetId);
  if (!attacker || !target) return [];

  const aDef = UNIT_TYPES[attacker.type];
  const tDef = UNIT_TYPES[target.type];
  const INDIRECT_FIRE = new Set(['ARTILLERY', 'MORTAR']);

  const attackerIsNaval = NAVAL_UNITS.has(attacker.type) || attacker.type === 'COASTAL_BATTERY';
  const targetIsNaval   = NAVAL_UNITS.has(target.type);
  const targetTerrain   = (state._terrain && state._terrain[`${target.q},${target.r}`]) ?? 0;
  const targetOnLand    = targetTerrain <= 3 || targetTerrain === 6 || targetTerrain === 7;
  const navalVsLand     = attackerIsNaval && targetOnLand && !targetIsNaval;
  const navalVsNaval    = attackerIsNaval && targetIsNaval;

  const isArmored = tDef.armor > 2;
  let baseAttack = isArmored ? aDef.hard_attack : aDef.soft_attack;
  // Naval vs naval: ships fight with hard_attack (hull vs hull)
  if (navalVsNaval) baseAttack = aDef.hard_attack;
  if (navalVsLand)  baseAttack = Math.floor((aDef.naval_attack || 1) * 0.6);

  let pierceRatio = 1;
  if (aDef.pierce < tDef.armor) pierceRatio = aDef.pierce / tDef.armor;

  let score = 50;
  score += aDef.accuracy;
  const blindFirePenalty = blindFire ? 20 : 0;
  score -= blindFirePenalty;
  const ttype = targetTerrain;
  let terrainMod = 0;
  if (ttype === 7) terrainMod = 5;
  if (ttype === 1) terrainMod = 10;
  if (ttype === 2) terrainMod = 20;
  score -= terrainMod;
  const subShallowPenalty = (target.type === 'SUBMARINE' && ttype === 4) ? 10 : 0;
  score += subShallowPenalty;
  let dugInMod = 0;
  if (target.dugIn) { dugInMod = 8; score -= dugInMod; }
  let bunkerMod = 0;
  const onBunker = state.buildings.find(b => b.type === 'BUNKER' && b.q === target.q && b.r === target.r && b.owner === target.owner);
  if (onBunker) { bunkerMod = 15; score -= bunkerMod; }
  score -= tDef.evasion;
  score += Math.round((pierceRatio - 0.5) * 20);
  const roll = Math.floor(Math.random() * 31) - 15;
  score += roll;
  score = Math.max(0, Math.min(100, score));

  let tier, dmg = 0, attackerDmg = 0, suppressed = false;
  if (score < 20)       { tier = 'Catastrophic Failure'; attackerDmg = Math.ceil(baseAttack * 0.5); }
  else if (score < 40)  { tier = 'Repelled';             attackerDmg = 1; }
  else if (score < 60)  { tier = 'Neutral';              dmg = Math.max(1, Math.round(baseAttack * pierceRatio * 0.5)); attackerDmg = 1; }
  else if (score < 80)  { tier = 'Effective';            dmg = Math.max(1, Math.round(baseAttack * pierceRatio)); }
  else                  { tier = 'Overwhelming';         dmg = Math.max(1, Math.round(baseAttack * pierceRatio)); suppressed = true; }

  dmg = Math.max(0, dmg - tDef.defense);

  // Retaliation: defender fires back if alive after attacker's hit and in range
  const dist = hexDistance(attacker.q, attacker.r, target.q, target.r);
  const defenderRange = tDef.range || 1;
  // Subs with noSurfaceRetaliation can't retaliate against surface ships (they dive instead)
  const subDiveBlock = tDef.noSurfaceRetaliation && !aDef.noSurfaceRetaliation;
  const canRetaliate = !blindFire && !INDIRECT_FIRE.has(attacker.type) && !subDiveBlock && dist <= defenderRange && target.health - dmg > 0 && !target.suppressed;

  let retDmg = 0, retScore = 0, retTier = '';
  if (canRetaliate) {
    const rIsArmored = aDef.armor > 2;
    let rBaseAttack = (navalVsNaval) ? tDef.hard_attack : (rIsArmored ? tDef.hard_attack : tDef.soft_attack);
    let rPierceRatio = 1;
    if (tDef.pierce < aDef.armor) rPierceRatio = tDef.pierce / aDef.armor;
    retScore = 50 + tDef.accuracy - aDef.evasion + Math.round((rPierceRatio - 0.5) * 20) + (Math.floor(Math.random() * 31) - 15);
    retScore = Math.max(0, Math.min(100, retScore));
    if (retScore >= 60) retDmg = Math.max(1, Math.round(rBaseAttack * rPierceRatio));
    else if (retScore >= 40) retDmg = Math.max(1, Math.round(rBaseAttack * rPierceRatio * 0.5));
    retTier = retScore >= 80 ? 'Overwhelming' : retScore >= 60 ? 'Effective' : retScore >= 40 ? 'Neutral' : retScore >= 20 ? 'Repelled' : 'Catastrophic Failure';
    retDmg = Math.max(0, retDmg - aDef.defense);
    attackerDmg += retDmg;
  }

  // Apply damage immediately
  if (dmg > 0)         { target.health   -= dmg;        if (target.health   <= 0) target.dead = true; }
  if (attackerDmg > 0) { attacker.health -= attackerDmg; if (attacker.health <= 0) attacker.dead = true; }
  if (suppressed) target.suppressed = true;
  state.units = state.units.filter(u => !u.dead);
  attacker.attacked = true;

  const entry = {
    type: 'combat',
    attackerId: attacker.id, attackerType: attacker.type, attackerHex: { q: attacker.q, r: attacker.r },
    attackerName: aDef.name, attackerOwner: attacker.owner,
    attackerHPBefore: attacker.health + attackerDmg,
    targetId: target.id, targetType: target.type, targetHex: { q: target.q, r: target.r },
    targetName: tDef.name, targetOwner: target.owner,
    targetHPBefore: target.health + dmg,
    isArmored, baseAttack, pierce: aDef.pierce, armor: tDef.armor, pierceRatio,
    accuracy: aDef.accuracy, evasion: tDef.evasion,
    terrainMod, dugInMod, bunkerMod, flankMod: 0, roll, blindFirePenalty,
    score, tier, dmg, attackerDmg, suppressed, blindFire,
    defenderCanRetaliate: canRetaliate, retaliationDmg: retDmg, retaliationScore: retScore, retaliationTier: retTier,
  };
  state._lastCombatLog = [entry];
  return [entry];
}

// ── IGOUGO: end-of-turn for current player (captures, income, spawns) ─────────
export function resolveEndOfTurn(state, terrain) {
  const events = [];
  const player = state.currentPlayer;
  state._terrain = terrain;

  // Captures (only by current player's units)
  for (const b of state.buildings) {
    if (b.type === 'ROAD') continue;
    const unit = unitAt(state, b.q, b.r);
    if (unit && unit.owner !== b.owner && unit.owner === player) {
      events.push(`P${player} captures ${BUILDING_TYPES[b.type].name}!`);
      b.owner = player;
    }
  }

  // Tick recruit timers for current player
  for (const recruit of state.pendingRecruits.filter(r => r.owner === player)) {
    recruit.turnsLeft = Math.max(0, (recruit.turnsLeft ?? 1) - 1);
  }
  const toSpawn = state.pendingRecruits.filter(r => r.owner === player && r.turnsLeft <= 0);
  state.pendingRecruits = state.pendingRecruits.filter(r => !(r.owner === player && r.turnsLeft <= 0));
  for (const recruit of toSpawn) {
    const b = state.buildings.find(b => b.id === recruit.buildingId);
    if (!b || b.owner !== recruit.owner) continue;
    const spawnChassis = recruit.designId !== undefined
      ? (state.designs[recruit.owner].find(d => d.id === recruit.designId)?.chassis ?? null)
      : (recruit.type ?? null);
    const spawnHex = findFreeAdjacentHex(state, b.q, b.r, spawnChassis, state._terrain);
    if (spawnHex) {
      if (recruit.designId !== undefined) {
        const design = state.designs[recruit.owner].find(d => d.id === recruit.designId);
        if (design) {
          const unit = createUnit(design.chassis, recruit.owner, spawnHex.q, spawnHex.r);
          Object.assign(unit, { ...design.stats, q: spawnHex.q, r: spawnHex.r, owner: recruit.owner, id: unit.id, type: design.chassis, health: design.stats.health, maxHealth: design.stats.health, moved: false, attacked: false, dugIn: false, building: false, suppressed: false, designId: design.id, designName: design.name });
          state.units.push(unit);
          events.push(`P${recruit.owner} recruits ${design.name}`);
        }
      } else {
        state.units.push(createUnit(recruit.type, recruit.owner, spawnHex.q, spawnHex.r));
        events.push(`P${recruit.owner} recruits ${UNIT_TYPES[recruit.type].name}`);
      }
    }
  }

  // Medic healing for current player
  for (const medic of state.units.filter(u => u.type === 'MEDIC' && u.owner === player)) {
    for (const [dq, dr] of HEX_NEIGHBORS) {
      const t = unitAt(state, medic.q + dq, medic.r + dr);
      if (t && t.owner === player && t.health < t.maxHealth) {
        t.health = Math.min(t.maxHealth, t.health + 1);
      }
    }
  }

  // Auto-move standing orders (all unit types)
  for (const unit of state.units.filter(u => u.owner === player && u.moveOrder)) {
    const order = unit.moveOrder;
    // Already at destination?
    if (unit.q === order.destQ && unit.r === order.destR) {
      events.push(`${UNIT_TYPES[unit.type]?.name || unit.type} (P${player}) auto-move complete`);
      delete unit.moveOrder; continue;
    }
    // Re-pathfind from current position
    const mapSz = state._mapSize || 25;
    const path = findPath(terrain, mapSz, unit.q, unit.r, order.destQ, order.destR, unit.type);
    if (!path || path.length === 0) {
      events.push(`${UNIT_TYPES[unit.type]?.name || unit.type} (P${player}) auto-move blocked — no path`);
      delete unit.moveOrder; continue;
    }
    // Move as many steps as the unit's move allowance
    let steps = UNIT_TYPES[unit.type]?.move || 1;
    for (let i = 0; i < steps && i < path.length; i++) {
      const nq = path[i].q, nr = path[i].r;
      const blocker = state.units.find(u => u.q === nq && u.r === nr && u.id !== unit.id && !u.embarked);
      if (blocker) break; // stalled this step, try again next turn
      unit.q = nq; unit.r = nr;
      if (nq === order.destQ && nr === order.destR) {
        events.push(`${UNIT_TYPES[unit.type]?.name || unit.type} (P${player}) reached destination`);
        delete unit.moveOrder; break;
      }
    }
    unit.moved = true;
    if (unit.moveOrder) order.path = path.slice(Math.min(steps, path.length));
  }

  // Auto-road standing orders (current player's engineers)
  const _autoRoadNextId = () => {
    const maxId = Math.max(0, ...state.units.map(u => u.id || 0), ...state.buildings.map(b => isNaN(b.id) ? 0 : (b.id || 0)));
    return maxId + 1;
  };
  for (const unit of state.units.filter(u => u.type === 'ENGINEER' && u.owner === player && u.roadOrder)) {
    const order = unit.roadOrder;
    // Cancel if enemy within 2 tiles
    const threatened = state.units.some(e => e.owner !== player && hexDistance(unit.q, unit.r, e.q, e.r) <= 2);
    if (threatened) {
      events.push(`Engineer (P${player}) auto-road cancelled — enemy nearby`);
      delete unit.roadOrder; continue;
    }
    // Cancel if iron insufficient
    if (state.players[player].iron < 1) {
      events.push(`Engineer (P${player}) auto-road paused — no iron`);
      continue; // keep order, try again next turn
    }
    // Already at destination?
    if (unit.q === order.destQ && unit.r === order.destR) {
      events.push(`Engineer (P${player}) auto-road complete`);
      delete unit.roadOrder; continue;
    }
    // Re-pathfind from current position
    const mapSz = state._mapSize || 25;
    const path = findPath(terrain, mapSz, unit.q, unit.r, order.destQ, order.destR, 'ENGINEER');
    if (!path || path.length === 0) {
      events.push(`Engineer (P${player}) auto-road blocked — no path`);
      delete unit.roadOrder; continue;
    }
    // Move one step
    const next = path[0];
    const nq = next.q, nr = next.r;
    const blocker = state.units.find(u => u.q === nq && u.r === nr && u.id !== unit.id && !u.embarked);
    if (blocker) {
      events.push(`Engineer (P${player}) auto-road stalled — hex (${nq},${nr}) occupied`);
      continue; // keep order
    }
    unit.q = nq; unit.r = nr; unit.moved = true;
    if (!roadAt(state, nq, nr)) {
      state.buildings.push({ id: _autoRoadNextId(), type: 'ROAD', q: nq, r: nr, owner: player });
      state.players[player].iron -= 1;
      events.push(`Engineer (P${player}) auto-builds road at (${nq},${nr})`);
    } else {
      events.push(`Engineer (P${player}) advances along road at (${nq},${nr})`);
    }
    order.path = path.slice(1);
    if (nq === order.destQ && nr === order.destR) {
      events.push(`Engineer (P${player}) auto-road order complete`);
      delete unit.roadOrder;
    }
  }

  // ── Construction progress ─────────────────────────────────────────────────
  // For each engineer still building, advance their building's progress by 1
  for (const unit of state.units.filter(u => u.owner === player && u.constructing)) {
    const b = state.buildings.find(b => b.id === unit.constructing);
    if (!b || !b.underConstruction) {
      // Building gone or already complete — clear the flag
      delete unit.constructing;
      continue;
    }
    b.buildProgress = (b.buildProgress || 0) + 1;
    if (b.buildProgress >= b.buildTurnsRequired) {
      b.underConstruction = false;
      delete b.buildProgress;
      delete b.buildTurnsRequired;
      delete unit.constructing;
      events.push(`P${player} completed ${BUILDING_TYPES[b.type].name}!`);
    }
  }

  // ── Air unit fuel ──────────────────────────────────────────────────────────
  // At end of each player's turn: refuel if on friendly Airfield, else burn 1 fuel.
  // Hitting 0 = crash (unit destroyed).
  for (const unit of state.units.filter(u => u.owner === player && u.fuel !== undefined)) {
    const onAirfield = state.buildings.find(
      b => b.q === unit.q && b.r === unit.r && b.type === 'AIRFIELD' &&
           b.owner === player && !b.underConstruction
    );
    if (onAirfield) {
      unit.fuel = unit.fuelMax; // refueled
      events.push(`${UNIT_TYPES[unit.type].name} (P${player}) refueled at Airfield`);
    } else {
      unit.fuel = Math.max(0, unit.fuel - 1);
      if (unit.fuel === 0) {
        events.push(`${UNIT_TYPES[unit.type].name} (P${player}) crashed — out of fuel!`);
        unit.health = 0; // mark for removal below
      } else if (unit.fuel === 1) {
        events.push(`${UNIT_TYPES[unit.type].name} (P${player}) — FUEL CRITICAL (1 turn remaining)`);
      }
    }
  }
  // Remove crashed air units
  state.units = state.units.filter(u => u.health > 0);

  // Income for current player
  const inc = calcIncome(state, player);
  state.players[player].iron += inc.iron;
  state.players[player].oil  += inc.oil;
  state.players[player].wood  = (state.players[player].wood || 0) + inc.wood;
  let incStr = `P${player} +${inc.iron} iron, +${inc.oil} oil`;
  if (inc.wood > 0) incStr += `, +${inc.wood} wood`;
  events.push(incStr);

  // Reset current player's units for next turn
  for (const unit of state.units.filter(u => u.owner === player)) {
    unit.moved = false; unit.attacked = false; unit.building = false; unit.suppressed = false; unit.sprinted = false;
    // Keep constructing engineers locked in place
    if (unit.constructing) unit.moved = true;
    delete unit._origQ; delete unit._origR;
  }
  state.pendingMoves = {}; state.pendingAttacks = {};

  // Switch player
  state.currentPlayer = player === 1 ? 2 : 1;
  // Increment turn counter every time P2 ends their turn (full round)
  if (player === 2) state.turn++;
  state.phase = 'planning';

  return events;
}

function findFreeAdjacentHex(state, q, r, unitType = null, terrain = null) {
  for (const [dq, dr] of HEX_NEIGHBORS) {
    const nq = q + dq, nr = r + dr;
    if (unitAt(state, nq, nr) || buildingAt(state, nq, nr)) continue;
    // If unitType and terrain provided, check that the unit can actually stand here
    if (unitType && terrain) {
      const ttype = terrain[`${nq},${nr}`] ?? 0;
      if (!canEnterTerrain(unitType, ttype)) continue;
    }
    return { q: nq, r: nr };
  }
  return null;
}

export function checkWinner(state) {
  const p1 = state.units.filter(u => u.owner === 1).length;
  const p2 = state.units.filter(u => u.owner === 2).length;
  const p1HQ = state.buildings.find(b => b.type === 'HQ' && b.owner === 1);
  const p2HQ = state.buildings.find(b => b.type === 'HQ' && b.owner === 2);
  if (!p2HQ || p2 === 0) return 1;
  if (!p1HQ || p1 === 0) return 2;
  return null;
}

const HEX_NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
