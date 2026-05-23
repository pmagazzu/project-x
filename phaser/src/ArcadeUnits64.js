/**
 * 64×64 arcade WWII unit sprites — chunky silhouettes, bold outlines, top-left light.
 * Inspired by isometric cartoony strategy reference art.
 */

import { PIXEL_PAL } from './PixelPalette.js';

const P = () => PIXEL_PAL;
const O = () => P().OUT;

function px(ctx, x, y, col, W = 64, H = 64) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 1, 1);
}

function rect(ctx, x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

/** Soft elliptical ground shadow (reference-style). */
export function groundShadow(ctx, cx, baseY, halfW = 18) {
  const x0 = cx - halfW;
  rect(ctx, x0 + 6, baseY, halfW * 2 - 12, 6, 'rgba(0,0,0,0.14)');
  rect(ctx, x0 + 10, baseY + 1, halfW * 2 - 20, 5, 'rgba(0,0,0,0.26)');
  rect(ctx, x0 + 14, baseY + 2, halfW * 2 - 28, 4, 'rgba(0,0,0,0.38)');
}

/** Chunky filled box with top-left highlight and outline. */
function box(ctx, x, y, w, h, d, m, l, hi) {
  const pal = P();
  rect(ctx, x, y, w, h, m);
  for (let c = 0; c < w; c++) px(ctx, x + c, y, hi, 64, 64);
  for (let r = 1; r < h; r++) {
    px(ctx, x, y + r, d, 64, 64);
    px(ctx, x + w - 1, y + r, l, 64, 64);
  }
  for (let c = 0; c < w; c++) px(ctx, x + c, y + h - 1, pal.OUT, 64, 64);
  px(ctx, x, y, hi, 64, 64);
  px(ctx, x + w - 1, y, l, 64, 64);
}

function olFace() {
  const pal = P();
  return { d: pal.OL0, m: pal.OL2, l: pal.OL3, hi: pal.OL5 };
}

function metFace() {
  const pal = P();
  return { d: pal.MET, m: pal.MET_L, l: pal.MET_H, hi: pal.WHITE };
}

// ── Infantry base ─────────────────────────────────────────────────────────────

function drawSoldierCore(ctx, opts = {}) {
  const pal = P();
  const crouch = !!opts.crouch;
  const y0 = crouch ? 6 : 0;
  const cx = 32;

  groundShadow(ctx, cx, 54 + y0, crouch ? 14 : 18);

  // Boots
  box(ctx, 20, 46 + y0, 8, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);
  box(ctx, 36, 46 + y0, 8, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);

  // Legs
  box(ctx, 22, 36 + y0, 7, 11, pal.OL0, pal.OL1, pal.OL2, pal.OL3);
  box(ctx, 35, 36 + y0, 7, 11, pal.OL0, pal.OL1, pal.OL2, pal.OL3);

  // Torso
  box(ctx, 20, 22 + y0, 24, 16, pal.OL0, pal.OL2, pal.OL3, pal.OL5);
  rect(ctx, 24, 26 + y0, 16, 8, pal.OL3);
  px(ctx, 38, 30 + y0, pal.OL0, 64, 64);

  // Helmet (oversized — arcade chibi)
  box(ctx, 24, 10 + y0, 16, 12, pal.OL1, pal.OL3, pal.OL4, pal.OL5);
  rect(ctx, 26, 8 + y0, 12, 4, pal.OL4);
  px(ctx, 28, 8 + y0, pal.OL5, 64, 64);
  px(ctx, 36, 9 + y0, pal.OL2, 64, 64);

  // Face
  rect(ctx, 28, 20 + y0, 8, 4, pal.SKIN);
  px(ctx, 30, 21 + y0, pal.SKIN_D, 64, 64);
  px(ctx, 34, 21 + y0, pal.SKIN_D, 64, 64);
  px(ctx, 32, 22 + y0, pal.OUT, 64, 64);

  // Rifle across chest
  rect(ctx, 26, 28 + y0, 6, 10, pal.WOOD);
  rect(ctx, 27, 29 + y0, 4, 8, pal.WOOD_L);
  rect(ctx, 32, 30 + y0, 22, 4, pal.MET);
  rect(ctx, 34, 29 + y0, 18, 2, pal.MET_H);
  rect(ctx, 50, 29 + y0, 4, 6, pal.MET);
  px(ctx, 52, 30 + y0, pal.MET_L, 64, 64);
  px(ctx, 26, 37 + y0, pal.OUT, 64, 64);
  px(ctx, 53, 34 + y0, pal.OUT, 64, 64);
}

export function drawInfantry(ctx) { drawSoldierCore(ctx); }

export function drawEngineer(ctx) {
  const pal = P();
  const cx = 32;
  groundShadow(ctx, cx, 54, 18);

  box(ctx, 20, 46, 8, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);
  box(ctx, 36, 46, 8, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);
  box(ctx, 22, 36, 7, 11, pal.TAN_D, pal.TAN, pal.TAN, pal.TAN_D);
  box(ctx, 35, 36, 7, 11, pal.TAN_D, pal.TAN, pal.TAN, pal.TAN_D);

  box(ctx, 20, 22, 24, 16, pal.VEST_D, pal.VEST, pal.VEST_H, pal.VEST_H);
  rect(ctx, 20, 26, 24, 4, pal.YEL_H);
  rect(ctx, 20, 32, 24, 3, pal.YEL);

  // Hard hat
  rect(ctx, 22, 8, 20, 6, pal.HAT);
  rect(ctx, 24, 6, 16, 4, pal.YEL_H);
  rect(ctx, 22, 12, 20, 2, pal.HAT_D);
  px(ctx, 22, 6, pal.OUT, 64, 64);
  rect(ctx, 28, 18, 8, 4, pal.SKIN);

  // Shovel
  rect(ctx, 14, 18, 4, 22, pal.MET);
  rect(ctx, 12, 16, 6, 4, pal.MET_H);
  px(ctx, 14, 18, pal.OUT, 64, 64);

  // Wrench
  rect(ctx, 42, 26, 4, 14, pal.MET_L);
  rect(ctx, 46, 26, 10, 4, pal.MET);
  rect(ctx, 50, 24, 6, 4, pal.MET_H);
  rect(ctx, 54, 26, 4, 6, pal.MET);
  px(ctx, 54, 28, pal.YEL, 64, 64);

  rect(ctx, 26, 50, 12, 4, pal.MET);
  px(ctx, 26, 50, pal.OUT, 64, 64);
}

export function drawMedic(ctx) {
  const pal = P();
  groundShadow(ctx, 32, 54, 18);
  box(ctx, 20, 46, 8, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);
  box(ctx, 36, 46, 8, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);
  box(ctx, 20, 22, 24, 24, pal.WHITE, '#f0ece4', pal.WHITE, pal.WHITE);
  rect(ctx, 26, 28, 12, 10, pal.RED_L);
  rect(ctx, 30, 30, 4, 6, pal.WHITE);
  rect(ctx, 28, 32, 8, 2, pal.WHITE);
  box(ctx, 24, 10, 16, 12, pal.WHITE, '#f4f0e8', pal.WHITE, pal.WHITE);
  rect(ctx, 28, 20, 8, 4, pal.SKIN);
  rect(ctx, 14, 28, 6, 8, pal.RED);
  px(ctx, 14, 28, pal.OUT, 64, 64);
}

export function drawRecon(ctx) {
  const pal = P();
  groundShadow(ctx, 32, 55, 16);
  box(ctx, 22, 46, 7, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);
  box(ctx, 35, 46, 7, 5, pal.BOOT, pal.BOOT, pal.MET, pal.MET_L);
  box(ctx, 22, 38, 6, 9, pal.OL0, pal.OL1, pal.OL2, pal.OL3);
  box(ctx, 36, 38, 6, 9, pal.OL0, pal.OL1, pal.OL2, pal.OL3);
  box(ctx, 22, 26, 20, 14, pal.OL0, pal.OL2, pal.OL3, pal.OL4);

  // Soft cap
  rect(ctx, 26, 16, 12, 4, pal.OL1);
  rect(ctx, 28, 14, 8, 4, pal.OL3);
  px(ctx, 28, 14, pal.OUT, 64, 64);

  // Binoculars
  rect(ctx, 26, 22, 12, 5, pal.MET);
  rect(ctx, 28, 23, 3, 3, pal.WIN_L);
  rect(ctx, 34, 23, 3, 3, pal.WIN_L);
  px(ctx, 32, 23, pal.MET_H, 64, 64);

  // Radio antenna
  rect(ctx, 44, 18, 3, 20, pal.MET);
  px(ctx, 44, 14, pal.YEL, 64, 64);
  px(ctx, 44, 12, pal.MET_H, 64, 64);

  rect(ctx, 14, 32, 6, 4, pal.MET);
  rect(ctx, 12, 32, 3, 5, pal.WOOD_D);
}

export function drawAssaultInf(ctx) {
  drawSoldierCore(ctx);
  const pal = P();
  rect(ctx, 24, 28, 6, 12, pal.YEL);
  rect(ctx, 32, 30, 20, 5, pal.MET);
  rect(ctx, 36, 32, 8, 6, pal.MET_L);
  px(ctx, 50, 32, pal.OUT, 64, 64);
}

export function drawSmgSquad(ctx) {
  drawSoldierCore(ctx);
  const pal = P();
  rect(ctx, 34, 30, 18, 5, pal.MET);
  rect(ctx, 40, 32, 6, 7, pal.MET_L);
  px(ctx, 36, 32, pal.YEL, 64, 64);
}

export function drawLmgTeam(ctx) {
  const pal = P();
  const f = olFace();
  groundShadow(ctx, 32, 55, 22);
  box(ctx, 16, 44, 32, 8, f.d, f.m, f.l, f.hi);
  box(ctx, 18, 36, 8, 9, f.d, f.m, f.l, f.hi);
  box(ctx, 38, 36, 8, 9, f.d, f.m, f.l, f.hi);
  box(ctx, 20, 24, 24, 14, f.d, f.m, f.l, f.hi);
  box(ctx, 26, 12, 12, 12, f.d, f.m, f.l, f.hi);
  rect(ctx, 28, 20, 8, 4, pal.SKIN);
  rect(ctx, 8, 38, 28, 4, pal.MET);
  rect(ctx, 10, 40, 6, 6, pal.MET_L);
  rect(ctx, 12, 46, 4, 6, pal.MET);
  px(ctx, 34, 40, pal.OUT, 64, 64);
}

export function drawHmgTeam(ctx) {
  const pal = P();
  const f = olFace();
  const m = metFace();
  groundShadow(ctx, 32, 55, 24);
  box(ctx, 12, 46, 40, 6, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  box(ctx, 16, 38, 8, 8, f.d, f.m, f.l, f.hi);
  box(ctx, 40, 38, 8, 8, f.d, f.m, f.l, f.hi);
  box(ctx, 4, 32, 36, 6, m.d, m.m, m.l, m.hi);
  rect(ctx, 8, 34, 28, 2, pal.MET_H);
  for (const x of [10, 16, 22, 28]) box(ctx, x, 38, 4, 8, m.d, m.m, m.l, m.hi);
  box(ctx, 20, 26, 24, 10, f.d, f.m, f.l, f.hi);
}

export function drawSniper(ctx) {
  const pal = P();
  const f = olFace();
  groundShadow(ctx, 32, 56, 22);
  box(ctx, 12, 48, 40, 8, f.d, f.m, f.l, f.hi);
  rect(ctx, 16, 50, 32, 4, f.l);
  box(ctx, 14, 44, 36, 6, f.d, f.m, f.l, f.hi);
  for (let i = 0; i < 10; i++) px(ctx, 16 + i * 3, 45, i % 2 ? f.l : f.hi, 64, 64);
  rect(ctx, 8, 42, 48, 4, pal.MET);
  rect(ctx, 10, 43, 42, 2, pal.WOOD_L);
  rect(ctx, 20, 38, 12, 6, f.m);
  px(ctx, 24, 40, pal.SKIN, 64, 64);
  px(ctx, 54, 42, pal.OUT, 64, 64);
}

export function drawMortar(ctx) {
  const pal = P();
  const f = olFace();
  const m = metFace();
  groundShadow(ctx, 32, 55, 18);
  box(ctx, 16, 46, 32, 6, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  box(ctx, 20, 38, 8, 8, f.d, f.m, f.l, f.hi);
  box(ctx, 36, 38, 8, 8, f.d, f.m, f.l, f.hi);
  box(ctx, 26, 28, 12, 12, m.d, m.m, m.l, m.hi);
  box(ctx, 24, 16, 16, 14, m.d, m.m, m.l, m.hi);
  rect(ctx, 28, 14, 8, 4, pal.MET_H);
}

export function drawMotorcycle(ctx) {
  const pal = P();
  const m = metFace();
  groundShadow(ctx, 32, 55, 20);
  rect(ctx, 16, 46, 32, 6, pal.MET);
  box(ctx, 18, 42, 8, 8, m.d, m.m, m.l, m.hi);
  box(ctx, 38, 42, 8, 8, m.d, m.m, m.l, m.hi);
  box(ctx, 24, 32, 16, 12, m.d, m.m, m.l, m.hi);
  box(ctx, 26, 24, 12, 10, pal.OL1, pal.OL2, pal.OL3, pal.OL5);
  rect(ctx, 28, 20, 8, 6, pal.SKIN);
  rect(ctx, 22, 34, 20, 4, pal.MET_H);
}

export function drawArmoredCar(ctx) {
  const pal = P();
  const f = olFace();
  groundShadow(ctx, 32, 55, 24);
  box(ctx, 8, 44, 48, 6, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  box(ctx, 10, 28, 44, 18, f.d, f.m, f.l, f.hi);
  rect(ctx, 14, 32, 12, 10, pal.WIN);
  rect(ctx, 14, 33, 10, 8, pal.WIN_L);
  box(ctx, 8, 48, 8, 6, pal.OUT, pal.MET, pal.MET_L, pal.MET_H);
  box(ctx, 48, 48, 8, 6, pal.OUT, pal.MET, pal.MET_L, pal.MET_H);
  box(ctx, 40, 26, 16, 8, pal.MET, pal.MET_L, pal.MET_H, pal.WHITE);
  px(ctx, 54, 28, pal.OUT, 64, 64);
}

export function drawHalftrack(ctx) {
  const pal = P();
  const f = olFace();
  groundShadow(ctx, 32, 55, 26);
  box(ctx, 6, 44, 52, 6, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  box(ctx, 10, 28, 40, 18, f.d, f.m, f.l, f.hi);
  rect(ctx, 6, 46, 16, 8, pal.MET);
  for (let y = 48; y < 54; y++) px(ctx, 8, y, pal.MET_H, 64, 64);
  rect(ctx, 44, 48, 12, 6, pal.OUT);
  rect(ctx, 48, 50, 4, 4, pal.MET_L);
  box(ctx, 36, 24, 16, 8, pal.MET, pal.MET_L, pal.MET_H, pal.WHITE);
}

export function drawTank(ctx) {
  const pal = P();
  const f = olFace();
  const m = metFace();
  groundShadow(ctx, 32, 56, 26);

  // Treads + wheels
  rect(ctx, 6, 46, 52, 10, pal.OUT);
  rect(ctx, 8, 48, 48, 6, pal.MET);
  for (let x = 10; x < 52; x += 6) {
    rect(ctx, x, 48, 4, 4, pal.MET_L);
    px(ctx, x + 1, 49, pal.MET_H, 64, 64);
    px(ctx, x + 2, 50, pal.OUT, 64, 64);
  }

  // Hull
  box(ctx, 10, 30, 44, 18, f.d, f.m, f.l, f.hi);
  rect(ctx, 12, 34, 40, 10, f.l);

  // Turret (oversized)
  box(ctx, 20, 16, 24, 16, f.d, f.m, f.l, f.hi);
  rect(ctx, 22, 18, 20, 10, f.l);
  px(ctx, 22, 16, f.hi, 64, 64);

  // Barrel
  rect(ctx, 42, 20, 20, 6, pal.MET);
  rect(ctx, 44, 21, 16, 4, pal.MET_H);
  px(ctx, 60, 22, pal.OUT, 64, 64);
  px(ctx, 42, 25, pal.OUT, 64, 64);
}

export function drawArtillery(ctx) {
  const pal = P();
  const f = olFace();
  groundShadow(ctx, 32, 55, 20);
  box(ctx, 14, 46, 36, 6, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  box(ctx, 16, 38, 32, 10, f.d, f.m, f.l, f.hi);
  rect(ctx, 12, 50, 8, 6, pal.OUT);
  rect(ctx, 44, 50, 8, 6, pal.OUT);
  rect(ctx, 14, 50, 4, 4, pal.MET_L);
  rect(ctx, 46, 50, 4, 4, pal.MET_L);

  // Gun on rotating base
  rect(ctx, 28, 32, 8, 8, pal.OL2);
  rect(ctx, 22, 14, 8, 22, pal.WOOD);
  rect(ctx, 24, 10, 4, 26, pal.WOOD_L);
  box(ctx, 26, 4, 24, 8, pal.MET, pal.MET_L, pal.MET_H, pal.WHITE);
  px(ctx, 48, 6, pal.OUT, 64, 64);
}

export function drawAntiTank(ctx) {
  const pal = P();
  groundShadow(ctx, 32, 55, 18);
  box(ctx, 18, 44, 28, 6, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  box(ctx, 20, 30, 24, 14, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  rect(ctx, 10, 24, 32, 6, pal.MET);
  rect(ctx, 12, 25, 28, 3, pal.MET_H);
  box(ctx, 6, 22, 8, 10, pal.OL0, pal.OL2, pal.OL3, pal.OL4);
  box(ctx, 42, 26, 10, 12, pal.OL1, pal.OL2, pal.OL3, pal.OL4);
}

export function drawTruck(ctx) {
  const pal = P();
  const f = olFace();
  groundShadow(ctx, 32, 55, 26);
  box(ctx, 6, 44, 52, 6, pal.CONC_D, pal.CONC, pal.CONC_L, pal.CONC_H);
  box(ctx, 8, 28, 44, 18, f.d, f.m, f.l, f.hi);
  box(ctx, 34, 16, 18, 14, f.d, f.m, f.l, f.hi);
  rect(ctx, 38, 20, 8, 6, pal.WIN);
  rect(ctx, 10, 50, 8, 6, pal.OUT);
  rect(ctx, 12, 52, 4, 4, pal.MET_L);
  rect(ctx, 46, 50, 8, 6, pal.OUT);
  rect(ctx, 48, 52, 4, 4, pal.MET_L);
}

export function drawNavalHull(ctx, x, w, deckY = 20) {
  const pal = P();
  const hullH = 14;
  // Shadow
  groundShadow(ctx, x + w / 2, 54, Math.floor(w / 2) + 4);
  // Hull
  rect(ctx, x, deckY + 4, w, hullH, pal.OUT);
  rect(ctx, x + 1, deckY + 5, w - 2, hullH - 2, pal.NAVY);
  rect(ctx, x + 2, deckY + 6, w - 4, hullH - 4, pal.NAVY_L);
  px(ctx, x + 2, deckY + 5, pal.NAVY_H, 64, 64);
  // Red waterline
  rect(ctx, x + 1, deckY + hullH + 2, w - 2, 2, pal.HULL_RED);
  rect(ctx, x + 2, deckY + hullH + 3, w - 4, 1, pal.HULL_RED_L);
  // Wood deck
  rect(ctx, x + 3, deckY, w - 6, 6, pal.DECK_D);
  rect(ctx, x + 4, deckY + 1, w - 8, 4, pal.DECK);
  for (let i = 0; i < w - 8; i += 3) px(ctx, x + 4 + i, deckY + 2, pal.DECK_L, 64, 64);
}

export function drawBoat(ctx, w = 28) {
  const x = Math.floor((64 - w) / 2);
  const pal = P();
  drawNavalHull(ctx, x, w, 22);
  box(ctx, x + 8, 14, 10, 10, pal.OL1, pal.OL2, pal.OL3, pal.OL5);
  rect(ctx, x + 10, 16, 6, 6, pal.MET_L);
  px(ctx, x + 12, 16, pal.MET_H, 64, 64);
}

export function drawSub(ctx) {
  const pal = P();
  groundShadow(ctx, 32, 54, 16);
  rect(ctx, 16, 28, 32, 14, pal.NAVY);
  rect(ctx, 18, 30, 28, 10, pal.NAVY_L);
  px(ctx, 18, 28, pal.NAVY_H, 64, 64);
  box(ctx, 26, 16, 12, 14, pal.NAVY, pal.NAVY_L, pal.NAVY_H, pal.WHITE);
  rect(ctx, 30, 22, 4, 4, pal.WIN_L);
  rect(ctx, 28, 14, 8, 4, pal.NAVY_H);
}

export function drawDestroyer(ctx) {
  const w = 40;
  const x = Math.floor((64 - w) / 2);
  const pal = P();
  drawNavalHull(ctx, x, w, 18);
  box(ctx, x + 6, 12, 6, 10, pal.OL2, pal.OL3, pal.OL4, pal.OL5);
  box(ctx, x + w - 12, 12, 6, 10, pal.OL2, pal.OL3, pal.OL4, pal.OL5);
  box(ctx, x + w / 2 - 4, 10, 8, 12, pal.MET_L, pal.MET_H, pal.WHITE, pal.WHITE);
  rect(ctx, x + 4, 8, w - 8, 2, pal.MET);
}

export function drawCruiser(ctx, big = false) {
  const w = big ? 48 : 40;
  const x = Math.floor((64 - w) / 2);
  const pal = P();
  drawNavalHull(ctx, x, w, 16);
  box(ctx, x + 6, 10, 6, 10, pal.OL2, pal.OL3, pal.OL4, pal.OL5);
  box(ctx, x + w - 12, 10, 6, 10, pal.OL2, pal.OL3, pal.OL4, pal.OL5);
  if (big) {
    box(ctx, x + 14, 8, 6, 12, pal.MET_L, pal.MET_H, pal.WHITE, pal.WHITE);
    box(ctx, x + 24, 8, 6, 12, pal.MET_L, pal.MET_H, pal.WHITE, pal.WHITE);
  }
  rect(ctx, x + w / 2 - 2, 6, 4, 14, pal.MET);
  px(ctx, x + w / 2, 4, pal.MET_H, 64, 64);
}

export function drawAircraft(ctx) {
  const pal = P();
  const f = olFace();
  // Large wing shadow on ground
  groundShadow(ctx, 32, 56, 24);
  rect(ctx, 8, 30, 48, 3, 'rgba(0,0,0,0.12)');
  rect(ctx, 14, 32, 36, 2, 'rgba(0,0,0,0.18)');

  // Fuselage
  box(ctx, 28, 18, 8, 22, f.d, f.m, f.l, f.hi);

  // Lower wing
  box(ctx, 6, 28, 52, 10, f.d, f.m, f.l, f.hi);
  rect(ctx, 8, 30, 48, 6, f.l);
  px(ctx, 8, 28, f.hi, 64, 64);
  px(ctx, 56, 28, f.hi, 64, 64);

  // Upper wing
  box(ctx, 10, 20, 44, 8, f.d, f.m, f.l, f.hi);
  rect(ctx, 12, 22, 40, 4, f.l);

  // Struts
  rect(ctx, 18, 26, 3, 8, pal.MET);
  rect(ctx, 42, 26, 3, 8, pal.MET);

  // Tail
  box(ctx, 26, 10, 12, 8, f.d, f.m, f.l, f.hi);
  rect(ctx, 6, 18, 10, 12, f.m);
  rect(ctx, 48, 18, 10, 12, f.m);
  px(ctx, 6, 18, f.hi, 64, 64);

  // Propeller hub + blades
  rect(ctx, 30, 12, 4, 6, pal.PROP);
  rect(ctx, 28, 8, 8, 4, pal.PROP_L);
  px(ctx, 26, 10, pal.OUT, 64, 64);
  px(ctx, 36, 10, pal.OUT, 64, 64);

  // Red landing gear
  rect(ctx, 26, 38, 3, 8, pal.RED_L);
  rect(ctx, 35, 38, 3, 8, pal.RED_L);
  px(ctx, 26, 45, pal.OUT, 64, 64);
}
