// Hex grid math — flat-top hexes, axial coordinates
// Isometric projection: 2:1 ratio (classic strategy game look)

export const HEX_SIZE = 48;       // px, flat-top hex radius at zoom=1
export const MAP_SIZE = 25;        // prototype: 25x25; scale up to 200x300+ for full game

// Flat-top hex: width = HEX_SIZE*2, height = HEX_SIZE*sqrt(3)
export const HEX_W = HEX_SIZE * 2;
export const HEX_H = Math.sqrt(3) * HEX_SIZE;

// Isometric squish: compress Y to give angled look (like old Civ/Zomboid)
export const ISO_SQUISH = 0.5;     // 0.5 = classic 2:1 isometric

/**
 * Convert axial hex coords (q, r) to world position (camera-independent).
 * Returns the CENTER of the hex tile in world space.
 */
export function hexToWorld(q, r) {
  const worldX = HEX_SIZE * (3 / 2) * q;
  const worldY = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return {
    x: worldX,
    y: worldY * ISO_SQUISH
  };
}

/**
 * Convert world position to axial hex coordinates (for click detection).
 * Accounts for Phaser camera worldX/worldY.
 */
export function worldToHex(worldX, worldY) {
  const wy = worldY / ISO_SQUISH;
  const q = (2 / 3) * worldX / HEX_SIZE;
  const r = (-1 / 3 * worldX + Math.sqrt(3) / 3 * wy) / HEX_SIZE;
  return axialRound(q, r);
}

function axialRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;

  return { q: rq, r: rr };
}

export function isValid(q, r, mapSize = MAP_SIZE) {
  return q >= 0 && q < mapSize && r >= 0 && r < mapSize;
}

/**
 * Get the 6 vertices of a flat-top hex centered at (cx, cy) in world space.
 */
export function hexVertices(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push({
      x: cx + HEX_SIZE * Math.cos(angle),
      y: cy + HEX_SIZE * Math.sin(angle) * ISO_SQUISH
    });
  }
  return pts;
}

/**
 * Calculate the bounding box of the entire map in world coords.
 * Useful for sizing the RenderTexture and camera bounds.
 */
export function getMapBounds(mapSize = MAP_SIZE) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let q = 0; q < mapSize; q++) {
    for (let r = 0; r < mapSize; r++) {
      const { x, y } = hexToWorld(q, r);
      const hw = HEX_SIZE;
      const hh = HEX_SIZE * ISO_SQUISH;
      if (x - hw < minX) minX = x - hw;
      if (y - hh < minY) minY = y - hh;
      if (x + hw > maxX) maxX = x + hw;
      if (y + hh > maxY) maxY = y + hh;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
