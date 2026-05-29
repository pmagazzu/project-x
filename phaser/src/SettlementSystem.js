/**
 * Settlement UI helpers: produce catalog with disabled reasons, improvement checklist display.
 */
import {
  hexDistance, roadAt, findRoadPath, ROAD_TYPES,
  getPlayerCapital, isPlayerCapitalBuilding,
  getGlobalRecruitOptionsForVTC, canQueueGlobalRecruit,
  getBuildingTierForDeploy, isNavalDeployAllowed, getNavalCoastalCheckRadius,
  isNavalAllowedAtVTCTier, UNIT_TYPES, NAVAL_UNITS, LOCKED_CHASSIS,
  PRODUCTION_VTC_TYPES, CITY_YARD_NAVAL_UNITS,
  hasNavalYardNearSettlement, playerHasCityWithNavalYard,
  canPromoteSettlement, SETTLEMENT_PROMOTE,
} from './GameState.js';

export { CITY_YARD_NAVAL_UNITS, canPromoteSettlement };

const SETTLEMENT_TYPES = new Set(['VILLAGE', 'TOWN', 'CITY']);

const ECON_BUILDINGS = new Set(['MINE', 'OIL_PUMP', 'FARM', 'LUMBER_CAMP', 'MARKET']);
const MIL_BUILDINGS = new Set(['BARRACKS', 'SUPPLY_DEPOT', 'SUPPLY_WAREHOUSE', 'SCIENCE_LAB', 'FACTORY']);

export const SETTLEMENT_UPGRADE_DEFS = {
  VILLAGE: {
    next: 'TOWN',
    promoteTurns: SETTLEMENT_PROMOTE.VILLAGE.promoteTurns,
    cost: SETTLEMENT_PROMOTE.VILLAGE.cost,
    minScore: SETTLEMENT_PROMOTE.VILLAGE.minScore,
    checks: [
      { id: 'road_capital', label: 'Road path to capital', fn: 'roadToCapital' },
      { id: 'economy', label: 'Farm, lumber, mine, or pump nearby', fn: 'economyNear' },
      { id: 'barracks', label: 'Barracks or supply depot nearby', fn: 'militaryNear' },
      { id: 'housing', label: 'Housing near settlement', fn: 'housingNear' },
    ],
  },
  TOWN: {
    next: 'CITY',
    promoteTurns: SETTLEMENT_PROMOTE.TOWN.promoteTurns,
    cost: SETTLEMENT_PROMOTE.TOWN.cost,
    minScore: SETTLEMENT_PROMOTE.TOWN.minScore,
    checks: [
      { id: 'road_capital', label: 'Road path to capital', fn: 'roadToCapital' },
      { id: 'factory_lab', label: 'Factory or science lab nearby', fn: 'industryNear' },
      { id: 'concrete', label: 'Gravel/concrete/rail road on network', fn: 'upgradedRoad' },
      { id: 'fort', label: 'Fortification nearby', fn: 'fortNear' },
      { id: 'naval_yard', label: 'Naval yard (coastal maps)', fn: 'navalYardNear', optionalCoastal: true },
    ],
  },
};

function buildingsNear(gs, vtc, player, radius, typeSet) {
  let n = 0;
  for (const b of gs.buildings || []) {
    if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
    if (!typeSet.has(b.type)) continue;
    if (hexDistance(b.q, b.r, vtc.q, vtc.r) <= radius) n++;
  }
  return n;
}

function hasRoadPathToCapital(gs, vtc, player) {
  const cap = getPlayerCapital(gs, player);
  if (!cap) return false;
  const mapSize = gs._mapSize || 40;
  const terrain = gs._terrain || {};
  if (roadAt(gs, vtc.q, vtc.r) && roadAt(gs, cap.q, cap.r)) {
    const path = findRoadPath(terrain, mapSize, cap.q, cap.r, vtc.q, vtc.r);
    if (path?.length) return true;
  }
  for (const b of gs.buildings || []) {
    if (Number(b.owner) !== Number(player) || !ROAD_TYPES.has(b.type)) continue;
    if (hexDistance(b.q, b.r, vtc.q, vtc.r) > 2) continue;
    const path = findRoadPath(terrain, mapSize, cap.q, cap.r, b.q, b.r);
    if (path?.length) return true;
  }
  return false;
}

