/**
 * Procedural 32×32 sprites — high-contrast WWII isometric pixel art.
 * Light top-left · dark outline · cast shadow · intentional 3-tone surfaces.
 */

const W = 32;
const H = 32;
const BAKE_REV = 3;

export const PIXEL_PAL = {
  OUT: '#0e0c0a',
  SH: '#080706',
  SH2: '#141210',
  OL0: '#243018',
  OL1: '#3a4e28',
  OL2: '#4f6836',
  OL3: '#6a8448',
  OL4: '#9ab068',
  OL5: '#b8cc88',
  SKIN: '#d4b070',
  SKIN_D: '#9a7848',
  WOOD: '#5a3c20',
  WOOD_L: '#7a5834',
  WOOD_D: '#3a2814',
  MET: '#282830',
  MET_L: '#484858',
  MET_H: '#686878',
  BOOT: '#101014',
  BRK_D: '#3a342c',
  BRK: '#5a5044',
  BRK_L: '#7a7064',
  BRK_H: '#9a9084',
  CONC_D: '#404038',
  CONC: '#5a5850',
  CONC_L: '#7a7870',
  CONC_H: '#9a9890',
  ROOF_D: '#3a3020',
  ROOF: '#5a4830',
  ROOF_L: '#7a6848',
  ROOF_H: '#a08858',
  WIN: '#2a3848',
  WIN_L: '#4a6888',
  WIN_H: '#6a98b8',
  DOOR: '#2a2018',
  WATER: '#1e3a48',
  WATER_L: '#3a6a7a',
  WATER_H: '#5a9aaa',
  SAND: '#8a7a54',
  SAND_D: '#6a5a3c',
  CROP: '#5a7838',
  CROP_L: '#7a9850',
  RED: '#9a2828',
  RED_L: '#c84848',
  WHITE: '#e8e4d8',
  YEL: '#c8a840',
  RUST: '#7a4830',
};

function bake(id, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  drawFn(ctx);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const n = ((id.charCodeAt((i / 4) % id.length) * 11 + (i / 4)) % 23);
    if (n === 0) {
      d[i] = Math.max(0, d[i] - 6);
      d[i + 1] = Math.max(0, d[i + 1] - 6);
      d[i + 2] = Math.max(0, d[i + 2] - 8);
    } else if (n === 1 && d[i] + d[i + 1] + d[i + 2] < 380) {
      d[i] = Math.min(255, d[i] + 5);
      d[i + 1] = Math.min(255, d[i + 1] + 5);
      d[i + 2] = Math.min(255, d[i + 2] + 4);
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

function shadow(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(4,3,2,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 1));
}

/** 3-tone vertical wall strip (front face). */
function wallFront(ctx, x, y, w, h, d, m, l, hi) {
  const O = PIXEL_PAL.OUT;
  rect(ctx, x, y, w, h, m);
  for (let row = 0; row < h; row++) {
    px(ctx, x, y + row, d);
    px(ctx, x + w - 1, y + row, d);
    if (row === 0) for (let c = 1; c < w - 1; c++) px(ctx, x + c, y, hi);
    if (row === h - 1) for (let c = 0; c < w; c++) px(ctx, x + c, y + row, O);
  }
  for (let c = 1; c < w - 1; c++) {
    px(ctx, x + c, y + 1, l);
    if (c % 3 === 0) px(ctx, x + c, y + h - 2, d);
  }
}

/** Left (dark) iso face — diagonal column. */
function wallLeft(ctx, x, y, h, d, m) {
  const O = PIXEL_PAL.OUT;
  for (let i = 0; i < h; i++) {
    const w = 2 + Math.floor(i / 4);
    rect(ctx, x - w + 1, y + i, w, 1, i === 0 ? m : d);
    px(ctx, x, y + i, O);
  }
}

/** Right (mid) iso face. */
function wallRight(ctx, x, y, h, m, l) {
  const O = PIXEL_PAL.OUT;
  for (let i = 0; i < h; i++) {
    const w = 2 + Math.floor((h - i) / 4);
    rect(ctx, x, y + i, w, 1, i < 2 ? l : m);
    px(ctx, x + w - 1, y + i, O);
  }
}

function windowBlock(ctx, x, y, w = 3, h = 3) {
  const P = PIXEL_PAL;
  rect(ctx, x, y, w, h, P.WIN);
  px(ctx, x, y, P.WIN_H);
  px(ctx, x + 1, y, P.WIN_H);
  px(ctx, x, y + 1, P.WIN_L);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, P.WIN_L);
  px(ctx, x + w - 1, y + h - 1, P.OUT);
  px(ctx, x, y + h - 1, P.OUT);
}

