/**
 * Combat preview intel, analysis, and shared UI constants.
 */
import {
  hexDistance, hasLOS, supplyPenalty,
  UNIT_TYPES, NAVAL_UNITS, AIR_UNITS,
  getUnitTierIntel, computeFortificationCombatMods,
} from './GameState.js';

const INDIRECT = new Set(['ARTILLERY', 'MORTAR']);
const INF_LIKE = new Set(['INFANTRY', 'ASSAULT_INFANTRY', 'SMG_SQUAD', 'LMG_TEAM', 'HMG_TEAM', 'SNIPER', 'ENGINEER', 'MEDIC', 'ANTI_TANK']);
const SCOUT_TYPES = new Set(['RECON', 'OBS_PLANE', 'OBS_POST']);

export const COMBAT_GLYPH = {
  INFANTRY: '●', ENGINEER: '◆', RECON: '✶', TANK: '■', ARTILLERY: '▲',
  ANTI_TANK: '➤', MORTAR: '△', MEDIC: '✚', PATROL_BOAT: '◖', SUBMARINE: '▭',
  DESTROYER: '◉', CRUISER_LT: '⬒', CRUISER_HV: '⬓', BATTLESHIP: '⬔',
  LANDING_CRAFT: '⟂', TRANSPORT_SM: '◫', TRANSPORT_MD: '◫', TRANSPORT_LG: '◫',
  COASTAL_BATTERY: '▣', AA_EMPLACEMENT: '⊕',
};

export const TIER_COL = {
  'Catastrophic Failure': '#ff4444',
  Repelled: '#ff8844',
  Neutral: '#cccccc',
  Effective: '#88ee44',
  Overwhelming: '#44ffcc',
};

export const TIER_BG = {
  'Catastrophic Failure': 0x4a0000,
  Repelled: 0x3a1800,
  Neutral: 0x1a1a1a,
  Effective: 0x0e2800,
  Overwhelming: 0x002a1a,
};

const ROLL = 15;

export function getCombatIntel(scene, gs, attacker, target, blindFire = false) {
  const cp = Number(gs.currentPlayer);
  const fogOff = !!scene._debugNoFog || !scene._currentFog;
  const key = `${target.q},${target.r}`;
  const inSight = fogOff || scene._currentFog?.has(key);
  const discovered = scene._discovered?.[cp]?.has(key);
  const friendly = Number(target.owner) === cp;

  const directLOS = !blindFire && scene.terrain
    && hasLOS(attacker.q, attacker.r, target.q, target.r, scene.terrain, scene.mapSize);

  const scoutNear = gs.units.some((u) => !u.dead && Number(u.owner) === cp
    && SCOUT_TYPES.has(u.type)
    && hexDistance(u.q, u.r, target.q, target.r) <= 4);

  let level = 0;
  const reasons = [];
  if (friendly || fogOff) {
    level = 3;
    reasons.push('Friendly unit');
  } else if (inSight && directLOS) {
    level = 3;
    reasons.push('Direct observation');
  } else if (inSight) {
    level = 2;
    reasons.push('Spotted — line of sight blocked');
  } else if (scoutNear && discovered) {
    level = 2;
    reasons.push('Recon / observation aircraft report');
  } else if (discovered) {
    level = 1;
    reasons.push('Stale contact — hex seen before');
  } else if (blindFire) {
    level = 0;
    reasons.push('Blind fire — firing at coordinates only');
  } else {
    level = 1;
    reasons.push('Attack order — target not fully scouted');
  }

  const labels = ['BLIND', 'SPOTTED', 'PARTIAL', 'CONFIRMED'];
  const tierIntel = getUnitTierIntel(gs, target, cp, { intelLevel: level });
  return {
    level,
    label: labels[level],
    targetTier: tierIntel,
    showTargetTier: level >= 1,
    showDefenderStats: level >= 3,
    showDefenderHP: level >= 2,
    showTerrainMods: level >= 2,
    showPierceDetail: level >= 3,
    showRetaliation: level >= 2,
    showScoreDetail: level >= 1,
    showRecommendations: level >= 2,
    reasons,
    blindFire: !!blindFire,
    inSight: !!inSight,
    directLOS: !!directLOS,
    scoutNear: !!scoutNear,
  };
}

