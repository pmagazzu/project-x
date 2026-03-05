// GameState.js — Core game state for Attrition prototype
// Phase 1: 2-player hotseat, iron + oil, 4 unit types, simultaneous turns (we-go)

export const UNIT_TYPES = {
  INFANTRY:   { name: 'Infantry',   move: 2, attack: 2, health: 3, range: 1, cost: { iron: 2, oil: 0 }, shape: 'circle',   canDigIn: true,  canBuild: false, canHeal: false, sight: 2 },
  TANK:       { name: 'Tank',       move: 4, attack: 3, health: 6, range: 1, cost: { iron: 4, oil: 2 }, shape: 'square',   canDigIn: false, canBuild: false, canHeal: false, sight: 3 },
  ARTILLERY:  { name: 'Artillery',  move: 1, attack: 4, health: 2, range: 2, cost: { iron: 3, oil: 2 }, shape: 'triangle', canDigIn: false, canBuild: false, canHeal: false, sight: 2 },
  ENGINEER:   { name: 'Engineer',   move: 2, attack: 1, health: 2, range: 1, cost: { iron: 3, oil: 0 }, shape: 'diamond',  canDigIn: false, canBuild: true,  canHeal: false, sight: 2 },
  RECON:      { name: 'Recon',      move: 4, attack: 1, health: 2, range: 1, cost: { iron: 3, oil: 1 }, shape: 'star',     canDigIn: false, canBuild: false, canHeal: false, sight: 4 },
  ANTI_TANK:  { name: 'Anti-Tank',  move: 1, attack: 1, health: 2, range: 1, cost: { iron: 3, oil: 0 }, shape: 'arrow',    canDigIn: true,  canBuild: false, canHeal: false, sight: 2 },
  MORTAR:     { name: 'Mortar',     move: 1, attack: 3, health: 2, range: 2, cost: { iron: 2, oil: 0 }, shape: 'triangle', canDigIn: false, canBuild: false, canHeal: false, sight: 2 },
  MEDIC:      { name: 'Medic',      move: 2, attack: 0, health: 2, range: 0, cost: { iron: 2, oil: 0 }, shape: 'cross',    canDigIn: false, canBuild: false, canHeal: true,  sight: 2 },
};

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
// terrain: 0=plains, 1=forest, 2=mountain
export function getMoveCost(terrainType, hasRoad) {
  if (hasRoad) return 1;
  return [1, 2, 3][terrainType] ?? 1;
}
export function canEnterTerrain(unitType, terrainType) {
  if (terrainType === 2) return unitType === 'INFANTRY' || unitType === 'ENGINEER';
  return true;
}

// ── Pathfinding (Dijkstra for terrain costs) ───────────────────────────────
export function getReachableHexes(state, unit, terrain, mapSize) {
  const maxMove = UNIT_TYPES[unit.type].move;
  const dist = new Map();
  // Simple priority queue (array sorted by cost — fine for small maps)
  const queue = [{ q: unit.q, r: unit.r, cost: 0 }];
  dist.set(`${unit.q},${unit.r}`, 0);
  const result = [];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { q, r, cost } = queue.shift();
    if (cost > 0) result.push({ q, r });

    for (const [dq, dr] of HEX_NEIGHBORS) {
      const nq = q + dq, nr = r + dr;
      if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
      const ttype = terrain[`${nq},${nr}`] ?? 0;
      if (!canEnterTerrain(unit.type, ttype)) continue;
      const hasRoad = !!roadAt(state, nq, nr);
      const newCost = cost + getMoveCost(ttype, hasRoad);
      if (newCost > maxMove) continue;
      const key = `${nq},${nr}`;
      if (dist.has(key) && dist.get(key) <= newCost) continue;
      const occupant = unitAt(state, nq, nr);
      if (occupant && occupant.owner !== unit.owner) continue;
      if (occupant && occupant.id !== unit.id) continue;
      dist.set(key, newCost);
      queue.push({ q: nq, r: nr, cost: newCost });
    }
  }
  return result;
}

