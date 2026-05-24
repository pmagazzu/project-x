/** Shared game configuration — multi-team + victory modes (scaffolding for 2→6 players). */

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;

/** Team tint colors (hex counters, UI accents). */
export const PLAYER_COLORS = {
  1: 0x4488ff,
  2: 0xff4444,
  3: 0x44cc66,
  4: 0xffcc44,
  5: 0xcc66ff,
  6: 0xff8844,
};

export const PLAYER_LABELS = {
  1: 'Blue',
  2: 'Red',
  3: 'Green',
  4: 'Gold',
  5: 'Purple',
  6: 'Orange',
};

export const VICTORY_MODES = {
  ELIMINATION: 'elimination',
  POINTS: 'points',
};

export function clampPlayerCount(n) {
  const v = Number(n) || MIN_PLAYERS;
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(v)));
}

export function getPlayerIds(state) {
  const keys = Object.keys(state?.players || {}).map(Number).filter((n) => n >= 1);
  return keys.length ? keys.sort((a, b) => a - b) : [1, 2];
}

export function getPlayerColor(player) {
  return PLAYER_COLORS[Number(player)] ?? 0xaaaaaa;
}
export function makeVictoryPointLedger(playerIds) {
  const vp = {};
  for (const p of playerIds) vp[p] = 0;
  return vp;
}

/** Default VP zones — override per map / scenario later. */
export function defaultVictoryZones(mapSize = 40) {
  const c = Math.floor(mapSize / 2);
  return [
    { q: c, r: c, pointsPerTurn: 2, name: 'Central Crossroads' },
    { q: c - 4, r: c, pointsPerTurn: 1, name: 'West Approach' },
    { q: c + 4, r: c, pointsPerTurn: 1, name: 'East Approach' },
  ];
}

/** VP zones from procedural HQ placements (center + contested wedges). */
export function victoryZonesForSpawns(mapSize, spawns = []) {
  const c = Math.floor(mapSize / 2);
  const zones = [{ q: c, r: c, pointsPerTurn: 3, name: 'Central Crossroads' }];
  if (!spawns?.length) return defaultVictoryZones(mapSize);

  const ordered = [...spawns]
    .map((s, i) => ({ ...s, _i: i }))
    .sort((a, b) => Math.atan2(a.r - c, a.q - c) - Math.atan2(b.r - c, b.q - c));

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const next = ordered[(i + 1) % ordered.length];
    const q = Math.max(1, Math.min(mapSize - 2, Math.round((s.q + next.q + c) / 3)));
    const r = Math.max(1, Math.min(mapSize - 2, Math.round((s.r + next.r + c) / 3)));
    const dup = zones.some(z => z.q === q && z.r === r);
    if (dup) continue;
    zones.push({ q, r, pointsPerTurn: 1, name: `Contested Zone ${i + 1}` });
  }
  return zones;
}
