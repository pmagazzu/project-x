// GameState.js — Core game state for Attrition prototype
// Phase 1: 2-player hotseat, iron only, 3 unit types, simultaneous turns (we-go)

export const UNIT_TYPES = {
  INFANTRY:  { name: 'Infantry',  move: 2, attack: 2, health: 3, range: 1, cost: 2,  shape: 'circle'   },
  TANK:      { name: 'Tank',      move: 4, attack: 3, health: 6, range: 1, cost: 6,  shape: 'square'   },
  ARTILLERY: { name: 'Artillery', move: 1, attack: 4, health: 2, range: 2, cost: 5,  shape: 'triangle' },
};

export const PLAYER_COLORS = {
  1: 0x4488ff,  // blue
  2: 0xff4444,  // red
};

export const BUILDING_TYPES = {
  HQ:   { name: 'HQ',       ironPerTurn: 3, color: 0xffdd00 },
  MINE: { name: 'Iron Mine', ironPerTurn: 2, color: 0xaaaaaa },
};

// Resource hex types
export const RESOURCE_TYPES = {
  IRON: { name: 'Iron Deposit', color: 0xbbbbbb, income: 0 }, // income comes from building on it
};

export const STARTING_IRON = 15;
export const BASE_IRON_PER_TURN = 3;
export const MINE_COST = 4;

let _nextId = 1;

export function createUnit(type, owner, q, r) {
  const def = UNIT_TYPES[type];
  return {
    id: _nextId++,
    type,
    owner,
    q, r,
    health: def.health,
    maxHealth: def.health,
    moved: false,
    attacked: false,
  };
}

export function createBuilding(type, owner, q, r) {
  return { id: _nextId++, type, owner, q, r };
}

export function createGameState() {
  const state = {
    turn: 1,
    phase: 'planning',
    currentPlayer: 1,
    players: {
      1: { iron: STARTING_IRON, submitted: false },
      2: { iron: STARTING_IRON, submitted: false },
    },
    units: [],
    buildings: [],
    resourceHexes: {},   // "q,r" -> { type: 'IRON' }
    pendingMoves: {},
    pendingAttacks: {},
    log: [],
  };

  // ── Spawn units close together for quick combat (~5-6 hexes apart) ─────────
  // Player 1: around (10, 11)
  state.units.push(createUnit('INFANTRY', 1, 9,  11));
  state.units.push(createUnit('INFANTRY', 1, 10, 10));
  state.units.push(createUnit('TANK',     1, 10, 11));

  // Player 2: around (14, 12)
  state.units.push(createUnit('INFANTRY', 2, 15, 12));
  state.units.push(createUnit('INFANTRY', 2, 14, 13));
  state.units.push(createUnit('TANK',     2, 14, 12));

  // ── HQ buildings (behind starting units) ─────────────────────────────────
  state.buildings.push(createBuilding('HQ', 1, 8, 12));
  state.buildings.push(createBuilding('HQ', 2, 16, 11));

  // ── Resource hexes (iron deposits) ───────────────────────────────────────
  const ironSpots = [
    [12, 11], [12, 12],              // center
    [10, 13], [11, 10],              // near P1
    [13, 11], [13, 14],              // near P2
    [9,  9],  [15, 14],              // flanks
  ];
  for (const [q, r] of ironSpots) {
    state.resourceHexes[`${q},${r}`] = { type: 'IRON' };
  }

  return state;
}

/** Get unit at hex (q, r), or null */
export function unitAt(state, q, r) {
  return state.units.find(u => u.q === q && u.r === r) || null;
}

/** Get building at hex (q, r), or null */
export function buildingAt(state, q, r) {
  return state.buildings.find(b => b.q === q && b.r === r) || null;
}

/** Axial hex distance */
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

/** Get all hexes reachable by a unit (BFS) */
export function getReachableHexes(state, unit, mapSize) {
  const def = UNIT_TYPES[unit.type];
  const range = def.move;
  const visited = new Map();
  const queue = [{ q: unit.q, r: unit.r, steps: 0 }];
  visited.set(`${unit.q},${unit.r}`, 0);
  const result = [];

  while (queue.length > 0) {
    const { q, r, steps } = queue.shift();
    if (steps > 0) result.push({ q, r });
    if (steps >= range) continue;

    for (const [dq, dr] of HEX_NEIGHBORS) {
      const nq = q + dq, nr = r + dr;
      if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
      const key = `${nq},${nr}`;
      if (visited.has(key)) continue;
      const occupant = unitAt(state, nq, nr);
      if (occupant && occupant.owner !== unit.owner) continue;
      if (occupant && occupant.id !== unit.id) continue;
      visited.set(key, steps + 1);
      queue.push({ q: nq, r: nr, steps: steps + 1 });
    }
  }
  return result;
}

