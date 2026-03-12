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
  getReachableHexes, getAttackableHexes, hexDistance, buildingAt, roadAt, computeSupply,
} from './GameState.js';

// ── Strategy definitions ───────────────────────────────────────────────────

export const AI_STRATEGIES = {
  aggressive: {
    label:         'Aggressive',
    recruitPrio:   ['TANK','INFANTRY','MORTAR','ARTILLERY','ANTI_TANK','SUPPLY_TRUCK','HALFTRACK'],
    navalPrio:     ['DESTROYER','MTB','CRUISER_LT','PATROL_BOAT','SUPPLY_SHIP'],
    airPrio:       ['BIPLANE_FIGHTER','LIGHT_BOMBER','OBS_PLANE'],
    attackBonus:   20,   // extra score for attack-after-move
    captureBonus:  20,   // bonus for moving toward HQ or flag position
    retreatToHQ:   false,
    digInChance:   0,
  },
  defensive: {
    label:         'Defensive',
    recruitPrio:   ['ANTI_TANK','ARTILLERY','INFANTRY','MORTAR','MEDIC','SUPPLY_TRUCK'],
    navalPrio:     ['COASTAL_BATTERY','DESTROYER','PATROL_BOAT','SUPPLY_SHIP'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   0,
    captureBonus:  40,
    retreatToHQ:   true,
    digInChance:   0.5,  // 50% chance to dig in after moving if no target
  },
  balanced: {
    label:         'Balanced',
    recruitPrio:   ['INFANTRY','ANTI_TANK','TANK','ARTILLERY','MORTAR','SUPPLY_TRUCK','HALFTRACK'],
    navalPrio:     ['DESTROYER','PATROL_BOAT','MTB','SUPPLY_SHIP','TRANSPORT_SM'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   10,
    captureBonus:  30,
    retreatToHQ:   false,
    digInChance:   0.2,
  },
};

export function randomStrategy() {
  const keys = Object.keys(AI_STRATEGIES);
  return keys[Math.floor(Math.random() * keys.length)];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function chooseBestTarget(gs, unit, attackTargets) {
  let best = null, bestScore = -Infinity;
  for (const hex of attackTargets) {
    const target = gs.units.find(u =>
      u.q === hex.q && u.r === hex.r && u.owner !== unit.owner && !u.embarked
    );
    if (!target) continue;
    // Prefer almost-dead targets, then high-value types, then closest
    const dyingBonus  = (target.maxHealth - target.health) * 4;
    const typeBonus   = target.type === 'ARTILLERY' || target.type === 'MORTAR' ? 6 : 0;
    const distPenalty = hexDistance(unit.q, unit.r, target.q, target.r);
    const score = dyingBonus + target.maxHealth - target.health + typeBonus - distPenalty * 0.5;
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}

function scoreMove(gs, unit, q, r, strat, enemies, myHQs, mySupply) {
  const cfg = AI_STRATEGIES[strat] ?? AI_STRATEGIES.balanced;
  let score = 0;

  // Attack bonus: can we hit someone from here?
  const attackable = getAttackableHexes(gs, unit, q, r, null);
  if (attackable.length > 0) {
    score += (cfg.attackBonus + 10) + attackable.length * 3;
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
      // Defensive: reward moving AWAY from enemies
      if (nearestEnemy > currentDist) score += cfg.captureBonus;
    } else {
      // Aggressive/balanced: reward closing on enemies
      if (nearestEnemy < currentDist) score += cfg.attackBonus + 5;
      score += Math.max(0, 8 - nearestEnemy); // proximity bonus
    }
  }

  // Defensive: reward moving toward own HQ
  if (cfg.retreatToHQ && myHQs.length > 0) {
    const nearestHQ  = Math.min(...myHQs.map(b => hexDistance(q, r, b.q, b.r)));
    const curHQDist  = Math.min(...myHQs.map(b => hexDistance(unit.q, unit.r, b.q, b.r)));
    if (nearestHQ < curHQDist) score += cfg.captureBonus;
  }

  // Supply awareness: avoid ending out of supply unless near-contact (sneaky/emergency pushes).
  const inSupply = mySupply?.has?.(`${q},${r}`);
  if (!inSupply) {
    const nearestEnemy = enemies.length > 0 ? Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r))) : 99;
    const emergencyPush = nearestEnemy <= 2;
    score -= emergencyPush ? 3 : 18;
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

  // Simulated AI economy spend during planning so we don't overcommit.
  const resSim = {
    iron: gs.players[player].iron || 0,
    oil: gs.players[player].oil || 0,
    wood: gs.players[player].wood || 0,
    components: gs.players[player].components || 0,
  };
  const canAfford = (cost = {}) =>
    resSim.iron >= (cost.iron || 0) &&
    resSim.oil >= (cost.oil || 0) &&
    resSim.wood >= (cost.wood || 0) &&
    resSim.components >= (cost.components || 0);
  const spend = (cost = {}) => {
    resSim.iron -= (cost.iron || 0);
    resSim.oil -= (cost.oil || 0);
    resSim.wood -= (cost.wood || 0);
    resSim.components -= (cost.components || 0);
  };

  // Clone unit list so we can track "virtual" positions for multi-step planning
  // (Simple approach: plan each unit independently with live state)
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

    // Snapshot original position so we can restore after planning
    unit._aiOrigQ = unit.q; unit._aiOrigR = unit.r;

    // A) Attack from current position
    const preMoveTargets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
    const preMoveTarget  = chooseBestTarget(gs, unit, preMoveTargets);
    if (preMoveTarget) {
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
      // Temporarily restore full budget for reachable calc
      const savedMovesLeft = unit.movesLeft;
      unit.movesLeft = UNIT_TYPES[unit.type].move;
      const reachable = getReachableHexes(gs, unit, terrain, mapSize);
      unit.movesLeft  = savedMovesLeft;

      if (reachable.length > 0) {
        const enemies = getEnemies();
        const myHQs   = getMyHQs();

        let bestDest = null, bestScore = -Infinity;
        for (const hex of reachable) {
          const s = scoreMove(gs, unit, hex.q, hex.r, strategy, enemies, myHQs, mySupply);
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
        if (postMoveTarget) {
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
          spend(cost);
          return true;
        };

        if (!hasNonRoadBuilding) {
          // Count existing economy buildings for balance checks
          const myMines  = gs.buildings.filter(b => b.owner === player && b.type === 'MINE').length;
          const myPumps  = gs.buildings.filter(b => b.owner === player && b.type === 'OIL_PUMP').length;
          const myLumber = gs.buildings.filter(b => b.owner === player && b.type === 'LUMBER_CAMP').length;
          const myFarms  = gs.buildings.filter(b => b.owner === player && b.type === 'FARM' && !b.underConstruction).length;
          const myLabs   = gs.buildings.filter(b => b.owner === player && b.type === 'SCIENCE_LAB' && !b.underConstruction).length;
          const myFactories = gs.buildings.filter(b => b.owner === player && b.type === 'FACTORY' && !b.underConstruction).length;
          const myRoads  = gs.buildings.filter(b => b.owner === player && b.type === 'ROAD').length;

          // Priority 1: exploit local resources (always do this first)
          const wood = gs.players[player].wood || 0;
          const food = gs.players[player].food || 0;
          const nonWoodEcon = myMines + myPumps + myFarms + myFactories;
          const maxLumber = Math.max(1, Math.min(2, Math.floor((nonWoodEcon + 1) / 3))); // usually 1-2 total camps
          const woodPressure = wood < 5;

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
            const onPlains = (ttype === 0 || ttype === 6 || ttype === 7);
            const onForest = (ttype === 1 || ttype === 7);

            // Build priority scoring — favor the weakest link in economy
            const needs = [];
            // Farms: need food for upkeep, cap at 4
            if (onPlains && myFarms < 4 && food < 10) needs.push({ type: 'FARM', score: (myFarms < 1 ? 20 : 12) - myFarms * 3 - food * 0.5 });
            // Lumber: only when wood-starved, hard cap by broader economy size
            if (onForest && !resHex && myLumber < maxLumber && wood < 6) {
              needs.push({ type: 'LUMBER_CAMP', score: (myLumber < 1 ? 11 : 6) - myLumber * 4 - wood * 0.8 });
            }
            // Road: infrastructure, moderate priority after turn 3
            if (!hasRoad && gs.turn >= 3 && myRoads < 6) needs.push({ type: 'ROAD', score: 5 - myRoads * 0.5 });
            // Science Lab: research, cap at 2
            if (myLabs < 2 && gs.turn >= 2) needs.push({ type: 'SCIENCE_LAB', score: 8 - myLabs * 4 });
            // Factory: components, cap at 2
            if (myFactories < 2 && gs.turn >= 5) needs.push({ type: 'FACTORY', score: 6 - myFactories * 3 });

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
  if (existingDesigns.length < MAX_DESIGNS_PER_PLAYER && gs.turn >= 3 && Math.random() < 0.3) {
    // Pick a simple design: chassis + one affordable module
    const AI_DESIGN_RECIPES = [
      { chassis: 'INFANTRY',  modules: ['FIELD_RADIO'],  name: 'Radioman' },
      { chassis: 'INFANTRY',  modules: ['AT_RIFLE'],     name: 'AT Infantry' },
      { chassis: 'TANK',      modules: ['BETTER_ENGINE'], name: 'Fast Tank' },
      { chassis: 'TANK',      modules: ['EXTRA_ARMOR'],  name: 'Heavy Tank' },
      { chassis: 'ARTILLERY', modules: ['LONG_RANGE'],   name: 'Long-Range Art.' },
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

  for (const b of myBuildings) {
    const bType = BUILDING_TYPES[b.type];
    if (!bType?.canRecruit?.length) continue;

    const alreadyQueued = gs.pendingRecruits.some(r => r.buildingId === b.id && r.owner === player);
    if (alreadyQueued) continue;

    // Build priority list from strategy, filtered to what this building can recruit
    const isNaval = ['HARBOR','SHIPYARD','DRYDOCK'].includes(b.type);
    const isAir   = b.type === 'AIRFIELD';
    const prio    = isNaval ? cfg.navalPrio : isAir ? cfg.airPrio : cfg.recruitPrio;
    const sorted  = [...bType.canRecruit].sort((a, b2) => {
      const ai = prio.indexOf(a), bi = prio.indexOf(b2);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    for (const unitType of sorted) {
      const cost = UNIT_TYPES[unitType]?.cost || {};
      if (resSim.iron >= (cost.iron || 0) &&
          resSim.oil  >= (cost.oil  || 0) &&
          resSim.wood >= (cost.wood || 0) &&
          resSim.components >= (cost.components || 0)) {
        actions.push({ type: 'recruit', buildingId: b.id, unitType });
        resSim.iron -= (cost.iron || 0);
        resSim.oil  -= (cost.oil  || 0);
        resSim.wood -= (cost.wood || 0);
        resSim.components -= (cost.components || 0);
        break;
      }
    }
  }

  return actions;
}
