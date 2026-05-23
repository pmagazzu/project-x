/** UI theme + procedural pixel sprite keys (32×32, see PixelSpriteArt.js). */

import { registerPixelSprites, hasPixelTexture } from './PixelSpriteArt.js';

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

/** unit type → procedural texture key (each role gets a distinct silhouette). */
export const UNIT_ART = {
  INFANTRY: 'px_unit_infantry',
  ASSAULT_INFANTRY: 'px_unit_assault',
  SMG_SQUAD: 'px_unit_smg',
  LMG_TEAM: 'px_unit_lmg',
  HMG_TEAM: 'px_unit_hmg',
  SNIPER: 'px_unit_sniper',
  TANK: 'px_unit_tank',
  MEDIUM_TANK: 'px_unit_tank',
  ARTILLERY: 'px_unit_artillery',
  SPG: 'px_unit_artillery',
  MORTAR: 'px_unit_mortar',
  ENGINEER: 'px_unit_engineer',
  RECON: 'px_unit_recon',
  ANTI_TANK: 'px_unit_anti_tank',
  MEDIC: 'px_unit_medic',
  PATROL_BOAT: 'px_unit_patrol_boat',
  MOTOR_GUNBOAT: 'px_unit_patrol_boat',
  MTB: 'px_unit_patrol_boat',
  TORPEDO_BOAT: 'px_unit_patrol_boat',
  SUBMARINE: 'px_unit_submarine',
  DESTROYER: 'px_unit_destroyer',
  DESTROYER_MK1: 'px_unit_destroyer',
  CRUISER_LT: 'px_unit_cruiser_light',
  CRUISER_HV: 'px_unit_cruiser_heavy',
  BATTLESHIP: 'px_unit_battleship',
  LANDING_CRAFT: 'px_unit_landing_craft',
  TRANSPORT_SM: 'px_unit_landing_craft',
  TRANSPORT_MD: 'px_unit_landing_craft',
  TRANSPORT_LG: 'px_unit_landing_craft',
  SUPPLY_SHIP: 'px_unit_landing_craft',
  SUPPLY_TRUCK: 'px_unit_truck',
  HALFTRACK: 'px_unit_halftrack',
  ARMORED_CAR: 'px_unit_armored_car',
  MOTORCYCLE: 'px_unit_motorcycle',
  BIPLANE_FIGHTER: 'px_unit_aircraft',
  LIGHT_BOMBER: 'px_unit_aircraft',
  OBS_PLANE: 'px_unit_aircraft',
  MONOPLANE_FIGHTER: 'px_unit_aircraft',
  DIVE_BOMBER: 'px_unit_aircraft',
  HEAVY_BOMBER: 'px_unit_aircraft',
  COASTAL_BATTERY: 'px_unit_artillery',
  AA_EMPLACEMENT: 'px_unit_anti_tank',
};

export const BUILDING_ART = {
  HQ: 'px_bld_hq',
  BARRACKS: 'px_bld_barracks',
  ADV_BARRACKS: 'px_bld_barracks',
  MINE: 'px_bld_mine',
  OIL_PUMP: 'px_bld_oil_pump',
  NAVAL_YARD: 'px_bld_naval_yard',
  NAVAL_DOCKYARD: 'px_bld_naval_yard',
  HARBOR: 'px_bld_harbor',
  PORT: 'px_bld_harbor',
  VEHICLE_DEPOT: 'px_bld_vehicle_depot',
  ARMOR_WORKS: 'px_bld_vehicle_depot',
  DRY_DOCK: 'px_bld_dry_dock',
  NAVAL_BASE: 'px_bld_naval_base',
  OBS_POST: 'px_bld_obs_post',
  FORT_T0: 'px_bld_bunker',
  FORT_T1: 'px_bld_bunker',
  FORT_T2: 'px_bld_bunker',
  FORT_T3: 'px_bld_bunker',
  FORT_T4: 'px_bld_bunker',
  FORT_T5: 'px_bld_bunker',
  FARM: 'px_bld_farm',
};

/** Hex farm overlay (terrain-style, not building icon). */
export const FARM_TILE_ART = 'px_terrain_farm';

export function getUnitArtTextureKey(unitType) {
  return UNIT_ART[unitType] || null;
}

export function getBuildingArtTextureKey(buildingType) {
  return BUILDING_ART[buildingType] || null;
}

export function hasUnitSprite(scene, unitType) {
  const key = getUnitArtTextureKey(unitType);
  return hasPixelTexture(scene, key);
}

export function hasBuildingSprite(scene, buildingType) {
  const key = getBuildingArtTextureKey(buildingType);
  return hasPixelTexture(scene, key);
}

export { hasPixelTexture };

/** Replace a canvas-backed texture (Phaser 3.90 has no TextureManager.remove). */
export function replaceCanvasTexture(scene, key, canvas) {
  if (scene.textures.exists(key)) {
    const existing = scene.textures.get(key);
    if (existing?.destroy) existing.destroy();
  }
  scene.textures.addCanvas(key, canvas);
}

/** Bake procedural sprites (call once in GameScene.create). */
export function initSpriteArt(scene) {
  registerPixelSprites(scene);
}

export function preloadSpriteArt() {
  // Sprites are procedural canvases — registered at runtime via initSpriteArt.
}

/**
 * Place a world-space sprite scaled to max height; returns the image or null.
 */
export function placeWorldSprite(scene, layer, textureKey, x, y, maxHeight, tint, alpha = 1, depth = 0) {
  if (!textureKey || !scene.textures.exists(textureKey)) return null;
  const frame = scene.textures.getFrame(textureKey);
  const h = frame?.height || 32;
  const scale = maxHeight / Math.max(1, h);
  const spr = scene.add.image(x, y, textureKey)
    .setScale(scale)
    .setAlpha(alpha)
    .setDepth(depth);
  if (textureKey.startsWith('px_')) {
    const tex = scene.textures.get(textureKey);
    if (tex?.source?.[0]) tex.source[0].setFilter(1); // NEAREST
  }
  if (tint != null) {
    let applied = tint;
    if (textureKey.startsWith('px_')) {
      const c = Phaser.Display.Color.IntegerToColor(tint);
      applied = Phaser.Display.Color.GetColor(
        Math.min(255, Math.floor(c.red * 0.32 + 168)),
        Math.min(255, Math.floor(c.green * 0.32 + 168)),
        Math.min(255, Math.floor(c.blue * 0.32 + 168)),
      );
    }
    spr.setTint(applied);
  }
  if (layer) layer.add(spr);
  return spr;
}

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
