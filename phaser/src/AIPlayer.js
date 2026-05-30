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
  MODULES, CHASSIS_BUILDINGS, getMaxDesignSlots,
  designRegistrationCost, computeDesignStats,
  getReachableHexesForAI, getAttackableHexes, hexDistance, buildingAt, roadAt, getCachedSupply, getRecruitFoodCost, getUnitPopCost,
  ROAD_TYPES, unitAt, computeFog, buildHQRoadNetwork, isHQNetworkPluggedToNeutralRoads,
  queueGlobalRecruit, enumerateVtcDeployHexes,
  getGlobalRecruitOptionsForVTC, canQueueGlobalRecruit, PRODUCTION_VTC_TYPES, MAX_VTC_TRAIN_QUEUE,
  pruneVtcQueueBacklog, getMaxVtcQueueDepth,
  getPlayerCapital, getPlayerCapitalBuildings, getEnemyCapitalBuildings, isPlayerCapitalBuilding,
  isNavalDeployAllowed, getNavalCoastalCheckRadius, canPromoteSettlement, VTC_SUPPLY_RADIUS, findRoadPath, canPlaceRoadOnTerrain,
  recalcPlayerPopulation, syncPlayerPopulationPool, calcPopUsedByPlayer, calcPopFieldedByPlayer, getPopBreakdown, canAffordPipelinePop,
  countPlayerScienceLabs, countPlayerFactories, countPlayerBarracksFacilities, countPlayerVtcUpgrade,
} from './GameState.js';
import { calcPlayerPopCap } from './Population.js';
import {
  getVtcUpgradeMenu, purchaseVtcUpgrade, isVtcUpgradeComplete, canPurchaseVtcUpgrade,
} from './SettlementSystem.js';
import { ensureAIDesigns, pickAIRecruit, getClosingPressure } from './AIDesigner.js';
import {
  getActivePlayerCount, getAIArmyBudget, countPlayerCombatUnits,
  pickContestedVictoryZone, pickPrimaryEnemyHQ, getLocalClosingPressure,
  countFriendliesNear, getLandmassIndex, getPlayerHomeLandmassId,
  buildTheaterIntel, getStockpileSpendPressure, getEndgamePressure, estimateExtractorIncome,
} from './AIDoctrine.js';

const AI_TRANSPORT_TYPES = new Set(['LANDING_CRAFT', 'TRANSPORT_SM', 'TRANSPORT_MD', 'TRANSPORT_LG']);
/** Engineers no longer place legacy production buildings — use VTC UPGRADE menu instead. */
const ENGINEER_LEGACY_PRODUCTION = new Set([
  'BARRACKS', 'ADV_BARRACKS', 'VEHICLE_DEPOT', 'ARMOR_WORKS', 'SCIENCE_LAB', 'FACTORY',
  'AIRFIELD', 'ADV_AIRFIELD', 'HARBOR', 'NAVAL_YARD', 'SHIPYARD', 'DRY_DOCK', 'DRYDOCK',
  'NAVAL_BASE', 'NAVAL_DOCKYARD',
]);
/** Engineers still claim/build these — never cap-trim below road spam limits. */
const ENGINEER_RESOURCE_BUILDS = new Set(['MINE', 'OIL_PUMP', 'FARM', 'LUMBER_CAMP']);
import { TECH_TREE } from './ResearchData.js';

function getPerceivedEnemyUnits(gs, player, terrain, mapSize) {
  const now = Number(gs.turn || 1);
  const fogNow = computeFog(gs, player, mapSize, terrain);
  gs._aiEnemyIntel = gs._aiEnemyIntel || {};
  const intel = gs._aiEnemyIntel[player] || {};
  const nextIntel = {};

  const visibleEnemies = gs.units.filter(u => Number(u.owner) !== Number(player) && !u.embarked)
    .filter(u => fogNow.has(`${u.q},${u.r}`));
  for (const u of visibleEnemies) {
    nextIntel[u.id] = { id: u.id, owner: u.owner, type: u.type, q: u.q, r: u.r, seenTurn: now };
  }

  const maxIntelAge = 10;
  for (const [id, rec] of Object.entries(intel)) {
    const stillAlive = gs.units.some(u => Number(u.id) === Number(id) && Number(u.owner) !== Number(player));
    if (!stillAlive) continue;
    if ((now - (rec?.seenTurn || now)) > maxIntelAge) continue;
    if (!nextIntel[id]) nextIntel[id] = rec;
  }
  gs._aiEnemyIntel[player] = nextIntel;
  return Object.values(nextIntel);
}

const VTC_DEPLOY_TIER = { VILLAGE: 0, TOWN: 1, CITY: 2, HQ: 0 };

function vtcStrategicWeight(b) {
  if (!b) return 0;
  if (b.type === 'CITY') return 10;
  if (b.type === 'TOWN') return 7;
  if (b.type === 'VILLAGE') return 4;
  return 0;
}

function garrisonWantForVTC(vtc, turn, enemyNear) {
  if (vtc.isCapital) {
    if (enemyNear) return turn < 12 ? 2 : 1;
    return turn < 8 ? 1 : 0;
  }
  if (!enemyNear) {
    if (vtc.type === 'CITY') return turn >= 10 ? 2 : (turn >= 6 ? 1 : 0);
    if (vtc.type === 'TOWN') return turn >= 14 ? 1 : 0;
    return turn >= 18 ? 1 : 0;
  }
  let want = vtc.type === 'CITY' ? 3 : vtc.type === 'TOWN' ? 2 : 1;
  if (turn >= 20 && vtc.type === 'CITY') want += 1;
  return want;
}

function vtcSupplyRadius(vtc) {
  return VTC_SUPPLY_RADIUS[vtc?.type] ?? 3;
}

/** Next road hex on a mountain-avoiding path from network toward a VTC. */
function getVTCRoadExtensionTarget(gs, terrain, mapSize, player, vtc, capital) {
  const key = `${vtc.q},${vtc.r}`;
  const t0 = terrain?.[key] ?? 0;
  if (canPlaceRoadOnTerrain(t0) && !roadAt(gs, vtc.q, vtc.r)) return { q: vtc.q, r: vtc.r };

  const seeds = [];
  if (capital) seeds.push({ q: capital.q, r: capital.r });
  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(player) || !ROAD_TYPES.has(b.type)) continue;
    seeds.push({ q: b.q, r: b.r });
  }
  if (!seeds.length) return null;

  let best = null;
  let bestLen = Infinity;
  for (const s of seeds) {
    const path = findRoadPath(terrain, mapSize, s.q, s.r, vtc.q, vtc.r);
    if (!path?.length) continue;
    const missing = path.find(h => {
      const tt = terrain?.[`${h.q},${h.r}`] ?? 0;
      return canPlaceRoadOnTerrain(tt) && !roadAt(gs, h.q, h.r);
    });
    if (missing && path.length < bestLen) {
      best = missing;
      bestLen = path.length;
    }
  }
  return best;
}

/** Patrol / fortify anchor in the VTC supply bubble (prefer hills and ring positions). */
function pickVTCPatrolHex(gs, terrain, mapSize, vtc, unit) {
  const rad = vtcSupplyRadius(vtc);
  let best = null;
  let bestScore = -Infinity;
  for (let dq = -rad; dq <= rad; dq++) {
    for (let dr = -rad; dr <= rad; dr++) {
      const q = vtc.q + dq, r = vtc.r + dr;
      if (q < 0 || r < 0 || q >= mapSize || r >= mapSize) continue;
      if (hexDistance(q, r, vtc.q, vtc.r) > rad) continue;
      const tt = terrain?.[`${q},${r}`] ?? 0;
      if (!canPlaceRoadOnTerrain(tt) && tt !== 3) continue;
      const occupant = unitAt(gs, q, r);
      if (occupant && occupant.id !== unit?.id) continue;
      const dV = hexDistance(q, r, vtc.q, vtc.r);
      const dU = unit ? hexDistance(unit.q, unit.r, q, r) : 0;
      let score = 12 - Math.abs(dV - Math.max(2, rad - 2)) * 2;
      if (tt === 3) score += 8;
      if (dV <= 1) score -= 6;
      if (dU > 0 && dU < dV) score += 4;
      if (score > bestScore) { bestScore = score; best = { q, r }; }
    }
  }
  return best || { q: vtc.q, r: vtc.r };
}

function findVTCDepotPad(gs, terrain, mapSize, player, vtc) {
  const rad = Math.min(4, vtcSupplyRadius(vtc));
  for (let d = 1; d <= rad; d++) {
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      const q = vtc.q + dq * d, r = vtc.r + dr * d;
      if (q < 0 || r < 0 || q >= mapSize || r >= mapSize) continue;
      const tt = terrain?.[`${q},${r}`] ?? 0;
      if (!canPlaceRoadOnTerrain(tt)) continue;
      const b = buildingAt(gs, q, r);
      if (b && !ROAD_TYPES.has(b.type)) continue;
      if (depotCoversHex(gs, player, vtc.q, vtc.r, vtcSupplyRadius(vtc) + 2)) return null;
      return { q, r };
    }
  }
  return null;
}

function listOwnedVTCSorted(gs, player, perceivedEnemies = [], capital = null) {
  return gs.buildings
    .filter(b => Number(b.owner) === Number(player) && !b.underConstruction
      && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type))
    .map((vtc) => {
      const threat = perceivedEnemies.filter(e => hexDistance(e.q, e.r, vtc.q, vtc.r) <= 14).length;
      return {
        vtc,
        weight: vtcStrategicWeight(vtc),
        threat,
        dist: capital ? hexDistance(vtc.q, vtc.r, capital.q, capital.r) : 0,
      };
    })
    .sort((a, b) => b.weight - a.weight || b.threat - a.threat || b.dist - a.dist);
}

function isCombatUnitForGarrison(u) {
  const d = UNIT_TYPES[u.type] || {};
  const role = getUnitRole(u.type);
  return role !== 'engineer' && role !== 'support'
    && ((d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0);
}

function canReassignForVTC(existing, vtc, guardsShort) {
  if (!existing) return true;
  if (existing.mission === 'hold_vtc' || existing.kind === 'settlement') return false;
  if (['scout', 'probe', 'expand', 'diversion', 'garrison'].includes(existing.mission)) return true;
  if (guardsShort && (vtc.type === 'CITY' || vtc.type === 'TOWN')) {
    return ['main', 'closing'].includes(existing.mission);
  }
  return false;
}

/** Reserve combat units on owned VTCs before the main-push blob forms. */
function assignOwnedVTCCoverage(gs, player, unitObjective, combatUnits, perceivedEnemies = [], mapSize = 40) {
  const turn = gs.turn || 1;
  if (turn < 2) return;
  const capital = getPlayerCapital(gs, player);
  const owned = listOwnedVTCSorted(gs, player, perceivedEnemies, capital);
  if (!owned.length) return;

  const pool = combatUnits.filter(isCombatUnitForGarrison);
  const used = new Set();
  const ownedCount = owned.length;
  const holdCapPct = ownedCount >= 3 ? 0.5 : (ownedCount >= 2 ? 0.45 : 0.4);
  const maxHoldAssign = Math.max(0, Math.min(
    pool.length - 2,
    Math.floor(pool.length * holdCapPct),
    perceivedEnemies.length > 0 ? pool.length : Math.max(2, Math.floor(pool.length * 0.4)),
  ));

  for (const { vtc, threat } of owned) {
    if (used.size >= maxHoldAssign) break;
    const enemyNear = threat > 0;
    if (pool.length <= 8 && !enemyNear && !vtc.isCapital) continue;
    const want = garrisonWantForVTC(vtc, turn, enemyNear);
    if (want <= 0) continue;
    let onStation = gs.units.filter(u =>
      Number(u.owner) === Number(player) && !u.embarked && isCombatUnitForGarrison(u)
      && hexDistance(u.q, u.r, vtc.q, vtc.r) <= 2).length;
    let assigned = 0;
    while (onStation + assigned < want) {
      let best = null;
      let bestScore = -Infinity;
      for (const u of pool) {
        if (used.has(u.id)) continue;
        const existing = unitObjective[u.id];
        if (!canReassignForVTC(existing, vtc, onStation + assigned < want)) continue;
        const d = hexDistance(u.q, u.r, vtc.q, vtc.r);
        if (d > 28) continue;
        let score = vtcStrategicWeight(vtc) * 8 - d;
        if (capital && !vtc.isCapital) score += Math.min(12, hexDistance(u.q, u.r, capital.q, capital.r) * 0.15);
        if (existing?.mission === 'main' || existing?.mission === 'closing') score -= 4;
        if (score > bestScore) { bestScore = score; best = u; }
      }
      if (!best) break;
      const patrol = pickVTCPatrolHex(gs, null, mapSize, vtc, best);
      unitObjective[best.id] = {
        q: patrol.q, r: patrol.r, mission: 'hold_vtc', kind: 'settlement', vtcType: vtc.type,
        anchorQ: vtc.q, anchorR: vtc.r, patrol: true,
      };
      used.add(best.id);
      assigned += 1;
    }
  }
}

function getOwnedProductionAnchors(gs, player) {
  return gs.buildings.filter(bb =>
    PRODUCTION_VTC_TYPES.has(bb.type) && Number(bb.owner) === Number(player) && !bb.underConstruction);
}

function pickBestVTCToQueue(gs, player, unitType, capital) {
  const isNaval = NAVAL_UNITS.has(unitType);
  const anchors = getOwnedProductionAnchors(gs, player)
    .map(bb => ({
      building: bb,
      dist: capital ? hexDistance(bb.q, bb.r, capital.q, capital.r) : 0,
      coastal: isNavalDeployAllowed(gs, bb, getNavalCoastalCheckRadius(bb)),
      deployHexes: isNaval
        ? enumerateVtcDeployHexes(gs, player, bb.id, unitType).length
        : 0,
      tier: VTC_DEPLOY_TIER[bb.type] ?? (bb.isCapital ? 0 : -1),
      isCap: isPlayerCapitalBuilding(bb),
    }))
    .filter(a => getGlobalRecruitOptionsForVTC(gs, player, a.building.id).includes(unitType))
    .filter(a => (a.building.trainQueue?.length || 0) < getMaxVtcQueueDepth(gs, player))
    .filter(a => !isNaval || a.deployHexes > 0);
  if (!anchors.length) return null;
  if (isNaval) {
    anchors.sort((a, b) => (b.deployHexes - a.deployHexes)
      || (b.tier - a.tier)
      || (b.coastal - a.coastal)
      || (a.dist - b.dist)
      || ((a.building.trainQueue?.length || 0) - (b.building.trainQueue?.length || 0)));
    return anchors[0].building;
  }
  if (!isNaval) {
    anchors.sort((a, b) => {
      const qa = a.building.trainQueue?.length || 0;
      const qb = b.building.trainQueue?.length || 0;
      if (qa !== qb) return qa - qb;
      if (a.isCap !== b.isCap) return a.isCap ? 1 : -1;
      return b.dist - a.dist;
    });
  }
  return anchors[0].building;
}

const AI_VILLAGE_FACILITY_PRIO = ['barracks', 'local_farm', 'road_link', 'housing'];
const AI_TOWN_FACILITY_PRIO = ['factory', 'science_lab', 'paved_network', 'market', 'suburbs', 'naval_yard'];
const AI_CITY_FACILITY_PRIO = ['urban_housing', 'suburbs'];

/** Buy UPGRADE-tab facilities at forward VTCs before queuing units that need them. */
function planAIVtcUpgrades(gs, player, actions, capital, perceivedEnemies, maxPerTurn = 2) {
  if ((gs.turn || 1) < 4) return;
  let planned = 0;
  for (const { vtc } of listOwnedVTCSorted(gs, player, perceivedEnemies, capital)) {
    if (planned >= maxPerTurn) break;
    if (vtc.isCapital || isPlayerCapitalBuilding(vtc)) continue;
    const menu = getVtcUpgradeMenu(gs, player, vtc.id);
    if (!menu || menu.capital || menu.promoting) continue;
    const prio = vtc.type === 'CITY'
      ? [...AI_VILLAGE_FACILITY_PRIO, ...AI_TOWN_FACILITY_PRIO, ...AI_CITY_FACILITY_PRIO]
      : vtc.type === 'TOWN'
        ? [...AI_VILLAGE_FACILITY_PRIO, ...AI_TOWN_FACILITY_PRIO]
        : AI_VILLAGE_FACILITY_PRIO;
    for (const uid of prio) {
      if (isVtcUpgradeComplete(vtc, uid)) continue;
      const it = menu.items.find(x => x.id === uid);
      if (!it || it.external || it.complete || it.building || !it.canBuy) continue;
      actions.push({ type: 'vtc_upgrade', buildingId: vtc.id, upgradeId: uid });
      planned++;
      break;
    }
    if (planned >= maxPerTurn) break;
    if (menu.canPromote?.ok) {
      actions.push({ type: 'upgrade_settlement', buildingId: vtc.id });
      planned++;
      break;
    }
  }
}

/** Army wiped — prioritize deploy ready units, then queue infantry/engineers at VTCs. */
function planArmyRecovery(gs, player, actions, resSim, spend, noteRecruit, recruitAllowed, myCapital, maxRecruitsThisTurn) {
  if (calcPopFieldedByPlayer(gs, player) > 0) return;

  recalcPlayerPopulation(gs, player);

  planDeployReadyVtcUnits(gs, player, actions, gs._terrain, {
    capital: myCapital,
    focusEnemy: getEnemyCapitalBuildings(gs, player)[0],
    unitObjective: {},
    territorial: null,
  });

  const queueAt = (building, unitType) => {
    if (!building) return false;
    const allowRecruit = recruitAllowed(unitType) || calcPopFieldedByPlayer(gs, player) < 1;
    if (!allowRecruit) return false;
    if ((building.trainQueue?.length || 0) >= getMaxVtcQueueDepth(gs, player)) return false;
    if (actions.some(a => a.type === 'recruit' && a.global && a.buildingId === building.id)) return false;
    if (!getGlobalRecruitOptionsForVTC(gs, player, building.id).includes(unitType)) return false;
    const check = canQueueGlobalRecruit(gs, player, unitType, building.id);
    if (!check.ok) return false;
    const c = UNIT_TYPES[unitType]?.cost || {};
    const f = getRecruitFoodCost(unitType);
    if (resSim.iron < (c.iron || 0) || resSim.oil < (c.oil || 0) || resSim.wood < (c.wood || 0)
      || resSim.food < f || resSim.components < (c.components || 0)) return false;
    actions.push({ type: 'recruit', buildingId: building.id, unitType, global: true });
    noteRecruit(unitType);
    spend(c);
    resSim.food -= f;
    return true;
  };

  const vtcs = gs.buildings.filter(b =>
    Number(b.owner) === Number(player) && PRODUCTION_VTC_TYPES.has(b.type) && !b.underConstruction);
  const sorted = [...vtcs].sort((a, b) => {
    const qa = a.trainQueue?.length || 0;
    const qb = b.trainQueue?.length || 0;
    if (qa !== qb) return qa - qb;
    if (isPlayerCapitalBuilding(a)) return -1;
    if (isPlayerCapitalBuilding(b)) return 1;
    return 0;
  });

  const rebuildOrder = ['INFANTRY', 'INFANTRY', 'ENGINEER', 'SUPPLY_TRUCK'];
  for (const unitType of rebuildOrder) {
    if (actions.filter(a => a.type === 'recruit').length >= maxRecruitsThisTurn) break;
    for (const b of sorted) {
      if (queueAt(b, unitType)) break;
    }
  }
}

function filterRecruitPrioForVtc(gs, player, unitList) {
  const avail = new Set();
  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(player) || !PRODUCTION_VTC_TYPES.has(b.type) || b.underConstruction) continue;
    if ((b.trainQueue?.length || 0) >= getMaxVtcQueueDepth(gs, player)) continue;
    for (const u of getGlobalRecruitOptionsForVTC(gs, player, b.id)) avail.add(u);
  }
  const filtered = unitList.filter(u => avail.has(u));
  return filtered.length ? filtered : ['INFANTRY'];
}

function scoreGlobalDeploySite(gs, player, site, ready, terrain, ctx) {
  const anchor = gs.buildings.find(b => b.id === site.buildingId);
  const isNaval = NAVAL_UNITS.has(ready.type);
  const t = terrain?.[`${site.q},${site.r}`] ?? 0;
  const isWater = t === 4 || t === 5;
  if (isNaval && !isWater) return -9999;
  if (!isNaval && isWater) return -9999;

  let score = 0;
  const { capital, focusEnemy, unitObjective, territorial } = ctx;

  if (anchor && capital && !isPlayerCapitalBuilding(anchor)) {
    score += hexDistance(anchor.q, anchor.r, capital.q, capital.r) * 1.4;
  }
  if (anchor?.type === 'CITY') score += 10;
  else if (anchor?.type === 'TOWN') score += 6;
  else if (anchor?.type === 'VILLAGE' && !anchor?.isCapital) score += 3;

  if (isNaval) {
    if (anchor && isNavalDeployAllowed(gs, anchor, getNavalCoastalCheckRadius(anchor))) score += 16;
    const nearCoastLand = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].some(([dq, dr]) => {
      const t2 = terrain?.[`${site.q + dq},${site.r + dr}`] ?? 0;
      return t2 !== 4 && t2 !== 5;
    });
    if (nearCoastLand) score += 8;
  }

  for (const b of gs.buildings) {
    if (!['VILLAGE', 'TOWN', 'CITY'].includes(b.type)) continue;
    const d = hexDistance(site.q, site.r, b.q, b.r);
    if (d > 3) continue;
    if (Number(b.owner) === Number(player) && !isPlayerCapitalBuilding(b)) score += 22 - d * 4;
    if (Number(b.owner) === 0) score += 14 - d * 3;
  }

  if (focusEnemy) score += Math.max(0, 28 - hexDistance(site.q, site.r, focusEnemy.q, focusEnemy.r));
  const combatDeploy = ['INFANTRY', 'ANTI_TANK', 'MORTAR', 'RECON', 'TANK', 'ARTILLERY', 'ASSAULT_INFANTRY'].includes(ready.type);
  if (combatDeploy) {
    score += countFriendliesNear(gs, player, site.q, site.r, 2) * -1.8;
    const threat = countHexThreats(gs, player, site.q, site.r, 4);
    score -= threat.ground * 2.2 + threat.indirect * 3;
  }

  const holdTarget = Object.values(unitObjective || {}).find(o =>
    (o?.mission === 'hold_vtc' || o?.kind === 'settlement') && o.q != null && hexDistance(o.q, o.r, site.q, site.r) <= 4);
  if (holdTarget) score += 18;

  const expand = territorial?.expansions?.find(e => hexDistance(e.q, e.r, site.q, site.r) <= 5);
  if (expand) score += expand.score || 6;

  if (site.buildingType === 'HQ' || anchor?.isCapital) score -= 4;
  return score;
}

/** Deploy every ready VTC unit when a spawn hex exists (never gate on deploy score). */
function planDeployReadyVtcUnits(gs, player, actions, terrain, deployCtx) {
  let added = 0;
  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(player) || !PRODUCTION_VTC_TYPES.has(b.type) || b.underConstruction) continue;
    for (const ready of b.readyUnits || []) {
      if (actions.some(a => a.type === 'global_deploy' && a.readyId === ready.id)) continue;
      const sites = enumerateVtcDeployHexes(gs, player, b.id, ready.type);
      if (!sites.length) continue;
      let best = sites[0];
      let bestScore = -Infinity;
      for (const site of sites) {
        const score = scoreGlobalDeploySite(gs, player, site, ready, terrain, deployCtx);
        if (score > bestScore) { bestScore = score; best = site; }
      }
      actions.unshift({
        type: 'global_deploy',
        readyId: ready.id,
        buildingId: b.id,
        q: best.q,
        r: best.r,
        unitType: ready.type,
      });
      added += 1;
    }
  }
  return added;
}

function isImmediateBacktrack(unit, dest, lastMove, turnNow) {
  if (!unit || !dest || !lastMove) return false;
  if (Number(turnNow - (lastMove.turn || 0)) > 6) return false;
  return unit.q === lastMove.toQ && unit.r === lastMove.toR
    && dest.q === lastMove.fromQ && dest.r === lastMove.fromR;
}

// ── Strategy definitions ───────────────────────────────────────────────────

export const AI_STRATEGIES = {
  aggressive: {
    label:         'Aggressive',
    recruitPrio:   ['TANK','INFANTRY','MORTAR','ARTILLERY','ANTI_TANK','SUPPLY_TRUCK','HALFTRACK'],
    navalPrio:     ['SUPPLY_SHIP','DESTROYER','MTB','TRANSPORT_MD','CRUISER_LT','PATROL_BOAT'],
    airPrio:       ['BIPLANE_FIGHTER','LIGHT_BOMBER','OBS_PLANE'],
    attackBonus:   20,   // extra score for attack-after-move
    captureBonus:  20,   // bonus for moving toward HQ or flag position
    retreatToHQ:   false,
    digInChance:   0,
  },
  defensive: {
    label:         'Defensive',
    recruitPrio:   ['ANTI_TANK','ARTILLERY','INFANTRY','MORTAR','MEDIC','SUPPLY_TRUCK'],
    navalPrio:     ['SUPPLY_SHIP','COASTAL_BATTERY','DESTROYER','TRANSPORT_MD','PATROL_BOAT'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   0,
    captureBonus:  40,
    retreatToHQ:   true,
    digInChance:   0.5,  // 50% chance to dig in after moving if no target
  },
  balanced: {
    label:         'Balanced',
    recruitPrio:   ['INFANTRY','ANTI_TANK','TANK','ARTILLERY','MORTAR','SUPPLY_TRUCK','HALFTRACK'],
    navalPrio:     ['SUPPLY_SHIP','TRANSPORT_MD','DESTROYER','PATROL_BOAT','MTB','TRANSPORT_SM'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   10,
    captureBonus:  30,
    retreatToHQ:   false,
    digInChance:   0.2,
  },
  adaptive: {
    label:         'Adaptive',
    recruitPrio:   ['INFANTRY','ANTI_TANK','TANK','ARTILLERY','MORTAR','HALFTRACK','SUPPLY_TRUCK'],
    navalPrio:     ['SUPPLY_SHIP','TRANSPORT_MD','DESTROYER','PATROL_BOAT','MTB','TRANSPORT_SM'],
    airPrio:       ['BIPLANE_FIGHTER','OBS_PLANE','LIGHT_BOMBER'],
    attackBonus:   12,
    captureBonus:  34,
    retreatToHQ:   false,
    digInChance:   0.25,
  },
  naval_heavy: {
    label:         'Naval Supremacy',
    recruitPrio:   ['INFANTRY','ANTI_TANK','MORTAR','SUPPLY_TRUCK'],
    navalPrio:     ['DESTROYER','CRUISER_LT','SUPPLY_SHIP','TRANSPORT_MD','PATROL_BOAT','MTB','BATTLESHIP'],
    airPrio:       ['OBS_PLANE','BIPLANE_FIGHTER'],
    attackBonus:   14,
    captureBonus:  22,
    retreatToHQ:   false,
    digInChance:   0.1,
    navalWeight:   1.45,
    airWeight:     0.85,
  },
  air_focus: {
    label:         'Air Dominance',
    recruitPrio:   ['INFANTRY','ANTI_TANK','ARTILLERY','SUPPLY_TRUCK'],
    navalPrio:     ['SUPPLY_SHIP','PATROL_BOAT','TRANSPORT_SM'],
    airPrio:       ['BIPLANE_FIGHTER','LIGHT_BOMBER','OBS_PLANE','MONOPLANE_FIGHTER','DIVE_BOMBER'],
    attackBonus:   16,
    captureBonus:  18,
    retreatToHQ:   false,
    digInChance:   0.08,
    navalWeight:   0.9,
    airWeight:     1.55,
  },
};

/** Pick strategy from map composition (naval maps → naval_heavy, etc.). */
export function pickAIStrategyForMap(terrain, mapSize = 40) {
  if (!terrain) return 'balanced';
  let water = 0;
  let land = 0;
  for (let q = 0; q < mapSize; q++) {
    for (let r = 0; r < mapSize; r++) {
      const t = terrain[`${q},${r}`] ?? 0;
      if (t === 3 || t === 4 || t === 5) water++;
      else land++;
    }
  }
  const waterRatio = water / Math.max(1, water + land);
  if (waterRatio >= 0.38) return 'naval_heavy';
  if (waterRatio >= 0.22) return Math.random() < 0.55 ? 'naval_heavy' : 'balanced';
  if (Math.random() < 0.18) return 'air_focus';
  return 'balanced';
}

/** Map + threat context for situational AI planning (islands, isolation, VP mode). */
export function assessMapSituation(terrain, mapSize, gs, player) {
  if (!terrain) return { waterRatio: 0, islandMap: false, safeAtHome: false, vpMode: false, ffaMode: false, playerCount: 2 };
  let water = 0, land = 0;
  const ms = mapSize || gs?._mapSize || 40;
  for (let q = 0; q < ms; q++) {
    for (let r = 0; r < ms; r++) {
      const t = terrain[`${q},${r}`] ?? 0;
      if (t === 3 || t === 4 || t === 5) water++;
      else land++;
    }
  }
  const waterRatio = water / Math.max(1, water + land);
  const islandMap = waterRatio >= 0.22;

  const myHQ = gs?.buildings?.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  let nearestThreat = Infinity;
  if (myHQ) {
    for (const u of (gs?.units || [])) {
      if (Number(u.owner) === Number(player) || u.embarked) continue;
      nearestThreat = Math.min(nearestThreat, hexDistance(myHQ.q, myHQ.r, u.q, u.r));
    }
    for (const b of (gs?.buildings || [])) {
      if (b.type !== 'HQ' || Number(b.owner) === Number(player)) continue;
      nearestThreat = Math.min(nearestThreat, hexDistance(myHQ.q, myHQ.r, b.q, b.r));
    }
  }
  const playerCount = getActivePlayerCount(gs);
  const ffaMode = playerCount >= 3;
  const vpMode = gs?.victoryMode === 'points';

  let contestedVpNearby = false;
  if (vpMode && myHQ && (gs?.victoryZones || []).length) {
    const vp = pickContestedVictoryZone(gs, player);
    if (vp && hexDistance(myHQ.q, myHQ.r, vp.q, vp.r) <= Math.max(14, Math.floor(ms * 0.4))) {
      contestedVpNearby = true;
    }
  }

  // Isolated start (not "safe to macro forever") — disabled in VP/FFA where we must project power.
  const safeAtHome = !vpMode && !ffaMode && islandMap
    && nearestThreat > Math.max(12, Math.floor(ms * 0.22))
    && !contestedVpNearby;

  return {
    waterRatio, islandMap, safeAtHome, vpMode, ffaMode, nearestThreat,
    playerCount, contestedVpNearby,
  };
}

function pickBestVictoryZoneTarget(gs, player) {
  return pickContestedVictoryZone(gs, player);
}

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

function getOpeningMilestones(gs, player, situation = null) {
  const turn = gs.turn || 1;
  const myBuildings = gs.buildings.filter(b => b.owner === player && !b.underConstruction);
  const myUnits = gs.units.filter(u => u.owner === player && !u.embarked);

  const count = (types) => myBuildings.filter(b => types.includes(b.type)).length;
  const unitCount = (types) => myUnits.filter(u => types.includes(u.type)).length;

  const counts = {
    roads: count(['ROAD','GRAVEL_ROAD','CONCRETE_ROAD','RAILWAY']),
    mines: count(['MINE']),
    pumps: count(['OIL_PUMP']),
    farms: count(['FARM']),
    lumber: count(['LUMBER_CAMP']),
    labs: countPlayerScienceLabs(gs, player),
    factories: countPlayerFactories(gs, player),
    barracks: countPlayerBarracksFacilities(gs, player),
    supplyTrucks: unitCount(['SUPPLY_TRUCK']),
    supplyShips: unitCount(['SUPPLY_SHIP']),
  };

  const macroBoost = (situation?.safeAtHome && !situation?.vpMode) ? 1.35 : 1;
  const amphibious = situation?.islandMap || (situation?.waterRatio || 0) >= 0.15;
  const desired = {
    roads:       Math.round((turn <= 3 ? 2 : turn <= 6 ? 4 : turn <= 9 ? 8 : turn <= 14 ? 12 : 16) * macroBoost),
    mines:       turn <= 4 ? 2 : turn <= 10 ? 3 : turn <= 18 ? 4 : 5,
    pumps:       turn <= 5 ? 1 : turn <= 10 ? 2 : turn <= 18 ? 3 : 4,
    farms:       turn <= 6 ? 1 : turn <= 10 ? 2 : turn <= 16 ? 3 : 4,
    lumber:      turn <= 8 ? 1 : 2,
    labs:        turn <= 8 ? 1 : turn <= 14 ? 2 : 3,
    factories:   turn <= 9 ? 0 : turn <= 16 ? 1 : 2,
    barracks:    situation?.ffaMode ? (turn <= 10 ? 1 : 2) : (turn <= 7 ? 1 : turn <= 14 ? 2 : 3),
    supplyTrucks: amphibious
      ? (turn <= 6 ? 0 : turn <= 14 ? 1 : 2)
      : (turn <= 12 ? 0 : turn <= 22 ? 1 : 2),
    supplyShips: amphibious ? (turn <= 8 ? 0 : turn <= 16 ? 1 : 2) : 0,
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
      supplyShips: Math.max(0, desired.supplyShips - counts.supplyShips),
    }
  };
}

function getPhaseWeights(turn = 1, situation = null) {
  // Multi-objective AI doctrine: supply/econ + recon early, but keep skirmishes alive (not pure turtling).
  let w;
  if (turn <= 8) {
    w = { economy: 1.28, logistics: 1.38, recon: 1.25, research: 1.15, combat: 1.0, raiding: 1.12, naval: 0.92, air: 0.88 };
  } else if (turn <= 16) {
    w = { economy: 1.12, logistics: 1.2, recon: 1.1, research: 1.25, combat: 1.08, raiding: 1.12, naval: 1.05, air: 1.0 };
  } else {
    w = { economy: 0.95, logistics: 1.05, recon: 0.95, research: 1.1, combat: 1.3, raiding: 1.25, naval: 1.15, air: 1.2 };
  }
  if (situation?.safeAtHome && turn <= 24) {
    w.economy *= 1.32;
    w.logistics *= 1.42;
    w.research *= 1.18;
    w.naval *= 1.48;
    w.combat *= 0.68;
    w.raiding *= 0.72;
  }
  if (situation?.islandMap && turn <= 30 && !situation?.vpMode) {
    w.economy *= 1.12;
    w.naval *= 1.18;
    w.logistics *= 1.08;
  }
  if (situation?.vpMode) {
    w.combat *= 1.28;
    w.raiding *= 1.35;
    w.economy *= 0.88;
    w.logistics *= 0.95;
    if (turn <= 40) w.naval *= 1.22;
  }
  if (situation?.ffaMode) {
    w.raiding *= 1.2;
    w.combat *= 1.12;
  }
  return w;
}

function getRoadFloor(turn = 1) {
  if (turn <= 5) return 2;
  if (turn <= 10) return 5;
  if (turn <= 15) return 8;
  return 12;
}

/** Road-like segments for logistics targets (matches supply / ROAD_TYPES). */
function countPlayerRoadLike(gs, player) {
  return gs.buildings.filter(b => Number(b.owner) === Number(player) && ROAD_TYPES.has(b.type)).length;
}

function getFrontlineDistanceEstimate(gs, player) {
  const myHQs = gs.buildings.filter(b => b.type === 'HQ' && Number(b.owner) === Number(player));
  const scopedEnemy = gs?._aiEnemyView?.[player];
  const enemyUnits = Array.isArray(scopedEnemy)
    ? scopedEnemy
    : gs.units.filter(u => Number(u.owner) !== Number(player) && !u.embarked);
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

function getDynamicRoadTarget(gs, player, situation = null, armyBudget = null) {
  const base = getRoadFloor(gs.turn || 1);
  const myUnits = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked);
  const roadsNow = countPlayerRoadLike(gs, player);
  const unsupplied = myUnits.filter(u => (u.outOfSupply || 0) > 0).length;
  const frontlineDist = getFrontlineDistanceEstimate(gs, player);
  const mapN = Number(gs._mapSize || 40);

  const unitPressure = Math.ceil(myUnits.length / 8);
  const supplyPressure = unsupplied >= 1 ? (1 + Math.ceil(unsupplied / 3)) : 0;
  const spanPressure = situation?.safeAtHome ? Math.ceil(frontlineDist / 12) : Math.ceil(frontlineDist / 7);
  const mapPressure = Math.max(0, Math.ceil((mapN - 40) / 22));
  const islandPressure = (situation?.islandMap && situation?.safeAtHome) ? Math.ceil(mapN / 18) : 0;
  let cap = Math.min(64, Math.max(20, Math.floor(mapN * 0.3) + 10));
  if (armyBudget?.maxRoads) cap = Math.min(cap, armyBudget.maxRoads);
  if (situation?.vpMode) cap = Math.min(cap, armyBudget?.maxRoads || 22);

  let target = Math.max(base, Math.min(cap, base + unitPressure + supplyPressure + spanPressure + mapPressure + islandPressure));
  // Small armies should not chase a T200 road quota — prevents infinite stabilize loops.
  if (myUnits.length <= 8) {
    target = Math.min(target, roadsNow + Math.max(3, Math.ceil(myUnits.length / 2)));
  }
  if (myUnits.length <= 4) {
    target = Math.min(target, roadsNow + 2);
  }
  return target;
}

/** Cap move scoring work — full reachable set can be 40+ hexes per unit per turn. */
function pickReachableForScoring(reachable, unit, objective, maxCandidates = 26) {
  if (!reachable?.length || reachable.length <= maxCandidates) return reachable || [];
  const oq = objective?.q ?? unit.q;
  const or = objective?.r ?? unit.r;
  return [...reachable]
    .sort((a, b) => hexDistance(a.q, a.r, oq, or) - hexDistance(b.q, b.r, oq, or))
    .slice(0, maxCandidates);
}

function unitPlanPriority(unit) {
  const role = getUnitRole(unit.type);
  if (role === 'assault') return 5;
  if (role === 'line') return 4;
  if (role === 'indirect') return 3;
  if (role === 'recon') return 2;
  if (unit.type === 'ENGINEER') return 1;
  return 0;
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

const FORT_BUILDING_TYPES = new Set([
  'FORT_T0', 'FORT_T1', 'FORT_T2', 'FORT_T3', 'FORT_T4', 'FORT_T5',
  'SANDBAG', 'TRENCH', 'BUNKER', 'FIELD_OUTPOST', 'OBS_POST', 'BARBED_WIRE', 'SUPPLY_DEPOT',
]);
const HEAVY_FORT_TYPES = new Set(['FORT_T3', 'FORT_T4', 'FORT_T5', 'BUNKER']);

function getUnclaimedResourceSites(gs, player) {
  const sites = [];
  for (const [k, v] of Object.entries(gs.resourceHexes || {})) {
    const [q, r] = k.split(',').map(Number);
    const b = gs.buildings.find((bb) => bb.q === q && bb.r === r && !ROAD_TYPES.has(bb.type));
    const owned = b && (b.type === 'MINE' || b.type === 'OIL_PUMP') && Number(b.owner) === Number(player);
    if (owned) continue;
    const contested = !!(b && Number(b.owner) !== Number(player) && (b.type === 'MINE' || b.type === 'OIL_PUMP'));
    sites.push({
      q, r,
      resType: v?.type || 'IRON',
      priority: (v?.type === 'OIL' ? 10 : 8) + (contested ? 5 : 0),
      contested,
    });
  }
  return sites;
}

function countFortsNearHex(gs, player, q, r, radius = 2) {
  let n = 0;
  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(player)) continue;
    if (!FORT_BUILDING_TYPES.has(b.type)) continue;
    if (hexDistance(b.q, b.r, q, r) <= radius) n += 1;
  }
  return n;
}