function doorBlock(ctx, x, y, w = 4, h = 5) {
  const P = PIXEL_PAL;
  rect(ctx, x, y, w, h, P.DOOR);
  px(ctx, x, y, P.WOOD_D);
  px(ctx, x + 1, y, P.WOOD);
  rect(ctx, x + 1, y + 2, w - 2, h - 3, P.WOOD_D);
  px(ctx, x + w - 1, y + h - 1, P.OUT);
  px(ctx, x, y + h - 1, P.OUT);
  px(ctx, x + w - 2, y + Math.floor(h / 2), P.YEL);
}

function foundation(ctx, x, y, w, h = 3) {
  const P = PIXEL_PAL;
  rect(ctx, x, y, w, h, P.CONC_D);
  rect(ctx, x + 1, y, w - 2, 1, P.CONC_H);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, P.CONC);
  px(ctx, x, y + h - 1, P.OUT);
  px(ctx, x + w - 1, y + h - 1, P.OUT);
}

function roofRidge(ctx, x, y, w) {
  const P = PIXEL_PAL;
  for (let i = 0; i < w; i++) {
    const ry = y - Math.floor(Math.abs(i - w / 2) / 2);
    px(ctx, x + i, ry, P.ROOF_H);
    px(ctx, x + i, ry + 1, P.ROOF);
    px(ctx, x + i, ry + 2, P.ROOF_D);
    if (i % 2 === 0) px(ctx, x + i, ry + 1, P.ROOF_L);
  }
  px(ctx, x, y + 3, P.OUT);
  px(ctx, x + w - 1, y + 3, P.OUT);
}

function roofFlat(ctx, x, y, w, d = 3) {
  const P = PIXEL_PAL;
  rect(ctx, x, y, w, d, P.ROOF_D);
  rect(ctx, x + 1, y, w - 2, 1, P.ROOF_H);
  rect(ctx, x + 1, y + 1, w - 2, d - 1, P.ROOF);
  for (let i = 0; i < w; i += 2) px(ctx, x + i, y + 2, P.ROOF_L);
  px(ctx, x, y + d - 1, P.OUT);
}

// ── Units ────────────────────────────────────────────────────────────────────

function drawSoldier(ctx, opts = {}) {
  const P = PIXEL_PAL;
  const crouch = !!opts.crouch;
  const y0 = crouch ? 2 : 0;

  shadow(ctx, 7, 27 + y0, 18, 3);

  rect(ctx, 10, 24 + y0, 6, 3, P.BOOT);
  rect(ctx, 17, 24 + y0, 6, 3, P.BOOT);
  px(ctx, 10, 24 + y0, P.OUT);
  px(ctx, 22, 24 + y0, P.OUT);
  px(ctx, 11, 24 + y0, P.MET_H);

  rect(ctx, 11, 18 + y0, 5, 7, P.OL0);
  rect(ctx, 17, 18 + y0, 5, 7, P.OL0);
  rect(ctx, 12, 19 + y0, 3, 5, P.OL2);
  rect(ctx, 18, 19 + y0, 3, 5, P.OL2);
  px(ctx, 11, 18 + y0, P.OL4);
  px(ctx, 17, 18 + y0, P.OL4);
  px(ctx, 15, 23 + y0, P.OL0);

  rect(ctx, 10, 11 + y0, 12, 8, P.OL1);
  rect(ctx, 11, 12 + y0, 10, 6, P.OL2);
  rect(ctx, 12, 13 + y0, 8, 4, P.OL3);
  px(ctx, 10, 11 + y0, P.OL5);
  px(ctx, 11, 11 + y0, P.OL5);
  px(ctx, 20, 17 + y0, P.OL0);
  px(ctx, 21, 16 + y0, P.OL0);
  px(ctx, 10, 18 + y0, P.OUT);

  rect(ctx, 13, 5 + y0, 8, 5, P.OL1);
  rect(ctx, 14, 4 + y0, 6, 3, P.OL3);
  rect(ctx, 15, 3 + y0, 4, 2, P.OL4);
  px(ctx, 15, 3 + y0, P.OL5);
  px(ctx, 18, 4 + y0, P.OL2);
  rect(ctx, 14, 8 + y0, 6, 2, P.SKIN);
  px(ctx, 15, 8 + y0, P.SKIN_D);
  px(ctx, 13, 5 + y0, P.OUT);
  px(ctx, 20, 6 + y0, P.OUT);
  px(ctx, 14, 4 + y0, P.OUT);

  rect(ctx, 14, 13 + y0, 4, 5, P.WOOD);
  rect(ctx, 15, 14 + y0, 3, 3, P.WOOD_L);
  rect(ctx, 18, 14 + y0, 10, 2, P.MET);
  rect(ctx, 19, 13 + y0, 8, 1, P.MET_H);
  rect(ctx, 27, 14 + y0, 2, 3, P.MET);
  px(ctx, 28, 14 + y0, P.MET_L);
  px(ctx, 18, 16 + y0, P.OUT);
  px(ctx, 27, 16 + y0, P.OUT);
}

