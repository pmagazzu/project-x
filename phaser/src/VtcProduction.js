/**
 * Per-VTC training queues — each settlement trains and holds its own units.
 */
import {
  UNIT_TYPES, NAVAL_UNITS, AIR_UNITS, LOCKED_CHASSIS,
  getBuildingTierForDeploy, isNavalDeployAllowed, getNavalCoastalCheckRadius, canQueueNavalAtVtc,
  isNavalAllowedAtVTCTier, getRecruitFoodCost, getUnitPopCost, recalcPlayerPopulation, getPopBreakdown, calcPopFieldedByPlayer,
  canAffordPipelinePop, countEmpirePipelineSlots,
  getPlayerCapital, isPlayerCapitalBuilding, PRODUCTION_VTC_TYPES,
  CITY_YARD_NAVAL_UNITS, hexDistance, createUnit, buildingAt, ROAD_TYPES,
  canEnterTerrain, VTC_SUPPLY_RADIUS,
} from './GameState.js';

const HEX_NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
import { isVtcUpgradeComplete, vtcHasNavalYard } from './SettlementSystem.js';

export const MAX_VTC_TRAIN_QUEUE = 4;
let _nextTrainId = 1;

export function ensureVtcProductionFields(building) {
  if (!building.trainQueue) building.trainQueue = [];
  if (!building.readyUnits) building.readyUnits = [];
}

/** Migrate legacy global queues onto buildings (first load). */
export function migrateGlobalQueuesToVtc(state) {
  const pending = state.pendingGlobalRecruits || [];
  const ready = state.readyGlobalRecruits || [];
  for (const r of pending) {
    const b = state.buildings.find(x => x.id === r.sourceBuildingId);
    if (b) {
      ensureVtcProductionFields(b);
      b.trainQueue.push({
        id: r.id || _nextTrainId++,
        type: r.type,
        turnsLeft: r.turnsLeft ?? 1,
      });
    }
  }
  for (const r of ready) {
    const b = state.buildings.find(x => x.id === r.sourceBuildingId)
      || state.buildings.find(x =>
        PRODUCTION_VTC_TYPES.has(x.type) && Number(x.owner) === Number(r.owner) && !x.underConstruction);
    if (b) {
      ensureVtcProductionFields(b);
      b.readyUnits.push({ id: r.id || _nextTrainId++, type: r.type });
    }
  }
  state.pendingGlobalRecruits = [];
  state.readyGlobalRecruits = [];
}

function isCityYardNavalEligible(state, player, b, unitType) {
  if (!CITY_YARD_NAVAL_UNITS.includes(unitType)) return false;
  if (b.type !== 'CITY') return false;
  if (!vtcHasNavalYard(state, player, b)) return false;
  if (LOCKED_CHASSIS.has(unitType)) {
    const unlocked = new Set(state.players[player]?.research?.unlocked || []);
    if (unitType === 'DESTROYER_MK1' && !unlocked.has('destroyer_mk1')) return false;
  }
  return isNavalDeployAllowed(state, b, getNavalCoastalCheckRadius(b));
}

