// Procedural pixel-ish sprite generation for Attrition
// Generates textures for every unit and building type at runtime.

export function unitTextureKey(unitType, owner = 1) {
  return `u_${unitType}_${owner}`;
}

export function buildingTextureKey(buildingType, owner = 1) {
  return `b_${buildingType}_${owner}`;
}

export function generateAllSprites(scene, UNIT_TYPES, BUILDING_TYPES, PLAYER_COLORS) {
  generateUnitTextures(scene, UNIT_TYPES, PLAYER_COLORS);
  generateBuildingTextures(scene, BUILDING_TYPES, PLAYER_COLORS);
}

function generateUnitTextures(scene, UNIT_TYPES, PLAYER_COLORS) {
  for (const [type, def] of Object.entries(UNIT_TYPES)) {
    for (const owner of [1, 2]) {
      const key = unitTextureKey(type, owner);
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      const s = 28;
      const c = PLAYER_COLORS[owner] || 0xffffff;

      // shadow blob
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(s / 2, s * 0.73, s * 0.66, s * 0.28);

      // hull/body base
      const body = 0x2b3138;
      const edge = 0x90a0b4;
      g.fillStyle(body, 1);
      g.fillEllipse(s / 2, s * 0.55, s * 0.54, s * 0.34);
      g.lineStyle(1, edge, 0.9);
      g.strokeEllipse(s / 2, s * 0.55, s * 0.54, s * 0.34);

      // team stripe
      g.fillStyle(c, 0.95);
      g.fillRect(s * 0.35, s * 0.48, s * 0.30, 2);

      drawUnitByShape(g, def.shape, s, c);
      g.generateTexture(key, s, s);
      g.destroy();
    }
  }
}

function drawUnitByShape(g, shape, s, color) {
  const cx = s / 2, cy = s * 0.54;
  const dark = 0x20262d;
  const light = 0xb8c4d0;

  if (shape === 'circle') {
    g.fillStyle(light, 0.95); g.fillCircle(cx, cy - 5, 4);
    g.fillStyle(dark, 1); g.fillRect(cx + 2, cy - 6, 6, 2); // rifle
  } else if (shape === 'square') {
    g.fillStyle(light, 0.95); g.fillRect(cx - 5, cy - 7, 10, 10);
    g.fillStyle(dark, 1); g.fillRect(cx + 4, cy - 4, 6, 2);
  } else if (shape === 'triangle') {
    g.fillStyle(light, 0.95);
    g.fillTriangle(cx - 6, cy + 2, cx + 6, cy + 2, cx, cy - 8);
  } else if (shape === 'diamond') {
    g.fillStyle(light, 0.95);
    g.fillTriangle(cx, cy - 9, cx + 6, cy - 1, cx, cy + 7);
    g.fillTriangle(cx, cy - 9, cx - 6, cy - 1, cx, cy + 7);
  } else if (shape === 'cross') {
    g.fillStyle(light, 0.95);
    g.fillRect(cx - 2, cy - 10, 4, 18);
    g.fillRect(cx - 8, cy - 4, 16, 4);
  } else if (shape === 'mortar') {
    g.fillStyle(light, 0.95); g.fillRect(cx - 6, cy - 3, 12, 6);
    g.fillStyle(dark, 1); g.fillRect(cx, cy - 10, 3, 8);
  } else if (shape === 'tank') {
    g.fillStyle(light, 0.95); g.fillRect(cx - 8, cy - 6, 16, 10);
    g.fillStyle(dark, 1); g.fillCircle(cx, cy - 2, 3);
    g.fillRect(cx + 2, cy - 3, 9, 2);
  } else if (shape === 'artillery') {
    g.fillStyle(light, 0.95); g.fillRect(cx - 8, cy - 4, 14, 8);
    g.fillStyle(dark, 1); g.fillRect(cx + 3, cy - 8, 11, 2);
    g.fillCircle(cx - 6, cy + 5, 2); g.fillCircle(cx + 4, cy + 5, 2);
  } else if (shape === 'arrow') {
    g.fillStyle(light, 0.95);
    g.fillTriangle(cx - 7, cy, cx + 6, cy - 6, cx + 6, cy + 6);
  } else if (shape === 'boat' || shape === 'sub' || shape === 'destroyer' || shape === 'cruiser' || shape === 'battleship' || shape === 'transport') {
    g.fillStyle(light, 0.95);
    g.fillTriangle(cx - 9, cy + 4, cx + 8, cy + 2, cx + 10, cy - 1);
    g.fillRect(cx - 8, cy - 3, 16, 7);
    if (shape !== 'sub') {
      g.fillStyle(dark, 1); g.fillRect(cx - 1, cy - 9, 3, 7);
      g.fillRect(cx + 3, cy - 6, 4, 4);
    } else {
      g.fillStyle(dark, 1); g.fillRect(cx - 2, cy - 7, 5, 4);
    }
  } else if (shape === 'battery') {
    g.fillStyle(light, 0.95); g.fillRect(cx - 7, cy - 6, 14, 11);
    g.fillStyle(dark, 1); g.fillRect(cx - 1, cy - 8, 9, 2);
  } else {
    g.fillStyle(light, 0.95); g.fillCircle(cx, cy - 2, 6);
  }

  // subtle highlight pixel stripe
  g.fillStyle(color, 0.75);
  g.fillRect(cx - 4, cy + 6, 8, 2);
}

