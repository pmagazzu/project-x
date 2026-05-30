/**
 * Settlement (VTC) growth — all upgrades purchased in the build menu UPGRADE tab.
 * Engineers build roads, defenses, and field extractors only.
 */
import {
  hexDistance, ROAD_TYPES,
  getPlayerCapital, isPlayerCapitalBuilding,
  canQueueGlobalRecruit,
  getBuildingTierForDeploy, isNavalDeployAllowed, getNavalCoastalCheckRadius,
  isNavalAllowedAtVTCTier, UNIT_TYPES, NAVAL_UNITS, LOCKED_CHASSIS,
  PRODUCTION_VTC_TYPES, CITY_YARD_NAVAL_UNITS,
} from './GameState.js';
import { getRecruitOptionsForVTC } from './VtcProduction.js';

export { CITY_YARD_NAVAL_UNITS };

export const SETTLEMENT_PROMOTE = {
  VILLAGE: { next: 'TOWN', promoteTurns: 2, cost: { iron: 32, wood: 22, oil: 6, components: 1 } },
  TOWN:    { next: 'CITY', promoteTurns: 3, cost: { iron: 58, wood: 38, oil: 14, components: 6 } },
};

const SETTLEMENT_TYPES = new Set(['VILLAGE', 'TOWN', 'CITY']);

/** Purchasable upgrades at a VTC (build menu → UPGRADE tab). */
export const VTC_MENU_UPGRADES = {
  road_link: {
    id: 'road_link',
    label: 'Capital Road Link',
    short: 'Road link',
    cost: { iron: 6, wood: 8 },
    buildTurns: 1,
    forSettlement: 'VILLAGE',
  },
  local_farm: {
    id: 'local_farm',
    label: 'Local Farm',
    short: 'Farm',
    cost: { iron: 2, wood: 4 },
    buildTurns: 2,
    forSettlement: 'VILLAGE',
    foodPerTurn: 2,
  },
  barracks: {
    id: 'barracks',
    label: 'Training Barracks',
    short: 'Barracks',
    cost: { iron: 4, wood: 4 },
    buildTurns: 2,
    forSettlement: 'VILLAGE',
  },
  housing: {
    id: 'housing',
    label: 'Housing District',
    short: 'Housing',
    cost: { iron: 4, wood: 5 },
    buildTurns: 2,
    forSettlement: 'VILLAGE',
    popCapBonus: 2,
  },
  factory: {
    id: 'factory',
    label: 'Factory',
    short: 'Factory',
    cost: { iron: 10, oil: 3, wood: 8 },
    buildTurns: 3,
    forSettlement: 'TOWN',
    componentsPerTurn: 1,
  },
  science_lab: {
    id: 'science_lab',
    label: 'Science Lab',
    short: 'Lab',
    cost: { iron: 6, wood: 4 },
    buildTurns: 2,
    forSettlement: 'TOWN',
    rpPerTurn: 1,
  },
  paved_network: {
    id: 'paved_network',
    label: 'Paved Road Network',
    short: 'Paved roads',
    cost: { iron: 8, wood: 4 },
    buildTurns: 1,
    forSettlement: 'TOWN',
    requiresResearch: 'gravel_roads',
  },
  market: {
    id: 'market',
    label: 'Market',
    short: 'Market',
    cost: { iron: 3, wood: 4 },
    buildTurns: 2,
    forSettlement: 'TOWN',
    goldPerTurn: 1,
  },
  naval_yard: {
    id: 'naval_yard',
    label: 'Naval Yard',
    short: 'Naval yard',
    cost: { iron: 8, oil: 2 },
    buildTurns: 3,
    forSettlement: 'TOWN',
    coastalOnly: true,
  },
};

/** All required before promoting to next tier. */
export const VTC_PROMOTE_REQUIRED = {
  VILLAGE: ['road_link', 'local_farm', 'barracks', 'housing'],
  TOWN: ['factory', 'science_lab', 'paved_network', 'market'],
};

const FORT_TYPES = new Set([
  'FORT_T0', 'FORT_T1', 'FORT_T2', 'FORT_T3', 'FORT_T4', 'FORT_T5',
  'BUNKER', 'COASTAL_BATTERY', 'AA_EMPLACEMENT', 'OBS_POST',
]);

function getVtc(gs, player, buildingId) {
  return gs.buildings?.find(x => x.id === buildingId && Number(x.owner) === Number(player));
}

