/**
 * AIDoctrine.js — win-first budgets, FFA targeting, local theater pressure.
 * Shared by AIPlayer.js (planning) and AIDesigner.js (closing pressure).
 */

import { UNIT_TYPES, hexDistance } from './GameState.js';

function isCombatUnitType(type) {
  const d = UNIT_TYPES[type] || {};
  return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
}

export function getActivePlayerCount(gs) {
  if (gs?.playerCount) return Math.max(2, Number(gs.playerCount));
  const owners = new Set();
  for (const b of (gs?.buildings || [])) {
    if (b.type === 'HQ' && b.owner) owners.add(Number(b.owner));
  }
  for (const u of (gs?.units || [])) {
    if (u.owner) owners.add(Number(u.owner));
  }
  return Math.max(2, owners.size || 2);
}

export function countPlayerUnits(gs, player, { embarked = false } = {}) {
  return (gs?.units || []).filter(u => Number(u.owner) === Number(player) && !!u.embarked === embarked).length;
}

export function countPlayerCombatUnits(gs, player) {
  return (gs?.units || []).filter(u =>
    Number(u.owner) === Number(player) && !u.embarked && isCombatUnitType(u.type)).length;
}

/** Hard caps to prevent carpet units / browser melt — scales with map & player count. */
export function getAIArmyBudget(gs, player, mapSize = 40, situation = null) {
  const playerCount = getActivePlayerCount(gs);
  const ms = mapSize || gs?._mapSize || 40;
  const turn = gs?.turn || 1;
  const myUnits = countPlayerUnits(gs, player);
  const myCombat = countPlayerCombatUnits(gs, player);
  const pending = (gs?.pendingRecruits || []).filter(r => Number(r.owner) === Number(player)).length;

  const mapScale = ms / 40;
  const playerScale = Math.sqrt(playerCount);

  const maxUnits = Math.min(44, Math.floor((10 + ms * 0.34) / playerScale));
  const maxCombat = Math.min(34, Math.floor(maxUnits * 0.72));
  const maxSupport = Math.min(10, Math.floor(maxUnits * 0.2));
  const maxEngineers = Math.min(4, 2 + Math.floor(turn / 18));
  const maxRecruitsPerTurn = playerCount >= 5 ? 1 : (playerCount >= 3 ? 2 : 3);
  const maxBarracks = situation?.vpMode ? Math.min(2, 1 + Math.floor(mapScale)) : Math.min(3, 2);
  const maxRoads = situation?.vpMode
    ? Math.min(22, 4 + Math.floor(ms * 0.28))
    : Math.min(36, 6 + Math.floor(ms * 0.38));

  return {
    playerCount,
    maxUnits,
    maxCombat,
    maxSupport,
    maxEngineers,
    maxRecruitsPerTurn,
    maxBarracks,
    maxRoads,
    myUnits,
    myCombat,
    pending,
    atUnitCap: myUnits + pending >= maxUnits,
    atCombatCap: myCombat + pending >= maxCombat,
    mapScale,
  };
}

/** Best VP to fight for (contested / neutral), not ones we already hold. */
export function pickContestedVictoryZone(gs, player) {
  const zones = gs?.victoryZones || [];
  if (!zones.length) return null;
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  let best = null;
  let bestScore = -Infinity;
  for (const z of zones) {
    const occupants = gs.units.filter(u => !u.embarked && hexDistance(u.q, u.r, z.q, z.r) <= 1);
    const myCount = occupants.filter(u => Number(u.owner) === Number(player)).length;
    const enemyCount = occupants.filter(u => Number(u.owner) !== Number(player)).length;
    if (myCount >= 2 && myCount > enemyCount) continue;
    const dist = myHQ ? hexDistance(myHQ.q, myHQ.r, z.q, z.r) : 0;
    let score = (z.pointsPerTurn || 1) * 22 - dist * 0.35;
    if (enemyCount > 0) score += 14;
    if (myCount === 0 && enemyCount === 0) score += 10;
    if (myCount > 0 && enemyCount > 0) score += 18;
    if (score > bestScore) { bestScore = score; best = { q: z.q, r: z.r, type: 'victory_zone', score }; }
  }
  return best || { q: zones[0].q, r: zones[0].r, type: 'victory_zone' };
}