/** Units this VTC can train based on tier + purchased facilities. */
export function getRecruitOptionsForVTC(state, player, buildingId) {
  const b = state.buildings.find(x => x.id === buildingId && Number(x.owner) === Number(player) && !x.underConstruction);
  if (!b || !PRODUCTION_VTC_TYPES.has(b.type)) return [];

  const tier = getBuildingTierForDeploy(b);
  if (tier < 0) return [];

  const opts = new Set();
  const cap = isPlayerCapitalBuilding(b);

  if (cap) {
    ['INFANTRY', 'ENGINEER', 'RECON', 'SUPPLY_TRUCK'].forEach(u => opts.add(u));
  } else if (isVtcUpgradeComplete(b, 'barracks')) {
    ['INFANTRY', 'RECON', 'ANTI_TANK', 'MORTAR', 'MEDIC', 'ENGINEER'].forEach(u => opts.add(u));
  } else {
    opts.add('INFANTRY');
  }
  if (isVtcUpgradeComplete(b, 'local_farm') || cap) {
    opts.add('SUPPLY_TRUCK');
  }
  if (tier >= 1 || isVtcUpgradeComplete(b, 'factory')) {
    opts.add('TANK', 'ARTILLERY');
  }
  if (tier >= 1 || isVtcUpgradeComplete(b, 'science_lab')) {
    opts.add('BIPLANE_FIGHTER', 'LIGHT_BOMBER', 'OBS_PLANE');
  }

  if (NAVAL_UNITS.has('PATROL_BOAT')) {
    const coastalR = getNavalCoastalCheckRadius(b);
    if (canQueueNavalAtVtc(state, b) && isNavalDeployAllowed(state, b, coastalR)) {
      const navalList = isNavalAllowedAtVTCTier(tier, 'PATROL_BOAT')
        ? ['PATROL_BOAT', 'MTB', 'TORPEDO_BOAT', 'LANDING_CRAFT']
        : [];
      for (const u of navalList) {
        if (isNavalAllowedAtVTCTier(tier, u)) opts.add(u);
      }
      if (tier >= 1 && isVtcUpgradeComplete(b, 'local_farm')) opts.add('SUPPLY_SHIP');
      if (isVtcUpgradeComplete(b, 'naval_yard') || cap) {
        ['MOTOR_GUNBOAT', 'TRANSPORT_SM', 'DESTROYER', 'SUBMARINE'].forEach(u => {
          if (isNavalAllowedAtVTCTier(tier, u) || tier >= 2) opts.add(u);
        });
      }
    }
  }

  for (const u of CITY_YARD_NAVAL_UNITS) {
    if (isCityYardNavalEligible(state, player, b, u)) opts.add(u);
  }

  return [...opts].filter((unitType) => {
    const def = UNIT_TYPES[unitType] || {};
    if (def.unlockedBy && !(state.players[player]?.research?.unlocked || []).includes(def.unlockedBy)) return false;
    return true;
  });
}

export function getGlobalRecruitOptionsForVTC(state, player, buildingId) {
  return getRecruitOptionsForVTC(state, player, buildingId);
}

export function getGlobalRecruitOptionsForPlayer(state, player) {
  const opts = new Set();
  for (const b of state.buildings.filter(x =>
    PRODUCTION_VTC_TYPES.has(x.type) && Number(x.owner) === Number(player) && !x.underConstruction)) {
    for (const t of getRecruitOptionsForVTC(state, player, x.id)) opts.add(t);
  }
  return [...opts];
}

export function deployReadyGlobalRecruit(state, player, readyId, buildingId) {
  const b = state.buildings.find(x => x.id === buildingId && Number(x.owner) === Number(player));
  if (!b?.readyUnits?.length) return { ok: false, reason: 'No ready unit' };
  const ready = b.readyUnits.find(r => r.id === readyId);
  if (!ready) return { ok: false, reason: 'Unit not at this VTC' };
  const sites = enumerateVtcDeployHexes(state, player, buildingId, ready.type);
  const site = sites[0];
  if (!site) return { ok: false, reason: 'No deploy hex' };
  return deployReadyVtcUnitAtHex(state, player, buildingId, readyId, site.q, site.r);
}

export function getVtcTrainQueue(building) {
  ensureVtcProductionFields(building);
  return building.trainQueue;
}

export function getVtcReadyUnits(building) {
  ensureVtcProductionFields(building);
  return building.readyUnits;
}

export function getVtcQueueSummary(state, player, buildingId) {
  const b = state.buildings.find(x => x.id === buildingId);
  if (!b) return { pending: [], ready: [], training: null };
  ensureVtcProductionFields(b);
  return {
    pending: [...b.trainQueue],
    ready: [...b.readyUnits],
    training: b.trainQueue[0] || null,
  };
}

export function countVtcNavalDeployHexes(state, player, buildingId, unitType) {
  return enumerateVtcDeployHexes(state, player, buildingId, unitType).length;
}

