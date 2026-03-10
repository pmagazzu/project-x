/**
 * AIPlayer.js — First-iteration AI for Attrition
 *
 * Strategy (priority order per unit):
 *   1. Attack from current position if enemy in range
 *   2. Move toward best scored destination (capture > attack-after-move > advance toward enemy)
 *   3. Attack again from new position
 * Then:
 *   4. Recruit cheapest affordable unit at each available building
 *
 * The AI has "perfect" positional knowledge (no fog penalty) but plays
 * straightforward tactics — no look-ahead or flanking.
 */

import {
  UNIT_TYPES, BUILDING_TYPES, AIR_UNITS,
  getReachableHexes, getAttackableHexes, hexDistance,
  resolveImmediateAttack, queueRecruit,
} from './GameState.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function chooseBestTarget(gs, unit, attackTargets) {
  // Prefer: enemies close to death > closest distance
  let best = null, bestScore = -Infinity;
  for (const hex of attackTargets) {
    const target = gs.units.find(u => u.q === hex.q && u.r === hex.r && u.owner !== unit.owner && !u.embarked);
    if (!target) continue;
    // Score: almost-dead targets first, then low health, then proximity
    const hpScore   = (target.maxHealth - target.health) * 3;
    const nearScore = 5 - hexDistance(unit.q, unit.r, target.q, target.r);
    const score = hpScore + target.maxHealth - target.health + nearScore;
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}

function scoreDestination(gs, unit, q, r, enemies, capTargets) {
  let score = 0;

  // Capture bonus: land on an unowned building
  const bldg = gs.buildings.find(b => b.q === q && b.r === r &&
    b.type !== 'ROAD' && b.owner !== unit.owner);
  if (bldg) score += 60;

  // Attack-after-move bonus
  const attackable = getAttackableHexes(gs, unit, q, r, null);
  if (attackable.length > 0) {
    score += 25 + attackable.length * 4;
    // Extra reward if a near-death enemy is reachable
    for (const h of attackable) {
      const t = gs.units.find(u => u.q === h.q && u.r === h.r && u.owner !== unit.owner);
      if (t && t.health <= 1) score += 30;
    }
  }

  // Proximity to nearest enemy (small bonus for advancing)
  if (enemies.length > 0) {
    const nearestEnemyDist = Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r)));
    score += Math.max(0, 10 - nearestEnemyDist);
  }

  // Proximity to nearest capture target
  if (capTargets.length > 0) {
    const nearestCapDist = Math.min(...capTargets.map(b => hexDistance(q, r, b.q, b.r)));
    const currentCapDist = Math.min(...capTargets.map(b => hexDistance(unit.q, unit.r, b.q, b.r)));
    if (nearestCapDist < currentCapDist) score += 15;
  }

  // Small random tiebreaker so AI doesn't always pick the same hex
  score += Math.random() * 2;

  return score;
}

// ── Main AI turn runner ────────────────────────────────────────────────────

