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
    // Infantry squad mini-diorama: 3 figures + rifles (inspired by provided refs)
    const helm = 0x6f7766, cloth = 0x2d332c, skin = 0xd7b495, rifle = 0x4a3425;
    // standing left
    g.fillStyle(cloth, 1); g.fillRect(cx - 8, cy - 1, 4, 7);
    g.fillStyle(helm, 1);  g.fillRect(cx - 8, cy - 6, 4, 3);
    g.fillStyle(skin, 1);  g.fillRect(cx - 7, cy - 3, 2, 2);
    g.fillStyle(rifle, 1); g.fillRect(cx - 7, cy + 0, 8, 1);
    // standing right
    g.fillStyle(cloth, 1); g.fillRect(cx + 4, cy - 2, 4, 8);
    g.fillStyle(helm, 1);  g.fillRect(cx + 4, cy - 7, 4, 3);
    g.fillStyle(skin, 1);  g.fillRect(cx + 5, cy - 4, 2, 2);
    g.fillStyle(rifle, 1); g.fillRect(cx + 2, cy + 0, 7, 1);
    // prone
    g.fillStyle(cloth, 1); g.fillRect(cx - 1, cy + 4, 8, 2);
    g.fillStyle(helm, 1);  g.fillRect(cx + 6, cy + 3, 3, 2);
    g.fillStyle(rifle, 1); g.fillRect(cx - 4, cy + 5, 7, 1);
    // light accents
    g.fillStyle(0xa3ad98, 0.9); g.fillRect(cx - 8, cy - 1, 1, 3); g.fillRect(cx + 4, cy - 2, 1, 3);
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
  } else if (shape === 'boat' || shape === 'mtb' || shape === 'sub' || shape === 'destroyer' || shape === 'cruiser' || shape === 'battleship' || shape === 'transport') {
    const deck = 0x8d7a5e;
    if (shape === 'mtb') {
      // MTB: sleek fast hull, low profile, torpedo tubes on sides
      g.fillStyle(0x5a6670, 0.98);
      g.fillTriangle(cx - 7, cy + 3, cx + 10, cy + 1, cx + 11, cy - 1);
      g.fillRect(cx - 7, cy - 3, 17, 6);
      g.fillStyle(deck, 1); g.fillRect(cx - 6, cy - 2, 10, 3);
      g.fillStyle(0x3a4550, 1); g.fillRect(cx + 1, cy - 7, 3, 4); // small bridge
      // Torpedo tube stubs (sides)
      g.fillStyle(0x9fb0c3, 0.85);
      g.fillRect(cx - 5, cy + 3, 5, 1); // port tube
      g.fillRect(cx - 5, cy - 4, 5, 1); // starboard tube
    } else if (shape === 'sub') {
      g.fillStyle(0x1e232a, 0.98); g.fillEllipse(cx, cy + 1, 22, 7);
      g.fillStyle(0x555f6e, 0.95); g.fillRect(cx - 2, cy - 6, 5, 4);
      g.fillStyle(0x9fb0c3, 0.8);  g.fillRect(cx - 8, cy + 1, 16, 1);
    } else if (shape === 'destroyer') {
      g.fillStyle(0x697786, 0.98);
      g.fillTriangle(cx - 10, cy + 4, cx + 9, cy + 2, cx + 11, cy - 2);
      g.fillRect(cx - 9, cy - 4, 18, 8);
      g.fillStyle(deck, 1); g.fillRect(cx - 8, cy - 3, 16, 4);
      g.fillStyle(0x4a5564, 1); g.fillRect(cx - 1, cy - 9, 4, 6); // bridge
      g.fillRect(cx + 3, cy - 6, 3, 3); // stack
      g.fillStyle(0xc4d1df, 0.9); g.fillRect(cx + 6, cy - 1, 4, 1); // bow gun
      g.fillRect(cx - 9, cy + 0, 4, 1); // stern gun
    } else if (shape === 'cruiser' || shape === 'battleship') {
      const hull = shape === 'battleship' ? 0x626f7f : 0x6c7887;
      g.fillStyle(hull, 0.98);
      g.fillTriangle(cx - 11, cy + 5, cx + 9, cy + 3, cx + 12, cy - 2);
      g.fillRect(cx - 10, cy - 5, 20, 10);
      g.fillStyle(deck, 1); g.fillRect(cx - 9, cy - 4, 18, 5);
      g.fillStyle(0x46515f, 1); g.fillRect(cx - 2, cy - 10, 5, 7);
      g.fillRect(cx + 4, cy - 7, 4, 4);
      g.fillStyle(0xc9d5e2, 0.92); g.fillRect(cx + 7, cy - 1, 5, 1);
      g.fillRect(cx - 10, cy + 0, 5, 1);
      if (shape === 'battleship') g.fillRect(cx + 1, cy - 2, 4, 1); // extra turret
    } else if (shape === 'transport') {
      g.fillStyle(0x7a858f, 0.98); g.fillRect(cx - 10, cy - 4, 20, 9);
      g.fillStyle(deck, 1); g.fillRect(cx - 9, cy - 3, 18, 4);
      g.fillStyle(0x4a5564, 1); g.fillRect(cx + 3, cy - 8, 4, 5);
      g.fillStyle(0x9fb0c3, 0.9); g.fillRect(cx - 7, cy + 0, 10, 2); // cargo block
    } else {
      g.fillStyle(light, 0.95);
      g.fillTriangle(cx - 9, cy + 4, cx + 8, cy + 2, cx + 10, cy - 1);
      g.fillRect(cx - 8, cy - 3, 16, 7);
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
    // Iso-like long hall building with roof + windows
    g.fillStyle(0x778391, 1); g.fillRect(s * 0.2, s * 0.33, s * 0.62, s * 0.22); // wall
    g.fillStyle(0xa18969, 1); g.fillRect(s * 0.22, s * 0.24, s * 0.58, s * 0.11); // roof
    g.lineStyle(1, 0xc9d2dd, 0.95); g.strokeRect(s * 0.2, s * 0.33, s * 0.62, s * 0.22);
    g.strokeRect(s * 0.22, s * 0.24, s * 0.58, s * 0.11);
    g.fillStyle(0x1c2128, 1);
    for (let i = 0; i < 4; i++) g.fillRect(s * (0.28 + i * 0.11), s * 0.39, 3, 3); // windows
    g.fillRect(s * 0.71, s * 0.42, 4, 6); // door
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
