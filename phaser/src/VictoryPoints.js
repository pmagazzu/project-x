import { ROAD_TYPES, buildingAt } from './GameState.js';
import { getPlayerIds } from './GameConfig.js';

/** Who controls a VP hex this turn (unit on tile beats building). */
export function getVictoryZoneController(state, zone) {
  const unit = state.units.find((u) => !u.dead && !u.embarked && u.q === zone.q && u.r === zone.r);
  if (unit) return Number(unit.owner);
  const b = buildingAt(state, zone.q, zone.r);
  if (b && !ROAD_TYPES.has(b.type) && !b.underConstruction) return Number(b.owner);
  return null;
}

/** Award VP each time a full round completes (call once per round). */
export function tickVictoryPoints(state, events = []) {
  if (state.victoryMode !== 'points') return;
  const zones = state.victoryZones || [];
  if (!zones.length) return;
  if (!state.victoryPoints) state.victoryPoints = {};
  for (const zone of zones) {
    const owner = getVictoryZoneController(state, zone);
    if (!owner) continue;
    const pts = zone.pointsPerTurn || 1;
    state.victoryPoints[owner] = (state.victoryPoints[owner] || 0) + pts;
    events.push(`P${owner} +${pts} VP — ${zone.name || `(${zone.q},${zone.r})`} (total ${state.victoryPoints[owner]})`);
  }
}

export function getVictoryPointLeader(state) {
  const ids = getPlayerIds(state);
  let best = null;
  let bestPts = -1;
  for (const p of ids) {
    const pts = state.victoryPoints?.[p] || 0;
    if (pts > bestPts) { bestPts = pts; best = p; }
  }
  return { player: best, points: bestPts };
}

export function checkVictoryPointWinner(state) {
  if (state.victoryMode !== 'points') return null;
  const target = state.victoryPointTarget || 100;
  const ids = getPlayerIds(state);
  for (const p of ids) {
    if ((state.victoryPoints?.[p] || 0) >= target) return p;
  }
  return null;
}
