/** Win by holding every settlement (VTC) on the map for N consecutive game turns. */
import { VICTORY_MODES } from './GameConfig.js';

export const VTC_CONTROL_TURNS_DEFAULT = 5;
const VTC_TYPES = new Set(['VILLAGE', 'TOWN', 'CITY']);

export function listMapVtcs(state) {
  return (state.buildings || []).filter(b => VTC_TYPES.has(b.type) && !b.underConstruction);
}

export function getVtcControlStatus(state) {
  const vtcs = listMapVtcs(state);
  const target = state.vtcControlTurns ?? VTC_CONTROL_TURNS_DEFAULT;
  const streak = state.vtcControlStreak;
  if (!vtcs.length) {
    return { vtcs: 0, controller: null, streak: 0, target, complete: false };
  }
  const owners = [...new Set(vtcs.map(b => Number(b.owner)))];
  const controller = owners.length === 1 && owners[0] > 0 ? owners[0] : null;
  const activeStreak = controller && streak?.player === controller ? (streak.turns || 0) : 0;
  return {
    vtcs: vtcs.length,
    controller,
    streak: activeStreak,
    target,
    complete: activeStreak >= target,
  };
}

/** Call once per game turn (when turn counter advances). Returns winner id or null. */
export function tickVtcControlVictory(state, events = []) {
  if (state.victoryMode !== VICTORY_MODES.VTC_CONTROL) return null;

  const vtcs = listMapVtcs(state);
  const target = state.vtcControlTurns ?? VTC_CONTROL_TURNS_DEFAULT;
  if (!vtcs.length) {
    state.vtcControlStreak = null;
    return null;
  }

  const owners = new Set(vtcs.map(b => Number(b.owner)));
  let controller = null;
  if (owners.size === 1) {
    const only = [...owners][0];
    if (only > 0) controller = only;
  }

  if (!controller) {
    if (state.vtcControlStreak?.turns > 0) {
      events.push(`VTC control reset — capture every village, town, and city (${target} turns to win)`);
    }
    state.vtcControlStreak = null;
    return null;
  }

  const prev = state.vtcControlStreak;
  if (prev?.player === controller) {
    prev.turns += 1;
  } else {
    state.vtcControlStreak = { player: controller, turns: 1 };
    events.push(`P${controller} controls all ${vtcs.length} settlements (1/${target})`);
  }

  const turns = state.vtcControlStreak.turns;
  if (turns > 1 && turns < target) {
    events.push(`P${controller} holds all settlements (${turns}/${target} turns)`);
  }
  if (turns >= target) {
    events.push(`P${controller} wins — all settlements held ${target} turns!`);
    return controller;
  }
  return null;
}

export function checkVtcControlWinner(state) {
  if (state.victoryMode !== VICTORY_MODES.VTC_CONTROL) return null;
  const target = state.vtcControlTurns ?? VTC_CONTROL_TURNS_DEFAULT;
  const s = state.vtcControlStreak;
  if (s?.player > 0 && (s.turns || 0) >= target) return s.player;
  return null;
}