export function getUnitCombatProfile(def, type, ctx = {}) {
  const { isArmored, navalVsNaval, navalVsLand } = ctx;
  const soft = def.soft_attack || 0;
  const hard = def.hard_attack || 0;
  const naval = def.naval_attack || 0;
  const lines = [];
  if (navalVsLand && naval > 0) lines.push(`Naval bombardment ${naval} (×0.6 vs land)`);
  else if (navalVsNaval) lines.push(`Naval guns: hard ${hard}`);
  else if (isArmored && hard > soft) lines.push(`Anti-armor: hard ${hard} (soft ${soft})`);
  else if (hard > 0 && soft > 0) lines.push(`Soft ${soft} / Hard ${hard}`);
  else if (soft > 0) lines.push(`Soft attack ${soft}`);
  else if (hard > 0) lines.push(`Hard attack ${hard}`);
  else lines.push('Minimal offensive power');

  let role = 'Generalist';
  if (def.antiAir) role = 'Anti-air';
  else if (def.antiNavalOnly) role = 'Torpedo / anti-ship';
  else if ((def.pierce || 0) >= 5) role = 'Armor piercer';
  else if (INDIRECT.has(type)) role = 'Indirect fire';
  else if (type === 'ANTI_TANK') role = 'Tank hunter';
  else if (AIR_UNITS.has(type)) role = 'Air strike';

  return { role, lines, pierce: def.pierce || 0, armor: def.armor || 0, defense: def.defense || 0 };
}