function drawInfantry(ctx) { drawSoldier(ctx); }

function drawEngineer(ctx) {
  drawSoldier(ctx);
  const P = PIXEL_PAL;
  rect(ctx, 14, 4, 6, 2, P.YEL);
  px(ctx, 15, 4, P.OL5);
  rect(ctx, 21, 13, 5, 2, P.MET_L);
  px(ctx, 22, 14, P.YEL);
  px(ctx, 24, 12, P.MET_H);
}

function drawMedic(ctx) {
  drawSoldier(ctx);
  const P = PIXEL_PAL;
  rect(ctx, 13, 12, 6, 6, P.WHITE);
  px(ctx, 15, 14, P.RED_L);
  rect(ctx, 15, 13, 1, 4, P.RED_L);
  px(ctx, 14, 14, P.RED);
  px(ctx, 13, 12, P.OUT);
}

function drawRecon(ctx) {
  drawSoldier(ctx, { crouch: true });
  const P = PIXEL_PAL;
  rect(ctx, 19, 10, 3, 3, P.MET);
  rect(ctx, 23, 10, 3, 3, P.MET);
  px(ctx, 20, 11, P.MET_H);
  px(ctx, 24, 11, P.MET_H);
  px(ctx, 22, 12, P.OUT);
}

function drawTank(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 3, 27, 26, 3);
  rect(ctx, 3, 21, 26, 5, P.OUT);
  rect(ctx, 4, 22, 24, 3, P.MET);
  for (let x = 5; x < 26; x += 3) {
    rect(ctx, x, 22, 2, 2, P.MET_L);
    px(ctx, x, 23, P.MET_H);
  }
  rect(ctx, 5, 14, 22, 8, P.OL0);
  rect(ctx, 6, 15, 20, 5, P.OL2);
  rect(ctx, 7, 16, 18, 3, P.OL3);
  px(ctx, 5, 14, P.OL5);
  px(ctx, 6, 15, P.OL4);
  px(ctx, 24, 20, P.OL0);
  rect(ctx, 10, 8, 14, 7, P.OL1);
  rect(ctx, 11, 9, 12, 4, P.OL3);
  px(ctx, 11, 8, P.OL5);
  rect(ctx, 22, 9, 9, 3, P.MET);
  rect(ctx, 23, 10, 7, 1, P.MET_H);
  px(ctx, 30, 10, P.OUT);
}

function drawArtillery(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 5, 27, 22, 3);
  foundation(ctx, 7, 22, 18, 2);
  rect(ctx, 8, 18, 16, 5, P.OL1);
  rect(ctx, 9, 19, 14, 3, P.OL3);
  px(ctx, 9, 18, P.OL5);
  rect(ctx, 6, 23, 4, 3, P.OUT);
  rect(ctx, 7, 24, 2, 2, P.MET_L);
  rect(ctx, 22, 23, 4, 3, P.OUT);
  rect(ctx, 23, 24, 2, 2, P.MET_L);
  rect(ctx, 11, 7, 4, 14, P.WOOD);
  rect(ctx, 12, 5, 2, 16, P.WOOD_L);
  rect(ctx, 13, 2, 12, 4, P.MET);
  rect(ctx, 14, 3, 10, 2, P.MET_H);
  px(ctx, 24, 3, P.OUT);
  px(ctx, 12, 4, P.OUT);
}

