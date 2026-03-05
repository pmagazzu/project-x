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
export const UNIT_TYPES = {
  //              name          mv  atk  hp  rng  cost                   shape      canDigIn canBuild canHeal sight | soft  hard  pierce armor def  eva  acc
  //                                                                                                                                                                                          buildTime = turns to produce
  INFANTRY:  { name:'Infantry',  move:2, attack:2, health:3, range:1, cost:{iron:2,oil:0}, shape:'circle',   canDigIn:true,  canBuild:false, canHeal:false, sight:2, soft_attack:3, hard_attack:1, pierce:1, armor:1, defense:1, evasion:0,  accuracy:0,  buildTime:1 },
  TANK:      { name:'Tank',      move:4, attack:3, health:6, range:1, cost:{iron:4,oil:2}, shape:'square',   canDigIn:false, canBuild:false, canHeal:false, sight:3, soft_attack:2, hard_attack:4, pierce:5, armor:6, defense:2, evasion:5,  accuracy:5,  buildTime:3 },
  ARTILLERY: { name:'Artillery', move:1, attack:4, health:2, range:2, cost:{iron:3,oil:2}, shape:'triangle', canDigIn:false, canBuild:false, canHeal:false, sight:2, soft_attack:5, hard_attack:3, pierce:3, armor:1, defense:0, evasion:0,  accuracy:5,  buildTime:2 },
  ENGINEER:  { name:'Engineer',  move:2, attack:1, health:2, range:1, cost:{iron:3,oil:0}, shape:'diamond',  canDigIn:false, canBuild:true,  canHeal:false, sight:2, soft_attack:1, hard_attack:0, pierce:1, armor:1, defense:0, evasion:0,  accuracy:-5, buildTime:1 },
  RECON:     { name:'Recon',     move:4, attack:1, health:2, range:1, cost:{iron:3,oil:1}, shape:'star',     canDigIn:false, canBuild:false, canHeal:false, sight:4, soft_attack:2, hard_attack:0, pierce:1, armor:1, defense:0, evasion:15, accuracy:5,  buildTime:1 },
  ANTI_TANK: { name:'Anti-Tank', move:2, attack:1, health:2, range:1, cost:{iron:3,oil:0}, shape:'arrow',    canDigIn:true,  canBuild:false, canHeal:false, sight:2, soft_attack:1, hard_attack:3, pierce:6, armor:1, defense:1, evasion:0,  accuracy:0,  buildTime:2 },
  MORTAR:    { name:'Mortar',    move:2, attack:3, health:2, range:2, cost:{iron:2,oil:0}, shape:'triangle', canDigIn:false, canBuild:false, canHeal:false, sight:2, soft_attack:4, hard_attack:1, pierce:2, armor:1, defense:0, evasion:0,  accuracy:0,  buildTime:2 },
  MEDIC:     { name:'Medic',     move:2, attack:0, health:2, range:0, cost:{iron:2,oil:0}, shape:'cross',    canDigIn:false, canBuild:false, canHeal:true,  sight:2, soft_attack:0, hard_attack:0, pierce:0, armor:1, defense:0, evasion:0,  accuracy:0,  buildTime:1 },
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
  INFANTRY:  'BARRACKS',
  TANK:      'VEHICLE_DEPOT',
  ARTILLERY: 'VEHICLE_DEPOT',
  ENGINEER:  'HQ',
  RECON:     'HQ',
  ANTI_TANK: 'BARRACKS',
  MORTAR:    'BARRACKS',
  MEDIC:     'BARRACKS',
};

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
  HQ:            { name: 'HQ',             ironPerTurn: 3, oilPerTurn: 0, canRecruit: ['ENGINEER','RECON'],                   buildCost: null,               color: 0xffdd00, sight: 0 },
  MINE:          { name: 'Iron Mine',      ironPerTurn: 2, oilPerTurn: 0, canRecruit: [],                                        buildCost: { iron: 4, oil: 0 }, color: 0xaaaaaa, sight: 0 },
  OIL_PUMP:      { name: 'Oil Pump',       ironPerTurn: 0, oilPerTurn: 2, canRecruit: [],                                        buildCost: { iron: 4, oil: 0 }, color: 0x222244, sight: 0 },
  BARRACKS:      { name: 'Barracks',       ironPerTurn: 0, oilPerTurn: 0, canRecruit: ['INFANTRY','ANTI_TANK','MORTAR','MEDIC'], buildCost: { iron: 6, oil: 0 }, color: 0xaa6644, sight: 0 },
  VEHICLE_DEPOT: { name: 'Vehicle Depot',  ironPerTurn: 0, oilPerTurn: 0, canRecruit: ['TANK','ARTILLERY'],                      buildCost: { iron: 8, oil: 2 }, color: 0x557799, sight: 0 },
  BUNKER:        { name: 'Bunker',         ironPerTurn: 0, oilPerTurn: 0, canRecruit: [],                                        buildCost: { iron: 5, oil: 0 }, color: 0x888866, sight: 0 },
  OBS_POST:      { name: 'Obs. Post',      ironPerTurn: 0, oilPerTurn: 0, canRecruit: [],                                        buildCost: { iron: 3, oil: 0 }, color: 0x88aacc, sight: 3 },
  ROAD:          { name: 'Road',           ironPerTurn: 0, oilPerTurn: 0, canRecruit: [],                                        buildCost: { iron: 1, oil: 0 }, color: 0xccbbaa, sight: 0 },
};

