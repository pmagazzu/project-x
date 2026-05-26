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

  const maxUnits = Math.min(56, Math.floor((16 + ms * 0.42) / playerScale));
  const maxCombat = Math.min(42, Math.floor(maxUnits * 0.72));
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