function drawAntiTank(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 6, 27, 20, 3);
  foundation(ctx, 9, 21, 14, 2);
  wallFront(ctx, 10, 15, 12, 6, P.CONC_D, P.CONC, P.CONC_L, P.CONC_H);
  rect(ctx, 5, 12, 16, 3, P.MET);
  rect(ctx, 6, 13, 14, 1, P.MET_H);
  rect(ctx, 3, 11, 4, 5, P.OL0);
  rect(ctx, 20, 13, 5, 6, P.OL1);
  px(ctx, 21, 14, P.OL3);
  px(ctx, 4, 11, P.OUT);
}

function drawTruck(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 2, 27, 28, 3);
  foundation(ctx, 3, 21, 26, 2);
  wallFront(ctx, 4, 14, 22, 8, P.OL0, P.OL2, P.OL3, P.OL5);
  wallLeft(ctx, 4, 14, 8, P.OL0, P.OL1);
  wallRight(ctx, 26, 14, 8, P.OL2, P.OL4);
  wallFront(ctx, 17, 8, 10, 7, P.OL1, P.OL3, P.OL4, P.OL5);
  windowBlock(ctx, 19, 10, 3, 2);
  rect(ctx, 5, 23, 5, 3, P.OUT);
  rect(ctx, 6, 24, 3, 2, P.MET_L);
  rect(ctx, 22, 23, 5, 3, P.OUT);
  rect(ctx, 23, 24, 3, 2, P.MET_L);
}

function drawBoat(ctx, w = 14) {
  const P = PIXEL_PAL;
  const x = Math.floor((32 - w) / 2);
  shadow(ctx, x, 26, w, 3);
  rect(ctx, x, 17, w, 8, P.OUT);
  rect(ctx, x + 1, 18, w - 2, 6, P.OL0);
  rect(ctx, x + 2, 18, w - 4, 2, P.OL3);
  px(ctx, x + 2, 18, P.OL5);
  rect(ctx, x + 3, 19, w - 6, 4, P.OL1);
  rect(ctx, x + 5, 14, 5, 5, P.OL2);
  px(ctx, x + 6, 14, P.OL5);
  rect(ctx, x + 7, 15, 3, 3, P.MET_L);
  px(ctx, x + 8, 15, P.MET_H);
}

function drawSub(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 7, 26, 18, 3);
  rect(ctx, 8, 16, 16, 6, P.MET);
  rect(ctx, 9, 17, 14, 4, P.MET_L);
  px(ctx, 9, 17, P.MET_H);
  rect(ctx, 13, 10, 6, 7, P.MET);
  rect(ctx, 14, 11, 4, 5, P.MET_H);
  px(ctx, 13, 10, P.OUT);
  rect(ctx, 15, 12, 2, 2, P.WIN_L);
}

function drawDestroyer(ctx) {
  drawBoat(ctx, 20);
  const P = PIXEL_PAL;
  rect(ctx, 11, 11, 3, 5, P.OL2);
  rect(ctx, 21, 11, 3, 5, P.OL2);
  rect(ctx, 19, 10, 3, 6, P.MET_L);
  px(ctx, 20, 10, P.MET_H);
}

function drawCruiser(ctx, big = false) {
  const w = big ? 24 : 20;
  drawBoat(ctx, w);
  const P = PIXEL_PAL;
  const x = Math.floor((32 - w) / 2);
  rect(ctx, x + 4, 10, 3, 5, P.OL2);
  rect(ctx, x + w - 7, 10, 3, 5, P.OL2);
  if (big) {
    rect(ctx, x + 8, 9, 3, 6, P.MET_L);
    rect(ctx, x + 13, 9, 3, 6, P.MET_L);
    px(ctx, x + 9, 9, P.MET_H);
  }
}