/** FFA: pick one enemy theater to prosecute (weak / near / local contact). */
export function pickPrimaryEnemyHQ(gs, player, enemyHQs = []) {
  if (!enemyHQs?.length) return null;
  if (enemyHQs.length === 1) return enemyHQs[0];
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  if (!myHQ) return enemyHQs[0];

  const isCombat = (u) => {
    const d = UNIT_TYPES[u.type] || {};
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  };

  let best = enemyHQs[0];
  let bestScore = -Infinity;
  for (const hq of enemyHQs) {
    const eo = Number(hq.owner);
    const dist = hexDistance(myHQ.q, myHQ.r, hq.q, hq.r);
    const theirCombat = gs.units.filter(u => Number(u.owner) === eo && !u.embarked && isCombat(u)).length;
    const ep = gs.players[eo] || {};
    const econ = (ep.iron || 0) + (ep.oil || 0) * 1.2;

    let localContact = 0;
    for (const u of gs.units) {
      if (Number(u.owner) !== Number(player) && Number(u.owner) !== eo) continue;
      if (u.embarked) continue;
      if (hexDistance(u.q, u.r, hq.q, hq.r) <= 14) localContact += 1;
    }
    for (const u of gs.units) {
      if (Number(u.owner) !== Number(player) || u.embarked || !isCombat(u)) continue;
      if (hexDistance(u.q, u.r, hq.q, hq.r) <= 16) localContact += 2;
    }

    const score = localContact * 9 - dist * 0.22 - theirCombat * 1.4 - econ * 0.04;
    if (score > bestScore) { bestScore = score; best = hq; }
  }
  return best;
}

/** Local theater pressure (not diluted by off-map enemies in 5p FFA). */
export function getLocalClosingPressure(gs, player, mapSize = 40, focusEnemyOwner = null) {
  const ms = mapSize || gs?._mapSize || 40;
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  const theaterRadius = Math.max(14, Math.floor(ms * 0.38));

  const inTheater = (u) => {
    if (myHQ && hexDistance(u.q, u.r, myHQ.q, myHQ.r) <= theaterRadius) return true;
    if (focusEnemyOwner != null) {
      const eHQ = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(focusEnemyOwner));
      if (eHQ && hexDistance(u.q, u.r, eHQ.q, eHQ.r) <= theaterRadius) return true;
    }
    for (const u2 of gs.units) {
      if (Number(u2.owner) !== Number(player) || u2.embarked) continue;
      const d = UNIT_TYPES[u2.type] || {};
      if (!((d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0)) continue;
      if (hexDistance(u.q, u.r, u2.q, u2.r) <= 10) return true;
    }
    return false;
  };

  const isCombat = (u) => {
    const d = UNIT_TYPES[u.type] || {};
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  };

  const myCombat = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked && isCombat(u) && inTheater(u));
  const enCombat = gs.units.filter(u => Number(u.owner) !== Number(player) && !u.embarked && isCombat(u) && inTheater(u));

  let p = 0;
  if (enCombat.length === 0) {
    p = (gs.turn || 1) >= 20 ? 0.35 : 0.15;
  } else {
    const ratio = myCombat.length / Math.max(1, enCombat.length);
    if (ratio >= 1) p += 0.2;
    if (ratio >= 1.4) p += 0.22;
    if (ratio >= 1.8) p += 0.18;
    const adj = enCombat.filter(e => myCombat.some(m => hexDistance(m.q, m.r, e.q, e.r) <= 5)).length;
    if (adj >= 2) p += 0.2;
    if (adj >= 5) p += 0.15;
  }

  if (gs.victoryMode === 'points' && (gs.victoryZones || []).length) {
    const vp = pickContestedVictoryZone(gs, player);
    if (vp && myHQ) {
      const dVp = hexDistance(myHQ.q, myHQ.r, vp.q, vp.r);
      if (dVp <= theaterRadius * 1.2) p += 0.12;
      const nearVp = myCombat.filter(u => hexDistance(u.q, u.r, vp.q, vp.r) <= 8).length;
      if (nearVp >= 2) p += 0.2;
    }
  }

  const turn = gs.turn || 1;
  if (turn >= 16) p += 0.06;
  if (turn >= 26) p += 0.08;

  return Math.min(0.92, p);
}

