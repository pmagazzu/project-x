/** Wargame-style building counter labels (matches unit rectangle aesthetic). */

export const BUILDING_COUNTER_GLYPH = {
  HQ: 'HQ',
  BARRACKS: 'Ba',
  ADV_BARRACKS: 'B+',
  MINE: 'Mi',
  OIL_PUMP: 'Op',
  LUMBER_CAMP: 'Lc',
  FARM: 'Fm',
  VEHICLE_DEPOT: 'Vd',
  ARMOR_WORKS: 'Aw',
  AIRFIELD: 'Af',
  ADV_AIRFIELD: 'A+',
  NAVAL_YARD: 'Ny',
  NAVAL_DOCKYARD: 'Nd',
  HARBOR: 'Hb',
  PORT: 'Pt',
  SUPPLY_PORT: 'Sp',
  DRY_DOCK: 'Dd',
  NAVAL_BASE: 'Nb',
  OBS_POST: 'Ob',
  SCIENCE_LAB: 'Lb',
  FACTORY: 'Fx',
  MARKET: 'Mk',
  FORT_T0: 'F0',
  FORT_T1: 'F1',
  FORT_T2: 'F2',
  FORT_T3: 'F3',
  FORT_T4: 'F4',
  FORT_T5: 'F5',
  SANDBAG: 'F0',
  TRENCH: 'F2',
  BUNKER: 'F3',
  FIELD_OUTPOST: 'Fo',
  SUPPLY_DEPOT: 'Sd',
  SUPPLY_WAREHOUSE: 'Sw',
  BARBED_WIRE: 'Bw',
  AT_DITCH: 'At',
  PONTOON_BRIDGE: 'Pb',
  HOUSING_SLUMS: 'H0',
  HOUSING_RURAL: 'H1',
  HOUSING_SUBURB: 'H2',
  HOUSING_DISTRICT: 'H3',
  HOUSING_BOROUGH: 'H4',
  HOUSING_METRO: 'H5',
};

export function getBuildingCounterGlyph(type) {
  if (BUILDING_COUNTER_GLYPH[type]) return BUILDING_COUNTER_GLYPH[type];
  if (type?.startsWith('FORT_T')) return `F${type.replace('FORT_T', '')}`;
  if (type?.startsWith('HOUSING_')) return 'H';
  return (type || '??').slice(0, 2);
}