function drawAircraft(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 4, 28, 24, 2);
  rect(ctx, 13, 13, 6, 10, P.OL1);
  rect(ctx, 14, 14, 4, 8, P.OL3);
  px(ctx, 14, 13, P.OL5);
  rect(ctx, 4, 14, 24, 5, P.OL2);
  rect(ctx, 5, 15, 22, 3, P.OL3);
  px(ctx, 5, 14, P.OL5);
  rect(ctx, 2, 13, 5, 6, P.OL1);
  rect(ctx, 25, 13, 5, 6, P.OL1);
  px(ctx, 3, 13, P.OL5);
  px(ctx, 26, 13, P.OL5);
  rect(ctx, 12, 7, 8, 5, P.OL0);
  rect(ctx, 13, 8, 6, 3, P.OL2);
  px(ctx, 13, 7, P.OL5);
  px(ctx, 12, 11, P.OUT);
}

// ── Buildings (iso structures) ─────────────────────────────────────────────

function drawHQ(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 4, 28, 24, 3);
  foundation(ctx, 5, 24, 22, 3);
  wallLeft(ctx, 6, 12, 12, P.BRK_D, P.BRK);
  wallRight(ctx, 24, 12, 12, P.BRK, P.BRK_L);
  wallFront(ctx, 8, 12, 16, 12, P.BRK_D, P.BRK, P.BRK_L, P.BRK_H);
  windowBlock(ctx, 10, 14, 3, 3);
  windowBlock(ctx, 15, 14, 3, 3);
  windowBlock(ctx, 20, 14, 2, 3);
  windowBlock(ctx, 11, 18, 2, 2);
  windowBlock(ctx, 18, 18, 2, 2);
  doorBlock(ctx, 14, 20, 4, 4);
  roofRidge(ctx, 7, 10, 18);
  rect(ctx, 8, 9, 16, 2, P.ROOF_D);
  rect(ctx, 22, 3, 2, 11, P.OUT);
  rect(ctx, 20, 3, 4, 3, P.RED_L);
  rect(ctx, 21, 4, 2, 2, P.WHITE);
  px(ctx, 21, 4, P.RED);
  px(ctx, 20, 2, P.OUT);
}

function drawBarracks(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 2, 28, 28, 3);
  foundation(ctx, 3, 24, 26, 3);
  wallLeft(ctx, 4, 13, 11, P.WOOD_D, P.WOOD);
  wallRight(ctx, 26, 13, 11, P.WOOD, P.WOOD_L);
  wallFront(ctx, 6, 13, 20, 11, P.WOOD_D, P.WOOD, P.WOOD_L, P.WOOD_L);
  for (let i = 0; i < 5; i++) windowBlock(ctx, 8 + i * 3, 15, 2, 3);
  doorBlock(ctx, 14, 21, 4, 3);
  roofFlat(ctx, 5, 10, 22, 4);
  for (let i = 0; i < 22; i++) px(ctx, 5 + i, 11 + (i % 2), i % 2 ? P.ROOF_D : P.ROOF_L);
  rect(ctx, 22, 9, 3, 5, P.BRK_D);
  rect(ctx, 23, 10, 2, 3, P.BRK);
  px(ctx, 22, 9, P.OUT);
  rect(ctx, 23, 8, 2, 2, P.SH2);
}

function drawMine(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 6, 28, 20, 3);
  foundation(ctx, 8, 23, 16, 3);
  rect(ctx, 9, 20, 14, 4, P.SH);
  rect(ctx, 10, 21, 12, 2, P.SH2);
  wallFront(ctx, 10, 14, 12, 6, P.CONC_D, P.CONC, P.CONC_L, P.CONC_H);
  rect(ctx, 15, 5, 2, 14, P.OUT);
  rect(ctx, 11, 7, 10, 2, P.OUT);
  rect(ctx, 12, 8, 8, 1, P.MET_H);
  rect(ctx, 10, 9, 2, 9, P.OUT);
  rect(ctx, 20, 9, 2, 9, P.OUT);
  px(ctx, 11, 8, P.MET_L);
  px(ctx, 19, 8, P.MET_L);
  rect(ctx, 13, 4, 6, 4, P.MET);
  px(ctx, 14, 4, P.MET_H);
  px(ctx, 15, 5, P.YEL);
  px(ctx, 10, 7, P.OUT);
}

