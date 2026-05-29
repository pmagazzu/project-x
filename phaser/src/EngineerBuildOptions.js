import {
  BUILDING_TYPES, canEngineerBuildAt, roadAt,
} from './GameState.js';

export const ENGINEER_BUILD_CATEGORIES = [
  { key: 'roads', label: 'ROADS' },
  { key: 'extract', label: 'RES' },
  { key: 'mil', label: 'MIL' },
  { key: 'def', label: 'DEF' },
  { key: 'civ', label: 'CIV' },
];

/** All engineer build actions for context menu + bottom panel (tagged by category). */
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
  const ttype = scene.terrain[`${unit.q},${unit.r}`] ?? 0;
  const onForest = ttype === 1 || ttype === 7;
  const onPlains = ttype === 0 || ttype === 6 || ttype === 7;
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
  if (onForest && noBuilding) {
    push({ label: 'Lumber Camp 2⚙', enabled: iron >= 2, cb: () => scene._onBuildLumberCamp() });
  }

  cat = 'mil';
  addHeader('LAND MILITARY');
  if (noBuilding) push({ label: 'Barracks    4⚙ 4🪵', enabled: iron >= 4 && wood >= 4, cb: () => scene._onBuildStructure('BARRACKS', 4, 0, 4) });
  if (noBuilding) push({ label: 'Vehicle Depot 8⚙ 2🛢', enabled: iron >= 8 && oil >= 2, cb: () => scene._onBuildStructure('VEHICLE_DEPOT', 8, 2) });
  if (noBuilding) push({ label: 'Adv Barracks T2 10⚙ 2🛢 6🪵 2🧩', enabled: iron >= 10 && oil >= 2 && wood >= 6 && comp >= 2, cb: () => scene._onBuildStructure('ADV_BARRACKS', 10, 2, 6, 2) });
  if (noBuilding) push({ label: 'Armor Works T2 14⚙ 4🛢 4🪵 3🧩', enabled: iron >= 14 && oil >= 4 && wood >= 4 && comp >= 3, cb: () => scene._onBuildStructure('ARMOR_WORKS', 14, 4, 4, 3) });
  if (noBuilding) push({ label: 'Airfield     6⚙ 2🛢 2🪵', enabled: iron >= 6 && oil >= 2 && wood >= 2, cb: () => scene._onBuildStructure('AIRFIELD', 6, 2, 2) });
  if (noBuilding) push({ label: 'Adv Airfield T2 12⚙ 5🛢 4🪵 3🧩', enabled: iron >= 12 && oil >= 5 && wood >= 4 && comp >= 3, cb: () => scene._onBuildStructure('ADV_AIRFIELD', 12, 5, 4, 3) });
  addHeader('NAVAL');
  if (noBuilding && coastal) push({ label: 'Naval Yard  8⚙ 2🛢', enabled: iron >= 8 && oil >= 2, cb: () => scene._onBuildStructure('NAVAL_YARD', 8, 2) });
  if (noBuilding && coastal) push({ label: 'Harbor      5⚙ 1🛢 1🧩', enabled: iron >= 5 && oil >= 1 && comp >= 1, cb: () => scene._onBuildStructure('HARBOR', 5, 1, 0, 1) });
  if (noBuilding && coastal) push({ label: 'Dry Dock   12⚙ 4🛢 2🧩', enabled: iron >= 12 && oil >= 4 && comp >= 2, cb: () => scene._onBuildStructure('DRY_DOCK', 12, 4, 0, 2) });
  if (noBuilding && coastal) push({ label: 'Naval Base 16⚙ 6🛢 3🧩', enabled: iron >= 16 && oil >= 6 && comp >= 3, cb: () => scene._onBuildStructure('NAVAL_BASE', 16, 6, 0, 3) });
  if (noBuilding && coastal) push({ label: 'Naval Dockyard T2 16⚙ 5🛢 4🪵 3🧩', enabled: iron >= 16 && oil >= 5 && wood >= 4 && comp >= 3, cb: () => scene._onBuildStructure('NAVAL_DOCKYARD', 16, 5, 4, 3) });

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
  if (unlocked.has('supply_depot') && noBuilding) push({ label: 'Supply Depot 3⚙ 1🛢 1🪵', enabled: iron >= 3 && oil >= 1 && wood >= 1, cb: () => scene._onBuildStructure('SUPPLY_DEPOT', 3, 1, 1) });
  if (unlocked.has('supply_depot') && noBuilding && coastal) {
    push({ label: 'Supply Port 6⚙ 2🛢 3🪵 1🧩', enabled: iron >= 6 && oil >= 2 && wood >= 3 && comp >= 1, cb: () => scene._onBuildStructure('SUPPLY_PORT', 6, 2, 3, 1) });
  }

  cat = 'civ';
  addHeader('POPULATION & HOUSING');
  const popLine = (key, label, cost, extra = '') => {
    const d = BUILDING_TYPES[key];
    if (d?.requiresTech && !unlocked.has(d.requiresTech)) return;
    const c = cost || d.buildCost || {};
    const enabled = iron >= (c.iron || 0) && wood >= (c.wood || 0) && oil >= (c.oil || 0)
      && comp >= (c.components || 0) && noBuilding && onPlains;
    push({ label: `${label}${extra}`, enabled, cb: () => scene._onBuildStructure(key, c.iron || 0, c.oil || 0, c.wood || 0, c.components || 0) });
  };
  if (onPlains) {
    popLine('HOUSING_SLUMS', 'Slums T0  +1 pop', { iron: 1, wood: 2 }, ' (no cap)');
    popLine('HOUSING_RURAL', 'Rural T1  +1 cap', { iron: 2, wood: 4 });
    popLine('HOUSING_SUBURB', 'Suburb  +2 cap +1/t', { iron: 4, wood: 5 });
    popLine('HOUSING_DISTRICT', 'District T2  +3 cap +1/t', { iron: 6, wood: 6, components: 1 });
    popLine('HOUSING_BOROUGH', 'Borough T3  +5 cap +2/t', { iron: 8, wood: 8, components: 2 });
    popLine('HOUSING_METRO', 'Metro T4  +8 cap +3/t', { iron: 12, wood: 10, components: 3 });
  }
  addHeader('ECONOMY & RESEARCH');
  if (noBuilding && onPlains) push({ label: 'Farm 🍞     2⚙ 3🪵', enabled: iron >= 2 && wood >= 3, cb: () => scene._onBuildStructure('FARM', 2, 0, 3) });
  if (noBuilding) push({ label: 'Market 💰   3⚙ 4🪵', enabled: iron >= 3 && wood >= 4, cb: () => scene._onBuildStructure('MARKET', 3, 0, 4) });
  if (noBuilding && coastal) push({ label: 'Port ⚓ T1 5⚙ 1🛢 4🪵', enabled: iron >= 5 && oil >= 1 && wood >= 4, cb: () => scene._onBuildStructure('PORT', 5, 1, 4) });
  if (noBuilding) push({ label: 'Science Lab ⚗  6⚙ 4🪵', enabled: iron >= 6 && wood >= 4, cb: () => scene._onBuildStructure('SCIENCE_LAB', 6, 0, 4) });
  if (noBuilding) push({ label: 'Factory 🧩    10⚙ 3🛢 8🪵', enabled: iron >= 10 && oil >= 3 && wood >= 8, cb: () => scene._onBuildStructure('FACTORY', 10, 3, 8) });
  if (coastal) push({ label: 'Coast. Battery 6⚙ 1🛢', enabled: iron >= 6 && oil >= 1, cb: () => scene._onBuildCoastalBattery() });
  push({ label: 'AA Emplacement 4⚙ 1🛢', enabled: iron >= 4 && oil >= 1, cb: () => scene._onBuildAAEmplacement() });

  return allOpts;
}