export function canQueueVtcRecruit(state, player, unitType, buildingId) {
  const opts = getRecruitOptionsForVTC(state, player, buildingId);
  if (!opts.includes(unitType)) return { ok: false, reason: 'Requires facility upgrade at this VTC' };
  const b = state.buildings.find(x => x.id === buildingId);
  if (!b) return { ok: false, reason: 'Invalid VTC' };
  ensureVtcProductionFields(b);
  const maxQueue = getMaxVtcQueueDepth(state, player, b);
  if (b.trainQueue.length >= maxQueue) {
    return { ok: false, reason: `Queue full (${maxQueue})` };
  }
  const pipelineGate = canAffordPipelinePop(state, player, unitType);
  if (!pipelineGate.ok) return pipelineGate;
  if (NAVAL_UNITS.has(unitType)) {
    const readyNaval = (b.readyUnits || []).filter((r) => NAVAL_UNITS.has(r.type));
    if (readyNaval.some((r) => countVtcNavalDeployHexes(state, player, buildingId, r.type) === 0)) {
      return { ok: false, reason: 'Deploy ready ships first (no water hex)' };
    }
    if (readyNaval.length > 0 && countVtcNavalDeployHexes(state, player, buildingId, unitType) === 0) {
      return { ok: false, reason: 'No coastal deploy hex at this VTC' };
    }
    const pipeline = (b.trainQueue?.length || 0) + readyNaval.length;
    if (pipeline >= 2 && countVtcNavalDeployHexes(state, player, buildingId, unitType) === 0) {
      return { ok: false, reason: 'No coastal deploy hex at this VTC' };
    }
  }
  const def = UNIT_TYPES[unitType];
  if (!def) return { ok: false, reason: 'Unknown unit' };
  const pl = state.players[player];
  if ((pl.iron || 0) < (def.cost.iron || 0)) return { ok: false, reason: 'Not enough iron' };
  if ((pl.oil || 0) < (def.cost.oil || 0)) return { ok: false, reason: 'Not enough oil' };
  if ((pl.components || 0) < (def.cost.components || 0)) return { ok: false, reason: 'Not enough components' };
  const foodCost = getRecruitFoodCost(unitType);
  if ((pl.food || 0) < foodCost) return { ok: false, reason: 'Not enough food' };
  return canAffordPipelinePop(state, player, unitType);
}

export function canQueueGlobalRecruit(state, player, unitType, buildingId) {
  return canQueueVtcRecruit(state, player, unitType, buildingId);
}

export function queueVtcRecruit(state, player, unitType, buildingId) {
  const check = canQueueVtcRecruit(state, player, unitType, buildingId);
  if (!check.ok) return check;
  const def = UNIT_TYPES[unitType];
  const pl = state.players[player];
  const b = state.buildings.find(x => x.id === buildingId);
  pl.iron -= (def.cost.iron || 0);
  pl.oil -= (def.cost.oil || 0);
  pl.components = (pl.components || 0) - (def.cost.components || 0);
  pl.food = (pl.food || 0) - getRecruitFoodCost(unitType);
  ensureVtcProductionFields(b);
  b.trainQueue.push({
    id: _nextTrainId++,
    type: unitType,
    turnsLeft: def.buildTime ?? 1,
  });
  recalcPlayerPopulation(state, player);
  return { ok: true };
}

export function queueGlobalRecruit(state, player, unitType, buildingId) {
  return queueVtcRecruit(state, player, unitType, buildingId);
}

export function cancelVtcQueueHead(state, player, buildingId) {
  const b = state.buildings.find(x => x.id === buildingId && Number(x.owner) === Number(player));
  if (!b?.trainQueue?.length) return { ok: false, reason: 'Queue empty' };
  const head = b.trainQueue.shift();
  recalcPlayerPopulation(state, player);
  return { ok: true, type: head.type };
}

/** Drop a waiting (non-training) queue entry — frees a recruit slot without stopping the active head. */
export function popVtcTrainQueueTail(state, player, buildingId) {
  const b = state.buildings.find(x => x.id === buildingId && Number(x.owner) === Number(player));
  if (!b?.trainQueue?.length) return { ok: false, reason: 'Queue empty' };
  ensureVtcProductionFields(b);
  if (b.trainQueue.length <= 1) return { ok: false, reason: 'Only training head' };
  const tail = b.trainQueue.pop();
  recalcPlayerPopulation(state, player);
  return { ok: true, type: tail.type };
}