function drawOilPump(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 5, 28, 22, 3);
  foundation(ctx, 7, 22, 18, 3);
  rect(ctx, 8, 20, 16, 3, P.CONC);
  px(ctx, 8, 20, P.CONC_H);
  rect(ctx, 14, 6, 3, 16, P.OUT);
  rect(ctx, 10, 8, 10, 2, P.OUT);
  rect(ctx, 11, 9, 8, 1, P.MET_H);
  rect(ctx, 17, 11, 10, 2, P.MET);
  rect(ctx, 18, 12, 8, 1, P.MET_L);
  rect(ctx, 24, 13, 4, 4, P.OL1);
  rect(ctx, 25, 14, 2, 2, P.OL3);
  rect(ctx, 13, 5, 4, 3, P.MET_L);
  rect(ctx, 14, 4, 2, 5, P.MET);
  px(ctx, 15, 3, P.MET_H);
  px(ctx, 13, 4, P.RUST);
  rect(ctx, 15, 8, 2, 8, P.RUST);
  px(ctx, 16, 9, P.YEL);
}

function drawNavalYard(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 2, 28, 28, 3);
  foundation(ctx, 3, 23, 26, 3);
  rect(ctx, 4, 20, 24, 4, P.CONC);
  rect(ctx, 5, 21, 22, 2, P.CONC_L);
  wallFront(ctx, 5, 12, 22, 9, P.CONC_D, P.CONC, P.CONC_L, P.CONC_H);
  wallLeft(ctx, 5, 12, 9, P.CONC_D, P.CONC);
  wallRight(ctx, 27, 12, 9, P.CONC, P.CONC_L);
  rect(ctx, 20, 4, 3, 12, P.OUT);
  rect(ctx, 18, 6, 7, 2, P.OUT);
  rect(ctx, 19, 7, 5, 1, P.YEL);
  rect(ctx, 21, 3, 2, 4, P.MET_L);
  px(ctx, 21, 2, P.MET_H);
  drawBoat(ctx, 11);
  rect(ctx, 6, 14, 4, 2, P.RUST);
}

function drawHarbor(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 2, 28, 28, 3);
  rect(ctx, 3, 21, 26, 6, P.CONC_D);
  rect(ctx, 4, 22, 24, 4, P.WATER);
  px(ctx, 5, 22, P.WATER_H);
  px(ctx, 10, 23, P.WATER_L);
  px(ctx, 18, 23, P.WATER_L);
  rect(ctx, 3, 24, 12, 4, P.CONC);
  rect(ctx, 17, 24, 12, 4, P.CONC_L);
  px(ctx, 3, 24, P.CONC_H);
  for (let i = 0; i < 5; i++) {
    rect(ctx, 5 + i * 5, 19, 2, 5, P.WOOD);
    px(ctx, 5 + i * 5, 19, P.WOOD_L);
    px(ctx, 6 + i * 5, 23, P.OUT);
  }
  wallFront(ctx, 20, 13, 8, 8, P.WOOD_D, P.WOOD, P.WOOD_L, P.WOOD_L);
  windowBlock(ctx, 22, 15, 2, 2);
  roofFlat(ctx, 19, 10, 10, 3);
  drawBoat(ctx, 9);
  rect(ctx, 4, 18, 6, 3, P.BRK);
  px(ctx, 5, 18, P.BRK_L);
}

function drawDepot(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 2, 28, 28, 3);
  foundation(ctx, 3, 23, 26, 3);
  wallLeft(ctx, 4, 10, 13, P.BRK_D, P.BRK);
  wallRight(ctx, 26, 10, 13, P.BRK, P.BRK_L);
  wallFront(ctx, 6, 10, 20, 13, P.BRK_D, P.BRK, P.BRK_L, P.BRK_H);
  rect(ctx, 12, 16, 8, 7, P.DOOR);
  rect(ctx, 13, 17, 6, 5, P.SH);
  px(ctx, 13, 17, P.SH2);
  px(ctx, 12, 16, P.OUT);
  for (let i = 0; i < 3; i++) windowBlock(ctx, 8 + i * 5, 12, 2, 2);
  roofFlat(ctx, 5, 7, 22, 4);
  rect(ctx, 7, 18, 3, 3, P.OL2);
  rect(ctx, 22, 19, 3, 3, P.OL1);
  px(ctx, 7, 18, P.OL4);
  px(ctx, 22, 19, P.OL3);
}

