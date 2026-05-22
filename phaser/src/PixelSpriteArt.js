/**
 * Procedural 32×32 pixel sprites — grungy military style, nearest-neighbor in-game.
 */

const W = 32;
const H = 32;

export const PIXEL_PAL = {
  K: '#12100e',
  D: '#2a2622',
  M: '#444038',
  G: '#5a5648',
  L: '#767068',
  H: '#9a9284',
  S: '#586068',
  B: '#4a3c2e',
  R: '#7a3434',
  Y: '#7a7038',
};

function bake(id, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawFn(ctx);
  // Grunge dither
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const n = ((id.charCodeAt(i / 4 % id.length) * 17 + (i / 4)) % 11);
    if (n === 0) {
      d[i] = Math.max(0, d[i] - 14);
      d[i + 1] = Math.max(0, d[i + 1] - 14);
      d[i + 2] = Math.max(0, d[i + 2] - 14);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function px(ctx, x, y, col) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 1, 1);
}

function rect(ctx, x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

function outlineRect(ctx, x, y, w, h, fill, edge = PIXEL_PAL.K) {
  rect(ctx, x, y, w, h, edge);
  if (w > 2 && h > 2) rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
}

// ── Unit drawers ─────────────────────────────────────────────────────────────

function drawInfantry(ctx) {
  const { K, D, M, G, L, H } = PIXEL_PAL;
  // helmet + head
  rect(ctx, 13, 5, 6, 4, K);
  rect(ctx, 14, 6, 4, 2, L);
  rect(ctx, 14, 8, 4, 1, G);
  // torso
  outlineRect(ctx, 12, 9, 8, 7, G);
  rect(ctx, 13, 10, 2, 5, D);
  rect(ctx, 17, 10, 2, 5, D);
  rect(ctx, 15, 11, 2, 3, L);
  // rifle (right) — long barrel for readability at hex scale
  rect(ctx, 19, 11, 11, 2, K);
  rect(ctx, 20, 12, 9, 1, D);
  rect(ctx, 28, 10, 2, 4, K);
  rect(ctx, 29, 11, 1, 2, H);
  // legs
  rect(ctx, 13, 16, 3, 8, K);
  rect(ctx, 14, 17, 2, 6, D);
  rect(ctx, 17, 16, 3, 8, K);
  rect(ctx, 18, 17, 2, 6, D);
  // boots
  rect(ctx, 12, 23, 4, 2, K);
  rect(ctx, 13, 24, 3, 1, M);
  rect(ctx, 17, 23, 4, 2, K);
  rect(ctx, 18, 24, 3, 1, M);
}

function drawTank(ctx) {
  const { K, D, S, L, H } = PIXEL_PAL;
  // hull
  outlineRect(ctx, 5, 14, 22, 8, S);
  rect(ctx, 6, 15, 20, 2, L);
  rect(ctx, 6, 19, 20, 2, D);
  // treads
  rect(ctx, 4, 21, 24, 4, K);
  for (let x = 5; x < 26; x += 3) rect(ctx, x, 22, 2, 2, D);
  // turret
  outlineRect(ctx, 11, 9, 12, 6, S);
  rect(ctx, 12, 10, 10, 2, L);
  // barrel
  rect(ctx, 22, 10, 8, 3, K);
  rect(ctx, 23, 11, 6, 1, D);
  px(ctx, 29, 11, H);
}

function drawArtillery(ctx) {
  const { K, D, S, L } = PIXEL_PAL;
  outlineRect(ctx, 8, 18, 16, 6, S);
  rect(ctx, 9, 19, 14, 2, L);
  // wheels
  rect(ctx, 7, 23, 4, 4, K);
  rect(ctx, 8, 24, 2, 2, D);
  rect(ctx, 21, 23, 4, 4, K);
  rect(ctx, 22, 24, 2, 2, D);
  // gun trail
  rect(ctx, 10, 8, 3, 12, K);
  rect(ctx, 11, 7, 2, 13, S);
  rect(ctx, 12, 4, 2, 4, K);
  rect(ctx, 13, 2, 10, 3, K);
  rect(ctx, 14, 3, 8, 1, L);
}

function drawEngineer(ctx) {
  const { K, D, G, L, Y } = PIXEL_PAL;
  drawInfantry(ctx);
  // wrench overlay
  rect(ctx, 20, 14, 6, 2, K);
  rect(ctx, 21, 15, 4, 1, Y);
  rect(ctx, 24, 12, 2, 2, K);
  rect(ctx, 25, 13, 1, 1, Y);
  // hard hat stripe
  rect(ctx, 14, 6, 4, 1, Y);
}

function drawRecon(ctx) {
  const { K, D, G, L } = PIXEL_PAL;
  // crouched figure
  rect(ctx, 10, 14, 14, 6, K);
  rect(ctx, 11, 15, 12, 4, G);
  rect(ctx, 12, 13, 8, 3, K);
  rect(ctx, 13, 14, 6, 2, L);
  // binoculars
  rect(ctx, 18, 11, 3, 3, K);
  rect(ctx, 19, 12, 1, 1, D);
  rect(ctx, 22, 11, 3, 3, K);
  rect(ctx, 23, 12, 1, 1, D);
  rect(ctx, 21, 12, 2, 1, K);
}

function drawAntiTank(ctx) {
  const { K, D, S, L, G } = PIXEL_PAL;
  rect(ctx, 11, 16, 10, 6, K);
  rect(ctx, 12, 17, 8, 4, G);
  // long tube
  rect(ctx, 6, 12, 16, 3, K);
  rect(ctx, 7, 13, 14, 1, S);
  rect(ctx, 5, 11, 3, 5, K);
  rect(ctx, 6, 12, 2, 3, D);
  // shield
  outlineRect(ctx, 18, 14, 5, 7, S);
}

function drawMedic(ctx) {
  drawInfantry(ctx);
  const { K, R, H } = PIXEL_PAL;
  rect(ctx, 13, 10, 6, 6, K);
  rect(ctx, 14, 11, 4, 4, H);
  rect(ctx, 15, 12, 4, 1, R);
  rect(ctx, 15, 14, 1, 4, R);
}

function drawTruck(ctx) {
  const { K, D, S, L } = PIXEL_PAL;
  outlineRect(ctx, 4, 14, 24, 8, S);
  rect(ctx, 5, 15, 22, 2, L);
  outlineRect(ctx, 18, 8, 8, 7, S);
  rect(ctx, 19, 9, 6, 3, L);
  rect(ctx, 6, 21, 5, 3, K);
  rect(ctx, 7, 22, 3, 2, D);
  rect(ctx, 22, 21, 5, 3, K);
  rect(ctx, 23, 22, 3, 2, D);
}

function drawBoat(ctx, w = 14) {
  const { K, D, S, L } = PIXEL_PAL;
  const x = Math.floor((32 - w) / 2);
  rect(ctx, x, 16, w, 8, K);
  rect(ctx, x + 1, 17, w - 2, 5, S);
  rect(ctx, x + 2, 17, w - 4, 2, L);
  rect(ctx, x + 4, 14, 4, 3, K);
  rect(ctx, x + 5, 15, 2, 2, D);
}

function drawSub(ctx) {
  const { K, D, S, L } = PIXEL_PAL;
  rect(ctx, 8, 14, 16, 6, K);
  rect(ctx, 9, 15, 14, 4, S);
  rect(ctx, 10, 16, 12, 2, L);
  rect(ctx, 14, 10, 4, 5, K);
  rect(ctx, 15, 11, 2, 3, D);
}

function drawDestroyer(ctx) {
  drawBoat(20);
  const { K, S } = PIXEL_PAL;
  rect(ctx, 20, 12, 2, 4, K);
  rect(ctx, 21, 13, 1, 2, S);
  rect(ctx, 12, 13, 2, 3, K);
  rect(ctx, 24, 13, 2, 3, K);
}

function drawCruiser(ctx, big = false) {
  const w = big ? 24 : 20;
  drawBoat(w);
  const { K, S } = PIXEL_PAL;
  const x = Math.floor((32 - w) / 2);
  rect(ctx, x + 6, 11, 2, 4, K);
  rect(ctx, x + w - 8, 11, 2, 4, K);
  if (big) {
    rect(ctx, x + 10, 10, 2, 5, K);
    rect(ctx, x + 14, 10, 2, 5, K);
  }
}

function drawAircraft(ctx) {
  const { K, D, S, L } = PIXEL_PAL;
  // top-down plane
  rect(ctx, 14, 14, 4, 10, K);
  rect(ctx, 15, 15, 2, 8, S);
  rect(ctx, 6, 15, 20, 4, K);
  rect(ctx, 7, 16, 18, 2, S);
  rect(ctx, 4, 14, 4, 6, K);
  rect(ctx, 24, 14, 4, 6, K);
  rect(ctx, 5, 15, 2, 4, L);
  rect(ctx, 25, 15, 2, 4, L);
  rect(ctx, 13, 8, 6, 4, K);
  rect(ctx, 14, 9, 4, 2, D);
}

// ── Building drawers ─────────────────────────────────────────────────────────

function drawHQ(ctx) {
  const { K, D, B, L, H } = PIXEL_PAL;
  outlineRect(ctx, 8, 12, 16, 12, B);
  rect(ctx, 9, 13, 14, 3, L);
  rect(ctx, 9, 18, 14, 4, D);
  // flag pole
  rect(ctx, 22, 4, 2, 10, K);
  rect(ctx, 20, 4, 4, 3, K);
  rect(ctx, 21, 5, 2, 2, H);
}

function drawBarracks(ctx) {
  const { K, D, B, L } = PIXEL_PAL;
  outlineRect(ctx, 6, 14, 20, 10, B);
  rect(ctx, 7, 15, 18, 3, L);
  // roof
  for (let x = 8; x < 24; x++) rect(ctx, x, 11 - Math.abs(x - 16) / 3, 2, 3, K);
  rect(ctx, 10, 10, 12, 4, D);
  rect(ctx, 14, 18, 4, 4, K);
  rect(ctx, 15, 19, 2, 2, D);
}

function drawMine(ctx) {
  const { K, D, B, L } = PIXEL_PAL;
  outlineRect(ctx, 10, 18, 12, 8, B);
  // headframe
  rect(ctx, 15, 6, 2, 14, K);
  rect(ctx, 11, 8, 10, 2, K);
  rect(ctx, 12, 9, 8, 1, L);
  rect(ctx, 10, 10, 2, 8, K);
  rect(ctx, 20, 10, 2, 8, K);
}

function drawOilPump(ctx) {
  const { K, D, S, L } = PIXEL_PAL;
  rect(ctx, 10, 20, 12, 6, K);
  rect(ctx, 11, 21, 10, 4, D);
  rect(ctx, 14, 8, 2, 14, K);
  rect(ctx, 10, 10, 8, 2, K);
  rect(ctx, 11, 11, 6, 1, S);
  rect(ctx, 18, 12, 8, 2, K);
  rect(ctx, 19, 13, 6, 1, L);
  rect(ctx, 24, 14, 3, 3, K);
}

function drawNavalYard(ctx) {
  const { K, D, S, L, B } = PIXEL_PAL;
  outlineRect(ctx, 4, 16, 24, 10, B);
  rect(ctx, 20, 6, 2, 12, K);
  rect(ctx, 18, 8, 6, 2, K);
  rect(ctx, 19, 9, 4, 1, S);
  drawBoat(12);
}

function drawHarbor(ctx) {
  const { K, D, B, L } = PIXEL_PAL;
  rect(ctx, 4, 18, 24, 8, K);
  rect(ctx, 5, 19, 22, 5, B);
  rect(ctx, 4, 22, 10, 4, L);
  rect(ctx, 18, 22, 10, 4, L);
  drawBoat(10);
}

function drawDepot(ctx) {
  const { K, D, S, L } = PIXEL_PAL;
  outlineRect(ctx, 5, 12, 22, 14, S);
  rect(ctx, 6, 13, 20, 3, L);
  rect(ctx, 14, 8, 6, 5, K);
  rect(ctx, 15, 9, 4, 3, D);
  rect(ctx, 8, 18, 16, 2, K);
  rect(ctx, 9, 19, 4, 1, D);
  rect(ctx, 19, 19, 4, 1, D);
}

function drawBunker(ctx) {
  const { K, D, B, L } = PIXEL_PAL;
  outlineRect(ctx, 8, 14, 16, 10, B);
  rect(ctx, 9, 15, 14, 4, L);
  rect(ctx, 10, 12, 12, 4, K);
  rect(ctx, 11, 13, 10, 2, D);
  rect(ctx, 14, 10, 4, 3, K);
  rect(ctx, 15, 11, 2, 1, L);
}

function drawObsPost(ctx) {
  const { K, D, B, L } = PIXEL_PAL;
  outlineRect(ctx, 12, 16, 8, 10, B);
  rect(ctx, 14, 6, 4, 12, K);
  rect(ctx, 13, 8, 6, 2, K);
  rect(ctx, 14, 9, 4, 1, L);
  rect(ctx, 15, 4, 2, 4, K);
}

function drawFarm(ctx) {
  const { K, D, G, L, H } = PIXEL_PAL;
  rect(ctx, 4, 10, 24, 16, K);
  for (let y = 12; y < 24; y += 3) {
    const c = y % 6 === 0 ? L : G;
    rect(ctx, 5, y, 22, 2, c);
  }
  rect(ctx, 5, 11, 22, 1, H);
  rect(ctx, 4, 24, 24, 2, D);
}

// ── Registry ─────────────────────────────────────────────────────────────────

const DRAWERS = {
  px_unit_infantry: drawInfantry,
  px_unit_tank: drawTank,
  px_unit_artillery: drawArtillery,
  px_unit_engineer: drawEngineer,
  px_unit_recon: drawRecon,
  px_unit_anti_tank: drawAntiTank,
  px_unit_medic: drawMedic,
  px_unit_truck: drawTruck,
  px_unit_patrol_boat: () => drawBoat(12),
  px_unit_submarine: drawSub,
  px_unit_destroyer: drawDestroyer,
  px_unit_cruiser_light: () => drawCruiser(false),
  px_unit_cruiser_heavy: () => drawCruiser(true),
  px_unit_battleship: () => drawCruiser(true),
  px_unit_landing_craft: () => drawBoat(10),
  px_unit_aircraft: drawAircraft,
  px_bld_hq: drawHQ,
  px_bld_barracks: drawBarracks,
  px_bld_mine: drawMine,
  px_bld_oil_pump: drawOilPump,
  px_bld_naval_yard: drawNavalYard,
  px_bld_harbor: drawHarbor,
  px_bld_vehicle_depot: drawDepot,
  px_bld_dry_dock: drawNavalYard,
  px_bld_naval_base: drawDepot,
  px_bld_obs_post: drawObsPost,
  px_bld_bunker: drawBunker,
  px_bld_farm: drawFarm,
};

const baked = new Map();

function getCanvas(id) {
  if (!baked.has(id)) {
    const fn = DRAWERS[id];
    if (!fn) return null;
    baked.set(id, bake(id, fn));
  }
  return baked.get(id);
}

/** Register all procedural pixel textures on the Phaser scene. */
const NEAREST_FILTER = 1; // Phaser.ScaleModes.NEAREST

export function registerPixelSprites(scene) {
  for (const id of Object.keys(DRAWERS)) {
    if (scene.textures.exists(id)) continue;
    const canvas = getCanvas(id);
    if (!canvas) continue;
    scene.textures.addCanvas(id, canvas);
    const tex = scene.textures.get(id);
    if (tex?.source?.[0]) tex.source[0].setFilter(NEAREST_FILTER);
  }
}

export function hasPixelTexture(scene, key) {
  return !!(key && scene.textures?.exists(key));
}