function findFortPadHex(gs, terrain, mapSize, resQ, resR, player) {
  let best = null;
  let bestScore = -Infinity;
  for (const [dq, dr] of _CHOKE_DIRS) {
    const nq = resQ + dq;
    const nr = resR + dr;
    if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
    const t = terrain?.[`${nq},${nr}`] ?? 0;
    if (t === 2 || t === 4 || t === 5) continue;
    const b = buildingAt(gs, nq, nr);
    if (b && !ROAD_TYPES.has(b.type)) continue;
    let score = 10 - hexDistance(nq, nr, resQ, resR);
    const nearEnemy = gs.units.some((u) => Number(u.owner) !== Number(player) && !u.embarked
      && hexDistance(u.q, u.r, nq, nr) <= 5);
    if (nearEnemy) score += 4;
    if (chokepointLandValue(terrain, mapSize, nq, nr) >= 3) score += 3;
    if (score > bestScore) { bestScore = score; best = { q: nq, r: nr }; }
  }
  return best;
}

function pickEngineerTask(gs, player, engineer, strategic, mapSize, claimedTasks, terrain) {
  const key = `${engineer.q},${engineer.r}`;
  const hasRoad = !!roadAt(gs, engineer.q, engineer.r);
  const res = gs.resourceHexes?.[key];
  const myHQ = gs.buildings.find((b) => b.type === 'HQ' && b.owner === player);
  const turn = gs.turn || 1;

  // Standing on a resource: claim it immediately.
  if (res && !gs.buildings.some((b) => b.q === engineer.q && b.r === engineer.r
    && (b.type === 'MINE' || b.type === 'OIL_PUMP') && Number(b.owner) === Number(player))) {
    return { type: 'resource', q: engineer.q, r: engineer.r, resType: res.type };
  }

  // Owned extractor here: road + ring fort on adjacent pads.
  const ownedExtract = gs.buildings.find((b) => b.q === engineer.q && b.r === engineer.r
    && (b.type === 'MINE' || b.type === 'OIL_PUMP') && Number(b.owner) === Number(player));
  if (ownedExtract && res) {
    const forts = countFortsNearHex(gs, player, engineer.q, engineer.r, 2);
    if (forts < 2 && turn >= 4) {
      const pad = findFortPadHex(gs, terrain, mapSize, engineer.q, engineer.r, player);
      if (pad) {
        const tk = `${pad.q},${pad.r}`;
        if (!claimedTasks?.has(tk)) {
          if (claimedTasks) claimedTasks.add(tk);
          const unlocked = new Set(gs.players[player]?.research?.unlocked || []);
          const fortType = pickFortTypeForHex(gs, player, pad.q, pad.r, { kind: 'resource' }, unlocked, null);
          return { type: 'fort', q: pad.q, r: pad.r, anchorQ: engineer.q, anchorR: engineer.r, fortType };
        }
      }
    }
    if (!hasRoad) return { type: 'road', q: engineer.q, r: engineer.r };
  }

  // Empire nodes: FOB/resource corridor needs depot + fort ring.
  if (turn >= 8) {
    for (const node of getEmpireNodes(gs, player)) {
      if (!depotCoversHex(gs, player, node.q, node.r) && hexDistance(engineer.q, engineer.r, node.q, node.r) <= 10) {
        const tk = `${node.q},${node.r}`;
        if (!claimedTasks?.has(tk)) {
          if (claimedTasks) claimedTasks.add(tk);
          return { type: 'empire', q: node.q, r: node.r, nodeKind: node.kind, needsDepot: true };
        }
      }
      const forts = countFortsNearHex(gs, player, node.q, node.r, 2);
      if (forts < 2) {
        const pad = findFortPadHex(gs, terrain, mapSize, node.q, node.r, player);
        if (pad && hexDistance(engineer.q, engineer.r, pad.q, pad.r) <= 12) {
          const tk = `${pad.q},${pad.r}`;
          if (!claimedTasks?.has(tk)) {
            if (claimedTasks) claimedTasks.add(tk);
            const unlocked = new Set(gs.players[player]?.research?.unlocked || []);
            const fortType = pickFortTypeForHex(gs, player, pad.q, pad.r, { kind: node.kind }, unlocked, null);
            return { type: 'fort', q: pad.q, r: pad.r, anchorQ: node.q, anchorR: node.r, fortType, nodeKind: node.kind };
          }
        }
      }
    }
  }

  // Early-game priority: rush unclaimed resource hexes before corridor wander.
  const sites = getUnclaimedResourceSites(gs, player);
  if (sites.length > 0 && turn <= 22) {
    const ranked = [...sites].sort((a, b) => {
      const scoreSite = (s) => s.priority
        - hexDistance(engineer.q, engineer.r, s.q, s.r) * 1.8
        + (myHQ ? hexDistance(myHQ.q, myHQ.r, s.q, s.r) * 0.08 : 0);
      return scoreSite(b) - scoreSite(a);
    });
    for (const s of ranked) {
      const tk = `${s.q},${s.r}`;
      if (claimedTasks?.has(tk)) continue;
      if (claimedTasks) claimedTasks.add(tk);
      return { type: 'resource', q: s.q, r: s.r, resType: s.resType };
    }
  }

  const terr = strategic?.territorial;
  if (turn >= 7 && terr?.bridgeSites?.length) {
    const unlocked = new Set(gs.players[player]?.research?.unlocked || []);
    if (unlocked.has('supply_depot')) {
      const rankedPorts = [...terr.bridgeSites]
        .filter(bs => !gs.buildings.some(b => b.owner === player && b.type === 'SUPPLY_PORT'
          && !b.underConstruction && hexDistance(b.q, b.r, bs.q, bs.r) <= 2))
        .sort((a, b) => hexDistance(engineer.q, engineer.r, a.q, a.r) - hexDistance(engineer.q, engineer.r, b.q, b.r));
      for (const bs of rankedPorts.slice(0, 4)) {
        if (hexDistance(engineer.q, engineer.r, bs.q, bs.r) > 16) continue;
        const tk = `port:${bs.q},${bs.r}`;
        if (claimedTasks?.has(tk)) continue;
        if (claimedTasks) claimedTasks.add(tk);
        return { type: 'supply_port_site', q: bs.q, r: bs.r, bridgeKind: bs.kind };
      }
    }
  }

  if (!hasRoad) return { type: 'road', q: engineer.q, r: engineer.r };

  // Owned VTC doctrine: supply roads, depot pads, fort rings before random corridor wander.
  const capital = getPlayerCapital(gs, player);
  const ownedVTCs = gs.buildings
    .filter(b => Number(b.owner) === Number(player) && !b.underConstruction
      && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type))
    .sort((a, b) => vtcStrategicWeight(b) - vtcStrategicWeight(a));
  for (const vtc of ownedVTCs) {
    if (vtc.isCapital) continue;
    const roadTarget = getVTCRoadExtensionTarget(gs, terrain, mapSize, player, vtc, capital);
    if (roadTarget) {
      const tk = `vtcrd:${roadTarget.q},${roadTarget.r}`;
      if (!claimedTasks?.has(tk)) {
        if (claimedTasks) claimedTasks.add(tk);
        if (hexDistance(engineer.q, engineer.r, roadTarget.q, roadTarget.r) <= 18) {
          return { type: 'vtc_road', q: roadTarget.q, r: roadTarget.r, anchorQ: vtc.q, anchorR: vtc.r };
        }
      }
    }
    if (turn >= 10 && !depotCoversHex(gs, player, vtc.q, vtc.r, vtcSupplyRadius(vtc) + 1)) {
      const pad = findVTCDepotPad(gs, terrain, mapSize, player, vtc);
      if (pad && hexDistance(engineer.q, engineer.r, pad.q, pad.r) <= 10) {
        const tk = `vtcdp:${pad.q},${pad.r}`;
        if (!claimedTasks?.has(tk)) {
          if (claimedTasks) claimedTasks.add(tk);
          return { type: 'vtc_depot', q: pad.q, r: pad.r, anchorQ: vtc.q, anchorR: vtc.r };
        }
      }
    }
    const forts = countFortsNearHex(gs, player, vtc.q, vtc.r, vtcSupplyRadius(vtc));
    const wantForts = vtc.type === 'CITY' ? 3 : vtc.type === 'TOWN' ? 2 : 1;
    if (turn >= 6 && forts < wantForts) {
      const pad = findFortPadHex(gs, terrain, mapSize, vtc.q, vtc.r, player);
      if (pad && hexDistance(engineer.q, engineer.r, pad.q, pad.r) <= 12) {
        const tk = `vtcft:${pad.q},${pad.r}`;
        if (!claimedTasks?.has(tk)) {
          if (claimedTasks) claimedTasks.add(tk);
          const unlocked = new Set(gs.players[player]?.research?.unlocked || []);
          const fortType = pickFortTypeForHex(gs, player, pad.q, pad.r, { kind: 'settlement', radius: 6 }, unlocked, null);
          return { type: 'fort', q: pad.q, r: pad.r, anchorQ: vtc.q, anchorR: vtc.r, fortType };
        }
      }
    }
  }

  // Push toward the most forward corridor objective (furthest from own HQ, not nearest to engineer).
  // This drives engineers east/west toward the enemy rather than clustering near HQ.
  const expansions = strategic?.territorial?.expansions || [];
  if (expansions.length > 0) {
    const nearest = expansions.reduce((a, b) =>
      hexDistance(engineer.q, engineer.r, a.q, a.r) <= hexDistance(engineer.q, engineer.r, b.q, b.r) ? a : b);
    const tk = `${nearest.q},${nearest.r}`;
    if (!claimedTasks || !claimedTasks.has(tk)) {
      if (claimedTasks) claimedTasks.add(tk);
      return { type: 'expansion', q: nearest.q, r: nearest.r };
    }
  }

  const corridor = strategic?.objectives?.corridor || [];
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

const INDIRECT_THREAT = new Set(['ARTILLERY', 'MORTAR']);

function countHexThreats(gs, player, q, r, radius = 5) {
  let ground = 0;
  let indirect = 0;
  let air = 0;
  for (const u of gs.units) {
    if (Number(u.owner) === Number(player) || u.embarked) continue;
    if (hexDistance(u.q, u.r, q, r) > radius) continue;
    ground += 1;
    if (INDIRECT_THREAT.has(u.type)) indirect += 1;
    if (AIR_UNITS.has(u.type)) air += 1;
  }
  return { ground, indirect, air };
}

function depotCoversHex(gs, player, q, r, radius = 4) {
  return gs.buildings.some((b) => Number(b.owner) === Number(player)
    && !b.underConstruction
    && (b.type === 'SUPPLY_DEPOT' || b.type === 'SUPPLY_WAREHOUSE' || b.type === 'SUPPLY_PORT')
    && hexDistance(b.q, b.r, q, r) <= radius);
}

/** Resource sites + FOB corridor + mid-line anchor for empire logistics/defense. */
function getEmpireNodes(gs, player) {
  const nodes = [];
  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
    if (b.type !== 'MINE' && b.type !== 'OIL_PUMP') continue;
    const t = countHexThreats(gs, player, b.q, b.r, 5);
    nodes.push({ q: b.q, r: b.r, kind: 'resource', priority: 14 + t.ground * 2 + t.indirect * 2 });
  }
  for (const fob of getFOBChainPoints(gs, player)) {
    const t = countHexThreats(gs, player, fob.q, fob.r, 6);
    nodes.push({ q: fob.q, r: fob.r, kind: 'fob', priority: 16 + t.ground * 2, pct: fob.pct });
  }
  const myHQ = gs.buildings.find((bb) => bb.type === 'HQ' && bb.owner === player);
  const enemyHQ = gs.buildings.find((bb) => bb.type === 'HQ' && bb.owner !== player);
  if (myHQ && enemyHQ && (gs.turn || 1) >= 14) {
    nodes.push({
      q: Math.round(myHQ.q + (enemyHQ.q - myHQ.q) * 0.42),
      r: Math.round(myHQ.r + (enemyHQ.r - myHQ.r) * 0.42),
      kind: 'hq_corridor',
      priority: 12,
    });
  }
  return nodes.sort((a, b) => b.priority - a.priority);
}

function pickFortTypeForHex(gs, player, q, r, ctx, unlockedEng, canAfford) {
  const threats = countHexThreats(gs, player, q, r, ctx?.radius || 5);
  const turn = gs.turn || 1;
  const candidates = [];
  const add = (type, score) => {
    const def = BUILDING_TYPES[type];
    if (!def) return;
    if (type === 'FORT_T0' && !unlockedEng.has('sandbag_improved')) return;
    if (def.requiresTech && !unlockedEng.has(def.requiresTech)) return;
    if (canAfford && !canAfford(def.buildCost || {})) return;
    candidates.push({ type, score });
  };

  if (threats.indirect + threats.air >= 1) add('FORT_T0', 42 + threats.indirect * 5 + threats.air * 4);
  add('FORT_T1', 22 + threats.ground * 2);
  if (unlockedEng.has('entrenching_tools')) add('FORT_T2', 28 + threats.ground * 3 + (ctx?.kind === 'resource' ? 4 : 0));
  if (unlockedEng.has('bunker') && threats.ground >= 1) add('FORT_T3', 30 + threats.ground * 3);
  if (ctx?.kind === 'hq_corridor' || ctx?.kind === 'fob') {
    if (unlockedEng.has('superfortress') && turn >= 22) add('FORT_T5', 38);
    else if (unlockedEng.has('hardened_bunker') && turn >= 16) add('FORT_T4', 34);
  }
  if (!candidates.length) add('FORT_T1', 8);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.type || 'FORT_T1';
}

function buildFortNeedsForNode(gs, player, nodeQ, nodeR, ctx, unlockedEng, canAfford, fortsNear, turn) {
  const needs = [];
  const threats = countHexThreats(gs, player, nodeQ, nodeR, 5);
  const ctxFull = { ...ctx, radius: 5 };
  if (fortsNear < 1 && turn >= 3) {
    const t0 = pickFortTypeForHex(gs, player, nodeQ, nodeR, ctxFull, unlockedEng, canAfford);
    needs.push({ type: t0, score: 34 + threats.indirect * 3 });
  }
  if (fortsNear < 2 && turn >= 5) {
    const t1 = pickFortTypeForHex(gs, player, nodeQ, nodeR, { ...ctxFull, kind: ctx?.kind || 'resource' }, unlockedEng, canAfford);
    needs.push({ type: t1, score: 28 + threats.ground * 2 });
  }
  if (fortsNear < 3 && turn >= 8 && unlockedEng.has('entrenching_tools')) {
    needs.push({ type: 'FORT_T2', score: 26 + threats.ground * 2 });
  }
  if (fortsNear < 3 && turn >= 10 && unlockedEng.has('bunker') && threats.ground >= 1) {
    needs.push({ type: 'FORT_T3', score: 28 + threats.ground * 3 });
  }
  if ((ctx?.kind === 'fob' || ctx?.kind === 'hq_corridor') && fortsNear < 4 && turn >= 16 && unlockedEng.has('hardened_bunker')) {
    needs.push({ type: 'FORT_T4', score: 24 + threats.ground * 2 });
  }
  if (ctx?.kind === 'hq_corridor' && fortsNear < 2 && turn >= 22 && unlockedEng.has('superfortress')) {
    needs.push({ type: 'FORT_T5', score: 26 });
  }
  if (fortsNear < 3 && turn >= 7) needs.push({ type: 'OBS_POST', score: 18 + threats.ground });
  return needs;
}

function buildStrategicState(gs, player, mapSize, resourceTargets, myCombatUnits, enemyHQs, closingPressure = 0, situation = null, armyBudget = null) {
  gs._aiStrategicMemory = gs._aiStrategicMemory || {};
  const prev = gs._aiStrategicMemory[player] || {};

  const focusEnemyHQ = pickPrimaryEnemyHQ(gs, player, enemyHQs);
  const focusEnemyOwner = focusEnemyHQ ? Number(focusEnemyHQ.owner) : null;
  const orderedEnemyHQs = focusEnemyHQ
    ? [focusEnemyHQ, ...enemyHQs.filter(h => h !== focusEnemyHQ)]
    : enemyHQs;

  const roadsNow = countPlayerRoadLike(gs, player);
  const dynamicRoadTarget = getDynamicRoadTarget(gs, player, situation, armyBudget);
  const roadDeficit = Math.max(0, dynamicRoadTarget - roadsNow);
  const myUnits = gs.units.filter(u => u.owner === player && !u.embarked);
  const unsupplied = myUnits.filter(u => (u.outOfSupply || 0) > 0).length;
  const plRes = gs.players[player] || {};
  const stockpilePressure = getStockpileSpendPressure(gs, player);
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && b.owner === player);

  const laneCenterR = {
    north: Math.max(2, Math.floor(mapSize * 0.18)),
    center: Math.floor(mapSize * 0.5),
    south: Math.min(mapSize - 3, Math.floor(mapSize * 0.82)),
  };

  const endgamePressure = getEndgamePressure(gs, player, mapSize, focusEnemyHQ);
  const effectivePressure = Math.max(closingPressure, endgamePressure);

  // --- Phase decision with hysteresis ---
  const turn = gs.turn || 1;
  const myCombatCount = myCombatUnits?.length || 0;
  const canEnterClosing = turn >= 8 && myCombatCount >= 6;
  let desiredPhase = 'expand';
  if (canEnterClosing && endgamePressure >= 0.5) desiredPhase = 'closing';
  else if (turn >= 14 || effectivePressure >= 0.38) desiredPhase = 'pressure';
  if (situation?.vpMode && turn >= 8 && myCombatCount >= 5 && (situation?.contestedVpNearby || effectivePressure >= 0.28)) {
    desiredPhase = (canEnterClosing && endgamePressure >= 0.45) ? 'closing' : 'pressure';
  }
  if (situation?.safeAtHome && turn < 20 && !situation?.vpMode) desiredPhase = 'expand';
  const mapN = Number(gs._mapSize || mapSize || 40);
  const neutralPlugged = isHQNetworkPluggedToNeutralRoads(gs, player, mapN);
  if (!neutralPlugged && turn <= 70 && myCombatCount >= 1) desiredPhase = 'expand';
  const stabilizeRoad = turn < 12 ? 7 : (myUnits.length <= 6 ? 3 : 6);
  const stabilizeUnsup = turn < 12 ? Math.max(5, Math.floor(myUnits.length * 0.35)) : Math.max(4, Math.floor(myUnits.length * 0.28));
  const severe = roadDeficit >= 4 || unsupplied >= Math.max(4, Math.floor(myUnits.length * 0.33));
  const inClosingPush = desiredPhase === 'closing' && endgamePressure >= 0.55;
  const stabilizeNeeded = (roadDeficit >= stabilizeRoad || unsupplied >= stabilizeUnsup)
    && !(myCombatCount < 4 && unsupplied < 2 && turn > 40);
  if (!inClosingPush && !situation?.vpMode && stabilizeNeeded) {
    desiredPhase = 'stabilize';
  }
  if (!inClosingPush && situation?.vpMode && roadDeficit >= stabilizeRoad + 3 && unsupplied >= stabilizeUnsup + 2) {
    desiredPhase = 'stabilize';
  }
  // Closing push: only fall back to stabilize on severe logistics breakdown.
  if (inClosingPush && stabilizeNeeded && severe) {
    desiredPhase = 'stabilize';
  }
  // Break out of endless stabilize: hoarding + tiny army, or logistics loop with no supply pain.
  const prevPhase = prev.phase || 'expand';
  const prevPhaseTurns = prev.phaseTurns || 0;
  const stabilizeStuck = prevPhase === 'stabilize' && prevPhaseTurns >= 24 && unsupplied < 2;
  if (stabilizeStuck && turn > 50) desiredPhase = 'pressure';
  if (myCombatCount < 4 && turn > 35 && (plRes.iron || 0) >= 40 && stockpilePressure >= 0.35) {
    desiredPhase = 'pressure';
  }
  if (roadDeficit >= 4 && roadsNow >= 2 && unsupplied === 0 && prevPhaseTurns > 18 && turn > 60) {
    desiredPhase = desiredPhase === 'stabilize' ? 'pressure' : desiredPhase;
  }

  let phase = desiredPhase;
  // Require minimum dwell time unless conditions are severe.
  if (!severe && prevPhase !== desiredPhase && prevPhaseTurns < 2) phase = prevPhase;
  const phaseTurns = phase === prevPhase ? (prevPhaseTurns + 1) : 1;

  // --- Lane scoring with stickiness/hysteresis ---
  const laneScore = { north: 0, center: 0, south: 0 };
  for (const t of (resourceTargets || [])) laneScore[getLaneForR(t.r, mapSize)] += (t.type === 'OIL' ? 3.6 : 2.4);
  for (const e of (orderedEnemyHQs || [])) {
    const w = e === focusEnemyHQ ? 6.5 : 3.2;
    laneScore[getLaneForR(e.r, mapSize)] += w;
  }

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

  const laneEnemyHQs = (orderedEnemyHQs || []).filter(h => getLaneForR(h.r, mapSize) === primaryLane);
  const targetEnemyHQ = (focusEnemyHQ && getLaneForR(focusEnemyHQ.r, mapSize) === primaryLane)
    ? focusEnemyHQ
    : (laneEnemyHQs[0] || focusEnemyHQ || (orderedEnemyHQs || [])[0] || null);

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
    focusEnemyHQ,
    focusEnemyOwner,
    endgamePressure,
    closingPressure: effectivePressure,
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

function isNeutralRoadHex(gs, q, r) {
  const b = roadAt(gs, q, r);
  return !!b && Number(b.owner) === 0;
}

function isRoadBuildConnectivity(gs, player, q, r) {
  const myHQs = gs.buildings.filter(bb => bb.type === 'HQ' && Number(bb.owner) === Number(player));
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  return dirs.some(([dq, dr]) => {
    const nq = q + dq, nr = r + dr;
    if (roadAt(gs, nq, nr)) return true;
    return myHQs.some(h => h.q === nq && h.r === nr);
  });
}

function scoreRoadUtility(gs, player, q, r, mapSize = gs._mapSize || 40) {
  const key = `${q},${r}`;
  const hasRoad = !!roadAt(gs, q, r);
  if (hasRoad) return -999;

  const myHQs = getPlayerCapitalBuildings(gs, player);
  const enemyHQs = gs.buildings.filter(b => isPlayerCapitalBuilding(b) && Number(b.owner) !== Number(player));
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

  // Early priority: bridge owned HQ network to neutral settlement road grid for supply + movement.
  const turnNow = gs.turn || 1;
  const pluggedNeutral = isHQNetworkPluggedToNeutralRoads(gs, player, mapSize);
  const teamUnsup = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked && (u.outOfSupply || 0) > 0).length;
  if (!pluggedNeutral && myHQs.length > 0 && (turnNow <= 50 || teamUnsup >= 1)) {
    const myHQ = myHQs[0];
    const neutralRoads = gs.buildings.filter(b => ROAD_TYPES.has(b.type) && Number(b.owner) === 0);
    if (neutralRoads.length > 0) {
      const dHere = Math.min(...neutralRoads.map(nr => hexDistance(q, r, nr.q, nr.r)));
      const dHQToNet = Math.min(...neutralRoads.map(nr => hexDistance(myHQ.q, myHQ.r, nr.q, nr.r)));
      const progress = dHQToNet - dHere;
      const earlyPlug = turnNow <= 35 ? 1.35 : 1;
      if (progress > 0) networkScore += Math.min(40, progress * 2.8 * earlyPlug);
      if (progress > 2) networkScore += 12 * earlyPlug;
      let neutralAdj = 0;
      for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        if (isNeutralRoadHex(gs, q + dq, r + dr)) neutralAdj += 1;
      }
      if (neutralAdj > 0) networkScore += 24 + neutralAdj * 6;
      if (teamUnsup >= 3) networkScore += Math.min(24, teamUnsup * 4);
    }
  }

  // Owned VTCs are supply hubs — prefer road hexes that extend toward them.
  const ownedVTC = gs.buildings.filter(b => ['VILLAGE', 'TOWN', 'CITY'].includes(b.type) && Number(b.owner) === Number(player));
  for (const v of ownedVTC) {
    const dVtc = hexDistance(q, r, v.q, v.r);
    const w = vtcStrategicWeight(v);
    const rad = vtcSupplyRadius(v);
    networkScore += Math.max(0, (w * 3.4) - dVtc * 1.1);
    if (dVtc <= 2) networkScore += w * 1.5;
    if (dVtc <= rad && roadNeighbors > 0) networkScore += w * 1.3;
    if (dVtc > 1 && dVtc <= rad + 2) networkScore += w * 0.6;
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
    const myRoads = gs.buildings.filter(b => b.owner === player && ROAD_TYPES.has(b.type));
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

const _CHOKE_DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

/** Land tiles bordering water/mountain/map edge read as choke-worthy control points. */
function chokepointLandValue(terrain, mapSize, q, r) {
  const k = `${q},${r}`;
  const t = terrain?.[k] ?? 0;
  if (t === 4 || t === 5 || t === 2) return 0;
  let walls = 0;
  for (const [dq, dr] of _CHOKE_DIRS) {
    const nq = q + dq, nr = r + dr;
    if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) { walls++; continue; }
    const nt = terrain?.[`${nq},${nr}`] ?? 0;
    if (nt === 4 || nt === 5 || nt === 2) walls++;
  }
  if (walls >= 4) return 5;
  if (walls >= 3) return 3;
  if (walls === 2) return 1;
  return 0;
}

