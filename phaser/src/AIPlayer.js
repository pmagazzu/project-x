/**
 * AIPlayer.js — Attrition AI (v2)
 *
 * planAITurn() returns a list of action objects — it does NOT execute them.
 * GameScene._executeAIActions() plays them one by one with visual delays.
 *
 * Strategies
 * ─────────────────────────────────────────────────────────────────────
 *  aggressive : rush enemies, buy heavy offense (infantry, tanks, mortars)
 *  defensive  : retreat toward HQ, dig in, buy anti-tank + artillery
 *  balanced   : default mix (attack if easy, otherwise advance)
 * ─────────────────────────────────────────────────────────────────────
 */

import {
  UNIT_TYPES, BUILDING_TYPES, AIR_UNITS, NAVAL_UNITS,
  MODULES, CHASSIS_BUILDINGS, MAX_DESIGNS_PER_PLAYER,
  designRegistrationCost, computeDesignStats,
  getReachableHexes, getAttackableHexes, hexDistance, buildingAt, roadAt, computeSupply, getRecruitFoodCost,
  ROAD_TYPES,
} from './GameState.js';
import { TECH_TREE } from './ResearchData.js';

// ── Strategy definitions ───────────────────────────────────────────────────

export const AI_STRATEGIES = {
  aggressive: {
    label:         'Aggressive',
    recruitPrio:   ['TANK','INFANTRY','MORTAR','ARTILLERY','ANTI_TANK','SUPPLY_TRUCK','HALFTRACK'],
    navalPrio:     ['SUPPLY_SHIP','DESTROYER','MTB','CRUISER_LT','PATROL_BOAT'],
    airPrio:       ['BIPLANE_FIGHTER','LIGHT_BOMBER','OBS_PLANE'],
    attackBonus:   20,   // extra score for attack-after-move
    captureBonus:  20,   // bonus for moving toward HQ or flag position
    retreatToHQ:   false,
    digInChance:   0,
  },
  defensive: {
    label:         'Defensive',
    recruitPrio:   ['ANTI_TANK','ARTILLERY','INFANTRY','MORTAR','MEDIC','SUPPLY_TRUCK'],
    navalPrio:     ['SUPPLY_SHIP','COASTAL_BATTERY','DESTROYER','PATROL_BOAT'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   0,
    captureBonus:  40,
    retreatToHQ:   true,
    digInChance:   0.5,  // 50% chance to dig in after moving if no target
  },
  balanced: {
    label:         'Balanced',
    recruitPrio:   ['INFANTRY','ANTI_TANK','TANK','ARTILLERY','MORTAR','SUPPLY_TRUCK','HALFTRACK'],
    navalPrio:     ['SUPPLY_SHIP','DESTROYER','PATROL_BOAT','MTB','TRANSPORT_SM'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   10,
    captureBonus:  30,
    retreatToHQ:   false,
    digInChance:   0.2,
  },
  adaptive: {
    label:         'Adaptive',
    recruitPrio:   ['INFANTRY','ANTI_TANK','TANK','ARTILLERY','MORTAR','HALFTRACK','SUPPLY_TRUCK'],
    navalPrio:     ['SUPPLY_SHIP','DESTROYER','PATROL_BOAT','MTB','TRANSPORT_SM'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   12,
    captureBonus:  34,
    retreatToHQ:   false,
    digInChance:   0.25,
  },
};

export function randomStrategy() {
  const keys = Object.keys(AI_STRATEGIES);
  return keys[Math.floor(Math.random() * keys.length)];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function estimateAttackCommitScore(gs, unit, target) {
  const a = UNIT_TYPES[unit.type] || {};
  const d = UNIT_TYPES[target.type] || {};
  const dist = hexDistance(unit.q, unit.r, target.q, target.r);

  const atkBase = (d.armor || 0) > 2 ? (a.hard_attack || 0) : (a.soft_attack || 0);
  const pierceRatio = (a.pierce || 0) < (d.armor || 0) ? ((a.pierce || 0) / Math.max(1, d.armor || 1)) : 1;
  const estOut = Math.max(0, Math.round(atkBase * pierceRatio) - (d.defense || 0));

  const indirect = (unit.type === 'ARTILLERY' || unit.type === 'MORTAR');
  const canRet = !indirect && dist <= (d.range || 1);
  const retBase = ((a.armor || 0) > 2) ? (d.hard_attack || 0) : (d.soft_attack || 0);
  const retPierce = (d.pierce || 0) < (a.armor || 0) ? ((d.pierce || 0) / Math.max(1, a.armor || 1)) : 1;
  const estIn = canRet ? Math.max(0, Math.round(retBase * retPierce) - (a.defense || 0)) : 0;

  const killBonus = estOut >= (target.health || 1) ? 8 : 0;
  const highValue = (target.type === 'ARTILLERY' || target.type === 'MORTAR' || target.type === 'MEDIC') ? 4 : 0;
  return (estOut - estIn) + killBonus + highValue;
}

function chooseBestTarget(gs, unit, attackTargets) {
  let best = null, bestScore = -Infinity;
  const reconCautious = unit.type === 'RECON';
  for (const hex of attackTargets) {
    const target = gs.units.find(u =>
      u.q === hex.q && u.r === hex.r && u.owner !== unit.owner && !u.embarked
    );
    if (!target) continue;
    // Recon should avoid suiciding into line infantry unless it's a high-value/kill shot.
    if (reconCautious) {
      const killShot = (target.health || 0) <= 1;
      const highValue = target.type === 'ARTILLERY' || target.type === 'MORTAR' || target.type === 'MEDIC';
      if (!killShot && !highValue) continue;
    }
    // Prefer almost-dead/high-value targets and good projected trade.
    const dyingBonus  = (target.maxHealth - target.health) * 4;
    const typeBonus   = target.type === 'ARTILLERY' || target.type === 'MORTAR' ? 6 : 0;
    const distPenalty = hexDistance(unit.q, unit.r, target.q, target.r);
    const tradeScore  = estimateAttackCommitScore(gs, unit, target);
    const score = dyingBonus + target.maxHealth - target.health + typeBonus + tradeScore * 1.8 - distPenalty * 0.5;
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}

function getUnitRole(unitType) {
  if (unitType === 'RECON' || unitType === 'MOTORCYCLE') return 'recon';
  if (unitType === 'ARTILLERY' || unitType === 'MORTAR' || unitType === 'SPG') return 'indirect';
  if (unitType === 'MEDIC' || unitType === 'SUPPLY_TRUCK' || unitType === 'SUPPLY_SHIP') return 'support';
  if (unitType === 'TANK' || unitType === 'MEDIUM_TANK' || unitType === 'ARMORED_CAR' || unitType === 'HALFTRACK') return 'assault';
  if (unitType === 'ENGINEER') return 'engineer';
  return 'line';
}

function getOpeningMilestones(gs, player) {
  const turn = gs.turn || 1;
  const myBuildings = gs.buildings.filter(b => b.owner === player && !b.underConstruction);
  const myUnits = gs.units.filter(u => u.owner === player && !u.embarked);

  const count = (types) => myBuildings.filter(b => types.includes(b.type)).length;
  const unitCount = (types) => myUnits.filter(u => types.includes(u.type)).length;

  const counts = {
    roads: count(['ROAD','CONCRETE_ROAD','RAILWAY']),
    mines: count(['MINE']),
    pumps: count(['OIL_PUMP']),
    farms: count(['FARM']),
    lumber: count(['LUMBER_CAMP']),
    labs: count(['SCIENCE_LAB']),
    factories: count(['FACTORY']),
    barracks: count(['BARRACKS','ADV_BARRACKS']),
    supplyTrucks: unitCount(['SUPPLY_TRUCK']),
  };

  const desired = {
    roads: turn <= 3 ? 1 : turn <= 6 ? 2 : turn <= 9 ? 4 : 6,
    mines: turn <= 5 ? 1 : 2,
    pumps: turn <= 6 ? 1 : 2,
    farms: turn <= 6 ? 1 : turn <= 10 ? 2 : 3,
    lumber: turn <= 8 ? 1 : 2,
    labs: turn <= 8 ? 1 : 2,
    factories: turn <= 9 ? 0 : 1,
    barracks: turn <= 7 ? 1 : 2,
    supplyTrucks: turn <= 8 ? 0 : 1,
  };

  return {
    turn,
    counts,
    desired,
    deficits: {
      roads: Math.max(0, desired.roads - counts.roads),
      mines: Math.max(0, desired.mines - counts.mines),
      pumps: Math.max(0, desired.pumps - counts.pumps),
      farms: Math.max(0, desired.farms - counts.farms),
      lumber: Math.max(0, desired.lumber - counts.lumber),
      labs: Math.max(0, desired.labs - counts.labs),
      factories: Math.max(0, desired.factories - counts.factories),
      barracks: Math.max(0, desired.barracks - counts.barracks),
      supplyTrucks: Math.max(0, desired.supplyTrucks - counts.supplyTrucks),
    }
  };
}

function getPhaseWeights(turn = 1) {
  // Multi-objective AI doctrine: supply/econ + recon early, balanced mid, decisive combat late.
  if (turn <= 8) {
    return { economy: 1.35, logistics: 1.45, recon: 1.25, research: 1.1, combat: 0.8, raiding: 0.75 };
  }
  if (turn <= 16) {
    return { economy: 1.15, logistics: 1.25, recon: 1.1, research: 1.2, combat: 1.0, raiding: 1.0 };
  }
  return { economy: 0.95, logistics: 1.05, recon: 0.9, research: 1.05, combat: 1.3, raiding: 1.25 };
}

function getRoadFloor(turn = 1) {
  if (turn <= 5) return 2;
  if (turn <= 10) return 5;
  if (turn <= 15) return 8;
  return 12;
}

function getFrontlineDistanceEstimate(gs, player) {
  const myHQs = gs.buildings.filter(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  const enemyUnits = gs.units.filter(u => Number(u.owner) !== Number(player) && !u.embarked);
  const myCombat = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked)
    .filter(u => {
      const d = UNIT_TYPES[u.type] || {};
      return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
    });
  if (!myHQs.length || !enemyUnits.length || !myCombat.length) return 0;

  const cx = myCombat.reduce((s, u) => s + u.q, 0) / myCombat.length;
  const cy = myCombat.reduce((s, u) => s + u.r, 0) / myCombat.length;
  const nearestEnemy = enemyUnits.reduce((a, b) => hexDistance(cx, cy, a.q, a.r) <= hexDistance(cx, cy, b.q, b.r) ? a : b);
  return Math.min(...myHQs.map(h => hexDistance(h.q, h.r, nearestEnemy.q, nearestEnemy.r)));
}

function getDynamicRoadTarget(gs, player) {
  const base = getRoadFloor(gs.turn || 1);
  const myUnits = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked);
  const unsupplied = myUnits.filter(u => (u.outOfSupply || 0) > 0).length;
  const frontlineDist = getFrontlineDistanceEstimate(gs, player);
  const mapN = Number(gs._mapSize || 40);

  const unitPressure = Math.ceil(myUnits.length / 6);
  const supplyPressure = unsupplied >= 1 ? (1 + Math.ceil(unsupplied / 2)) : 0;
  const spanPressure = Math.ceil(frontlineDist / 6);
  const mapPressure = Math.max(0, Math.ceil((mapN - 40) / 12));
  const cap = Math.max(26, Math.floor(mapN * 0.75));

  return Math.max(base, Math.min(cap, base + unitPressure + supplyPressure + spanPressure + mapPressure));
}

function getLaneForR(r, mapSize) {
  const third = Math.max(1, Math.floor(mapSize / 3));
  if (r < third) return 'north';
  if (r < third * 2) return 'center';
  return 'south';
}

function initEngineerMemory(gs, player) {
  gs._aiEngineerMemory = gs._aiEngineerMemory || {};
  gs._aiEngineerMemory[player] = gs._aiEngineerMemory[player] || {};
  return gs._aiEngineerMemory[player];
}

function pickEngineerTask(gs, player, engineer, strategic, mapSize, claimedTasks) {
  const key = `${engineer.q},${engineer.r}`;
  const hasRoad = !!roadAt(gs, engineer.q, engineer.r);
  const res = gs.resourceHexes?.[key];
  if (res && !gs.buildings.some(b => b.q === engineer.q && b.r === engineer.r && (b.type === 'MINE' || b.type === 'OIL_PUMP') && b.owner === player)) {
    return { type: 'resource', q: engineer.q, r: engineer.r };
  }
  if (!hasRoad) return { type: 'road', q: engineer.q, r: engineer.r };

  // Push toward the most forward corridor objective (furthest from own HQ, not nearest to engineer).
  // This drives engineers east/west toward the enemy rather than clustering near HQ.
  const corridor = strategic?.objectives?.corridor || [];
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && b.owner === player);
  if (corridor.length > 0 && myHQ) {
    const forwardTargets = corridor
      .filter(o => o.type !== 'hq')  // skip own HQ waypoint
      .sort((a, b) => hexDistance(myHQ.q, myHQ.r, b.q, b.r) - hexDistance(myHQ.q, myHQ.r, a.q, a.r));
    // Pick the furthest unclaimed target to deconflict engineers
    for (const t of forwardTargets) {
      const tk = `${t.q},${t.r}`;
      if (!claimedTasks || !claimedTasks.has(tk)) {
        if (claimedTasks) claimedTasks.add(tk);
        return { type: 'corridor', q: t.q, r: t.r };
      }
    }
    // All claimed — still go forward to avoid local clustering
    if (forwardTargets.length > 0) return { type: 'corridor', q: forwardTargets[0].q, r: forwardTargets[0].r };
  }

  const enemyHQ = gs.buildings.filter(b => b.type === 'HQ' && b.owner !== player)[0];
  if (enemyHQ) return { type: 'forward', q: enemyHQ.q, r: enemyHQ.r };
  return { type: 'road', q: engineer.q, r: engineer.r };
}

function summarizeUnsuppliedClusters(gs, player) {
  const units = gs.units.filter(u => u.owner === player && !u.embarked && (u.outOfSupply || 0) > 0);
  const keyOf = (u) => `${u.q},${u.r}`;
  const byKey = new Map(units.map(u => [keyOf(u), u]));
  const seen = new Set();
  const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  const sizes = [];
  for (const u of units) {
    const k = keyOf(u);
    if (seen.has(k)) continue;
    let size = 0;
    const stack = [u];
    while (stack.length) {
      const cur = stack.pop();
      const ck = keyOf(cur);
      if (seen.has(ck)) continue;
      seen.add(ck);
      size += 1;
      for (const [dq, dr] of dirs) {
        const nk = `${cur.q + dq},${cur.r + dr}`;
        const n = byKey.get(nk);
        if (n && !seen.has(nk)) stack.push(n);
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { count: sizes.length, largest: sizes[0] || 0, sizes: sizes.slice(0, 6) };
}

function getFOBChainPoints(gs, player) {
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && b.owner === player);
  const enemyHQ = gs.buildings.find(b => b.type === 'HQ' && b.owner !== player);
  if (!myHQ || !enemyHQ) return [];
  // Depot waypoints at 30%, 55%, and 75% of the HQ-to-HQ corridor
  return [0.30, 0.55, 0.75].map(pct => ({
    q: Math.round(myHQ.q + (enemyHQ.q - myHQ.q) * pct),
    r: Math.round(myHQ.r + (enemyHQ.r - myHQ.r) * pct),
    pct,
  }));
}

function buildStrategicState(gs, player, mapSize, resourceTargets, myCombatUnits, enemyHQs) {
  gs._aiStrategicMemory = gs._aiStrategicMemory || {};
  const prev = gs._aiStrategicMemory[player] || {};

  const roadsNow = gs.buildings.filter(b => b.owner === player && b.type === 'ROAD').length;
  const dynamicRoadTarget = getDynamicRoadTarget(gs, player);
  const roadDeficit = Math.max(0, dynamicRoadTarget - roadsNow);
  const myUnits = gs.units.filter(u => u.owner === player && !u.embarked);
  const unsupplied = myUnits.filter(u => (u.outOfSupply || 0) > 0).length;
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && b.owner === player);

  const laneCenterR = {
    north: Math.max(2, Math.floor(mapSize * 0.18)),
    center: Math.floor(mapSize * 0.5),
    south: Math.min(mapSize - 3, Math.floor(mapSize * 0.82)),
  };

  // --- Phase decision with hysteresis ---
  let desiredPhase = 'expand';
  if ((gs.turn || 1) >= 18) desiredPhase = 'pressure';
  if (roadDeficit >= 4 || unsupplied >= Math.max(3, Math.floor(myUnits.length * 0.25))) desiredPhase = 'stabilize';

  const prevPhase = prev.phase || 'expand';
  const prevPhaseTurns = prev.phaseTurns || 0;
  let phase = desiredPhase;
  // Require minimum dwell time unless conditions are severe.
  const severe = roadDeficit >= 4 || unsupplied >= Math.max(4, Math.floor(myUnits.length * 0.33));
  if (!severe && prevPhase !== desiredPhase && prevPhaseTurns < 2) phase = prevPhase;
  const phaseTurns = phase === prevPhase ? (prevPhaseTurns + 1) : 1;

  // --- Lane scoring with stickiness/hysteresis ---
  const laneScore = { north: 0, center: 0, south: 0 };
  for (const t of (resourceTargets || [])) laneScore[getLaneForR(t.r, mapSize)] += (t.type === 'OIL' ? 3.6 : 2.4);
  for (const e of (enemyHQs || [])) laneScore[getLaneForR(e.r, mapSize)] += 4.2;

  // discourage center-only bias early/mid unless pressure phase.
  if ((gs.turn || 1) < 35 && phase !== 'pressure') laneScore.center -= 2.4;

  // stickiness: keep lane if still competitive.
  if (prev.primaryLane) laneScore[prev.primaryLane] += 2.2;
  if (prev.secondaryLane) laneScore[prev.secondaryLane] += 1.0;

  const ranked = Object.entries(laneScore).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let primaryLane = ranked[0] || 'center';
  const secondaryLane = ranked[1] || (primaryLane === 'center' ? 'north' : 'center');

  if (prev.primaryLane && prev.primaryLane !== primaryLane) {
    const prevScore = laneScore[prev.primaryLane] ?? -999;
    const newScore = laneScore[primaryLane] ?? -999;
    if ((newScore - prevScore) < 1.5) primaryLane = prev.primaryLane;
  }

  // --- Corridor objectives (HQ -> resource anchor -> forward anchor) ---
  const laneResources = (resourceTargets || []).filter(t => getLaneForR(t.r, mapSize) === primaryLane);
  const nearestToHQ = (arr) => {
    if (!arr?.length || !myHQ) return null;
    return arr.reduce((a, b) => hexDistance(myHQ.q, myHQ.r, a.q, a.r) <= hexDistance(myHQ.q, myHQ.r, b.q, b.r) ? a : b);
  };
  const resourceAnchor = nearestToHQ(laneResources) || nearestToHQ(resourceTargets || []);

  const laneEnemyHQs = (enemyHQs || []).filter(h => getLaneForR(h.r, mapSize) === primaryLane);
  const targetEnemyHQ = laneEnemyHQs[0] || (enemyHQs || [])[0] || null;

  let forwardAnchor = null;
  if (targetEnemyHQ && myHQ) {
    // point 70% from HQ toward enemy HQ in primary lane row band
    const fq = Math.round(myHQ.q + (targetEnemyHQ.q - myHQ.q) * 0.7);
    const frRaw = Math.round(myHQ.r + (targetEnemyHQ.r - myHQ.r) * 0.7);
    const fr = Math.round((frRaw + laneCenterR[primaryLane]) / 2);
    forwardAnchor = { q: fq, r: Math.max(1, Math.min(mapSize - 2, fr)) };
  }

  const corridorObjectives = [
    myHQ ? { q: myHQ.q, r: myHQ.r, type: 'hq' } : null,
    resourceAnchor ? { q: resourceAnchor.q, r: resourceAnchor.r, type: 'resource' } : null,
    forwardAnchor ? { q: forwardAnchor.q, r: forwardAnchor.r, type: 'forward' } : null,
    targetEnemyHQ ? { q: targetEnemyHQ.q, r: targetEnemyHQ.r, type: 'enemy_hq' } : null,
  ].filter(Boolean);

  const state = {
    phase,
    phaseTurns,
    primaryLane,
    secondaryLane,
    laneCenters: laneCenterR,
    laneScore,
    metrics: { roadDeficit, unsupplied, roadsNow, dynamicRoadTarget },
    objectives: {
      main: targetEnemyHQ ? { q: targetEnemyHQ.q, r: targetEnemyHQ.r } : null,
      flank: resourceAnchor ? { q: resourceAnchor.q, r: resourceAnchor.r } : null,
      corridor: corridorObjectives,
    },
    turnUpdated: gs.turn || 1,
  };
  gs._aiStrategicMemory[player] = state;
  return state;
}

function scoreRoadUtility(gs, player, q, r) {
  const key = `${q},${r}`;
  const hasRoad = !!roadAt(gs, q, r);
  if (hasRoad) return -999;

  const myHQs = gs.buildings.filter(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  const enemyHQs = gs.buildings.filter(b => b.type === 'HQ' && Number(b.owner) !== Number(player));
  const myUnits = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked);
  const myCombat = myUnits.filter(u => {
    const d = UNIT_TYPES[u.type] || {};
    return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
  });

  // Resource value: roads to unworked resources are high utility.
  const res = gs.resourceHexes?.[key];
  let resourceScore = 0;
  if (res) {
    const worked = gs.buildings.some(b => b.q === q && b.r === r && (b.type === 'MINE' || b.type === 'OIL_PUMP') && Number(b.owner) === Number(player));
    if (!worked) resourceScore += (res.type === 'OIL' ? 20 : 16);
  }

  // Front utility: closer to combat envelope and enemy HQ avenues.
  let frontScore = 0;
  if (myCombat.length > 0) {
    const dCombat = Math.min(...myCombat.map(u => hexDistance(q, r, u.q, u.r)));
    frontScore += Math.max(0, 10 - dCombat * 1.4);
  }
  if (enemyHQs.length > 0) {
    const dEnemyHQ = Math.min(...enemyHQs.map(h => hexDistance(q, r, h.q, h.r)));
    frontScore += Math.max(0, 8 - dEnemyHQ * 0.45);
  }

  // Network value: prefer extending from existing road graph and HQ outward.
  const roadNeighbors = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]
    .map(([dq,dr]) => roadAt(gs, q + dq, r + dr))
    .filter(Boolean).length;
  let networkScore = roadNeighbors * 7;
  // Reduced HQ proximity bonus — don't reward roads near own HQ as much
  if (myHQs.length > 0) {
    const dHQ = Math.min(...myHQs.map(h => hexDistance(q, r, h.q, h.r)));
    networkScore += Math.max(0, 5 - dHQ * 0.5); // was: 9 - dHQ * 0.7
  }

  // ── Directional corridor bias ─────────────────────────────────────────────
  // Reward hexes that are closer to the enemy HQ than own HQ.
  // Uses enemy proximity (not HQ-relative q direction) so it works for both
  // the left-side and right-side player.
  let corridorBias = 0;
  if (myHQs.length > 0 && enemyHQs.length > 0) {
    const myHQ = myHQs[0];
    const enemyHQ = enemyHQs[0];
    const totalDist = hexDistance(myHQ.q, myHQ.r, enemyHQ.q, enemyHQ.r);
    const dToEnemy = hexDistance(q, r, enemyHQ.q, enemyHQ.r);
    const dFromMyHQ = hexDistance(myHQ.q, myHQ.r, q, r);
    // Progress: 0 at own HQ, 1 at enemy HQ — direction-agnostic
    // Use the ratio of (dist from myHQ) / totalDist, capped at 1
    const progress = totalDist > 0 ? Math.min(1, dFromMyHQ / totalDist) : 0;
    // Proximity bonus: the closer to the enemy, the higher the score
    // This is symmetric and correct for both P1 and P2
    const proximityScore = totalDist > 0 ? Math.max(0, 1 - dToEnemy / totalDist) : 0;
    if (progress > 0.02) {  // apply from very near own HQ so P2 (right-side) benefits too
      corridorBias = proximityScore * 22; // max +22 right at enemy HQ
    }
    // Spread bonus: reward hexes that are off the direct axis (web-like network)
    // Compute lateral deviation from the direct HQ-to-enemy line
    if (myHQ && enemyHQ && totalDist > 0) {
      // Vector from myHQ to enemyHQ
      const axisQ = (enemyHQ.q - myHQ.q) / totalDist;
      const axisR = (enemyHQ.r - myHQ.r) / totalDist;
      // Projection of (q - myHQ) onto axis
      const dq = q - myHQ.q, dr = r - myHQ.r;
      const proj = dq * axisQ + dr * axisR;
      // Lateral distance from axis
      const latQ = dq - proj * axisQ, latR = dr - proj * axisR;
      const lateral = Math.sqrt(latQ * latQ + latR * latR);
      // Only add spread bonus in the forward half of the map
      if (progress > 0.2 && progress < 0.85) {
        const spreadBonus = Math.min(6, lateral * 0.8); // reward up to ~7 hexes off-axis
        corridorBias += spreadBonus;
      }
    }
    // Penalize going behind the current road frontier
    const myRoads = gs.buildings.filter(b => b.owner === player && b.type === 'ROAD');
    if (myRoads.length > 0) {
      const maxProgress = Math.max(...myRoads.map(road => {
        const d = hexDistance(myHQ.q, myHQ.r, road.q, road.r);
        return totalDist > 0 ? d / totalDist : 0;
      }));
      if (progress < maxProgress - 0.15) corridorBias -= 10;
    }
  }

  return resourceScore + frontScore + networkScore + corridorBias;
}

export function getAIKPIReport(gs, player) {
  const opening = getOpeningMilestones(gs, player);
  const roadFloor = getRoadFloor(gs.turn || 1);
  const units = gs.units.filter(u => u.owner === player && !u.embarked);
  const totalUnits = units.length;
  const combatUnits = units.filter(u => {
    const d = UNIT_TYPES[u.type] || {};
    return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
  }).length;
  const engineers = units.filter(u => u.type === 'ENGINEER').length;
  const unsupplied = units.filter(u => (u.outOfSupply || 0) > 0).length;
  const unitClusters = units.map(u => {
    const nearby = units.filter(v => v.id !== u.id && hexDistance(u.q, u.r, v.q, v.r) <= 2).length;
    return nearby;
  });
  const maxCluster = unitClusters.length > 0 ? Math.max(...unitClusters) + 1 : 0;

  const d = opening.deficits;
  const roadDeficit = Math.max(0, roadFloor - opening.counts.roads);
  const macroDeficit = d.roads + d.mines + d.pumps + d.farms + d.labs + d.factories + d.barracks + roadDeficit;

  let health = 'GOOD';
  if (macroDeficit >= 6 || unsupplied >= Math.max(3, Math.floor(totalUnits * 0.3)) || maxCluster >= 10) health = 'POOR';
  else if (macroDeficit >= 3 || unsupplied >= Math.max(2, Math.floor(totalUnits * 0.2)) || maxCluster >= 7) health = 'WARN';

  return {
    turn: opening.turn,
    health,
    counts: opening.counts,
    desired: opening.desired,
    deficits: opening.deficits,
    totals: { totalUnits, combatUnits, engineers, unsupplied, maxCluster, roadDeficit },
    summary: `KPI T${opening.turn} ${health} | roads ${opening.counts.roads}/${roadFloor} (def ${roadDeficit}) mine ${opening.counts.mines}/${opening.desired.mines} oil ${opening.counts.pumps}/${opening.desired.pumps} farm ${opening.counts.farms}/${opening.desired.farms} lab ${opening.counts.labs}/${opening.desired.labs} fac ${opening.counts.factories}/${opening.desired.factories} | units ${combatUnits}/${totalUnits} eng ${engineers} unsup ${unsupplied} cluster ${maxCluster}`
  };
}

function getEnemyThreatAt(gs, owner, q, r) {
  const enemies = gs.units.filter(u => Number(u.owner) !== Number(owner) && !u.embarked);
  let threat = 0;
  for (const e of enemies) {
    const def = UNIT_TYPES[e.type] || {};
    const rng = Math.max(1, def.range || 1);
    const d = hexDistance(q, r, e.q, e.r);
    if (d <= rng) threat += 1;
    if (d <= 1) threat += 2;
  }
  return threat;
}

function scoreMove(gs, terrain, unit, q, r, strat, enemies, myHQs, mySupply, ctx = {}) {
  const cfg = AI_STRATEGIES[strat] ?? AI_STRATEGIES.balanced;
  const role = getUnitRole(unit.type);
  const phase = ctx.phaseWeights || getPhaseWeights(gs.turn || 1);
  let score = 0;

  const nearestEnemy = enemies.length > 0 ? Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r))) : 99;

  // Attack/pressure scoring (de-emphasized for engineers/support)
  if (unit.type !== 'ENGINEER' && role !== 'support') {
    const attackable = getAttackableHexes(gs, unit, q, r, null);
    if (attackable.length > 0) {
      score += ((cfg.attackBonus + 10) + attackable.length * 3) * phase.combat;
      for (const h of attackable) {
        const t = gs.units.find(u => u.q === h.q && u.r === h.r && u.owner !== unit.owner);
        if (t && t.health <= 1) score += 25; // kill-shot bonus
      }
    }

    // Advance toward nearest enemy (or retreat if defensive)
    if (enemies.length > 0) {
      const nearestEnemy = Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r)));
      const currentDist  = Math.min(...enemies.map(e => hexDistance(unit.q, unit.r, e.q, e.r)));
      if (cfg.retreatToHQ) {
        if (nearestEnemy > currentDist) score += cfg.captureBonus;
      } else {
        if (nearestEnemy < currentDist) score += (cfg.attackBonus + 5) * phase.combat;
        score += Math.max(0, 8 - nearestEnemy) * phase.combat;
      }
    }
  }

  // Strategic pressure: progress toward enemy HQs so AI doesn't stall mid-game.
  const enemyHQs = gs.buildings.filter(b => b.type === 'HQ' && b.owner !== unit.owner);
  if (enemyHQs.length > 0 && !cfg.retreatToHQ) {
    const nd = Math.min(...enemyHQs.map(b => hexDistance(q, r, b.q, b.r)));
    const cd = Math.min(...enemyHQs.map(b => hexDistance(unit.q, unit.r, b.q, b.r)));
    if (nd < cd) score += (unit.type === 'ENGINEER' ? 2 : 7);
    // Occasional deception route: allow wider flank pathing instead of pure shortest-line pressure.
    if (ctx.deceptionTurn && role !== 'engineer' && role !== 'support') {
      const nearest = enemyHQs.reduce((a,b) => hexDistance(q,r,a.q,a.r) < hexDistance(q,r,b.q,b.r) ? a : b);
      const lateral = Math.abs((q - nearest.q) - (r - nearest.r));
      score += Math.min(6, lateral * 0.6);
    }
  }

  // Phase 2: task-group objective pressure (main force vs flank force)
  const obj = ctx.unitObjective?.[unit.id];
  if (obj && role !== 'engineer' && role !== 'support') {
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    if (dNew < dCur) score += 18 * phase.combat;  // doubled — make assignments actually stick
    if (dNew <= 4) score += 6 * phase.combat;
    if (dNew <= 1) score += 10 * phase.combat;
  }

  // Strategic lane pressure from persistent planner memory.
  if (ctx.strategic && role !== 'engineer' && role !== 'support') {
    const laneNow = getLaneForR(r, ctx.mapSize || gs._mapSize || 40);
    const laneCur = getLaneForR(unit.r, ctx.mapSize || gs._mapSize || 40);
    if (laneNow === ctx.strategic.primaryLane && laneCur !== ctx.strategic.primaryLane) score += 5 * phase.combat;
    if (laneNow === ctx.strategic.secondaryLane && laneCur !== ctx.strategic.secondaryLane) score += 2.5 * phase.combat;
    if ((ctx.strategic.phase === 'expand' || ctx.strategic.phase === 'stabilize') && laneNow === 'center') score -= 2.5;
  }

  // Phase 5: Lane band pull — reward moving into the r-band of the assigned objective.
  // This is what makes force-split assignments actually execute (assigned → current match).
  const obj5 = ctx.unitObjective?.[unit.id];
  if (obj5 && role !== 'engineer' && role !== 'support') {
    const mapSz = ctx.mapSize || gs._mapSize || 40;
    const assignedLane = getLaneForR(obj5.r, mapSz);
    const unitLane = getLaneForR(r, mapSz);
    const inBand = unitLane === assignedLane;
    // Strongly reward entering the assigned lane r-band, penalize being in wrong lane
    if (inBand && unitLane !== 'center') score += 16 * phase.combat;
    if (!inBand && unitLane === 'center' && assignedLane !== 'center') score -= 6 * phase.combat;
    // Also reward lateral movement toward the assigned lane's r-center
    const laneCenter = ctx.strategic?.laneCenters?.[assignedLane];
    if (laneCenter !== undefined) {
      const latNew = Math.abs(r - laneCenter);
      const latCur = Math.abs(unit.r - laneCenter);
      if (latNew < latCur) score += 5 * phase.combat;
    }
  }

  // Defensive: reward moving toward own HQ
  if (cfg.retreatToHQ && myHQs.length > 0) {
    const nearestHQ  = Math.min(...myHQs.map(b => hexDistance(q, r, b.q, b.r)));
    const curHQDist  = Math.min(...myHQs.map(b => hexDistance(unit.q, unit.r, b.q, b.r)));
    if (nearestHQ < curHQDist) score += cfg.captureBonus;
  }

  // Low-health tactical caution: withdraw fragile units unless they have clear attack value.
  const maxHp = UNIT_TYPES[unit.type]?.health || unit.maxHealth || 1;
  const hpFrac = (unit.health || maxHp) / maxHp;
  if (hpFrac <= 0.4 && enemies.length > 0) {
    const nearestEnemy = Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r)));
    if (nearestEnemy <= 3) score -= 8;
    if (myHQs.length > 0) {
      const nearestHQ = Math.min(...myHQs.map(b => hexDistance(q, r, b.q, b.r)));
      const curHQDist = Math.min(...myHQs.map(b => hexDistance(unit.q, unit.r, b.q, b.r)));
      if (nearestHQ < curHQDist) score += 6;
    }
  }
  // Phase 5: retreat logic — wounded units strongly prefer hexes near supply trucks
  if (hpFrac <= 0.35 && role !== 'support' && role !== 'engineer') {
    const myTrucks = gs.units.filter(u => u.owner === unit.owner && (u.type === 'SUPPLY_TRUCK' || u.type === 'SUPPLY_SHIP') && !u.embarked);
    if (myTrucks.length > 0) {
      const dToTruckNew = Math.min(...myTrucks.map(t => hexDistance(q, r, t.q, t.r)));
      const dToTruckCur = Math.min(...myTrucks.map(t => hexDistance(unit.q, unit.r, t.q, t.r)));
      if (dToTruckNew < dToTruckCur) score += 14; // strong pull toward supply
      if (dToTruckNew <= 1) score += 8;            // bonus for being next to truck (healing/resupply)
    }
    // Wounded = avoid front hex; heavily penalize advancing toward enemy
    if (enemies.length > 0) {
      const nearEnemy = Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r)));
      if (nearEnemy <= 2) score -= 20;
    }
  }

  // Engineer logistics/economy movement bias: move where building value exists.
  if (unit.type === 'ENGINEER' && !unit.constructing) {
    const key = `${q},${r}`;
    const resHex = gs.resourceHexes?.[key];
    const hasRoad = !!roadAt(gs, q, r);
    const hasNonRoadBuilding = !!(buildingAt(gs, q, r) && !hasRoad);
    if (!hasNonRoadBuilding) {
      const ttype = terrain?.[key] ?? 0;
      const me = gs.players[unit.owner] || {};
      const wood = me.wood || 0;
      const food = me.food || 0;
      let buildValue = 0;
      if (resHex?.type === 'IRON') buildValue = 24;
      else if (resHex?.type === 'OIL') buildValue = 22;
      else if ((ttype === 1 || ttype === 7) && wood < 6) buildValue = 11; // lumber potential when wood-tight
      else if ((ttype === 0 || ttype === 6 || ttype === 7) && food < 8) buildValue = 8; // farm potential
      score += buildValue * phase.economy;
      if (!hasRoad && gs.turn >= 3) score += 5 * phase.logistics; // infra bias
      const roadUtility = scoreRoadUtility(gs, unit.owner, q, r);
      if (!hasRoad) score += Math.max(0, roadUtility * 0.45) * phase.logistics;
      if ((ctx.roadDeficit || 0) > 0 && !hasRoad) score += 10 + (ctx.roadDeficit * 2); // soft guardrail while still utility-driven
      if (ctx.roadCaptainId && unit.id === ctx.roadCaptainId && !hasRoad) score += 18 + Math.max(0, roadUtility * 0.35);
      if (q === unit.q && r === unit.r && buildValue > 0) score += 14; // prefer building now vs wandering
    }

    // Strong pull toward nearest unworked strategic resource to keep expansion active.
    const targets = Object.entries(gs.resourceHexes || {}).map(([k, v]) => ({ q: Number(k.split(',')[0]), r: Number(k.split(',')[1]), type: v?.type }));
    const unworked = targets.filter(t => {
      const b = gs.buildings.find(bb => bb.q === t.q && bb.r === t.r && (bb.type === 'MINE' || bb.type === 'OIL_PUMP'));
      return !b || Number(b.owner) !== Number(unit.owner);
    });
    if (unworked.length > 0) {
      const dNew = Math.min(...unworked.map(t => hexDistance(q, r, t.q, t.r)));
      const dCur = Math.min(...unworked.map(t => hexDistance(unit.q, unit.r, t.q, t.r)));
      if (dNew < dCur) score += 14;
    }

    // Road expansion behavior: when behind targets, step off existing roads to extend network.
    if ((ctx.roadDeficit || 0) > 0) {
      const curOnRoad = !!roadAt(gs, unit.q, unit.r);
      const dstOnRoad = !!roadAt(gs, q, r);
      if (curOnRoad && !dstOnRoad) score += 12;
      if (curOnRoad && dstOnRoad && q === unit.q && r === unit.r) score -= 10;
      // Lateral spread nudge: reward hexes slightly off the direct HQ-to-enemy axis
      // This produces a web-like road network instead of a single corridor line
      const myHQForEng = gs.buildings.find(b => b.type === 'HQ' && b.owner === unit.owner);
      const enemyHQForEng = gs.buildings.find(b => b.type === 'HQ' && b.owner !== unit.owner);
      if (myHQForEng && enemyHQForEng) {
        const totalD = hexDistance(myHQForEng.q, myHQForEng.r, enemyHQForEng.q, enemyHQForEng.r);
        if (totalD > 0) {
          const axQ = (enemyHQForEng.q - myHQForEng.q) / totalD;
          const axR = (enemyHQForEng.r - myHQForEng.r) / totalD;
          const dq = q - myHQForEng.q, dr = r - myHQForEng.r;
          const proj = dq * axQ + dr * axR;
          const latQ = dq - proj * axQ, latR = dr - proj * axR;
          const lateral = Math.sqrt(latQ * latQ + latR * latR);
          // Reward 2-6 hexes off-axis to build parallel branches
          if (lateral >= 1.5 && lateral <= 6) score += Math.min(5, lateral * 0.9);
        }
      }
    }
  }

  // Unit-role doctrine improvements
  if (role === 'recon') {
    // Recon should scout/screens, not frontline brawl.
    if (nearestEnemy <= 1) score -= 20;
    if (nearestEnemy >= 2 && nearestEnemy <= 4) score += 10;
    if (nearestEnemy > 6) score -= 4; // too far, not useful spotting
  }
  if (role === 'indirect') {
    // Indirect wants standoff with firing lanes.
    const attackable = getAttackableHexes(gs, unit, q, r, null);
    if (attackable.length > 0) score += 12;
    if (nearestEnemy <= 1) score -= 24;
    if (nearestEnemy >= 2 && nearestEnemy <= 5) score += 6;
  }
  if (role === 'support') {
    // Support stays behind line and near friendlies.
    if (nearestEnemy <= 2) score -= 18;
    const friendlyCombat = gs.units.filter(u => u.owner === unit.owner && u.id !== unit.id && (UNIT_TYPES[u.type]?.attack || 0) > 0);
    if (friendlyCombat.length > 0) {
      const nearFriend = Math.min(...friendlyCombat.map(f => hexDistance(q, r, f.q, f.r)));
      if (nearFriend <= 2) score += 8;
      if (nearFriend > 5) score -= 5;
    }

    // Supply trucks are fragile and should avoid leading pushes.
    if (unit.type === 'SUPPLY_TRUCK') {
      const threat = getEnemyThreatAt(gs, unit.owner, q, r);
      if (threat > 0) score -= 30 + threat * 10;
      if (nearestEnemy <= 4) score -= (5 - nearestEnemy) * 14;
      if (!mySupply?.has?.(`${q},${r}`)) score -= 20;
      if (friendlyCombat.length > 0) {
        const nearFriend = Math.min(...friendlyCombat.map(f => hexDistance(q, r, f.q, f.r)));
        if (nearFriend >= 1 && nearFriend <= 3) score += 10;
      }
    }
  }

  // Map/resource awareness: prefer routes that pressure contested resources.
  if (ctx.resourceTargets?.length) {
    const rd = Math.min(...ctx.resourceTargets.map(t => hexDistance(q, r, t.q, t.r)));
    const curRd = Math.min(...ctx.resourceTargets.map(t => hexDistance(unit.q, unit.r, t.q, t.r)));
    if (rd < curRd) score += (role === 'recon' ? 8 * phase.recon : role === 'assault' ? 6 * phase.combat : 3 * phase.economy);
  }

  // Easier paths: value roads for maneuver units.
  if (roadAt(gs, q, r) && (role === 'assault' || role === 'recon' || role === 'line')) score += 3;

  // Supply awareness: avoid ending out of supply unless near-contact (sneaky/emergency pushes).
  const inSupply = mySupply?.has?.(`${q},${r}`);
  if (!inSupply) {
    const emergencyPush = nearestEnemy <= 2;
    score -= emergencyPush ? (8 * phase.logistics) : (26 * phase.logistics);
    if ((unit.outOfSupply || 0) >= 2) score -= 10 * phase.logistics;
  } else if ((unit.outOfSupply || 0) > 0) {
    // Recovery bias: nudge unsupplied units back onto the network.
    score += 8;
  }

  // Phase 2 anti-blob: penalize over-clustering unless already in close contact.
  if (role !== 'engineer' && role !== 'support') {
    const nearbyFriendlies = gs.units.filter(u => u.owner === unit.owner && u.id !== unit.id && !u.embarked)
      .filter(u => hexDistance(q, r, u.q, u.r) <= 2).length;
    if (nearbyFriendlies >= 5 && nearestEnemy > 3) score -= (nearbyFriendlies - 4) * 3.5;
  }

  // Small random tiebreaker
  score += Math.random() * 2;
  return score;
}

