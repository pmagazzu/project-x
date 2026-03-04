// Hex grid math — flat-top hexes, axial coordinates
// Isometric projection: 2:1 ratio (classic strategy game look)

export const HEX_SIZE = 48;       // px, flat-top hex radius
export const MAP_SIZE = 25;        // 25x25 grid

// Flat-top hex: width = HEX_SIZE*2, height = HEX_SIZE*sqrt(3)
export const HEX_W = HEX_SIZE * 2;
export const HEX_H = Math.sqrt(3) * HEX_SIZE;

// Isometric squish: compress Y to give angled look (like old Civ/Zomboid)
export const ISO_SQUISH = 0.5;     // 0.5 = classic 2:1 isometric

/**
 * Convert axial hex coords (q, r) to isometric screen position.
 * Returns the CENTER of the hex tile in screen space.
 */
export function hexToScreen(q, r) {
  // Flat-top hex world positions
  const worldX = HEX_SIZE * (3/2) * q;
  const worldY = HEX_SIZE * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

  // Apply isometric squish to Y axis
  return {
    x: worldX,
    y: worldY * ISO_SQUISH
  };
}

/**
 * Convert screen position to axial hex coordinates (for click detection).
 */
export function screenToHex(screenX, screenY, cameraX, cameraY) {
  const wx = screenX - cameraX;
  const wy = (screenY - cameraY) / ISO_SQUISH;

  const q = (2/3) * wx / HEX_SIZE;
  const r = (-1/3 * wx + Math.sqrt(3)/3 * wy) / HEX_SIZE;

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

export function isValid(q, r) {
  return q >= 0 && q < MAP_SIZE && r >= 0 && r < MAP_SIZE;
}

/**
 * Get the 6 vertices of a flat-top hex centered at (cx, cy) in screen space.
 * Used for drawing the hex polygon.
 */
export function hexVertices(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);  // flat-top: 0°, 60°, 120°...
    pts.push({
      x: cx + HEX_SIZE * Math.cos(angle),
      y: cy + HEX_SIZE * Math.sin(angle) * ISO_SQUISH
    });
  }
  return pts;
}
