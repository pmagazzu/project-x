import Phaser from 'phaser';
import { hexToScreen, hexVertices, screenToHex, isValid, MAP_SIZE, HEX_SIZE } from './HexGrid.js';

const TERRAIN = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2 };

const TERRAIN_COLORS = {
  [TERRAIN.PLAINS]:   { fill: 0x6b8c3e, stroke: 0x4a6128 },
  [TERRAIN.FOREST]:   { fill: 0x2d5a1b, stroke: 0x1a3a0a },
  [TERRAIN.MOUNTAIN]: { fill: 0x7a6a5a, stroke: 0x5a4a3a },
};

const SELECTED_STROKE = 0xffe066;
const HOVER_STROKE    = 0xaaddff;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // --- State ---
    this.terrain = this._generateTerrain();
    this.selectedHex = null;
    this.hoveredHex  = null;

    // --- Camera offset (for pan) ---
    this.camX = this.scale.width  / 2;
    this.camY = this.scale.height / 2;

    // Center on map
    const center = hexToScreen(Math.floor(MAP_SIZE/2), Math.floor(MAP_SIZE/2));
    this.camX -= center.x;
    this.camY -= center.y;

    // --- Graphics layer for tiles ---
    this.tileGfx = this.add.graphics();

    // --- HUD ---
    this.hudText = this.add.text(12, 8, '', {
      font: '14px monospace',
      fill: '#cccccc',
      backgroundColor: '#00000099',
      padding: { x: 8, y: 4 }
    }).setDepth(10);

    this._drawMap();
    this._setupInput();
    this._updateHUD();
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

    // Random forests
    for (let i = 0; i < 30; i++) {
      const cq = Math.floor(rng() * MAP_SIZE);
      const cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -2; dq <= 2; dq++) {
        for (let dr = -2; dr <= 2; dr++) {
          if (isValid(cq+dq, cr+dr) && rng() > 0.4) {
            map[`${cq+dq},${cr+dr}`] = TERRAIN.FOREST;
          }
        }
      }
    }

    // Random mountains
    for (let i = 0; i < 15; i++) {
      const cq = Math.floor(rng() * MAP_SIZE);
      const cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (isValid(cq+dq, cr+dr) && rng() > 0.5) {
            map[`${cq+dq},${cr+dr}`] = TERRAIN.MOUNTAIN;
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

  // ---- Drawing ----
  _drawMap() {
    this.tileGfx.clear();

    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        const terrain = this.terrain[`${q},${r}`];
        const { x, y } = hexToScreen(q, r);
        const sx = x + this.camX;
        const sy = y + this.camY;

        const isSelected = this.selectedHex?.q === q && this.selectedHex?.r === r;
        const isHovered  = this.hoveredHex?.q  === q && this.hoveredHex?.r  === r;

        const colors = TERRAIN_COLORS[terrain];
        const strokeColor = isSelected ? SELECTED_STROKE : isHovered ? HOVER_STROKE : colors.stroke;
        const strokeWidth = isSelected ? 2.5 : isHovered ? 1.5 : 1;

        const verts = hexVertices(sx, sy);

        this.tileGfx.fillStyle(colors.fill);
        this.tileGfx.beginPath();
        this.tileGfx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
          this.tileGfx.lineTo(verts[i].x, verts[i].y);
        }
        this.tileGfx.closePath();
        this.tileGfx.fillPath();

        this.tileGfx.lineStyle(strokeWidth, strokeColor);
        this.tileGfx.beginPath();
        this.tileGfx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
          this.tileGfx.lineTo(verts[i].x, verts[i].y);
        }
        this.tileGfx.closePath();
        this.tileGfx.strokePath();
      }
    }
  }

  // ---- Input ----
  _setupInput() {
    // Pan with mouse drag
    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 2) {
        // Right-drag pan
        this.camX += ptr.x - ptr.prevPosition.x;
        this.camY += ptr.y - ptr.prevPosition.y;
        this._drawMap();
      } else {
        // Hover
        const hex = screenToHex(ptr.x, ptr.y, this.camX, this.camY);
        if (isValid(hex.q, hex.r)) {
          if (!this.hoveredHex || this.hoveredHex.q !== hex.q || this.hoveredHex.r !== hex.r) {
            this.hoveredHex = hex;
            this._drawMap();
          }
        } else if (this.hoveredHex) {
          this.hoveredHex = null;
          this._drawMap();
        }
      }
    });

    // Left click — select tile
    this.input.on('pointerdown', (ptr) => {
      if (ptr.button === 0) {
        const hex = screenToHex(ptr.x, ptr.y, this.camX, this.camY);
        if (isValid(hex.q, hex.r)) {
          this.selectedHex = hex;
          this._drawMap();
          this._updateHUD();
        }
      }
    });

    // Scroll wheel zoom
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const zoomDelta = dy > 0 ? 0.9 : 1.1;
      // Simple zoom toward mouse position
      this.camX = ptr.x + (this.camX - ptr.x) * zoomDelta;
      this.camY = ptr.y + (this.camY - ptr.y) * zoomDelta;
      // Scale HEX_SIZE via camera scale
      this._zoomScale = (this._zoomScale || 1) * zoomDelta;
      this._drawMap();
    });

    // WASD pan
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
  }

  update() {
    let moved = false;
    const speed = 6;
    if (this.wasd.W.isDown) { this.camY += speed; moved = true; }
    if (this.wasd.S.isDown) { this.camY -= speed; moved = true; }
    if (this.wasd.A.isDown) { this.camX += speed; moved = true; }
    if (this.wasd.D.isDown) { this.camX -= speed; moved = true; }
    if (moved) this._drawMap();
  }

  _updateHUD() {
    const sel = this.selectedHex;
    const terrain = sel ? ['Plains','Forest','Mountain'][this.terrain[`${sel.q},${sel.r}`]] : '—';
    this.hudText.setText(
      `Attrition  |  Player 1  |  Iron: 50  |  Turn: 1  |  PLANNING\n` +
      `Selected: ${sel ? `(${sel.q}, ${sel.r}) — ${terrain}` : 'none'}  |  WASD/drag to pan  |  scroll to zoom`
    );
  }
}