function ensureVtcUpgrades(b) {
  if (!b.vtcUpgrades) b.vtcUpgrades = {};
  return b.vtcUpgrades;
}

export function isVtcUpgradeComplete(vtc, upgradeId) {
  const u = vtc?.vtcUpgrades?.[upgradeId];
  return u === true || u?.complete === true;
}

export function isVtcUpgradeBuilding(vtc, upgradeId) {
  const u = vtc?.vtcUpgrades?.[upgradeId];
  return u && typeof u === 'object' && (u.turnsLeft || 0) > 0;
}

export function hasEngineerFortNear(gs, player, vtc, maxDist = 5) {
  for (const b of gs.buildings || []) {
    if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
    if (!FORT_TYPES.has(b.type)) continue;
    if (hexDistance(b.q, b.r, vtc.q, vtc.r) <= maxDist) return true;
  }
  return false;
}

/** Menu naval yard on this VTC or physical yard nearby (legacy saves). */
export function vtcHasNavalYard(gs, player, vtc) {
  if (!vtc) return false;
  if (isVtcUpgradeComplete(vtc, 'naval_yard')) return true;
  const YARD_TYPES = new Set(['NAVAL_YARD', 'HARBOR', 'PORT', 'NAVAL_BASE', 'NAVAL_DOCKYARD', 'DRY_DOCK', 'SHIPYARD']);
  for (const b of gs.buildings || []) {
    if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
    if (!YARD_TYPES.has(b.type)) continue;
    if (hexDistance(b.q, b.r, vtc.q, vtc.r) <= 5) return true;
  }
  return false;
}

export function getVtcUpgradeMenu(gs, player, buildingId) {
  const vtc = getVtc(gs, player, buildingId);
  if (!vtc || !SETTLEMENT_TYPES.has(vtc.type)) return null;
  if (isPlayerCapitalBuilding(vtc)) return { capital: true, items: [] };

  const required = VTC_PROMOTE_REQUIRED[vtc.type] || [];
  const coastal = isNavalDeployAllowed(gs, vtc, getNavalCoastalCheckRadius(vtc));
  const unlocked = new Set(gs.players[player]?.research?.unlocked || []);
  const items = [];

  for (const def of Object.values(VTC_MENU_UPGRADES)) {
    if (def.forSettlement !== vtc.type) continue;
    if (def.coastalOnly && !coastal) continue;
    if (def.requiresResearch && !unlocked.has(def.requiresResearch)) continue;
    const complete = isVtcUpgradeComplete(vtc, def.id);
    const building = isVtcUpgradeBuilding(vtc, def.id);
    const turnsLeft = building ? (vtc.vtcUpgrades[def.id].turnsLeft || 0) : 0;
    const purchase = canPurchaseVtcUpgrade(gs, player, buildingId, def.id);
    items.push({
      id: def.id,
      label: def.label,
      cost: def.cost,
      buildTurns: def.buildTurns,
      complete,
      building,
      turnsLeft,
      required: required.includes(def.id),
      canBuy: purchase.ok,
      reason: purchase.reason || '',
    });
  }

  if (vtc.type === 'TOWN') {
    const fortOk = hasEngineerFortNear(gs, player, vtc);
    items.push({
      id: '_fort_near',
      label: 'Engineer fortification nearby',
      external: true,
      complete: fortOk,
      required: true,
      canBuy: false,
      reason: fortOk ? '' : 'Build a fort with an Engineer within 5 hexes',
    });
    if (coastal) {
      const ny = items.find(x => x.id === 'naval_yard');
      if (ny) ny.required = false;
    }
  }

  const doneRequired = required.filter(id => isVtcUpgradeComplete(vtc, id)).length
    + (vtc.type === 'TOWN' && hasEngineerFortNear(gs, player, vtc) ? 1 : 0);
  const totalRequired = required.length + (vtc.type === 'TOWN' ? 1 : 0);

  const promo = SETTLEMENT_PROMOTE[vtc.type];
  return {
    settlementType: vtc.type,
    promoting: (vtc.promoteTurnsLeft || 0) > 0,
    promoteTurnsLeft: vtc.promoteTurnsLeft || 0,
    promoteTarget: promo?.next,
    promoteCost: promo?.cost,
    promoteTurns: promo?.promoteTurns,
    requiredDone: doneRequired,
    requiredTotal: totalRequired,
    canPromote: canPromoteSettlement(gs, player, buildingId),
    items,
  };
}

