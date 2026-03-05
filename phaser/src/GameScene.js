import Phaser from 'phaser';
import { hexToScreen, hexVertices, isValid, MAP_SIZE, HEX_SIZE, ISO_SQUISH } from './HexGrid.js';

const TERRAIN = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2 };

const TERRAIN_COLORS = {
  [TERRAIN.PLAINS]:   { fill: 0x6b8c3e, stroke: 0x4a6128 },
  [TERRAIN.FOREST]:   { fill: 0x2d5a1b, stroke: 0x1a3a0a },
  [TERRAIN.MOUNTAIN]: { fill: 0x7a6a5a, stroke: 0x5a4a3a },
};

const SELECTED_STROKE = 0xffe066;
const HOVER_STROKE    = 0xaaddff;

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4.0;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.terrain = this._generateTerrain();
    this.selectedHex = null;
    this.hoveredHex  = null;

    // Calculate world bounds of all hexes
    this._calcWorldBounds();

    // Bake all terrain into a RenderTexture (drawn once)
    this._createTerrainTexture();

    // Highlight overlay for hover/selection (moves with camera in world space)
    this.highlightGfx = this.add.graphics();

    // HUD — fixed to screen, not world
    this.hudText = this.add.text(12, 8, '', {
      font: '14px monospace',
      fill: '#cccccc',
      backgroundColor: '#00000099',
      padding: { x: 8, y: 4 }
    }).setDepth(10).setScrollFactor(0);

    // Center camera on map middle
    const center = hexToScreen(Math.floor(MAP_SIZE / 2), Math.floor(MAP_SIZE / 2));
    this.cameras.main.centerOn(center.x, center.y);

    this._setupInput();
    this._updateHUD();
  }

  // ---- World bounds ----
  _calcWorldBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        const { x, y } = hexToScreen(q, r);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const pad = HEX_SIZE + 2;
    this.worldMinX = minX - pad;
    this.worldMinY = minY - pad * ISO_SQUISH;
    this.worldMaxX = maxX + pad;
    this.worldMaxY = maxY + pad * ISO_SQUISH;
  }

  // ---- Bake terrain into RenderTexture ----
  _createTerrainTexture() {
    const w = this.worldMaxX - this.worldMinX;
    const h = this.worldMaxY - this.worldMinY;
    const rt = this.add.renderTexture(this.worldMinX, this.worldMinY, w, h);
    rt.setOrigin(0, 0);

    const gfx = this.make.graphics();

    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        const terrain = this.terrain[`${q},${r}`];
        const { x, y } = hexToScreen(q, r);
        const tx = x - this.worldMinX;
        const ty = y - this.worldMinY;

        const colors = TERRAIN_COLORS[terrain];
        const verts = hexVertices(tx, ty, 1.0);

        gfx.fillStyle(colors.fill);
        gfx.beginPath();
        gfx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
        gfx.closePath();
        gfx.fillPath();

        gfx.lineStyle(1, colors.stroke);
        gfx.beginPath();
        gfx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
        gfx.closePath();
        gfx.strokePath();
      }
    }

    rt.draw(gfx);
    gfx.destroy();
    this.terrainRT = rt;
  }

  // ---- Highlight drawing (only 1-2 hexes) ----
  _drawHighlights() {
    this.highlightGfx.clear();

    const drawHex = (q, r, strokeColor, strokeWidth) => {
      const { x, y } = hexToScreen(q, r);
      const verts = hexVertices(x, y, 1.0);

      this.highlightGfx.lineStyle(strokeWidth, strokeColor);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath();
      this.highlightGfx.strokePath();
    };

    if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r)) {
      drawHex(this.hoveredHex.q, this.hoveredHex.r, HOVER_STROKE, 1.5);
    }
    if (this.selectedHex && isValid(this.selectedHex.q, this.selectedHex.r)) {
      drawHex(this.selectedHex.q, this.selectedHex.r, SELECTED_STROKE, 2.5);
    }
  }

  // ---- Input ----
  _setupInput() {
    const cam = this.cameras.main;
    let dragState = null;

    // Left-click drag for pan, click for select
    this.input.on('pointerdown', (ptr) => {
      if (ptr.button === 0) {
        dragState = {
          startX: ptr.x, startY: ptr.y,
          camScrollX: cam.scrollX, camScrollY: cam.scrollY,
          dragging: false
        };
      }
    });

    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 0 && dragState) {
        const dx = ptr.x - dragState.startX;
        const dy = ptr.y - dragState.startY;
        if (!dragState.dragging && Math.hypot(dx, dy) > 5) {
          dragState.dragging = true;
        }
        if (dragState.dragging) {
          cam.scrollX = dragState.camScrollX - dx / cam.zoom;
          cam.scrollY = dragState.camScrollY - dy / cam.zoom;
        }
      } else if (!ptr.isDown) {
        // Hover
        const worldPt = cam.getWorldPoint(ptr.x, ptr.y);
        const hex = this._worldToHex(worldPt.x, worldPt.y);
        if (isValid(hex.q, hex.r)) {
          if (!this.hoveredHex || this.hoveredHex.q !== hex.q || this.hoveredHex.r !== hex.r) {
            this.hoveredHex = hex;
            this._drawHighlights();
          }
        } else if (this.hoveredHex) {
          this.hoveredHex = null;
          this._drawHighlights();
        }
      }
    });

    this.input.on('pointerup', (ptr) => {
      if (ptr.button === 0 && dragState) {
        if (!dragState.dragging) {
          // Click — select tile
          const worldPt = cam.getWorldPoint(ptr.x, ptr.y);
          const hex = this._worldToHex(worldPt.x, worldPt.y);
          if (isValid(hex.q, hex.r)) {
            this.selectedHex = hex;
            this._drawHighlights();
            this._updateHUD();
          }
        }
        dragState = null;
      }
    });

    // Scroll wheel zoom — keep point under cursor fixed
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const before = cam.getWorldPoint(ptr.x, ptr.y);
      const factor = dy > 0 ? 0.85 : 1.18;
      cam.zoom = Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const after = cam.getWorldPoint(ptr.x, ptr.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    // WASD pan
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
  }

  update() {
    const cam = this.cameras.main;
    const speed = 6 / cam.zoom;
    if (this.wasd.W.isDown) cam.scrollY -= speed;
    if (this.wasd.S.isDown) cam.scrollY += speed;
    if (this.wasd.A.isDown) cam.scrollX -= speed;
    if (this.wasd.D.isDown) cam.scrollX += speed;
  }

  // ---- World-to-hex conversion ----
  _worldToHex(wx, wy) {
    const unsquishedY = wy / ISO_SQUISH;
    const q = (2 / 3) * wx / HEX_SIZE;
    const r = (-1 / 3 * wx + Math.sqrt(3) / 3 * unsquishedY) / HEX_SIZE;
    return this._axialRound(q, r);
  }

  _axialRound(q, r) {
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

  // ---- Terrain generation ----
  _generateTerrain() {
    const map = {};
    const rng = this._seededRng(12345);

    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        map[`${q},${r}`] = TERRAIN.PLAINS;
      }
    }

    for (let i = 0; i < 30; i++) {
      const cq = Math.floor(rng() * MAP_SIZE);
      const cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -2; dq <= 2; dq++) {
        for (let dr = -2; dr <= 2; dr++) {
          if (isValid(cq + dq, cr + dr) && rng() > 0.4) {
            map[`${cq + dq},${cr + dr}`] = TERRAIN.FOREST;
          }
        }
      }
    }

    for (let i = 0; i < 15; i++) {
      const cq = Math.floor(rng() * MAP_SIZE);
      const cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (isValid(cq + dq, cr + dr) && rng() > 0.5) {
            map[`${cq + dq},${cr + dr}`] = TERRAIN.MOUNTAIN;
          }
        }
      }
    }

    return map;
  }

  _seededRng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  _updateHUD() {
    const sel = this.selectedHex;
    const terrain = sel ? ['Plains', 'Forest', 'Mountain'][this.terrain[`${sel.q},${sel.r}`]] : '—';
    this.hudText.setText(
      `Attrition  |  Player 1  |  Iron: 50  |  Turn: 1  |  PLANNING\n` +
      `Selected: ${sel ? `(${sel.q}, ${sel.r}) — ${terrain}` : 'none'}  |  WASD/drag to pan  |  scroll to zoom`
    );
  }
}