function runImprovementCheck(gs, player, vtc, check) {
  const r = 4;
  switch (check.fn) {
    case 'roadToCapital':
      return hasRoadPathToCapital(gs, vtc, player);
    case 'economyNear':
      return buildingsNear(gs, vtc, player, r, ECON_BUILDINGS) >= 1;
    case 'militaryNear':
      return buildingsNear(gs, vtc, player, r, MIL_BUILDINGS) >= 1;
    case 'housingNear':
      return buildingsNear(gs, vtc, player, r, new Set([
        'HOUSING_SLUMS', 'HOUSING_RURAL', 'HOUSING_SUBURB', 'HOUSING_DISTRICT', 'HOUSING_BOROUGH', 'HOUSING_METRO',
      ])) >= 1;
    case 'industryNear':
      return buildingsNear(gs, vtc, player, r, new Set(['FACTORY', 'SCIENCE_LAB', 'VEHICLE_DEPOT', 'ARMOR_WORKS'])) >= 1;
    case 'upgradedRoad': {
      for (const b of gs.buildings || []) {
        if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
        if (!ROAD_TYPES.has(b.type)) continue;
        if (hexDistance(b.q, b.r, vtc.q, vtc.r) > 6) continue;
        const tier = b.roadTier ?? (b.type === 'RAILWAY' ? 3 : b.type === 'CONCRETE_ROAD' ? 2 : b.type === 'GRAVEL_ROAD' ? 1 : 0);
        if (tier >= 1) return true;
      }
      return false;
    }
    case 'fortNear':
      return buildingsNear(gs, vtc, player, 5, new Set([
        'FORT_T0', 'FORT_T1', 'FORT_T2', 'FORT_T3', 'FORT_T4', 'FORT_T5',
        'BUNKER', 'COASTAL_BATTERY', 'AA_EMPLACEMENT', 'OBS_POST',
      ])) >= 1;
    case 'navalYardNear': {
      if (check.optionalCoastal && !isNavalDeployAllowed(gs, vtc, getNavalCoastalCheckRadius(vtc))) return true;
      return hasNavalYardNearSettlement(gs, player, vtc, 5);
    }
    default:
      return false;
  }
}

export function getSettlementImprovementStatus(gs, player, buildingId) {
  const b = gs.buildings?.find(x => x.id === buildingId && Number(x.owner) === Number(player));
  if (!b || !SETTLEMENT_TYPES.has(b.type)) return null;
  const def = SETTLEMENT_UPGRADE_DEFS[b.type];
  if (!def) return { complete: true, score: 0, required: 0, items: [] };
  const items = def.checks.map((c) => ({
    id: c.id,
    label: c.label,
    done: runImprovementCheck(gs, player, b, c),
    weight: 1,
  }));
  const score = items.reduce((s, it) => s + (it.done ? 1 : 0), 0);
  return {
    score,
    required: def.minScore,
    complete: score >= def.minScore,
    items,
    promoteTurns: def.promoteTurns,
    next: def.next,
    cost: def.cost,
    promoting: (b.promoteTurnsLeft || 0) > 0,
    promoteTurnsLeft: b.promoteTurnsLeft || 0,
  };
}