function releaseUndersizedArmyQueueSlots(state, player, events = []) {
  const p = Number(player);
  const pop = getPopBreakdown(state, p);
  const fieldedTarget = Math.max(6, Math.floor(pop.cap * 0.35));
  if (calcPopFieldedByPlayer(state, p) >= fieldedTarget || pop.avail < 2) return 0;

  const capital = getPlayerCapital(state, p);
  const anchors = (state.buildings || []).filter((b) =>
    Number(b.owner) === p && PRODUCTION_VTC_TYPES.has(b.type) && !b.underConstruction);
  const sorted = [...anchors].sort((a, b) => {
    const aCap = isPlayerCapitalBuilding(a) ? 0 : 1;
    const bCap = isPlayerCapitalBuilding(b) ? 1 : 0;
    if (aCap !== bCap) return bCap - aCap;
    const da = capital ? hexDistance(a.q, a.r, capital.q, capital.r) : 0;
    const db = capital ? hexDistance(b.q, b.r, capital.q, capital.r) : 0;
    return db - da;
  });

  const hasOpenSlot = () => anchors.some((b) =>
    (b.trainQueue?.length || 0) < getMaxVtcQueueDepth(state, p, b));

  let released = 0;
  while (!hasOpenSlot()) {
    let cleared = false;
    for (const b of sorted) {
      ensureVtcProductionFields(b);
      if (b.trainQueue.length <= 1) continue;
      const tail = b.trainQueue.pop();
      released += 1;
      cleared = true;
      events.push(`P${p} cleared waiting ${UNIT_TYPES[tail.type]?.name || tail.type} at ${b.type} (${b.q},${b.r})`);
      break;
    }
    if (!cleared) break;
  }
  if (released > 0) recalcPlayerPopulation(state, p);
  return released;
}

function canSpawnUnitAtHex(state, player, unitType, q, r, anchorQ, anchorR) {
  const mapSize = state._mapSize || 25;
  const terrain = state._terrain;
  const isValid = (x, y) => x >= 0 && y >= 0 && x < mapSize && y < mapSize;
  if (!isValid(q, r)) return false;
  const unitsHere = state.units.filter(u => !u.dead && u.q === q && u.r === r);
  if (Number(player) !== null && unitsHere.some(u => Number(u.owner) !== Number(player))) return false;
  const isOrigin = (q === anchorQ && r === anchorR);
  if (isOrigin) {
    if (unitsHere.some(u => u.type !== 'ENGINEER' && !AIR_UNITS.has(u.type))) return false;
  } else if (unitsHere.length > 0) return false;
  const bld = buildingAt(state, q, r);
  if (bld && !ROAD_TYPES.has(bld.type) && !(q === anchorQ && r === anchorR)) return false;
  if (unitType && terrain) {
    const ttype = terrain[`${q},${r}`] ?? 0;
    if (!canEnterTerrain(unitType, ttype)) return false;
  }
  return true;
}

export function enumerateVtcDeployHexes(state, player, buildingId, unitType) {
  const b = state.buildings.find(x => x.id === buildingId && Number(x.owner) === Number(player) && !x.underConstruction);
  if (!b) return [];
  const out = [];
  const seen = new Set();
  const isNaval = NAVAL_UNITS.has(unitType);
  const mapSize = state._mapSize || 25;
  const terrain = state._terrain;

  if (isNaval) {
    const radius = getNavalCoastalCheckRadius(b);
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const q = b.q + dq, r = b.r + dr;
        if (q < 0 || r < 0 || q >= mapSize || r >= mapSize) continue;
        if (hexDistance(b.q, b.r, q, r) > radius) continue;
        const t = terrain?.[`${q},${r}`] ?? 0;
        if (t !== 4 && t !== 5) continue;
        const k = `${q},${r}`;
        if (seen.has(k)) continue;
        if (!canSpawnUnitAtHex(state, player, unitType, q, r, b.q, b.r)) continue;
        seen.add(k);
        out.push({ q, r, buildingId: b.id });
      }
    }
    return out;
  }

  const candidates = b.type === 'HQ'
    ? HEX_NEIGHBORS.map(([dq, dr]) => ({ q: b.q + dq, r: b.r + dr }))
    : [{ q: b.q, r: b.r }, ...HEX_NEIGHBORS.map(([dq, dr]) => ({ q: b.q + dq, r: b.r + dr }))];
  for (const { q, r } of candidates) {
    const k = `${q},${r}`;
    if (seen.has(k)) continue;
    if (!canSpawnUnitAtHex(state, player, unitType, q, r, b.q, b.r)) continue;
    seen.add(k);
    out.push({ q, r, buildingId: b.id });
  }
  return out;
}

