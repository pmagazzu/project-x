import {
  BUILDING_TYPES, canEngineerBuildAt, roadAt,
} from './GameState.js';

/** Engineers: roads, resource extraction, field defenses only. VTC upgrades use the build menu. */
export const ENGINEER_BUILD_CATEGORIES = [
  { key: 'roads', label: 'ROADS' },
  { key: 'extract', label: 'RES' },
  { key: 'def', label: 'DEF' },
];

export function getEngineerBuildOptions(scene, unit) {
  const gs = scene.gameState;
  const p = gs.currentPlayer;
  const noBuilding = canEngineerBuildAt(gs, unit.q, unit.r, 'BARRACKS');
  const canFort = canEngineerBuildAt(gs, unit.q, unit.r, 'FORT_T1');
  const res = gs.resourceHexes[`${unit.q},${unit.r}`];
  const iron = gs.players[p].iron;
  const oil = gs.players[p].oil;
  const wood = gs.players[p].wood || 0;
  const coastal = scene._isCoastalHex(unit.q, unit.r);
  const unlocked = new Set(gs.players[p].research?.unlocked || []);
  const comp = gs.players[p].components || 0;

  const allOpts = [];
  let cat = 'roads';
  const addHeader = (label, category = cat) => {
    allOpts.push({ header: true, label: `── ${label} ──`, category, enabled: false, cb: () => {} });
  };
  const push = (o) => allOpts.push({ ...o, category: cat });

  addHeader('ROADS');
  const existingRoad = roadAt(gs, unit.q, unit.r);
  const existingTier = existingRoad ? (BUILDING_TYPES[existingRoad.type]?.roadTier ?? 0) : -1;
  if (!existingRoad) {
    push({ label: 'Dirt Road   1🪵', enabled: wood >= 1, cb: () => scene._onBuildRoad('ROAD') });
  } else if (existingTier < 1 && unlocked.has('gravel_roads')) {
    push({ label: 'Upgrade→Gravel  1⚙ 1🪵', enabled: iron >= 1 && wood >= 1, cb: () => scene._onUpgradeRoad(unit, 'GRAVEL_ROAD') });
  } else if (existingTier < 2 && unlocked.has('concrete_roads')) {
    push({ label: 'Upgrade→Concrete  2⚙', enabled: iron >= 2, cb: () => scene._onUpgradeRoad(unit, 'CONCRETE_ROAD') });
  } else if (existingTier < 3 && unlocked.has('railways')) {
    push({ label: 'Upgrade→Railway  4⚙ 1🛢 2🪵', enabled: iron >= 4 && oil >= 1 && wood >= 2, cb: () => scene._onUpgradeRoad(unit, 'RAILWAY') });
  }
  if (unit.roadOrder) {
    push({ label: '✕ CANCEL ROAD ORDER', enabled: true, cb: () => { delete unit.roadOrder; scene._hideContextMenu(true); scene._refresh(); } });
  } else {
    push({ label: 'AUTO-ROAD →', enabled: true, cb: () => scene._enterRoadDestMode(unit) });
  }

  cat = 'extract';
  addHeader('RESOURCE EXTRACTION');
  if (res && noBuilding) {
    push({
      label: res.type === 'OIL' ? 'Oil Pump   4⚙ 2🛢' : 'Mine        4⚙',
      enabled: res.type === 'OIL' ? iron >= 4 && oil >= 2 : iron >= 4,
      cb: () => scene._onBuildMine(res.type),
    });
  }
  const ttype = scene.terrain[`${unit.q},${unit.r}`] ?? 0;
  const onForest = ttype === 1 || ttype === 7;
  if (onForest && noBuilding) {
    push({ label: 'Lumber Camp 2⚙', enabled: iron >= 2, cb: () => scene._onBuildLumberCamp() });
  }
  if (noBuilding && onForest === false && (ttype === 0 || ttype === 6)) {
    push({ label: 'Farm 🍞 (field) 2⚙ 3🪵', enabled: iron >= 2 && wood >= 3, cb: () => scene._onBuildStructure('FARM', 2, 0, 3) });
  }

  cat = 'def';
  addHeader('DEFENSE & OBSTACLES');
  const fortMenu = [
    { key: 'FORT_T0', tech: 'sandbag_improved', label: 'T0 Foxhole 1🪵', cost: { wood: 1 } },
    { key: 'FORT_T1', tech: null, label: 'T1 Splinter Pit 1⚙ 1🪵', cost: { iron: 1, wood: 1 } },
    { key: 'FORT_T2', tech: 'entrenching_tools', label: 'T2 Field Trench 2🪵', cost: { wood: 2 } },
    { key: 'FORT_T3', tech: 'bunker', label: 'T3 Pillbox 3⚙ 2🪵', cost: { iron: 3, wood: 2 } },
    { key: 'FORT_T4', tech: 'hardened_bunker', label: 'T4 Bunker 5⚙ 3🪵 1🧩', cost: { iron: 5, wood: 3, components: 1 } },
    { key: 'FORT_T5', tech: 'superfortress', label: 'T5 Superfort 8⚙ 2🪵 2🧩 🔩', cost: { iron: 8, wood: 2, components: 2, hardenedSteel: 1 } },
  ];
  for (const fo of fortMenu) {
    if (!canFort) continue;
    if (fo.tech && !unlocked.has(fo.tech)) continue;
    const c = fo.cost;
    const steel = gs.players[p].hardenedSteel || 0;
    const enabled = iron >= (c.iron || 0) && wood >= (c.wood || 0) && oil >= (c.oil || 0)
      && comp >= (c.components || 0) && steel >= (c.hardenedSteel || 0);
    push({
      label: fo.label,
      enabled,
      cb: () => scene._onBuildStructure(fo.key, c.iron || 0, c.oil || 0, c.wood || 0, c.components || 0, c.hardenedSteel || 0),
    });
  }
  if (noBuilding) push({ label: 'Obs. Post   3⚙', enabled: iron >= 3, cb: () => scene._onBuildStructure('OBS_POST', 3) });
  if (unlocked.has('barbed_wire') && noBuilding) push({ label: 'Barbed Wire 1🪵', enabled: wood >= 1, cb: () => scene._onBuildStructure('BARBED_WIRE', 0, 0, 1) });
  if (coastal) push({ label: 'Coast. Battery 6⚙ 1🛢', enabled: iron >= 6 && oil >= 1, cb: () => scene._onBuildCoastalBattery() });
  push({ label: 'AA Emplacement 4⚙ 1🛢', enabled: iron >= 4 && oil >= 1, cb: () => scene._onBuildAAEmplacement() });

  return allOpts;
}