/** Get hexes attackable from a position */
export function getAttackableHexes(state, unit, fromQ, fromR) {
  const def = UNIT_TYPES[unit.type];
  const result = [];
  for (const u of state.units) {
    if (u.owner === unit.owner) continue;
    if (hexDistance(fromQ, fromR, u.q, u.r) <= def.range) {
      result.push({ q: u.q, r: u.r, targetId: u.id });
    }
  }
  return result;
}

/** Calculate iron income for a player this turn */
export function calcIncome(state, player) {
  let income = BASE_IRON_PER_TURN;
  for (const b of state.buildings) {
    if (b.owner === player) {
      income += BUILDING_TYPES[b.type].ironPerTurn;
    }
  }
  return income;
}

/** Resolve all pending moves and attacks */
export function resolveTurn(state) {
  const events = [];

  // Apply moves (collision check)
  const destinations = {};
  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    if (destinations[key]) {
      destinations[key] = null;
      events.push(`Move collision at (${dest.q},${dest.r}) — cancelled`);
    } else {
      destinations[key] = idStr;
    }
  }
  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    if (destinations[key] === idStr) {
      const unit = state.units.find(u => u.id === parseInt(idStr));
      if (unit) {
        unit.q = dest.q; unit.r = dest.r;
        events.push(`${UNIT_TYPES[unit.type].name} (P${unit.owner}) → (${dest.q},${dest.r})`);
      }
    }
  }

  // Resolve attacks (simultaneous)
  const damage = {};
  for (const [idStr, targetId] of Object.entries(state.pendingAttacks)) {
    const attacker = state.units.find(u => u.id === parseInt(idStr));
    const target   = state.units.find(u => u.id === targetId);
    if (!attacker || !target) continue;
    const def = UNIT_TYPES[attacker.type];
    const dmg = Math.max(1, def.attack + Math.floor(Math.random() * 2) - 1);
    damage[targetId] = (damage[targetId] || 0) + dmg;
    events.push(`${UNIT_TYPES[attacker.type].name} (P${attacker.owner}) hits ${UNIT_TYPES[target.type].name} (P${target.owner}) for ${dmg}`);
  }
  for (const [idStr, dmg] of Object.entries(damage)) {
    const target = state.units.find(u => u.id === parseInt(idStr));
    if (target) {
      target.health -= dmg;
      if (target.health <= 0) events.push(`${UNIT_TYPES[target.type].name} (P${target.owner}) destroyed!`);
    }
  }
  state.units = state.units.filter(u => u.health > 0);

  // Capture buildings: if a unit is on a building owned by the enemy, capture it
  for (const building of state.buildings) {
    const unit = unitAt(state, building.q, building.r);
    if (unit && unit.owner !== building.owner) {
      events.push(`P${unit.owner} captures ${BUILDING_TYPES[building.type].name} at (${building.q},${building.r})!`);
      building.owner = unit.owner;
    }
  }

  // Collect iron income
  for (const player of [1, 2]) {
    const income = calcIncome(state, player);
    state.players[player].iron += income;
    events.push(`P${player} collects ${income} iron (total: ${state.players[player].iron})`);
  }

  // Reset unit flags
  for (const unit of state.units) {
    unit.moved   = false;
    unit.attacked = false;
  }

  // Reset turn
  state.pendingMoves   = {};
  state.pendingAttacks = {};
  state.players[1].submitted = false;
  state.players[2].submitted = false;
  state.currentPlayer = 1;
  state.phase = 'planning';
  state.turn++;

  return events;
}

/** Check win condition */
export function checkWinner(state) {
  const p1 = state.units.filter(u => u.owner === 1).length;
  const p2 = state.units.filter(u => u.owner === 2).length;
  // Also win if enemy HQ captured
  const p1HQ = state.buildings.find(b => b.type === 'HQ' && b.owner === 1);
  const p2HQ = state.buildings.find(b => b.type === 'HQ' && b.owner === 2);
  if (!p2HQ || p2 === 0) return 1;
  if (!p1HQ || p1 === 0) return 2;
  return null;
}

const HEX_NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]
];
