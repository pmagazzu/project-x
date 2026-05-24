/** Balanced procedural spawn + victory-point placement for N-player maps. */

const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function hexDistance(q1, r1, q2, r2) {
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function distFromMapCenter(q, r, mapSize) {
  const c = Math.floor(mapSize / 2);
  return hexDistance(q, r, c, c);
}

/** Minimum hex distance every HQ must keep from all others. */
export function minSpawnSeparation(mapSize, playerCount) {
  const n = Math.max(2, playerCount);
  return Math.max(
    Math.floor(mapSize * 0.24),
    Math.floor((mapSize * 0.72) / Math.sqrt(n)),
  );
}

/** How far VP hexes must stay from any starting HQ. */
export function minVictoryZoneHqDistance(mapSize, playerCount) {
  const n = Math.max(2, playerCount);
  return Math.max(
    Math.floor(mapSize * 0.16),
    Math.floor((mapSize * 0.42) / Math.sqrt(n)),
  );
}

function candidateQuality(c) {
  return (c.walkNeighbors || 0) * 8 + Math.min(36, (c.compSize || 0) * 0.1);
}

function normalizeAngle(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function angleDiff(a, b) {
  let d = Math.abs(normalizeAngle(a - b));
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/**
 * Pick N HQ locations: perimeter-biased, max-min hex separation, sector fairness.
 */
export function pickBalancedSpawnPoints({
  mapSize,
  playerCount,
  candidates,
  twoPlayerBands = false,
  isWalkable,
  walkCompSize,
  minSpawnComp,
}) {
  const n = Math.max(2, Math.min(6, playerCount));
  const ms = mapSize;
  const center = Math.floor(ms / 2);
  const minSep = minSpawnSeparation(ms, n);
  const minPerimeter = Math.max(4, Math.floor(ms * 0.20));

  if (n === 2 && twoPlayerBands && isWalkable && walkCompSize && minSpawnComp) {
    const findSpawnBand = (qMin, qMax) => {
      let best = null, bestScore = -Infinity;
      for (let q = qMin; q <= qMax; q++) {
        for (let r = 1; r < ms - 1; r++) {
          if (!isWalkable(q, r)) continue;
          const compSize = walkCompSize(q, r);
          if (compSize < minSpawnComp) continue;
          const walkNeighbors = NEIGHBORS.filter(([dq, dr]) => isWalkable(q + dq, r + dr)).length;
          if (walkNeighbors < 4) continue;
          const score = walkNeighbors * 10 - Math.abs(r - center) + Math.min(30, compSize * 0.08)
            + distFromMapCenter(q, r, ms) * 0.6;
          if (score > bestScore) { bestScore = score; best = { q, r }; }
        }
      }
      return best;
    };
    const p1 = findSpawnBand(Math.floor(ms * 0.06), Math.floor(ms * 0.26));
    const p2 = findSpawnBand(Math.floor(ms * 0.74), Math.floor(ms * 0.94));
    if (p1 && p2) return [p1, p2];
  }

  const enriched = (candidates || []).map((c) => ({
    ...c,
    angle: c.angle ?? Math.atan2(c.r - center, c.q - center),
    centerDist: distFromMapCenter(c.q, c.r, ms),
  }));

  let pool = enriched.filter((c) => c.centerDist >= minPerimeter);
  if (pool.length < n) pool = enriched;
  if (!pool.length) return [];

  const used = new Set();
  const picked = [];

  const minDistToPicked = (c) => {
    if (!picked.length) return Infinity;
    let minD = Infinity;
    for (const p of picked) minD = Math.min(minD, hexDistance(c.q, c.r, p.q, p.r));
    return minD;
  };

  const pickInSector = (sectorIdx, requiredSep) => {
    const targetAngle = (2 * Math.PI * sectorIdx) / n - Math.PI / 2;
    let best = null, bestScore = -Infinity;
    for (const c of pool) {
      const key = `${c.q},${c.r}`;
      if (used.has(key)) continue;
      const minD = minDistToPicked(c);
      if (minD < requiredSep) continue;

      const ad = angleDiff(c.angle, targetAngle);
      const score =
        minD * 120 +
        c.centerDist * 18 +
        candidateQuality(c) -
        ad * 22 -
        Math.abs(c.r - center) * 0.4;

      if (score > bestScore) { bestScore = score; best = { q: c.q, r: c.r }; }
    }
    return best;
  };

  for (let i = 0; i < n; i++) {
    let pt = pickInSector(i, minSep);
    if (!pt) pt = pickInSector(i, Math.floor(minSep * 0.82));
    if (!pt) pt = pickInSector(i, Math.floor(minSep * 0.65));

    if (!pt) {
      let best = null, bestScore = -1;
      for (const c of pool) {
        const key = `${c.q},${c.r}`;
        if (used.has(key)) continue;
        const minD = minDistToPicked(c);
        const score = minD * 100 + c.centerDist * 10 + candidateQuality(c);
        if (score > bestScore) { bestScore = score; best = { q: c.q, r: c.r }; }
      }
      pt = best;
    }

    if (pt) {
      picked.push(pt);
      used.add(`${pt.q},${pt.r}`);
    }
  }

  for (let pass = 0; pass < 2 && picked.length >= 2; pass++) {
    let worstIdx = -1, worstPairDist = Infinity;
    for (let i = 0; i < picked.length; i++) {
      for (let j = i + 1; j < picked.length; j++) {
        const d = hexDistance(picked[i].q, picked[i].r, picked[j].q, picked[j].r);
        if (d < worstPairDist) { worstPairDist = d; worstIdx = j; }
      }
    }
    if (worstPairDist >= minSep * 0.85) break;

    const replaceIdx = worstIdx >= 0 ? worstIdx : picked.length - 1;
    const others = picked.filter((_, idx) => idx !== replaceIdx);
    let best = null, bestScore = -1;
    for (const c of pool) {
      const key = `${c.q},${c.r}`;
      if (used.has(key) && `${picked[replaceIdx].q},${picked[replaceIdx].r}` !== key) continue;
      let minD = Infinity;
      for (const p of others) minD = Math.min(minD, hexDistance(c.q, c.r, p.q, p.r));
      const score = minD * 100 + c.centerDist * 12 + candidateQuality(c);
      if (score > bestScore) { bestScore = score; best = { q: c.q, r: c.r }; }
    }
    if (best) {
      used.delete(`${picked[replaceIdx].q},${picked[replaceIdx].r}`);
      picked[replaceIdx] = best;
      used.add(`${best.q},${best.r}`);
    }
  }

  return picked;
}

function terrainStrategicScore(terrainType) {
  if (terrainType === 3) return 6;
  if (terrainType === 0) return 4;
  if (terrainType === 6) return 3;
  if (terrainType === 7) return 2;
  if (terrainType === 1) return 1;
  return 0;
}

function distanceBalanceScore(dists) {
  if (!dists.length) return 0;
  const avg = dists.reduce((s, d) => s + d, 0) / dists.length;
  const variance = dists.reduce((s, d) => s + (d - avg) ** 2, 0) / dists.length;
  return avg * 1.4 - variance * 2.2;
}

function isForbiddenVictoryHex(q, r, spawns, minHqDist) {
  for (const s of spawns) {
    if (hexDistance(q, r, s.q, s.r) < minHqDist) return true;
  }
  return false;
}

/** Place VP zones on strategic, equidistant hexes — never on/near HQs. */
export function pickBalancedVictoryZones({
  mapSize,
  spawns = [],
  terrain = {},
  isWalkable,
  isValid,
}) {
  const ms = mapSize;
  const center = Math.floor(mapSize / 2);
  const n = spawns.length;
  const minHqDist = minVictoryZoneHqDistance(ms, n);
  const zones = [];
  const used = new Set();

  const tryAddZone = (q, r, pointsPerTurn, name) => {
    const key = `${q},${r}`;
    if (used.has(key)) return false;
    if (!isValid?.(q, r, ms)) return false;
    if (!isWalkable?.(q, r)) return false;
    if (isForbiddenVictoryHex(q, r, spawns, minHqDist)) return false;
    zones.push({ q, r, pointsPerTurn, name });
    used.add(key);
    return true;
  };

  const scoreHex = (q, r, opts = {}) => {
    const dists = spawns.map((s) => hexDistance(q, r, s.q, s.r));
    const t = terrain[`${q},${r}`] ?? 0;
    const centerDist = distFromMapCenter(q, r, ms);
    const centerness = opts.preferCentral
      ? -Math.abs(centerDist - ms * 0.12) * 1.2
      : -centerDist * 0.15;
    return distanceBalanceScore(dists) + terrainStrategicScore(t) + centerness;
  };

  const bestHex = (opts = {}) => {
    let best = null, bestScore = -Infinity;
    for (let q = 1; q < ms - 1; q++) {
      for (let r = 1; r < ms - 1; r++) {
        const key = `${q},${r}`;
        if (used.has(key)) continue;
        if (!isValid?.(q, r, ms)) continue;
        if (!isWalkable?.(q, r)) continue;
        if (isForbiddenVictoryHex(q, r, spawns, minHqDist)) continue;
        const score = scoreHex(q, r, opts);
        if (score > bestScore) { bestScore = score; best = { q, r }; }
      }
    }
    return best;
  };

  const hub = bestHex({ preferCentral: true });
  if (hub) tryAddZone(hub.q, hub.r, 3, 'Central Crossroads');
  else tryAddZone(center, center, 3, 'Central Crossroads');

  if (spawns.length >= 2) {
    const ordered = [...spawns]
      .map((s, i) => ({ ...s, _i: i, angle: Math.atan2(s.r - center, s.q - center) }))
      .sort((a, b) => a.angle - b.angle);

    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      const b = ordered[(i + 1) % ordered.length];
      let best = null, bestScore = -Infinity;

      for (let q = 1; q < ms - 1; q++) {
        for (let r = 1; r < ms - 1; r++) {
          const key = `${q},${r}`;
          if (used.has(key)) continue;
          if (!isValid?.(q, r, ms)) continue;
          if (!isWalkable?.(q, r)) continue;
          if (isForbiddenVictoryHex(q, r, spawns, minHqDist)) continue;

          const da = hexDistance(q, r, a.q, a.r);
          const db = hexDistance(q, r, b.q, b.r);
          const corridor = -Math.abs(da - db) * 2.2 + Math.min(da, db) * 0.35;
          const t = terrain[`${q},${r}`] ?? 0;
          const score = corridor + terrainStrategicScore(t) + distanceBalanceScore(
            spawns.map((s) => hexDistance(q, r, s.q, s.r)),
          );

          if (score > bestScore) { bestScore = score; best = { q, r }; }
        }
      }

      if (best) tryAddZone(best.q, best.r, 1, `Contested Zone ${i + 1}`);
    }
  }

  if (!zones.length) {
    return [{ q: center, r: center, pointsPerTurn: 3, name: 'Central Crossroads' }];
  }

  return zones;
}
