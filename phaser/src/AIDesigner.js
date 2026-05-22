/**
 * AI unit designer — maintains custom designs and prefers them in recruitment.
 */
import {
  MODULES, CHASSIS_BUILDINGS, getMaxDesignSlots,
  canRecruit, getRecruitFoodCost, designTrainCost,
  getPlayerMaxTrainableTier, canPlayerUseModule, computeDesignStats,
  computeEffectiveTier, UNIT_TYPES,
} from './GameState.js';

const AI_BLUEPRINTS = [
  { key: 'line_assault', chassis: 'INFANTRY', modules: ['INF_ASSAULT_DRILL', 'INF_GRENADE_KIT'], minTurn: 10 },
  { key: 'line_at', chassis: 'INFANTRY', modules: ['INF_AT_RIFLE_PACKAGE'], minTurn: 12 },
  { key: 'tank_punch', chassis: 'TANK', modules: ['BETTER_ENGINE', 'VEH_APCR_ROUNDS'], minTurn: 14 },
  { key: 'tank_breach', chassis: 'TANK', modules: ['TANK_MOBILITY_KIT', 'INF_BREACH_CHARGE'], minTurn: 18, chassisAlt: 'MEDIUM_TANK' },
  { key: 'arty_siege', chassis: 'ARTILLERY', modules: ['LONG_RANGE', 'ARTY_SIEGE_SHELLS'], minTurn: 16 },
  { key: 'recon_eyes', chassis: 'RECON', modules: ['OPTICS_SCOUT', 'FIELD_RADIO'], minTurn: 8 },
];

function unlockedSet(gs, player) {
  return new Set(gs.players[player]?.research?.unlocked || []);
}

function modulesAllowed(gs, player, moduleKeys) {
  const unlocked = unlockedSet(gs, player);
  const modSet = new Set(moduleKeys);
  for (const mk of moduleKeys) {
    const gate = canPlayerUseModule(gs, player, mk, unlocked);
    if (!gate.ok) return false;
    const mod = MODULES[mk];
    if (!mod) return false;
    for (const ex of (mod.mutuallyExclusiveWith || [])) {
      if (modSet.has(ex)) return false;
    }
  }
  return true;
}

function pickChassis(gs, player, blueprint) {
  const bonuses = gs.players[player]?.research?.unlocked || [];
  const tryList = [blueprint.chassis, blueprint.chassisAlt].filter(Boolean);
  for (const ch of tryList) {
    const stats = computeDesignStats(ch, blueprint.modules);
    const tier = computeEffectiveTier(ch, blueprint.modules, stats);
    if (tier <= getPlayerMaxTrainableTier(gs, player)) return ch;
  }
  return blueprint.chassis;
}

/** Ensure AI has useful registered designs (free for AI — skips spend). */
export function ensureAIDesigns(gs, player) {
  if (!gs.designs[player]) gs.designs[player] = [];
  const turn = gs.turn || 1;
  const existingRoles = new Set(gs.designs[player].map(d => d.aiRole).filter(Boolean));

  for (const bp of AI_BLUEPRINTS) {
    if (turn < bp.minTurn) continue;
    if (existingRoles.has(bp.key)) continue;
    if (gs.designs[player].length >= getMaxDesignSlots(gs, player)) break;
    if (!modulesAllowed(gs, player, bp.modules)) continue;

    const chassis = pickChassis(gs, player, bp);
    const stats = computeDesignStats(chassis, bp.modules);
    const effectiveTier = computeEffectiveTier(chassis, bp.modules, stats);
    if (effectiveTier > getPlayerMaxTrainableTier(gs, player)) continue;

    const allIds = [...gs.units.map(u => u.id), ...(gs.designs[player] || []).map(d => d.id)];
    const maxId = allIds.length ? Math.max(...allIds) : 0;
    const id = maxId + 1 + player * 10000;
    const name = bp.key === 'line_assault' ? 'Assault Squad'
      : bp.key === 'line_at' ? 'AT Team'
      : bp.key === 'tank_punch' ? 'Panzer Punch'
      : bp.key === 'tank_breach' ? 'Breach Tank'
      : bp.key === 'arty_siege' ? 'Siege Battery'
      : 'Scout Pack';

    gs.designs[player].push({
      id,
      chassis,
      modules: [...bp.modules],
      name,
      stats,
      trainCost: designTrainCost(chassis, bp.modules),
      effectiveTier,
      aiRole: bp.key,
    });
    existingRoles.add(bp.key);
  }
}