export function countFriendliesNear(gs, player, q, r, radius = 2) {
  return gs.units.filter(u =>
    Number(u.owner) === Number(player) && !u.embarked && u.q !== q && u.r !== r
    && hexDistance(q, r, u.q, u.r) <= radius).length;
}

const _CHOKE_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const _isPassableLand = (t) => t !== 4 && t !== 5 && t !== 2;

export function buildLandmassIndex(terrain, mapSize) {
  const visited = new Set();
  const bodies = [];
  const tileToBody = new Map();

  for (let q = 0; q < mapSize; q++) {
    for (let r = 0; r < mapSize; r++) {
      const key = `${q},${r}`;
      if (!_isPassableLand(terrain?.[key] ?? 0) || visited.has(key)) continue;

      let size = 0;
      const coastal = [];
      const queue = [key];
      visited.add(key);

      while (queue.length) {
        const k = queue.shift();
        tileToBody.set(k, bodies.length);
        size += 1;
        const [tq, tr] = k.split(',').map(Number);
        let nearWater = false;
        for (const [dq, dr] of _CHOKE_DIRS) {
          const nq = tq + dq, nr = tr + dr;
          if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) { nearWater = true; continue; }
          const nt = terrain?.[`${nq},${nr}`] ?? 0;
          if (nt === 4 || nt === 5) nearWater = true;
          else if (_isPassableLand(nt)) {
            const nk = `${nq},${nr}`;
            if (!visited.has(nk)) { visited.add(nk); queue.push(nk); }
          }
        }
        if (nearWater) coastal.push({ q: tq, r: tr });
      }
      bodies.push({ id: bodies.length, size, coastal });
    }
  }

  const getBodyId = (q, r) => tileToBody.get(`${q},${r}`) ?? -1;
  return { bodies, getBodyId, majorCount: bodies.filter(b => b.size >= 8).length };
}

/** Cached per game state — landmass flood-fill is expensive on large maps. */
export function getLandmassIndex(gs, terrain, mapSize) {
  const ms = mapSize || gs?._mapSize || 40;
  if (gs?._cachedLandmassIndex && gs._cachedLandmassMapSize === ms) {
    return gs._cachedLandmassIndex;
  }
  const index = buildLandmassIndex(terrain, ms);
  if (gs) {
    gs._cachedLandmassIndex = index;
    gs._cachedLandmassMapSize = ms;
  }
  return index;
}

export function getPlayerHomeLandmassId(gs, player, landmassIndex) {
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  if (myHQ) return landmassIndex.getBodyId(myHQ.q, myHQ.r);
  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(player)) continue;
    const id = landmassIndex.getBodyId(b.q, b.r);
    if (id >= 0) return id;
  }
  return -1;
}