function drawBunker(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 5, 28, 22, 3);
  foundation(ctx, 6, 23, 20, 3);
  rect(ctx, 7, 20, 18, 4, P.OL0);
  rect(ctx, 8, 21, 16, 2, P.OL2);
  wallFront(ctx, 8, 12, 16, 9, P.CONC_D, P.CONC, P.CONC_L, P.CONC_H);
  wallLeft(ctx, 8, 12, 9, P.CONC_D, P.CONC);
  wallRight(ctx, 24, 12, 9, P.CONC, P.CONC_L);
  rect(ctx, 10, 10, 12, 4, P.CONC_D);
  rect(ctx, 11, 11, 10, 2, P.SH);
  rect(ctx, 14, 13, 4, 3, P.SH2);
  px(ctx, 14, 13, P.OUT);
  rect(ctx, 15, 11, 2, 4, P.OUT);
  px(ctx, 15, 11, P.OL4);
  roofFlat(ctx, 9, 9, 14, 2);
}

function drawObsPost(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 8, 28, 16, 3);
  foundation(ctx, 10, 23, 12, 3);
  wallFront(ctx, 11, 15, 10, 8, P.WOOD_D, P.WOOD, P.WOOD_L, P.WOOD_L);
  rect(ctx, 14, 5, 4, 12, P.WOOD);
  rect(ctx, 15, 6, 2, 10, P.WOOD_L);
  px(ctx, 15, 5, P.WOOD_L);
  rect(ctx, 12, 7, 8, 2, P.WOOD_L);
  rect(ctx, 13, 4, 6, 3, P.WOOD);
  px(ctx, 14, 4, P.WOOD_L);
  rect(ctx, 14, 3, 4, 2, P.OUT);
  windowBlock(ctx, 13, 8, 3, 2);
  px(ctx, 15, 3, P.YEL);
}

function drawFarm(ctx) {
  const P = PIXEL_PAL;
  shadow(ctx, 3, 29, 26, 2);
  rect(ctx, 4, 14, 24, 14, P.SAND);
  px(ctx, 4, 14, P.SAND_D);
  for (let y = 16; y < 26; y += 2) {
    const c = y % 4 === 0 ? P.CROP_L : P.CROP;
    rect(ctx, 5, y, 22, 1, c);
    if (y % 4 === 0) px(ctx, 5, y, P.OL4);
  }
  rect(ctx, 20, 10, 8, 6, P.WOOD_D);
  wallFront(ctx, 21, 11, 6, 5, P.WOOD_D, P.WOOD, P.WOOD_L, P.WOOD_L);
  roofFlat(ctx, 20, 8, 8, 3);
  px(ctx, 22, 13, P.DOOR);
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
  px_unit_patrol_boat: (ctx) => drawBoat(ctx, 12),
  px_unit_submarine: drawSub,
  px_unit_destroyer: drawDestroyer,
  px_unit_cruiser_light: (ctx) => drawCruiser(ctx, false),
  px_unit_cruiser_heavy: (ctx) => drawCruiser(ctx, true),
  px_unit_battleship: (ctx) => drawCruiser(ctx, true),
  px_unit_landing_craft: (ctx) => drawBoat(ctx, 10),
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
  const key = `${id}:${BAKE_REV}`;
  if (!baked.has(key)) {
    const fn = DRAWERS[id];
    if (!fn) return null;
    baked.set(key, bake(key, fn));
  }
  return baked.get(key);
}

const NEAREST_FILTER = 1;

export function registerPixelSprites(scene) {
  for (const id of Object.keys(DRAWERS)) {
    try {
      if (scene.textures.exists(id)) {
        scene.textures.get(id)?.destroy();
      }
      const canvas = getCanvas(id);
      if (!canvas) continue;
      scene.textures.addCanvas(id, canvas);
      const tex = scene.textures.get(id);
      if (tex?.source?.[0]) tex.source[0].setFilter(NEAREST_FILTER);
    } catch (err) {
      console.error(`[PixelSpriteArt] failed to register ${id}`, err);
    }
  }
}

export function hasPixelTexture(scene, key) {
  return !!(key && scene.textures?.exists(key));
}
