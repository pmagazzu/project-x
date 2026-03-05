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
  INFANTRY:  { name:'Infantry',  move:2, attack:2, health:3, range:1, cost:{iron:2,oil:0}, shape:'circle',   canDigIn:true,  canBuild:false, canHeal:false, sight:2, soft_attack:3, hard_attack:1, pierce:1, armor:1, defense:1, evasion:0,  accuracy:0  },
  TANK:      { name:'Tank',      move:4, attack:3, health:6, range:1, cost:{iron:4,oil:2}, shape:'square',   canDigIn:false, canBuild:false, canHeal:false, sight:3, soft_attack:2, hard_attack:4, pierce:5, armor:6, defense:2, evasion:5,  accuracy:5  },
  ARTILLERY: { name:'Artillery', move:1, attack:4, health:2, range:2, cost:{iron:3,oil:2}, shape:'triangle', canDigIn:false, canBuild:false, canHeal:false, sight:2, soft_attack:5, hard_attack:3, pierce:3, armor:1, defense:0, evasion:0,  accuracy:5  },
  ENGINEER:  { name:'Engineer',  move:2, attack:1, health:2, range:1, cost:{iron:3,oil:0}, shape:'diamond',  canDigIn:false, canBuild:true,  canHeal:false, sight:2, soft_attack:1, hard_attack:0, pierce:1, armor:1, defense:0, evasion:0,  accuracy:-5 },
  RECON:     { name:'Recon',     move:4, attack:1, health:2, range:1, cost:{iron:3,oil:1}, shape:'star',     canDigIn:false, canBuild:false, canHeal:false, sight:4, soft_attack:2, hard_attack:0, pierce:1, armor:1, defense:0, evasion:15, accuracy:5  },
  ANTI_TANK: { name:'Anti-Tank', move:1, attack:1, health:2, range:1, cost:{iron:3,oil:0}, shape:'arrow',    canDigIn:true,  canBuild:false, canHeal:false, sight:2, soft_attack:1, hard_attack:3, pierce:6, armor:1, defense:1, evasion:0,  accuracy:0  },
  MORTAR:    { name:'Mortar',    move:1, attack:3, health:2, range:2, cost:{iron:2,oil:0}, shape:'triangle', canDigIn:false, canBuild:false, canHeal:false, sight:2, soft_attack:4, hard_attack:1, pierce:2, armor:1, defense:0, evasion:0,  accuracy:0  },
  MEDIC:     { name:'Medic',     move:2, attack:0, health:2, range:0, cost:{iron:2,oil:0}, shape:'cross',    canDigIn:false, canBuild:false, canHeal:true,  sight:2, soft_attack:0, hard_attack:0, pierce:0, armor:1, defense:0, evasion:0,  accuracy:0  },
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
  // Count how many attackers are targeting each unit (flanking bonus)
  const attackerCount = {};
  for (const targetId of Object.values(state.pendingAttacks)) {
    attackerCount[targetId] = (attackerCount[targetId] || 0) + 1;
  }

  for (const [idStr, targetId] of Object.entries(state.pendingAttacks)) {
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
      terrainMod, dugInMod, bunkerMod, flankMod, roll,
      score, tier, dmg, attackerDmg, suppressed,
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
  for (const unit of state.units) { unit.moved = false; unit.attacked = false; unit.building = false; unit.suppressed = false; }
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