/** Phase 2: landmass theaters (replaces N/S/C lanes when multi-theater or FFA). */
export function buildTheaterIntel(terrain, mapSize, gs, player, situation = null) {
  const landmassIndex = getLandmassIndex(gs, terrain, mapSize);
  const homeId = getPlayerHomeLandmassId(gs, player, landmassIndex);
  const theaters = [];

  // Bucket resource hexes by landmass once (avoid O(bodies × allResources) scans).
  const resourcesByMass = new Map();
  for (const [k, v] of Object.entries(gs.resourceHexes || {})) {
    const [rq, rr] = k.split(',').map(Number);
    const bid = landmassIndex.getBodyId(rq, rr);
    if (bid < 0) continue;
    let list = resourcesByMass.get(bid);
    if (!list) { list = []; resourcesByMass.set(bid, list); }
    if (list.length >= 24) continue;
    const owned = gs.buildings.some(b => b.q === rq && b.r === rr
      && ['MINE', 'OIL_PUMP'].includes(b.type) && Number(b.owner) === Number(player));
    if (!owned) list.push({ q: rq, r: rr, type: v?.type || 'IRON' });
  }

  for (const body of landmassIndex.bodies) {
    if (body.size < 6) continue;
    let myUnits = 0, enemyUnits = 0, myBuildings = 0;
    const resources = resourcesByMass.get(body.id) || [];
    const vpZones = [];
    for (const z of (gs.victoryZones || [])) {
      if (landmassIndex.getBodyId(z.q, z.r) === body.id) vpZones.push(z);
    }
    for (const u of gs.units) {
      if (u.embarked) continue;
      if (landmassIndex.getBodyId(u.q, u.r) !== body.id) continue;
      if (Number(u.owner) === Number(player)) myUnits += 1;
      else enemyUnits += 1;
    }
    for (const b of gs.buildings) {
      if (landmassIndex.getBodyId(b.q, b.r) !== body.id) continue;
      if (Number(b.owner) === Number(player)) myBuildings += 1;
    }

    theaters.push({
      id: body.id,
      size: body.size,
      isHome: body.id === homeId,
      myUnits, enemyUnits, myBuildings,
      resources, vpZones,
      coastal: body.coastal.slice(0, 12),
    });
  }

  const useTheaterMode = situation?.ffaMode || situation?.islandMap
    || landmassIndex.majorCount >= 2
    || theaters.filter(t => !t.isHome && (t.vpZones.length || t.resources.length)).length >= 1;

  let primaryTheater = theaters.find(t => t.isHome) || theaters[0];
  let primaryObjective = null;
  let bestObjScore = -Infinity;

  const myHQ = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  const focusEnemy = pickPrimaryEnemyHQ(gs, player,
    gs.buildings.filter(b => b.type === 'HQ' && Number(b.owner) !== Number(player)));

  for (const t of theaters) {
    if (t.isHome) continue;
    let tScore = t.vpZones.length * 14 + t.resources.length * 5 + t.enemyUnits * 2;
    if (situation?.vpMode && t.vpZones.length) tScore += 20;
    if (focusEnemy && myHQ) {
      const onEnemyMass = landmassIndex.getBodyId(focusEnemy.q, focusEnemy.r) === t.id;
      if (onEnemyMass) tScore += 24;
    }
    if (tScore > bestObjScore) {
      bestObjScore = tScore;
      primaryTheater = t;
    }
  }

  if (situation?.vpMode && primaryTheater?.vpZones?.length) {
    const vp = pickContestedVictoryZone(gs, player);
    if (vp && landmassIndex.getBodyId(vp.q, vp.r) === primaryTheater.id) {
      primaryObjective = { ...vp, theaterId: primaryTheater.id };
    }
  }
  if (!primaryObjective && focusEnemy && landmassIndex.getBodyId(focusEnemy.q, focusEnemy.r) === primaryTheater?.id) {
    primaryObjective = { q: focusEnemy.q, r: focusEnemy.r, type: 'enemy_hq', theaterId: primaryTheater.id };
  }
  if (!primaryObjective && primaryTheater?.resources?.length) {
    const res = primaryTheater.resources[0];
    primaryObjective = { q: res.q, r: res.r, type: 'resource', theaterId: primaryTheater.id };
  }
  if (!primaryObjective && primaryTheater?.coastal?.length) {
    const c = primaryTheater.coastal[0];
    primaryObjective = { q: c.q, r: c.r, type: 'beachhead', theaterId: primaryTheater.id };
  }

  return {
    landmassIndex,
    homeLandmassId: homeId,
    theaters,
    useTheaterMode,
    primaryTheaterId: primaryTheater?.id ?? homeId,
    primaryObjective,
  };
}