export function analyzeCombat(gs, terrain, mapSize, attacker, target, blindFire, intel) {
  const aDef = UNIT_TYPES[attacker.type];
  const tDef = UNIT_TYPES[target.type];
  const atkIsNaval = NAVAL_UNITS.has(attacker.type) || attacker.type === 'COASTAL_BATTERY';
  const defIsNaval = NAVAL_UNITS.has(target.type);
  const tTerrain = terrain[`${target.q},${target.r}`] ?? 0;
  const tOnLand = tTerrain <= 3 || tTerrain === 6 || tTerrain === 7;
  const navalVsNaval = atkIsNaval && defIsNaval;
  const navalVsLand = atkIsNaval && tOnLand && !defIsNaval;
  const isArmored = (tDef.armor || 0) > 2;

  let baseAtk = navalVsNaval ? aDef.hard_attack : (isArmored ? aDef.hard_attack : aDef.soft_attack);
  if (navalVsLand) baseAtk = Math.floor((aDef.naval_attack || 1) * 0.6);
  const fighterStrafe = AIR_UNITS.has(attacker.type) && !AIR_UNITS.has(target.type) && aDef.antiAir;
  if (fighterStrafe) baseAtk = Math.max(1, Math.floor(baseAtk * 0.5));

  const atkSupPen = attacker.outOfSupply > 0 ? supplyPenalty(attacker.outOfSupply).attackPenalty : 0;
  const defSupPen = target.outOfSupply > 0 ? supplyPenalty(target.outOfSupply).attackPenalty : 0;
  if (atkSupPen > 0) baseAtk = Math.max(1, baseAtk - atkSupPen);

  const pierceRatio = aDef.pierce < tDef.armor ? aDef.pierce / Math.max(1, tDef.armor) : 1;
  const pierceMod = Math.round((pierceRatio - 0.5) * 20);
  const dist = hexDistance(attacker.q, attacker.r, target.q, target.r);
  const infRangePenalty = (attacker.type === 'INFANTRY' && dist >= 2) ? 8 : 0;
  if (infRangePenalty > 0) baseAtk = Math.max(1, baseAtk - 1);

  const terrainMod = tTerrain === 1 ? 10 : tTerrain === 2 ? 20 : (tTerrain === 7 ? 5 : 0);
  const fortMods = computeFortificationCombatMods(gs, target, attacker);
  const onFort = fortMods.onFort;
  const openPlainMod = ((tTerrain === 0 || tTerrain === 6) && INF_LIKE.has(target.type) && !target.dugIn && !onFort) ? 6 : 0;
  const dugInMod = target.dugIn ? 8 : 0;
  const bunkerMod = fortMods.fortMod;
  const fortDefenseBonus = fortMods.defenseBonus || 0;
  const blindMod = blindFire ? 20 : 0;
  const aaBonus = (aDef.antiAir && AIR_UNITS.has(target.type)) ? 10 : 0;
  const baseScore = 50;
  const preRollScore = Math.max(0, Math.min(100,
    baseScore + (aDef.accuracy || 0) + aaBonus - Math.max(0, (tDef.evasion || 0) - (defSupPen * 2))
    - terrainMod - dugInMod - bunkerMod - blindMod + pierceMod
    + openPlainMod - infRangePenalty - (atkSupPen * 3) + (defSupPen * 3)));
  const scoreMin = Math.max(0, preRollScore - ROLL);
  const scoreMax = Math.min(100, preRollScore + ROLL);

  const tierAt = (s) => (s < 20 ? 'Catastrophic Failure' : s < 40 ? 'Repelled' : s < 60 ? 'Neutral' : s < 80 ? 'Effective' : 'Overwhelming');
  const dmgAt = (s, ba, pr, def, fortDef) => {
    const totalDef = def + (fortDef || 0);
    if (s < 20) return 0;
    if (s < 40) return 0;
    if (s < 60) return Math.max(0, Math.max(1, Math.round(ba * pr * 0.5)) - totalDef);
    return Math.max(0, Math.max(1, Math.round(ba * pr)) - totalDef);
  };

  const tier = tierAt(preRollScore);
  const effDef = Math.max(0, (tDef.defense || 0) - defSupPen);
  const expDmg = dmgAt(preRollScore, baseAtk, pierceRatio, effDef, fortDefenseBonus);
  const maxDmg = dmgAt(scoreMax, baseAtk, pierceRatio, effDef, fortDefenseBonus);

  const retDist = dist;
  const subDiveBlock = tDef.noSurfaceRetaliation && !aDef.noSurfaceRetaliation;
  const retHasLOS = retDist <= 1 || !terrain || hasLOS(target.q, target.r, attacker.q, attacker.r, terrain, mapSize);
  const canRet = !blindFire && !INDIRECT.has(attacker.type) && !subDiveBlock
    && retDist <= (tDef.range || 1) && retHasLOS && !target.suppressed;
  const noRetReason = blindFire ? 'blind fire'
    : (INDIRECT.has(attacker.type) ? 'indirect attacker'
      : (subDiveBlock ? 'submarine dived'
        : (retDist > (tDef.range || 1) ? 'out of range'
          : (!retHasLOS ? 'no line of sight'
            : (target.suppressed ? 'defender suppressed' : 'cannot retaliate')))));

  let expRetDmg = 0;
  let retTier = '';
  if (canRet) {
    const rBase = navalVsNaval ? tDef.hard_attack : ((aDef.armor > 2) ? tDef.hard_attack : tDef.soft_attack);
    const rPR = tDef.pierce < aDef.armor ? tDef.pierce / Math.max(1, aDef.armor) : 1;
    const rPierceMod = Math.round((rPR - 0.5) * 20);
    const rScore = Math.max(0, Math.min(100, 50 + (tDef.accuracy || 0) - (aDef.evasion || 0) + rPierceMod));
    expRetDmg = dmgAt(rScore, rBase, rPR, aDef.defense || 0);
    retTier = tierAt(rScore);
  }

  const atkProfile = getUnitCombatProfile(aDef, attacker.type, { isArmored, navalVsNaval, navalVsLand });
  const defProfile = getUnitCombatProfile(tDef, target.type, { isArmored: (aDef.armor || 0) > 2, navalVsNaval: false, navalVsLand: false });

  const tips = [];
  if (isArmored && (aDef.hard_attack || 0) < (aDef.soft_attack || 0)) {
    tips.push('Target is armored — soft attack is weak; hard attack applies.');
  }
  if ((aDef.pierce || 0) < (tDef.armor || 0)) {
    tips.push(`Pierce ${aDef.pierce} vs armor ${tDef.armor} — damage reduced.`);
  } else if ((aDef.pierce || 0) >= (tDef.armor || 0) && (tDef.armor || 0) > 2) {
    tips.push('Pierce matches armor — full damage potential.');
  }
  if (bunkerMod && fortMods.fortName) {
    tips.push(`Defender in ${fortMods.fortName} (T${fortMods.fortTier}) — cover penalty −${bunkerMod}.`);
  }
  if (fortMods.indirectAirBonus) tips.push('Foxhole/trench profile: extra cover vs artillery & air.');
  if (fortDefenseBonus) tips.push(`Fortification absorbs ${fortDefenseBonus} damage.`);
  if (dugInMod) tips.push('Defender is dug in.');
  if (openPlainMod) tips.push('Defender exposed on open ground — bonus hit quality.');
  if (atkSupPen) tips.push('Your unit is out of supply — weaker attack.');
  if (defSupPen) tips.push('Defender out of supply — easier to hit.');
  if (blindFire || intel.level < 2) tips.push('Limited intel — expect wider outcome variance.');
  if (fighterStrafe) tips.push('Fighter strafing ground — attack halved.');

  const netHp = expDmg - expRetDmg;
  let verdict = 'UNCERTAIN';
  let verdictColor = '#ddbb66';
  let verdictAdvice = 'Outcome depends on the random roll (±15 hit quality).';
  if (!intel.showRecommendations) {
    verdict = 'LOW INTEL';
    verdictColor = '#aa88cc';
    verdictAdvice = 'Scout or recon before committing — defender capabilities unclear.';
  } else if (expDmg === 0 && expRetDmg >= 2) {
    verdict = 'RETREAT ADVISED';
    verdictColor = '#ff6666';
    verdictAdvice = 'Expected hit does little; retaliation likely hurts more.';
  } else if (netHp >= 2 && expRetDmg <= 1) {
    verdict = 'FAVORABLE';
    verdictColor = '#66ee88';
    verdictAdvice = 'Good matchup — proceed if timing fits your plan.';
  } else if (netHp <= 0 && expRetDmg > 0) {
    verdict = 'RISKY';
    verdictColor = '#ffaa44';
    verdictAdvice = 'Trade may favor the defender — consider softer targets or support.';
  } else {
    verdict = 'FAIR FIGHT';
    verdictColor = '#aaccff';
    verdictAdvice = 'Even exchange possible — check supply and follow-up units.';
  }

  const modRows = [
    ['Base hit quality', `${baseScore}`, '#778899'],
  ];
  if (aDef.accuracy) modRows.push([`Accuracy`, `+${aDef.accuracy}`, '#88cc88']);
  if (tDef.evasion && intel.showScoreDetail) modRows.push([`Target evasion`, `−${tDef.evasion}`, '#cc8844']);
  if (terrainMod && intel.showTerrainMods) modRows.push([`Terrain cover`, `−${terrainMod}`, '#aa7744']);
  if (openPlainMod && intel.showTerrainMods) modRows.push([`Open exposure`, `+${openPlainMod}`, '#ff9966']);
  if (dugInMod && intel.showTerrainMods) modRows.push([`Dug in`, `−${dugInMod}`, '#aa7744']);
  if (bunkerMod && intel.showTerrainMods) {
    const fortLabel = fortMods.fortName ? `${fortMods.fortName} T${fortMods.fortTier}` : 'Fortification';
    modRows.push([fortLabel, `−${bunkerMod}`, '#aa7744']);
    if (fortMods.indirectAirBonus) modRows.push(['vs Arty/Air', `+${fortMods.indirectAirBonus}`, '#88aa66']);
  }
  if (fortDefenseBonus && intel.showTerrainMods) modRows.push(['Fort DR', `−${fortDefenseBonus} dmg`, '#aa8855']);
  if (blindMod) modRows.push([`Blind fire`, `−${blindMod}`, '#cc4444']);
  if (infRangePenalty) modRows.push([`Infantry long shot`, `−${infRangePenalty} / −1 ATK`, '#ffbb66']);
  if (fighterStrafe) modRows.push([`Fighter strafe`, `ATK ×0.5`, '#ffbb66']);
  if (atkSupPen) modRows.push([`Attacker OOS`, `−${atkSupPen * 3} / −${atkSupPen} ATK`, '#ff9966']);
  if (defSupPen) modRows.push([`Defender OOS`, `+${defSupPen * 3}`, '#ff9966']);
  if (intel.showPierceDetail) {
    modRows.push([`Pierce vs armor`, `${pierceMod >= 0 ? '+' : ''}${pierceMod}`, pierceMod >= 0 ? '#88cc88' : '#cc8844']);
  }
  modRows.push([`Random roll`, `±${ROLL}`, '#7799aa']);

  return {
    aDef, tDef, dist, baseAtk, pierceRatio, pierceMod, preRollScore, scoreMin, scoreMax,
    tier, tierLo: tierAt(scoreMin), tierHi: tierAt(scoreMax), expDmg, maxDmg, expRetDmg,
    canRet, noRetReason, retTier, effDef, isArmored, navalVsNaval, navalVsLand,
    atkProfile, defProfile, tips, verdict, verdictColor, verdictAdvice, modRows,
    terrainMod, dugInMod, bunkerMod, fortTier: fortMods.fortTier, fortIndirectBonus: fortMods.indirectAirBonus,
    openPlainMod, blindMod, atkSupPen, defSupPen,
  };
}