export function getAttackableHexes(state, unit, fromQ, fromR) {
  const def = UNIT_TYPES[unit.type];
  return state.units
    .filter(u => u.owner !== unit.owner && hexDistance(fromQ, fromR, u.q, u.r) <= def.range)
    .map(u => ({ q: u.q, r: u.r, targetId: u.id }));
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
export function canRecruit(state, player, unitType, buildingId) {
  const b = state.buildings.find(b => b.id === buildingId && b.owner === player);
  if (!b) return { ok: false, reason: 'No building' };
  if (!BUILDING_TYPES[b.type].canRecruit.includes(unitType)) return { ok: false, reason: 'Wrong building' };
  const def = UNIT_TYPES[unitType];
  if (state.players[player].iron < def.cost.iron) return { ok: false, reason: 'Not enough iron' };
  if (state.players[player].oil  < def.cost.oil)  return { ok: false, reason: 'Not enough oil' };
  return { ok: true };
}

export function queueRecruit(state, player, unitType, buildingId) {
  const result = canRecruit(state, player, unitType, buildingId);
  if (!result.ok) return result;
  const def = UNIT_TYPES[unitType];
  state.players[player].iron -= def.cost.iron;
  state.players[player].oil  -= def.cost.oil;
  state.pendingRecruits.push({ owner: player, type: unitType, buildingId });
  return { ok: true };
}

// ── Turn resolution ────────────────────────────────────────────────────────
export function resolveTurn(state, terrain) {
  const events = [];

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

  // Phase 2: Attacks (post-move positions)
  const damage = {};
  for (const [idStr, targetId] of Object.entries(state.pendingAttacks)) {
    const attacker = state.units.find(u => u.id === parseInt(idStr));
    const target   = state.units.find(u => u.id === targetId);
    if (!attacker || !target) continue;
    const def  = UNIT_TYPES[attacker.type];
    const dist = hexDistance(attacker.q, attacker.r, target.q, target.r);
    if (dist > def.range) { events.push(`${UNIT_TYPES[attacker.type].name} (P${attacker.owner}) missed — target moved`); continue; }
    let dmg = Math.max(1, def.attack + Math.floor(Math.random() * 2) - 1);
    if (target.dugIn) dmg = Math.max(0, dmg - 1);
    // Bunker: additional -1 damage reduction
    const onBunker = state.buildings.find(b => b.type === 'BUNKER' && b.q === target.q && b.r === target.r && b.owner === target.owner);
    if (onBunker) dmg = Math.max(0, dmg - 2);
    damage[targetId] = (damage[targetId] || 0) + dmg;
    events.push(`${UNIT_TYPES[attacker.type].name} (P${attacker.owner}) hits ${UNIT_TYPES[target.type].name} (P${target.owner}) for ${dmg}${target.dugIn?' (dug in)':''}`);
  }
  for (const [idStr, dmg] of Object.entries(damage)) {
    const t = state.units.find(u => u.id === parseInt(idStr));
    if (t) { t.health -= dmg; if (t.health <= 0) events.push(`${UNIT_TYPES[t.type].name} (P${t.owner}) destroyed!`); }
  }
  state.units = state.units.filter(u => u.health > 0);

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

  // Phase 4: Spawn recruits adjacent to their building
  const toSpawn = [...state.pendingRecruits];
  state.pendingRecruits = [];
  for (const recruit of toSpawn) {
    const b = state.buildings.find(b => b.id === recruit.buildingId);
    if (!b || b.owner !== recruit.owner) continue;
    const spawnHex = findFreeAdjacentHex(state, b.q, b.r);
    if (spawnHex) {
      state.units.push(createUnit(recruit.type, recruit.owner, spawnHex.q, spawnHex.r));
      events.push(`P${recruit.owner} recruits ${UNIT_TYPES[recruit.type].name}`);
    } else {
      events.push(`P${recruit.owner} recruit failed — no space near ${BUILDING_TYPES[b.type].name}`);
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
  for (const unit of state.units) { unit.moved = false; unit.attacked = false; unit.building = false; }
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