export function runAITurn(gs, terrain, mapSize) {
  const player  = gs.currentPlayer;
  const log     = [];

  const getEnemies    = () => gs.units.filter(u => u.owner !== player && !u.embarked);
  const getCapTargets = () => gs.buildings.filter(b => b.owner !== player && b.type !== 'ROAD');

  // Process units in a stable order: attackers first, then movers
  const unitIds = gs.units
    .filter(u => u.owner === player && !u.embarked)
    .sort((a, b) => {
      // Prioritise units that can already attack without moving
      const aAtk = getAttackableHexes(gs, a, a.q, a.r, null).length;
      const bAtk = getAttackableHexes(gs, b, b.q, b.r, null).length;
      return bAtk - aAtk;
    })
    .map(u => u.id);

  for (const uid of unitIds) {
    const unit = gs.units.find(u => u.id === uid);
    if (!unit || unit.owner !== player || unit.embarked) continue;

    // Air units: skip if out of fuel (they'll crash at end-of-turn anyway)
    if (unit.fuel !== undefined && unit.fuel <= 0) continue;

    // A) Attack from current position
    if (!unit.attacked) {
      const targets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
      const target  = chooseBestTarget(gs, unit, targets);
      if (target) {
        resolveImmediateAttack(gs, unit, target.id);
        unit.attacked = true;
        // Unit may have died in counter-attack
        if (!gs.units.find(u => u.id === uid)) continue;
        log.push(`${UNIT_TYPES[unit.type].name} attacked`);
      }
    }

    // B) Move toward best destination
    if (!unit.moved) {
      // Temporarily set movesLeft so getReachableHexes uses full budget
      const savedMovesLeft = unit.movesLeft;
      unit.movesLeft = UNIT_TYPES[unit.type].move;

      const reachable = getReachableHexes(gs, unit, terrain, mapSize);
      unit.movesLeft  = savedMovesLeft; // restore

      if (reachable.length > 0) {
        const enemies    = getEnemies();
        const capTargets = getCapTargets();

        let bestDest = null, bestScore = -Infinity;
        for (const hex of reachable) {
          const s = scoreDestination(gs, unit, hex.q, hex.r, enemies, capTargets);
          if (s > bestScore) { bestScore = s; bestDest = hex; }
        }

        // Fallback: if nothing scored well, just advance toward nearest enemy
        if (!bestDest || bestScore <= 0) {
          if (enemies.length > 0) {
            const nearest = enemies.reduce((a, b) =>
              hexDistance(unit.q, unit.r, a.q, a.r) <= hexDistance(unit.q, unit.r, b.q, b.r) ? a : b
            );
            bestDest = reachable.reduce((a, b) =>
              hexDistance(a.q, a.r, nearest.q, nearest.r) <= hexDistance(b.q, b.r, nearest.q, nearest.r) ? a : b
            );
          } else {
            bestDest = reachable[0];
          }
        }

        if (bestDest) {
          unit.q = bestDest.q;
          unit.r = bestDest.r;
          unit.moved     = true;
          unit.movesLeft = 0;
          log.push(`${UNIT_TYPES[unit.type].name} moved to (${bestDest.q},${bestDest.r})`);

          // C) Attack from new position
          if (!unit.attacked) {
            const targets2 = getAttackableHexes(gs, unit, unit.q, unit.r, null);
            const target2  = chooseBestTarget(gs, unit, targets2);
            if (target2) {
              resolveImmediateAttack(gs, unit, target2.id);
              unit.attacked = true;
              if (!gs.units.find(u => u.id === uid)) continue;
              log.push(`${UNIT_TYPES[unit.type].name} attacked after move`);
            }
          }
        }
      }
    }

    // Mark unit as done (so it doesn't appear available for more moves)
    if (!unit.moved)    unit.moved    = true;
    if (!unit.attacked) unit.attacked = true;
  }

  // --- Phase 2: Recruit at buildings ---
  const myBuildings = gs.buildings.filter(
    b => b.owner === player && !b.underConstruction && b.type !== 'ROAD'
  );

  for (const b of myBuildings) {
    const bType = BUILDING_TYPES[b.type];
    if (!bType?.canRecruit?.length) continue;

    const alreadyQueued = gs.pendingRecruits.some(r => r.buildingId === b.id && r.owner === player);
    if (alreadyQueued) continue;

    const res = gs.players[player];
    for (const unitType of bType.canRecruit) {
      const cost = UNIT_TYPES[unitType]?.cost || {};
      if ((res.iron || 0) >= (cost.iron || 0) &&
          (res.oil  || 0) >= (cost.oil  || 0) &&
          (res.wood || 0) >= (cost.wood || 0)) {
        queueRecruit(gs, player, unitType, b.id);
        // Deduct cost immediately so later buildings see updated resources
        res.iron = (res.iron || 0) - (cost.iron || 0);
        res.oil  = (res.oil  || 0) - (cost.oil  || 0);
        res.wood = (res.wood || 0) - (cost.wood || 0);
        log.push(`Recruited ${UNIT_TYPES[unitType].name} at ${BUILDING_TYPES[b.type].name}`);
        break;
      }
    }
  }

  return log;
}