export function canPurchaseVtcUpgrade(gs, player, buildingId, upgradeId) {
  const def = VTC_MENU_UPGRADES[upgradeId];
  const vtc = getVtc(gs, player, buildingId);
  if (!def || !vtc) return { ok: false, reason: 'Invalid upgrade' };
  if (isPlayerCapitalBuilding(vtc)) return { ok: false, reason: 'Use outposts for capital upgrades' };
  if (def.forSettlement !== vtc.type) return { ok: false, reason: 'Wrong settlement tier' };
  if (isVtcUpgradeComplete(vtc, upgradeId)) return { ok: false, reason: 'Already built' };
  if (isVtcUpgradeBuilding(vtc, upgradeId)) return { ok: false, reason: 'Construction in progress' };
  if (def.coastalOnly && !isNavalDeployAllowed(gs, vtc, getNavalCoastalCheckRadius(vtc))) {
    return { ok: false, reason: 'Coastal settlement required' };
  }
  if (def.requiresResearch && !(gs.players[player]?.research?.unlocked || []).includes(def.requiresResearch)) {
    return { ok: false, reason: 'Requires research' };
  }
  const pl = gs.players[player] || {};
  const c = def.cost;
  if ((pl.iron || 0) < (c.iron || 0)) return { ok: false, reason: 'Not enough iron' };
  if ((pl.oil || 0) < (c.oil || 0)) return { ok: false, reason: 'Not enough oil' };
  if ((pl.wood || 0) < (c.wood || 0)) return { ok: false, reason: 'Not enough wood' };
  if ((pl.components || 0) < (c.components || 0)) return { ok: false, reason: 'Not enough components' };
  return { ok: true };
}

export function purchaseVtcUpgrade(gs, player, buildingId, upgradeId) {
  const check = canPurchaseVtcUpgrade(gs, player, buildingId, upgradeId);
  if (!check.ok) return check;
  const def = VTC_MENU_UPGRADES[upgradeId];
  const vtc = getVtc(gs, player, buildingId);
  const pl = gs.players[player];
  const c = def.cost;
  pl.iron -= (c.iron || 0);
  pl.oil -= (c.oil || 0);
  pl.wood -= (c.wood || 0);
  pl.components = (pl.components || 0) - (c.components || 0);
  const ups = ensureVtcUpgrades(vtc);
  ups[upgradeId] = { turnsLeft: def.buildTurns, complete: false };
  return { ok: true, turns: def.buildTurns };
}

export function tickVtcUpgrades(gs, player, events = []) {
  for (const b of gs.buildings || []) {
    if (Number(b.owner) !== Number(player) || !b.vtcUpgrades) continue;
    for (const [id, state] of Object.entries(b.vtcUpgrades)) {
      if (!state || state.complete || state === true) continue;
      if ((state.turnsLeft || 0) <= 0) {
        b.vtcUpgrades[id] = { complete: true };
        const label = VTC_MENU_UPGRADES[id]?.label || id;
        events.push(`P${player} finished ${label} at (${b.q},${b.r})`);
        applyVtcUpgradeBonuses(gs, player, b, id);
        continue;
      }
      state.turnsLeft = Math.max(0, state.turnsLeft - 1);
      if (state.turnsLeft <= 0) {
        b.vtcUpgrades[id] = { complete: true };
        applyVtcUpgradeBonuses(gs, player, b, id);
        events.push(`P${player} finished ${VTC_MENU_UPGRADES[id]?.label || id} at (${b.q},${b.r})`);
      }
    }
  }
}

function applyVtcUpgradeBonuses(gs, player, vtc, upgradeId) {
  const def = VTC_MENU_UPGRADES[upgradeId];
  if (!def) return;
  const pl = gs.players[player];
  if (def.popCapBonus) pl.popCap = (pl.popCap || 10) + def.popCapBonus;
}

export function getSettlementImprovementStatus(gs, player, buildingId) {
  const menu = getVtcUpgradeMenu(gs, player, buildingId);
  if (!menu || menu.capital) return null;
  return {
    score: menu.requiredDone,
    required: menu.requiredTotal,
    complete: menu.canPromote.ok === true || (menu.requiredDone >= menu.requiredTotal && !menu.promoteTarget),
    items: menu.items.map(it => ({
      id: it.id,
      label: it.label,
      done: it.complete,
    })),
    promoteTurns: menu.promoteTurns,
    next: menu.promoteTarget,
    cost: menu.promoteCost,
    promoting: menu.promoting,
    promoteTurnsLeft: menu.promoteTurnsLeft,
  };
}

