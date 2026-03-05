import Phaser from 'phaser';
import {
  hexToWorld, worldToHex, hexVertices, isValid,
  MAP_SIZE, HEX_SIZE, ISO_SQUISH, getMapBounds
} from './HexGrid.js';

const TERRAIN = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2 };

const TERRAIN_COLORS = {
  [TERRAIN.PLAINS]:   { fill: 0x6b8c3e, stroke: 0x4a6128 },
  [TERRAIN.FOREST]:   { fill: 0x2d5a1b, stroke: 0x1a3a0a },
  [TERRAIN.MOUNTAIN]: { fill: 0x7a6a5a, stroke: 0x5a4a3a },
};

const SELECTED_STROKE = 0xffe066;
const HOVER_STROKE    = 0xaaddff;
const STROKE_WIDTH    = 1;
const HIGHLIGHT_WIDTH = 2.5;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.terrain = this._generateTerrain();
    this.selectedHex = null;
    this.hoveredHex  = null;
    this._isDragging = false;
    this._dragStart  = { x: 0, y: 0 };

    const bounds = getMapBounds();
    this._bounds = bounds;

    // ── Terrain RenderTexture ──────────────────────────────────────────────
    // Draw all tiles once into a texture. Camera scrolls over it — no redraw
    // needed on pan/zoom.
    const padding = HEX_SIZE * 2;
    this._rtOffsetX = -bounds.minX + padding;
    this._rtOffsetY = -bounds.minY + padding;
    const rtW = Math.ceil(bounds.width  + padding * 2);
    const rtH = Math.ceil(bounds.height + padding * 2);

    this.terrainRT = this.add.renderTexture(0, 0, rtW, rtH);
    this.terrainRT.setOrigin(0, 0);
    // Position RT so world coords align: RT top-left = (bounds.minX - padding, bounds.minY - padding)
    this.terrainRT.setPosition(bounds.minX - padding, bounds.minY - padding);

    this._drawTerrainToRT();

    // ── Highlight Graphics (scrolls with camera) ───────────────────────────
    this.highlightGfx = this.add.graphics();
    this.highlightGfx.setDepth(10);

    // ── HUD (fixed to screen — ignore camera) ─────────────────────────────
    this.hudText = this.add.text(12, 8, '', {
      font: '14px monospace',
      fill: '#cccccc',
      backgroundColor: '#00000099',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0).setDepth(100);

    // ── Camera setup ──────────────────────────────────────────────────────
    const cam = this.cameras.main;
    const mapCenterX = (bounds.minX + bounds.maxX) / 2;
    const mapCenterY = (bounds.minY + bounds.maxY) / 2;
    cam.centerOn(mapCenterX, mapCenterY);
    cam.setZoom(1.0);

    // Optional: set camera bounds so you can't pan past the map
    cam.setBounds(
      bounds.minX - padding,
      bounds.minY - padding,
      rtW,
      rtH
    );

    this._setupInput();
    this._updateHUD();
  }

  // ── Terrain drawing (once at startup) ────────────────────────────────────
  _drawTerrainToRT() {
    // Draw into an offscreen Graphics, then stamp it into the RenderTexture
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });

    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        const terrain = this.terrain[`${q},${r}`];
        const { x, y } = hexToWorld(q, r);
        // Offset into RT local coords
        const lx = x + this._rtOffsetX + this._bounds.minX;
        const ly = y + this._rtOffsetY + this._bounds.minY;
        // Wait — RT.draw uses world coords. Since RT is positioned at
        // (bounds.minX - padding, bounds.minY - padding), we draw in world
        // coords directly.
        this._drawHexOnGfx(gfx, x, y, terrain, false, false);
      }
    }

    this.terrainRT.draw(gfx, 0, 0);
    gfx.destroy();
  }

  _drawHexOnGfx(gfx, cx, cy, terrain, isSelected, isHovered) {
    const colors = TERRAIN_COLORS[terrain];
    const strokeColor = isSelected ? SELECTED_STROKE : isHovered ? HOVER_STROKE : colors.stroke;
    const strokeW = (isSelected || isHovered) ? HIGHLIGHT_WIDTH : STROKE_WIDTH;
    const verts = hexVertices(cx, cy);

    gfx.fillStyle(colors.fill);
    gfx.beginPath();
    gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath();
    gfx.fillPath();

    gfx.lineStyle(strokeW, strokeColor);
    gfx.beginPath();
    gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath();
    gfx.strokePath();
  }

  // ── Highlight layer — only redraws 1–2 tiles ─────────────────────────────
  _redrawHighlights() {
    this.highlightGfx.clear();

    const toHighlight = [];
    if (this.hoveredHex  && isValid(this.hoveredHex.q,  this.hoveredHex.r))  toHighlight.push({ hex: this.hoveredHex,  sel: false });
    if (this.selectedHex && isValid(this.selectedHex.q, this.selectedHex.r)) toHighlight.push({ hex: this.selectedHex, sel: true  });

    for (const { hex, sel } of toHighlight) {
      const terrain = this.terrain[`${hex.q},${hex.r}`];
      const { x, y } = hexToWorld(hex.q, hex.r);
      const isHov = !sel && this.hoveredHex?.q === hex.q && this.hoveredHex?.r === hex.r;
      this._drawHexOnGfx(this.highlightGfx, x, y, terrain, sel, isHov);
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────
  _setupInput() {
    const cam = this.cameras.main;

    // Left-click drag to pan
    this.input.on('pointerdown', (ptr) => {
      if (ptr.button === 0) {
        this._isDragging = false;
        this._dragStart = { x: ptr.x, y: ptr.y };
        this._dragStartScroll = { x: cam.scrollX, y: cam.scrollY };
        this._pointerDownPos = { x: ptr.x, y: ptr.y };
      }
    });

    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 0) {
        const dx = ptr.x - this._dragStart.x;
        const dy = ptr.y - this._dragStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this._isDragging = true;
        }
        if (this._isDragging) {
          cam.setScroll(
            this._dragStartScroll.x - dx / cam.zoom,
            this._dragStartScroll.y - dy / cam.zoom
          );
        }
      } else {
        // Hover detection
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex = worldToHex(world.x, world.y);
        const wasHov = this.hoveredHex;
        if (isValid(hex.q, hex.r)) {
          if (!wasHov || wasHov.q !== hex.q || wasHov.r !== hex.r) {
            this.hoveredHex = hex;
            this._redrawHighlights();
          }
        } else if (wasHov) {
          this.hoveredHex = null;
          this._redrawHighlights();
        }
      }
    });

    this.input.on('pointerup', (ptr) => {
      if (ptr.button === 0 && !this._isDragging) {
        // It was a click (not a drag) — select tile
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex = worldToHex(world.x, world.y);
        if (isValid(hex.q, hex.r)) {
          this.selectedHex = hex;
          this._redrawHighlights();
          this._updateHUD();
        }
      }
      this._isDragging = false;
    });

    // Scroll zoom — keep cursor position fixed in world space
    this.input.on('wheel', (ptr, _objs, _dx, dy) => {
      const factor = dy > 0 ? 0.85 : 1.18;
      const newZoom = Phaser.Math.Clamp(cam.zoom * factor, 0.2, 4.0);

      // Zoom toward cursor
      const worldBefore = cam.getWorldPoint(ptr.x, ptr.y);
      cam.setZoom(newZoom);
      const worldAfter = cam.getWorldPoint(ptr.x, ptr.y);
      cam.scrollX += worldBefore.x - worldAfter.x;
      cam.scrollY += worldBefore.y - worldAfter.y;
    });

    // WASD pan
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
  }

  update() {
    const cam = this.cameras.main;
    const speed = 6 / cam.zoom;
    let moved = false;
    if (this.wasd.W.isDown) { cam.scrollY -= speed; moved = true; }
    if (this.wasd.S.isDown) { cam.scrollY += speed; moved = true; }
    if (this.wasd.A.isDown) { cam.scrollX -= speed; moved = true; }
    if (this.wasd.D.isDown) { cam.scrollX += speed; moved = true; }
    // No redraw needed — camera moves, RT follows automatically
  }

  _updateHUD() {
    const sel = this.selectedHex;
    const terrain = sel ? ['Plains', 'Forest', 'Mountain'][this.terrain[`${sel.q},${sel.r}`]] : '—';
    this.hudText.setText(
      `Attrition  |  Player 1  |  Iron: 50  |  Turn: 1  |  PLANNING\n` +
      `Selected: ${sel ? `(${sel.q}, ${sel.r}) — ${terrain}` : 'none'}  |  drag/WASD to pan  |  scroll to zoom`
    );
  }

  // ── Terrain generation ───────────────────────────────────────────────────
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
}