/** Designs this building can train, sorted by AI preference. */
export function getAIDesignsForBuilding(gs, player, buildingType, recruitPrio = []) {
  return (gs.designs[player] || [])
    .filter(d => CHASSIS_BUILDINGS[d.chassis] === buildingType)
    .sort((a, b) => {
      const score = (d) => {
        let s = (d.effectiveTier || 0) * 10;
        if (d.aiRole === 'tank_punch' || d.aiRole === 'tank_breach') s += 8;
        if (d.aiRole === 'line_assault') s += 6;
        if (d.aiRole === 'arty_siege') s += 5;
        const idx = recruitPrio.indexOf(d.chassis);
        if (idx >= 0) s += (recruitPrio.length - idx);
        return s;
      };
      return score(b) - score(a);
    });
}

/**
 * Pick recruit: design id (number) or standard type string.
 * Returns null if nothing affordable.
 */
export function pickAIRecruit(gs, player, building, sortedTypes, resSim, turn, designsOnly = false) {
  ensureAIDesigns(gs, player);
  const designs = getAIDesignsForBuilding(gs, player, building.type, sortedTypes);

  const tryDesign = turn >= 10 && (resSim.components || 0) >= 2;
  if (tryDesign) {
    for (const d of designs) {
      const check = canRecruit(gs, player, d.id, building.id);
      if (!check.ok) continue;
      const tc = d.trainCost || {};
      const food = getRecruitFoodCost(d.chassis);
      if (resSim.iron >= (tc.iron || 0) && resSim.oil >= (tc.oil || 0) && resSim.wood >= (tc.wood || 0)
        && resSim.food >= food && resSim.components >= (tc.components || 0)) {
        return { unitType: d.id, design: d };
      }
    }
  }

  if (designsOnly) return null;

  for (const unitType of sortedTypes) {
    const cost = UNIT_TYPES[unitType]?.cost || {};
    const foodCost = getRecruitFoodCost(unitType);
    if (resSim.iron >= (cost.iron || 0) && resSim.oil >= (cost.oil || 0) && resSim.wood >= (cost.wood || 0)
      && resSim.food >= foodCost && resSim.components >= (cost.components || 0)) {
      return { unitType, design: null };
    }
  }
  return null;
}

/** 0–1: how much AI should press for game-ending plays. */
export function getClosingPressure(gs, player) {
  const enemyOwners = [...new Set(gs.units.map(u => u.owner).filter(o => o !== player))];
  if (!enemyOwners.length) return 0.9;

  const isCombat = (u) => {
    const d = UNIT_TYPES[u.type] || u;
    return (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0 || (d.attack || 0) > 0;
  };
  const myCombat = gs.units.filter(u => u.owner === player && !u.dead && !u.embarked).filter(isCombat);
  const enCombat = gs.units.filter(u => enemyOwners.includes(u.owner) && !u.dead && !u.embarked).filter(isCombat);
  if (enCombat.length === 0) return 0.88;

  let p = 0;
  const ratio = myCombat.length / Math.max(1, enCombat.length);
  if (ratio >= 1.25) p += 0.18;
  if (ratio >= 1.6) p += 0.22;
  if (ratio >= 2.2) p += 0.2;

  const turn = gs.turn || 1;
  if (turn >= 18) p += 0.08;
  if (turn >= 28) p += 0.1;

  const enemyHQ = gs.buildings.find(b => b.type === 'HQ' && b.owner !== player);
  if (enemyHQ) {
    const near = myCombat.filter(u => hexDist(u, enemyHQ) <= 14).length;
    if (near >= 2) p += 0.12;
    if (near >= 5) p += 0.15;
    if (near >= 8) p += 0.1;
  }

  const weakestEnemy = enemyOwners.reduce((best, eo) => {
    const ep = gs.players[eo] || {};
    const iron = ep.iron || 0;
    return iron < best.iron ? { owner: eo, iron } : best;
  }, { owner: null, iron: 999 });
  if (weakestEnemy.iron < 10) p += 0.12;
  if (weakestEnemy.iron < 4) p += 0.1;

  return Math.min(0.88, p);
}

function hexDist(u, hex) {
  const dq = u.q - hex.q;
  const dr = u.r - hex.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