export function enumerateGlobalDeployHexes(state, player, unitType, sourceBuildingId = null) {
  if (sourceBuildingId != null) {
    return enumerateVtcDeployHexes(state, player, sourceBuildingId, unitType);
  }
  const out = [];
  const seen = new Set();
  for (const b of state.buildings) {
    if (!PRODUCTION_VTC_TYPES.has(b.type) || Number(b.owner) !== Number(player) || b.underConstruction) continue;
    for (const site of enumerateVtcDeployHexes(state, player, b.id, unitType)) {
      const k = `${site.q},${site.r}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(site);
    }
  }
  return out;
}

export function deployReadyVtcUnitAtHex(state, player, buildingId, readyId, q, r) {
  const b = state.buildings.find(x => x.id === buildingId && Number(x.owner) === Number(player));
  if (!b) return { ok: false, reason: 'Invalid VTC' };
  ensureVtcProductionFields(b);
  const idx = b.readyUnits.findIndex(r => r.id === readyId);
  if (idx < 0) return { ok: false, reason: 'No ready unit here' };
  const ready = b.readyUnits[idx];
  const sites = enumerateVtcDeployHexes(state, player, buildingId, ready.type);
  if (!sites.some(s => s.q === q && s.r === r)) return { ok: false, reason: 'Cannot deploy here' };
  state.units.push(createUnit(ready.type, player, q, r));
  b.readyUnits.splice(idx, 1);
  recalcPlayerPopulation(state, player);
  return { ok: true };
}

export function deployReadyGlobalRecruitAtHex(state, player, readyId, q, r) {
  for (const b of state.buildings) {
    if (Number(b.owner) !== Number(player)) continue;
    ensureVtcProductionFields(b);
    if (b.readyUnits?.some(ru => ru.id === readyId)) {
      return deployReadyVtcUnitAtHex(state, player, b.id, readyId, q, r);
    }
  }
  return { ok: false, reason: 'No ready unit' };
}

export function tickVtcProduction(state, player, events = []) {
  for (const b of state.buildings) {
    if (Number(b.owner) !== Number(player) || !PRODUCTION_VTC_TYPES.has(b.type)) continue;
    ensureVtcProductionFields(b);
    if (!b.trainQueue.length) continue;
    const head = b.trainQueue[0];
    head.turnsLeft = Math.max(0, (head.turnsLeft ?? 1) - 1);
    if (head.turnsLeft <= 0) {
      const unitType = head.type;
      const sites = enumerateVtcDeployHexes(state, player, b.id, unitType);
      if (sites.length) {
        const site = sites[0];
        state.units.push(createUnit(unitType, player, site.q, site.r));
        b.trainQueue.shift();
        events.push(`P${player} ${UNIT_TYPES[unitType]?.name || unitType} deployed from ${b.type} (${site.q},${site.r})`);
        recalcPlayerPopulation(state, player);
      } else {
        b.readyUnits.push({ id: head.id, type: unitType });
        b.trainQueue.shift();
        events.push(`P${player} ${UNIT_TYPES[unitType]?.name || unitType} ready at ${b.type} (${b.q},${b.r}) — deploy needed`);
      }
    }
  }
}

function deployAllVtcReady(state, player, events, label = 'deployed') {
  let deployed = 0;
  for (const b of state.buildings) {
    if (Number(b.owner) !== Number(player) || !PRODUCTION_VTC_TYPES.has(b.type) || b.underConstruction) continue;
    ensureVtcProductionFields(b);
    const readyCopy = [...(b.readyUnits || [])];
    for (const ready of readyCopy) {
      const sites = enumerateVtcDeployHexes(state, player, b.id, ready.type);
      if (!sites.length) continue;
      const site = sites[0];
      const out = deployReadyVtcUnitAtHex(state, player, b.id, ready.id, site.q, site.r);
      if (out.ok) {
        deployed += 1;
        events.push(`P${player} ${label} ${UNIT_TYPES[ready.type]?.name || ready.type} from VTC (${b.q},${b.r})`);
      }
    }
  }
  return deployed;
}

/** When the map army is gone, spawn ready VTC units instead of leaving them stranded in the bay. */
export function forceDeployStrandedVtcReady(state, player, events = []) {
  if (calcPopFieldedByPlayer(state, player) > 0) return 0;
  return deployAllVtcReady(state, player, events, 'deployed');
}

function resolveVtcBuilding(state, buildingOrId) {
  if (buildingOrId == null) return null;
  if (typeof buildingOrId === 'object' && buildingOrId.id != null) return buildingOrId;
  return state.buildings?.find((x) => x.id === buildingOrId) ?? null;
}

/** Per-VTC train queue cap (only the head reserves manpower until it trains). */
export function getMaxVtcQueueDepth(state, player, buildingOrId = null) {
  const b = resolveVtcBuilding(state, buildingOrId);
  if (!b) return MAX_VTC_TRAIN_QUEUE;
  if (b.type === 'CITY' || isPlayerCapitalBuilding(b)) return MAX_VTC_TRAIN_QUEUE;
  if (b.type === 'TOWN') return Math.min(3, MAX_VTC_TRAIN_QUEUE);
  return Math.min(2, MAX_VTC_TRAIN_QUEUE);
}

/** True if any owned VTC can accept another train-queue entry (read-only). */
export function hasOpenVtcRecruitSlot(state, player) {
  const p = Number(player);
  return (state.buildings || []).some((b) =>
    Number(b.owner) === p && PRODUCTION_VTC_TYPES.has(b.type) && !b.underConstruction
    && (b.trainQueue?.length || 0) < getMaxVtcQueueDepth(state, p, b));
}

/** Deploy ready bays and free one train slot when every VTC queue is full but the army is still tiny. */
export function ensureVtcRecruitCapacity(state, player, events = []) {
  const p = Number(player);
  const pop = getPopBreakdown(state, p);
  const fieldedTarget = Math.max(6, Math.floor(pop.cap * 0.35));
  if (calcPopFieldedByPlayer(state, p) >= fieldedTarget) {
    return { deployed: 0, freed: 0 };
  }

  tickVtcProduction(state, p, events);
  let deployed = deployAllVtcReady(state, p, events, 'unstick-deploy');
  recalcPlayerPopulation(state, p);
  const waitingCleared = releaseUndersizedArmyQueueSlots(state, p, events);

  const anchors = (state.buildings || []).filter((b) =>
    Number(b.owner) === p && PRODUCTION_VTC_TYPES.has(b.type) && !b.underConstruction);
  const hasOpenSlot = () => anchors.some((b) =>
    (b.trainQueue?.length || 0) < getMaxVtcQueueDepth(state, p, b));
  if (hasOpenSlot()) return { deployed, freed: waitingCleared };

  const capital = getPlayerCapital(state, p);
  const sorted = [...anchors].sort((a, b) => {
    const aCap = isPlayerCapitalBuilding(a) ? 1 : 0;
    const bCap = isPlayerCapitalBuilding(b) ? 1 : 0;
    if (aCap !== bCap) return aCap - bCap;
    const da = capital ? hexDistance(a.q, a.r, capital.q, capital.r) : 0;
    const db = capital ? hexDistance(b.q, b.r, capital.q, capital.r) : 0;
    return db - da;
  });

  let freed = 0;
  for (const b of sorted) {
    if (hasOpenSlot()) break;
    ensureVtcProductionFields(b);
    if (!b.trainQueue?.length) continue;
    const out = cancelVtcQueueHead(state, p, b.id);
    if (out.ok) {
      freed += 1;
      events.push(`P${p} cleared stuck ${UNIT_TYPES[out.type]?.name || out.type} queue at ${b.type} to free recruit slot`);
    }
  }
  if (freed > 0) recalcPlayerPopulation(state, p);
  return { deployed, freed: freed + waitingCleared };
}

/** Trim queue tails that exceed each VTC's allowed depth (waiting slots do not reserve manpower). */
export function clearVtcQueueTailForIdlePop(state, player, events = []) {
  return pruneVtcQueueBacklog(state, player, events);
}

/** Drop train-queue slots beyond each VTC's tier cap. */
export function pruneVtcQueueBacklog(state, player, events = []) {
  const p = Number(player);
  let pruned = 0;
  for (const b of state.buildings || []) {
    if (Number(b.owner) !== p || !PRODUCTION_VTC_TYPES.has(b.type) || b.underConstruction) continue;
    ensureVtcProductionFields(b);
    const maxDepth = getMaxVtcQueueDepth(state, p, b);
    while (b.trainQueue.length > maxDepth) {
      b.trainQueue.pop();
      pruned += 1;
    }
  }
  if (pruned > 0) {
    recalcPlayerPopulation(state, player);
    events.push(`P${p} cleared ${pruned} backlog recruit slot(s)`);
  }
  return pruned;
}

/** End-of-turn: deploy ready bays, prune over-deep queues, sync manpower. */
export function rebalanceVtcPopulationPipeline(state, player, events = []) {
  recalcPlayerPopulation(state, player);
  pruneVtcQueueBacklog(state, player, events);
  const deployed = deployAllVtcReady(state, player, events, 'auto-deployed');
  recalcPlayerPopulation(state, player);
  return deployed;
}

/** Legacy production structures — hidden on map; facilities live on VTC upgrades. */
export const LEGACY_PRODUCTION_MAP_HIDDEN = new Set([
  'BARRACKS', 'ADV_BARRACKS', 'VEHICLE_DEPOT', 'ARMOR_WORKS', 'SCIENCE_LAB', 'FACTORY',
  'AIRFIELD', 'ADV_AIRFIELD', 'HARBOR', 'NAVAL_YARD', 'SHIPYARD', 'DRY_DOCK', 'DRYDOCK',
  'NAVAL_BASE', 'NAVAL_DOCKYARD',
]);

export function countPlayerVtcUpgrade(gs, player, upgradeId) {
  return (gs.buildings || []).filter((b) =>
    Number(b.owner) === Number(player)
    && PRODUCTION_VTC_TYPES.has(b.type)
    && !b.underConstruction
    && isVtcUpgradeComplete(b, upgradeId),
  ).length;
}

export function countPlayerScienceLabs(gs, player) {
  const legacy = (gs.buildings || []).filter((b) =>
    b.owner === player && b.type === 'SCIENCE_LAB' && !b.underConstruction,
  ).length;
  return legacy + countPlayerVtcUpgrade(gs, player, 'science_lab');
}

export function countPlayerFactories(gs, player) {
  const legacy = (gs.buildings || []).filter((b) =>
    b.owner === player && b.type === 'FACTORY' && !b.underConstruction,
  ).length;
  return legacy + countPlayerVtcUpgrade(gs, player, 'factory');
}

export function countPlayerBarracksFacilities(gs, player) {
  const legacy = (gs.buildings || []).filter((b) =>
    b.owner === player && (b.type === 'BARRACKS' || b.type === 'ADV_BARRACKS') && !b.underConstruction,
  ).length;
  return legacy + countPlayerVtcUpgrade(gs, player, 'barracks');
}

/** Short map badges on settlement counters. */
export function getVtcFacilityBadgeGlyphs(building) {
  if (!building) return [];
  const g = [];
  if (isPlayerCapitalBuilding(building)) g.push('★');
  if (isVtcUpgradeComplete(building, 'barracks')) g.push('Ba');
  if (isVtcUpgradeComplete(building, 'factory')) g.push('Fc');
  if (isVtcUpgradeComplete(building, 'science_lab')) g.push('Lb');
  if (isVtcUpgradeComplete(building, 'naval_yard')) g.push('Ny');
  if (isVtcUpgradeComplete(building, 'local_farm')) g.push('Fm');
  if (isVtcUpgradeComplete(building, 'housing')) g.push('Ho');
  if (isVtcUpgradeComplete(building, 'suburbs')) g.push('Sb');
  if (isVtcUpgradeComplete(building, 'urban_housing')) g.push('Uh');
  return g;
}

/** Facility labels for UI chips. */
export function getVtcFacilityChips(building) {
  if (!building) return [];
  const chips = [];
  if (isPlayerCapitalBuilding(building)) chips.push('Capital');
  if (isVtcUpgradeComplete(building, 'barracks')) chips.push('Barracks');
  if (isVtcUpgradeComplete(building, 'local_farm')) chips.push('Farm');
  if (isVtcUpgradeComplete(building, 'factory')) chips.push('Factory');
  if (isVtcUpgradeComplete(building, 'science_lab')) chips.push('Lab');
  if (isVtcUpgradeComplete(building, 'naval_yard')) chips.push('Naval');
  if (isVtcUpgradeComplete(building, 'housing')) chips.push('Housing');
  if (isVtcUpgradeComplete(building, 'suburbs')) chips.push('Suburbs');
  if (isVtcUpgradeComplete(building, 'urban_housing')) chips.push('Urban housing');
  if (isVtcUpgradeComplete(building, 'road_link')) chips.push('Road link');
  if (isVtcUpgradeComplete(building, 'paved_network')) chips.push('Paved roads');
  return chips;
}

/** Inspector lines for a VTC (fog-aware). */
export function getVtcInspectorLines(gs, viewerPlayer, building, fogVisibleHexes = null) {
  if (!building || !PRODUCTION_VTC_TYPES.has(building.type)) return [];
  const hexKey = `${building.q},${building.r}`;
  const unexplored = fogVisibleHexes && fogVisibleHexes.size > 0 && !fogVisibleHexes.has(hexKey);
  const isOwn = Number(building.owner) === Number(viewerPlayer);
  const lines = [];

  if (unexplored && !isOwn) {
    lines.push('Intel: area not scouted');
    return lines;
  }

  const chips = getVtcFacilityChips(building);
  if (chips.length) lines.push(`Facilities: ${chips.join(' · ')}`);
  else if (isOwn) lines.push('Facilities: none yet (UPGRADE tab)');
  else lines.push('Facilities: none visible');

  if (isOwn) {
    const vs = getVtcQueueSummary(gs, building.owner, building.id);
    if (vs.training) {
      lines.push(`Training: ${UNIT_TYPES[vs.training.type]?.name || vs.training.type} (${vs.training.turnsLeft ?? 0}t)`);
    } else if (!(building.trainQueue?.length)) {
      lines.push('Training: idle');
    }
    if (vs.pending.length > 1) lines.push(`Queue: ${vs.pending.length - 1} waiting`);
    if (vs.ready.length) lines.push(`Ready to deploy: ${vs.ready.length}`);
    const up = building.vtcUpgrades || {};
    const pendingUp = Object.entries(up).filter(([, v]) => v && !v.complete);
    if (pendingUp.length) {
      lines.push(`Upgrading: ${pendingUp.map(([id]) => id.replace(/_/g, ' ')).join(', ')}`);
    }
  } else {
    lines.push('Production: unknown (enemy)');
    const cp = building.captureProgress;
    if (cp?.player != null && cp.required) {
      lines.push(`Capture: P${cp.player} ${cp.turns || 0}/${cp.required}`);
    }
  }

  if (isOwn && building.captureProgress?.player != null) {
    const cp = building.captureProgress;
    if (Number(cp.player) !== Number(viewerPlayer)) {
      lines.push(`⚠ Being captured: P${cp.player} ${cp.turns || 0}/${cp.required}`);
    }
  }

  const rad = VTC_SUPPLY_RADIUS?.[building.type];
  if (rad && isOwn) lines.push(`Supply bubble: ${rad} hexes`);
  return lines;
}