function generateBuildingTextures(scene, BUILDING_TYPES, PLAYER_COLORS) {
  for (const [type] of Object.entries(BUILDING_TYPES)) {
    if (type === 'ROAD') continue;
    for (const owner of [1, 2]) {
      const key = buildingTextureKey(type, owner);
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      const s = 34;
      const c = PLAYER_COLORS[owner] || 0xffffff;

      g.fillStyle(0x000000, 0.26);
      g.fillEllipse(s / 2, s * 0.78, s * 0.7, s * 0.25);

      // base slab
      g.fillStyle(0x39414a, 1);
      g.fillRect(s * 0.17, s * 0.38, s * 0.66, s * 0.34);
      g.lineStyle(1, 0xaab8c7, 0.9);
      g.strokeRect(s * 0.17, s * 0.38, s * 0.66, s * 0.34);

      drawBuildingByType(g, type, s, c);

      g.generateTexture(key, s, s);
      g.destroy();
    }
  }
}

function drawBuildingByType(g, type, s, color) {
  const cx = s / 2;
  const dark = 0x252b33;
  const light = 0xc3ccd6;

  if (type === 'HQ') {
    g.fillStyle(light, 0.95); g.fillRect(s * 0.27, s * 0.25, s * 0.46, s * 0.26);
    g.fillStyle(dark, 1); g.fillRect(s * 0.46, s * 0.15, 2, s * 0.2);
    g.fillStyle(color, 1); g.fillRect(s * 0.48, s * 0.15, 6, 4);
  } else if (type === 'BARRACKS') {
    g.fillStyle(light, 0.95); g.fillRect(s * 0.22, s * 0.29, s * 0.56, s * 0.2);
    g.fillStyle(dark, 1); g.fillRect(s * 0.28, s * 0.34, s * 0.44, 2);
  } else if (type === 'VEHICLE_DEPOT') {
    g.fillStyle(light, 0.95); g.fillRect(s * 0.2, s * 0.28, s * 0.6, s * 0.24);
    g.fillStyle(dark, 1); g.fillRect(s * 0.56, s * 0.2, s * 0.12, s * 0.14);
  } else if (type === 'NAVAL_YARD' || type === 'HARBOR' || type === 'DRY_DOCK' || type === 'NAVAL_BASE') {
    g.fillStyle(light, 0.95); g.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.2);
    g.fillStyle(dark, 1); g.fillRect(s * 0.45, s * 0.18, 3, s * 0.16);
    g.fillStyle(color, 1); g.fillRect(s * 0.33, s * 0.2, s * 0.16, 3);
  } else if (type === 'MINE') {
    g.fillStyle(0x111111, 1); g.fillCircle(cx, s * 0.48, s * 0.12);
    g.lineStyle(2, color, 0.95); g.strokeCircle(cx, s * 0.48, s * 0.12);
  } else if (type === 'OIL_PUMP') {
    g.fillStyle(light, 0.95); g.fillRect(s * 0.25, s * 0.3, s * 0.5, s * 0.08);
    g.fillStyle(dark, 1); g.fillRect(s * 0.47, s * 0.2, 3, s * 0.22);
  } else if (type === 'OBS_POST') {
    g.fillStyle(light, 0.95); g.fillRect(s * 0.44, s * 0.2, 4, s * 0.28);
    g.fillStyle(color, 1); g.fillRect(s * 0.36, s * 0.2, s * 0.24, 3);
  } else if (type === 'BUNKER') {
    g.fillStyle(light, 0.95); g.fillCircle(cx, s * 0.45, s * 0.14);
    g.fillStyle(dark, 1); g.fillRect(cx - 5, s * 0.45, 10, 2);
  }

  // team marker
  g.fillStyle(color, 0.95);
  g.fillRect(s * 0.43, s * 0.58, s * 0.14, 3);
}
