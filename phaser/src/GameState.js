// GameState.js — Core game state for Attrition prototype
// Phase 1: 2-player hotseat, iron only, 3 unit types, simultaneous turns (we-go)

export const UNIT_TYPES = {
  INFANTRY:  { name: 'Infantry',  move: 2, attack: 2, health: 3, range: 1, cost: 2, shape: 'circle' },
  TANK:      { name: 'Tank',      move: 4, attack: 4, health: 5, range: 1, cost: 6, shape: 'square' },
  ARTILLERY: { name: 'Artillery', move: 1, attack: 5, health: 2, range: 2, cost: 5, shape: 'triangle' },
};

export const PLAYER_COLORS = {
  1: 0x4488ff,  // blue
  2: 0xff4444,  // red
};

export const STARTING_IRON = 20;
export const IRON_PER_TURN = 5;

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

export function createGameState() {
  const state = {
    turn: 1,
    phase: 'planning',   // 'planning' | 'resolution'
    currentPlayer: 1,    // whose planning turn it is (1 or 2)
    players: {
      1: { iron: STARTING_IRON, submitted: false },
      2: { iron: STARTING_IRON, submitted: false },
    },
    units: [],
    pendingMoves: {},    // unitId -> {q, r} — planned moves this turn
    pendingAttacks: {},  // unitId -> targetId — planned attacks this turn
    log: [],
  };

  // Place starting units — Player 1 top-left, Player 2 bottom-right
  state.units.push(createUnit('INFANTRY', 1, 2, 2));
  state.units.push(createUnit('INFANTRY', 1, 3, 2));
  state.units.push(createUnit('TANK',     1, 2, 3));

  state.units.push(createUnit('INFANTRY', 2, 20, 20));
  state.units.push(createUnit('INFANTRY', 2, 21, 20));
  state.units.push(createUnit('TANK',     2, 20, 21));

  return state;
}

/** Get unit at hex (q, r), or null */
export function unitAt(state, q, r) {
  return state.units.find(u => u.q === q && u.r === r) || null;
}

/** Axial hex distance */
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

/** Get all hexes reachable by a unit (BFS, ignores enemies for now) */
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
      // Can't move through enemy units
      const occupant = unitAt(state, nq, nr);
      if (occupant && occupant.owner !== unit.owner) continue;
      // Can't move to hex occupied by friendly (unless it's our starting hex)
      if (occupant && occupant.id !== unit.id) continue;
      visited.set(key, steps + 1);
      queue.push({ q: nq, r: nr, steps: steps + 1 });
    }
  }

  return result;
}

/** Get hexes attackable from a unit's current (or planned) position */
export function getAttackableHexes(state, unit, fromQ, fromR) {
  const def = UNIT_TYPES[unit.type];
  const range = def.range;
  const result = [];

  for (const u of state.units) {
    if (u.owner === unit.owner) continue;
    if (hexDistance(fromQ, fromR, u.q, u.r) <= range) {
      result.push({ q: u.q, r: u.r, targetId: u.id });
    }
  }

  return result;
}

/** Resolve all pending moves and attacks, return a log of events */
export function resolveTurn(state) {
  const events = [];

  // Apply moves (check for collision — if two units move to same hex, neither moves)
  const destinations = {};
  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    if (destinations[key]) {
      // Collision — cancel both
      events.push(`Move collision at (${dest.q},${dest.r}) — both moves cancelled`);
      destinations[key] = null; // mark as cancelled
    } else {
      destinations[key] = idStr;
    }
  }

  for (const [idStr, dest] of Object.entries(state.pendingMoves)) {
    const key = `${dest.q},${dest.r}`;
    if (destinations[key] === idStr) {
      const unit = state.units.find(u => u.id === parseInt(idStr));
      if (unit) {
        unit.q = dest.q;
        unit.r = dest.r;
        events.push(`${UNIT_TYPES[unit.type].name} (P${unit.owner}) moved to (${dest.q},${dest.r})`);
      }
    }
  }

  // Resolve attacks (simultaneous — calculate damage before removing units)
  const damage = {};
  for (const [idStr, targetId] of Object.entries(state.pendingAttacks)) {
    const attacker = state.units.find(u => u.id === parseInt(idStr));
    const target   = state.units.find(u => u.id === targetId);
    if (!attacker || !target) continue;

    const def = UNIT_TYPES[attacker.type];
    // Simple damage: attacker.attack ± 1 random
    const dmg = Math.max(1, def.attack + Math.floor(Math.random() * 3) - 1);
    damage[targetId] = (damage[targetId] || 0) + dmg;
    events.push(`${UNIT_TYPES[attacker.type].name} (P${attacker.owner}) attacks ${UNIT_TYPES[target.type].name} (P${target.owner}) for ${dmg} dmg`);
  }

  for (const [idStr, dmg] of Object.entries(damage)) {
    const target = state.units.find(u => u.id === parseInt(idStr));
    if (target) {
      target.health -= dmg;
      if (target.health <= 0) {
        events.push(`${UNIT_TYPES[target.type].name} (P${target.owner}) destroyed!`);
      }
    }
  }

  // Remove dead units
  state.units = state.units.filter(u => u.health > 0);

  // Reset for next turn
  state.pendingMoves   = {};
  state.pendingAttacks = {};
  state.players[1].submitted = false;
  state.players[2].submitted = false;
  state.currentPlayer = 1;
  state.phase = 'planning';
  state.turn++;

  // Income
  state.players[1].iron += IRON_PER_TURN;
  state.players[2].iron += IRON_PER_TURN;

  return events;
}

/** Check win condition: a player wins if the other has no units */
export function checkWinner(state) {
  const p1Units = state.units.filter(u => u.owner === 1).length;
  const p2Units = state.units.filter(u => u.owner === 2).length;
  if (p1Units === 0) return 2;
  if (p2Units === 0) return 1;
  return null;
}

const HEX_NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]
];