/** Why a unit appears enabled/disabled in the PRODUCE tab at this anchor VTC. */
export function getProduceQueueStatus(gs, player, anchorId, unitType) {
  const anchor = gs.buildings?.find(x => x.id === anchorId && Number(x.owner) === Number(player));
  if (!anchor || !PRODUCTION_VTC_TYPES.has(anchor.type)) {
    return { ok: false, reason: 'Invalid production site' };
  }
  if (!UNIT_TYPES[unitType]) return { ok: false, reason: 'Unknown unit' };

  if (CITY_YARD_NAVAL_UNITS.includes(unitType)) {
    if (anchor.type !== 'CITY') {
      return { ok: false, reason: 'Need a City with a Naval Yard to build this' };
    }
    if (!hasNavalYardNearSettlement(gs, player, anchor, 5)) {
      return { ok: false, reason: 'Need a Naval Yard next to this City' };
    }
    const coastalR = getNavalCoastalCheckRadius(anchor);
    if (!isNavalDeployAllowed(gs, anchor, coastalR)) {
      return { ok: false, reason: 'Coastal access required' };
    }
    if (LOCKED_CHASSIS.has(unitType)) {
      const unlocked = new Set(gs.players[player]?.research?.unlocked || []);
      const techMap = { DESTROYER_MK1: 'destroyer_mk1' };
      const tid = techMap[unitType];
      if (tid && !unlocked.has(tid)) return { ok: false, reason: 'Requires research unlock' };
    }
    const opts = getGlobalRecruitOptionsForVTC(gs, player, anchorId);
    if (!opts.includes(unitType)) return { ok: false, reason: 'Not available at this City' };
    return canQueueGlobalRecruit(gs, player, unitType, anchorId);
  }

  const opts = getGlobalRecruitOptionsForVTC(gs, player, anchorId);
  if (!opts.includes(unitType)) {
    if (NAVAL_UNITS.has(unitType)) {
      const tier = getBuildingTierForDeploy(anchor);
      if (!isNavalDeployAllowed(gs, anchor, getNavalCoastalCheckRadius(anchor))) {
        return { ok: false, reason: 'Coastal access required' };
      }
      if (!isNavalAllowedAtVTCTier(tier, unitType)) {
        if (unitType === 'SUPPLY_SHIP' && tier < 1) {
          return { ok: false, reason: 'Supply ships need Town or City (promote settlement)' };
        }
        return { ok: false, reason: tier < 1 ? 'Requires Town or City' : 'Requires City for this hull' };
      }
    }
    if (unitType === 'TANK' || unitType === 'ARTILLERY') {
      return { ok: false, reason: 'Requires Town or City' };
    }
    const def = UNIT_TYPES[unitType];
    if (def.unlockedBy && !(gs.players[player]?.research?.unlocked || []).includes(def.unlockedBy)) {
      return { ok: false, reason: 'Requires research' };
    }
    return { ok: false, reason: 'Not available at this settlement' };
  }
  return canQueueGlobalRecruit(gs, player, unitType, anchorId);
}

/** Full PRODUCE list: queueable + greyed yard hulls and locked naval. */
export function getProduceCatalog(gs, player, anchorId) {
  const fromOpts = new Set(getGlobalRecruitOptionsForVTC(gs, player, anchorId));
  for (const u of CITY_YARD_NAVAL_UNITS) fromOpts.add(u);
  const order = [
    'INFANTRY', 'RECON', 'ENGINEER', 'ANTI_TANK', 'MORTAR', 'MEDIC', 'SUPPLY_TRUCK',
    'TANK', 'ARTILLERY', 'BIPLANE_FIGHTER', 'LIGHT_BOMBER', 'OBS_PLANE',
    'PATROL_BOAT', 'LANDING_CRAFT', 'MTB', 'TORPEDO_BOAT', 'MOTOR_GUNBOAT', 'SUPPLY_SHIP',
    'TRANSPORT_SM', 'TRANSPORT_MD', 'DESTROYER', 'SUBMARINE',
    'DESTROYER_MK1', 'CRUISER_LT', 'CRUISER_HV', 'BATTLESHIP',
  ];
  return [...fromOpts].sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  }).map((unitType) => {
    const st = getProduceQueueStatus(gs, player, anchorId, unitType);
    return { unitType, canQueue: st.ok === true, reason: st.reason || '' };
  });
}