/** Naval straits / tight water tiles touching multiple land masses. */
function waterChokeValue(terrain, mapSize, q, r) {
  const t = terrain?.[`${q},${r}`] ?? 0;
  if (t !== 4 && t !== 5) return 0;
  let landn = 0;
  for (const [dq, dr] of _CHOKE_DIRS) {
    const nq = q + dq, nr = r + dr;
    if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
    const nt = terrain?.[`${nq},${nr}`] ?? 0;
    if (nt !== 4 && nt !== 5) landn++;
  }
  if (landn >= 4) return 6;
  if (landn >= 3) return 4;
  return 0;
}

function isCoastalLand(terrain, mapSize, q, r) {
  const t = terrain?.[`${q},${r}`] ?? 0;
  if (t === 4 || t === 5 || t === 2) return false;
  for (const [dq, dr] of _CHOKE_DIRS) {
    const nq = q + dq, nr = r + dr;
    if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) return true;
    const nt = terrain?.[`${nq},${nr}`] ?? 0;
    if (nt === 4 || nt === 5) return true;
  }
  return false;
}

/** Remote continents/islands + coastal supply-port bridge sites for amphibious expansion. */
function buildRemoteExpansionIntel(terrain, mapSize, gs, player, landmassIndex, resourceTargets, situation) {
  const homeMass = getPlayerHomeLandmassId(gs, player, landmassIndex);
  const remoteTargets = [];
  const bridgeSites = [];

  for (const body of landmassIndex.bodies) {
    if (body.size < 8) continue;
    if (body.id === homeMass) continue;

    const hasPresence = gs.buildings.some(b => Number(b.owner) === Number(player)
      && landmassIndex.getBodyId(b.q, b.r) === body.id)
      || gs.units.some(u => Number(u.owner) === Number(player) && !u.embarked
        && landmassIndex.getBodyId(u.q, u.r) === body.id);

    for (const t of (resourceTargets || [])) {
      if (landmassIndex.getBodyId(t.q, t.r) !== body.id) continue;
      remoteTargets.push({
        q: t.q, r: t.r,
        score: (t.type === 'OIL' ? 9 : 7) + (hasPresence ? 1 : 4),
        type: 'remote_landmass',
        landmassId: body.id,
      });
    }

    if (!remoteTargets.some(rt => rt.landmassId === body.id)) {
      const cx = body.coastal.reduce((s, c) => s + c.q, 0) / Math.max(1, body.coastal.length);
      const cy = body.coastal.reduce((s, c) => s + c.r, 0) / Math.max(1, body.coastal.length);
      remoteTargets.push({
        q: Math.round(cx), r: Math.round(cy),
        score: hasPresence ? 5.5 : 7,
        type: 'remote_beachhead',
        landmassId: body.id,
      });
    }

    for (const c of body.coastal.slice(0, 14)) {
      const hasPort = gs.buildings.some(b => b.owner === player && b.type === 'SUPPLY_PORT'
        && !b.underConstruction && hexDistance(b.q, b.r, c.q, c.r) <= 2);
      if (hasPort) continue;
      const wc = waterChokeValue(terrain, mapSize, c.q, c.r);
      bridgeSites.push({
        q: c.q, r: c.r,
        score: 14 + (hasPresence ? 10 : 6) + wc * 0.55,
        kind: hasPresence ? 'forward_port' : 'beachhead_port',
        landmassId: body.id,
      });
    }
  }

  if (homeMass >= 0) {
    const homeBody = landmassIndex.bodies[homeMass];
    for (const c of (homeBody?.coastal || []).slice(0, 18)) {
      const hasPort = gs.buildings.some(b => b.owner === player && b.type === 'SUPPLY_PORT'
        && !b.underConstruction && hexDistance(b.q, b.r, c.q, c.r) <= 3);
      if (hasPort) continue;
      const nearNaval = gs.buildings.some(b => b.owner === player
        && ['NAVAL_YARD', 'HARBOR', 'PORT', 'NAVAL_BASE'].includes(b.type)
        && hexDistance(b.q, b.r, c.q, c.r) <= 12);
      const wc = waterChokeValue(terrain, mapSize, c.q, c.r);
      if (nearNaval || wc > 0 || (situation?.waterRatio || 0) >= 0.15) {
        bridgeSites.push({
          q: c.q, r: c.r,
          score: 16 + (nearNaval ? 8 : 0) + wc * 0.65,
          kind: 'home_port',
          landmassId: homeMass,
        });
      }
    }
  }

  remoteTargets.sort((a, b) => b.score - a.score);
  bridgeSites.sort((a, b) => b.score - a.score);
  return {
    remoteTargets: remoteTargets.slice(0, 12),
    bridgeSites: bridgeSites.slice(0, 20),
    homeLandmassId: homeMass,
    landmassCount: landmassIndex.majorCount,
  };
}

function needsAmphibiousLogistics(situation, territorial) {
  return !!(situation?.islandMap || (situation?.waterRatio || 0) >= 0.15
    || (territorial?.landmassCount || 0) >= 2 || (territorial?.remoteTargets?.length || 0) > 0);
}

function getSupplyPortCap(situation, territorial) {
  const base = 1 + Math.floor((territorial?.landmassCount || 1) * 1.2);
  const waterBoost = Math.floor((situation?.waterRatio || 0) * 5);
  return Math.min(6, base + waterBoost);
}

const _isWaterTerrain = (t) => t === 4 || t === 5;
const LAKE_MAX_TILES = 72;
const NAVAL_YARD_TYPES = new Set(['HARBOR', 'NAVAL_YARD', 'SHIPYARD', 'DRY_DOCK', 'DRYDOCK', 'NAVAL_BASE', 'NAVAL_DOCKYARD', 'PORT']);
const HEAVY_NAVAL_UNITS = new Set(['DESTROYER', 'DESTROYER_MK1', 'CRUISER_LT', 'CRUISER_HV', 'BATTLESHIP']);
const TRANSPORT_NAVAL_UNITS = new Set(['LANDING_CRAFT', 'TRANSPORT_SM', 'TRANSPORT_MD', 'TRANSPORT_LG']);
const LAKE_NAVAL_ALLOWED = new Set(['PATROL_BOAT', 'MTB', 'TORPEDO_BOAT', 'MOTOR_GUNBOAT']);
const LAKE_NAVAL_PRIO = ['PATROL_BOAT', 'MTB', 'TORPEDO_BOAT', 'MOTOR_GUNBOAT'];

/** Flood-fill water tiles; classify open sea vs inland lake vs large inland sea. */
function buildWaterBodyIndex(terrain, mapSize) {
  const visited = new Set();
  const bodies = [];
  const tileToBody = new Map();

  for (let q = 0; q < mapSize; q++) {
    for (let r = 0; r < mapSize; r++) {
      const key = `${q},${r}`;
      if (!_isWaterTerrain(terrain?.[key] ?? 0) || visited.has(key)) continue;

      let size = 0;
      let oceanTiles = 0;
      let touchesEdge = false;
      const queue = [key];
      visited.add(key);

      while (queue.length) {
        const k = queue.shift();
        tileToBody.set(k, bodies.length);
        size += 1;
        const [tq, tr] = k.split(',').map(Number);
        const tt = terrain?.[k] ?? 0;
        if (tt === 5) oceanTiles += 1;
        if (tq <= 0 || tr <= 0 || tq >= mapSize - 1 || tr >= mapSize - 1) touchesEdge = true;

        for (const [dq, dr] of _CHOKE_DIRS) {
          const nq = tq + dq;
          const nr = tr + dr;
          if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) {
            touchesEdge = true;
            continue;
          }
          const nk = `${nq},${nr}`;
          if (visited.has(nk)) continue;
          if (!_isWaterTerrain(terrain?.[nk] ?? 0)) continue;
          visited.add(nk);
          queue.push(nk);
        }
      }

      const openSea = touchesEdge && (size >= 96 || oceanTiles >= Math.max(10, Math.floor(size * 0.12)));
      const kind = openSea ? 'sea' : (size <= LAKE_MAX_TILES ? 'lake' : 'inland');
      bodies.push({ id: bodies.length, size, oceanTiles, touchesEdge, kind });
    }
  }

  const getBodyId = (q, r) => tileToBody.get(`${q},${r}`) ?? null;
  const getBody = (id) => (id == null ? null : bodies[id] ?? null);

  const getBodyIdNear = (q, r) => {
    const direct = getBodyId(q, r);
    if (direct != null) return direct;
    for (const [dq, dr] of _CHOKE_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (nq < 0 || nr < 0 || nq >= mapSize || nr >= mapSize) continue;
      const id = getBodyId(nq, nr);
      if (id != null) return id;
    }
    return null;
  };

  const getPolicy = (body) => {
    if (!body) return { kind: 'unknown', allowed: null, maxByType: {}, maxCombat: 999, maxYards: 1, prio: null };
    if (body.kind === 'sea') {
      return { kind: 'sea', allowed: null, maxByType: {}, maxCombat: 999, maxYards: 99, prio: null };
    }
    if (body.kind === 'lake') {
      return {
        kind: 'lake',
        allowed: LAKE_NAVAL_ALLOWED,
        maxByType: { PATROL_BOAT: 2, MTB: 1, TORPEDO_BOAT: 1, MOTOR_GUNBOAT: 1 },
        maxCombat: 3,
        maxYards: 1,
        prio: LAKE_NAVAL_PRIO,
      };
    }
    return {
      kind: 'inland',
      allowed: null,
      maxByType: {
        PATROL_BOAT: 4, MTB: 2, TORPEDO_BOAT: 2, DESTROYER: 1, DESTROYER_MK1: 1,
        CRUISER_LT: 0, CRUISER_HV: 0, BATTLESHIP: 0,
        TRANSPORT_SM: 1, TRANSPORT_MD: 1, LANDING_CRAFT: 1,
        SUPPLY_SHIP: 1, SUBMARINE: 1,
      },
      maxCombat: 8,
      maxYards: 2,
      prio: ['PATROL_BOAT', 'MTB', 'TORPEDO_BOAT', 'DESTROYER', 'SUPPLY_SHIP'],
    };
  };

  const countNavalOnBody = (gs, player, bodyId) => {
    const counts = {};
    let combat = 0;
    let yards = 0;
    const onBody = (q, r) => getBodyIdNear(q, r) === bodyId;
    const tally = (q, r, type, isYard = false) => {
      if (!onBody(q, r)) return;
      if (isYard) { yards += 1; return; }
      if (!NAVAL_UNITS.has(type)) return;
      counts[type] = (counts[type] || 0) + 1;
      if (type !== 'SUPPLY_SHIP') combat += 1;
    };
    for (const u of gs.units) {
      if (Number(u.owner) !== Number(player) || u.embarked) continue;
      if (NAVAL_UNITS.has(u.type)) tally(u.q, u.r, u.type);
    }
    for (const pr of gs.pendingRecruits || []) {
      if (Number(pr.owner) !== Number(player)) continue;
      const b = gs.buildings.find((bb) => bb.id === pr.buildingId);
      if (!b) continue;
      tally(b.q, b.r, pr.type);
    }
    for (const b of gs.buildings) {
      if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
      if (!PRODUCTION_VTC_TYPES.has(b.type)) continue;
      for (const q of b.trainQueue || []) {
        if (NAVAL_UNITS.has(q.type)) tally(b.q, b.r, q.type);
      }
      for (const ru of b.readyUnits || []) {
        if (NAVAL_UNITS.has(ru.type)) tally(b.q, b.r, ru.type);
      }
    }
    for (const b of gs.buildings) {
      if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
      if (!NAVAL_YARD_TYPES.has(b.type)) continue;
      tally(b.q, b.r, b.type, true);
    }
    return { counts, combat, yards };
  };

  const recruitAllowed = (unitType, bodyId, gs, player) => {
    const body = getBody(bodyId);
    const policy = getPolicy(body);
    if (!policy || policy.kind === 'sea' || policy.kind === 'unknown') return true;
    const presence = countNavalOnBody(gs, player, bodyId);

    if (HEAVY_NAVAL_UNITS.has(unitType) || TRANSPORT_NAVAL_UNITS.has(unitType) || unitType === 'SUBMARINE' || unitType === 'SUPPLY_SHIP') {
      if (policy.kind === 'lake') {
        if (unitType === 'SUPPLY_SHIP' && presence.combat >= 2 && (presence.counts.SUPPLY_SHIP || 0) < 1) return true;
        return false;
      }
    }
    if (policy.allowed && !policy.allowed.has(unitType)) return false;
    const cap = policy.maxByType[unitType];
    if (cap != null && (presence.counts[unitType] || 0) >= cap) return false;
    if (unitType !== 'SUPPLY_SHIP' && presence.combat >= policy.maxCombat) return false;
    return true;
  };

  const playerHasOpenSea = (gs, player) => {
    for (const b of gs.buildings) {
      if (Number(b.owner) !== Number(player)) continue;
      const id = getBodyIdNear(b.q, b.r);
      if (getBody(id)?.kind === 'sea') return true;
    }
    for (let q = 0; q < mapSize; q++) {
      for (let r = 0; r < mapSize; r++) {
        if (!isCoastalLand(terrain, mapSize, q, r)) continue;
        const owned = gs.units.some((u) => u.owner === player && !u.embarked && u.q === q && u.r === r)
          || gs.buildings.some((b) => b.owner === player && b.q === q && b.r === r);
        if (!owned) continue;
        const id = getBodyIdNear(q, r);
        if (getBody(id)?.kind === 'sea') return true;
      }
    }
    return false;
  };

  const shouldBuildNavalYardHere = (gs, player, q, r) => {
    const bodyId = getBodyIdNear(q, r);
    const body = getBody(bodyId);
    const policy = getPolicy(body);
    if (!body) return false;
    if (policy.kind === 'sea') return true;
    if (policy.kind === 'inland') {
      const presence = countNavalOnBody(gs, player, bodyId);
      return presence.yards < policy.maxYards;
    }
    if (policy.kind === 'lake') {
      if (playerHasOpenSea(gs, player)) return false;
      const presence = countNavalOnBody(gs, player, bodyId);
      return presence.yards < policy.maxYards && body.size >= 18;
    }
    return false;
  };

  return {
    bodies, getBodyId, getBody, getBodyIdNear, getPolicy, countNavalOnBody, recruitAllowed,
    playerHasOpenSea, shouldBuildNavalYardHere,
  };
}

/** Scan map for chokepoints, coastal control sites, and expansion anchors. */
function buildTerritorialIntel(terrain, mapSize, gs, player, strategic, resourceTargets, situation = null) {
  const myHQ = gs.buildings.find(b => b.type === 'HQ' && b.owner === player);
  const chokes = [];
  const coastal = [];
  const expansions = [];

  for (let q = 0; q < mapSize; q++) {
    for (let r = 0; r < mapSize; r++) {
      const cv = chokepointLandValue(terrain, mapSize, q, r);
      if (cv >= 3) {
        let score = cv;
        if (myHQ) score += Math.max(0, 10 - hexDistance(q, r, myHQ.q, myHQ.r) * 0.12);
        if (strategic?.primaryLane && getLaneForR(r, mapSize) === strategic.primaryLane) score += 2.5;
        const enemyNear = gs.units.some(u => Number(u.owner) !== Number(player) && !u.embarked &&
          hexDistance(q, r, u.q, u.r) <= 10);
        if (enemyNear) score += 5;
        const friendlyHere = gs.units.filter(u => u.owner === player && !u.embarked && hexDistance(q, r, u.q, u.r) <= 2).length;
        if (friendlyHere >= 2) score -= 2;
        chokes.push({ q, r, score, kind: 'choke' });
      }
      if (isCoastalLand(terrain, mapSize, q, r)) {
        let cScore = 2;
        const nearNaval = gs.buildings.some(b => b.owner === player &&
          ['NAVAL_YARD', 'HARBOR', 'PORT', 'NAVAL_BASE'].includes(b.type) &&
          hexDistance(q, r, b.q, b.r) <= 14);
        if (nearNaval) cScore += 4;
        const enemyNear = gs.units.some(u => Number(u.owner) !== Number(player) && !u.embarked &&
          hexDistance(q, r, u.q, u.r) <= 12);
        if (enemyNear) cScore += 3;
        const wc = waterChokeValue(terrain, mapSize, q, r);
        if (wc > 0) cScore += wc * 0.4;
        coastal.push({ q, r, score: cScore, kind: 'coast' });
      }
    }
  }

  chokes.sort((a, b) => b.score - a.score);
  coastal.sort((a, b) => b.score - a.score);

  for (const t of (resourceTargets || [])) {
    const b = gs.buildings.find((bb) => bb.q === t.q && bb.r === t.r && (bb.type === 'MINE' || bb.type === 'OIL_PUMP'));
    const owned = b && Number(b.owner) === Number(player);
    const base = t.type === 'OIL' ? 6.5 : 5;
    expansions.push({ q: t.q, r: t.r, score: owned ? base * 0.6 : base + 2, type: 'resource' });
  }
  for (const b of gs.buildings) {
    if (b.underConstruction) continue;
    if (!['VILLAGE', 'TOWN', 'CITY'].includes(b.type)) continue;
    const owned = Number(b.owner) === Number(player);
    const base = b.type === 'CITY' ? 18 : b.type === 'TOWN' ? 13 : 9;
    expansions.push({ q: b.q, r: b.r, score: owned ? base * 1.45 : base + 5, type: 'settlement' });
  }
  for (const o of (strategic?.objectives?.corridor || [])) {
    if (o.type === 'forward' || o.type === 'resource') {
      expansions.push({ q: o.q, r: o.r, score: o.type === 'forward' ? 6 : 4, type: o.type });
    }
  }
  if (strategic?.objectives?.flank) {
    const f = strategic.objectives.flank;
    expansions.push({ q: f.q, r: f.r, score: 5.5, type: 'flank' });
  }
  expansions.sort((a, b) => b.score - a.score);

  const landmassIndex = getLandmassIndex(gs, terrain, mapSize);
  const remoteIntel = buildRemoteExpansionIntel(terrain, mapSize, gs, player, landmassIndex, resourceTargets, situation);
  for (const rt of remoteIntel.remoteTargets) {
    expansions.push({ q: rt.q, r: rt.r, score: rt.score + 1.5, type: rt.type });
  }
  expansions.sort((a, b) => b.score - a.score);

  return {
    chokes: chokes.slice(0, 18),
    coastal: coastal.slice(0, 24),
    expansions: expansions.slice(0, 20),
    remoteTargets: remoteIntel.remoteTargets,
    bridgeSites: remoteIntel.bridgeSites,
    landmassCount: remoteIntel.landmassCount,
    homeLandmassId: remoteIntel.homeLandmassId,
  };
}

/** Multi-mission doctrine: scouts, probes, diversions, main push, expand — not one blob to HQ. */
function assignCombatMissions(gs, player, mapSize, strategic, territorial, enemyHQs, myCombatUnits, resourceTargets, unitObjective = {}) {
  const missionCounts = {};
  const freeCombat = myCombatUnits.filter(u => unitObjective[u.id]?.mission !== 'hold_vtc');
  const turn = gs.turn || 1;
  const phase = strategic?.phase || 'expand';
  const closing = phase === 'closing' || (strategic?.endgamePressure || 0) >= 0.5;
  const theater = strategic?.theater;
  const myHQ = getPlayerCapital(gs, player);
  const enemyHQ = strategic?.focusEnemyHQ || pickPrimaryEnemyHQ(gs, player, enemyHQs) || enemyHQs[0];
  if (!myHQ || !enemyHQ || freeCombat.length < 2) {
    return { unitObjective, deceptionActive: false, missionCounts };
  }

  gs._aiStrategicMemory = gs._aiStrategicMemory || {};
  const mem = gs._aiStrategicMemory[player] || {};
  let deceptionActive = (mem.deceptionTurnsLeft || 0) > 0;
  if (!deceptionActive && Math.random() < (phase === 'pressure' ? 0.14 : 0.24)) {
    deceptionActive = true;
    mem.deceptionTurnsLeft = 2 + Math.floor(Math.random() * 2);
  } else if (deceptionActive) {
    mem.deceptionTurnsLeft = Math.max(0, (mem.deceptionTurnsLeft || 1) - 1);
  }
  gs._aiStrategicMemory[player] = { ...gs._aiStrategicMemory[player], deceptionTurnsLeft: mem.deceptionTurnsLeft };

  const primaryLane = strategic?.primaryLane || 'center';
  const secondaryLane = strategic?.secondaryLane || 'north';
  const laneEnemy = enemyHQs.find(h => getLaneForR(h.r, mapSize) === primaryLane) || enemyHQ;
  const offLaneEnemy = enemyHQs.find(h => getLaneForR(h.r, mapSize) !== primaryLane) || laneEnemy;

  const forwardAnchor = strategic?.objectives?.corridor?.find(o => o.type === 'forward');
  const resourceAnchor = strategic?.objectives?.flank
    || resourceTargets.find(t => getLaneForR(t.r, mapSize) === primaryLane)
    || resourceTargets[0];

  const diversionTarget = resourceTargets.find(t => getLaneForR(t.r, mapSize) === secondaryLane)
    || { q: offLaneEnemy.q, r: offLaneEnemy.r, type: 'feint' };
  const scoutTarget = territorial?.expansions?.[0] || territorial?.chokes?.[2]
    || forwardAnchor || resourceAnchor || { q: Math.round((myHQ.q + laneEnemy.q) / 2), r: myHQ.r };
  const expandTarget = resourceAnchor || forwardAnchor
    || { q: Math.round(myHQ.q + (laneEnemy.q - myHQ.q) * 0.45), r: Math.round(myHQ.r + (laneEnemy.r - myHQ.r) * 0.25) };

  let missionExpandTarget = expandTarget;
  const vpTarget = (gs.victoryMode === 'points' && (gs.victoryZones || []).length)
    ? pickBestVictoryZoneTarget(gs, player) : null;
  if (vpTarget && phase !== 'stabilize') missionExpandTarget = vpTarget;
  const remoteExpand = territorial?.remoteTargets?.[0];
  if (!vpTarget && remoteExpand && (phase === 'expand' || phase === 'stabilize') && turn >= 5) {
    missionExpandTarget = remoteExpand;
  }
  if (vpTarget && remoteExpand && turn >= 10) {
    const dVp = hexDistance(myHQ.q, myHQ.r, vpTarget.q, vpTarget.r);
    const dRemote = hexDistance(myHQ.q, myHQ.r, remoteExpand.q, remoteExpand.r);
    if (dRemote + 4 < dVp) missionExpandTarget = remoteExpand;
  }

  let probeTarget = expandTarget;
  if (forwardAnchor) {
    probeTarget = {
      q: Math.round(forwardAnchor.q + (laneEnemy.q - forwardAnchor.q) * 0.35),
      r: Math.round(forwardAnchor.r + (laneEnemy.r - forwardAnchor.r) * 0.35),
    };
  }

  const ownedVTC = gs.buildings.filter(b =>
    Number(b.owner) === Number(player) && !b.underConstruction
    && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type) && !b.isCapital);
  const settlementExpandTargets = [
    ...ownedVTC.map(v => ({ q: v.q, r: v.r, type: 'settlement', score: vtcStrategicWeight(v) })),
    ...(territorial?.expansions || []).filter(e => e.type === 'settlement'),
  ];

  const pools = { scout: [], line: [], assault: [], indirect: [], anti: [] };
  for (const u of freeCombat) {
    if (AIR_UNITS.has(u.type)) {
      unitObjective[u.id] = { q: laneEnemy.q, r: laneEnemy.r, mission: 'air_patrol', kind: 'air' };
      missionCounts.air_patrol = (missionCounts.air_patrol || 0) + 1;
      continue;
    }
    if (NAVAL_UNITS.has(u.type) && !['COASTAL_BATTERY'].includes(u.type)) {
      const coast = territorial?.coastal?.[0];
      unitObjective[u.id] = coast
        ? { q: coast.q, r: coast.r, mission: 'naval_screen', kind: 'coast' }
        : { q: laneEnemy.q, r: laneEnemy.r, mission: 'naval_raid', kind: 'coast' };
      missionCounts.naval = (missionCounts.naval || 0) + 1;
      continue;
    }
    const role = getUnitRole(u.type);
    if (role === 'recon') pools.scout.push(u);
    else if (role === 'indirect') pools.indirect.push(u);
    else if (u.type === 'ANTI_TANK') pools.anti.push(u);
    else if (role === 'assault') pools.assault.push(u);
    else pools.line.push(u);
  }

  const landCombat = [...pools.scout, ...pools.line, ...pools.assault, ...pools.indirect, ...pools.anti];
  const n = Math.max(1, landCombat.length);
  const remoteExpandActive = !!(territorial?.remoteTargets?.length);
  const largeMap = mapSize >= 90;
  const localEnemies = gs.units.filter(u => Number(u.owner) !== Number(player) && !u.embarked
    && hexDistance(u.q, u.r, myHQ.q, myHQ.r) <= 22).length;
  const vpContest = !!vpTarget;
  let mainTarget = { q: laneEnemy.q, r: laneEnemy.r };
  if (closing) mainTarget = { q: enemyHQ.q, r: enemyHQ.r };
  else if (theater?.useTheaterMode && theater?.primaryObjective) {
    mainTarget = { q: theater.primaryObjective.q, r: theater.primaryObjective.r };
  }

  let quotas = {
    diversion: deceptionActive ? Math.max(2, Math.floor(n * 0.16)) : Math.max(1, Math.floor(n * 0.08)),
    probe: Math.max(1, Math.floor(n * (phase === 'expand' ? 0.12 : 0.07))),
    expand: (phase === 'expand' || phase === 'stabilize')
      ? Math.max(2, Math.floor(n * (vpContest ? 0.34 : (remoteExpandActive ? 0.32 : 0.26))))
      : Math.max(1, Math.floor(n * 0.1)),
    main: phase === 'pressure' || localEnemies >= 4
      ? Math.max(3, Math.floor(n * (localEnemies >= 6 ? 0.38 : 0.32)))
      : Math.max((turn >= 6 && phase !== 'stabilize') ? 2 : 1, Math.floor(n * 0.16)),
  };
  if (closing) {
    deceptionActive = false;
    quotas = {
      diversion: 0,
      probe: Math.max(0, Math.floor(n * 0.06)),
      expand: Math.max(0, Math.floor(n * 0.08)),
      main: Math.max(4, Math.floor(n * 0.72)),
    };
  }
  if (largeMap && !closing) {
    // Large maps need territorial spread pressure, otherwise AI forms one center blob.
    quotas.expand += Math.max(2, Math.floor(n * 0.14));
    quotas.main = Math.max(2, quotas.main - Math.max(2, Math.floor(n * 0.18)));
    if (phase === 'stabilize') quotas.expand += Math.max(1, Math.floor(n * 0.08));
  }
  if (ownedVTC.length >= 1 && !closing) {
    const spread = Math.min(Math.floor(n * 0.22), Math.max(2, ownedVTC.length * 2));
    quotas.expand += Math.max(1, Math.floor(spread * 0.5));
    quotas.main = Math.max(1, quotas.main - Math.floor(spread * 0.45));
    quotas.probe = Math.max(1, quotas.probe);
  }
  if (ownedVTC.length >= 2 && phase !== 'closing') {
    quotas.main = Math.max(1, Math.floor(quotas.main * 0.55));
    quotas.expand += Math.max(2, Math.floor(n * 0.1));
  }

  const assign = (u, mission, target) => {
    unitObjective[u.id] = { q: target.q, r: target.r, mission, kind: mission };
    missionCounts[mission] = (missionCounts[mission] || 0) + 1;
  };

  for (const u of pools.scout) assign(u, 'scout', scoutTarget);

  const remaining = [...pools.assault, ...pools.line];
  let s = (turn * 997 + player * 131) >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xffffff) / 0x1000000; };
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  let idx = 0;
  let expandTargetIdx = 0;
  const pickExpandTarget = () => {
    if (settlementExpandTargets.length) {
      const t = settlementExpandTargets[expandTargetIdx % settlementExpandTargets.length];
      expandTargetIdx++;
      return { q: t.q, r: t.r };
    }
    return missionExpandTarget;
  };
  const batch = (count, mission, target) => {
    for (let i = 0; i < count && idx < remaining.length; i++, idx++) {
      const t = mission === 'expand' ? pickExpandTarget() : target;
      assign(remaining[idx], mission, t);
    }
  };
  batch(quotas.diversion, 'diversion', diversionTarget);
  batch(quotas.probe, 'probe', probeTarget);
  batch(quotas.expand, 'expand', missionExpandTarget);
  batch(quotas.main, closing ? 'closing' : 'main', mainTarget);

  for (const u of pools.indirect) {
    assign(u, (closing || phase === 'pressure') ? 'closing' : 'expand', closing ? mainTarget : (forwardAnchor || expandTarget));
  }
  const chokes = territorial?.chokes || [];
  pools.anti.forEach((u, i) => {
    const choke = chokes[i % Math.max(1, chokes.length)];
    assign(u, 'garrison', choke || expandTarget);
  });
  while (idx < remaining.length) {
    assign(remaining[idx++], closing ? 'closing' : (phase === 'pressure' ? 'probe' : 'expand'), closing ? mainTarget : missionExpandTarget);
  }

  return { unitObjective, deceptionActive, missionCounts };
}