/** 0–1: urge spending stockpiled resources on army/industry instead of hoarding. */
export function getStockpileSpendPressure(gs, player) {
  const pl = gs.players[player] || {};
  let p = 0;
  if ((pl.iron || 0) >= 24) p += 0.2;
  if ((pl.iron || 0) >= 40) p += 0.24;
  if ((pl.iron || 0) >= 65) p += 0.22;
  if ((pl.iron || 0) >= 90) p += 0.18;
  if ((pl.oil || 0) >= 12) p += 0.14;
  if ((pl.oil || 0) >= 22) p += 0.2;
  if ((pl.oil || 0) >= 40) p += 0.16;
  if ((pl.wood || 0) >= 22) p += 0.1;
  if ((pl.wood || 0) >= 35) p += 0.12;
  if ((pl.components || 0) >= 4) p += 0.18;
  if ((pl.components || 0) >= 8) p += 0.2;
  const turn = gs.turn || 1;
  if (turn >= 12) p += 0.06;
  if (turn >= 20) p += 0.1;
  return Math.min(1, p);
}

/** Per-turn income from mines or oil pumps (rough, for macro heuristics). */
export function estimateExtractorIncome(gs, owner, kind = 'iron') {
  const types = kind === 'oil' ? ['OIL_PUMP'] : ['MINE'];
  let sum = 0;
  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(owner) || b.underConstruction) continue;
    if (!types.includes(b.type)) continue;
    const def = BUILDING_TYPES[b.type] || {};
    sum += kind === 'oil' ? (def.oilPerTurn || 0) : (def.ironPerTurn || 0);
  }
  return sum;
}

/** 0–1: should commit to eliminating focus enemy HQ (final push). */
export function getEndgamePressure(gs, player, mapSize = 40, focusEnemyHQ = null) {
  if (!focusEnemyHQ) return 0;
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  if (!myHQ) return 0;

  const ms = mapSize || gs._mapSize || 40;
  const distHQ = hexDistance(myHQ.q, myHQ.r, focusEnemyHQ.q, focusEnemyHQ.r);
  if (distHQ > ms * 0.65) return 0;

  const isCombat = (u) => {
    const d = UNIT_TYPES[u.type] || {};
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  };
  const eo = Number(focusEnemyHQ.owner);
  const myNear = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked && isCombat(u)
    && hexDistance(u.q, u.r, focusEnemyHQ.q, focusEnemyHQ.r) <= 14).length;
  const enNear = gs.units.filter(u => Number(u.owner) === eo && !u.embarked && isCombat(u)
    && hexDistance(u.q, u.r, focusEnemyHQ.q, focusEnemyHQ.r) <= 10).length;
  const enAtHQ = gs.units.filter(u => Number(u.owner) === eo && !u.embarked
    && hexDistance(u.q, u.r, focusEnemyHQ.q, focusEnemyHQ.r) <= 3).length;

  let p = 0;
  if (myNear >= 2) p += 0.2;
  if (myNear >= enNear + 1) p += 0.25;
  if (myNear >= enNear + 3) p += 0.2;
  if (distHQ <= Math.floor(ms * 0.35)) p += 0.15;
  if (enAtHQ <= 4 && myNear >= 3) p += 0.35;
  if (enNear <= 2 && myNear >= 5) p += 0.3;

  const myPower = countPlayerCombatUnits(gs, player);
  const enPower = gs.units.filter(u => Number(u.owner) === eo && !u.embarked && isCombat(u)).length;
  if (myPower >= enPower * 1.25 && myNear >= 2) p += 0.15;

  if (gs.victoryMode === 'points') {
    const vp = pickContestedVictoryZone(gs, player);
    if (vp && hexDistance(focusEnemyHQ.q, focusEnemyHQ.r, vp.q, vp.r) <= 8) p += 0.1;
  }

  return Math.min(0.96, p);
}