/** Build human-readable resolve steps from a combat log entry. */
export function buildResolveSteps(entry) {
  if (!entry || entry.type !== 'combat') return [];
  const steps = [];
  steps.push(`1. Base hit quality starts at 50.`);
  if (entry.accuracy) steps.push(`2. +${entry.accuracy} attacker accuracy.`);
  if (entry.evasion) steps.push(`3. −${entry.evasion} defender evasion.`);
  const cover = (entry.terrainMod || 0) + (entry.dugInMod || 0) + (entry.bunkerMod || 0);
  if (cover) {
    const fortBit = entry.fortName ? ` / ${entry.fortName}` : '';
    steps.push(`4. −${cover} defender cover (terrain / dug-in / fort${fortBit}).`);
  }
  if (entry.fortIndirectBonus) steps.push(`4b. +${entry.fortIndirectBonus} extra fort cover vs artillery/air.`);
  if (entry.openPlainMod) steps.push(`5. +${entry.openPlainMod} defender exposed on open ground.`);
  if (entry.exposedMod) steps.push(`6. +${entry.exposedMod} defender on road (exposed).`);
  if (entry.blindFirePenalty) steps.push(`7. −${entry.blindFirePenalty} blind fire penalty.`);
  if (entry.attackerSupplyPenalty) steps.push(`8. −${entry.attackerSupplyPenalty * 3} attacker out-of-supply.`);
  if (entry.defenderSupplyPenalty) steps.push(`9. +${entry.defenderSupplyPenalty * 3} defender out-of-supply.`);
  if (entry.infantryRangePenalty) steps.push(`10. −${entry.infantryRangePenalty} infantry long-range penalty.`);
  const pierceAdj = entry.pierceRatio != null ? Math.round((entry.pierceRatio - 0.5) * 20) : 0;
  if (pierceAdj) steps.push(`11. ${pierceAdj >= 0 ? '+' : ''}${pierceAdj} pierce ${entry.pierce} vs armor ${entry.armor}.`);
  if (entry.roll != null) steps.push(`12. Random roll ${entry.roll >= 0 ? '+' : ''}${entry.roll} → final hit quality ${entry.score}.`);
  steps.push(`13. Tier: ${entry.tier} → ${entry.dmg} damage to defender (ATK ${entry.baseAttack} × pierce, minus DEF).`);
  if (entry.attackerDmg > 0) {
    steps.push(`14. Retaliation: ${entry.attackerDmg} damage back to attacker.`);
  } else {
    steps.push(`14. No retaliation damage.`);
  }
  return steps;
}