export function canPromoteSettlement(gs, player, buildingId) {
  const vtc = getVtc(gs, player, buildingId);
  if (!vtc || !SETTLEMENT_TYPES.has(vtc.type)) return { ok: false, reason: 'Invalid settlement' };
  if (isPlayerCapitalBuilding(vtc)) return { ok: false, reason: 'Capital cannot be promoted' };
  if (vtc.promoteTurnsLeft > 0) return { ok: false, reason: 'Promotion in progress' };
  const def = SETTLEMENT_PROMOTE[vtc.type];
  if (!def) return { ok: false, reason: 'Already at max tier' };

  const required = VTC_PROMOTE_REQUIRED[vtc.type] || [];
  const missing = required.filter(id => !isVtcUpgradeComplete(vtc, id));
  if (missing.length) {
    const names = missing.map(id => VTC_MENU_UPGRADES[id]?.short || id).join(', ');
    return { ok: false, reason: `Buy upgrades: ${names}` };
  }
  if (vtc.type === 'TOWN' && !hasEngineerFortNear(gs, player, vtc)) {
    return { ok: false, reason: 'Engineer fortification within 5 hexes' };
  }

  const pl = gs.players[player] || {};
  const c = def.cost;
  if ((pl.iron || 0) < (c.iron || 0)) return { ok: false, reason: 'Not enough iron' };
  if ((pl.oil || 0) < (c.oil || 0)) return { ok: false, reason: 'Not enough oil' };
  if ((pl.wood || 0) < (c.wood || 0)) return { ok: false, reason: 'Not enough wood' };
  if ((pl.components || 0) < (c.components || 0)) return { ok: false, reason: 'Not enough components' };
  return { ok: true, next: def.next, promoteTurns: def.promoteTurns, cost: c };
}

// ── Re-export for GameState naval checks ───────────────────────────────────
export function hasNavalYardNearSettlement(gs, player, vtc, _maxDist = 5) {
  return vtcHasNavalYard(gs, player, vtc);
}

export function playerHasCityWithNavalYard(gs, player) {
  for (const b of gs.buildings || []) {
    if (Number(b.owner) !== Number(player) || b.type !== 'CITY' || b.underConstruction) continue;
    if (vtcHasNavalYard(gs, player, b)) return true;
  }
  return false;
}

/** @deprecated alias */
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
    if (!vtcHasNavalYard(gs, player, anchor)) {
      return { ok: false, reason: 'Buy Naval Yard in City UPGRADE tab' };
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
    const opts = getRecruitOptionsForVTC(gs, player, anchorId);
    if (!opts.includes(unitType)) return { ok: false, reason: 'Not available at this City' };
    return canQueueGlobalRecruit(gs, player, unitType, anchorId);
  }

  const opts = getRecruitOptionsForVTC(gs, player, anchorId);
  if (!opts.includes(unitType)) {
    if (NAVAL_UNITS.has(unitType)) {
      const tier = getBuildingTierForDeploy(anchor);
      if (!isNavalDeployAllowed(gs, anchor, getNavalCoastalCheckRadius(anchor))) {
        return { ok: false, reason: 'Coastal access required' };
      }
      if (!isNavalAllowedAtVTCTier(tier, unitType)) {
        if (unitType === 'SUPPLY_SHIP' && tier < 1) {
          return { ok: false, reason: 'Promote to Town for supply ships' };
        }
        return { ok: false, reason: tier < 1 ? 'Requires Town or City' : 'Requires City for this hull' };
      }
    }
    if (unitType === 'TANK' || unitType === 'ARTILLERY') {
      return { ok: false, reason: 'Requires Town or City' };
    }
    const udef = UNIT_TYPES[unitType];
    if (udef.unlockedBy && !(gs.players[player]?.research?.unlocked || []).includes(udef.unlockedBy)) {
      return { ok: false, reason: 'Requires research' };
    }
    return { ok: false, reason: 'Not available at this settlement' };
  }
  return canQueueGlobalRecruit(gs, player, unitType, anchorId);
}

export function getProduceCatalog(gs, player, anchorId) {
  const fromOpts = new Set(getRecruitOptionsForVTC(gs, player, anchorId));
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
