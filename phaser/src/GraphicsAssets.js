/** Central art paths, UI theme, and sprite lookup for the graphics pass. */

export const GAME_THEME = {
  hudBg:       0x0c1018,
  hudStroke:   0xff66cc,
  hudAccent:   0xffcc44,
  hudText:     '#d8ead8',
  hudMuted:    '#8899aa',
  panelInset:  0x1a1028,
  moveFill:    0x00ffcc,
  attackFill:  0xff6600,
  fogFill:     0x0a1428,
  fogAlpha:    0.72,
};

/** unit type → user_art sprite (fallback to NATO counter when missing). */
export const UNIT_ART = {
  INFANTRY: 'unit_infantry',
  ASSAULT_INFANTRY: 'unit_infantry',
  SMG_SQUAD: 'unit_infantry',
  LMG_TEAM: 'unit_infantry',
  HMG_TEAM: 'unit_infantry',
  SNIPER: 'unit_infantry',
  TANK: 'unit_tank',
  MEDIUM_TANK: 'unit_tank',
  ARTILLERY: 'unit_artillery',
  SPG: 'unit_artillery',
  MORTAR: 'unit_artillery',
  ENGINEER: 'unit_engineer',
  RECON: 'unit_recon',
  ANTI_TANK: 'unit_anti_tank',
  MEDIC: 'unit_medic',
  PATROL_BOAT: 'unit_patrol_boat',
  MOTOR_GUNBOAT: 'unit_patrol_boat',
  MTB: 'unit_patrol_boat',
  TORPEDO_BOAT: 'unit_patrol_boat',
  SUBMARINE: 'unit_submarine',
  DESTROYER: 'unit_destroyer',
  DESTROYER_MK1: 'unit_destroyer',
  CRUISER_LT: 'unit_cruiser_light',
  CRUISER_HV: 'unit_cruiser_heavy',
  BATTLESHIP: 'unit_battleship',
  LANDING_CRAFT: 'unit_landing_craft',
  TRANSPORT_SM: 'unit_landing_craft',
  TRANSPORT_MD: 'unit_landing_craft',
  TRANSPORT_LG: 'unit_landing_craft',
  SUPPLY_SHIP: 'unit_landing_craft',
  SUPPLY_TRUCK: 'unit_truck',
  HALFTRACK: 'unit_truck',
  ARMORED_CAR: 'unit_truck',
  MOTORCYCLE: 'unit_recon',
};

export const BUILDING_ART = {
  HQ: 'bld_hq',
  BARRACKS: 'bld_barracks',
  ADV_BARRACKS: 'bld_barracks',
  MINE: 'bld_mine',
  OIL_PUMP: 'bld_oil_pump',
  NAVAL_YARD: 'bld_naval_yard',
  NAVAL_DOCKYARD: 'bld_naval_yard',
  HARBOR: 'bld_harbor',
  PORT: 'bld_harbor',
  VEHICLE_DEPOT: 'bld_vehicle_depot',
  ARMOR_WORKS: 'bld_vehicle_depot',
  DRY_DOCK: 'bld_dry_dock',
  NAVAL_BASE: 'bld_naval_base',
  OBS_POST: 'bld_obs_post',
  FORT_T0: 'bld_bunker',
  FORT_T1: 'bld_bunker',
  FORT_T2: 'bld_bunker',
  FORT_T3: 'bld_bunker',
  FORT_T4: 'bld_bunker',
  FORT_T5: 'bld_bunker',
};

const UNIT_ART_FILES = {
  unit_infantry: 'user_art/infantry.png',
  unit_tank: 'user_art/tank.png',
  unit_artillery: 'user_art/artillery.png',
  unit_engineer: 'user_art/engineer.png',
  unit_recon: 'user_art/recon.png',
  unit_anti_tank: 'user_art/anti_tank.png',
  unit_mortar: 'user_art/mortar.png',
  unit_medic: 'user_art/medic.png',
  unit_patrol_boat: 'user_art/patrol_boat.png',
  unit_submarine: 'user_art/submarine.png',
  unit_destroyer: 'user_art/destroyer_t1.png',
  unit_cruiser_light: 'user_art/cruiser_light.png',
  unit_cruiser_heavy: 'user_art/cruiser_heavy.png',
  unit_battleship: 'user_art/battleship.png',
  unit_landing_craft: 'user_art/landing_craft.png',
  unit_truck: 'user_art/truck.png',
};

const BUILDING_ART_FILES = {
  bld_hq: 'user_art/hq.png',
  bld_barracks: 'user_art/barracks.png',
  bld_mine: 'user_art/mine.png',
  bld_oil_pump: 'user_art/oil_pump.png',
  bld_naval_yard: 'user_art/naval_yard.png',
  bld_harbor: 'user_art/harbor.png',
  bld_vehicle_depot: 'user_art/vehicle_depot.png',
  bld_dry_dock: 'user_art/dry_dock.png',
  bld_naval_base: 'user_art/naval_base.png',
  bld_obs_post: 'user_art/obs_post.png',
  bld_bunker: 'user_art/bunker.png',
};

export function getUnitArtTextureKey(unitType) {
  return UNIT_ART[unitType] || null;
}

export function getBuildingArtTextureKey(buildingType) {
  return BUILDING_ART[buildingType] || null;
}

export function hasUnitSprite(scene, unitType) {
  const key = getUnitArtTextureKey(unitType);
  return !!(key && scene.textures?.exists(key));
}

export function hasBuildingSprite(scene, buildingType) {
  const key = getBuildingArtTextureKey(buildingType);
  return !!(key && scene.textures?.exists(key));
}

/** Register all unit/building sprites on the loader (missing files are skipped at runtime). */
export function preloadSpriteArt(scene) {
  const all = { ...UNIT_ART_FILES, ...BUILDING_ART_FILES };
  for (const [key, file] of Object.entries(all)) {
    if (!scene.textures.exists(key)) scene.load.image(key, file);
  }
}

/**
 * Place a world-space sprite scaled to max height; returns the image or null.
 */
export function placeWorldSprite(scene, layer, textureKey, x, y, maxHeight, tint, alpha = 1, depth = 0) {
  if (!textureKey || !scene.textures.exists(textureKey)) return null;
  const frame = scene.textures.getFrame(textureKey);
  const h = frame?.height || 32;
  const w = frame?.width || 32;
  const scale = maxHeight / Math.max(1, h);
  const spr = scene.add.image(x, y, textureKey)
    .setScale(scale)
    .setAlpha(alpha)
    .setDepth(depth);
  if (tint != null) spr.setTint(tint);
  if (layer) layer.add(spr);
  return spr;
}

/** Richer terrain palette (base layer under PNG tiles). */
export const TERRAIN_COLORS_V2 = {
  0: { fill: 0x7a9a48, stroke: 0x5a7a32 },
  1: { fill: 0x1a4810, stroke: 0x0c2808 },
  2: { fill: 0x7a6e62, stroke: 0x5a5048 },
  3: { fill: 0x7a9a48, stroke: 0x5a7a32 },
  4: { fill: 0x3d8aaa, stroke: 0x2a6888 },
  5: { fill: 0x0c2444, stroke: 0x061828 },
  6: { fill: 0xc8b060, stroke: 0xa08840 },
  7: { fill: 0x4a7028, stroke: 0x345018 },
};