// ── Plan AI turn — returns action list, does NOT execute ──────────────────

export function planAITurn(gs, terrain, mapSize, strategy = 'balanced') {
  const player  = gs.currentPlayer;
  const cfg     = AI_STRATEGIES[strategy] ?? AI_STRATEGIES.balanced;
  const actions = [];

  const getEnemies = () => gs.units.filter(u => u.owner !== player && !u.embarked);
  const getMyHQs   = () => gs.buildings.filter(b => b.owner === player && b.type === 'HQ');
  const mySupply   = computeSupply(gs, player, mapSize);
  const phaseWeights = getPhaseWeights(gs.turn || 1);
  const deceptionTurn = Math.random() < 0.18;
  const resourceTargets = Object.entries(gs.resourceHexes || {})
    .map(([k, v]) => ({ k, q: Number(k.split(',')[0]), r: Number(k.split(',')[1]), type: v?.type }))
    .filter(t => {
      const b = gs.buildings.find(bb => bb.q === t.q && bb.r === t.r && (bb.type === 'MINE' || bb.type === 'OIL_PUMP'));
      return !b || Number(b.owner) !== Number(player);
    })
    .slice(0, 24);

  // Strategic planner + memory-backed task-group objective assignment.
  const enemyHQs = gs.buildings.filter(b => b.type === 'HQ' && b.owner !== player);
  const myCombatUnits = gs.units.filter(u => u.owner === player && !u.embarked)
    .filter(u => {
      const d = UNIT_TYPES[u.type] || {};
      const role = getUnitRole(u.type);
      return role !== 'engineer' && role !== 'support' && ((d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0);
    });
  const strategic = buildStrategicState(gs, player, mapSize, resourceTargets, myCombatUnits, enemyHQs);
  const unitObjective = {};
  if (enemyHQs.length > 0 && myCombatUnits.length >= 6) {
    const centerEnemy = enemyHQs.reduce((a, b) => Math.abs(a.r - strategic.laneCenters.center) <= Math.abs(b.r - strategic.laneCenters.center) ? a : b);
    const laneEnemy = enemyHQs.reduce((a, b) => Math.abs(a.r - strategic.laneCenters[strategic.primaryLane]) <= Math.abs(b.r - strategic.laneCenters[strategic.primaryLane]) ? a : b);

    const mainObj = strategic?.objectives?.main || (strategic.phase === 'pressure' ? laneEnemy : centerEnemy);
    let flankObj = strategic?.objectives?.flank || laneEnemy;
    if (resourceTargets.length > 0) {
      const laneRes = resourceTargets.filter(t => getLaneForR(t.r, mapSize) === strategic.secondaryLane);
      if (laneRes.length > 0) {
        flankObj = laneRes.reduce((a, b) => hexDistance(a.q, a.r, mainObj.q, mainObj.r) >= hexDistance(b.q, b.r, mainObj.q, mainObj.r) ? a : b);
      }
    }

    const sortedCombat = [...myCombatUnits].sort((a, b) => {
      const ra = getUnitRole(a.type), rb = getUnitRole(b.type);
      const pr = (r) => r === 'recon' ? 0 : r === 'assault' ? 1 : r === 'line' ? 2 : r === 'indirect' ? 3 : 4;
      return pr(ra) - pr(rb);
    });

    // Phase 5: exploitation doctrine — if one side has centroid advantage in a lane, reinforce it
    const myCenter = {
      q: myCombatUnits.reduce((s, u) => s + u.q, 0) / Math.max(1, myCombatUnits.length),
      r: myCombatUnits.reduce((s, u) => s + u.r, 0) / Math.max(1, myCombatUnits.length),
    };
    const enemyCenter = {
      q: gs.units.filter(u => u.owner !== player && !u.embarked).reduce((s,u,_,a) => s + u.q/a.length, 0),
      r: gs.units.filter(u => u.owner !== player && !u.embarked).reduce((s,u,_,a) => s + u.r/a.length, 0),
    };
    const myHQPos = gs.buildings.find(b => b.type === 'HQ' && b.owner === player);
    const enemyHQPos = gs.buildings.find(b => b.type === 'HQ' && b.owner !== player);
    // Winning = my centroid is closer to enemy HQ than enemy centroid is to mine
    const winningNow = myHQPos && enemyHQPos && enemyCenter.q != null &&
      hexDistance(myCenter.q, myCenter.r, enemyHQPos.q, enemyHQPos.r) <
      hexDistance(enemyCenter.q, enemyCenter.r, myHQPos.q, myHQPos.r);
    // In pressure phase with advantage: concentrate 65% on main push, 35% on flank containment
    // Otherwise use the standard split
    const phaseFlankShare = winningNow && strategic.phase === 'pressure' ? 0.25 :
      strategic.phase === 'pressure' ? 0.35 :
      strategic.phase === 'stabilize' ? 0.45 : 0.5;
    const flankCount = Math.max(2, Math.floor(sortedCombat.length * phaseFlankShare));
    for (let i = 0; i < sortedCombat.length; i++) {
      const u = sortedCombat[i];
      unitObjective[u.id] = i < flankCount ? { q: flankObj.q, r: flankObj.r } : { q: mainObj.q, r: mainObj.r };
    }
  }

  const opening = getOpeningMilestones(gs, player);
  const roadFloor = getRoadFloor(gs.turn || 1);
  const dynamicRoadTarget = getDynamicRoadTarget(gs, player);
  const roadsNow = gs.buildings.filter(bb => bb.owner === player && bb.type === 'ROAD').length;
  const roadDeficitGlobal = Math.max(0, dynamicRoadTarget - roadsNow);
  const myUnitsNow = gs.units.filter(u => u.owner === player && !u.embarked);
  const unsuppliedNow = myUnitsNow.filter(u => (u.outOfSupply || 0) > 0).length;
  const logisticsPressure = unsuppliedNow >= Math.max(2, Math.floor(myUnitsNow.length * 0.2));
  const logisticsEmergency = unsuppliedNow >= Math.max(3, Math.floor(myUnitsNow.length * 0.3));
  const myEngineersNow = gs.units.filter(u => u.owner === player && !u.embarked && u.type === 'ENGINEER');
  const roadCaptainId = myEngineersNow.length > 0 ? myEngineersNow.sort((a,b) => a.id - b.id)[0].id : null;
  const aiCtx = {
    deceptionTurn, resourceTargets, unitObjective, phaseWeights,
    roadDeficit: roadDeficitGlobal, roadCaptainId,
    logisticsPressure, logisticsEmergency, dynamicRoadTarget,
    strategic,
    mapSize,
  };

  const engineerMemory = initEngineerMemory(gs, player);
  const claimedCorridorTasks = new Set(); // deconflict: each engineer targets a different waypoint

  const aiDebug = {
    strategicPhase: strategic?.phase || null,
    primaryLane: strategic?.primaryLane || null,
    secondaryLane: strategic?.secondaryLane || null,
    laneCenters: strategic?.laneCenters || null,
    roadDeficitGlobal,
    logisticsPressure,
    logisticsEmergency,
    corridorPlan: {
      laneTargets: strategic ? [strategic.primaryLane, strategic.secondaryLane].filter(Boolean) : [],
      objectives: strategic?.objectives?.corridor || [],
      expectedSegments: Math.max(0, Math.floor((dynamicRoadTarget - roadsNow) * 0.8)),
      completedSegments: 0,
    },
    engineerAssignments: { road: 0, fob: 0, resource: 0, reroute: 0, other: 0 },
    engineerTaskLocks: 0,
    engineersStalled: 0,
    recruitMix: { tier0: 0, tier1plus: 0, support: 0, naval: 0, air: 0 },
    forceSplit: { assigned: { north: 0, center: 0, south: 0 }, current: { north: 0, center: 0, south: 0 } },
    centerBiasScore: 0,
    unsuppliedClusters: summarizeUnsuppliedClusters(gs, player),
  };

  // Strategic force-split diagnostics.
  for (const u of myCombatUnits) {
    const curLane = getLaneForR(u.r, mapSize);
    aiDebug.forceSplit.current[curLane] = (aiDebug.forceSplit.current[curLane] || 0) + 1;
    const obj = unitObjective[u.id];
    if (obj) {
      const tgtLane = getLaneForR(obj.r, mapSize);
      aiDebug.forceSplit.assigned[tgtLane] = (aiDebug.forceSplit.assigned[tgtLane] || 0) + 1;
    }
  }
  const totalCombat = Math.max(1, myCombatUnits.length);
  aiDebug.centerBiasScore = Number(((aiDebug.forceSplit.current.center || 0) / totalCombat).toFixed(3));

  // Simulated AI economy spend during planning so we don't overcommit.
  const resSim = {
    iron: gs.players[player].iron || 0,
    oil: gs.players[player].oil || 0,
    wood: gs.players[player].wood || 0,
    food: gs.players[player].food || 0,
    components: gs.players[player].components || 0,
  };
  const canAfford = (cost = {}) =>
    resSim.iron >= (cost.iron || 0) &&
    resSim.oil >= (cost.oil || 0) &&
    resSim.wood >= (cost.wood || 0) &&
    resSim.food >= (cost.food || 0) &&
    resSim.components >= (cost.components || 0);
  const spend = (cost = {}) => {
    resSim.iron -= (cost.iron || 0);
    resSim.oil -= (cost.oil || 0);
    resSim.wood -= (cost.wood || 0);
    resSim.food -= (cost.food || 0);
    resSim.components -= (cost.components || 0);
  };

  // Clone unit list so we can track "virtual" positions for multi-step planning
  // (Simple approach: plan each unit independently with live state)
  let plannedRoadBuilds = 0;

  const unitIds = gs.units
    .filter(u => u.owner === player && !u.embarked)
    .sort((a, b) => {
      // Attack-capable units first
      const aA = getAttackableHexes(gs, a, a.q, a.r, null).length;
      const bA = getAttackableHexes(gs, b, b.q, b.r, null).length;
      return bA - aA;
    })
    .map(u => u.id);

  for (const uid of unitIds) {
    const unit = gs.units.find(u => u.id === uid);
    if (!unit || unit.owner !== player || unit.embarked) continue;
    if (unit.fuel !== undefined && unit.fuel <= 0) continue; // no fuel
    if (unit.constructing) continue; // never abandon active construction
    const unitDef = UNIT_TYPES[unit.type];
    if (!unitDef) continue; // custom/invalid type guard

    // Snapshot original position so we can restore after planning
    unit._aiOrigQ = unit.q; unit._aiOrigR = unit.r;

    // A) Attack from current position
    const unitInSupply = mySupply?.has?.(`${unit.q},${unit.r}`);
    const preMoveTargets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
    const preMoveTarget  = chooseBestTarget(gs, unit, preMoveTargets);
    const preTrade = preMoveTarget ? estimateAttackCommitScore(gs, unit, preMoveTarget) : -999;
    const frontlineCommit = (gs.turn || 1) >= 10 && preMoveTarget && hexDistance(unit.q, unit.r, preMoveTarget.q, preMoveTarget.r) <= 3 && preTrade >= 0;
    // Phase 5: commit threshold — require friendly nearby mass before engaging (anti-suicide-rush)
    const nearbyFriendliesForCommit = gs.units.filter(u => u.owner === unit.owner && u.id !== unit.id && !u.embarked && hexDistance(u.q, u.r, unit.q, unit.r) <= 3).length;
    const hasCommitMass = nearbyFriendliesForCommit >= 2 || (preMoveTarget && (preMoveTarget.health || 99) <= 1);
    const canRiskAttack = (!!unitInSupply && hasCommitMass) || frontlineCommit || (((unit.outOfSupply || 0) < 2 && roadDeficitGlobal < 2) && preMoveTarget && (preMoveTarget.health || 99) <= 1 && hexDistance(unit.q, unit.r, preMoveTarget.q, preMoveTarget.r) <= 1);
    const preThreshold = getUnitRole(unit.type) === 'recon' ? 2 : 0;
    if (preMoveTarget && canRiskAttack && preTrade >= preThreshold) {
      actions.push({
        type:       'attack',
        attackerId: unit.id,
        targetId:   preMoveTarget.id,
        attackerQ:  unit.q, attackerR: unit.r,
        targetQ:    preMoveTarget.q, targetR: preMoveTarget.r,
      });
      // Mark attacked in planning so we don't double-attack
      unit._aiPlannedAttack = true;
    }

    // B) Move toward best destination
    if (!unit.moved) {
      // Engineers: if current hex is high-value build site, hold position to build.
      if (unit.type === 'ENGINEER') {
        const mem = engineerMemory[unit.id] || {};
        const k = `${unit.q},${unit.r}`;
        const hasRoad = !!roadAt(gs, unit.q, unit.r);
        const hasNonRoadBuilding = !!(buildingAt(gs, unit.q, unit.r) && !hasRoad);
        const ttype = terrain?.[k] ?? 0;
        const resHex = gs.resourceHexes?.[k];
        const me = gs.players[player] || {};
        const wood = me.wood || 0;
        const food = me.food || 0;

        // Ensure task-lock memory exists and persists across turns.
        if (!mem.task || (gs.turn - (mem.turnAssigned || 0)) >= 5) {
          mem.task = pickEngineerTask(gs, player, unit, strategic, mapSize, claimedCorridorTasks);
          mem.turnAssigned = gs.turn || 1;
          mem.stallTurns = 0;
        }

        const onTaskTarget = mem.task && unit.q === mem.task.q && unit.r === mem.task.r;
        const goodBuildTile = !hasNonRoadBuilding && (
          resHex?.type === 'IRON' || resHex?.type === 'OIL' ||
          ((ttype === 1 || ttype === 7) && wood < 6) ||
          ((ttype === 0 || ttype === 6 || ttype === 7) && food < 8)
        );
        if (goodBuildTile || onTaskTarget) {
          unit.moved = true; // planning-only hold; restored later
        }

        engineerMemory[unit.id] = mem;
      }

      // Temporarily restore full budget for reachable calc
      const savedMovesLeft = unit.movesLeft;
      unit.movesLeft = unitDef.move ?? unit.movesLeft ?? 1;
      const reachable = unit.moved ? [] : getReachableHexes(gs, unit, terrain, mapSize);
      unit.movesLeft  = savedMovesLeft;

      if (reachable.length > 0) {
        const enemies = getEnemies();
        const myHQs   = getMyHQs();

        let bestDest = null, bestScore = -Infinity;
        for (const hex of reachable) {
          let s = scoreMove(gs, terrain, unit, hex.q, hex.r, strategy, enemies, myHQs, mySupply, aiCtx);
          if (unit.type === 'ENGINEER') {
            const mem = engineerMemory[unit.id];
            const task = mem?.task;
            if (task) {
              const dNew = hexDistance(hex.q, hex.r, task.q, task.r);
              const dCur = hexDistance(unit.q, unit.r, task.q, task.r);
              if (dNew < dCur) s += 38;   // strong forward corridor pull
              if (dNew <= 2) s += 14;
              if (dNew === 0) s += 18;
            }
          }
          if (s > bestScore) { bestScore = s; bestDest = hex; }
        }

        // Last-resort fallback
        if (!bestDest) {
          bestDest = enemies.length > 0
            ? reachable.reduce((a, b) => {
                const ne = enemies.reduce((x,y) => hexDistance(x.q,x.r,unit.q,unit.r) < hexDistance(y.q,y.r,unit.q,unit.r)?x:y);
                return hexDistance(a.q,a.r,ne.q,ne.r) <= hexDistance(b.q,b.r,ne.q,ne.r) ? a : b;
              })
            : reachable[0];
        }

        if (bestDest && (bestDest.q !== unit.q || bestDest.r !== unit.r)) {
          actions.push({
            type:    'move',
            unitId:  unit.id,
            fromQ:   unit.q, fromR: unit.r,
            toQ:     bestDest.q, toR: bestDest.r,
          });
          // Update planning position so attack-after-move uses new coords
          unit.q = bestDest.q; unit.r = bestDest.r;
          unit.moved     = true;
          unit.movesLeft = 0;
        }
      }

      // C) Attack from new position (if didn't already attack)
      if (!unit._aiPlannedAttack) {
        const postMoveTargets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
        const postMoveTarget  = chooseBestTarget(gs, unit, postMoveTargets);
        const postInSupply = mySupply?.has?.(`${unit.q},${unit.r}`);
        const postTrade = postMoveTarget ? estimateAttackCommitScore(gs, unit, postMoveTarget) : -999;
        const frontlineCommitPost = (gs.turn || 1) >= 10 && postMoveTarget && hexDistance(unit.q, unit.r, postMoveTarget.q, postMoveTarget.r) <= 3 && postTrade >= 0;
        // Phase 5: commit threshold for post-move attacks
        const nearbyFriendliesPost = gs.units.filter(u => u.owner === unit.owner && u.id !== unit.id && !u.embarked && hexDistance(u.q, u.r, unit.q, unit.r) <= 3).length;
        const hasCommitMassPost = nearbyFriendliesPost >= 2 || (postMoveTarget && (postMoveTarget.health || 99) <= 1);
        const canRiskPostAttack = (!!postInSupply && hasCommitMassPost) || frontlineCommitPost || (((unit.outOfSupply || 0) < 2 && roadDeficitGlobal < 2) && postMoveTarget && (postMoveTarget.health || 99) <= 1 && hexDistance(unit.q, unit.r, postMoveTarget.q, postMoveTarget.r) <= 1);
        const postThreshold = getUnitRole(unit.type) === 'recon' ? 2 : 0;
        if (postMoveTarget && canRiskPostAttack && postTrade >= postThreshold) {
          actions.push({
            type:       'attack',
            attackerId: unit.id,
            targetId:   postMoveTarget.id,
            attackerQ:  unit.q, attackerR: unit.r,
            targetQ:    postMoveTarget.q, targetR: postMoveTarget.r,
          });
          unit._aiPlannedAttack = true;
        }
      }

      // D) Dig in if defensive and idle
      if (cfg.digInChance > 0 && !unit._aiPlannedAttack && Math.random() < cfg.digInChance) {
        const def = UNIT_TYPES[unit.type];
        if (def?.canDigIn && !unit.dugIn) {
          actions.push({ type: 'digin', unitId: unit.id });
        }
      }

      // E) Engineer infra/economy behavior (balanced resource development)
      if (unit.type === 'ENGINEER' && !unit.constructing) {
        const key = `${unit.q},${unit.r}`;
        const hasRoad = !!roadAt(gs, unit.q, unit.r);
        const hasNonRoadBuilding = !!(buildingAt(gs, unit.q, unit.r) && !hasRoad);
        const resHex = gs.resourceHexes?.[key];
        const ttype = terrain?.[key] ?? 0;

        const maybeBuild = (buildingType) => {
          const cost = BUILDING_TYPES[buildingType]?.buildCost || {};
          // Keep a tiny wood reserve for roads when behind logistics targets.
          if (buildingType !== 'ROAD' && roadDeficitGlobal > 0) {
            const woodAfter = resSim.wood - (cost.wood || 0);
            if (woodAfter < 1) return false;
          }
          if (!canAfford(cost)) return false;
          actions.push({ type: 'build', unitId: unit.id, buildingType });
          if (buildingType === 'ROAD') plannedRoadBuilds += 1;
          spend(cost);
          return true;
        };

        // Always allow ROAD consideration even if a non-road building exists on this tile.
        // Roads are intended to coexist with buildings and form supply corridors.
        const roadsNowForEng = gs.buildings.filter(b => b.owner === player && b.type === 'ROAD').length;
        const roadDeficitForEng = Math.max(0, dynamicRoadTarget - roadsNowForEng);
        if (!hasRoad && gs.turn >= 3) {
          const unsupplied = gs.units.filter(u => u.owner === player && !u.embarked && (u.outOfSupply || 0) > 0).length;
          const roadUtilityHere = scoreRoadUtility(gs, player, unit.q, unit.r);
          const roadScoreNow = (8 - roadsNowForEng * 0.2 + unsupplied * 6.0 + opening.deficits.roads * 5 + roadDeficitForEng * 2 + Math.max(0, roadUtilityHere) * 0.6) * phaseWeights.logistics;
          if ((roadDeficitForEng >= 2 || roadScoreNow >= 18) && maybeBuild('ROAD')) continue;
        }

        if (!hasNonRoadBuilding) {
          // Count existing economy buildings for balance checks
          const myMines  = gs.buildings.filter(b => b.owner === player && b.type === 'MINE').length;
          const myPumps  = gs.buildings.filter(b => b.owner === player && b.type === 'OIL_PUMP').length;
          const myLumber = gs.buildings.filter(b => b.owner === player && b.type === 'LUMBER_CAMP').length;
          const myFarms  = gs.buildings.filter(b => b.owner === player && b.type === 'FARM' && !b.underConstruction).length;
          const myLabs   = gs.buildings.filter(b => b.owner === player && b.type === 'SCIENCE_LAB' && !b.underConstruction).length;
          const myFactories = gs.buildings.filter(b => b.owner === player && b.type === 'FACTORY' && !b.underConstruction).length;
          const myRoads  = gs.buildings.filter(b => b.owner === player && b.type === 'ROAD').length;
          const myAdvBarracks = gs.buildings.filter(b => b.owner === player && b.type === 'ADV_BARRACKS' && !b.underConstruction).length;
          const myArmorWorks = gs.buildings.filter(b => b.owner === player && b.type === 'ARMOR_WORKS' && !b.underConstruction).length;
          const myAdvAirfield = gs.buildings.filter(b => b.owner === player && b.type === 'ADV_AIRFIELD' && !b.underConstruction).length;
          const myNavalDockyard = gs.buildings.filter(b => b.owner === player && b.type === 'NAVAL_DOCKYARD' && !b.underConstruction).length;
          const roadDeficit = Math.max(0, dynamicRoadTarget - myRoads);

          // Utility-first logistics: only hard-force roads when deficit is severe.
          const roadUtilityHere = scoreRoadUtility(gs, player, unit.q, unit.r);
          if (roadDeficit >= 4 && !hasRoad && roadUtilityHere >= 14 && maybeBuild('ROAD')) continue;

          // Macro floor nudges: if we're stockpiling, force missing core econ/tech pieces online.
          const onPlainsMacro = (ttype === 0 || ttype === 6 || ttype === 7);
          if (gs.turn >= 10 && myFarms < 2 && onPlainsMacro && maybeBuild('FARM')) continue;
          if (gs.turn >= 12 && myLabs < 1 && maybeBuild('SCIENCE_LAB')) continue;
          if (gs.turn >= 16 && myFactories < 1 && maybeBuild('FACTORY')) continue;

          // Priority 1: exploit local resources (always do this first)
          const wood = gs.players[player].wood || 0;
          const food = gs.players[player].food || 0;
          const nonWoodEcon = myMines + myPumps + myFarms + myFactories;
          const maxLumber = Math.max(1, Math.min(2, Math.floor((nonWoodEcon + 1) / 3))); // usually 1-2 total camps
          const woodPressure = wood < 5;
          const onPlains = (ttype === 0 || ttype === 6 || ttype === 7);
          const onForest = (ttype === 1 || ttype === 7);

          // Opening hierarchy (turn <= 8): ensure baseline infra/econ comes online.
          if (gs.turn <= 8) {
            if (!hasRoad && maybeBuild('ROAD')) continue;
            if (resHex?.type === 'IRON' && myMines < 1 && maybeBuild('MINE')) continue;
            if (resHex?.type === 'OIL' && myPumps < 1 && maybeBuild('OIL_PUMP')) continue;
            if (onPlains && myFarms < 1 && maybeBuild('FARM')) continue;
            if (onForest && myLumber < 1 && maybeBuild('LUMBER_CAMP')) continue;
          }

          if (resHex?.type === 'OIL') {
            maybeBuild('OIL_PUMP');
          } else if (resHex?.type === 'IRON') {
            maybeBuild('MINE');
          } else if ((ttype === 1 || ttype === 7) && !resHex && myLumber < maxLumber && woodPressure) {
            // only add lumber when wood is actually tight
            maybeBuild('LUMBER_CAMP');
          } else {
            // Priority 2: balanced economy development
            // Determine what the economy is most lacking
            const iron = resSim.iron;
            const oil  = resSim.oil;

            // Build priority scoring — favor the weakest link in economy/opening milestones
            const needs = [];
            const d = opening.deficits;
            // Farms: need food for upkeep, cap at 4
            if (onPlains && myFarms < 4 && food < 10) needs.push({ type: 'FARM', score: ((myFarms < 1 ? 20 : 12) - myFarms * 3 - food * 0.5 + d.farms * 6) * phaseWeights.economy });
            // Lumber: only when wood-starved, hard cap by broader economy size
            if (onForest && !resHex && myLumber < maxLumber && wood < 6) {
              needs.push({ type: 'LUMBER_CAMP', score: ((myLumber < 1 ? 11 : 6) - myLumber * 4 - wood * 0.8 + d.lumber * 4) * phaseWeights.economy });
            }
            // Road: infrastructure, priority rises when units are out of supply.
            const unsupplied = gs.units.filter(u => u.owner === player && !u.embarked && (u.outOfSupply || 0) > 0).length;
            if (!hasRoad && gs.turn >= 3 && myRoads < 20) {
              const roadUtilityHere = scoreRoadUtility(gs, player, unit.q, unit.r);
              needs.push({ type: 'ROAD', score: (8 - myRoads * 0.2 + unsupplied * 6.0 + d.roads * 5 + roadDeficit * 2 + Math.max(0, roadUtilityHere) * 0.5) * phaseWeights.logistics });
            }
            // FOB chain: proactively place supply depots along the HQ→enemy corridor.
            const mySupplyDepots = gs.buildings.filter(bb => bb.owner === player && (bb.type === 'SUPPLY_DEPOT' || bb.type === 'SUPPLY_WAREHOUSE') && !bb.underConstruction).length;
            const frontlineSpan = getFrontlineDistanceEstimate(gs, player);
            const fobPoints = getFOBChainPoints(gs, player);
            // Check if this engineer is near any uncovered FOB waypoint
            const nearFOB = gs.turn >= 8 && fobPoints.some(fob => {
              const dist = hexDistance(unit.q, unit.r, fob.q, fob.r);
              if (dist > 6) return false;
              return !gs.buildings.some(b => b.owner === player &&
                (b.type === 'SUPPLY_DEPOT' || b.type === 'SUPPLY_WAREHOUSE') &&
                hexDistance(b.q, b.r, fob.q, fob.r) <= 4);
            });
            if (nearFOB) {
              const pressure = getEnemies().filter(e => hexDistance(e.q, e.r, unit.q, unit.r) <= 4).length;
              needs.push({ type: 'SUPPLY_DEPOT', score: (20 + pressure * 2.0 + Math.floor(frontlineSpan / 4) - mySupplyDepots * 1.5) * phaseWeights.logistics });
            } else if (gs.turn >= 9 && mySupplyDepots < 4 && (unsupplied >= 3 || roadDeficit >= 3 || frontlineSpan >= 10)) {
              const pressure = getEnemies().filter(e => hexDistance(e.q, e.r, unit.q, unit.r) <= 4).length;
              needs.push({ type: 'SUPPLY_DEPOT', score: (10 + unsupplied * 1.8 + pressure * 2.0 + Math.floor(frontlineSpan / 3) + roadDeficit * 1.2 - mySupplyDepots * 2) * phaseWeights.logistics });
            }
            const warehousesEarly = gs.buildings.filter(bb => bb.owner === player && bb.type === 'SUPPLY_WAREHOUSE' && !bb.underConstruction).length;
            if (gs.turn >= 12 && warehousesEarly < 3 && (unsupplied >= 4 || frontlineSpan >= 12)) {
              needs.push({ type: 'SUPPLY_WAREHOUSE', score: (9 + unsupplied * 1.6 + Math.floor(frontlineSpan / 4) - warehousesEarly * 2) * phaseWeights.logistics });
            }
            // Science Lab: research, cap at 2 — high priority, force by turn 8
            const labUrgency = gs.turn >= 8 && myLabs < 1 ? 30 : gs.turn >= 5 && myLabs < 1 ? 18 : 8;
            if (myLabs < 2 && gs.turn >= 2) needs.push({ type: 'SCIENCE_LAB', score: (labUrgency - myLabs * 4 + d.labs * 6) * phaseWeights.research });
            // Factory: components, cap at 2
            if (myFactories < 2 && gs.turn >= 5) needs.push({ type: 'FACTORY', score: (6 - myFactories * 3 + d.factories * 7) * phaseWeights.economy });

            // Military production baseline: don't stall on only T0 infantry/recon.
            const myBarracks = gs.buildings.filter(bb => bb.owner === player && bb.type === 'BARRACKS' && !bb.underConstruction).length;
            const myVehicleDepot = gs.buildings.filter(bb => bb.owner === player && bb.type === 'VEHICLE_DEPOT' && !bb.underConstruction).length;
            const myAirfield = gs.buildings.filter(bb => bb.owner === player && ['AIRFIELD','ADV_AIRFIELD'].includes(bb.type) && !bb.underConstruction).length;
            const myHarbor = gs.buildings.filter(bb => bb.owner === player && ['HARBOR','NAVAL_YARD','SHIPYARD','DRY_DOCK','NAVAL_BASE'].includes(bb.type) && !bb.underConstruction).length;
            const myBunkers = gs.buildings.filter(bb => bb.owner === player && bb.type === 'BUNKER' && !bb.underConstruction).length;
            const myWarehouses = gs.buildings.filter(bb => bb.owner === player && bb.type === 'SUPPLY_WAREHOUSE' && !bb.underConstruction).length;
            const nearbyEnemies = getEnemies().filter(e => hexDistance(e.q, e.r, unit.q, unit.r) <= 3).length;
            if (gs.turn >= 4 && myBarracks < 2) needs.push({ type: 'BARRACKS', score: (7.5 - myBarracks * 2.5 + d.barracks * 6) * phaseWeights.combat });
            if (gs.turn >= 7 && myVehicleDepot < 1) needs.push({ type: 'VEHICLE_DEPOT', score: 8.2 * phaseWeights.combat });
            if (gs.turn >= 12 && myVehicleDepot < 2) needs.push({ type: 'VEHICLE_DEPOT', score: 6.2 * phaseWeights.combat });
            if (gs.turn >= 10 && myAirfield < 1) needs.push({ type: 'AIRFIELD', score: 7.0 * phaseWeights.combat });
            if (gs.turn >= 10 && myHarbor < 1) needs.push({ type: 'NAVAL_YARD', score: 5.8 * phaseWeights.logistics });
            if ((gs.turn >= 12 && nearbyEnemies >= 2) && myBunkers < 2) needs.push({ type: 'BUNKER', score: (8.4 + nearbyEnemies) * phaseWeights.combat });
            // FOB expansion package: forward logistics + fallback defensive node + extra barracks.
            if (gs.turn >= 18 && (frontlineSpan >= 12 || roadDeficit >= 2)) {
              if (myWarehouses < 3) needs.push({ type: 'SUPPLY_WAREHOUSE', score: (10 + Math.floor(frontlineSpan / 3) + unsupplied * 1.2 - myWarehouses * 2) * phaseWeights.logistics });
              if (myBunkers < 4) needs.push({ type: 'BUNKER', score: (7.5 + Math.floor(frontlineSpan / 5) - myBunkers) * phaseWeights.combat });
              if (myBarracks < 3) needs.push({ type: 'BARRACKS', score: (7.2 + Math.floor(frontlineSpan / 6) - myBarracks) * phaseWeights.combat });
            }

            // Tier-2 production chain: once components economy exists, unlock higher-tier unit buildings.
            const comp = resSim.components || 0;
            const canPushTier2 = gs.turn >= 9 && (myFactories >= 1 || comp >= 3);
            if (canPushTier2) {
              if (myAdvBarracks < 1) needs.push({ type: 'ADV_BARRACKS', score: 8 * phaseWeights.combat });
              if (myArmorWorks < 1)  needs.push({ type: 'ARMOR_WORKS', score: (9.0 + Math.min(3, comp * 0.4)) * phaseWeights.combat });
              if (myAdvAirfield < 1) needs.push({ type: 'ADV_AIRFIELD', score: 7.5 * phaseWeights.combat });
              if (myNavalDockyard < 1 && (gs.buildings.some(bb => bb.owner === player && ['HARBOR','NAVAL_YARD','DRY_DOCK','NAVAL_BASE'].includes(bb.type)))) {
                needs.push({ type: 'NAVAL_DOCKYARD', score: 7.2 * phaseWeights.logistics });
              }
            }
            // Component sink doctrine: if components pile up, prioritize higher-tier war industry.
            if (gs.turn >= 18 && comp >= 6) {
              if (myArmorWorks < 1) needs.push({ type: 'ARMOR_WORKS', score: 11.5 * phaseWeights.combat });
              if (myAdvAirfield < 1) needs.push({ type: 'ADV_AIRFIELD', score: 10.2 * phaseWeights.combat });
            }

            // Sort by score descending and try each
            needs.sort((a, b) => b.score - a.score);
            let built = false;
            for (const n of needs) {
              if (maybeBuild(n.type)) { built = true; break; }
            }
            // Fallback: road if nothing else applies
            if (!built && !hasRoad) maybeBuild('ROAD');
          }
        }
      }
    }

      // Clean up planning markers
    delete unit._aiPlannedAttack;
  }

  // Restore original unit positions after planning.
  // Planning mutated q/r for attack-after-move scoring; execution replays from real positions.
  for (const uid of unitIds) {
    const unit = gs.units.find(u => u.id === uid);
    if (!unit || unit._aiOrigQ === undefined) continue;
    unit.q = unit._aiOrigQ; unit.r = unit._aiOrigR;
    unit.moved     = false;
    unit.movesLeft = UNIT_TYPES[unit.type]?.move ?? (unit.movesLeft || 1);
    delete unit._aiOrigQ; delete unit._aiOrigR;
  }

  // --- Phase 1b: Register simple custom designs (occasionally) ---
  const existingDesigns = gs.designs?.[player] || [];
  const myLabsCount = gs.buildings.filter(b => b.owner === player && b.type === 'SCIENCE_LAB' && !b.underConstruction).length;
  const designChance = Math.min(0.72, (0.22 + myLabsCount * 0.10 + Math.max(0, gs.turn - 6) * 0.01) * phaseWeights.research);
  if (existingDesigns.length < MAX_DESIGNS_PER_PLAYER && gs.turn >= 3 && Math.random() < designChance) {
    // Pick a simple design: chassis + one affordable module
    const AI_DESIGN_RECIPES = [
      { chassis: 'INFANTRY',  modules: ['FIELD_RADIO'],  name: 'Radioman' },
      { chassis: 'INFANTRY',  modules: ['AT_RIFLE'],     name: 'AT Infantry' },
      { chassis: 'TANK',      modules: ['BETTER_ENGINE'], name: 'Fast Tank' },
      { chassis: 'TANK',      modules: ['EXTRA_ARMOR'],  name: 'Heavy Tank' },
      { chassis: 'ARTILLERY', modules: ['LONG_RANGE'],   name: 'Long-Range Art.' },
      { chassis: 'MORTAR',    modules: ['LONG_RANGE'],   name: 'Support Mortar' },
      { chassis: 'RECON',     modules: ['FIELD_RADIO'],  name: 'Recon Net' },
      { chassis: 'ENGINEER',  modules: ['FIELD_RADIO'],  name: 'Signal Engr.' },
    ];
    // Filter to designs we haven't already registered
    const unregistered = AI_DESIGN_RECIPES.filter(r =>
      !existingDesigns.some(d => d.chassis === r.chassis && d.modules.join(',') === r.modules.join(','))
    );
    if (unregistered.length > 0) {
      const pick = unregistered[Math.floor(Math.random() * unregistered.length)];
      const regCost = designRegistrationCost(pick.modules);
      if (canAfford(regCost)) {
        actions.push({ type: 'design', chassis: pick.chassis, modules: pick.modules, name: pick.name });
        spend(regCost);
      }
    }
  }

  // --- Phase 1c: Queue research when labs are online and queue is empty ---
  const pState = gs.players[player] || {};
  pState.research = pState.research || { queue: [], unlocked: [], slots: 1 };
  const resState = pState.research;
  const labsOnline = gs.buildings.filter(b => b.owner === player && b.type === 'SCIENCE_LAB' && !b.underConstruction).length;
  const queueCap = Math.max(1, resState.slots || 1);
  // Phase 5: allow research queuing from turn 3 even without labs (queues for when lab comes online)
  const canQueueResearch = labsOnline > 0 || (gs.turn >= 3 && gs.buildings.some(b => b.owner === player && b.type === 'SCIENCE_LAB' && b.underConstruction));
  if (canQueueResearch && (resState.queue?.length || 0) < queueCap) {
    const techTree = gs._techTree || TECH_TREE || {};
    const unlocked = new Set(resState.unlocked || []);
    const queued = new Set((resState.queue || []).map(q => q.techId));
    const prereqsMet = (tech) => (tech.prereqs || []).every(p => unlocked.has(p));
    const myVehicleDepots = gs.buildings.filter(b => b.owner === player && b.type === 'VEHICLE_DEPOT' && !b.underConstruction).length;
    const myAirfields = gs.buildings.filter(b => b.owner === player && ['AIRFIELD','ADV_AIRFIELD'].includes(b.type) && !b.underConstruction).length;
    const unsupNow = gs.units.filter(u => u.owner === player && !u.embarked && (u.outOfSupply || 0) > 0).length;

    const choices = Object.values(techTree)
      .filter(t => t && t.id && !unlocked.has(t.id) && !queued.has(t.id) && prereqsMet(t));

    if (choices.length > 0) {
      const rank = (t) => {
        let s = 0;
        if (t.branch === 'industrial') s += 9;
        if (t.branch === 'science') s += 5;
        if (t.branch === 'engineering') s += 2 + Math.min(5, unsupNow);
        if (t.branch === 'vehicles') s += myVehicleDepots > 0 ? 7 : 4;
        if (t.branch === 'air') s += myAirfields > 0 ? 7 : 3;
        if (t.kind === 'economy') s += 4;
        if (t.kind === 'research') s += 3;
        s -= (t.tier || 0) * 1.5;
        s -= (t.cost || 0) * 0.08;
        return s;
      };
      choices.sort((a, b) => rank(b) - rank(a));
      actions.push({ type: 'research_queue', techId: choices[0].id });
    }
  }

  // --- Phase 2: Recruit at buildings (non-executing; resolved in GameScene) ---
  const myBuildings = gs.buildings.filter(
    b => b.owner === player && !b.underConstruction && b.type !== 'ROAD'
  );

  // Reuse simulated resource spend from movement/infra planning so recruit decisions are coherent.
  const plannedCount = {};
  for (const u of gs.units.filter(u => u.owner === player && !u.embarked)) {
    plannedCount[u.type] = (plannedCount[u.type] || 0) + 1;
  }

  const VEHICLE_TYPES = new Set(['TANK','MEDIUM_TANK','ARMORED_CAR','HALFTRACK','SPG','ARTILLERY','ANTI_TANK']);
  const INDIRECT_TYPES = new Set(['ARTILLERY','MORTAR','SPG']);
  const SUPPORT_TYPES = new Set(['ENGINEER','SUPPLY_TRUCK','SUPPLY_SHIP','MEDIC']);
  const plannedTotals = () => {
    const total = Object.values(plannedCount).reduce((s, n) => s + n, 0);
    const combat = Object.entries(plannedCount)
      .filter(([t]) => {
        const d = UNIT_TYPES[t] || {};
        return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
      })
      .reduce((s, [, n]) => s + n, 0);
    const vehicles = Object.entries(plannedCount).filter(([t]) => VEHICLE_TYPES.has(t)).reduce((s, [, n]) => s + n, 0);
    const air = Object.entries(plannedCount).filter(([t]) => AIR_UNITS.has(t)).reduce((s, [, n]) => s + n, 0);
    const indirect = Object.entries(plannedCount).filter(([t]) => INDIRECT_TYPES.has(t)).reduce((s, [, n]) => s + n, 0);
    const support = Object.entries(plannedCount).filter(([t]) => SUPPORT_TYPES.has(t)).reduce((s, [, n]) => s + n, 0);
    return { total, combat, vehicles, air, indirect, support };
  };

  // Hard network engineer reserve when road network is behind schedule.
  if (roadDeficitGlobal >= 2) {
    const myEngNow = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked).length;
    const queuedEngNow = actions.filter(a => a.type === 'recruit' && a.unitType === 'ENGINEER').length;
    if ((myEngNow + queuedEngNow) < 3) {
      const eb = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('ENGINEER') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player));
      if (eb) {
        const c = UNIT_TYPES['ENGINEER']?.cost || {};
        const f = getRecruitFoodCost('ENGINEER');
        if (resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
          actions.push({ type: 'recruit', buildingId: eb.id, unitType: 'ENGINEER' });
          resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
          plannedCount['ENGINEER'] = (plannedCount['ENGINEER'] || 0) + 1;
        }
      }
    }
  }

  // Logistics emergency recruit pass (before normal priorities)
  const unsuppliedGroundNow = gs.units.filter(u => u.owner === player && !u.embarked && !NAVAL_UNITS.has(u.type) && (u.outOfSupply || 0) > 0).length;
  const unsuppliedNavalNow = gs.units.filter(u => u.owner === player && !u.embarked && NAVAL_UNITS.has(u.type) && (u.outOfSupply || 0) > 0).length;
  {
    const myTrucksNow = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_TRUCK' && !u.embarked).length;
    const frontlineSpanNow = getFrontlineDistanceEstimate(gs, player);
    const desiredTrucksNow = Math.max(2, Math.min(8, Math.ceil((gs.units.filter(u => u.owner === player && !u.embarked).length) / 14) + Math.floor(frontlineSpanNow / 10) + (unsuppliedGroundNow >= 3 ? 1 : 0)));
    const truckGapNow = Math.max(0, desiredTrucksNow - myTrucksNow);
    if (unsuppliedGroundNow >= 2 || truckGapNow > 0) {
      for (let i = 0; i < Math.min(2, truckGapNow || 1); i++) {
        const b = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('SUPPLY_TRUCK') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player) && !actions.some(a => a.type === 'recruit' && a.buildingId === bb.id));
        if (!b) break;
        const c = UNIT_TYPES['SUPPLY_TRUCK']?.cost || {};
        const f = getRecruitFoodCost('SUPPLY_TRUCK');
        if (resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
          actions.push({ type: 'recruit', buildingId: b.id, unitType: 'SUPPLY_TRUCK' });
          resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
          plannedCount['SUPPLY_TRUCK'] = (plannedCount['SUPPLY_TRUCK'] || 0) + 1;
        }
      }
    }
  }
  if (unsuppliedNavalNow >= 1) {
    const myShipsNow = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_SHIP').length;
    const navalCombatNow = gs.units.filter(u => u.owner === player && NAVAL_UNITS.has(u.type) && u.type !== 'SUPPLY_SHIP').length;
    const shipCapNow = Math.max(1, Math.min(4, Math.ceil(navalCombatNow / 5)));
    if (myShipsNow < shipCapNow) {
      const b = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('SUPPLY_SHIP') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player));
      if (b) {
        const c = UNIT_TYPES['SUPPLY_SHIP']?.cost || {};
        const f = getRecruitFoodCost('SUPPLY_SHIP');
        if (resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
          actions.push({ type: 'recruit', buildingId: b.id, unitType: 'SUPPLY_SHIP' });
          resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
          plannedCount['SUPPLY_SHIP'] = (plannedCount['SUPPLY_SHIP'] || 0) + 1;
        }
      }
    }
  }

  for (const b of myBuildings) {
    const bType = BUILDING_TYPES[b.type];
    if (!bType?.canRecruit?.length) continue;

    const alreadyQueued = gs.pendingRecruits.some(r => r.buildingId === b.id && r.owner === player);
    if (alreadyQueued) continue;

    // Build priority list from strategy, filtered to what this building can recruit
    const isNaval = ['HARBOR','NAVAL_YARD','SHIPYARD','DRYDOCK','DRY_DOCK','NAVAL_BASE','NAVAL_DOCKYARD'].includes(b.type);
    const isAir   = ['AIRFIELD','ADV_AIRFIELD'].includes(b.type);
    const prio    = isNaval ? cfg.navalPrio : isAir ? cfg.airPrio : cfg.recruitPrio;
    const recruitRoleScore = (unitType) => {
      const role = getUnitRole(unitType);
      if (unitType === 'SUPPLY_TRUCK' || unitType === 'SUPPLY_SHIP' || unitType === 'ENGINEER') return 18 * phaseWeights.logistics;
      if (role === 'recon') return 10 * phaseWeights.recon;
      if (role === 'indirect' || role === 'assault' || role === 'line') return 9 * phaseWeights.combat;
      return 0;
    };
    const sorted  = [...bType.canRecruit].sort((a, b2) => {
      const ai = prio.indexOf(a), bi = prio.indexOf(b2);
      const baseDelta = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      const phaseDelta = recruitRoleScore(b2) - recruitRoleScore(a);
      return baseDelta + phaseDelta * 0.1;
    });
    // If components are available, prefer units that actually consume components.
    if ((resSim.components || 0) >= 4) {
      sorted.sort((a, b2) => ((UNIT_TYPES[b2]?.cost?.components || 0) - (UNIT_TYPES[a]?.cost?.components || 0)));
    }

    // Logistics override: when supply is strained, prioritize supply units.
    const unsuppliedGround = gs.units.filter(u => u.owner === player && !u.embarked && !NAVAL_UNITS.has(u.type) && (u.outOfSupply || 0) > 0).length;
    const unsuppliedNaval = gs.units.filter(u => u.owner === player && !u.embarked && NAVAL_UNITS.has(u.type) && (u.outOfSupply || 0) > 0).length;
    if (unsuppliedGround >= 2 && sorted.includes('SUPPLY_TRUCK')) {
      sorted.splice(sorted.indexOf('SUPPLY_TRUCK'), 1);
      sorted.unshift('SUPPLY_TRUCK');
    }
    if (unsuppliedNaval >= 1 && sorted.includes('SUPPLY_SHIP')) {
      sorted.splice(sorted.indexOf('SUPPLY_SHIP'), 1);
      sorted.unshift('SUPPLY_SHIP');
    }
    const hasAdvancedOption = sorted.some(t => (UNIT_TYPES[t]?.tier || 0) >= 1 || !!UNIT_TYPES[t]?.unlockedBy);
    const logisticsCriticalRecruits = new Set(['ENGINEER','SUPPLY_TRUCK','SUPPLY_SHIP']);

    // Opening milestone controller (T1–T12): ensure baseline macro tools come online.
    if (opening.turn <= 12) {
      const enforce = [];
      const roadsNow = gs.buildings.filter(bb => bb.owner === player && bb.type === 'ROAD').length;
      const roadDeficit = Math.max(0, dynamicRoadTarget - roadsNow);
      const macroDeficit = opening.deficits.roads + opening.deficits.mines + opening.deficits.pumps + opening.deficits.farms + opening.deficits.labs + opening.deficits.factories + roadDeficit;
      if (macroDeficit > 0 && sorted.includes('ENGINEER')) enforce.push('ENGINEER');
      if (opening.deficits.supplyTrucks > 0 && sorted.includes('SUPPLY_TRUCK')) enforce.push('SUPPLY_TRUCK');
      if (enforce.length > 0) {
        for (const t of enforce.reverse()) {
          const idx = sorted.indexOf(t);
          if (idx > -1) { sorted.splice(idx, 1); sorted.unshift(t); }
        }
      }
    }

    const buildingCanRecruitAny = (set) => sorted.some(t => set.has(t));
    for (const unitType of sorted) {
      const totals = plannedTotals();
      if (logisticsEmergency && !logisticsCriticalRecruits.has(unitType)) continue;
      if (logisticsPressure && (UNIT_TYPES[unitType]?.cost?.oil || 0) >= 2 && !logisticsCriticalRecruits.has(unitType)) continue;

      // Strategic doctrine gate: during expand/stabilize, suppress tier-0 flood unless logistics-critical.
      const strategicPhase = aiCtx?.strategic?.phase || 'expand';
      const tier = UNIT_TYPES[unitType]?.tier || 0;
      const isCoreTier0 = tier <= 0 && ['INFANTRY','RECON','MOTORCYCLE'].includes(unitType);
      if ((strategicPhase === 'expand' || strategicPhase === 'stabilize') && isCoreTier0 && !logisticsCriticalRecruits.has(unitType)) continue;

      const compStock = resSim.components || 0;
      const desiredVehicleMin = (gs.turn >= 16) ? Math.max(3, Math.floor(totals.combat * (compStock >= 4 ? 0.30 : 0.24))) : 0;
      const desiredAirMin = (gs.turn >= 20) ? Math.max(2, Math.floor(totals.combat * (compStock >= 4 ? 0.18 : 0.14))) : 0;
      const desiredIndirectMin = (gs.turn >= 14) ? Math.max(2, Math.floor(totals.combat * 0.18)) : 0;
      const supportCap = (gs.turn >= 16) ? 0.24 : 0.30;

      // Doctrine quotas: force missing categories online by phase.
      if (desiredVehicleMin > 0 && totals.vehicles < desiredVehicleMin && buildingCanRecruitAny(VEHICLE_TYPES) && !VEHICLE_TYPES.has(unitType)) continue;
      if (desiredAirMin > 0 && totals.air < desiredAirMin && buildingCanRecruitAny(AIR_UNITS) && !AIR_UNITS.has(unitType)) continue;
      if (desiredIndirectMin > 0 && totals.indirect < desiredIndirectMin && buildingCanRecruitAny(INDIRECT_TYPES) && !INDIRECT_TYPES.has(unitType)) continue;
      if ((totals.support / Math.max(1, totals.total)) > supportCap && SUPPORT_TYPES.has(unitType) && unitType !== 'SUPPLY_TRUCK' && unitType !== 'SUPPLY_SHIP') continue;

      // Anti-spam guardrails for support units
      if (unitType === 'ENGINEER') {
        const myEng = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER').length;
        const queuedEng = gs.pendingRecruits.filter(r => r.owner === player && r.type === 'ENGINEER').length;
        const totalMyUnits = gs.units.filter(u => u.owner === player && !u.embarked).length;
        const econBuilt = gs.buildings.filter(bb => bb.owner === player && ['MINE','OIL_PUMP','FARM','LUMBER_CAMP','SCIENCE_LAB','FACTORY'].includes(bb.type)).length;
        const unworkedRes = Object.entries(gs.resourceHexes || {}).filter(([k]) => {
          const [rq, rr] = k.split(',').map(Number);
          const b = gs.buildings.find(bb => bb.q === rq && bb.r === rr && (bb.type === 'MINE' || bb.type === 'OIL_PUMP'));
          return !b || Number(b.owner) !== Number(player);
        }).length;

        // Tight anti-spam: small core engineer count + composition ceiling.
        const engCapBase = gs.turn < 8 ? 2 : 3;
        const engCapFromMap = Math.floor(unworkedRes / 6) + Math.floor(econBuilt / 8);
        const engCap = Math.max(1, Math.min(4, engCapBase + engCapFromMap));
        const engRatio = (myEng + queuedEng) / Math.max(1, totalMyUnits + queuedEng);

        if ((myEng + queuedEng) >= engCap) continue;
        if (engRatio > 0.24) continue;
      }
      if (unitType === 'SUPPLY_TRUCK') {
        const myTrucks = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_TRUCK').length;
        const frontlineSpan = getFrontlineDistanceEstimate(gs, player);
        const truckCap = Math.max(3, Math.min(10, 3 + Math.floor(frontlineSpan / 8) + Math.floor(Math.max(0, unsuppliedGround) / 3)));
        if (myTrucks >= truckCap) continue;
        // Barracks gate: don't build 2nd+ truck until a barracks is online
        if (myTrucks >= 1) {
          const hasBarracks = gs.buildings.some(bb => bb.owner === player && (bb.type === 'BARRACKS' || bb.type === 'ADV_BARRACKS') && !bb.underConstruction);
          if (!hasBarracks) continue;
        }
      }
      if (unitType === 'SUPPLY_SHIP') {
        const myShips = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_SHIP').length;
        const navalCombat = gs.units.filter(u => u.owner === player && NAVAL_UNITS.has(u.type) && u.type !== 'SUPPLY_SHIP').length;
        const unsNaval = gs.units.filter(u => u.owner === player && NAVAL_UNITS.has(u.type) && u.type !== 'SUPPLY_SHIP' && (u.outOfSupply || 0) > 0).length;
        const cap = Math.max(1, Math.min(2, Math.ceil(navalCombat / 8)));
        if (myShips >= cap && unsNaval <= 2) continue;
      }

      // Composition guards: avoid overstacking one cheap chassis.
      const lineTypes = ['INFANTRY','ASSAULT_INFANTRY','SMG_SQUAD','LMG_TEAM','HMG_TEAM'];
      if (gs.turn >= 12 && hasAdvancedOption && (unitType === 'INFANTRY' || unitType === 'RECON')) {
        // Late-game: strongly de-prioritize pure T0 fillers when advanced options exist at this building.
        continue;
      }
      if (unitType === 'RECON') {
        const myRecon = plannedCount['RECON'] || 0;
        const reconCap = gs.turn >= 20 ? 3 : 4;
        if (myRecon >= reconCap) continue;
      }
      const hasVehicleDepotBuilt = gs.buildings.some(bb => bb.owner === player && bb.type === 'VEHICLE_DEPOT' && !bb.underConstruction);
      if (gs.turn >= 14 && hasVehicleDepotBuilt && b.type === 'BARRACKS' && (unitType === 'INFANTRY' || unitType === 'RECON')) {
        continue;
      }
      const totalCombat = Math.max(1, Object.entries(plannedCount)
        .filter(([t]) => UNIT_TYPES[t]?.attack > 0 || UNIT_TYPES[t]?.soft_attack > 0 || UNIT_TYPES[t]?.hard_attack > 0)
        .reduce((s,[,n]) => s + n, 0));
      const lineCount = lineTypes.reduce((s,t) => s + (plannedCount[t] || 0), 0);
      if (unitType === 'INFANTRY' && lineCount / totalCombat > 0.55) continue;
      if ((unitType === 'PATROL_BOAT' || unitType === 'MTB') && (plannedCount[unitType] || 0) >= 4) continue;
      if (['LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG'].includes(unitType) && (plannedCount[unitType] || 0) >= 2) continue;

      const cost = UNIT_TYPES[unitType]?.cost || {};
      const foodCost = getRecruitFoodCost(unitType);
      if (resSim.iron >= (cost.iron || 0) &&
          resSim.oil  >= (cost.oil  || 0) &&
          resSim.wood >= (cost.wood || 0) &&
          resSim.food >= foodCost &&
          resSim.components >= (cost.components || 0)) {
        actions.push({ type: 'recruit', buildingId: b.id, unitType });
        plannedCount[unitType] = (plannedCount[unitType] || 0) + 1;
        resSim.iron -= (cost.iron || 0);
        resSim.oil  -= (cost.oil  || 0);
        resSim.wood -= (cost.wood || 0);
        resSim.food -= foodCost;
        resSim.components -= (cost.components || 0);
        break;
      }
    }
  }

  // Road quota: when behind network targets (or when supply is already strained),
  // ensure at least one road build is planned this turn when possible.
  if ((roadDeficitGlobal > 0 || logisticsPressure) && plannedRoadBuilds === 0) {
    const roadableHere = (q, r) => {
      const t = terrain?.[`${q},${r}`] ?? 0;
      if (t === 2) return false; // no roads on mountains
      if (roadAt(gs, q, r)) return false;
      const b = buildingAt(gs, q, r);
      if (b && !ROAD_TYPES.has(b.type)) return false;
      // Connectivity: only build roads adjacent to existing road network or HQ
      const myHQsR = gs.buildings.filter(bb => bb.type === 'HQ' && bb.owner === player);
      return [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]].some(([dq, dr]) => {
        const nq = q + dq, nr = r + dr;
        if (roadAt(gs, nq, nr)) return true;
        return myHQsR.some(h => h.q === nq && h.r === nr);
      });
    };

    const rcost = BUILDING_TYPES['ROAD']?.buildCost || {};
    const engineers = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing);
    for (const eng of engineers) {
      if (!canAfford(rcost)) break;

      // Case A: already on a valid roadable tile
      if (roadableHere(eng.q, eng.r)) {
        actions.push({ type: 'build', unitId: eng.id, buildingType: 'ROAD' });
        spend(rcost);
        plannedRoadBuilds += 1;
        break;
      }

      // Case B: move to a nearby roadable tile this turn, then build road there.
      const reachable = getReachableHexes(gs, eng, terrain, mapSize) || [];
      const cand = reachable
        .filter(h => roadableHere(h.q, h.r))
        .sort((a, b) => scoreRoadUtility(gs, player, b.q, b.r) - scoreRoadUtility(gs, player, a.q, a.r))[0];
      if (cand) {
        actions.push({ type: 'move', unitId: eng.id, fromQ: eng.q, fromR: eng.r, toQ: cand.q, toR: cand.r });
        actions.push({ type: 'build', unitId: eng.id, buildingType: 'ROAD' });
        spend(rcost);
        plannedRoadBuilds += 1;
        break;
      }
    }
  }

  // Hard logistics quota under pressure: ensure at least one concrete logistics action is scheduled.
  const logisticsPlanned = actions.filter(a =>
    (a.type === 'build' && ['ROAD','SUPPLY_DEPOT','SUPPLY_WAREHOUSE'].includes(a.buildingType)) ||
    (a.type === 'recruit' && a.unitType === 'SUPPLY_TRUCK')
  ).length;
  if (logisticsPressure && logisticsPlanned === 0) {
    const canBuildHere = (q, r) => {
      const b = buildingAt(gs, q, r);
      return !b || ROAD_TYPES.has(b.type);
    };

    // 1) Try to place a forward depot/warehouse first when supply is strained.
    const depotType = logisticsEmergency ? 'SUPPLY_WAREHOUSE' : 'SUPPLY_DEPOT';
    const depotCost = BUILDING_TYPES[depotType]?.buildCost || {};
    const idleEngs = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing);
    for (const eng of idleEngs) {
      if (!canBuildHere(eng.q, eng.r)) continue;
      if (!canAfford(depotCost)) break;
      actions.push({ type: 'build', unitId: eng.id, buildingType: depotType });
      spend(depotCost);
      break;
    }

    // 2) If still nothing, force a road action from an engineer.
    const logisticsPlanned2 = actions.filter(a =>
      (a.type === 'build' && ['ROAD','SUPPLY_DEPOT','SUPPLY_WAREHOUSE'].includes(a.buildingType)) ||
      (a.type === 'recruit' && a.unitType === 'SUPPLY_TRUCK')
    ).length;
    if (logisticsPlanned2 === 0) {
      const rcost = BUILDING_TYPES['ROAD']?.buildCost || {};
      const roadable = (q, r) => {
        const t = terrain?.[`${q},${r}`] ?? 0;
        if (t === 2) return false;
        if (roadAt(gs, q, r)) return false;
        return canBuildHere(q, r);
      };
      for (const eng of idleEngs) {
        if (!canAfford(rcost)) break;
        if (roadable(eng.q, eng.r)) {
          actions.push({ type: 'build', unitId: eng.id, buildingType: 'ROAD' });
          spend(rcost);
          break;
        }
      }
    }

    // 3) Last fallback: queue truck.
    const logisticsPlanned3 = actions.filter(a =>
      (a.type === 'build' && ['ROAD','SUPPLY_DEPOT','SUPPLY_WAREHOUSE'].includes(a.buildingType)) ||
      (a.type === 'recruit' && a.unitType === 'SUPPLY_TRUCK')
    ).length;
    if (logisticsPlanned3 === 0) {
      const truckB = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('SUPPLY_TRUCK') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player) && !actions.some(a => a.type === 'recruit' && a.buildingId === bb.id));
      if (truckB) {
        const c = UNIT_TYPES['SUPPLY_TRUCK']?.cost || {};
        const f = getRecruitFoodCost('SUPPLY_TRUCK');
        if (resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
          actions.push({ type: 'recruit', buildingId: truckB.id, unitType: 'SUPPLY_TRUCK' });
          resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
        }
      }
    }
  }

  // Milestone lock-ins: force strategic infrastructure online by turn gates.
  const builtCount = (types) => gs.buildings.filter(b => b.owner === player && !b.underConstruction && (Array.isArray(types) ? types.includes(b.type) : b.type === types)).length;
  const milestoneNeeds = [];
  if (gs.turn >= 20 && builtCount('SCIENCE_LAB') < 1) milestoneNeeds.push('SCIENCE_LAB');
  if (gs.turn >= 30 && builtCount('FACTORY') < 1) milestoneNeeds.push('FACTORY');
  if (gs.turn >= 40 && builtCount(['VEHICLE_DEPOT','AIRFIELD','ADV_AIRFIELD']) < 1) milestoneNeeds.push('VEHICLE_DEPOT');
  if (milestoneNeeds.length > 0) {
    const idleEngineers = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing);
    const canBuildHere = (q, r) => {
      const b = buildingAt(gs, q, r);
      return !b || ROAD_TYPES.has(b.type);
    };
    for (const eng of idleEngineers) {
      for (const bt of milestoneNeeds) {
        const c = BUILDING_TYPES[bt]?.buildCost || {};
        if (!canBuildHere(eng.q, eng.r)) continue;
        if (!canAfford(c)) continue;
        actions.push({ type: 'build', unitId: eng.id, buildingType: bt });
        spend(c);
        break;
      }
      if (actions.some(a => a.type === 'build' && milestoneNeeds.includes(a.buildingType))) break;
    }
  }

  // --- Phase 3: Failsafe infra action ---
  // If AI planned no build at all, force one practical economy/infra build when possible.
  if (!actions.some(a => a.type === 'build') && gs.turn >= 4) {
    const idleEngineers = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing);
    for (const eng of idleEngineers) {
      const key = `${eng.q},${eng.r}`;
      const t = terrain?.[key] ?? 0;
      const hasRoad = !!roadAt(gs, eng.q, eng.r);
      const hasNonRoadBuilding = !!(buildingAt(gs, eng.q, eng.r) && !hasRoad);
      const resHex = gs.resourceHexes?.[key];

      const tryBuild = (type) => {
        const cost = BUILDING_TYPES[type]?.buildCost || {};
        if (!canAfford(cost)) return false;
        actions.push({ type: 'build', unitId: eng.id, buildingType: type });
        spend(cost);
        return true;
      };

      // Always allow road as a cheap baseline action.
      if (!hasRoad && tryBuild('ROAD')) break;
      if (hasNonRoadBuilding) continue;

      if (resHex?.type === 'IRON' && tryBuild('MINE')) break;
      if (resHex?.type === 'OIL' && tryBuild('OIL_PUMP')) break;
      if ((t === 1 || t === 7) && tryBuild('LUMBER_CAMP')) break;
      if ((t === 0 || t === 6 || t === 7) && tryBuild('FARM')) break;
      if (gs.turn >= 6 && tryBuild('SCIENCE_LAB')) break;
    }
  }

  // Engineer FOB-advance pass: steer any idle engineer toward the nearest uncovered FOB point.
  {
    const actedPreFOB = new Set(actions.filter(a => a.unitId != null).map(a => a.unitId));
    const fobPointsNow = getFOBChainPoints(gs, player);
    const uncoveredFOBs = fobPointsNow.filter(fob =>
      !gs.buildings.some(b => b.owner === player &&
        (b.type === 'SUPPLY_DEPOT' || b.type === 'SUPPLY_WAREHOUSE') &&
        hexDistance(b.q, b.r, fob.q, fob.r) <= 4)
    );
    if (uncoveredFOBs.length > 0) {
      const fobEngs = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing && !actedPreFOB.has(u.id));
      for (const eng of fobEngs) {
        const nearest = uncoveredFOBs.reduce((a, b) => hexDistance(eng.q, eng.r, a.q, a.r) <= hexDistance(eng.q, eng.r, b.q, b.r) ? a : b);
        if (hexDistance(eng.q, eng.r, nearest.q, nearest.r) <= 2) continue; // already close, let build logic handle
        const reachable = getReachableHexes(gs, eng, terrain, mapSize) || [];
        const best = reachable
          .filter(h => hexDistance(h.q, h.r, nearest.q, nearest.r) < hexDistance(eng.q, eng.r, nearest.q, nearest.r))
          .sort((a, b) => hexDistance(a.q, a.r, nearest.q, nearest.r) - hexDistance(b.q, b.r, nearest.q, nearest.r))[0];
        if (best) {
          actions.push({ type: 'move', unitId: eng.id, fromQ: eng.q, fromR: eng.r, toQ: best.q, toR: best.r });
          actedPreFOB.add(eng.id);
        }
      }
    }
  }

  // Engineer utilization sweep: avoid idle engineers when valid logistics work exists.
  const actedEngineerIds = new Set(actions.filter(a => a.unitId != null).map(a => a.unitId));
  const idleEngineers = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing && !actedEngineerIds.has(u.id));
  const roadCostFinal = BUILDING_TYPES['ROAD']?.buildCost || { wood: 1 };
  const roadableHereFinal = (q, r) => {
    const t = terrain?.[`${q},${r}`] ?? 0;
    if (t === 2) return false;
    if (roadAt(gs, q, r)) return false;
    const b = buildingAt(gs, q, r);
    if (b && !ROAD_TYPES.has(b.type)) return false;
    // Connectivity: must be adjacent to existing road or HQ
    const myHQsFinal = gs.buildings.filter(bb => bb.type === 'HQ' && bb.owner === player);
    const hexNeighborsFinal = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    return hexNeighborsFinal.some(([dq, dr]) => {
      const nq = q + dq, nr = r + dr;
      if (roadAt(gs, nq, nr)) return true;
      return myHQsFinal.some(h => h.q === nq && h.r === nr);
    });
  };
  for (const eng of idleEngineers) {
    if (canAfford(roadCostFinal) && roadableHereFinal(eng.q, eng.r)) {
      actions.push({ type: 'build', unitId: eng.id, buildingType: 'ROAD' });
      spend(roadCostFinal);
      continue;
    }
    const reachable = getReachableHexes(gs, eng, terrain, mapSize) || [];
    const cand = reachable
      .filter(h => roadableHereFinal(h.q, h.r))
      .sort((a, b) => scoreRoadUtility(gs, player, b.q, b.r) - scoreRoadUtility(gs, player, a.q, a.r))[0];
    if (cand) actions.push({ type: 'move', unitId: eng.id, fromQ: eng.q, fromR: eng.r, toQ: cand.q, toR: cand.r });
  }

  // Engineer task-lock maintenance + anti-stall reroute.
  for (const u of gs.units.filter(x => x.owner === player && x.type === 'ENGINEER' && !x.embarked)) {
    const mem = engineerMemory[u.id] || {};
    const lastPos = mem.lastPos || { q: u.q, r: u.r };
    const movedThisPlan = actions.some(a => a.type === 'move' && a.unitId === u.id);
    const builtThisPlan = actions.some(a => a.type === 'build' && a.unitId === u.id);

    if (!movedThisPlan && !builtThisPlan && lastPos.q === u.q && lastPos.r === u.r) mem.stallTurns = (mem.stallTurns || 0) + 1;
    else mem.stallTurns = 0;

    if ((mem.stallTurns || 0) >= 2) {
      mem.task = pickEngineerTask(gs, player, u, strategic, mapSize);
      mem.turnAssigned = gs.turn || 1;
      mem.stallTurns = 0;
      aiDebug.engineersStalled += 1;
    }

    mem.lastPos = { q: u.q, r: u.r };
    engineerMemory[u.id] = mem;
  }

  aiDebug.engineerTaskLocks = Object.values(engineerMemory).filter(m => !!m?.task).length;

  // Phase-1 instrumentation payload (no behavior change expected from this block).
  const unitById = new Map(gs.units.map(u => [u.id, u]));
  for (const a of actions) {
    if (a.type === 'build' && a.unitId != null) {
      const u = unitById.get(a.unitId);
      if (u?.type === 'ENGINEER') {
        if (a.buildingType === 'ROAD') aiDebug.engineerAssignments.road += 1;
        else if (a.buildingType === 'SUPPLY_DEPOT' || a.buildingType === 'SUPPLY_WAREHOUSE') aiDebug.engineerAssignments.fob += 1;
        else if (a.buildingType === 'MINE' || a.buildingType === 'OIL_PUMP' || a.buildingType === 'FARM' || a.buildingType === 'LUMBER_CAMP') aiDebug.engineerAssignments.resource += 1;
        else aiDebug.engineerAssignments.other += 1;
      }
    }
    if (a.type === 'move' && a.unitId != null) {
      const u = unitById.get(a.unitId);
      if (u?.type === 'ENGINEER') aiDebug.engineerAssignments.reroute += 1;
    }
    if (a.type === 'recruit') {
      const t = a.unitType;
      if (NAVAL_UNITS.has(t)) aiDebug.recruitMix.naval += 1;
      if (AIR_UNITS.has(t)) aiDebug.recruitMix.air += 1;
      const role = getUnitRole(t);
      if (role === 'support' || t === 'ENGINEER') aiDebug.recruitMix.support += 1;
      const tier = UNIT_TYPES[t]?.tier || 0;
      if (tier <= 0) aiDebug.recruitMix.tier0 += 1;
      else aiDebug.recruitMix.tier1plus += 1;
    }
  }

  aiDebug.engineersStalled = idleEngineers.length;
  aiDebug.corridorPlan.completedSegments = actions.filter(a => a.type === 'build' && a.buildingType === 'ROAD').length;
  aiDebug.unsuppliedClusters = summarizeUnsuppliedClusters(gs, player);

  // compact map/front summary for AI-lab JSON
  const myCombatNow = gs.units.filter(u => u.owner === player && !u.embarked).filter(u => {
    const d = UNIT_TYPES[u.type] || {};
    return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
  });
  const enemyCombatNow = gs.units.filter(u => u.owner !== player && !u.embarked).filter(u => {
    const d = UNIT_TYPES[u.type] || {};
    return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
  });
  const centroid = (arr) => arr.length ? {
    q: Number((arr.reduce((s, u) => s + u.q, 0) / arr.length).toFixed(2)),
    r: Number((arr.reduce((s, u) => s + u.r, 0) / arr.length).toFixed(2)),
  } : null;
  aiDebug.mapSummary = {
    myCombatCentroid: centroid(myCombatNow),
    enemyCombatCentroid: centroid(enemyCombatNow),
    lanePressure: {
      north: (aiDebug.forceSplit.current.north || 0) - enemyCombatNow.filter(u => getLaneForR(u.r, mapSize) === 'north').length,
      center: (aiDebug.forceSplit.current.center || 0) - enemyCombatNow.filter(u => getLaneForR(u.r, mapSize) === 'center').length,
      south: (aiDebug.forceSplit.current.south || 0) - enemyCombatNow.filter(u => getLaneForR(u.r, mapSize) === 'south').length,
    },
  };

  gs._aiDebug = gs._aiDebug || {};
  gs._aiDebug[player] = aiDebug;

  return actions;
}
