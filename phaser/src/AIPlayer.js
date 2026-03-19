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
} from './GameState.js';

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
  if (myHQs.length > 0) {
    const dHQ = Math.min(...myHQs.map(h => hexDistance(q, r, h.q, h.r)));
    networkScore += Math.max(0, 9 - dHQ * 0.7);
  }

  return resourceScore + frontScore + networkScore;
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
    if (dNew < dCur) score += 9 * phase.combat;
    if (dNew <= 2) score += 4 * phase.combat;
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
  const mySupply   = computeSupply(gs, player, terrain, mapSize);
  const phaseWeights = getPhaseWeights(gs.turn || 1);
  const deceptionTurn = Math.random() < 0.18;
  const resourceTargets = Object.entries(gs.resourceHexes || {})
    .map(([k, v]) => ({ k, q: Number(k.split(',')[0]), r: Number(k.split(',')[1]), type: v?.type }))
    .filter(t => {
      const b = gs.buildings.find(bb => bb.q === t.q && bb.r === t.r && (bb.type === 'MINE' || bb.type === 'OIL_PUMP'));
      return !b || Number(b.owner) !== Number(player);
    })
    .slice(0, 24);

  // Phase 2: task-group split and objective assignment (main force + flank force)
  const enemyHQs = gs.buildings.filter(b => b.type === 'HQ' && b.owner !== player);
  const myCombatUnits = gs.units.filter(u => u.owner === player && !u.embarked)
    .filter(u => {
      const d = UNIT_TYPES[u.type] || {};
      const role = getUnitRole(u.type);
      return role !== 'engineer' && role !== 'support' && ((d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0);
    });
  const unitObjective = {};
  if (enemyHQs.length > 0 && myCombatUnits.length >= 8) {
    // main objective = nearest enemy HQ to our army centroid
    const cx = myCombatUnits.reduce((s, u) => s + u.q, 0) / myCombatUnits.length;
    const cy = myCombatUnits.reduce((s, u) => s + u.r, 0) / myCombatUnits.length;
    const mainObj = enemyHQs.reduce((a, b) => hexDistance(cx, cy, a.q, a.r) <= hexDistance(cx, cy, b.q, b.r) ? a : b);

    // flank objective = contested resource farthest from main objective, fallback enemy HQ
    let flankObj = mainObj;
    if (resourceTargets.length > 0) {
      flankObj = resourceTargets.reduce((a, b) => hexDistance(a.q, a.r, mainObj.q, mainObj.r) >= hexDistance(b.q, b.r, mainObj.q, mainObj.r) ? a : b);
    }

    const sortedCombat = [...myCombatUnits].sort((a, b) => {
      const ra = getUnitRole(a.type), rb = getUnitRole(b.type);
      const pr = (r) => r === 'recon' ? 0 : r === 'assault' ? 1 : r === 'line' ? 2 : r === 'indirect' ? 3 : 4;
      return pr(ra) - pr(rb);
    });
    const flankCount = Math.max(2, Math.floor(sortedCombat.length * 0.35));
    for (let i = 0; i < sortedCombat.length; i++) {
      const u = sortedCombat[i];
      unitObjective[u.id] = i < flankCount ? { q: flankObj.q, r: flankObj.r } : { q: mainObj.q, r: mainObj.r };
    }
  }

  const opening = getOpeningMilestones(gs, player);
  const roadFloor = getRoadFloor(gs.turn || 1);
  const roadsNow = gs.buildings.filter(bb => bb.owner === player && bb.type === 'ROAD').length;
  const roadDeficitGlobal = Math.max(0, roadFloor - roadsNow);
  const myEngineersNow = gs.units.filter(u => u.owner === player && !u.embarked && u.type === 'ENGINEER');
  const roadCaptainId = myEngineersNow.length > 0 ? myEngineersNow.sort((a,b) => a.id - b.id)[0].id : null;
  const aiCtx = { deceptionTurn, resourceTargets, unitObjective, phaseWeights, roadDeficit: roadDeficitGlobal, roadCaptainId };

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

    // Snapshot original position so we can restore after planning
    unit._aiOrigQ = unit.q; unit._aiOrigR = unit.r;

    // A) Attack from current position
    const unitInSupply = mySupply?.has?.(`${unit.q},${unit.r}`);
    const preMoveTargets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
    const preMoveTarget  = chooseBestTarget(gs, unit, preMoveTargets);
    const preTrade = preMoveTarget ? estimateAttackCommitScore(gs, unit, preMoveTarget) : -999;
    const frontlineCommit = (gs.turn || 1) >= 10 && preMoveTarget && hexDistance(unit.q, unit.r, preMoveTarget.q, preMoveTarget.r) <= 3 && preTrade >= 0;
    const canRiskAttack = !!unitInSupply || frontlineCommit || (((unit.outOfSupply || 0) < 2 && roadDeficitGlobal < 2) && preMoveTarget && (preMoveTarget.health || 99) <= 1 && hexDistance(unit.q, unit.r, preMoveTarget.q, preMoveTarget.r) <= 1);
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
        const k = `${unit.q},${unit.r}`;
        const hasRoad = !!roadAt(gs, unit.q, unit.r);
        const hasNonRoadBuilding = !!(buildingAt(gs, unit.q, unit.r) && !hasRoad);
        const ttype = terrain?.[k] ?? 0;
        const resHex = gs.resourceHexes?.[k];
        const me = gs.players[player] || {};
        const wood = me.wood || 0;
        const food = me.food || 0;
        const goodBuildTile = !hasNonRoadBuilding && (
          resHex?.type === 'IRON' || resHex?.type === 'OIL' ||
          ((ttype === 1 || ttype === 7) && wood < 6) ||
          ((ttype === 0 || ttype === 6 || ttype === 7) && food < 8)
        );
        if (goodBuildTile) {
          unit.moved = true; // planning-only hold; restored later
        }
      }

      // Temporarily restore full budget for reachable calc
      const savedMovesLeft = unit.movesLeft;
      unit.movesLeft = UNIT_TYPES[unit.type].move;
      const reachable = unit.moved ? [] : getReachableHexes(gs, unit, terrain, mapSize);
      unit.movesLeft  = savedMovesLeft;

      if (reachable.length > 0) {
        const enemies = getEnemies();
        const myHQs   = getMyHQs();

        let bestDest = null, bestScore = -Infinity;
        for (const hex of reachable) {
          const s = scoreMove(gs, terrain, unit, hex.q, hex.r, strategy, enemies, myHQs, mySupply, aiCtx);
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
        const canRiskPostAttack = !!postInSupply || frontlineCommitPost || (((unit.outOfSupply || 0) < 2 && roadDeficitGlobal < 2) && postMoveTarget && (postMoveTarget.health || 99) <= 1 && hexDistance(unit.q, unit.r, postMoveTarget.q, postMoveTarget.r) <= 1);
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
          if (!canAfford(cost)) return false;
          actions.push({ type: 'build', unitId: unit.id, buildingType });
          if (buildingType === 'ROAD') plannedRoadBuilds += 1;
          spend(cost);
          return true;
        };

        // Always allow ROAD consideration even if a non-road building exists on this tile.
        // Roads are intended to coexist with buildings and form supply corridors.
        const roadsNowForEng = gs.buildings.filter(b => b.owner === player && b.type === 'ROAD').length;
        const roadDeficitForEng = Math.max(0, roadFloor - roadsNowForEng);
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
          const roadDeficit = Math.max(0, roadFloor - myRoads);

          // Utility-first logistics: only hard-force roads when deficit is severe.
          const roadUtilityHere = scoreRoadUtility(gs, player, unit.q, unit.r);
          if (roadDeficit >= 4 && !hasRoad && roadUtilityHere >= 14 && maybeBuild('ROAD')) continue;

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
            // Science Lab: research, cap at 2
            if (myLabs < 2 && gs.turn >= 2) needs.push({ type: 'SCIENCE_LAB', score: (8 - myLabs * 4 + d.labs * 6) * phaseWeights.research });
            // Factory: components, cap at 2
            if (myFactories < 2 && gs.turn >= 5) needs.push({ type: 'FACTORY', score: (6 - myFactories * 3 + d.factories * 7) * phaseWeights.economy });

            // Military production baseline: don't stall on only T0 infantry/recon.
            const myBarracks = gs.buildings.filter(bb => bb.owner === player && bb.type === 'BARRACKS' && !bb.underConstruction).length;
            const myAirfield = gs.buildings.filter(bb => bb.owner === player && bb.type === 'AIRFIELD' && !bb.underConstruction).length;
            const myHarbor = gs.buildings.filter(bb => bb.owner === player && ['HARBOR','NAVAL_YARD','SHIPYARD','DRY_DOCK','NAVAL_BASE'].includes(bb.type) && !bb.underConstruction).length;
            if (gs.turn >= 4 && myBarracks < 2) needs.push({ type: 'BARRACKS', score: (7.5 - myBarracks * 2.5 + d.barracks * 6) * phaseWeights.combat });
            if (gs.turn >= 8 && myAirfield < 1) needs.push({ type: 'AIRFIELD', score: 6.4 * phaseWeights.combat });
            if (gs.turn >= 10 && myHarbor < 1) needs.push({ type: 'HARBOR', score: 5.8 * phaseWeights.logistics });

            // Tier-2 production chain: once components economy exists, unlock higher-tier unit buildings.
            const comp = resSim.components || 0;
            const canPushTier2 = gs.turn >= 9 && (myFactories >= 1 || comp >= 3);
            if (canPushTier2) {
              if (myAdvBarracks < 1) needs.push({ type: 'ADV_BARRACKS', score: 8 * phaseWeights.combat });
              if (myArmorWorks < 1)  needs.push({ type: 'ARMOR_WORKS', score: 8.5 * phaseWeights.combat });
              if (myAdvAirfield < 1) needs.push({ type: 'ADV_AIRFIELD', score: 7.5 * phaseWeights.combat });
              if (myNavalDockyard < 1 && (gs.buildings.some(bb => bb.owner === player && ['HARBOR','NAVAL_YARD','DRY_DOCK','NAVAL_BASE'].includes(bb.type)))) {
                needs.push({ type: 'NAVAL_DOCKYARD', score: 7.2 * phaseWeights.logistics });
              }
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

  // --- Phase 2: Recruit at buildings (non-executing; resolved in GameScene) ---
  const myBuildings = gs.buildings.filter(
    b => b.owner === player && !b.underConstruction && b.type !== 'ROAD'
  );

  // Reuse simulated resource spend from movement/infra planning so recruit decisions are coherent.
  const plannedCount = {};
  for (const u of gs.units.filter(u => u.owner === player && !u.embarked)) {
    plannedCount[u.type] = (plannedCount[u.type] || 0) + 1;
  }

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
  if (unsuppliedGroundNow >= 2) {
    const b = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('SUPPLY_TRUCK') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player));
    if (b) {
      const c = UNIT_TYPES['SUPPLY_TRUCK']?.cost || {};
      const f = getRecruitFoodCost('SUPPLY_TRUCK');
      if (resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
        actions.push({ type: 'recruit', buildingId: b.id, unitType: 'SUPPLY_TRUCK' });
        resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
        plannedCount['SUPPLY_TRUCK'] = (plannedCount['SUPPLY_TRUCK'] || 0) + 1;
      }
    }
  }
  if (unsuppliedNavalNow >= 1) {
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

  for (const b of myBuildings) {
    const bType = BUILDING_TYPES[b.type];
    if (!bType?.canRecruit?.length) continue;

    const alreadyQueued = gs.pendingRecruits.some(r => r.buildingId === b.id && r.owner === player);
    if (alreadyQueued) continue;

    // Build priority list from strategy, filtered to what this building can recruit
    const isNaval = ['HARBOR','SHIPYARD','DRYDOCK'].includes(b.type);
    const isAir   = b.type === 'AIRFIELD';
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

    // Opening milestone controller (T1–T12): ensure baseline macro tools come online.
    if (opening.turn <= 12) {
      const enforce = [];
      const roadsNow = gs.buildings.filter(bb => bb.owner === player && bb.type === 'ROAD').length;
      const roadDeficit = Math.max(0, roadFloor - roadsNow);
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

    for (const unitType of sorted) {
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
        if (myTrucks >= 3) continue;
      }

      // Composition guards: avoid overstacking one cheap chassis.
      const lineTypes = ['INFANTRY','ASSAULT_INFANTRY','SMG_SQUAD','LMG_TEAM','HMG_TEAM'];
      if (gs.turn >= 12 && hasAdvancedOption && (unitType === 'INFANTRY' || unitType === 'RECON')) {
        // Late-game: strongly de-prioritize pure T0 fillers when advanced options exist at this building.
        continue;
      }
      const totalCombat = Math.max(1, Object.entries(plannedCount)
        .filter(([t]) => UNIT_TYPES[t]?.attack > 0 || UNIT_TYPES[t]?.soft_attack > 0 || UNIT_TYPES[t]?.hard_attack > 0)
        .reduce((s,[,n]) => s + n, 0));
      const lineCount = lineTypes.reduce((s,t) => s + (plannedCount[t] || 0), 0);
      if (unitType === 'INFANTRY' && lineCount / totalCombat > 0.55) continue;
      if ((unitType === 'PATROL_BOAT' || unitType === 'MTB') && (plannedCount[unitType] || 0) >= 4) continue;

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

  // Road quota: when behind network targets, ensure at least one road build is planned this turn when possible.
  if (roadDeficitGlobal > 0 && plannedRoadBuilds === 0) {
    const roadEng = gs.units
      .filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing)
      .find(u => !roadAt(gs, u.q, u.r));
    if (roadEng) {
      const rcost = BUILDING_TYPES['ROAD']?.buildCost || {};
      if (canAfford(rcost)) {
        actions.push({ type: 'build', unitId: roadEng.id, buildingType: 'ROAD' });
        spend(rcost);
        plannedRoadBuilds += 1;
      }
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

  return actions;
}
