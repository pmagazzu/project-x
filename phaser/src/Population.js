/**
 * Master population pool — cap comes from owned VTCs (and HQ), not passive HQ growth.
 */

function isVtcUpgradeDone(vtc, upgradeId) {
  const u = vtc?.vtcUpgrades?.[upgradeId];
  return u === true || u?.complete === true;
}

export const SETTLEMENT_POP_TYPES = new Set(['VILLAGE', 'TOWN', 'CITY']);

export const DEFAULT_VTC_POP = { VILLAGE: 5, TOWN: 10, CITY: 15, HQ: 5 };
/** Extra cap on home capital so the opening squad fits the VTC pool (V5 + HQ5 = 10). */
export const CAPITAL_POP_BONUS = 5;

function isCapitalSettlement(b) {
  return b.type === 'HQ' || (b.type === 'VILLAGE' && !!b.isCapital);
}

/** VTC upgrade ids → pop cap bonus (scaled by vtcPopScale). */
export const VTC_HOUSING_POP = {
  housing: 1,
  suburbs: 2,
  urban_housing: 4,
};

export function getVtcPopConfig(state) {
  const scale = Math.max(0.25, Math.min(4, Number(state.vtcPopScale) || 1));
  const base = state.vtcPopBase || DEFAULT_VTC_POP;
  return {
    scale,
    village: Math.round((base.VILLAGE ?? DEFAULT_VTC_POP.VILLAGE) * scale),
    town: Math.round((base.TOWN ?? DEFAULT_VTC_POP.TOWN) * scale),
    city: Math.round((base.CITY ?? DEFAULT_VTC_POP.CITY) * scale),
    hq: Math.round((base.HQ ?? DEFAULT_VTC_POP.HQ) * scale),
  };
}

function settlementPopBase(type, cfg) {
  if (type === 'VILLAGE') return cfg.village;
  if (type === 'TOWN') return cfg.town;
  if (type === 'CITY') return cfg.city;
  if (type === 'HQ') return cfg.hq;
  return 0;
}

export function getVtcHousingPopBonus(vtc, state) {
  if (!vtc?.vtcUpgrades) return 0;
  const scale = getVtcPopConfig(state).scale;
  let bonus = 0;
  for (const [id, amount] of Object.entries(VTC_HOUSING_POP)) {
    if (isVtcUpgradeDone(vtc, id)) bonus += amount;
  }
  return Math.round(bonus * scale);
}

/** Total manpower cap for a player from settlements only. */
export function calcPlayerPopCap(state, player) {
  const cfg = getVtcPopConfig(state);
  let cap = 0;
  for (const b of state.buildings || []) {
    if (Number(b.owner) !== Number(player) || b.underConstruction) continue;
    if (SETTLEMENT_POP_TYPES.has(b.type)) {
      cap += settlementPopBase(b.type, cfg) + getVtcHousingPopBonus(b, state);
      if (isCapitalSettlement(b)) {
        cap += Math.round(CAPITAL_POP_BONUS * getVtcPopConfig(state).scale);
      }
    } else if (b.type === 'HQ') {
      cap += cfg.hq;
    }
  }
  if (cap <= 0) cap = cfg.village;
  return cap;
}