export const RESOURCE_TYPES = {
  IRON: { name: 'Iron Deposit', buildingType: 'MINE',     color: 0xbbbbcc },
  OIL:  { name: 'Oil Deposit',  buildingType: 'OIL_PUMP', color: 0x333355 },
};

export const PLAYER_COLORS = { 1: 0x4488ff, 2: 0xff4444 };

export const STARTING_IRON      = 15;
export const STARTING_OIL       = 4;
export const BASE_IRON_PER_TURN = 3;
export const BASE_OIL_PER_TURN  = 0;

let _nextId = 1;

export function createUnit(type, owner, q, r) {
  const def = UNIT_TYPES[type];
  return { id: _nextId++, type, owner, q, r,
    health: def.health, maxHealth: def.health,
    moved: false, attacked: false, dugIn: false, building: false };
}

export function createBuilding(type, owner, q, r) {
  return { id: _nextId++, type, owner, q, r };
}

export function createGameState() {
  const state = {
    turn: 1, phase: 'planning', currentPlayer: 1,
    players: {
      1: { iron: STARTING_IRON, oil: STARTING_OIL, submitted: false },
      2: { iron: STARTING_IRON, oil: STARTING_OIL, submitted: false },
    },
    units: [], buildings: [], resourceHexes: {},
    pendingMoves: {}, pendingAttacks: {}, pendingRecruits: [],
    designs: { 1: [], 2: [] }, // custom unit design registry per player
  };

  // Spawns — close for testing
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

  // HQ + Barracks
  state.buildings.push(createBuilding('HQ',      1, 8,  12));
  state.buildings.push(createBuilding('BARRACKS',1, 7,  12));
  state.buildings.push(createBuilding('HQ',      2, 16, 11));
  state.buildings.push(createBuilding('BARRACKS',2, 17, 11));

  // Resource hexes — iron
  for (const [q, r] of [[12,11],[12,12],[10,13],[11,10],[13,11],[13,14],[9,9],[15,14]]) {
    state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
  }
  // Resource hexes — oil
  for (const [q, r] of [[11,13],[12,9],[14,10],[13,15]]) {
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

// ── Terrain movement ───────────────────────────────────────────────────────
// Wheeled/tracked vehicles that are badly hampered by forest
const HEAVY_UNITS = new Set(['TANK', 'ARTILLERY', 'ANTI_TANK', 'VEHICLE_DEPOT']);

// terrain: 0=plains, 1=forest, 2=mountain
// Heavy vehicles pay 999 to enter forest without a road —
// the min-1-hex guarantee still lets them crawl in 1 hex/turn.
export function getMoveCost(terrainType, hasRoad, unitType = '') {
  if (hasRoad) return 0.5;
  if (terrainType === 1 && HEAVY_UNITS.has(unitType)) return 999;
  return [1, 2, 3][terrainType] ?? 1;
}
export function canEnterTerrain(unitType, terrainType) {
  if (terrainType === 2) return unitType === 'INFANTRY' || unitType === 'ENGINEER'; // mountains: foot only
  return true;
}

// ── Pathfinding (Dijkstra for terrain costs) ───────────────────────────────
export function getReachableHexes(state, unit, terrain, mapSize) {
  const maxMove = UNIT_TYPES[unit.type].move;
  const dist = new Map();
  const queue = [{ q: unit.q, r: unit.r, cost: 0 }];
  dist.set(`${unit.q},${unit.r}`, 0);
  const result = [];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { q, r, cost } = queue.shift();

    for (const [dq, dr] of HEX_NEIGHBORS) {
      const nq = q + dq, nr = r + dr;
      if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
      const ttype = terrain[`${nq},${nr}`] ?? 0;
      const hasRoad = !!roadAt(state, nq, nr);
      if (!canEnterTerrain(unit.type, ttype)) continue;
      const moveCost = getMoveCost(ttype, hasRoad, unit.type);
      // Guarantee minimum 1-hex move: even if terrain is expensive, can always enter
      // the first adjacent passable hex regardless of terrain cost.
      const newCost = cost + moveCost;
      const withinBudget = newCost <= maxMove || (cost === 0 && maxMove >= 1);
      if (!withinBudget) continue;
      const key = `${nq},${nr}`;
      if (dist.has(key) && dist.get(key) <= newCost) continue;
      // Enemy units: can't pass through or end on
      const occupant = unitAt(state, nq, nr);
      if (occupant && occupant.owner !== unit.owner) continue;
      // Friendly units: can pass through but not end on (only block as destination)
      dist.set(key, newCost);
      queue.push({ q: nq, r: nr, cost: newCost });
    }
  }

  // Collect all reachable hexes — exclude any that have a unit on them (can't end there)
  for (const [key] of dist) {
    const [q, r] = key.split(',').map(Number);
    if (q === unit.q && r === unit.r) continue; // skip origin
    const occupant = unitAt(state, q, r);
    if (!occupant || occupant.id === unit.id) result.push({ q, r });
  }
  return result;
}

// Returns hexes occupied by visible enemies — used for "known target" highlighting
export function getAttackableHexes(state, unit, fromQ, fromR) {
  const def = UNIT_TYPES[unit.type];
  return state.units
    .filter(u => u.owner !== unit.owner && hexDistance(fromQ, fromR, u.q, u.r) <= def.range)
    .map(u => ({ q: u.q, r: u.r, targetId: u.id }));
}

// Returns ALL hexes within attack range — for blind fire targeting
export function getAttackRangeHexes(mapSize, unit, fromQ, fromR) {
  const range = UNIT_TYPES[unit.type].range;
  const result = [];
  for (let q = 0; q < mapSize; q++)
    for (let r = 0; r < mapSize; r++)
      if (hexDistance(fromQ, fromR, q, r) >= 1 && hexDistance(fromQ, fromR, q, r) <= range)
        result.push({ q, r });
  return result;
}

// ── Fog of war ─────────────────────────────────────────────────────────────
export function computeFog(state, player, mapSize) {
  const visible = new Set();

  // Sight sources: friendly units + observation posts
  const sources = [
    ...state.units.filter(u => u.owner === player).map(u => ({ q: u.q, r: u.r, sight: UNIT_TYPES[u.type].sight })),
    ...state.buildings.filter(b => b.owner === player && BUILDING_TYPES[b.type].sight > 0)
                      .map(b => ({ q: b.q, r: b.r, sight: BUILDING_TYPES[b.type].sight })),
  ];

  for (const src of sources) {
    const seen = new Set([`${src.q},${src.r}`]);
    const queue = [{ q: src.q, r: src.r, steps: 0 }];
    while (queue.length > 0) {
      const { q, r, steps } = queue.shift();
      visible.add(`${q},${r}`);
      if (steps >= src.sight) continue;
      for (const [dq, dr] of HEX_NEIGHBORS) {
        const nq = q + dq, nr = r + dr;
        if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
        const key = `${nq},${nr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ q: nq, r: nr, steps: steps + 1 });
      }
    }
  }
  return visible;
}

// ── Income ─────────────────────────────────────────────────────────────────
export function calcIncome(state, player) {
  let iron = BASE_IRON_PER_TURN, oil = BASE_OIL_PER_TURN;
  for (const b of state.buildings) {
    if (b.owner !== player) continue;
    const def = BUILDING_TYPES[b.type];
    iron += def.ironPerTurn;
    oil  += def.oilPerTurn;
  }
  return { iron, oil };
}

// ── Recruitment ────────────────────────────────────────────────────────────
// unitType can be a standard type key OR a design id (number)
export function canRecruit(state, player, unitType, buildingId) {
  const b = state.buildings.find(b => b.id === buildingId && b.owner === player);
  if (!b) return { ok: false, reason: 'No building' };

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
  const destinations = {};
  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    if (destinations[key]) { destinations[key] = null; events.push(`Move collision at (${dest.q},${dest.r})`); }
    else destinations[key] = idStr;
  }
  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    if (destinations[key] === idStr) {
      const unit = state.units.find(u => u.id === parseInt(idStr));
      if (unit) { unit.q = dest.q; unit.r = dest.r; unit.dugIn = false;
        events.push(`${UNIT_TYPES[unit.type].name} (P${unit.owner}) → (${dest.q},${dest.r})`); }
    }
  }

  // Phase 2: Attacks (post-move positions) — full GDD combat system
  const damage = {};
  const combatLog = []; // detailed breakdowns for UI

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
        combatLog.push({ type: 'blind_miss', attackerName: aDef?.name, attackerOwner: attacker2?.owner, hex: attack.hex });
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
      combatLog.push({ type: 'miss', attackerName: aDef.name, attackerOwner: attacker.owner, targetName: tDef.name, targetOwner: target.owner });
      continue;
    }

    // Determine if target is armored (armor > 2 = armored)
    const isArmored = tDef.armor > 2;
    const baseAttack = isArmored ? aDef.hard_attack : aDef.soft_attack;

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
    if (ttype === 1) terrainMod = 10; // forest
    if (ttype === 2) terrainMod = 20; // mountain
    score -= terrainMod; // terrain helps defender = hurts attacker score

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
      attackerName: aDef.name, attackerOwner: attacker.owner,
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

  // Phase 2.5: Medic healing (before captures)
  for (const medic of state.units.filter(u => u.type === 'MEDIC')) {
    for (const [dq, dr] of HEX_NEIGHBORS) {
      const target = unitAt(state, medic.q + dq, medic.r + dr);
      if (target && target.owner === medic.owner && target.health < target.maxHealth) {
        target.health = Math.min(target.maxHealth, target.health + 1);
        events.push(`Medic (P${medic.owner}) heals ${UNIT_TYPES[target.type].name}`);
      }
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
    const spawnHex = findFreeAdjacentHex(state, b.q, b.r);
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

  // Phase 5: Income
  for (const player of [1, 2]) {
    const inc = calcIncome(state, player);
    state.players[player].iron += inc.iron;
    state.players[player].oil  += inc.oil;
    events.push(`P${player} +${inc.iron} iron, +${inc.oil} oil`);
  }

  // Reset
  for (const unit of state.units) {
    unit.moved = false; unit.attacked = false; unit.building = false; unit.suppressed = false;
    delete unit._origQ; delete unit._origR; // clear undo anchors
  }
  state.pendingMoves = {}; state.pendingAttacks = {};
  state.players[1].submitted = false; state.players[2].submitted = false;
  state.currentPlayer = 1; state.phase = 'planning'; state.turn++;

  return events;
}

function findFreeAdjacentHex(state, q, r) {
  for (const [dq, dr] of HEX_NEIGHBORS) {
    const nq = q + dq, nr = r + dr;
    if (!unitAt(state, nq, nr) && !buildingAt(state, nq, nr)) return { q: nq, r: nr };
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