/** Small garrison parties on owned mines/pumps so expansion sites are not free captures. */
function assignResourceGarrisonMissions(gs, player, unitObjective, combatUnits) {
  const turn = gs.turn || 1;
  if (turn < 4) return;
  const extractors = gs.buildings.filter((b) =>
    Number(b.owner) === Number(player) && !b.underConstruction
    && (b.type === 'MINE' || b.type === 'OIL_PUMP'));
  const pool = combatUnits.filter((u) => {
    const role = getUnitRole(u.type);
    if (role === 'indirect' || role === 'engineer' || role === 'support') return false;
    const m = unitObjective[u.id]?.mission;
    return !m || m === 'expand' || m === 'probe' || m === 'garrison';
  });

  for (const ext of extractors) {
    const guards = gs.units.filter((u) => u.owner === player && !u.embarked
      && hexDistance(u.q, u.r, ext.q, ext.r) <= 3
      && ((UNIT_TYPES[u.type]?.soft_attack || 0) > 0 || (UNIT_TYPES[u.type]?.hard_attack || 0) > 0));
    const want = turn < 12 ? 1 : 2;
    if (guards.length >= want) continue;

    let best = null;
    let bestD = Infinity;
    for (const u of pool) {
      if (unitObjective[u.id]?.kind === 'resource') continue;
      const d = hexDistance(u.q, u.r, ext.q, ext.r);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (best && bestD <= 16) {
      unitObjective[best.id] = { q: ext.q, r: ext.r, mission: 'garrison', kind: 'resource' };
    }
  }
}

/** Push combat units onto enemy mines/pumps (capture by occupation, not unit attack). */
function assignEnemyExtractorRaidMissions(gs, player, unitObjective, combatUnits, perceivedEnemies = []) {
  const turn = gs.turn || 1;
  if (turn < 8) return;
  const targets = gs.buildings.filter((b) =>
    Number(b.owner) !== Number(player) && !b.underConstruction
    && (b.type === 'MINE' || b.type === 'OIL_PUMP' || b.type === 'VILLAGE' || b.type === 'TOWN' || b.type === 'CITY'));
  if (!targets.length) return;

  const pool = combatUnits.filter((u) => {
    const role = getUnitRole(u.type);
    if (role === 'engineer' || role === 'support') return false;
    const m = unitObjective[u.id]?.mission;
    return !m || m === 'expand' || m === 'probe' || m === 'main' || m === 'closing' || m === 'garrison';
  });
  if (!pool.length) return;

  const frontBias = (t) => {
    let score = 0;
    for (const e of perceivedEnemies) {
      const d = hexDistance(t.q, t.r, e.q, e.r);
      if (d <= 10) score += Math.max(0, 12 - d);
    }
    for (const u of pool) {
      const d = hexDistance(t.q, t.r, u.q, u.r);
      if (d <= 8) score += Math.max(0, 8 - d);
    }
    return score;
  };

  const ranked = targets
    .map((t) => ({ t, score: frontBias(t) + (t.type === 'OIL_PUMP' ? 2 : 0) }))
    .sort((a, b) => b.score - a.score);

  const maxRaids = turn >= 40 ? 10 : 6;
  let assigned = 0;
  for (const { t } of ranked) {
    if (assigned >= maxRaids) break;
    const guards = gs.units.filter((u) => u.owner !== player && !u.embarked
      && hexDistance(u.q, u.r, t.q, t.r) <= 2);
    if (guards.length >= 3) continue;

    let best = null;
    let bestD = Infinity;
    for (const u of pool) {
      if (unitObjective[u.id]?.kind === 'raid_resource') continue;
      const d = hexDistance(u.q, u.r, t.q, t.r);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (!best || bestD > 22) continue;
    unitObjective[best.id] = { q: t.q, r: t.r, mission: 'main', kind: 'raid_resource' };
    assigned += 1;
  }
}

/** Capture / reinforce neutral VTCs (cities first) after owned coverage is assigned. */
function assignHoldVTCCMissions(gs, player, unitObjective, combatUnits, perceivedEnemies = []) {
  const turn = gs.turn || 1;
  if (turn < 3) return;
  const capital = getPlayerCapital(gs, player);
  const pool = combatUnits.filter((u) => {
    const m = unitObjective[u.id]?.mission;
    return m !== 'hold_vtc' && (!m || ['expand', 'probe', 'garrison'].includes(m));
  });

  const neutralVTC = gs.buildings
    .filter(b => Number(b.owner) === 0 && !b.underConstruction
      && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type))
    .map(vtc => ({
      vtc,
      weight: vtcStrategicWeight(vtc),
      nearOwned: gs.buildings.some(v =>
        Number(v.owner) === Number(player) && ['VILLAGE', 'TOWN', 'CITY'].includes(v.type)
        && hexDistance(v.q, v.r, vtc.q, vtc.r) <= 16),
      threat: perceivedEnemies.filter(e => hexDistance(e.q, e.r, vtc.q, vtc.r) <= 10).length,
    }))
    .sort((a, b) => b.weight - a.weight || Number(b.nearOwned) - Number(a.nearOwned) || b.threat - a.threat);

  let secured = 0;
  const maxSecure = turn < 20 ? 4 : 7;
  for (const { vtc, nearOwned } of neutralVTC) {
    if (secured >= maxSecure) break;
    const enemyOn = gs.units.some(u => Number(u.owner) !== Number(player) && !u.embarked
      && hexDistance(u.q, u.r, vtc.q, vtc.r) <= 2);
    const nearCap = capital && hexDistance(vtc.q, vtc.r, capital.q, capital.r) <= 24;
    const stagnantExpand = turn >= 28 && combatUnits.length <= 9;
    if (!nearOwned && !nearCap && !enemyOn && !stagnantExpand) continue;
    if (stagnantExpand && capital && hexDistance(vtc.q, vtc.r, capital.q, capital.r) > 44) continue;
    let best = null;
    let bestD = Infinity;
    for (const u of pool) {
      if (unitObjective[u.id]?.kind === 'settlement') continue;
      const d = hexDistance(u.q, u.r, vtc.q, vtc.r);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (best && bestD <= 26) {
      unitObjective[best.id] = { q: vtc.q, r: vtc.r, mission: 'expand', kind: 'settlement', vtcType: vtc.type };
      secured += 1;
    }
  }
}

/** Recapture nearby lost structures that are lightly defended. */
function assignLocalRecaptureMissions(gs, player, unitObjective, combatUnits, perceivedEnemies = []) {
  const turn = gs.turn || 1;
  if (turn < 10) return;
  const myHQs = getPlayerCapitalBuildings(gs, player);
  const nearOwnAxis = (b) => myHQs.some(h => hexDistance(h.q, h.r, b.q, b.r) <= 18)
    || gs.buildings.some(v =>
      Number(v.owner) === Number(player) && ['VILLAGE', 'TOWN', 'CITY'].includes(v.type)
      && hexDistance(v.q, v.r, b.q, b.r) <= 14);
  const targets = gs.buildings.filter((b) =>
    Number(b.owner) !== Number(player) && !b.underConstruction && !ROAD_TYPES.has(b.type)
    && (b.type === 'MINE' || b.type === 'OIL_PUMP' || b.type === 'FACTORY' || b.type === 'SCIENCE_LAB' || b.type === 'BARRACKS' || b.type === 'VILLAGE' || b.type === 'TOWN' || b.type === 'CITY')
    && nearOwnAxis(b)
  );
  if (!targets.length) return;
  const pool = combatUnits.filter((u) => {
    const role = getUnitRole(u.type);
    if (role === 'engineer' || role === 'support') return false;
    const m = unitObjective[u.id]?.mission;
    return !m || m === 'expand' || m === 'probe' || m === 'main' || m === 'closing' || m === 'garrison';
  });
  if (!pool.length) return;

  const ranked = targets.map((t) => {
    const threat = perceivedEnemies.reduce((s, e) => {
      const d = hexDistance(t.q, t.r, e.q, e.r);
      return s + (d <= 5 ? (6 - d) : 0);
    }, 0);
    const value = t.type === 'CITY' ? 12 : t.type === 'TOWN' ? 10 : t.type === 'VILLAGE' ? 9
      : t.type === 'FACTORY' ? 8 : t.type === 'SCIENCE_LAB' ? 7 : (t.type === 'MINE' || t.type === 'OIL_PUMP') ? 6 : 5;
    return { t, score: value - threat };
  }).sort((a, b) => b.score - a.score);

  let assigned = 0;
  const maxRecaptures = turn >= 40 ? 8 : 4;
  for (const { t } of ranked) {
    if (assigned >= maxRecaptures) break;
    const guards = gs.units.filter((u) => Number(u.owner) !== Number(player) && !u.embarked
      && hexDistance(u.q, u.r, t.q, t.r) <= 2);
    if (guards.length >= 3) continue;
    let best = null;
    let bestD = Infinity;
    for (const u of pool) {
      if (unitObjective[u.id]?.kind === 'raid_resource' || unitObjective[u.id]?.kind === 'recapture') continue;
      const d = hexDistance(u.q, u.r, t.q, t.r);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (!best || bestD > 20) continue;
    unitObjective[best.id] = { q: t.q, r: t.r, mission: 'main', kind: 'recapture' };
    assigned += 1;
  }
}

function shouldPrioritizeOilOverMine(gs, player) {
  const myMines = gs.buildings.filter(b => Number(b.owner) === Number(player) && b.type === 'MINE' && !b.underConstruction).length;
  const myPumps = gs.buildings.filter(b => Number(b.owner) === Number(player) && b.type === 'OIL_PUMP' && !b.underConstruction).length;
  if (myMines < 3) return false;
  const myOil = estimateExtractorIncome(gs, player, 'oil');
  const focus = pickPrimaryEnemyHQ(gs, player, gs.buildings.filter(b => b.type === 'HQ' && Number(b.owner) !== Number(player)));
  const eo = focus ? Number(focus.owner) : null;
  let enemyOil = 0;
  if (eo != null) enemyOil = estimateExtractorIncome(gs, eo, 'oil');
  else {
    for (const p of Object.keys(gs.players || {})) {
      if (Number(p) === Number(player)) continue;
      enemyOil = Math.max(enemyOil, estimateExtractorIncome(gs, p, 'oil'));
    }
  }
  return enemyOil >= myOil * 1.5 && myPumps < myMines;
}

function getStagnantArmyBreakout(gs, player, strategic, myCombatUnits) {
  const turn = gs.turn || 1;
  if (turn < 20 || myCombatUnits.length > 11) return false;
  const iron = gs.players[player]?.iron || 0;
  if (iron < 30 && turn < 45) return false;
  const streak = gs._aiStagnation?.[player]?.buildOnlyStreak || 0;
  const phaseTurns = strategic?.phaseTurns || 0;
  const phase = strategic?.phase || 'expand';
  const phaseStuck = ['pressure', 'stabilize', 'expand'].includes(phase)
    && phaseTurns >= 12 && myCombatUnits.length <= 9;
  const longTinyArmy = turn >= 35 && myCombatUnits.length <= 8;
  const buildOnlyStreak = streak >= 2;
  return phaseStuck || longTinyArmy || buildOnlyStreak;
}

/** When manpower is idle but VTC queues are clogged, prune and queue infantry. */
function forceArmyRecruitWhenIdle(gs, player, actions, resSim, spend, noteRecruit, recruitAllowed, myCapital, maxRecruits) {
  if (actions.some(a => a.type === 'recruit')) return 0;
  const pop = getPopBreakdown(gs, player);
  const combatLive = countPlayerCombatUnits(gs, player);
  if (pop.avail < 2 || combatLive >= 10) return 0;
  pruneVtcQueueBacklog(gs, player);
  const prefs = filterRecruitPrioForVtc(gs, player, ['INFANTRY', 'RECON', 'ANTI_TANK', 'MORTAR']);
  let queued = 0;
  for (let pass = 0; pass < maxRecruits && queued < maxRecruits; pass++) {
    let added = false;
    for (const unitType of prefs) {
      if (!recruitAllowed(unitType)) continue;
      const anchor = pickBestVTCToQueue(gs, player, unitType, myCapital);
      if (!anchor) continue;
      if (!getGlobalRecruitOptionsForVTC(gs, player, anchor.id).includes(unitType)) continue;
      const check = canQueueGlobalRecruit(gs, player, unitType, anchor.id);
      if (!check.ok) continue;
      const popGate = canAffordPipelinePop(gs, player, unitType);
      if (!popGate.ok) continue;
      const c = UNIT_TYPES[unitType]?.cost || {};
      const f = getRecruitFoodCost(unitType);
      if (resSim.iron < (c.iron || 0) || resSim.oil < (c.oil || 0) || resSim.wood < (c.wood || 0)
        || resSim.food < f || resSim.components < (c.components || 0)) continue;
      actions.push({ type: 'recruit', buildingId: anchor.id, unitType, global: true });
      noteRecruit(unitType);
      spend(c);
      resSim.food -= f;
      queued += 1;
      added = true;
      break;
    }
    if (!added) break;
  }
  if (queued === 0 && myCapital && !isVtcUpgradeComplete(myCapital, 'barracks')) {
    const barracksBuy = canPurchaseVtcUpgrade(gs, player, myCapital.id, 'barracks');
    if (barracksBuy.ok && !actions.some(a => a.type === 'vtc_upgrade' && a.buildingId === myCapital.id)) {
      actions.push({ type: 'vtc_upgrade', buildingId: myCapital.id, upgradeId: 'barracks' });
      return 1;
    }
  }
  return queued;
}

function trimActionsForStagnationBreakout(actions, maxBuilds = 1) {
  const kept = [];
  let builds = 0;
  for (const a of actions) {
    if (['attack', 'move', 'recruit', 'global_deploy', 'vtc_upgrade', 'transport_load', 'transport_unload', 'digin', 'ambush', 'research_queue'].includes(a.type)) {
      kept.push(a);
      continue;
    }
    if (a.type === 'build' && builds < maxBuilds) {
      kept.push(a);
      builds += 1;
    }
  }
  actions.length = 0;
  actions.push(...kept);
}

/** Push combat units toward neutral/enemy settlements when the plan was logistics-only. */
function enforceExpansionMoveFloor(gs, player, actions, terrain, mapSize, enemyHQs, myCapital, moveMemory) {
  const goals = [];
  for (const b of gs.buildings || []) {
    if (b.underConstruction || ROAD_TYPES.has(b.type)) continue;
    if (Number(b.owner) === 0 && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type)) {
      goals.push(b);
    } else if (Number(b.owner) !== Number(player) && Number(b.owner) > 0
      && ['VILLAGE', 'TOWN', 'CITY', 'HQ'].includes(b.type)) {
      goals.push(b);
    }
  }
  for (const hq of enemyHQs || []) {
    if (!goals.some(g => g.q === hq.q && g.r === hq.r)) goals.push(hq);
  }
  if (!goals.length && myCapital) goals.push(myCapital);
  if (!goals.length) return 0;

  const acted = new Set(actions.filter(a => (a.type === 'move' || a.type === 'attack') && a.unitId != null).map(a => a.unitId));
  const fighters = gs.units.filter((u) => {
    if (Number(u.owner) !== Number(player) || u.embarked) return false;
    const role = getUnitRole(u.type);
    if (role === 'engineer' || role === 'support') return false;
    const d = UNIT_TYPES[u.type] || {};
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  });

  let added = 0;
  for (const unit of fighters) {
    if (acted.has(unit.id)) continue;
    const goal = goals.reduce((best, g) => {
      const d = hexDistance(unit.q, unit.r, g.q, g.r);
      return d < best.d ? { g, d } : best;
    }, { g: goals[0], d: hexDistance(unit.q, unit.r, goals[0].q, goals[0].r) });
    const reachable = getReachableHexesForAI(gs, unit, terrain, mapSize) || [];
    const step = reachable
      .filter(h => hexDistance(h.q, h.r, goal.g.q, goal.g.r) < hexDistance(unit.q, unit.r, goal.g.q, goal.g.r))
      .filter(h => !isImmediateBacktrack(unit, h, moveMemory?.[unit.id], gs.turn || 1))
      .sort((a, b) => hexDistance(a.q, a.r, goal.g.q, goal.g.r) - hexDistance(b.q, b.r, goal.g.q, goal.g.r))[0];
    if (!step) continue;
    actions.push({
      type: 'move',
      unitId: unit.id,
      fromQ: unit.q,
      fromR: unit.r,
      toQ: step.q,
      toR: step.r,
    });
    moveMemory[unit.id] = { fromQ: unit.q, fromR: unit.r, toQ: step.q, toR: step.r, turn: gs.turn || 1 };
    acted.add(unit.id);
    added += 1;
  }
  return added;
}

/** At least one attack per turn when enemies are known but doctrine would stay passive. */
function enforceContactAttackFloor(gs, player, actions, perceivedEnemies) {
  const turn = gs.turn || 1;
  if (turn < 12 || !perceivedEnemies?.length) return 0;
  if (actions.some(a => a.type === 'attack')) return 0;

  const attacked = new Set();
  const combatUnits = gs.units.filter((u) => {
    if (Number(u.owner) !== Number(player) || u.embarked) return false;
    const role = getUnitRole(u.type);
    if (role === 'engineer' || role === 'support') return false;
    const d = UNIT_TYPES[u.type] || {};
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  });

  for (const unit of combatUnits) {
    const targets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
    const target = chooseBestTarget(gs, unit, targets);
    if (!target) continue;
    const trade = estimateAttackCommitScore(gs, unit, target);
    const kill = (target.health || 99) <= 1;
    if (!kill && trade < -2) continue;
    actions.unshift({
      type: 'attack',
      attackerId: unit.id,
      targetId: target.id,
      attackerQ: unit.q,
      attackerR: unit.r,
      targetQ: target.q,
      targetR: target.r,
    });
    attacked.add(unit.id);
    return 1;
  }
  return 0;
}

function enforceClosingAttackFloor(gs, player, actions, strategic) {
  const endgame = strategic?.endgamePressure ?? 0;
  if (strategic?.phase !== 'closing' && endgame < 0.5) return 0;
  const minAttacks = endgame >= 0.72 ? 3 : (endgame >= 0.58 ? 2 : 1);
  const existing = actions.filter(a => a.type === 'attack').length;
  if (existing >= minAttacks) return 0;

  let added = 0;
  const attacked = new Set(actions.filter(a => a.type === 'attack').map(a => a.attackerId));
  const combatUnits = gs.units.filter((u) => {
    if (Number(u.owner) !== Number(player) || u.embarked) return false;
    const role = getUnitRole(u.type);
    if (role === 'engineer' || role === 'support') return false;
    const d = UNIT_TYPES[u.type] || {};
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  }).sort((a, b) => {
    const score = (u) => {
      const d = UNIT_TYPES[u.type] || {};
      return (d.hard_attack || 0) + (d.soft_attack || 0) + (UNIT_TYPES[u.type]?.tier || 0) * 2;
    };
    return score(b) - score(a);
  });

  for (const unit of combatUnits) {
    if (existing + added >= minAttacks) break;
    if (attacked.has(unit.id)) continue;
    const targets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
    const target = chooseBestTarget(gs, unit, targets);
    if (!target) continue;
    const trade = estimateAttackCommitScore(gs, unit, target);
    const floor = endgame >= 0.65 ? -6 : -3;
    if (trade < floor && (target.health || 99) > 2) continue;
    actions.unshift({
      type: 'attack',
      attackerId: unit.id,
      targetId: target.id,
      attackerQ: unit.q,
      attackerR: unit.r,
      targetQ: target.q,
      targetR: target.r,
    });
    attacked.add(unit.id);
    added += 1;
  }
  return added;
}

/** When the plan is all logistics builds, force deploy / recruit / advance so the AI does not look idle. */
function ensureMinimumArmyProgress(gs, player, actions, resSim, terrain, mapSize, enemyHQs, myCapital, recruitAllowed, noteRecruit, spend, maxRecruitsThisTurn) {
  const deployed = planDeployReadyVtcUnits(gs, player, actions, terrain, {
    capital: myCapital,
    focusEnemy: enemyHQs[0],
    unitObjective: {},
    territorial: null,
  });
  if (deployed > 0) return deployed;

  const hasArmyAction = actions.some(a =>
    ['attack', 'move', 'recruit', 'global_deploy', 'vtc_upgrade'].includes(a.type));
  if (hasArmyAction) return 0;

  const isFighter = (u) => {
    if (Number(u.owner) !== Number(player) || u.embarked) return false;
    const role = getUnitRole(u.type);
    if (role === 'engineer' || role === 'support') return false;
    const d = UNIT_TYPES[u.type] || {};
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  };
  const fighters = gs.units.filter(isFighter);
  if (!fighters.length) return 0;

  for (const b of gs.buildings) {
    if (Number(b.owner) !== Number(player) || !PRODUCTION_VTC_TYPES.has(b.type) || b.underConstruction) continue;
    const n = planDeployReadyVtcUnits(gs, player, actions, terrain, {
      capital: myCapital,
      focusEnemy: enemyHQs[0],
      unitObjective: {},
      territorial: null,
    });
    if (n > 0) return n;
  }

  if (actions.filter(a => a.type === 'recruit').length < maxRecruitsThisTurn && recruitAllowed('INFANTRY')) {
    const anchor = pickBestVTCToQueue(gs, player, 'INFANTRY', myCapital);
    if (anchor && canQueueGlobalRecruit(gs, player, 'INFANTRY', anchor.id).ok) {
      const c = UNIT_TYPES.INFANTRY?.cost || {};
      const food = getRecruitFoodCost('INFANTRY');
      if (resSim.iron >= (c.iron || 0) && resSim.oil >= (c.oil || 0) && resSim.wood >= (c.wood || 0)
        && resSim.food >= food && resSim.components >= (c.components || 0)) {
        actions.push({ type: 'recruit', buildingId: anchor.id, unitType: 'INFANTRY', global: true });
        noteRecruit('INFANTRY');
        spend(c);
        resSim.food -= food;
        return 1;
      }
    }
  }

  const goals = (enemyHQs?.length ? enemyHQs : []);
  for (const b of gs.buildings || []) {
    if (b.underConstruction || ROAD_TYPES.has(b.type)) continue;
    const neutral = Number(b.owner) === 0;
    const enemy = Number(b.owner) !== Number(player) && Number(b.owner) > 0;
    if ((neutral || enemy) && ['HQ', 'VILLAGE', 'TOWN', 'CITY'].includes(b.type)) {
      goals.push(b);
    }
  }
  if (!goals.length) return 0;

  const unit = fighters.find((u) => !actions.some((a) => a.unitId === u.id)) || fighters[0];
  const goal = goals.slice().sort((a, b) =>
    hexDistance(unit.q, unit.r, a.q, a.r) - hexDistance(unit.q, unit.r, b.q, b.r))[0];
  const reachable = getReachableHexesForAI(gs, unit, terrain, mapSize) || [];
  const step = reachable
    .filter((h) => hexDistance(h.q, h.r, goal.q, goal.r) < hexDistance(unit.q, unit.r, goal.q, goal.r))
    .sort((a, b) =>
      hexDistance(a.q, a.r, goal.q, goal.r) - hexDistance(b.q, b.r, goal.q, goal.r))[0];
  if (step) {
    actions.unshift({
      type: 'move',
      unitId: unit.id,
      fromQ: unit.q,
      fromR: unit.r,
      toQ: step.q,
      toR: step.r,
    });
    return 1;
  }
  return 0;
}

function planResearchFloorActions(gs, player, terrain, actions, resSim, canAfford, spend) {
  const turn = gs.turn || 1;
  if (turn < 8) return { labQueued: false, researchQueued: false };
  let labQueued = false;
  let researchQueued = false;

  const labsOnline = countPlayerScienceLabs(gs, player);
  const hasLabUpgrade = actions.some(a => a.type === 'vtc_upgrade' && a.upgradeId === 'science_lab');
  labQueued = labsOnline > 0 || hasLabUpgrade;

  const pState = gs.players[player] || {};
  pState.research = pState.research || { queue: [], unlocked: [], slots: 1 };
  const resState = pState.research;
  const queueLen = resState.queue?.length || 0;
  const techTree = gs._techTree || TECH_TREE || {};
  const unlocked = new Set(resState.unlocked || []);
  const queued = new Set((resState.queue || []).map(q => q.techId));
  const prereqsMet = (tech) => (tech.prereqs || []).every(p => unlocked.has(p));

  if ((labsOnline > 0 || labQueued) && queueLen === 0 && resSim.iron >= 30
      && !actions.some(a => a.type === 'research_queue')) {
    const choices = Object.values(techTree)
      .filter(t => t && t.id && !unlocked.has(t.id) && !queued.has(t.id) && prereqsMet(t));
    if (choices.length > 0) {
      const rank = (t) => {
        let s = 0;
        if (t.branch === 'industrial') s += 14;
        if (t.branch === 'science') s += 8;
        if (t.id === 'gravel_roads' || t.id === 'concrete_roads') s += 10;
        if (t.branch === 'vehicles') s += 7;
        s -= (t.tier || 0) * 1.2;
        s -= (t.cost || 0) * 0.06;
        return s;
      };
      choices.sort((a, b) => rank(b) - rank(a));
      actions.unshift({ type: 'research_queue', techId: choices[0].id });
      researchQueued = true;
    }
  }
  return { labQueued, researchQueued };
}

function assignTerritorialObjectives(gs, player, mapSize, territorial, unitObjective, combatUnits, flankCount) {
  const turn = gs.turn || 1;
  if (!territorial || turn < 8 || !combatUnits?.length) return;

  const ownedSettle = gs.buildings
    .filter(b => Number(b.owner) === Number(player) && !b.underConstruction
      && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type) && !b.isCapital)
    .map(b => ({ q: b.q, r: b.r, score: vtcStrategicWeight(b) }))
    .sort((a, b) => b.score - a.score);
  let settleIdx = 0;
  for (const u of combatUnits) {
    if (settleIdx >= ownedSettle.length) break;
    const existing = unitObjective[u.id]?.mission;
    if (existing && !['expand', 'probe', 'garrison'].includes(existing)) continue;
    const role = getUnitRole(u.type);
    if (role === 'engineer' || role === 'support' || role === 'indirect') continue;
    const t = ownedSettle[settleIdx++];
    unitObjective[u.id] = { q: t.q, r: t.r, kind: 'settlement', mission: 'hold_vtc' };
  }

  const chokes = territorial.chokes || [];
  const coasts = territorial.coastal || [];
  const flankPool = combatUnits.slice(0, Math.max(2, flankCount || Math.floor(combatUnits.length * 0.35)));
  const garrisonCap = Math.min(chokes.length, Math.max(3, Math.floor(flankPool.length * 0.55)));

  let chokeIdx = 0;
  for (const u of flankPool) {
    if (chokeIdx >= garrisonCap) break;
    const existing = unitObjective[u.id]?.mission;
    if (existing && !['expand', 'probe', 'garrison'].includes(existing)) continue;
    const role = getUnitRole(u.type);
    if (role !== 'line' && u.type !== 'ANTI_TANK' && u.type !== 'MORTAR') continue;
    const choke = chokes[chokeIdx % chokes.length];
    if (!choke) break;
    unitObjective[u.id] = { q: choke.q, r: choke.r, kind: 'choke', role: 'garrison', mission: 'garrison' };
    chokeIdx++;
  }

  const patrols = gs.units.filter(u => u.owner === player && u.type === 'PATROL_BOAT' && !u.embarked);
  for (let i = 0; i < patrols.length; i++) {
    const coast = coasts[i % Math.max(1, coasts.length)];
    if (coast) unitObjective[patrols[i].id] = { q: coast.q, r: coast.r, kind: 'coast', role: 'patrol' };
  }

  // Large maps: dedicate a subset of combat units to expansion anchors.
  if (mapSize >= 90) {
    const expansions = (territorial.expansions || []).slice(0, 10);
    if (expansions.length > 0) {
      const claimPool = combatUnits.filter((u) => {
        const role = getUnitRole(u.type);
        if (role === 'engineer' || role === 'support' || role === 'indirect') return false;
        const existing = unitObjective[u.id]?.mission;
        return !existing || ['expand', 'probe', 'garrison'].includes(existing);
      });
      const claimN = Math.min(claimPool.length, Math.max(2, Math.floor(combatUnits.length * 0.22)));
      for (let i = 0; i < claimN; i++) {
        const u = claimPool[i];
        const t = expansions[i % expansions.length];
        if (!u || !t) break;
        unitObjective[u.id] = { q: t.q, r: t.r, kind: 'expansion_claim', mission: 'expand' };
      }
    }
  }
}

function transportCargoStats(transport, gs) {
  const def = UNIT_TYPES[transport.type] || {};
  const cap = def.capacity || { infantry: 0, vehicle: 0 };
  const cargo = transport.cargo || [];
  let loadedInf = 0;
  let loadedVeh = 0;
  for (const id of cargo) {
    const u = gs.units.find(x => x.id === id);
    if (!u) continue;
    if (['TANK', 'ARTILLERY', 'ANTI_TANK'].includes(u.type)) loadedVeh++;
    else loadedInf++;
  }
  return {
    loadedInf, loadedVeh, cap,
    hasRoom: loadedInf < cap.infantry || loadedVeh < cap.vehicle,
  };
}

function canLoadOnTransport(transport, cargoUnit, gs) {
  const stats = transportCargoStats(transport, gs);
  const isVehicle = ['TANK', 'ARTILLERY', 'ANTI_TANK'].includes(cargoUnit.type);
  return isVehicle ? stats.loadedVeh < stats.cap.vehicle : stats.loadedInf < stats.cap.infantry;
}

function projectedPosFromActions(gs, unitId, actions) {
  const u = gs.units.find(x => x.id === unitId);
  if (!u) return null;
  let q = u.q, r = u.r;
  for (const a of actions) {
    if (a.type === 'move' && a.unitId === unitId) { q = a.toQ; r = a.toR; }
  }
  return { q, r };
}

function findAdjacentLoadCandidates(gs, tq, tr, player, actions = []) {
  return gs.units.filter(u => {
    if (u.owner !== player || u.embarked) return false;
    if (NAVAL_UNITS.has(u.type) || AIR_UNITS.has(u.type)) return false;
    if (getUnitRole(u.type) === 'support' || u.type === 'ENGINEER') return false;
    const pos = projectedPosFromActions(gs, u.id, actions) || { q: u.q, r: u.r };
    return hexDistance(tq, tr, pos.q, pos.r) <= 1;
  });
}

function findBestUnloadHex(gs, terrain, mapSize, tq, tr, player, strategic, territorial) {
  const dropTargets = [
    ...(territorial?.remoteTargets || []).slice(0, 6),
    ...(territorial?.expansions || []).slice(0, 8),
    ...(territorial?.chokes || []).slice(0, 6),
    strategic?.objectives?.flank,
    strategic?.objectives?.main,
  ].filter(Boolean);

  let best = null;
  let bestScore = -999;
  for (const [dq, dr] of _CHOKE_DIRS) {
    const uq = tq + dq, ur = tr + dr;
    const tt = terrain?.[`${uq},${ur}`] ?? 0;
    if (!(tt <= 3 || tt === 6)) continue;
    if (unitAt(gs, uq, ur)) continue;
    let score = 0;
    for (const t of dropTargets) {
      score += Math.max(0, 16 - hexDistance(uq, ur, t.q, t.r) * 2);
    }
    score += chokepointLandValue(terrain, mapSize, uq, ur) * 1.8;
    if (isCoastalLand(terrain, mapSize, uq, ur)) score += 4;
    const enemies = gs.units.filter(e => Number(e.owner) !== Number(player) && !e.embarked);
    const nearEnemy = enemies.length ? Math.min(...enemies.map(e => hexDistance(uq, ur, e.q, e.r))) : 99;
    if (nearEnemy >= 3 && nearEnemy <= 9) score += 6;
    if (nearEnemy <= 1) score -= 10;
    if (score > bestScore) { bestScore = score; best = { q: uq, r: ur }; }
  }
  return best;
}

function planTransportMissions(gs, terrain, mapSize, player, strategic, territorial) {
  const missions = {};
  const transports = gs.units.filter(u => u.owner === player && AI_TRANSPORT_TYPES.has(u.type) && !u.embarked);
  if ((gs.turn || 1) < 10 || transports.length === 0) return missions;

  const pickupZones = [];
  const yards = gs.buildings.filter(b => b.owner === player && b.type === 'NAVAL_YARD' && !b.underConstruction);
  for (const y of yards) pickupZones.push({ q: y.q, r: y.r, score: 5 });
  for (const u of gs.units.filter(x => x.owner === player && !x.embarked && !NAVAL_UNITS.has(x.type) && getUnitRole(x.type) === 'line')) {
    if (isCoastalLand(terrain, mapSize, u.q, u.r)) pickupZones.push({ q: u.q, r: u.r, score: 7 });
  }

  const dropZones = [
    ...(territorial?.remoteTargets || []).slice(0, 6),
    ...(territorial?.expansions || []).slice(0, 8),
    ...(territorial?.chokes || []).slice(0, 5),
  ].filter(Boolean);
  if (!dropZones.length && strategic?.objectives?.flank) dropZones.push(strategic.objectives.flank);

  for (const tr of transports) {
    const cargoN = (tr.cargo || []).length;
    if (cargoN > 0 && dropZones.length > 0) {
      const best = dropZones.reduce((a, b) =>
        hexDistance(tr.q, tr.r, a.q, a.r) <= hexDistance(tr.q, tr.r, b.q, b.r) ? a : b);
      missions[tr.id] = { q: best.q, r: best.r, mode: 'drop' };
    } else if (pickupZones.length > 0) {
      const best = pickupZones.reduce((a, b) =>
        hexDistance(tr.q, tr.r, a.q, a.r) <= hexDistance(tr.q, tr.r, b.q, b.r) ? a : b);
      missions[tr.id] = { q: best.q, r: best.r, mode: 'pickup' };
    }
  }
  return missions;
}

function planTransportOperations(gs, terrain, mapSize, player, strategic, territorial, actions) {
  const out = [];
  const turn = gs.turn || 1;
  if (turn < 10) return out;
  const hasYard = gs.buildings.some(b => b.owner === player && b.type === 'NAVAL_YARD' && !b.underConstruction);
  if (!hasYard) return out;

  const transports = gs.units.filter(u => u.owner === player && AI_TRANSPORT_TYPES.has(u.type) && !u.embarked);
  for (const tr of transports) {
    const pos = projectedPosFromActions(gs, tr.id, actions);
    if (!pos) continue;
    const { q: tq, r: trr } = pos;
    const cargo = tr.cargo || [];

    if (cargo.length > 0) {
      const unloadHex = findBestUnloadHex(gs, terrain, mapSize, tq, trr, player, strategic, territorial);
      if (unloadHex && hexDistance(tq, trr, unloadHex.q, unloadHex.r) <= 1) {
        out.push({ type: 'transport_unload', transportId: tr.id, toQ: unloadHex.q, toR: unloadHex.r });
        continue;
      }
    }

    const stats = transportCargoStats(tr, gs);
    if (stats.hasRoom) {
      const candidates = findAdjacentLoadCandidates(gs, tq, trr, player, actions)
        .filter(u => canLoadOnTransport(tr, u, gs))
        .sort((a, b) => {
          const pri = (t) => (t === 'INFANTRY' ? 3 : t === 'ANTI_TANK' ? 2 : 1);
          return pri(b.type) - pri(a.type);
        });
      if (candidates.length > 0) {
        out.push({ type: 'transport_load', transportId: tr.id, cargoUnitId: candidates[0].id });
      }
    }
  }
  return out;
}

function scoreMove(gs, terrain, unit, q, r, strat, enemies, myHQs, mySupply, ctx = {}) {
  const cfg = AI_STRATEGIES[strat] ?? AI_STRATEGIES.balanced;
  const role = getUnitRole(unit.type);
  const phase = ctx.phaseWeights || getPhaseWeights(gs.turn || 1);
  let score = 0;

  const nearestEnemy = enemies.length > 0 ? Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r))) : 99;
  const obj = ctx.unitObjective?.[unit.id];
  const mission = obj?.mission || obj?.kind || 'expand';
  const rushMissions = new Set(['main', 'closing']);
  const probeMissions = new Set(['probe', 'diversion']);
  const passiveMissions = new Set(['scout', 'expand', 'garrison']);
  const expandMissions = new Set(['expand', 'scout', 'probe']);
  const lastMove = ctx.moveMemory?.[unit.id];

  // Anti-oscillation guard: discourage ping-pong between adjacent hexes on quiet turns.
  if (lastMove && Number((gs.turn || 1) - (lastMove.turn || 0)) <= 3) {
    const goingBack = q === lastMove.fromQ && r === lastMove.fromR
      && unit.q === lastMove.toQ && unit.r === lastMove.toR;
    if (goingBack) {
      score -= 26;
      if (enemies.length === 0) score -= 18;
      if (mission === 'stabilize' || mission === 'garrison' || mission === 'expand') score -= 8;
    }
  }

  // Attack/pressure scoring (de-emphasized for engineers/support)
  if (unit.type !== 'ENGINEER' && role !== 'support') {
    const attackable = getAttackableHexes(gs, unit, q, r, null);
    if (attackable.length > 0 && (rushMissions.has(mission) || mission === 'probe' || mission === 'diversion' || mission === 'expand')) {
      const atkScale = rushMissions.has(mission) ? 1 : (mission === 'expand' ? 0.62 : 0.45);
      score += ((cfg.attackBonus + 10) + attackable.length * 3) * phase.combat * atkScale;
      for (const h of attackable) {
        const t = gs.units.find(u => u.q === h.q && u.r === h.r && u.owner !== unit.owner);
        if (t && t.health <= 1) score += 25 * atkScale;
      }
    }
    if (mission === 'scout' && attackable.length > 0) {
      for (const h of attackable) {
        const t = gs.units.find(u => u.q === h.q && u.r === h.r && u.owner !== unit.owner);
        if (t && t.health <= 1) score += 18;
      }
    }

    // Blob rush: only main-push units chase nearest enemy every turn.
    if (enemies.length > 0 && rushMissions.has(mission)) {
      const currentDist = Math.min(...enemies.map(e => hexDistance(unit.q, unit.r, e.q, e.r)));
      if (cfg.retreatToHQ) {
        if (nearestEnemy > currentDist) score += cfg.captureBonus;
      } else {
        if (nearestEnemy < currentDist) score += (cfg.attackBonus + 5) * phase.combat;
        score += Math.max(0, 8 - nearestEnemy) * phase.combat;
      }
    }
    if (probeMissions.has(mission) && enemies.length > 0) {
      const currentDist = Math.min(...enemies.map(e => hexDistance(unit.q, unit.r, e.q, e.r)));
      if (nearestEnemy < currentDist && nearestEnemy >= 4) score += 6 * phase.recon;
      if (nearestEnemy <= 2) score -= 12;
    }
    if (mission === 'scout' && enemies.length > 0) {
      if (nearestEnemy >= 3 && nearestEnemy <= 8) score += 10 * phase.recon;
      if (nearestEnemy < 3) score -= 14;
      if (nearestEnemy > 10) score -= 4;
    }

    // Enemy extractors are captured by moving onto the hex — prioritize raids on frontline economy.
    const destBld = buildingAt(gs, q, r);
    if (destBld && Number(destBld.owner) !== Number(unit.owner) && !destBld.underConstruction
        && (destBld.type === 'MINE' || destBld.type === 'OIL_PUMP' || destBld.type === 'VILLAGE' || destBld.type === 'TOWN' || destBld.type === 'CITY')) {
      const closing = ctx.closingPressure || 0;
      const settlementBonus = destBld.type === 'CITY' ? 28 : destBld.type === 'TOWN' ? 20 : destBld.type === 'VILLAGE' ? 14 : 0;
      const raidPull = (((gs.turn || 1) >= 24 ? 58 : 42) + settlementBonus) * phase.combat;
      score += raidPull * (rushMissions.has(mission) || mission === 'probe' ? 1.15 : 0.75);
      score += closing * 18;
      if (obj?.kind === 'raid_resource') score += 28;
      const guard = gs.units.find(u => u.q === q && u.r === r && u.owner !== unit.owner && !u.embarked);
      if (guard && (guard.health || 99) <= 2) score += 14;
    }
    if (destBld && Number(destBld.owner) !== Number(unit.owner) && !destBld.underConstruction
        && !ROAD_TYPES.has(destBld.type)) {
      let capPull = 14 * phase.combat;
      if (destBld.type === 'FACTORY' || destBld.type === 'SCIENCE_LAB') capPull += 8;
      if (obj?.kind === 'recapture') capPull += 18;
      score += capPull;
    }
  }

  // HQ rush: main/closing assault — prefer focus enemy in FFA endgame.
  const allEnemyHQs = gs.buildings.filter(b => isPlayerCapitalBuilding(b) && b.owner !== unit.owner);
  const focusHQ = ctx.strategic?.focusEnemyHQ;
  const enemyHQs = (focusHQ && rushMissions.has(mission))
    ? [focusHQ, ...allEnemyHQs.filter(h => h !== focusHQ)]
    : allEnemyHQs;
  if (enemyHQs.length > 0 && !cfg.retreatToHQ && rushMissions.has(mission)) {
    const nd = Math.min(...enemyHQs.map(b => hexDistance(q, r, b.q, b.r)));
    const cd = Math.min(...enemyHQs.map(b => hexDistance(unit.q, unit.r, b.q, b.r)));
    const close = Math.max(ctx.closingPressure || 0, ctx.strategic?.endgamePressure || 0);
    const rushBoost = 7 + Math.floor(close * 22) + (mission === 'closing' ? 12 : 0);
    if (nd < cd) score += (unit.type === 'ENGINEER' ? 2 : rushBoost);
    if (close >= 0.45 && nd <= 10) score += 6 + close * 14;
    if (mission === 'closing' && nd <= 6) score += 10 + close * 18;
  }
  if (ctx.deceptionTurn && probeMissions.has(mission)) {
    const nearest = enemyHQs[0];
    if (nearest) {
      const lateral = Math.abs((q - nearest.q) - (r - nearest.r));
      score += Math.min(14, lateral * 0.9);
    }
  }

  // Mission objective pressure (scout / probe / diversion / main / expand / garrison)
  if ((obj?.kind === 'settlement' || obj?.kind === 'hold_vtc' || mission === 'hold_vtc') && mission !== 'expand') {
    const aq = obj?.anchorQ ?? obj?.q ?? unit.q;
    const ar = obj?.anchorR ?? obj?.r ?? unit.r;
    const vtcRad = vtcSupplyRadius({ type: obj?.vtcType });
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    const vtcW = obj?.vtcType === 'CITY' ? 1.35 : obj?.vtcType === 'TOWN' ? 1.15 : 1;
    if (dNew < dCur) score += 34 * (phase.economy || 1) * vtcW;
    if (dNew <= 1) score += 28 * vtcW;
    if (dNew <= 3) score += 16;
    const dAnchor = hexDistance(q, r, aq, ar);
    if (dAnchor >= 2 && dAnchor <= vtcRad) score += 12 * vtcW;
    if (dCur <= 2 && dNew > vtcRad) score -= 22;
    const nearEnemy = enemies.length > 0 ? Math.min(...enemies.map((e) => hexDistance(q, r, e.q, e.r))) : 99;
    if (nearEnemy <= 4 && dNew <= 2) score += 16;
    if (nearEnemy <= 2 && dNew > 4) score -= 12;
    const tt = terrain?.[`${q},${r}`] ?? 0;
    if ((mission === 'hold_vtc' || obj?.patrol) && (tt === 3 || tt === 1) && dAnchor <= vtcRad) score += 10;
  } else if (obj?.kind === 'resource' && mission === 'garrison') {
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    if (dNew < dCur) score += 22 * (phase.combat * 0.85 + 0.4);
    if (dNew <= 3) score += 14;
    const nearEnemy = enemies.length > 0 ? Math.min(...enemies.map((e) => hexDistance(q, r, e.q, e.r))) : 99;
    if (nearEnemy <= 4 && dNew <= 2) score += 10;
    if (nearEnemy <= 2 && dNew > 3) score -= 8;
  } else if (obj?.kind === 'choke' || obj?.role === 'garrison' || mission === 'garrison') {
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    if (dNew < dCur) score += 14 * (phase.combat * 0.7 + 0.35);
    if (dNew <= 3) score += 10;
    if (dNew <= 1) {
      score += chokepointLandValue(terrain, ctx.mapSize || gs._mapSize || 40, q, r) * 2.2;
    }
    if (enemies.length > 0) {
      const nearEnemy = Math.min(...enemies.map(e => hexDistance(q, r, e.q, e.r)));
      if (nearEnemy <= 2 && dNew > 4) score -= 14;
    }
  } else if ((obj?.kind === 'coast' || mission === 'naval_screen' || mission === 'naval_raid') && NAVAL_UNITS.has(unit.type)) {
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    const navalW = phase.naval || 1;
    if (dNew < dCur) score += 14 * navalW;
    if (dNew <= 6) score += 8 * navalW;
    if (dNew <= 2) score += 10 * navalW;
    if (isCoastalLand(terrain, ctx.mapSize || gs._mapSize || 40, q, r)) score += 5 * navalW;
  } else if ((mission === 'air_patrol' || AIR_UNITS.has(unit.type)) && obj) {
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    const airW = phase.air || 1;
    if (dNew < dCur) score += 12 * airW;
    if (dNew <= 5) score += 8 * airW;
  } else if (obj && role !== 'engineer' && role !== 'support') {
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    let pull = 18;
    if (mission === 'scout') pull = 22 * (phase.recon || 1);
    else if (mission === 'probe') pull = 16 * (phase.recon || 1);
    else if (mission === 'diversion') pull = 24 * (ctx.deceptionTurn ? 1.25 : 1);
    else if (mission === 'expand') pull = 20 * (phase.economy || 1);
    else if (mission === 'main') pull = 20 * phase.combat;
    else if (passiveMissions.has(mission)) pull = 14;

    if (dNew < dCur) score += pull;
    if (dNew <= 4) score += pull * 0.35;
    if (dNew <= 1) score += pull * 0.55;

    if (mission === 'expand' || mission === 'scout') {
      const resHex = ctx.resourceTargets?.find(t => t.q === obj.q && t.r === obj.r);
      if (resHex) score += 8 * (phase.economy || 1);
    }
    if (passiveMissions.has(mission) && enemies.length > 0 && nearestEnemy < 3) score -= 10;
  }
  if (obj?.kind === 'expansion_claim') {
    const dNew = hexDistance(q, r, obj.q, obj.r);
    const dCur = hexDistance(unit.q, unit.r, obj.q, obj.r);
    if (dNew < dCur) score += 22 * (phase.economy || 1);
    if (dNew <= 5) score += 10;
  }

  // Strategic lane pressure from persistent planner memory.
  if (ctx.strategic && role !== 'engineer' && role !== 'support') {
    const laneNow = getLaneForR(r, ctx.mapSize || gs._mapSize || 40);
    const laneCur = getLaneForR(unit.r, ctx.mapSize || gs._mapSize || 40);
    if (laneNow === ctx.strategic.primaryLane && laneCur !== ctx.strategic.primaryLane) score += 5 * phase.combat;
    if (laneNow === ctx.strategic.secondaryLane && laneCur !== ctx.strategic.secondaryLane) score += 2.5 * phase.combat;
    if ((ctx.strategic.phase === 'expand' || ctx.strategic.phase === 'stabilize') && laneNow === 'center') score -= 2.5;
  }

  // No-contact stability: avoid meaningless jitter when no enemies are currently known.
  if (enemies.length === 0 && role !== 'engineer' && role !== 'support') {
    const objDistNew = obj ? hexDistance(q, r, obj.q, obj.r) : null;
    const objDistCur = obj ? hexDistance(unit.q, unit.r, obj.q, obj.r) : null;
    const stepped = hexDistance(unit.q, unit.r, q, r);
    if (obj && objDistNew >= objDistCur) {
      score -= 16;
      if (stepped <= 1) score -= 10;
    }
    if (q === unit.q && r === unit.r) {
      score += obj ? 10 : 18;
    }
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

  const capital = ctx.capital || myHQs[0];
  if (capital && role !== 'engineer' && role !== 'support') {
    const onCap = hexDistance(q, r, capital.q, capital.r) <= 4;
    const wasOnCap = hexDistance(unit.q, unit.r, capital.q, capital.r) <= 4;
    const holdingForward = mission === 'hold_vtc' || obj?.kind === 'settlement';
    if (wasOnCap && onCap && !holdingForward && enemies.length === 0 && (gs.turn || 1) > 10) {
      score -= 14;
    }
    const ownedHere = gs.buildings.find(b => b.q === q && b.r === r
      && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type) && Number(b.owner) === Number(unit.owner));
    if (ownedHere && !ownedHere.isCapital) score += vtcStrategicWeight(ownedHere) * 1.2;
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
      for (const v of gs.buildings.filter(b =>
        Number(b.owner) === Number(unit.owner) && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type))) {
        const dv = hexDistance(q, r, v.q, v.r);
        if (dv <= 10) score += vtcStrategicWeight(v) * (phase.logistics || 1) * 0.35;
      }
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
      const pull = (gs.turn || 1) <= 14 ? 32 : 18;
      if (dNew < dCur) score += pull;
      if (dNew <= 2) score += 10;
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

    // Supply Ship: escort fleet, bridge ports, and support amphibious expansion.
    if (unit.type === 'SUPPLY_SHIP') {
      const navalCombatFriendly = gs.units.filter(u2 =>
        u2.owner === unit.owner && NAVAL_UNITS.has(u2.type) &&
        u2.type !== 'SUPPLY_SHIP' && !['LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG'].includes(u2.type)
      );
      if (navalCombatFriendly.length > 0) {
        const cx = navalCombatFriendly.reduce((s, u2) => s + u2.q, 0) / navalCombatFriendly.length;
        const cy = navalCombatFriendly.reduce((s, u2) => s + u2.r, 0) / navalCombatFriendly.length;
        const dNewCentroid = Math.abs(q - cx) + Math.abs(r - cy);
        const dCurCentroid = Math.abs(unit.q - cx) + Math.abs(unit.r - cy);
        if (dNewCentroid < dCurCentroid) score += 10;
        const nearestNaval = Math.min(...navalCombatFriendly.map(u2 => hexDistance(q, r, u2.q, u2.r)));
        if (nearestNaval <= 3) score += 6;
      }
      const myPorts = gs.buildings.filter(b => b.owner === unit.owner && b.type === 'SUPPLY_PORT' && !b.underConstruction);
      for (const p of myPorts) {
        const dNew = hexDistance(q, r, p.q, p.r);
        const dCur = hexDistance(unit.q, unit.r, p.q, p.r);
        if (dNew < dCur && dNew <= 10) score += 14 * phase.logistics;
      }
      const bridgeSite = ctx.territorial?.bridgeSites?.[0];
      if (bridgeSite && (ctx.strategic?.phase === 'expand' || ctx.strategic?.phase === 'stabilize')) {
        const dNew = hexDistance(q, r, bridgeSite.q, bridgeSite.r);
        const dCur = hexDistance(unit.q, unit.r, bridgeSite.q, bridgeSite.r);
        if (dNew < dCur) score += 16 * phase.logistics;
      }
      const unsupCoastal = gs.units.filter(u2 => u2.owner === unit.owner && !u2.embarked
        && (u2.outOfSupply || 0) > 0 && !NAVAL_UNITS.has(u2.type)
        && isCoastalLand(terrain, ctx.mapSize || gs._mapSize || 40, u2.q, u2.r));
      if (unsupCoastal.length > 0) {
        const dNew = Math.min(...unsupCoastal.map(u2 => hexDistance(q, r, u2.q, u2.r)));
        const dCur = Math.min(...unsupCoastal.map(u2 => hexDistance(unit.q, unit.r, u2.q, u2.r)));
        if (dNew < dCur) score += 18 * phase.logistics;
      }
      const loadedTransports = gs.units.filter(u2 => u2.owner === unit.owner && AI_TRANSPORT_TYPES.has(u2.type)
        && !u2.embarked && (u2.cargo || []).length > 0);
      if (loadedTransports.length > 0) {
        const dNew = Math.min(...loadedTransports.map(u2 => hexDistance(q, r, u2.q, u2.r)));
        const dCur = Math.min(...loadedTransports.map(u2 => hexDistance(unit.q, unit.r, u2.q, u2.r)));
        if (dNew < dCur) score += 12 * phase.logistics;
      }
    }

    // Supply trucks extend the network — follow expand pushes, not just hide at HQ.
    if (unit.type === 'SUPPLY_TRUCK') {
      const threat = getEnemyThreatAt(gs, unit.owner, q, r);
      if (threat > 0) score -= 30 + threat * 10;
      if (nearestEnemy <= 4) score -= (5 - nearestEnemy) * 14;
      if (!mySupply?.has?.(`${q},${r}`)) score -= 5;
      const expandUnitsOOS = gs.units.filter(u2 => u2.owner === unit.owner && !u2.embarked
        && (u2.outOfSupply || 0) > 0 && expandMissions.has(ctx.unitObjective?.[u2.id]?.mission || ''));
      if (expandUnitsOOS.length > 0) {
        const dNew = Math.min(...expandUnitsOOS.map(u2 => hexDistance(q, r, u2.q, u2.r)));
        const dCur = Math.min(...expandUnitsOOS.map(u2 => hexDistance(unit.q, unit.r, u2.q, u2.r)));
        if (dNew < dCur) score += 24 * phase.logistics;
        if (dNew <= 2) score += 16;
      }
      const remoteEx = ctx.territorial?.remoteTargets?.[0];
      if (remoteEx && (ctx.strategic?.phase === 'expand' || ctx.strategic?.phase === 'stabilize')) {
        const dNew = hexDistance(q, r, remoteEx.q, remoteEx.r);
        const dCur = hexDistance(unit.q, unit.r, remoteEx.q, remoteEx.r);
        if (dNew < dCur) score += 14 * phase.logistics;
      }
      if (friendlyCombat.length > 0) {
        const nearFriend = Math.min(...friendlyCombat.map(f => hexDistance(q, r, f.q, f.r)));
        if (nearFriend >= 1 && nearFriend <= 3) score += 12;
        if (nearFriend >= 2 && nearFriend <= 4) score += 8;
      }
    }
  }

  // Naval doctrine scoring for combat naval units
  if (NAVAL_UNITS.has(unit.type) && role !== 'support' && role !== 'engineer') {
    const myNavalBuildings = gs.buildings.filter(b => b.owner === unit.owner &&
      ['NAVAL_YARD','HARBOR','DRY_DOCK','NAVAL_BASE','NAVAL_DOCKYARD','PORT'].includes(b.type) && !b.underConstruction);
    const enemyNaval = gs.units.filter(u => u.owner !== unit.owner && NAVAL_UNITS.has(u.type) && !u.embarked);
    const enemySubs  = enemyNaval.filter(u => u.type === 'SUBMARINE');
    const myNavalCombat = gs.units.filter(u => u.owner === unit.owner && NAVAL_UNITS.has(u.type) &&
      u.type !== 'SUPPLY_SHIP' && !['LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG'].includes(u.type) && !u.embarked);
    const turn = gs.turn || 1;

    // Doctrine 1: Coastal Patrol — PATROL_BOATs and MTBs orbit own naval buildings 4-10 hexes out
    if (unit.type === 'PATROL_BOAT' || unit.type === 'MTB') {
      if (myNavalBuildings.length > 0) {
        const nearestBase = myNavalBuildings.reduce((a,b) =>
          hexDistance(q,r,a.q,a.r) <= hexDistance(q,r,b.q,b.r) ? a : b);
        const dToBase = hexDistance(q, r, nearestBase.q, nearestBase.r);
        if (dToBase >= 4 && dToBase <= 10) score += 8;
        if (dToBase < 4) score -= 6;
        if (dToBase > 12) score -= 10;
      }
      if (enemies.length > 0) {
        const nearEnemy = Math.min(...enemies.map(e => hexDistance(q,r,e.q,e.r)));
        if (nearEnemy <= 3) score += 12 * phase.combat;
      }
      const wcNav = waterChokeValue(terrain, ctx.mapSize || gs._mapSize || 40, q, r);
      if (wcNav > 0) score += wcNav * (0.5 + phase.raiding * 0.28);
    }

    // Doctrine 2: Anti-submarine — Destroyers hunt subs when enemy has 2+
    if ((unit.type === 'DESTROYER' || unit.type === 'DESTROYER_MK1') && enemySubs.length >= 2) {
      const nearestSub = enemySubs.reduce((a,b) => hexDistance(q,r,a.q,a.r) <= hexDistance(q,r,b.q,b.r) ? a : b);
      const dNew = hexDistance(q, r, nearestSub.q, nearestSub.r);
      const dCur = hexDistance(unit.q, unit.r, nearestSub.q, nearestSub.r);
      if (dNew < dCur) score += 14 * phase.combat;
      if (dNew <= 2) score += 8 * phase.combat;
    }

    // Doctrine 3: Raiding — light units probe enemy coastal infrastructure (turn 20+)
    if (turn >= 20 && (unit.type === 'PATROL_BOAT' || unit.type === 'MTB') && myNavalCombat.length >= 4) {
      const enemyBuildings = gs.buildings.filter(b => b.owner !== unit.owner && !['HQ'].includes(b.type) && !b.underConstruction);
      if (enemyBuildings.length > 0) {
        const nearest = enemyBuildings.reduce((a,b2) => hexDistance(q,r,a.q,a.r) <= hexDistance(q,r,b2.q,b2.r) ? a : b2);
        const dNew = hexDistance(q, r, nearest.q, nearest.r);
        const dCur = hexDistance(unit.q, unit.r, nearest.q, nearest.r);
        if (dNew < dCur) score += 6 * phase.raiding;
      }
    }

    // Doctrine 4: Fleet Dominance — mass ships and advance toward enemy fleet (turn 30+)
    if (turn >= 30 && myNavalCombat.length >= 4 && unit.type !== 'PATROL_BOAT' && unit.type !== 'MTB') {
      if (enemyNaval.length > 0) {
        const enemyCenterQ = enemyNaval.reduce((s,u) => s + u.q, 0) / enemyNaval.length;
        const enemyCenterR = enemyNaval.reduce((s,u) => s + u.r, 0) / enemyNaval.length;
        const dNew = hexDistance(q, r, enemyCenterQ, enemyCenterR);
        const dCur = hexDistance(unit.q, unit.r, enemyCenterQ, enemyCenterR);
        if (dNew < dCur) score += 16 * phase.combat;
        if (dNew <= 3) score += 12 * phase.combat;
      }
      // Anti-blob: spread ships
      const nearbyFriendlyNaval = myNavalCombat.filter(u => u.id !== unit.id && hexDistance(q,r,u.q,u.r) <= 2).length;
      if (nearbyFriendlyNaval >= 3) score -= nearbyFriendlyNaval * 4;
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

  // Supply awareness: expansion units push forward with trucks/ports backing them up.
  const inSupply = mySupply?.has?.(`${q},${r}`);
  const situation = ctx.situation || {};
  const expansionBold = (situation.islandMap || (situation.waterRatio || 0) >= 0.15)
    && (ctx.strategic?.phase === 'expand' || ctx.strategic?.phase === 'stabilize');
  if (!inSupply) {
    const emergencyPush = nearestEnemy <= 2;
    let penalty = emergencyPush ? (8 * phase.logistics) : (26 * phase.logistics);
    if (expandMissions.has(mission) && !emergencyPush) {
      penalty = expansionBold ? (9 * phase.logistics) : (15 * phase.logistics);
      if (obj && hexDistance(q, r, obj.q, obj.r) < hexDistance(unit.q, unit.r, obj.q, obj.r)) {
        penalty *= 0.45;
      }
    }
    const mobileSupplyNear = gs.units.some(u2 => Number(u2.owner) === Number(unit.owner) && !u2.embarked
      && (u2.type === 'SUPPLY_TRUCK' || u2.type === 'SUPPLY_SHIP')
      && hexDistance(u2.q, u2.r, q, r) <= 3);
    if (mobileSupplyNear) penalty *= 0.5;
    const portNear = gs.buildings.some(b => b.owner === unit.owner && b.type === 'SUPPLY_PORT'
      && !b.underConstruction && hexDistance(b.q, b.r, q, r) <= 4);
    if (portNear) penalty *= 0.55;
    score -= penalty;
    if ((unit.outOfSupply || 0) >= 2 && !expandMissions.has(mission)) score -= 10 * phase.logistics;
  } else if ((unit.outOfSupply || 0) > 0) {
    // Recovery bias: nudge unsupplied units back onto the network.
    score += 8;
  }

  const msChoke = ctx.mapSize || gs._mapSize || 40;
  const chokeVal = chokepointLandValue(terrain, msChoke, q, r);
  if (chokeVal > 0) {
    if (role === 'line' || role === 'assault' || role === 'indirect' || role === 'recon') {
      score += chokeVal * (0.55 + phase.combat * 0.22);
    }
    if (unit.type === 'ENGINEER') score += chokeVal * 0.7 * phase.logistics;
  }
  const wChoke = waterChokeValue(terrain, msChoke, q, r);
  if (unit.type === 'SUPPLY_SHIP' && wChoke > 0) {
    score += wChoke * (1.35 + phase.logistics * 0.5);
  }

  if (AI_TRANSPORT_TYPES.has(unit.type) && ctx.transportMission?.[unit.id]) {
    const mission = ctx.transportMission[unit.id];
    const dNew = hexDistance(q, r, mission.q, mission.r);
    const dCur = hexDistance(unit.q, unit.r, mission.q, mission.r);
    if (dNew < dCur) score += mission.mode === 'drop' ? 24 : 18;
    if (dNew <= 2) score += 10;
    const wcTr = waterChokeValue(terrain, msChoke, q, r);
    if (wcTr > 0) score += wcTr * 0.8;
  }

  if (ctx.territorial?.expansions?.length && unit.type === 'ENGINEER') {
    const dNew = Math.min(...ctx.territorial.expansions.map(t => hexDistance(q, r, t.q, t.r)));
    const dCur = Math.min(...ctx.territorial.expansions.map(t => hexDistance(unit.q, unit.r, t.q, t.r)));
    if (dNew < dCur) score += 12 * phase.economy;
  }

  // Phase 2 anti-blob: penalize over-clustering unless already in close contact.
  if (role !== 'engineer' && role !== 'support') {
    const nearbyFriendlies = countFriendliesNear(gs, unit.owner, q, r, 2);
    if (nearbyFriendlies >= 4 && nearestEnemy > 2) {
      score -= (nearbyFriendlies - 3) * 4.5;
      if (nearestEnemy > 1 && enemies.length > 0) {
        const curDist = Math.min(...enemies.map(e => hexDistance(unit.q, unit.r, e.q, e.r)));
        const newDist = nearestEnemy;
        if (newDist < curDist && !rushMissions.has(mission)) score -= (nearbyFriendlies - 2) * 5;
      }
    }
    if (nearbyFriendlies >= 6 && nearestEnemy > 3) score -= (nearbyFriendlies - 5) * 4;
  }

  // Small random tiebreaker only when we have contact; keep no-contact behavior deterministic.
  if (enemies.length > 0) score += Math.random() * 2;
  return score;
}

/** Undo virtual positions after partial AI planning (prevents state corruption on deadline exit). */
function restoreAIPlanningUnitPositions(gs) {
  for (const u of gs.units) {
    if (u._aiOrigQ === undefined) continue;
    u.q = u._aiOrigQ;
    u.r = u._aiOrigR;
    u.moved = false;
    u.movesLeft = UNIT_TYPES[u.type]?.move ?? (u.movesLeft || 1);
    delete u._aiOrigQ;
    delete u._aiOrigR;
    delete u._aiPlannedAttack;
  }
}

function finalizePlanOnDeadline(gs, player, actions, partialDebug = null) {
  restoreAIPlanningUnitPositions(gs);
  if (partialDebug) {
    gs._aiDebug = gs._aiDebug || {};
    gs._aiDebug[player] = { ...partialDebug, plannerReason: 'deadline' };
  }
  return actions;
}

/** Fast path when no units are on the map — skip combat/logistics planning. */
function finalizeArmyWipedPlan(gs, player, actions, terrain, mapN, aiDebug, ctx) {
  const { resSim, spend, enemyHQs, strategic, myCapital, maxRecruitsThisTurn } = ctx;
  let plannedRecruits = 0;
  const noteRecruit = (unitType) => { plannedRecruits += 1; };
  const recruitAllowed = () => plannedRecruits < maxRecruitsThisTurn;

  syncPlayerPopulationPool(gs, player);
  planDeployReadyVtcUnits(gs, player, actions, terrain, {
    capital: myCapital,
    focusEnemy: strategic?.focusEnemyHQ || enemyHQs[0],
    unitObjective: {},
    territorial: strategic?.territorial || null,
  });
  planArmyRecovery(gs, player, actions, resSim, spend, noteRecruit, recruitAllowed, myCapital, maxRecruitsThisTurn);

  const queueWiped = (building, unitType) => {
    if (!building || plannedRecruits >= maxRecruitsThisTurn) return false;
    if ((building.trainQueue?.length || 0) >= getMaxVtcQueueDepth(gs, player)) return false;
    if (actions.some(a => a.type === 'recruit' && a.global && a.buildingId === building.id)) return false;
    if (!getGlobalRecruitOptionsForVTC(gs, player, building.id).includes(unitType)) return false;
    const check = canQueueGlobalRecruit(gs, player, unitType, building.id);
    if (!check.ok) return false;
    const c = UNIT_TYPES[unitType]?.cost || {};
    const f = getRecruitFoodCost(unitType);
    if (resSim.iron < (c.iron || 0) || resSim.oil < (c.oil || 0) || resSim.wood < (c.wood || 0)
      || resSim.food < f || resSim.components < (c.components || 0)) return false;
    actions.push({ type: 'recruit', buildingId: building.id, unitType, global: true });
    noteRecruit(unitType);
    spend(c);
    resSim.food -= f;
    return true;
  };

  const vtcs = gs.buildings.filter(b =>
    Number(b.owner) === Number(player) && PRODUCTION_VTC_TYPES.has(b.type) && !b.underConstruction);
  for (let pass = 0; pass < maxRecruitsThisTurn; pass++) {
    let queued = false;
    for (const unitType of ['INFANTRY', 'INFANTRY', 'ENGINEER', 'SUPPLY_TRUCK']) {
      for (const b of vtcs) {
        if (queueWiped(b, unitType)) { queued = true; break; }
      }
      if (queued) break;
    }
    if (!queued) break;
  }

  aiDebug.plannerReason = 'army_wiped_rebuild';
  aiDebug.actionPlan = {
    attacks: 0, moves: 0, builds: 0,
    recruits: actions.filter(a => a.type === 'recruit').length,
    globalDeploy: actions.filter(a => a.type === 'global_deploy').length,
  };
  gs._aiDebug = gs._aiDebug || {};
  gs._aiDebug[player] = { ...aiDebug, recruitMix: aiDebug.recruitMix || {} };
  restoreAIPlanningUnitPositions(gs);
  return actions;
}

/** Manpower stuck in VTC queues — deploy ready units, avoid full planner + recruit spam. */
function finalizePipelineReliefPlan(gs, player, actions, terrain, aiDebug, ctx) {
  const { enemyHQs, strategic, myCapital } = ctx;
  planDeployReadyVtcUnits(gs, player, actions, terrain, {
    capital: myCapital,
    focusEnemy: strategic?.focusEnemyHQ || enemyHQs[0],
    unitObjective: {},
    territorial: strategic?.territorial || null,
  });
  aiDebug.plannerReason = 'pipeline_relief';
  aiDebug.actionPlan = {
    attacks: 0, moves: 0, builds: 0,
    recruits: actions.filter(a => a.type === 'recruit').length,
    globalDeploy: actions.filter(a => a.type === 'global_deploy').length,
  };
  gs._aiDebug = gs._aiDebug || {};
  gs._aiDebug[player] = { ...aiDebug, recruitMix: aiDebug.recruitMix || {} };
  restoreAIPlanningUnitPositions(gs);
  return actions;
}

// ── Plan AI turn — returns action list, does NOT execute ──────────────────

export function planAITurn(gs, terrain, mapSize, strategy = 'balanced') {
  const player  = gs.currentPlayer;
  const cfg     = AI_STRATEGIES[strategy] ?? AI_STRATEGIES.balanced;
  const actions = [];
  const mapN = Number(mapSize || gs._mapSize || 40);
  const plannerOverBudget = () => gs._aiPlannerDeadline && performance.now() > gs._aiPlannerDeadline;
  const overPlan = () => plannerOverBudget();
  const perceivedEnemies = getPerceivedEnemyUnits(gs, player, terrain, mapSize);
  gs._aiEnemyView = gs._aiEnemyView || {};
  gs._aiEnemyView[player] = perceivedEnemies;
  gs._aiMoveMemory = gs._aiMoveMemory || {};
  gs._aiMoveMemory[player] = gs._aiMoveMemory[player] || {};
  const moveMemory = gs._aiMoveMemory[player];

  const getEnemies = () => perceivedEnemies;
  const getMyHQs   = () => {
    const cap = getPlayerCapital(gs, player);
    return cap ? [cap] : getPlayerCapitalBuildings(gs, player);
  };
  const mySupply   = getCachedSupply(gs, player, mapSize);
  const situation = assessMapSituation(terrain, mapSize, gs, player);
  const armyBudget = getAIArmyBudget(gs, player, mapSize, situation);
  const phaseWeights = getPhaseWeights(gs.turn || 1, situation);
  const resourceTargets = Object.entries(gs.resourceHexes || {})
    .map(([k, v]) => ({ k, q: Number(k.split(',')[0]), r: Number(k.split(',')[1]), type: v?.type }))
    .filter(t => {
      const b = gs.buildings.find(bb => bb.q === t.q && bb.r === t.r && (bb.type === 'MINE' || bb.type === 'OIL_PUMP'));
      return !b || Number(b.owner) !== Number(player);
    })
    .slice(0, 24);

  // Strategic planner + memory-backed task-group objective assignment.
  const enemyHQs = getEnemyCapitalBuildings(gs, player);
  const myCombatUnits = gs.units.filter(u => u.owner === player && !u.embarked)
    .filter(u => {
      const d = UNIT_TYPES[u.type] || {};
      const role = getUnitRole(u.type);
      return role !== 'engineer' && role !== 'support' && ((d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0);
    });
  ensureAIDesigns(gs, player);
  const focusEnemyHQ = pickPrimaryEnemyHQ(gs, player, enemyHQs);
  const globalPressure = getClosingPressure(gs, player);
  const localPressure = getLocalClosingPressure(gs, player, mapSize, focusEnemyHQ?.owner);
  const closingPressure = Math.min(0.92, Math.max(globalPressure, localPressure * 1.08));
  const strategic = buildStrategicState(gs, player, mapSize, resourceTargets, myCombatUnits, enemyHQs, closingPressure, situation, armyBudget);
  const theaterIntel = buildTheaterIntel(terrain, mapSize, gs, player, situation);
  strategic.theater = theaterIntel;
  if (theaterIntel.useTheaterMode && theaterIntel.primaryObjective) {
    strategic.objectives = strategic.objectives || {};
    strategic.objectives.theater = {
      q: theaterIntel.primaryObjective.q,
      r: theaterIntel.primaryObjective.r,
      type: theaterIntel.primaryObjective.type,
    };
  }
  const stockpilePressure = getStockpileSpendPressure(gs, player);
  const territorial = buildTerritorialIntel(terrain, mapSize, gs, player, strategic, resourceTargets, situation);
  strategic.territorial = territorial;
  if (!gs._aiWaterBodies || gs._aiWaterBodiesMapSize !== mapN) {
    gs._aiWaterBodies = buildWaterBodyIndex(terrain, mapN);
    gs._aiWaterBodiesMapSize = mapN;
  }
  const waterBodies = gs._aiWaterBodies;
  const transportMission = planTransportMissions(gs, terrain, mapSize, player, strategic, territorial);

  const sortedCombat = [...myCombatUnits].sort((a, b) => {
    const ra = getUnitRole(a.type), rb = getUnitRole(b.type);
    const pr = (r) => r === 'recon' ? 0 : r === 'assault' ? 1 : r === 'line' ? 2 : r === 'indirect' ? 3 : 4;
    return pr(ra) - pr(rb);
  });

  const unitObjective = {};
  assignOwnedVTCCoverage(gs, player, unitObjective, sortedCombat, perceivedEnemies, mapSize);
  const { deceptionActive, missionCounts } = assignCombatMissions(
    gs, player, mapSize, strategic, territorial, enemyHQs, sortedCombat, resourceTargets, unitObjective,
  );
  const flankCountForGarrison = missionCounts.garrison || missionCounts.diversion || 2;
  assignResourceGarrisonMissions(gs, player, unitObjective, sortedCombat);
  assignEnemyExtractorRaidMissions(gs, player, unitObjective, sortedCombat, perceivedEnemies);
  assignLocalRecaptureMissions(gs, player, unitObjective, sortedCombat, perceivedEnemies);
  assignHoldVTCCMissions(gs, player, unitObjective, sortedCombat, perceivedEnemies);
  assignTerritorialObjectives(gs, player, mapSize, territorial, unitObjective, sortedCombat, flankCountForGarrison);

  recalcPlayerPopulation(gs, player);
  pruneVtcQueueBacklog(gs, player);
  const popNow = getPopBreakdown(gs, player);
  const populationFull = popNow.avail < 1 && popNow.used >= popNow.cap;
  const armyUndersized = popNow.fielded < Math.max(6, Math.floor(popNow.cap * 0.35)) && popNow.avail >= 3;
  const popReserveNow = popNow.reserve;

  planDeployReadyVtcUnits(gs, player, actions, terrain, {
    capital: getPlayerCapital(gs, player),
    focusEnemy: strategic?.focusEnemyHQ || enemyHQs[0],
    unitObjective,
    territorial,
  });

  const opening = getOpeningMilestones(gs, player, situation);
  const roadFloor = getRoadFloor(gs.turn || 1);
  const dynamicRoadTarget = getDynamicRoadTarget(gs, player, situation, armyBudget);
  const roadsNow = countPlayerRoadLike(gs, player);
  const roadDeficitGlobal = Math.max(0, dynamicRoadTarget - roadsNow);
  const myUnitsNow = gs.units.filter(u => u.owner === player && !u.embarked);
  const unsuppliedNow = myUnitsNow.filter(u => (u.outOfSupply || 0) > 0).length;
  const unsuppliedCombatNow = myUnitsNow.filter(u => (u.outOfSupply || 0) > 0 && u.type !== 'ENGINEER').length;
  const stagnantArmyBreakout = getStagnantArmyBreakout(gs, player, strategic, myCombatUnits);
  const engineerOnlyOOS = unsuppliedNow > 0 && unsuppliedCombatNow === 0;
  const logisticsPressure = !stagnantArmyBreakout && !engineerOnlyOOS
    && unsuppliedNow >= Math.max(2, Math.floor(myUnitsNow.length * 0.2));
  // Engineers alone going out of supply should not freeze the entire barracks production tree.
  const logisticsEmergency = unsuppliedCombatNow >= Math.max(3, Math.floor(myUnitsNow.length * 0.28));
  const myEngineersNow = gs.units.filter(u => u.owner === player && !u.embarked && u.type === 'ENGINEER');
  const roadCaptainId = myEngineersNow.length > 0 ? myEngineersNow.sort((a,b) => a.id - b.id)[0].id : null;
  const aiCtx = {
    deceptionTurn: deceptionActive, resourceTargets, unitObjective, phaseWeights,
    capital: getPlayerCapital(gs, player),
    roadDeficit: roadDeficitGlobal, roadCaptainId,
    logisticsPressure, logisticsEmergency, dynamicRoadTarget,
    strategic, territorial, transportMission,
    moveMemory,
    mapSize, closingPressure, situation, armyBudget, stockpilePressure,
  };

  const engineerMemory = initEngineerMemory(gs, player);
  const liveEngIds = new Set(gs.units.filter(u => Number(u.owner) === Number(player) && u.type === 'ENGINEER').map(u => u.id));
  for (const id of Object.keys(engineerMemory)) {
    if (!liveEngIds.has(Number(id))) delete engineerMemory[id];
  }
  const claimedCorridorTasks = new Set(); // deconflict: each engineer targets a different waypoint

  const aiDebug = {
    strategicPhase: strategic?.phase || null,
    endgamePressure: strategic?.endgamePressure ?? null,
    stockpilePressure,
    focusEnemy: strategic?.focusEnemyOwner ?? null,
    theaterMode: !!theaterIntel?.useTheaterMode,
    primaryTheaterId: theaterIntel?.primaryTheaterId ?? null,
    theaterObjective: theaterIntel?.primaryObjective?.type ?? null,
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
    recruitMix: { tier0: 0, tier1plus: 0, support: 0, naval: 0, air: 0, base: 0, designed: 0 },
    transportOps: 0,
    territorial: { chokes: territorial?.chokes?.length || 0, coastal: territorial?.coastal?.length || 0, expansions: territorial?.expansions?.length || 0, remote: territorial?.remoteTargets?.length || 0, bridgeSites: territorial?.bridgeSites?.length || 0 },
    forceSplit: { assigned: { north: 0, center: 0, south: 0 }, current: { north: 0, center: 0, south: 0 } },
    missions: missionCounts || {},
    deceptionActive: !!deceptionActive,
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
    hardenedSteel: gs.players[player].hardenedSteel || 0,
  };
  const canAfford = (cost = {}) =>
    resSim.iron >= (cost.iron || 0) &&
    resSim.oil >= (cost.oil || 0) &&
    resSim.wood >= (cost.wood || 0) &&
    resSim.food >= (cost.food || 0) &&
    resSim.components >= (cost.components || 0) &&
    resSim.hardenedSteel >= (cost.hardenedSteel || 0);
  const spend = (cost = {}) => {
    resSim.iron -= (cost.iron || 0);
    resSim.oil -= (cost.oil || 0);
    resSim.wood -= (cost.wood || 0);
    resSim.food -= (cost.food || 0);
    resSim.components -= (cost.components || 0);
    resSim.hardenedSteel -= (cost.hardenedSteel || 0);
  };

  const myCapitalEarly = getPlayerCapital(gs, player)
    || gs.buildings.find(b => Number(b.owner) === Number(player) && isPlayerCapitalBuilding(b) && !b.underConstruction);
  const maxRecruitsWipe = armyBudget.maxRecruitsPerTurn
    + (stockpilePressure >= 0.55 ? 2 : (stockpilePressure >= 0.35 ? 1 : 0))
    + (strategic?.phase === 'closing' ? 2 : (strategic?.phase === 'pressure' ? 1 : 0));
  if (calcPopFieldedByPlayer(gs, player) === 0) {
    return finalizeArmyWipedPlan(gs, player, actions, terrain, mapN, aiDebug, {
      resSim, spend, enemyHQs, strategic, myCapital: myCapitalEarly,
      maxRecruitsThisTurn: Math.max(3, maxRecruitsWipe),
    });
  }

  // Clone unit list so we can track "virtual" positions for multi-step planning
  // (Simple approach: plan each unit independently with live state)
  let plannedRoadBuilds = 0;

  const unitIds = gs.units
    .filter(u => u.owner === player && !u.embarked)
    .sort((a, b) => unitPlanPriority(b) - unitPlanPriority(a))
    .map(u => u.id);

  for (const uid of unitIds) {
    if (plannerOverBudget()) break;
    const unit = gs.units.find(u => u.id === uid);
    if (!unit || unit.owner !== player || unit.embarked) continue;
    if (unit.fuel !== undefined && unit.fuel <= 0) continue; // no fuel
    if (unit.constructing) continue; // never abandon active construction
    const unitDef = UNIT_TYPES[unit.type];
    if (!unitDef) continue; // custom/invalid type guard

    // Snapshot original position so we can restore after planning
    unit._aiOrigQ = unit.q; unit._aiOrigR = unit.r;

    // A) Attack from current position
    const unitMission = unitObjective[unit.id]?.mission || 'expand';
    const unitInSupply = mySupply?.has?.(`${unit.q},${unit.r}`);
    const preMoveTargets = getAttackableHexes(gs, unit, unit.q, unit.r, null);
    const preMoveTarget  = chooseBestTarget(gs, unit, preMoveTargets);
    const preTrade = preMoveTarget ? estimateAttackCommitScore(gs, unit, preMoveTarget) : -999;
    const frontlineCommit = unitMission === 'main' && (gs.turn || 1) >= 10 && preMoveTarget && hexDistance(unit.q, unit.r, preMoveTarget.q, preMoveTarget.r) <= 3 && preTrade >= 0;
    const nearbyFriendliesForCommit = gs.units.filter(u => u.owner === unit.owner && u.id !== unit.id && !u.embarked && hexDistance(u.q, u.r, unit.q, unit.r) <= 3).length;
    const hasCommitMass = unitMission === 'main'
      ? (nearbyFriendliesForCommit >= 2 || (preMoveTarget && (preMoveTarget.health || 99) <= 1))
      : (nearbyFriendliesForCommit >= 3 || (preMoveTarget && (preMoveTarget.health || 99) <= 1));
    const killShot = preMoveTarget && (preMoveTarget.health || 99) <= 1;
    const scoutOk = unitMission === 'scout' && killShot;
    const probeOk = (unitMission === 'probe' || unitMission === 'diversion') && (killShot || preTrade >= 5);
    const expandOk = unitMission === 'expand' && (killShot || (preTrade >= 3 && nearbyFriendliesForCommit >= 1));
    const close = aiCtx?.closingPressure || 0;
    const midGameAggro = (gs.turn || 1) >= 14 ? -4 : ((gs.turn || 1) >= 10 ? -2 : 0);
    const pressureAggro = (strategic?.phase === 'pressure' || strategic?.phase === 'closing') ? -2 : 0;
    const mainOk = unitMission === 'main' && (
      (close >= 0.5 && (killShot || preTrade >= -2 || (!!unitInSupply && nearbyFriendliesForCommit >= 1)))
      || ((!!unitInSupply && hasCommitMass) || frontlineCommit)
    );
    const holdObj = unitObjective[unit.id];
    const holdAnchorQ = holdObj?.anchorQ ?? holdObj?.q;
    const holdAnchorR = holdObj?.anchorR ?? holdObj?.r;
    const holdDefend = unitMission === 'hold_vtc' && preMoveTarget && (
      killShot
      || (hexDistance(unit.q, unit.r, preMoveTarget.q, preMoveTarget.r) <= 2 && preTrade >= 0)
      || (holdAnchorQ != null && hexDistance(preMoveTarget.q, preMoveTarget.r, holdAnchorQ, holdAnchorR) <= 6
        && (killShot || preTrade >= 1))
    );
    const canRiskAttack = scoutOk || probeOk || expandOk || mainOk || holdDefend
      || (close >= 0.55 && unitMission === 'main' && killShot)
      || (((unit.outOfSupply || 0) < 2 && roadDeficitGlobal < 2) && killShot && hexDistance(unit.q, unit.r, preMoveTarget.q, preMoveTarget.r) <= 1);
    const preThreshold = (unitMission === 'scout' ? 3 : (unitMission === 'probe' ? 2 : (unitMission === 'expand' ? 2
      : (unitMission === 'main' ? (close >= 0.5 ? -6 : -2) : 6)))) + midGameAggro + pressureAggro;
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
          mem.task = pickEngineerTask(gs, player, unit, strategic, mapSize, claimedCorridorTasks, terrain);
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
      const reachable = unit.moved ? [] : getReachableHexesForAI(gs, unit, terrain, mapSize);
      unit.movesLeft  = savedMovesLeft;

      if (reachable.length > 0) {
        const enemies = getEnemies();
        const myHQs   = getMyHQs();
        const moveObj = unitObjective[unit.id] || strategic?.focusEnemyHQ;
        const candidates = pickReachableForScoring(reachable, unit, moveObj);

        let bestDest = null, bestScore = -Infinity;
        for (const hex of candidates) {
          let s = scoreMove(gs, terrain, unit, hex.q, hex.r, strategy, enemies, myHQs, mySupply, aiCtx);
          if (unit.type === 'ENGINEER') {
            const mem = engineerMemory[unit.id];
            const task = mem?.task;
            if (task) {
              const dNew = hexDistance(hex.q, hex.r, task.q, task.r);
              const dCur = hexDistance(unit.q, unit.r, task.q, task.r);
              const taskPull = task.type === 'resource' ? 44 : task.type === 'fort' ? 38
                : task.type === 'vtc_road' ? 46 : task.type === 'vtc_depot' ? 40
                : task.type === 'empire' ? 36 : task.type === 'supply_port_site' ? 42 : 28;
              if (dNew < dCur) s += taskPull;
              if (dNew <= 2) s += 16;
              if (dNew === 0) s += 20;
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

        const lastMove = moveMemory?.[unit.id];
        const backtracking = isImmediateBacktrack(unit, bestDest, lastMove, gs.turn || 1);
        const objNow = unitObjective[unit.id] || strategic?.focusEnemyHQ;
        const isHoldMission = unitMission === 'hold_vtc' || objNow?.kind === 'settlement';
        const noContactJitter = !!bestDest && enemies.length === 0 && unitMission !== 'main' && unitMission !== 'closing'
          && unitMission !== 'hold_vtc' && !isHoldMission && (() => {
          if (!objNow) return hexDistance(unit.q, unit.r, bestDest.q, bestDest.r) <= 1;
          const curD = hexDistance(unit.q, unit.r, objNow.q, objNow.r);
          const newD = hexDistance(bestDest.q, bestDest.r, objNow.q, objNow.r);
          return newD >= curD && hexDistance(unit.q, unit.r, bestDest.q, bestDest.r) <= 1;
        })();
        if (backtracking && enemies.length === 0 && !isHoldMission
          && (unitMission === 'expand' || unitMission === 'garrison' || unitMission === 'stabilize')) {
          bestDest = null;
        }
        if (noContactJitter) bestDest = null;
        if (bestDest && enemies.length === 0 && !isHoldMission
          && getUnitRole(unit.type) !== 'engineer' && getUnitRole(unit.type) !== 'support' && enemyHQs.length > 0) {
          const curHQ = Math.min(...enemyHQs.map(h => hexDistance(unit.q, unit.r, h.q, h.r)));
          const newHQ = Math.min(...enemyHQs.map(h => hexDistance(bestDest.q, bestDest.r, h.q, h.r)));
          if (newHQ >= curHQ) bestDest = null;
        }
        if (bestDest && (bestDest.q !== unit.q || bestDest.r !== unit.r)) {
          const fromQ = unit.q;
          const fromR = unit.r;
          actions.push({
            type:    'move',
            unitId:  unit.id,
            fromQ, fromR,
            toQ:     bestDest.q, toR: bestDest.r,
          });
          moveMemory[unit.id] = { fromQ, fromR, toQ: bestDest.q, toR: bestDest.r, turn: gs.turn || 1 };
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
        const frontlineCommitPost = unitMission === 'main' && (gs.turn || 1) >= 10 && postMoveTarget && hexDistance(unit.q, unit.r, postMoveTarget.q, postMoveTarget.r) <= 3 && postTrade >= 0;
        const nearbyFriendliesPost = gs.units.filter(u => u.owner === unit.owner && u.id !== unit.id && !u.embarked && hexDistance(u.q, u.r, unit.q, unit.r) <= 3).length;
        const hasCommitMassPost = unitMission === 'main'
          ? (nearbyFriendliesPost >= 2 || (postMoveTarget && (postMoveTarget.health || 99) <= 1))
          : (nearbyFriendliesPost >= 3 || (postMoveTarget && (postMoveTarget.health || 99) <= 1));
        const postKill = postMoveTarget && (postMoveTarget.health || 99) <= 1;
        const expandPostOk = unitMission === 'expand' && (postKill || (postTrade >= 3 && nearbyFriendliesPost >= 2));
        const holdObjPost = unitObjective[unit.id];
        const holdPostDefend = unitMission === 'hold_vtc' && postMoveTarget && (
          postKill
          || (hexDistance(unit.q, unit.r, postMoveTarget.q, postMoveTarget.r) <= 2 && postTrade >= 0)
          || (holdObjPost && hexDistance(postMoveTarget.q, postMoveTarget.r, holdObjPost.q, holdObjPost.r) <= 5
            && (postKill || postTrade >= 1))
        );
        const canRiskPostAttack = (unitMission === 'scout' && postKill)
          || ((unitMission === 'probe' || unitMission === 'diversion') && (postKill || postTrade >= 5))
          || expandPostOk
          || holdPostDefend
          || (unitMission === 'main' && ((!!postInSupply && hasCommitMassPost) || frontlineCommitPost))
          || (((unit.outOfSupply || 0) < 2 && roadDeficitGlobal < 2) && postKill && hexDistance(unit.q, unit.r, postMoveTarget.q, postMoveTarget.r) <= 1);
        const postThreshold = (unitMission === 'scout' ? 3 : (unitMission === 'probe' ? 2 : (unitMission === 'expand' ? 2 : (unitMission === 'main' ? (close >= 0.5 ? -5 : -2) : 6)))) + midGameAggro + pressureAggro;
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

      // D) Dig in if defensive and idle (boost on VTC patrol / garrison)
      let digChance = cfg.digInChance;
      if (unitMission === 'hold_vtc' || unitMission === 'garrison') digChance = Math.max(digChance, 0.45);
      if (holdObj?.anchorQ != null && hexDistance(unit.q, unit.r, holdObj.anchorQ, holdObj.anchorR) <= vtcSupplyRadius({ type: holdObj.vtcType })) {
        digChance = Math.max(digChance, 0.55);
      }
      if (digChance > 0 && !unit._aiPlannedAttack && Math.random() < digChance) {
        const def = UNIT_TYPES[unit.type];
        if (def?.canDigIn && !unit.dugIn) {
          actions.push({ type: 'digin', unitId: unit.id });
        }
      }
      // Anti-tank ambush: conceal on defense lanes once researched.
      if (!unit._aiPlannedAttack && unit.type === 'ANTI_TANK' && !unit.hidden && !unit.moved) {
        const unlocked = new Set(gs.players[player]?.research?.unlocked || []);
        if (unlocked.has('anti_tank_ambush')) {
          const nearEnemy = getEnemies().some(e => hexDistance(unit.q, unit.r, e.q, e.r) <= 4);
          if (nearEnemy && (unitMission === 'garrison' || unitMission === 'stabilize' || unitMission === 'main')) {
            actions.push({ type: 'ambush', unitId: unit.id });
          }
        }
      }

      // E) Engineer infra/economy behavior (balanced resource development)
      if (unit.type === 'ENGINEER' && !unit.constructing) {
        const key = `${unit.q},${unit.r}`;
        const hasRoad = !!roadAt(gs, unit.q, unit.r);
        const hasNonRoadBuilding = !!(buildingAt(gs, unit.q, unit.r) && !hasRoad);
        const resHex = gs.resourceHexes?.[key];
        const ttype = terrain?.[key] ?? 0;
        const unlockedEng = new Set(gs.players[player]?.research?.unlocked || []);

        const maybeBuild = (buildingType) => {
          if (buildingType === 'ROAD') {
            const roadsCap = armyBudget?.maxRoads ?? 36;
            if (countPlayerRoadLike(gs, player) >= roadsCap) return false;
          }
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

        if (stagnantArmyBreakout) {
          if (roadDeficitGlobal >= 6 && !hasRoad && maybeBuild('ROAD')) continue;
          continue;
        }

        const memEng = engineerMemory[unit.id];
        const engTask = memEng?.task;
        if (engTask?.type === 'fort' && unit.q === engTask.q && unit.r === engTask.r && !hasNonRoadBuilding) {
          const ft = engTask.fortType || pickFortTypeForHex(gs, player, unit.q, unit.r, { kind: engTask.nodeKind || 'resource' }, unlockedEng, canAfford);
          if (maybeBuild(ft)) continue;
        }

        if (engTask?.type === 'supply_port_site' && unit.q === engTask.q && unit.r === engTask.r && !hasNonRoadBuilding) {
          const DIRS_COAST = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
          const onWaterAdj = DIRS_COAST.some(([dq, dr]) => {
            const nt = terrain?.[`${unit.q + dq},${unit.r + dr}`] ?? 0;
            return nt === 4 || nt === 5;
          });
          if (onWaterAdj && unlockedEng.has('supply_depot') && gs.turn >= 6) {
            if (!hasRoad && maybeBuild('ROAD')) continue;
            if (maybeBuild('SUPPLY_PORT')) continue;
          }
        }

        if (engTask?.type === 'vtc_depot' && !hasNonRoadBuilding && unlockedEng.has('supply_depot')) {
          if (!hasRoad) maybeBuild('ROAD');
          if (maybeBuild('SUPPLY_DEPOT')) continue;
        }
        if (engTask?.type === 'vtc_road' && !hasRoad && canPlaceRoadOnTerrain(ttype)) {
          if (maybeBuild('ROAD')) continue;
        }

        const empireNode = getEmpireNodes(gs, player).find((n) => n.q === unit.q && n.r === unit.r);
        if (empireNode && !hasNonRoadBuilding) {
          const fortsNearNode = countFortsNearHex(gs, player, unit.q, unit.r, 2);
          if (!depotCoversHex(gs, player, unit.q, unit.r) && unlockedEng.has('supply_depot') && gs.turn >= 8) {
            if (maybeBuild('SUPPLY_DEPOT')) continue;
          }
          if (!hasRoad) maybeBuild('ROAD');
          const fortNeedsEmpire = buildFortNeedsForNode(gs, player, unit.q, unit.r, { kind: empireNode.kind }, unlockedEng, canAfford, fortsNearNode, gs.turn || 1);
          fortNeedsEmpire.sort((a, b) => b.score - a.score);
          for (const fn of fortNeedsEmpire) {
            if (maybeBuild(fn.type)) continue;
          }
        }

        // Always allow ROAD consideration even if a non-road building exists on this tile.
        // Roads are intended to coexist with buildings and form supply corridors.
        const roadsNowForEng = countPlayerRoadLike(gs, player);
        const roadDeficitForEng = Math.max(0, dynamicRoadTarget - roadsNowForEng);
        if (!hasRoad && gs.turn >= 3) {
          const unsupplied = gs.units.filter(u => u.owner === player && !u.embarked && (u.outOfSupply || 0) > 0).length;
          const roadUtilityHere = scoreRoadUtility(gs, player, unit.q, unit.r);
          const roadScoreNow = (8 - roadsNowForEng * 0.2 + unsupplied * 6.0 + opening.deficits.roads * 5 + roadDeficitForEng * 2 + Math.max(0, roadUtilityHere) * 0.6) * phaseWeights.logistics;
          const barracksDone = countPlayerBarracksFacilities(gs, player);
          const barracksUrgent = (gs.turn >= 6 && barracksDone < 1) || (gs.turn >= 10 && barracksDone < 2 && myCombatUnits.length < 5);
          const deferWebRoad = barracksUrgent && roadDeficitForEng < 14;
          const closingPush = strategic?.phase === 'closing' && (strategic?.endgamePressure || 0) >= 0.55;
          const blockRoadForHoard = closingPush && logisticsPressure && resSim.iron >= 30 && roadDeficitForEng < 6;
          if (!deferWebRoad && !blockRoadForHoard && (roadDeficitForEng >= 2 || roadScoreNow >= 18) && maybeBuild('ROAD')) continue;
        }

        if (!hasNonRoadBuilding) {
          // Count existing economy buildings for balance checks
          const myMines  = gs.buildings.filter(b => b.owner === player && b.type === 'MINE').length;
          const myPumps  = gs.buildings.filter(b => b.owner === player && b.type === 'OIL_PUMP').length;
          const myLumber = gs.buildings.filter(b => b.owner === player && b.type === 'LUMBER_CAMP').length;
          const myFarms  = gs.buildings.filter(b => b.owner === player && b.type === 'FARM' && !b.underConstruction).length;
          const myLabs   = countPlayerScienceLabs(gs, player);
          const myFactories = countPlayerFactories(gs, player);
          const myRoads  = countPlayerRoadLike(gs, player);
          const myAdvBarracks = gs.buildings.filter(b => b.owner === player && b.type === 'ADV_BARRACKS' && !b.underConstruction).length;
          const myArmorWorks = gs.buildings.filter(b => b.owner === player && b.type === 'ARMOR_WORKS' && !b.underConstruction).length;
          const myAdvAirfield = gs.buildings.filter(b => b.owner === player && b.type === 'ADV_AIRFIELD' && !b.underConstruction).length;
          const myNavalDockyard = gs.buildings.filter(b => b.owner === player && b.type === 'NAVAL_DOCKYARD' && !b.underConstruction).length;
          const roadDeficit = Math.max(0, dynamicRoadTarget - myRoads);
          const pop = gs.players[player]?.population || 0;
          const popCap = gs.players[player]?.popCap || 1;
          // Utility-first logistics: only hard-force roads when deficit is severe.
          const roadUtilityHere = scoreRoadUtility(gs, player, unit.q, unit.r);
          if (roadDeficit >= 4 && !hasRoad && roadUtilityHere >= 14 && maybeBuild('ROAD')) continue;

          // Macro floor nudges: if we're stockpiling, force missing core econ/tech pieces online.
          const onPlainsMacro = (ttype === 0 || ttype === 6 || ttype === 7);
          if (gs.turn >= 10 && myFarms < 2 && onPlainsMacro && maybeBuild('FARM')) continue;

          // Priority 1: exploit local resources (always do this first)
          const wood = gs.players[player].wood || 0;
          const food = gs.players[player].food || 0;
          const nonWoodEcon = myMines + myPumps + myFarms + myFactories;
          const maxLumber = Math.max(1, Math.min(2, Math.floor((nonWoodEcon + 1) / 3))); // usually 1-2 total camps
          const woodPressure = wood < 5;
          const onPlains = (ttype === 0 || ttype === 6 || ttype === 7);
          const onForest = (ttype === 1 || ttype === 7);

          const favorOilMacro = shouldPrioritizeOilOverMine(gs, player);

          // Opening hierarchy (turn <= 8): ensure baseline infra/econ comes online.
          if (gs.turn <= 8) {
            if (!hasRoad && maybeBuild('ROAD')) continue;
            if (resHex?.type === 'OIL' && (myPumps < opening.desired.pumps || favorOilMacro) && maybeBuild('OIL_PUMP')) continue;
            if (resHex?.type === 'IRON' && myMines < opening.desired.mines && (!favorOilMacro || myPumps >= 1) && maybeBuild('MINE')) continue;
            if (onPlains && myFarms < 1 && maybeBuild('FARM')) continue;
            if (onForest && myLumber < 1 && maybeBuild('LUMBER_CAMP')) continue;
          }

          const extractHere = gs.buildings.find((b) => b.q === unit.q && b.r === unit.r
            && (b.type === 'MINE' || b.type === 'OIL_PUMP') && Number(b.owner) === Number(player));
          if (extractHere && resHex) {
            const fortsNear = countFortsNearHex(gs, player, unit.q, unit.r, 2);
            const fortNeeds = [];
            if (!hasRoad) fortNeeds.push({ type: 'ROAD', score: 32 * phaseWeights.logistics });
            if (!depotCoversHex(gs, player, unit.q, unit.r) && unlockedEng.has('supply_depot') && gs.turn >= 6) {
              fortNeeds.push({ type: 'SUPPLY_DEPOT', score: 30 + fortsNear });
            }
            fortNeeds.push(...buildFortNeedsForNode(gs, player, unit.q, unit.r, { kind: 'resource' }, unlockedEng, canAfford, fortsNear, gs.turn || 1));
            fortNeeds.sort((a, b) => b.score - a.score);
            for (const fn of fortNeeds) {
              if (maybeBuild(fn.type)) continue;
            }
          }
          const settlementHere = gs.buildings.find((b) => b.q === unit.q && b.r === unit.r
            && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type) && Number(b.owner) === Number(player));
          if (settlementHere) {
            const fortsNear = countFortsNearHex(gs, player, unit.q, unit.r, 2);
            if (fortsNear < 1) {
              if (maybeBuild('FORT_T1')) continue;
              if (maybeBuild('FORT_T0')) continue;
            }
            if (!depotCoversHex(gs, player, unit.q, unit.r) && unlockedEng.has('supply_depot') && gs.turn >= 8) {
              if (maybeBuild('SUPPLY_DEPOT')) continue;
            }
          }

          if (resHex?.type === 'OIL') {
            maybeBuild('OIL_PUMP');
          } else if (resHex?.type === 'IRON') {
            if (!favorOilMacro || myMines < 2) maybeBuild('MINE');
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
            const turn = gs.turn || 1;
            // Farms: scale cap with turn (up to 5 late game), strong priority when food is low
            const farmCap = turn <= 8 ? 2 : turn <= 14 ? 3 : turn <= 20 ? 4 : 5;
            if (onPlains && myFarms < farmCap) needs.push({ type: 'FARM', score: ((myFarms < 1 ? 22 : 14) - myFarms * 2.5 - food * 0.4 + d.farms * 7) * phaseWeights.economy });
            // Mines: scale cap to 5 late game
            const mineCap = turn <= 8 ? 2 : turn <= 14 ? 3 : turn <= 20 ? 4 : 5;
            if (resHex?.type !== 'OIL' && myMines < mineCap) {
              const ironNeed = Math.max(0, 10 - resSim.iron) * 0.5;
              needs.push({ type: 'MINE', score: ((myMines < 1 ? 20 : 12) - myMines * 2 + d.mines * 7 + ironNeed) * phaseWeights.economy });
            }
            // Oil pumps: scale cap to 5 late game
            const pumpCap = turn <= 8 ? 2 : turn <= 14 ? 3 : turn <= 20 ? 4 : 5;
            if (resHex?.type !== 'IRON' && myPumps < pumpCap) {
              const oilNeed = Math.max(0, 6 - resSim.oil) * 0.6;
              needs.push({ type: 'OIL_PUMP', score: ((myPumps < 1 ? 20 : 12) - myPumps * 2 + d.pumps * 7 + oilNeed) * phaseWeights.economy });
            }
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
            const nearFOB = gs.turn >= 6 && fobPoints.some(fob => {
              const dist = hexDistance(unit.q, unit.r, fob.q, fob.r);
              if (dist > 8) return false;
              return !gs.buildings.some(b => b.owner === player &&
                (b.type === 'SUPPLY_DEPOT' || b.type === 'SUPPLY_WAREHOUSE') &&
                hexDistance(b.q, b.r, fob.q, fob.r) <= 4);
            });
            if (nearFOB) {
              const pressure = getEnemies().filter(e => hexDistance(e.q, e.r, unit.q, unit.r) <= 4).length;
              needs.push({ type: 'SUPPLY_DEPOT', score: (28 + pressure * 3.0 + Math.floor(frontlineSpan / 3) - mySupplyDepots * 1.5) * phaseWeights.logistics });
              const fobPt = fobPoints.find(fob => hexDistance(unit.q, unit.r, fob.q, fob.r) <= 8
                && !depotCoversHex(gs, player, fob.q, fob.r));
              if (fobPt) {
                const fn = countFortsNearHex(gs, player, fobPt.q, fobPt.r, 2);
                needs.push(...buildFortNeedsForNode(gs, player, fobPt.q, fobPt.r, { kind: 'fob' }, unlockedEng, canAfford, fn, turn));
              }
            } else if (gs.turn >= 7 && mySupplyDepots < 5 && (unsupplied >= 2 || roadDeficit >= 2 || frontlineSpan >= 8)) {
              const pressure = getEnemies().filter(e => hexDistance(e.q, e.r, unit.q, unit.r) <= 4).length;
              needs.push({ type: 'SUPPLY_DEPOT', score: (14 + unsupplied * 2.5 + pressure * 2.5 + Math.floor(frontlineSpan / 3) + roadDeficit * 1.5 - mySupplyDepots * 2) * phaseWeights.logistics });
            }
            const warehousesEarly = gs.buildings.filter(bb => bb.owner === player && bb.type === 'SUPPLY_WAREHOUSE' && !bb.underConstruction).length;
            // Warehouses earlier and at lower thresholds
            if (gs.turn >= 10 && warehousesEarly < 3 && (unsupplied >= 2 || frontlineSpan >= 10)) {
              needs.push({ type: 'SUPPLY_WAREHOUSE', score: (14 + unsupplied * 2.0 + Math.floor(frontlineSpan / 3) - warehousesEarly * 2) * phaseWeights.logistics });
            }
            const myBunkers = gs.buildings.filter(bb => bb.owner === player && HEAVY_FORT_TYPES.has(bb.type) && !bb.underConstruction).length;
            const myWarehouses = gs.buildings.filter(bb => bb.owner === player && bb.type === 'SUPPLY_WAREHOUSE' && !bb.underConstruction).length;
            const nearbyEnemies = getEnemies().filter(e => hexDistance(e.q, e.r, unit.q, unit.r) <= 3).length;
            if ((gs.turn >= 12 && nearbyEnemies >= 2) && myBunkers < 2 && unlockedEng.has('bunker')) {
              needs.push({ type: 'FORT_T3', score: (8.4 + nearbyEnemies) * phaseWeights.combat });
            }
            // FOB expansion package: forward logistics + fallback defensive node.
            if (gs.turn >= 18 && (frontlineSpan >= 12 || roadDeficit >= 2)) {
              if (myWarehouses < 3) needs.push({ type: 'SUPPLY_WAREHOUSE', score: (10 + Math.floor(frontlineSpan / 3) + unsupplied * 1.2 - myWarehouses * 2) * phaseWeights.logistics });
              if (myBunkers < 4 && unlockedEng.has('bunker')) {
                needs.push({ type: 'FORT_T3', score: (7.5 + Math.floor(frontlineSpan / 5) - myBunkers) * phaseWeights.combat });
              }
            }

            // Naval coastal defense doctrine
            const DIRS_COASTAL = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
            const engTerrain = terrain[`${unit.q},${unit.r}`] ?? 0;
            const isOnCoastal = (engTerrain === 4 || engTerrain === 5);
            const isAdjacentCoastal = !isOnCoastal && DIRS_COASTAL.some(([dq, dr]) => {
              const nt = terrain[`${unit.q + dq},${unit.r + dr}`] ?? 0;
              return nt === 4 || nt === 5;
            });
            const mySupplyPorts = gs.buildings.filter(bb => bb.owner === player && bb.type === 'SUPPLY_PORT' && !bb.underConstruction).length;
            const amphibLogistics = needsAmphibiousLogistics(situation, territorial);
            const portCap = getSupplyPortCap(situation, territorial);
            if (amphibLogistics && unlockedEng.has('supply_depot') && (isOnCoastal || isAdjacentCoastal) && gs.turn >= 6 && mySupplyPorts < portCap) {
              let portScore = (20 + (situation?.waterRatio || 0) * 30 - mySupplyPorts * 8) * phaseWeights.logistics;
              const nearBridge = territorial?.bridgeSites?.some(bs => hexDistance(bs.q, bs.r, unit.q, unit.r) <= 5);
              if (nearBridge) portScore += 26;
              if (hasRoad || roadAt(gs, unit.q, unit.r)) portScore += 10;
              const onBridgeHex = territorial?.bridgeSites?.some(bs => bs.q === unit.q && bs.r === unit.r);
              if (onBridgeHex) portScore += 18;
              needs.push({ type: 'SUPPLY_PORT', score: portScore });
            }
            if ((isOnCoastal || isAdjacentCoastal) && gs.turn >= 8) {
              const nearbyOwnCB = gs.units.filter(u2 => u2.owner === player && u2.type === 'COASTAL_BATTERY' && hexDistance(u2.q, u2.r, unit.q, unit.r) <= 6).length
                + gs.buildings.filter(b2 => b2.owner === player && b2.type === 'COASTAL_BATTERY' && hexDistance(b2.q, b2.r, unit.q, unit.r) <= 6).length;
              // How many enemy naval units are nearby? Raises priority.
              const enemyNavalNearby = getEnemies().filter(e => NAVAL_UNITS.has(e.type) && hexDistance(e.q, e.r, unit.q, unit.r) <= 10).length;
              const maxCB = Math.max(2, 2 + Math.floor(enemyNavalNearby / 2));
              if (nearbyOwnCB < maxCB) {
                needs.push({ type: 'COASTAL_BATTERY', score: (18 + enemyNavalNearby * 4 - nearbyOwnCB * 3) * phaseWeights.combat });
              }
              if (gs.turn >= 10) {
                const nearbyOwnAA = gs.units.filter(u2 => u2.owner === player && u2.type === 'AA_EMPLACEMENT' && hexDistance(u2.q, u2.r, unit.q, unit.r) <= 6).length
                  + gs.buildings.filter(b2 => b2.owner === player && b2.type === 'AA_EMPLACEMENT' && hexDistance(b2.q, b2.r, unit.q, unit.r) <= 6).length;
                if (nearbyOwnAA < 2) {
                  needs.push({ type: 'AA_EMPLACEMENT', score: (14 - nearbyOwnAA * 3) * phaseWeights.combat });
                }
              }
            }

            // Sort by score descending and try each
            needs.sort((a, b) => b.score - a.score);
            let built = false;
            for (const n of needs) {
              if (ENGINEER_LEGACY_PRODUCTION.has(n.type)) continue;
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

  restoreAIPlanningUnitPositions(gs);

  // --- Phase 1b: Register simple custom designs (occasionally) ---
  const existingDesigns = gs.designs?.[player] || [];
  const myLabsCount = countPlayerScienceLabs(gs, player);
  const designChance = Math.min(0.72, (0.22 + myLabsCount * 0.10 + Math.max(0, gs.turn - 6) * 0.01) * phaseWeights.research);
  const canRegisterDesign = myLabsCount >= 1 || (resSim.components || 0) >= 2 || stockpilePressure >= 0.5;
  if (canRegisterDesign && existingDesigns.length < getMaxDesignSlots(gs, player) && gs.turn >= 3 && Math.random() < designChance) {
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
  const labsOnline = countPlayerScienceLabs(gs, player);
  const queueCap = Math.max(1, resState.slots || 1);
  const canQueueResearch = labsOnline > 0
    || (gs.turn >= 3 && actions.some(a => a.type === 'vtc_upgrade' && a.upgradeId === 'science_lab'));
  if (canQueueResearch && (resState.queue?.length || 0) < queueCap) {
    const techTree = gs._techTree || TECH_TREE || {};
    const unlocked = new Set(resState.unlocked || []);
    const queued = new Set((resState.queue || []).map(q => q.techId));
    const prereqsMet = (tech) => (tech.prereqs || []).every(p => unlocked.has(p));
    const myVehicleDepots = countPlayerVtcUpgrade(gs, player, 'factory')
      + gs.buildings.filter(b => b.owner === player && b.type === 'VEHICLE_DEPOT' && !b.underConstruction).length;
    const myAirfields = gs.buildings.filter(b => b.owner === player && ['AIRFIELD','ADV_AIRFIELD'].includes(b.type) && !b.underConstruction).length;
    const unsupNow = gs.units.filter(u => u.owner === player && !u.embarked && (u.outOfSupply || 0) > 0).length;

    const choices = Object.values(techTree)
      .filter(t => t && t.id && !unlocked.has(t.id) && !queued.has(t.id) && prereqsMet(t));

    if (choices.length > 0) {
      const rank = (t) => {
        let s = 0;
        const turn = gs.turn || 1;
        if (t.branch === 'industrial') s += 12 + (turn >= 14 ? 2 : 0) + (turn >= 8 && labsOnline === 0 ? 6 : 0);
        if (t.branch === 'science') s += 5;
        if (t.branch === 'engineering') s += 2 + Math.min(5, unsupNow);
        if (t.id === 'gravel_roads' || t.id === 'concrete_roads' || t.id === 'railways') s += 6;
        if (t.branch === 'vehicles') s += myVehicleDepots > 0 ? 7 : 4;
        if (t.branch === 'air') s += myAirfields > 0 ? 9 : (turn >= 12 ? 5 : 2);
        if (t.branch === 'naval') s += (gs.buildings.some(b => b.owner === player && b.type === 'NAVAL_YARD' && !b.underConstruction) ? 8 : 3);
        if (t.kind === 'economy') s += 4 + (turn >= 10 ? 1 : 0);
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
  let plannedRecruits = 0;
  let plannedDesignedRecruits = 0;
  let plannedBaseRecruits = 0;
  let projectedUnits = armyBudget.myUnits + armyBudget.pending;
  let projectedCombat = armyBudget.myCombat;
  for (const u of gs.units.filter(u => u.owner === player && !u.embarked)) {
    plannedCount[u.type] = (plannedCount[u.type] || 0) + 1;
  }
  const isCombatUnitType = (unitType) => {
    const d = UNIT_TYPES[unitType] || {};
    return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
  };
  const maxRecruitsThisTurn = armyBudget.maxRecruitsPerTurn
    + (stockpilePressure >= 0.55 ? 2 : (stockpilePressure >= 0.35 ? 1 : 0))
    + (strategic?.phase === 'closing' ? 2 : (strategic?.phase === 'pressure' ? 1 : 0));
  const combatUnitsLive = myCombatUnits.length;
  const armyRebuildMode = combatUnitsLive < 4 && (gs.turn || 1) > 15;
  const armyCriticallyLow = combatUnitsLive < 4 || ((gs.turn || 1) >= 12 && combatUnitsLive < 7);
  const armyExpansionMode = (gs.turn || 1) >= 25 && combatUnitsLive < 12;
  const recruitAllowed = (unitType) => {
    if (plannedRecruits >= maxRecruitsThisTurn) return false;
    if (projectedUnits >= armyBudget.maxUnits) return false;
    if (isCombatUnitType(unitType) && projectedCombat >= armyBudget.maxCombat) return false;
    const waterMapRebuild = situation?.islandMap || (situation?.waterRatio || 0) >= 0.18;
    if (armyRebuildMode && AIR_UNITS.has(unitType)) return false;
    if (armyRebuildMode && NAVAL_UNITS.has(unitType) && !waterMapRebuild) return false;
    if (armyRebuildMode && unitType === 'SUPPLY_TRUCK') return false;
    if (armyRebuildMode && unitType === 'SUPPLY_SHIP' && !waterMapRebuild) return false;
    if (unitType === 'ENGINEER') {
      const engN = (plannedCount.ENGINEER || 0)
        + gs.units.filter(u => u.owner === player && u.type === 'ENGINEER').length;
      if (engN >= armyBudget.maxEngineers) return false;
    }
    return true;
  };
  const noteRecruit = (unitType, opts = {}) => {
    plannedRecruits += 1;
    projectedUnits += 1;
    if (isCombatUnitType(unitType)) projectedCombat += 1;
    plannedCount[unitType] = (plannedCount[unitType] || 0) + 1;
    if (opts.designed) plannedDesignedRecruits += 1;
    else plannedBaseRecruits += 1;
  };

  const VEHICLE_TYPES = new Set(['TANK','MEDIUM_TANK','ARMORED_CAR','HALFTRACK','SPG','ARTILLERY','ANTI_TANK']);
  const INDIRECT_TYPES = new Set(['ARTILLERY','MORTAR','SPG']);
  const SUPPORT_TYPES = new Set(['ENGINEER','SUPPLY_TRUCK','SUPPLY_SHIP','MEDIC']);
  const TRANSPORT_NAVAL_TYPES = new Set(['LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG','SUPPLY_SHIP']);
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
    const navalCombat = Object.entries(plannedCount).filter(([t]) => NAVAL_UNITS.has(t) && !TRANSPORT_NAVAL_TYPES.has(t)).reduce((s, [, n]) => s + n, 0);
    const designedShare = plannedRecruits > 0 ? (plannedDesignedRecruits / plannedRecruits) : 0;
    return { total, combat, vehicles, air, indirect, support, navalCombat, designedShare };
  };

  const myEngNow = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked).length;
  const queuedEngNow = actions.filter(a => a.type === 'recruit' && a.unitType === 'ENGINEER').length;
  const unworkedResSites = getUnclaimedResourceSites(gs, player).length;
  const myCapital = getPlayerCapital(gs, player)
    || myBuildings.find(bb => isPlayerCapitalBuilding(bb) && !bb.underConstruction);
  const queueGlobalFromBuilding = (building, unitType) => {
    if (!building) return false;
    const popBr = getPopBreakdown(gs, player);
    if (popBr.ready > 0 && popBr.avail < getUnitPopCost(unitType)) return false;
    if ((building.trainQueue?.length || 0) >= getMaxVtcQueueDepth(gs, player)) return false;
    if (actions.some(a => a.type === 'recruit' && a.global && a.buildingId === building.id)) return false;
    if (!getGlobalRecruitOptionsForVTC(gs, player, building.id).includes(unitType)) return false;
    if (!recruitAllowed(unitType)) return false;
    const check = canQueueGlobalRecruit(gs, player, unitType, building.id);
    if (!check.ok) return false;
    const popGate = canAffordPipelinePop(gs, player, unitType);
    if (!popGate.ok) return false;
    const c = UNIT_TYPES[unitType]?.cost || {};
    const f = getRecruitFoodCost(unitType);
    if (resSim.iron < (c.iron || 0) || resSim.oil < (c.oil || 0) || resSim.wood < (c.wood || 0)
      || resSim.food < f || resSim.components < (c.components || 0)) return false;
    actions.push({ type: 'recruit', buildingId: building.id, unitType, global: true });
    noteRecruit(unitType);
    spend(c);
    resSim.food -= f;
    return true;
  };

  const queueGlobalBestVTC = (unitType) => {
    const anchor = pickBestVTCToQueue(gs, player, unitType, myCapital);
    return anchor ? queueGlobalFromBuilding(anchor, unitType) : false;
  };

  const recruitEngineerFromCapital = () => {
    if (!myCapital) return false;
    return queueGlobalFromBuilding(myCapital, 'ENGINEER');
  };

  const recruitCombatFromProduction = (prefer = ['INFANTRY', 'ANTI_TANK', 'MORTAR', 'RECON']) => {
    const list = filterRecruitPrioForVtc(gs, player, prefer);
    for (const unitType of list) {
      if (queueGlobalBestVTC(unitType)) return true;
    }
    return false;
  };

  // VTC UPGRADE tab: barracks/farm/etc. before training units that require them.
  if (!overPlan()) {
    planAIVtcUpgrades(gs, player, actions, myCapital, perceivedEnemies, stockpilePressure >= 0.4 ? 2 : 1);
  }

  const exitIfOverPlan = () => {
    if (!overPlan()) return false;
    planDeployReadyVtcUnits(gs, player, actions, terrain, {
      capital: myCapital,
      focusEnemy: strategic?.focusEnemyHQ || enemyHQs[0],
      unitObjective: aiCtx?.unitObjective || {},
      territorial,
    });
    if (gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked).length === 0) {
      planArmyRecovery(gs, player, actions, resSim, spend, noteRecruit, recruitAllowed, myCapital, maxRecruitsThisTurn);
    }
    ensureMinimumArmyProgress(
      gs, player, actions, resSim, terrain, mapN, enemyHQs, myCapital,
      recruitAllowed, noteRecruit, spend, maxRecruitsThisTurn,
    );
    return true;
  };

  const focusEnemy = strategic?.focusEnemyHQ
    || pickPrimaryEnemyHQ(gs, player, getEnemyCapitalBuildings(gs, player))
    || getEnemyCapitalBuildings(gs, player)[0];
  if (!overPlan()) {
    planDeployReadyVtcUnits(gs, player, actions, terrain, {
      capital: myCapital,
      focusEnemy,
      unitObjective: aiCtx?.unitObjective,
      territorial: strategic?.territorial,
    });
  }

  if (armyRebuildMode) {
    for (let i = 0; i < 4 && plannedRecruits < maxRecruitsThisTurn; i++) {
      if (!recruitCombatFromProduction(['INFANTRY', 'INFANTRY', 'ANTI_TANK', 'MORTAR', 'RECON'])) break;
    }
    if ((myEngNow + queuedEngNow) < 1) recruitEngineerFromCapital();
  }

  // Resource rush: extra engineers while many unclaimed mines/oil remain.
  if ((gs.turn || 1) <= 16 && unworkedResSites >= 2
    && (myEngNow + queuedEngNow) < Math.min(4, 1 + Math.floor(unworkedResSites / 2))) {
    recruitEngineerFromCapital();
  }

  // Hard network engineer reserve when road network is behind schedule (not when army is gutted).
  const myUnitsForEng = gs.units.filter(u => u.owner === player && !u.embarked).length;
  if (roadDeficitGlobal >= 2 && myUnitsForEng >= 8 && (strategic?.phase !== 'pressure' || roadDeficitGlobal >= 6)) {
    if ((myEngNow + queuedEngNow) < 3) {
      recruitEngineerFromCapital();
    }
  }

  // Logistics emergency recruit pass (before normal priorities)
  const unsuppliedGroundNow = gs.units.filter(u => u.owner === player && !u.embarked && !NAVAL_UNITS.has(u.type) && (u.outOfSupply || 0) > 0).length;
  const unsuppliedNavalNow = gs.units.filter(u => u.owner === player && !u.embarked && NAVAL_UNITS.has(u.type) && (u.outOfSupply || 0) > 0).length;
  {
    const myTrucksNow = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_TRUCK' && !u.embarked).length;
    const frontlineSpanNow = getFrontlineDistanceEstimate(gs, player);
    const groundCombat = gs.units.filter(u => u.owner === player && !u.embarked && !NAVAL_UNITS.has(u.type)).filter(u => {
      const d = UNIT_TYPES[u.type] || {};
      return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
    }).length;
    const desiredTrucksNow = Math.min(4, Math.max(1, 1 + Math.floor(groundCombat / 9) + Math.floor(frontlineSpanNow / 20) + (unsuppliedGroundNow >= 5 ? 1 : 0)));
    const truckGapNow = Math.max(0, desiredTrucksNow - myTrucksNow);
    const maxPerTurn = unsuppliedGroundNow >= 6 ? 2 : 1;
    if (unsuppliedGroundNow >= 4 || (truckGapNow >= 2 && (gs.turn || 1) < 35)) {
      for (let i = 0; i < Math.min(maxPerTurn, truckGapNow); i++) {
        const b = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('SUPPLY_TRUCK') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player) && !actions.some(a => a.type === 'recruit' && a.buildingId === bb.id));
        if (!b) break;
        const c = UNIT_TYPES['SUPPLY_TRUCK']?.cost || {};
        const f = getRecruitFoodCost('SUPPLY_TRUCK');
        if (recruitAllowed('SUPPLY_TRUCK') && resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
          actions.push({ type: 'recruit', buildingId: b.id, unitType: 'SUPPLY_TRUCK' });
          resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
          noteRecruit('SUPPLY_TRUCK');
        }
      }
    }
  }
  if (unsuppliedNavalNow >= 1 && !armyRebuildMode) {
    const myShipsNow = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_SHIP').length;
    const navalCombatNow = gs.units.filter(u => u.owner === player && NAVAL_UNITS.has(u.type) && u.type !== 'SUPPLY_SHIP').length;
    const shipCapNow = Math.max(1, Math.min(4, Math.ceil(navalCombatNow / 4)
      + (needsAmphibiousLogistics(situation, territorial) ? 1 : 0)));
    if (myShipsNow < shipCapNow || unsuppliedNavalNow >= 1) {
      const b = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('SUPPLY_SHIP') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player));
      if (b) {
        const c = UNIT_TYPES['SUPPLY_SHIP']?.cost || {};
        const f = getRecruitFoodCost('SUPPLY_SHIP');
        if (recruitAllowed('SUPPLY_SHIP') && resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
          actions.push({ type: 'recruit', buildingId: b.id, unitType: 'SUPPLY_SHIP' });
          resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
          noteRecruit('SUPPLY_SHIP');
        }
      }
    }
  }

  const waterMap = situation?.islandMap || (situation?.waterRatio || 0) >= 0.18;

  // Per-VTC train queues: only unit types this player can build at some VTC right now.
  const vtcCanQueueMore = () => gs.buildings.some(b =>
    Number(b.owner) === Number(player) && PRODUCTION_VTC_TYPES.has(b.type)
    && (b.trainQueue?.length || 0) < getMaxVtcQueueDepth(gs, player));
  if (vtcCanQueueMore() && plannedRecruits < armyBudget.maxRecruitsPerTurn) {
    const preferList = filterRecruitPrioForVtc(gs, player, waterMap
      ? [...cfg.navalPrio, ...cfg.recruitPrio]
      : [...cfg.recruitPrio, ...cfg.navalPrio]);
    for (const unitType of preferList) {
      if (!queueGlobalBestVTC(unitType)) continue;
      if (!armyRebuildMode && !armyCriticallyLow && !armyExpansionMode) break;
    }
  }

  // Island / coastal maps: naval via global queue at coastal VTCs (PATROL_BOAT, SUPPLY_SHIP).
  if ((gs.turn || 1) >= 4 && waterMap) {
    const myNavalCombatNow = gs.units.filter(u => u.owner === player && !u.embarked && NAVAL_UNITS.has(u.type) && u.type !== 'SUPPLY_SHIP').length;
    const mySupplyShipsNow = gs.units.filter(u => u.owner === player && !u.embarked && u.type === 'SUPPLY_SHIP').length;
    const desiredPatrol = (gs.turn || 1) >= 14 ? 2 : 1;
    const navalBootLow = myNavalCombatNow < desiredPatrol || mySupplyShipsNow < 1;
    if (navalBootLow && vtcCanQueueMore()) {
      const bootOrder = mySupplyShipsNow < 1
        ? ['SUPPLY_SHIP', 'PATROL_BOAT']
        : ['PATROL_BOAT', 'SUPPLY_SHIP'];
      const navalBootUnits = filterRecruitPrioForVtc(gs, player, bootOrder);
      for (const pick of navalBootUnits) {
        if (queueGlobalBestVTC(pick)) break;
      }
    }
    const coastalForward = listOwnedVTCSorted(gs, player, perceivedEnemies, myCapital)
      .find(({ vtc }) => isNavalDeployAllowed(gs, vtc, getNavalCoastalCheckRadius(vtc))
        && !isVtcUpgradeComplete(vtc, 'naval_yard') && vtc.type !== 'VILLAGE');
    if (coastalForward && plannedRecruits < armyBudget.maxRecruitsPerTurn
      && !actions.some(a => a.type === 'vtc_upgrade' && a.buildingId === coastalForward.vtc.id)) {
      const menu = getVtcUpgradeMenu(gs, player, coastalForward.vtc.id);
      const ny = menu?.items?.find(x => x.id === 'naval_yard');
      if (ny?.canBuy) {
        actions.push({ type: 'vtc_upgrade', buildingId: coastalForward.vtc.id, upgradeId: 'naval_yard' });
      }
    }
  }

  if (exitIfOverPlan()) {
    return finalizePlanOnDeadline(gs, player, actions, { strategicPhase: strategic?.phase });
  }

  let vtcRecruitPasses = 0;
  const maxVtcRecruitPasses = mapN >= 120 ? 10 : (mapN >= 60 ? 14 : 24);
  for (const b of myBuildings) {
    if (overPlan()) break;
    if (plannedRecruits >= armyBudget.maxRecruitsPerTurn) break;
    if (PRODUCTION_VTC_TYPES.has(b.type)) {
      vtcRecruitPasses += 1;
      if (vtcRecruitPasses > maxVtcRecruitPasses) continue;
    }
    const bType = BUILDING_TYPES[b.type];
    if (!bType?.canRecruit?.length) continue;

    const alreadyQueued = gs.pendingRecruits.some(r => r.buildingId === b.id && r.owner === player);
    if (alreadyQueued) continue;
    if (actions.some(a => a.type === 'recruit' && a.buildingId === b.id)) continue;

    // Build priority list from strategy, filtered to what this building can recruit
    const isNaval = ['HARBOR','NAVAL_YARD','SHIPYARD','DRYDOCK','DRY_DOCK','NAVAL_BASE','NAVAL_DOCKYARD'].includes(b.type);
    const isAir   = ['AIRFIELD','ADV_AIRFIELD'].includes(b.type);
    const navalBodyId = isNaval ? waterBodies.getBodyIdNear(b.q, b.r) : null;
    const navalPolicy = isNaval ? waterBodies.getPolicy(waterBodies.getBody(navalBodyId)) : null;
    const prio    = isNaval
      ? (navalPolicy?.prio || cfg.navalPrio)
      : isAir ? cfg.airPrio : cfg.recruitPrio;
    const recruitRoleScore = (unitType) => {
      const role = getUnitRole(unitType);
      if (unitType === 'SUPPLY_TRUCK' || unitType === 'SUPPLY_SHIP' || unitType === 'ENGINEER') return 18 * phaseWeights.logistics;
      if (AIR_UNITS.has(unitType)) {
        const airW = cfg.airWeight || 1;
        return 22 * (phaseWeights.air || 1) * airW;
      }
      if (NAVAL_UNITS.has(unitType)) {
        const navW = cfg.navalWeight || 1;
        return 20 * (phaseWeights.naval || 1) * navW;
      }
      if (role === 'recon') return 10 * phaseWeights.recon;
      if (situation?.safeAtHome && (gs.turn || 1) <= 18) {
        const r = getUnitRole(unitType);
        if (r === 'line' || r === 'assault') return 9 * phaseWeights.combat * 0.55;
      }
      if (role === 'indirect' || role === 'assault' || role === 'line') {
        let s = 9 * phaseWeights.combat;
        if (stockpilePressure >= 0.4) s += 4 * stockpilePressure;
        if (strategic?.phase === 'closing') s += 6;
        return s;
      }
      return 0;
    };
    const hasWater = Object.values(terrain).some(t => t === 3 || t === 4 || t === 5);
    const myAirfields = gs.buildings.filter(b => b.owner === player && ['AIRFIELD','ADV_AIRFIELD'].includes(b.type) && !b.underConstruction).length;
    let sorted  = [...bType.canRecruit].sort((a, b2) => {
      const ai = prio.indexOf(a), bi = prio.indexOf(b2);
      const baseDelta = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      let phaseDeltaA = recruitRoleScore(a), phaseDeltaB2 = recruitRoleScore(b2);
      if (isNaval && hasWater) {
        if (cfg.navalPrio.includes(a)) phaseDeltaA += 5;
        if (cfg.navalPrio.includes(b2)) phaseDeltaB2 += 5;
      }
      const phaseDelta = phaseDeltaB2 - phaseDeltaA;
      return baseDelta + phaseDelta * 0.1;
    });
    if (isAir && myAirfields > 0 && sorted.length) {
      for (const ap of [...cfg.airPrio].reverse()) {
        const idx = sorted.indexOf(ap);
        if (idx > 0) { sorted.splice(idx, 1); sorted.unshift(ap); }
      }
    }
    // If components are available, prefer units that actually consume components.
    if ((resSim.components || 0) >= 4 || stockpilePressure >= 0.35) {
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
      const roadsNow = countPlayerRoadLike(gs, player);
      const roadDeficit = Math.max(0, dynamicRoadTarget - roadsNow);
      const macroDeficit = opening.deficits.roads + opening.deficits.mines + opening.deficits.pumps + opening.deficits.farms + opening.deficits.labs + opening.deficits.factories + roadDeficit;
      if (macroDeficit > 0 && sorted.includes('ENGINEER')) enforce.push('ENGINEER');
      if (opening.deficits.supplyTrucks > 0 && sorted.includes('SUPPLY_TRUCK')) enforce.push('SUPPLY_TRUCK');
      if (opening.deficits.supplyShips > 0 && sorted.includes('SUPPLY_SHIP')) enforce.push('SUPPLY_SHIP');
      if (enforce.length > 0) {
        for (const t of enforce.reverse()) {
          const idx = sorted.indexOf(t);
          if (idx > -1) { sorted.splice(idx, 1); sorted.unshift(t); }
        }
      }
    }

    const buildingCanRecruitAny = (set) => sorted.some(t => set.has(t));

    const designMinTurn = stockpilePressure >= 0.45 ? 7 : 9;
    if ((gs.turn || 1) >= designMinTurn && !logisticsEmergency) {
      const dPick = pickAIRecruit(gs, player, b, sorted, resSim, gs.turn || 1, true);
      if (dPick && typeof dPick.unitType === 'number' && dPick.design) {
        const ch = dPick.design.chassis;
        const tc = dPick.design.trainCost || {};
        const foodCost = getRecruitFoodCost(ch);
        if (resSim.iron >= (tc.iron || 0) && resSim.oil >= (tc.oil || 0) && resSim.wood >= (tc.wood || 0)
          && resSim.food >= foodCost && resSim.components >= (tc.components || 0)) {
          actions.push({ type: 'recruit', buildingId: b.id, unitType: dPick.unitType });
          noteRecruit(ch, { designed: true });
          resSim.iron -= (tc.iron || 0);
          resSim.oil -= (tc.oil || 0);
          resSim.wood -= (tc.wood || 0);
          resSim.food -= foodCost;
          resSim.components -= (tc.components || 0);
          continue;
        }
      }
    }

    for (const unitType of sorted) {
      if (!recruitAllowed(unitType)) continue;
      if (isNaval && navalBodyId != null && !waterBodies.recruitAllowed(unitType, navalBodyId, gs, player)) continue;
      const totals = plannedTotals();
      const barracksCombatRescue = ['INFANTRY', 'ANTI_TANK', 'MORTAR', 'MEDIC'];
      const armyCriticallyLow = myCombatUnits.length < 4 || (gs.turn >= 12 && myCombatUnits.length < 7);
      const navalBootstrapUnit = (situation?.islandMap || (situation?.waterRatio || 0) >= 0.18)
        && ['SUPPLY_SHIP', 'TRANSPORT_MD', 'TRANSPORT_SM', 'LANDING_CRAFT', 'PATROL_BOAT', 'DESTROYER'].includes(unitType);
      if (logisticsEmergency && !logisticsCriticalRecruits.has(unitType) && !navalBootstrapUnit) {
        if (!(armyCriticallyLow && barracksCombatRescue.includes(unitType))) continue;
      }
      if (logisticsPressure && (UNIT_TYPES[unitType]?.cost?.oil || 0) >= 2 && !logisticsCriticalRecruits.has(unitType)) {
        const closingSpend = strategic?.phase === 'closing' && stockpilePressure >= 0.35 && unsuppliedCombatNow <= 2;
        const armyStarved = !actions.some(a => ['attack', 'move', 'recruit', 'global_deploy'].includes(a.type));
        const infantryRescue = armyStarved && unitType === 'INFANTRY';
        if (!closingSpend && !infantryRescue) continue;
      }

      // Strategic doctrine gate: during expand/stabilize, suppress cheap recon spam — but keep infantry
      // online when the army is thin so an AI cannot stall with roads/engineers and zero combat output.
      const strategicPhase = aiCtx?.strategic?.phase || 'expand';
      const tier = UNIT_TYPES[unitType]?.tier || 0;
      const isCoreTier0 = tier <= 0 && ['INFANTRY','RECON','MOTORCYCLE'].includes(unitType);
      const allowEarlyInfantry = unitType === 'INFANTRY' && (myCombatUnits.length < 8 || situation?.vpMode);
      if ((strategicPhase === 'expand' || strategicPhase === 'stabilize') && isCoreTier0 && !logisticsCriticalRecruits.has(unitType)) {
        if (!allowEarlyInfantry) continue;
      }
      const navalVpEssential = new Set(['TRANSPORT_SM','TRANSPORT_MD','LANDING_CRAFT','SUPPLY_SHIP','PATROL_BOAT','DESTROYER']);
      if (situation?.vpMode && isNaval && strategicPhase === 'expand' && !logisticsCriticalRecruits.has(unitType)
        && !navalVpEssential.has(unitType) && (gs.turn || 1) >= 8) {
        continue;
      }

      const compStock = resSim.components || 0;
      const desiredVehicleMin = (gs.turn >= 16) ? Math.max(3, Math.floor(totals.combat * (compStock >= 4 ? 0.30 : 0.24))) : 0;
      const desiredAirMin = (gs.turn >= 18) ? Math.max(2, Math.floor(totals.combat * (compStock >= 4 ? 0.22 : 0.16))) : 0;
      const desiredIndirectMin = (gs.turn >= 14) ? Math.max(2, Math.floor(totals.combat * 0.18)) : 0;
      const desiredNavalMin = (gs.turn >= 16 && (situation?.islandMap || (situation?.waterRatio || 0) >= 0.18))
        ? Math.max(2, Math.floor(totals.combat * 0.16))
        : 0;
      const supportCap = (gs.turn >= 16) ? 0.24 : 0.30;

      // Doctrine quotas: force missing categories online by phase.
      if (desiredVehicleMin > 0 && totals.vehicles < desiredVehicleMin && buildingCanRecruitAny(VEHICLE_TYPES) && !VEHICLE_TYPES.has(unitType)) continue;
      if (desiredAirMin > 0 && totals.air < desiredAirMin && buildingCanRecruitAny(AIR_UNITS) && !AIR_UNITS.has(unitType)) continue;
      if (desiredIndirectMin > 0 && totals.indirect < desiredIndirectMin && buildingCanRecruitAny(INDIRECT_TYPES) && !INDIRECT_TYPES.has(unitType)) continue;
      if (desiredNavalMin > 0 && totals.navalCombat < desiredNavalMin && isNaval && !TRANSPORT_NAVAL_TYPES.has(unitType) && !NAVAL_UNITS.has(unitType)) continue;
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
        const groundCombat = gs.units.filter(u => u.owner === player && !u.embarked && !NAVAL_UNITS.has(u.type)).filter(u => {
          const d = UNIT_TYPES[u.type] || {};
          return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
        }).length;
        const truckCap = Math.max(1, Math.min(4, 1 + Math.floor(frontlineSpan / 16)
          + Math.floor(Math.max(0, unsuppliedGround) / 3)
          + (needsAmphibiousLogistics(situation, territorial) ? 1 : 0)));
        const ratioCap = Math.max(1, Math.ceil(groundCombat / 6));
        if (myTrucks >= truckCap) continue;
        if (myTrucks >= ratioCap && unsuppliedGround < 2) continue;
        // Barracks gate: don't build 2nd+ truck until a barracks is online
        if (myTrucks >= 1) {
          const hasBarracks = countPlayerBarracksFacilities(gs, player) > 0;
          if (!hasBarracks) continue;
        }
      }
      if (unitType === 'SUPPLY_SHIP') {
        const myShips = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_SHIP').length;
        const navalCombat = gs.units.filter(u => u.owner === player && NAVAL_UNITS.has(u.type) && u.type !== 'SUPPLY_SHIP').length;
        const unsNaval = gs.units.filter(u => u.owner === player && NAVAL_UNITS.has(u.type) && u.type !== 'SUPPLY_SHIP' && (u.outOfSupply || 0) > 0).length;
        const cap = Math.max(1, Math.min(4, Math.ceil(navalCombat / 5)
          + (needsAmphibiousLogistics(situation, territorial) ? 1 : 0)));
        if (myShips >= cap && unsNaval <= 1) continue;
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
      const hasFactoryUpgrade = gs.buildings.some(bb =>
        Number(bb.owner) === Number(player) && PRODUCTION_VTC_TYPES.has(bb.type)
        && isVtcUpgradeComplete(bb, 'factory'));
      if (gs.turn >= 14 && hasFactoryUpgrade && (unitType === 'INFANTRY' || unitType === 'RECON')) {
        continue;
      }
      const totalCombat = Math.max(1, Object.entries(plannedCount)
        .filter(([t]) => UNIT_TYPES[t]?.attack > 0 || UNIT_TYPES[t]?.soft_attack > 0 || UNIT_TYPES[t]?.hard_attack > 0)
        .reduce((s,[,n]) => s + n, 0));
      const lineCount = lineTypes.reduce((s,t) => s + (plannedCount[t] || 0), 0);
      if (unitType === 'INFANTRY' && lineCount / totalCombat > 0.55) continue;
      if ((unitType === 'PATROL_BOAT' || unitType === 'MTB') && (plannedCount[unitType] || 0) >= 4) continue;
      if (isNaval && navalPolicy?.kind === 'lake' && (plannedCount[unitType] || 0) >= (navalPolicy.maxByType[unitType] || 1)) continue;
      if (isNaval && navalPolicy?.kind === 'lake' && HEAVY_NAVAL_UNITS.has(unitType)) continue;
      if (isNaval && navalPolicy?.kind === 'lake' && TRANSPORT_NAVAL_UNITS.has(unitType)) continue;
      if (['LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG'].includes(unitType) && (plannedCount[unitType] || 0) >= 2) continue;

      const cost = UNIT_TYPES[unitType]?.cost || {};
      const foodCost = getRecruitFoodCost(unitType);
      if (resSim.iron >= (cost.iron || 0) &&
          resSim.oil  >= (cost.oil  || 0) &&
          resSim.wood >= (cost.wood || 0) &&
          resSim.food >= foodCost &&
          resSim.components >= (cost.components || 0)) {
        actions.push({ type: 'recruit', buildingId: b.id, unitType });
        noteRecruit(unitType);
        resSim.iron -= (cost.iron || 0);
        resSim.oil  -= (cost.oil  || 0);
        resSim.wood -= (cost.wood || 0);
        resSim.food -= foodCost;
        resSim.components -= (cost.components || 0);
        break;
      }
    }
  }

  if (exitIfOverPlan()) {
    return finalizePlanOnDeadline(gs, player, actions, { strategicPhase: strategic?.phase });
  }

  // Road quota: when behind network targets (or when supply is already strained),
  // ensure at least one road build is planned this turn when possible.
  const roadsAtCap = countPlayerRoadLike(gs, player) >= (armyBudget?.maxRoads ?? 36);
  if (!overPlan() && !stagnantArmyBreakout && !roadsAtCap && (roadDeficitGlobal > 0 || logisticsPressure) && plannedRoadBuilds === 0) {
    const roadableHere = (q, r) => {
      const t = terrain?.[`${q},${r}`] ?? 0;
      if (t === 2) return false; // no roads on mountains
      if (roadAt(gs, q, r)) return false;
      const b = buildingAt(gs, q, r);
      if (b && !ROAD_TYPES.has(b.type)) return false;
      return isRoadBuildConnectivity(gs, player, q, r);
    };

    const rcost = BUILDING_TYPES['ROAD']?.buildCost || {};
    const engineers = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing);
    for (const eng of engineers) {
      if (!canAfford(rcost)) break;

      // Case A: already on a valid roadable tile (never stack road on road)
      if (roadableHere(eng.q, eng.r) && !roadAt(gs, eng.q, eng.r)) {
        actions.push({ type: 'build', unitId: eng.id, buildingType: 'ROAD' });
        spend(rcost);
        plannedRoadBuilds += 1;
        break;
      }

      // Case B: move to a nearby roadable tile this turn, then build road there.
      const reachable = getReachableHexesForAI(gs, eng, terrain, mapSize) || [];
      const cand = reachable
        .filter(h => roadableHere(h.q, h.r))
        .filter(h => !isImmediateBacktrack(eng, h, moveMemory?.[eng.id], gs.turn || 1))
        .sort((a, b) => scoreRoadUtility(gs, player, b.q, b.r) - scoreRoadUtility(gs, player, a.q, a.r))[0]
        || reachable
          .filter(h => roadableHere(h.q, h.r))
          .sort((a, b) => scoreRoadUtility(gs, player, b.q, b.r) - scoreRoadUtility(gs, player, a.q, a.r))[0];
      if (cand) {
        actions.push({ type: 'move', unitId: eng.id, fromQ: eng.q, fromR: eng.r, toQ: cand.q, toR: cand.r });
        moveMemory[eng.id] = { fromQ: eng.q, fromR: eng.r, toQ: cand.q, toR: cand.r, turn: gs.turn || 1 };
        actions.push({ type: 'build', unitId: eng.id, buildingType: 'ROAD' });
        spend(rcost);
        plannedRoadBuilds += 1;
        break;
      }
    }
  }

  // Hard logistics quota under pressure: ensure at least one concrete logistics action is scheduled.
  const isLogisticsAction = (a) =>
    (a.type === 'build' && ['ROAD','SUPPLY_DEPOT','SUPPLY_WAREHOUSE','SUPPLY_PORT'].includes(a.buildingType))
    || (a.type === 'recruit' && (a.unitType === 'SUPPLY_TRUCK' || a.unitType === 'SUPPLY_SHIP'));
  const countLogisticsPlanned = () => actions.filter(isLogisticsAction).length;

  if (logisticsPressure && !stagnantArmyBreakout && countLogisticsPlanned() === 0) {
    const canBuildHere = (q, r) => {
      const b = buildingAt(gs, q, r);
      return !b || ROAD_TYPES.has(b.type);
    };
    const unlockedLog = new Set(gs.players[player]?.research?.unlocked || []);
    const idleEngs = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing);
    const amphibLogistics = needsAmphibiousLogistics(situation, territorial);

    // 0) Coastal supply port when bridging continents/islands.
    if (amphibLogistics && unlockedLog.has('supply_depot')) {
      const portCost = BUILDING_TYPES['SUPPLY_PORT']?.buildCost || {};
      for (const eng of idleEngs) {
        const bridgeHere = territorial?.bridgeSites?.find(bs => bs.q === eng.q && bs.r === eng.r);
        const coastal = isCoastalLand(terrain, mapSize, eng.q, eng.r);
        if (!coastal && !bridgeHere) continue;
        if (!canBuildHere(eng.q, eng.r)) continue;
        if (!canAfford(portCost)) break;
        actions.push({ type: 'build', unitId: eng.id, buildingType: 'SUPPLY_PORT' });
        spend(portCost);
        break;
      }
    }

    // 1) Try to place a forward depot/warehouse first when supply is strained.
    if (countLogisticsPlanned() === 0) {
      const depotType = logisticsEmergency ? 'SUPPLY_WAREHOUSE' : 'SUPPLY_DEPOT';
      const depotCost = BUILDING_TYPES[depotType]?.buildCost || {};
      for (const eng of idleEngs) {
        if (!canBuildHere(eng.q, eng.r)) continue;
        if (!canAfford(depotCost)) break;
        actions.push({ type: 'build', unitId: eng.id, buildingType: depotType });
        spend(depotCost);
        break;
      }
    }

    // 2) If still nothing, force a road action from an engineer.
    if (countLogisticsPlanned() === 0) {
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

    // 3) Queue truck or supply ship.
    if (countLogisticsPlanned() === 0) {
      const myTrucksNow = gs.units.filter(u => u.owner === player && u.type === 'SUPPLY_TRUCK' && !u.embarked).length;
      const truckHardCap = Math.max(2, Math.min(4, 1 + Math.floor(getFrontlineDistanceEstimate(gs, player) / 18)));
      if (myTrucksNow >= truckHardCap && !logisticsEmergency) {
        // Do not satisfy logistics quota with more truck spam when already saturated.
      } else {
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
    if (countLogisticsPlanned() === 0 && amphibLogistics) {
      const shipB = myBuildings.find(bb => (BUILDING_TYPES[bb.type]?.canRecruit || []).includes('SUPPLY_SHIP') && !gs.pendingRecruits.some(r => r.buildingId === bb.id && r.owner === player));
      if (shipB) {
        const c = UNIT_TYPES['SUPPLY_SHIP']?.cost || {};
        const f = getRecruitFoodCost('SUPPLY_SHIP');
        if (resSim.iron >= (c.iron||0) && resSim.oil >= (c.oil||0) && resSim.wood >= (c.wood||0) && resSim.food >= f && resSim.components >= (c.components||0)) {
          actions.push({ type: 'recruit', buildingId: shipB.id, unitType: 'SUPPLY_SHIP' });
          resSim.iron -= (c.iron||0); resSim.oil -= (c.oil||0); resSim.wood -= (c.wood||0); resSim.food -= f; resSim.components -= (c.components||0);
        }
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
        const reachable = getReachableHexesForAI(gs, eng, terrain, mapSize) || [];
        const best = reachable
          .filter(h => hexDistance(h.q, h.r, nearest.q, nearest.r) < hexDistance(eng.q, eng.r, nearest.q, nearest.r))
          .filter(h => !isImmediateBacktrack(eng, h, moveMemory?.[eng.id], gs.turn || 1))
          .sort((a, b) => hexDistance(a.q, a.r, nearest.q, nearest.r) - hexDistance(b.q, b.r, nearest.q, nearest.r))[0];
        if (best) {
          actions.push({ type: 'move', unitId: eng.id, fromQ: eng.q, fromR: eng.r, toQ: best.q, toR: best.r });
          moveMemory[eng.id] = { fromQ: eng.q, fromR: eng.r, toQ: best.q, toR: best.r, turn: gs.turn || 1 };
          actedPreFOB.add(eng.id);
        }
      }
    }
  }

  // Until HQ owned roads touch the neutral spine, steer engineers toward the nearest neutral road cluster.
  const plugUnsup = gs.units.filter(u => u.owner === player && !u.embarked && (u.outOfSupply || 0) > 0).length;
  if (!isHQNetworkPluggedToNeutralRoads(gs, player, mapSize) && ((gs.turn || 1) <= 80 || plugUnsup >= 1)) {
    const neutralRoads = gs.buildings.filter(b => ROAD_TYPES.has(b.type) && Number(b.owner) === 0);
    const myHQPlug = getMyHQs()[0];
    if (neutralRoads.length > 0 && myHQPlug) {
      const plugTarget = neutralRoads.reduce((a, b) =>
        hexDistance(myHQPlug.q, myHQPlug.r, a.q, a.r) <= hexDistance(myHQPlug.q, myHQPlug.r, b.q, b.r) ? a : b);
      const actedPlugIds = new Set(actions.filter(a => a.unitId != null).map(a => a.unitId));
      for (const eng of gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing)) {
        if (actedPlugIds.has(eng.id)) continue;
        if (hexDistance(eng.q, eng.r, plugTarget.q, plugTarget.r) <= 2) continue;
        const reachable = getReachableHexesForAI(gs, eng, terrain, mapSize) || [];
        const best = reachable
          .filter(h => hexDistance(h.q, h.r, plugTarget.q, plugTarget.r) < hexDistance(eng.q, eng.r, plugTarget.q, plugTarget.r))
          .filter(h => !isImmediateBacktrack(eng, h, moveMemory?.[eng.id], gs.turn || 1))
          .sort((a, b) => scoreRoadUtility(gs, player, b.q, b.r, mapSize) - scoreRoadUtility(gs, player, a.q, a.r, mapSize))[0];
        if (best) {
          actions.push({ type: 'move', unitId: eng.id, fromQ: eng.q, fromR: eng.r, toQ: best.q, toR: best.r });
          moveMemory[eng.id] = { fromQ: eng.q, fromR: eng.r, toQ: best.q, toR: best.r, turn: gs.turn || 1 };
          actedPlugIds.add(eng.id);
        }
      }
    }
  }

  // Engineer utilization sweep: avoid idle engineers when valid logistics work exists.
  const actedEngineerIds = new Set(actions.filter(a => a.unitId != null).map(a => a.unitId));
  const idleEngineers = gs.units.filter(u => u.owner === player && u.type === 'ENGINEER' && !u.embarked && !u.constructing && !actedEngineerIds.has(u.id));
  const armyActionPlanned = actions.some(a => ['attack', 'move', 'recruit', 'global_deploy'].includes(a.type));
  let maxEngSweep = Math.max(4, Math.min(14, 2 + Math.floor(roadDeficitGlobal / 2) + (logisticsPressure ? 4 : 0)));
  if (!armyActionPlanned && myCombatUnits.length > 0) maxEngSweep = Math.min(maxEngSweep, 1);
  if (mapN >= 90) maxEngSweep = Math.min(maxEngSweep, 4);
  if (stagnantArmyBreakout) maxEngSweep = 0;
  if (overPlan()) maxEngSweep = 0;
  let engSweepCount = 0;
  const roadCostFinal = BUILDING_TYPES['ROAD']?.buildCost || { wood: 1 };
  const roadableHereFinal = (q, r) => {
    const t = terrain?.[`${q},${r}`] ?? 0;
    if (t === 2) return false;
    if (roadAt(gs, q, r)) return false;
    const b = buildingAt(gs, q, r);
    if (b && !ROAD_TYPES.has(b.type)) return false;
    return isRoadBuildConnectivity(gs, player, q, r);
  };
  for (const eng of idleEngineers) {
    if (engSweepCount >= maxEngSweep) break;
    if (roadDeficitGlobal <= 0 && !logisticsPressure && (gs.turn || 1) > 50) break;
    if (canAfford(roadCostFinal) && roadableHereFinal(eng.q, eng.r) && !roadAt(gs, eng.q, eng.r)) {
      actions.push({ type: 'build', unitId: eng.id, buildingType: 'ROAD' });
      spend(roadCostFinal);
      engSweepCount += 1;
      continue;
    }
    const reachable = getReachableHexesForAI(gs, eng, terrain, mapSize) || [];
    const cand = reachable
      .filter(h => roadableHereFinal(h.q, h.r))
      .filter(h => !isImmediateBacktrack(eng, h, moveMemory?.[eng.id], gs.turn || 1))
      .sort((a, b) => scoreRoadUtility(gs, player, b.q, b.r) - scoreRoadUtility(gs, player, a.q, a.r))[0]
      || reachable
        .filter(h => roadableHereFinal(h.q, h.r))
        .sort((a, b) => scoreRoadUtility(gs, player, b.q, b.r) - scoreRoadUtility(gs, player, a.q, a.r))[0];
    if (cand) {
      actions.push({ type: 'move', unitId: eng.id, fromQ: eng.q, fromR: eng.r, toQ: cand.q, toR: cand.r });
      moveMemory[eng.id] = { fromQ: eng.q, fromR: eng.r, toQ: cand.q, toR: cand.r, turn: gs.turn || 1 };
      engSweepCount += 1;
    }
  }

  // Hard cap build spam so stability trimmer does not discard combat (late-game perf).
  {
    const combatAlive = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked && isCombatUnitForGarrison(u)).length;
    let maxBuildActions = Math.max(6, Math.min(20, 4 + Math.floor(roadDeficitGlobal) + (logisticsPressure ? 5 : 0)));
    if (combatAlive < 10) maxBuildActions = Math.min(maxBuildActions, 5);
    if (combatAlive < 6) maxBuildActions = Math.min(maxBuildActions, 3);
    if (stagnantArmyBreakout) maxBuildActions = Math.min(maxBuildActions, 1);
    let buildN = 0;
    let resourceBuildN = 0;
    const maxResourceBuilds = 3;
    const trimmed = [];
    for (const a of actions) {
      if (a.type === 'build') {
        if (ENGINEER_RESOURCE_BUILDS.has(a.buildingType)) {
          if (resourceBuildN >= maxResourceBuilds) continue;
          resourceBuildN += 1;
        } else if (buildN >= maxBuildActions) continue;
        else buildN += 1;
      }
      trimmed.push(a);
    }
    actions.length = 0;
    actions.push(...trimmed);
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
      mem.task = pickEngineerTask(gs, player, u, strategic, mapSize, null, terrain);
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
        else if (a.buildingType === 'SUPPLY_DEPOT' || a.buildingType === 'SUPPLY_WAREHOUSE' || a.buildingType === 'SUPPLY_PORT') aiDebug.engineerAssignments.fob += 1;
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
      let recruitType = t;
      let designed = false;
      if (typeof t === 'number') {
        const dsg = (gs.designs?.[player] || []).find(d => d.id === t);
        if (dsg?.chassis) {
          recruitType = dsg.chassis;
          designed = true;
        }
      }
      if (NAVAL_UNITS.has(recruitType)) aiDebug.recruitMix.naval += 1;
      if (AIR_UNITS.has(recruitType)) aiDebug.recruitMix.air += 1;
      const role = getUnitRole(recruitType);
      if (role === 'support' || recruitType === 'ENGINEER') aiDebug.recruitMix.support += 1;
      if (designed) aiDebug.recruitMix.designed += 1;
      else aiDebug.recruitMix.base += 1;
      const tier = UNIT_TYPES[recruitType]?.tier || 0;
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
  const enemyCombatNow = getEnemies().filter(u => {
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
  aiDebug.enemyIntel = {
    seenUnits: perceivedEnemies.length,
    staleIntel: perceivedEnemies.filter(u => Number((gs.turn || 1) - (u.seenTurn || gs.turn || 1)) >= 2).length,
  };

  const researchFloor = planResearchFloorActions(gs, player, terrain, actions, resSim, canAfford, spend);
  let armyProgressFloor = ensureMinimumArmyProgress(
    gs, player, actions, resSim, terrain, mapSize, enemyHQs, myCapital,
    recruitAllowed, noteRecruit, spend, maxRecruitsThisTurn,
  );
  let expansionMoveFloor = 0;
  if (stagnantArmyBreakout || armyUndersized) {
    trimActionsForStagnationBreakout(actions, armyUndersized ? 0 : 1);
    pruneVtcQueueBacklog(gs, player);
    recalcPlayerPopulation(gs, player);
    if (myCapital && !isVtcUpgradeComplete(myCapital, 'barracks')) {
      const barracksBuy = canPurchaseVtcUpgrade(gs, player, myCapital.id, 'barracks');
      if (barracksBuy.ok && !actions.some(a => a.type === 'vtc_upgrade' && a.buildingId === myCapital.id)) {
        actions.push({ type: 'vtc_upgrade', buildingId: myCapital.id, upgradeId: 'barracks' });
      }
    }
    for (let i = 0; i < maxRecruitsThisTurn && recruitAllowed('INFANTRY'); i++) {
      if (queueGlobalBestVTC('INFANTRY')) armyProgressFloor += 1;
      else break;
    }
    expansionMoveFloor = enforceExpansionMoveFloor(
      gs, player, actions, terrain, mapSize, enemyHQs, myCapital, moveMemory,
    );
    if (armyProgressFloor === 0 && expansionMoveFloor === 0) {
      armyProgressFloor = ensureMinimumArmyProgress(
        gs, player, actions, resSim, terrain, mapSize, enemyHQs, myCapital,
        recruitAllowed, noteRecruit, spend, maxRecruitsThisTurn,
      );
    }
    aiDebug.plannerReason = armyUndersized ? 'army_undersized_recruit' : 'stagnation_breakout';
  }
  if (!actions.some(a => a.type === 'recruit') && (stagnantArmyBreakout || armyUndersized)) {
    forceArmyRecruitWhenIdle(
      gs, player, actions, resSim, spend, noteRecruit, recruitAllowed, myCapital, maxRecruitsThisTurn,
    );
  }
  const contactAttackFloor = enforceContactAttackFloor(gs, player, actions, perceivedEnemies);
  const closingAttackFloor = enforceClosingAttackFloor(gs, player, actions, strategic);

  let transportActions = [];
  if (!overPlan()) {
    transportActions = planTransportOperations(gs, terrain, mapN, player, strategic, territorial, actions);
    actions.push(...transportActions);
  }
  aiDebug.transportOps = transportActions.length;

  aiDebug.actionPlan = {
    attacks: actions.filter(a => a.type === 'attack').length,
    moves: actions.filter(a => a.type === 'move').length,
    builds: actions.filter(a => a.type === 'build').length,
    recruits: actions.filter(a => a.type === 'recruit').length,
    extractorRaids: Object.values(unitObjective).filter(o => o?.kind === 'raid_resource').length,
    contactAttackFloor,
    closingAttackFloor,
    researchFloor,
    armyProgressFloor,
    expansionMoveFloor,
  };

  const plDbg = gs.players[player] || {};
  const techTree = gs._techTree || TECH_TREE || {};
  aiDebug.economy = {
    iron: plDbg.iron, oil: plDbg.oil, wood: plDbg.wood || 0,
    food: plDbg.food, components: plDbg.components || 0, rp: plDbg.rp || 0,
  };
  aiDebug.armyBudget = armyBudget;
  aiDebug.designs = (gs.designs[player] || []).map(d => ({
    name: d.name, chassis: d.chassis, role: d.aiRole || 'custom', tier: d.effectiveTier,
  }));
  aiDebug.researchQueue = (plDbg.research?.queue || []).map(item => {
    const tech = techTree[item.techId];
    const pct = tech ? Math.min(100, Math.round(((item.rpSpent || 0) / tech.cost) * 100)) : 0;
    return { id: item.techId, name: tech?.name || item.techId, pct };
  });

  gs._aiDebug = gs._aiDebug || {};
  gs._aiDebug[player] = aiDebug;

  const hasArmyAction = actions.some(a =>
    ['attack', 'move', 'recruit', 'global_deploy', 'vtc_upgrade'].includes(a.type));
  if (!hasArmyAction) {
    const myCap = getPlayerCapital(gs, player) || myCapital;
    if (populationFull || stagnantArmyBreakout) {
      if (popReserveNow > 0) {
        planDeployReadyVtcUnits(gs, player, actions, terrain, {
          capital: myCap,
          focusEnemy: strategic?.focusEnemyHQ || enemyHQs[0],
          unitObjective: aiCtx?.unitObjective || {},
          territorial,
        });
      }
      enforceExpansionMoveFloor(gs, player, actions, terrain, mapSize, enemyHQs, myCap, moveMemory);
    }
    if (!actions.some(a => ['move', 'attack'].includes(a.type))) {
      ensureMinimumArmyProgress(
        gs, player, actions, resSim, terrain, mapSize, enemyHQs, myCap,
        recruitAllowed, noteRecruit, spend, maxRecruitsThisTurn,
      );
    }
    if (!actions.some(a => a.type === 'recruit') && (armyUndersized || stagnantArmyBreakout)) {
      forceArmyRecruitWhenIdle(
        gs, player, actions, resSim, spend, noteRecruit, recruitAllowed, myCap, maxRecruitsThisTurn,
      );
    }
    if (!actions.length) {
      aiDebug.plannerReason = populationFull ? 'pop_full_expand' : 'idle_breakout';
    }
  }

  return actions;
}

/** Dev panel: snapshot all AI players (economy, doctrine, research, designs). */
export function buildAIOverviewForGame(gs, terrain, mapSize, aiPlayers, aiStrategies = {}) {
  if (!gs || !aiPlayers?.size) return [];
  const techTree = gs._techTree || TECH_TREE || {};
  const rows = [];
  for (const p of [...aiPlayers].sort((a, b) => a - b)) {
    const pl = gs.players[p] || {};
    const dbg = gs._aiDebug?.[p] || {};
    const stratKey = aiStrategies[p] || 'balanced';
    const strat = AI_STRATEGIES[stratKey] || AI_STRATEGIES.balanced;
    const situation = terrain ? assessMapSituation(terrain, mapSize, gs, p) : {};
    const armyBudget = getAIArmyBudget(gs, p, mapSize, situation);
    const stockpilePressure = getStockpileSpendPressure(gs, p);
    const enemyHQs = gs.buildings.filter(b => b.type === 'HQ' && Number(b.owner) !== Number(p));
    const focusHQ = pickPrimaryEnemyHQ(gs, p, enemyHQs);
    const endgamePressure = getEndgamePressure(gs, p, mapSize, focusHQ);
    let theater = null;
    if (terrain) {
      theater = buildTheaterIntel(terrain, mapSize, gs, p, situation);
    }
    const popRow = getPopBreakdown(gs, p);
    rows.push({
      player: p,
      pop: popRow,
      strategy: stratKey,
      strategyLabel: strat.label || stratKey,
      phase: dbg.strategicPhase || gs._aiStrategicMemory?.[p]?.phase || '?',
      endgamePressure: dbg.endgamePressure ?? endgamePressure,
      stockpilePressure: dbg.stockpilePressure ?? stockpilePressure,
      focusEnemy: dbg.focusEnemy ?? (focusHQ ? Number(focusHQ.owner) : null),
      theaterMode: dbg.theaterMode ?? !!theater?.useTheaterMode,
      primaryTheaterId: dbg.primaryTheaterId ?? theater?.primaryTheaterId,
      theaterObjective: dbg.theaterObjective ?? theater?.primaryObjective?.type,
      primaryLane: dbg.primaryLane,
      missions: dbg.missions || {},
      economy: dbg.economy || {
        iron: pl.iron, oil: pl.oil, wood: pl.wood || 0,
        food: pl.food, components: pl.components || 0, rp: pl.rp || 0,
      },
      armyBudget,
      designs: dbg.designs || (gs.designs[p] || []).map(d => ({
        name: d.name, chassis: d.chassis, role: d.aiRole || 'custom', tier: d.effectiveTier,
      })),
      actionPlan: dbg.actionPlan || null,
      researchQueue: dbg.researchQueue || (pl.research?.queue || []).map(item => {
        const tech = techTree[item.techId];
        const pct = tech ? Math.min(100, Math.round(((item.rpSpent || 0) / tech.cost) * 100)) : 0;
        return { id: item.techId, name: tech?.name || item.techId, pct };
      }),
      unlockedCount: (pl.research?.unlocked || []).length,
      deception: !!dbg.deceptionActive,
      transportOps: dbg.transportOps || 0,
      recruitMix: dbg.recruitMix,
    });
  }
  return rows;
}
