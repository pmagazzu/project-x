import Phaser from 'phaser';
import {
  hexToWorld, worldToHex, hexVertices, isValid,
  MAP_SIZE, HEX_SIZE, getMapBounds
} from './HexGrid.js';
import {
  createGameState, createBuilding, unitAt, buildingAt, roadAt,
  getReachableHexes, getAttackableHexes, computeFog,
  resolveTurn, checkWinner, calcIncome, queueRecruit, registerDesign,
  UNIT_TYPES, PLAYER_COLORS, BUILDING_TYPES, RESOURCE_TYPES,
  MODULES, CHASSIS_BUILDINGS, MAX_DESIGNS_PER_PLAYER,
  designRegistrationCost, computeDesignStats
} from './GameState.js';

// ── Constants ─────────────────────────────────────────────────────────────
const TERRAIN        = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2 };
const TERRAIN_COLORS = {
  0: { fill: 0x6b8c3e, stroke: 0x4a6128 },
  1: { fill: 0x2d5a1b, stroke: 0x1a3a0a },
  2: { fill: 0x7a6a5a, stroke: 0x5a4a3a },
};
const SELECTED_STROKE  = 0xffe066;
const HOVER_STROKE     = 0xaaddff;
const MOVE_HIGHLIGHT   = 0x00ffcc;
const ATTACK_HIGHLIGHT = 0xff6600;

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  // Add game objects to the UI layer so the fixed uiCamera renders them
  // (main world camera ignores _uiLayer so zoom never displaces HUD)
  _addToUI(objs) {
    if (!this._uiLayer) return;
    for (const o of objs) { if (o && !o.destroyed) this._uiLayer.add(o); }
  }

  create() {
    this.terrain   = this._generateTerrain();
    this.gameState = createGameState();

    // Interaction state
    this.hoveredHex   = null;
    this.selectedUnit = null;
    this.reachable    = [];
    this.attackable   = [];
    this.mode         = 'select';
    this._isDragging  = false;
    this._dragStart   = { x: 0, y: 0 };
    this._dragStartScroll = { x: 0, y: 0 };

    // Settings
    this.settings = {
      engineerAutoBuild: true,  // auto-open build menu after engineer moves
      autoAttackMode:    true,  // auto-enter attack mode after move if enemies in range
      showContextMenu:   true,  // contextual action popup near selected unit
    };

    // Recruitment panel state
    this.recruitBuilding = null;

    // Build terrain RenderTexture
    const bounds  = getMapBounds();
    this._bounds  = bounds;
    const padding = HEX_SIZE * 2;
    const rtW = Math.ceil(bounds.width  + padding * 2);
    const rtH = Math.ceil(bounds.height + padding * 2);

    this.terrainRT = this.add.renderTexture(0, 0, rtW, rtH)
      .setOrigin(0, 0).setPosition(bounds.minX - padding, bounds.minY - padding);
    this._drawTerrainToRT();

    // World graphics layers (depth order)
    this.roadGfx      = this.add.graphics().setDepth(5);
    this.resourceGfx  = this.add.graphics().setDepth(8);
    this.highlightGfx = this.add.graphics().setDepth(10);
    this.buildingGfx  = this.add.graphics().setDepth(15);
    this.unitGfx      = this.add.graphics().setDepth(20);
    this.fogGfx       = this.add.graphics().setDepth(30);

    this._log = [];

    // UI Layer — all HUD/panel objects go here
    this._uiLayer = this.add.layer().setDepth(99);

    // Build static UI panels
    this._createTopBar();
    this._createBottomPanel();
    this._createRecruitPanel();

    // Move all scroll-factor-0 objects created so far into _uiLayer
    // (catches top bar, bottom panel, buttons, etc. without touching each line)
    const worldObjs = new Set([
      this.terrainRT, this.roadGfx, this.resourceGfx,
      this.highlightGfx, this.buildingGfx, this.unitGfx, this.fogGfx, this._uiLayer
    ]);
    for (const obj of [...this.children.list]) {
      if (!worldObjs.has(obj) && obj.scrollFactorX === 0) {
        this._uiLayer.add(obj);
      }
    }

    // Main (world) camera
    const cam = this.cameras.main;
    cam.centerOn((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    cam.setZoom(1.0);
    cam.setBounds(bounds.minX - padding, bounds.minY - padding, rtW, rtH);
    cam.ignore(this._uiLayer);

    // Fixed UI camera — zoom=1, no scroll, ignores all world graphics
    const sw = this.scale.width, sh = this.scale.height;
    this.uiCamera = this.cameras.add(0, 0, sw, sh).setName('ui').setScroll(0, 0).setZoom(1);
    this.uiCamera.transparent = true; // transparent background — must not cover world
    this.uiCamera.ignore([
      this.terrainRT, this.roadGfx, this.resourceGfx,
      this.highlightGfx, this.buildingGfx, this.unitGfx, this.fogGfx,
    ]);
    this.scale.on('resize', (gs) => this.uiCamera.setSize(gs.width, gs.height));

    this._setupInput();
    this._drawStaticLayers();
    this._refresh();
  }

  // ── Terrain ──────────────────────────────────────────────────────────────
  _drawTerrainToRT() {
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        const { x, y } = hexToWorld(q, r);
        this._drawHex(gfx, x, y, this.terrain[`${q},${r}`], false, false);
      }
    }
    this.terrainRT.draw(gfx, 0, 0);
    gfx.destroy();
  }

  _drawHex(gfx, cx, cy, terrain, isSelected, isHovered) {
    const colors = TERRAIN_COLORS[terrain];
    const strokeColor = isSelected ? SELECTED_STROKE : isHovered ? HOVER_STROKE : colors.stroke;
    const strokeW = (isSelected || isHovered) ? 2.5 : 1;
    const verts = hexVertices(cx, cy);
    gfx.fillStyle(colors.fill);
    gfx.beginPath(); gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath(); gfx.fillPath();
    gfx.lineStyle(strokeW, strokeColor);
    gfx.beginPath(); gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath(); gfx.strokePath();
  }

  // ── Static layers (resources, roads) ─────────────────────────────────────
  _drawStaticLayers() {
    this._redrawRoads();
    this._redrawResources();
  }

  _redrawResources() {
    this.resourceGfx.clear();
    for (const [key, res] of Object.entries(this.gameState.resourceHexes)) {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToWorld(q, r);
      const s = HEX_SIZE * 0.2;
      const color = RESOURCE_TYPES[res.type].color;
      this.resourceGfx.fillStyle(color, 0.8);
      this.resourceGfx.fillTriangle(x, y - s * 1.3, x - s, y, x + s, y);
      this.resourceGfx.fillTriangle(x, y + s * 1.3, x - s, y, x + s, y);
      // Label
      const label = res.type === 'IRON' ? '⛏' : '🛢';
      // (text labels added separately if needed)
    }
  }

  _redrawRoads() {
    this.roadGfx.clear();
    for (const b of this.gameState.buildings) {
      if (b.type !== 'ROAD') continue;
      const { x, y } = hexToWorld(b.q, b.r);
      // Road: lighter overlay on hex
      const verts = hexVertices(x, y);
      this.roadGfx.fillStyle(0xd4b896, 0.55);
      this.roadGfx.beginPath(); this.roadGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.roadGfx.lineTo(verts[i].x, verts[i].y);
      this.roadGfx.closePath(); this.roadGfx.fillPath();
    }
  }

  // ── Full refresh ──────────────────────────────────────────────────────────
  _refresh() {
    this._redrawHighlights();
    this._redrawBuildings();
    this._redrawUnits();
    this._redrawFog();
    this._updateTopBar();
    this._updateBottomPanel();
    this.btnSubmit?.setVisible(true);
    // Context menu is right-click only; no auto-refresh needed
  }

  // ── Highlights ────────────────────────────────────────────────────────────
  _redrawHighlights() {
    this.highlightGfx.clear();

    const fillHex = (q, r, color, alpha) => {
      const { x, y } = hexToWorld(q, r);
      const verts = hexVertices(x, y);
      this.highlightGfx.fillStyle(color, alpha);
      this.highlightGfx.beginPath(); this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath(); this.highlightGfx.fillPath();
      this.highlightGfx.lineStyle(1.5, color, 0.8);
      this.highlightGfx.strokePath();
    };

    for (const { q, r } of this.reachable)   fillHex(q, r, MOVE_HIGHLIGHT,   0.25);
    for (const { q, r } of this.attackable)  fillHex(q, r, ATTACK_HIGHLIGHT, 0.3);

    if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r)) {
      const { x, y } = hexToWorld(this.hoveredHex.q, this.hoveredHex.r);
      this._drawHex(this.highlightGfx, x, y, this.terrain[`${this.hoveredHex.q},${this.hoveredHex.r}`], false, true);
    }
    if (this.selectedUnit) {
      const { x, y } = hexToWorld(this.selectedUnit.q, this.selectedUnit.r);
      this.highlightGfx.lineStyle(3, SELECTED_STROKE);
      const verts = hexVertices(x, y);
      this.highlightGfx.beginPath(); this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath(); this.highlightGfx.strokePath();
    }
  }

  // ── Buildings ─────────────────────────────────────────────────────────────
  _redrawBuildings() {
    this.buildingGfx.clear();
    for (const b of this.gameState.buildings) {
      if (b.type === 'ROAD') continue;
      const { x, y } = hexToWorld(b.q, b.r);
      const color = b.owner ? PLAYER_COLORS[b.owner] : 0x888888;
      const s = HEX_SIZE * 0.3;

      if (b.type === 'HQ') {
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - s - 2, y - s * 0.6 - 2, s * 2 + 4, s * 1.6 + 4);
        this.buildingGfx.fillStyle(color);
        this.buildingGfx.fillRect(x - s, y - s * 0.6, s * 2, s * 1.4);
        this.buildingGfx.fillTriangle(x - s - 2, y - s * 0.6, x + s + 2, y - s * 0.6, x, y - s * 1.8);
        this.buildingGfx.lineStyle(2, 0xffffff, 0.9);
        this.buildingGfx.strokeRect(x - s, y - s * 0.6, s * 2, s * 1.4);

      } else if (b.type === 'MINE') {
        this.buildingGfx.fillStyle(0x000000); this.buildingGfx.fillCircle(x, y, s + 3);
        this.buildingGfx.fillStyle(color);    this.buildingGfx.fillCircle(x, y, s);
        this.buildingGfx.fillStyle(0x000000, 0.7);
        this.buildingGfx.fillRect(x - s*0.2, y - s*0.8, s*0.4, s*1.6);
        this.buildingGfx.fillRect(x - s*0.8, y - s*0.2, s*1.6, s*0.4);

      } else if (b.type === 'OIL_PUMP') {
        // Oil pump: dark hexagon with drop shape
        this.buildingGfx.fillStyle(0x111122); this.buildingGfx.fillCircle(x, y, s + 3);
        this.buildingGfx.fillStyle(0x4466cc); this.buildingGfx.fillCircle(x, y, s);
        // owner color border
        this.buildingGfx.lineStyle(3, color, 1);
        this.buildingGfx.strokeCircle(x, y, s);
        // Oil drop shape
        this.buildingGfx.fillStyle(0x000000, 0.7);
        this.buildingGfx.fillTriangle(x, y - s*0.8, x - s*0.4, y + s*0.3, x + s*0.4, y + s*0.3);
        this.buildingGfx.fillCircle(x, y + s*0.3, s*0.4);

      } else if (b.type === 'VEHICLE_DEPOT') {
        // Vehicle Depot: wide low building (factory shape)
        const bw = s * 2.2, bh = s * 1.0;
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - bw/2 - 2, y - bh/2 - 2, bw + 4, bh + 4);
        this.buildingGfx.fillStyle(0x334455);
        this.buildingGfx.fillRect(x - bw/2, y - bh/2, bw, bh);
        // Smokestacks
        this.buildingGfx.fillStyle(color);
        this.buildingGfx.fillRect(x - bw*0.3, y - bh/2 - s*0.7, s*0.35, s*0.75);
        this.buildingGfx.fillRect(x + bw*0.1, y - bh/2 - s*0.5, s*0.35, s*0.55);
        this.buildingGfx.lineStyle(1.5, 0xffffff, 0.6);
        this.buildingGfx.strokeRect(x - bw/2, y - bh/2, bw, bh);

      } else if (b.type === 'BUNKER') {
        // Bunker: grey hexagonal low dome
        const verts = hexVertices(x, y).map(v => ({ x: x + (v.x-x)*0.55, y: y + (v.y-y)*0.55 }));
        this.buildingGfx.fillStyle(0x555544);
        this.buildingGfx.beginPath(); this.buildingGfx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) this.buildingGfx.lineTo(verts[i].x, verts[i].y);
        this.buildingGfx.closePath(); this.buildingGfx.fillPath();
        this.buildingGfx.lineStyle(2, color, 0.8);
        this.buildingGfx.beginPath(); this.buildingGfx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) this.buildingGfx.lineTo(verts[i].x, verts[i].y);
        this.buildingGfx.closePath(); this.buildingGfx.strokePath();

      } else if (b.type === 'OBS_POST') {
        // Observation Post: tall thin tower
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - s*0.18, y - s*1.4, s*0.36, s*1.6);
        this.buildingGfx.fillStyle(color);
        this.buildingGfx.fillRect(x - s*0.15, y - s*1.35, s*0.3, s*1.5);
        // Platform on top
        this.buildingGfx.fillStyle(0x88aacc);
        this.buildingGfx.fillRect(x - s*0.45, y - s*1.5, s*0.9, s*0.25);
        this.buildingGfx.lineStyle(1, 0xffffff, 0.7);
        this.buildingGfx.strokeRect(x - s*0.45, y - s*1.5, s*0.9, s*0.25);

      } else if (b.type === 'BARRACKS') {
        // Barracks: brown rectangle with crenellations
        const bw = s * 1.8, bh = s * 1.2;
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - bw/2 - 2, y - bh/2 - 2, bw + 4, bh + 4);
        this.buildingGfx.fillStyle(0x884422);
        this.buildingGfx.fillRect(x - bw/2, y - bh/2, bw, bh);
        // Crenellations (3 teeth)
        this.buildingGfx.fillStyle(color);
        const tw = bw / 5;
        for (let i = 0; i < 3; i++) {
          this.buildingGfx.fillRect(x - bw/2 + tw * (i*2), y - bh/2 - s*0.4, tw, s*0.45);
        }
        this.buildingGfx.lineStyle(1.5, 0xffffff, 0.7);
        this.buildingGfx.strokeRect(x - bw/2, y - bh/2, bw, bh);
      }
    }
  }

  // ── Units ─────────────────────────────────────────────────────────────────
  _redrawUnits() {
    this.unitGfx.clear();
    const gs  = this.gameState;
    const fog = this._currentFog;

    for (const unit of gs.units) {
      // Hide enemy units in fog
      const key = `${unit.q},${unit.r}`;
      if (unit.owner !== gs.currentPlayer && fog && !fog.has(key)) continue;

      const { x, y } = hexToWorld(unit.q, unit.r);
      const color = PLAYER_COLORS[unit.owner];
      const dim   = (unit.owner !== gs.currentPlayer);
      const alpha = dim ? 0.6 : 1.0;
      const def   = UNIT_TYPES[unit.type];
      const r     = HEX_SIZE * 0.36;

      // Dug-in ring
      if (unit.dugIn) {
        this.unitGfx.lineStyle(3, 0x8B5A2B, alpha);
        this.unitGfx.strokeCircle(x, y, r + 5);
      }
      // Incoming attack warning
      if (Object.values(gs.pendingAttacks).includes(unit.id)) {
        this.unitGfx.lineStyle(3, 0xff2222, 0.85);
        this.unitGfx.strokeCircle(x, y, r + 9);
      }

      this.unitGfx.fillStyle(color, alpha);
      this.unitGfx.lineStyle(2, 0x000000, alpha);

      if (def.shape === 'circle') {
        this.unitGfx.fillCircle(x, y, r); this.unitGfx.strokeCircle(x, y, r);
      } else if (def.shape === 'square') {
        this.unitGfx.fillRect(x-r, y-r*0.7, r*2, r*1.4); this.unitGfx.strokeRect(x-r, y-r*0.7, r*2, r*1.4);
      } else if (def.shape === 'triangle') {
        const th = r * 1.2;
        this.unitGfx.fillTriangle(x, y-th, x-r, y+th*0.5, x+r, y+th*0.5);
        this.unitGfx.strokeTriangle(x, y-th, x-r, y+th*0.5, x+r, y+th*0.5);
      } else if (def.shape === 'diamond') {
        this.unitGfx.fillTriangle(x, y-r, x-r*0.7, y, x+r*0.7, y);
        this.unitGfx.fillTriangle(x, y+r, x-r*0.7, y, x+r*0.7, y);
        this.unitGfx.lineStyle(2, 0x000000, alpha);
        this.unitGfx.strokeTriangle(x, y-r, x-r*0.7, y, x+r*0.7, y);
        this.unitGfx.strokeTriangle(x, y+r, x-r*0.7, y, x+r*0.7, y);
      } else if (def.shape === 'star') {
        // Recon: 4-point star
        this.unitGfx.fillTriangle(x, y-r, x-r*0.35, y, x+r*0.35, y);
        this.unitGfx.fillTriangle(x, y+r, x-r*0.35, y, x+r*0.35, y);
        this.unitGfx.fillTriangle(x-r, y, x, y-r*0.35, x, y+r*0.35);
        this.unitGfx.fillTriangle(x+r, y, x, y-r*0.35, x, y+r*0.35);
      } else if (def.shape === 'arrow') {
        // Anti-Tank: rightward arrow / wedge
        this.unitGfx.fillTriangle(x+r, y, x-r*0.5, y-r*0.7, x-r*0.5, y+r*0.7);
        this.unitGfx.lineStyle(2, 0x000000, alpha);
        this.unitGfx.strokeTriangle(x+r, y, x-r*0.5, y-r*0.7, x-r*0.5, y+r*0.7);
      } else if (def.shape === 'cross') {
        // Medic: red cross
        this.unitGfx.fillStyle(0xffffff, alpha);
        this.unitGfx.fillCircle(x, y, r);
        this.unitGfx.fillStyle(0xdd2222, alpha);
        this.unitGfx.fillRect(x-r*0.2, y-r*0.7, r*0.4, r*1.4);
        this.unitGfx.fillRect(x-r*0.7, y-r*0.2, r*1.4, r*0.4);
        this.unitGfx.lineStyle(2, 0x000000, alpha);
        this.unitGfx.strokeCircle(x, y, r);
      }

      // Health bar
      const barW = HEX_SIZE * 0.85, barH = 5;
      const bx = x - barW/2, by = y + r + 5;
      const pct = unit.health / unit.maxHealth;
      const barColor = pct > 0.6 ? 0x44ff44 : pct > 0.3 ? 0xffcc00 : 0xff3333;
      this.unitGfx.fillStyle(0x222222, alpha); this.unitGfx.fillRect(bx, by, barW, barH);
      this.unitGfx.fillStyle(barColor, alpha); this.unitGfx.fillRect(bx, by, barW * pct, barH);
      this.unitGfx.lineStyle(1, 0x000000, alpha*0.5); this.unitGfx.strokeRect(bx, by, barW, barH);
    }
  }

  // ── Fog of war ────────────────────────────────────────────────────────────
  _redrawFog() {
    this.fogGfx.clear();
    const fog = computeFog(this.gameState, this.gameState.currentPlayer, MAP_SIZE);
    this._currentFog = fog;

    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        if (fog.has(`${q},${r}`)) continue;
        const { x, y } = hexToWorld(q, r);
        const verts = hexVertices(x, y);
        this.fogGfx.fillStyle(0x000000, 0.62);
        this.fogGfx.beginPath(); this.fogGfx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) this.fogGfx.lineTo(verts[i].x, verts[i].y);
        this.fogGfx.closePath(); this.fogGfx.fillPath();
      }
    }
  }

  // ── Top bar ───────────────────────────────────────────────────────────────
  _createTopBar() {
    const w = this.scale.width;
    const D = 100;

    // Background
    this.topBarBg = this.add.rectangle(w/2, 22, w, 44, 0x111111, 0.92)
      .setScrollFactor(0).setDepth(D);

    // Resource cells
    this.resIron = this._makeLabel(12, 11, '⚙ Iron: —', D);
    this.resOil  = this._makeLabel(160, 11, '🛢 Oil: —', D);
    this.turnLbl = this._makeLabel(w/2, 11, 'Turn 1 | Player 1 | PLANNING', D, true);

    // Settings gear button
    this.btnSettings = this._makeBtn(w - 160, 11, '⚙ Settings', 0x333355, () => this._toggleSettings(), D, 'right');

    // Submit button (always visible in top-right)
    this.btnSubmit = this._makeBtn(w - 10, 11, 'SUBMIT TURN', 0x226622, () => this._onSubmit(), D, 'right');
  }

  _makeLabel(x, y, text, depth, center = false) {
    return this.add.text(x, y, text, {
      font: '13px monospace', fill: '#dddddd',
      backgroundColor: '#222222cc', padding: { x: 6, y: 4 }
    }).setOrigin(center ? 0.5 : 0, 0).setScrollFactor(0).setDepth(depth);
  }

  _makeBtn(x, y, label, color, cb, depth = 100, origin = 'left') {
    const ox = origin === 'right' ? 1 : 0;
    const btn = this.add.text(x, y, label, {
      font: 'bold 13px monospace', fill: '#ffffff',
      backgroundColor: `#${color.toString(16).padStart(6,'0')}`,
      padding: { x: 10, y: 6 }
    }).setOrigin(ox, 0).setScrollFactor(0).setDepth(depth).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', cb);
    btn.on('pointerover', () => btn.setAlpha(0.8));
    btn.on('pointerout',  () => btn.setAlpha(1.0));
    return btn;
  }

  _updateTopBar() {
    const gs  = this.gameState;
    const p   = gs.currentPlayer;
    const pl  = gs.players[p];
    const inc = calcIncome(gs, p);
    const myOrders = gs.pendingRecruits.filter(r => r.owner === p);
    const modeStr = this.mode === 'move' ? 'MOVING' : this.mode === 'attack' ? 'ATTACKING' : 'PLANNING';
    const queueStr = myOrders.length
      ? '  |  ' + myOrders.map(r => {
          const name = r.designId !== undefined
            ? (gs.designs[p].find(d => d.id === r.designId)?.name || 'Unit')
            : UNIT_TYPES[r.type]?.name || '?';
          return `⚙${name}(${r.turnsLeft}t)`;
        }).join(' ')
      : '';

    this.resIron.setText(`⚙ ${pl.iron}  (+${inc.iron}/turn)`);
    this.resOil.setText(`🛢 ${pl.oil}  (+${inc.oil}/turn)`);
    this.turnLbl.setText(`Turn ${gs.turn}  |  P${p}  |  ${modeStr}${queueStr}`);
  }

  // ── Bottom panel ──────────────────────────────────────────────────────────
  _createBottomPanel() {
    const w = this.scale.width, h = this.scale.height;
    const panH = 120, D = 100;

    // Left: unit info panel
    this.unitPanel = this.add.rectangle(200, h - panH/2, 390, panH, 0x111111, 0.92)
      .setStrokeStyle(1, 0x444444).setScrollFactor(0).setDepth(D);
    this.unitNameTxt = this._makeLabel(14, h - panH + 8, '', D);
    this.unitStatsTxt = this._makeLabel(14, h - panH + 30, '', D);
    this.unitStatusTxt = this._makeLabel(14, h - panH + 70, '', D);

    // Right: action buttons (3×2 grid)
    const ax = w - 390, ay = h - panH + 8;
    this.actionBg = this.add.rectangle(w - 200, h - panH/2, 390, panH, 0x111111, 0.92)
      .setStrokeStyle(1, 0x444444).setScrollFactor(0).setDepth(D);

    const bw = 118, bh = 42, gap = 4;
    this.actBtns = {
      move:    this._makeActionBtn(ax,           ay,        'MOVE',      0x1a5c8a, () => this._onMoveMode()),
      attack:  this._makeActionBtn(ax+bw+gap,    ay,        'ATTACK',    0x882222, () => this._onAttackMode()),
      cancel:  this._makeActionBtn(ax+2*(bw+gap),ay,        'CANCEL',    0x444444, () => this._onCancel()),
      digin:   this._makeActionBtn(ax,           ay+bh+gap, 'DIG IN',    0x8B5A2B, () => this._onDigIn()),
      build:   this._makeActionBtn(ax+bw+gap,    ay+bh+gap, 'BUILD ▼',   0x557755, () => this._toggleBuildMenu()),
      more:    this._makeActionBtn(ax+2*(bw+gap),ay+bh+gap, 'MORE',      0x333333, () => {}),
    };

    this._contextMenuUnit = null;
  }

  _makeActionBtn(x, y, label, color, cb) {
    const w = 118, h = 42;
    const btn = this.add.text(x, y, label, {
      font: 'bold 13px monospace', fill: '#ffffff',
      backgroundColor: `#${color.toString(16).padStart(6,'0')}`,
      padding: { x: 0, y: 0 }, fixedWidth: w, fixedHeight: h, align: 'center'
    }).setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', cb);
    btn.on('pointerover', () => btn.setAlpha(0.8));
    btn.on('pointerout',  () => btn.setAlpha(1.0));
    return btn;
  }

  _updateBottomPanel() {
    const gs  = this.gameState;
    const u   = this.selectedUnit;
    const canAct = u && u.owner === gs.currentPlayer;

    // Unit info
    if (u) {
      const def = UNIT_TYPES[u.type];
      this.unitNameTxt.setText(`[ ${def.name} ]  P${u.owner}`);
      this.unitStatsTxt.setText(`HP: ${u.health}/${u.maxHealth}  ATK: ${def.attack}  MOV: ${def.move}  RNG: ${def.range}  SIGHT: ${def.sight}`);
      const pa = gs.pendingAttacks[u.id];
      let status = '';
      status += u.suppressed ? '⚡ SUPPRESSED  ' : u.moved ? '✓ Moved  ' : '○ Can move  ';
      status += pa         ? '⚔ Attack queued  ' : u.attacked ? '✓ Attacked  ' : u.suppressed ? '' : '○ Can attack  ';
      if (u.dugIn) status += '🪖 Dug in';
      this.unitStatusTxt.setText(status);
    } else if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r)) {
      const key  = `${this.hoveredHex.q},${this.hoveredHex.r}`;
      const t    = ['Plains','Forest','Mountain'][this.terrain[key]];
      const res  = gs.resourceHexes[key];
      const bu   = buildingAt(gs, this.hoveredHex.q, this.hoveredHex.r);
      const hu   = unitAt(gs, this.hoveredHex.q, this.hoveredHex.r);
      this.unitNameTxt.setText(`(${this.hoveredHex.q}, ${this.hoveredHex.r})  ${t}${res ? `  [${RESOURCE_TYPES[res.type].name}]` : ''}`);
      this.unitStatsTxt.setText(bu ? `Building: ${BUILDING_TYPES[bu.type].name}  (P${bu.owner})` : '');
      this.unitStatusTxt.setText(hu ? `Unit: P${hu.owner} ${UNIT_TYPES[hu.type].name}  HP: ${hu.health}/${hu.maxHealth}` : '');
    } else {
      this.unitNameTxt.setText('No unit selected');
      this.unitStatsTxt.setText('');
      this.unitStatusTxt.setText('Click a unit to select it');
    }

    // Action buttons visibility
    const isEngineer = canAct && UNIT_TYPES[u.type].canBuild;
    const p = gs.currentPlayer;

    this.actBtns.move.setVisible(canAct && !u.moved && !u.suppressed);
    this.actBtns.attack.setVisible(canAct && !u.attacked && !u.suppressed && this.mode !== 'attack');
    this.actBtns.cancel.setVisible(!!u || this.mode !== 'select');
    this.actBtns.digin.setVisible(canAct && UNIT_TYPES[u.type].canDigIn && !u.dugIn && !u.moved);
    this.actBtns.build.setVisible(isEngineer);
    this.actBtns.more.setVisible(false);

    // Highlight active mode button
    this.actBtns.move.setAlpha(this.mode === 'move' ? 1.0 : 0.75);
    this.actBtns.attack.setAlpha(this.mode === 'attack' ? 1.0 : 0.75);

    }

  // Build options are now served through _showContextMenu(unit, 'build', page)
  _hideBuildMenu() { /* legacy no-op — build menu is now part of context menu */ }
  _toggleBuildMenu() { if (this.selectedUnit) this._showContextMenu(this.selectedUnit, 'build', 0); }

  // ── Recruitment panel ─────────────────────────────────────────────────────
  _createRecruitPanel() {
    // Panel uses plain screen-space objects (no Container — avoids input issues)
    this.recruitPanel = { visible: false, objects: [] };
  }

  _showRecruitPanel(building) {
    this._hideRecruitPanel();
    this.recruitBuilding = building;
    const gs = this.gameState;
    const available = BUILDING_TYPES[building.type].canRecruit;
    const p  = gs.currentPlayer;
    const w  = this.scale.width, h = this.scale.height;
    const panelW = 440, panelH = 80 + available.length * 48 + 60;
    const px = w / 2 - panelW / 2, py = h / 2 - panelH / 2;
    const objs = [];

    const bg = this.add.rectangle(w/2, h/2, panelW, panelH, 0x111111, 0.96)
      .setStrokeStyle(2, 0x888888).setScrollFactor(0).setDepth(200);
    objs.push(bg);

    const title = this.add.text(w/2, py + 20, `RECRUIT — ${BUILDING_TYPES[building.type].name}`, {
      font: 'bold 15px monospace', fill: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    objs.push(title);

    // Show current pending order for this building (1-per-building limit)
    const existingOrder = gs.pendingRecruits.find(r => r.buildingId === building.id && r.owner === p);
    if (existingOrder) {
      const orderName = existingOrder.designId !== undefined
        ? (gs.designs[p].find(d => d.id === existingOrder.designId)?.name || 'Custom Unit')
        : UNIT_TYPES[existingOrder.type]?.name || '?';
      const turnsStr = existingOrder.turnsLeft > 0 ? ` — ${existingOrder.turnsLeft} turn${existingOrder.turnsLeft !== 1 ? 's' : ''} left` : ' — ready next turn';
      const orderTxt = this.add.text(w/2, py + 48, `⏳ ${orderName}${turnsStr}`, {
        font: 'bold 12px monospace', fill: '#ffdd44', backgroundColor: '#333300', padding: { x: 10, y: 5 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
      objs.push(orderTxt);
      const cancelBtn = this.add.text(w/2 + 130, py + 48, '✕ cancel', {
        font: '11px monospace', fill: '#ff8888', backgroundColor: '#330000', padding: { x: 8, y: 5 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true });
      cancelBtn.on('pointerdown', () => {
        // Refund cost
        const refundType = existingOrder.type;
        const refundDesign = existingOrder.designId !== undefined ? gs.designs[p].find(d => d.id === existingOrder.designId) : null;
        const cost = refundDesign ? refundDesign.trainCost : (refundType ? UNIT_TYPES[refundType].cost : { iron: 0, oil: 0 });
        gs.players[p].iron += cost.iron;
        gs.players[p].oil  += cost.oil;
        gs.pendingRecruits = gs.pendingRecruits.filter(r => !(r.buildingId === building.id && r.owner === p));
        this._hideRecruitPanel();
        this._showRecruitPanel(building);
        this._refresh();
      });
      cancelBtn.on('pointerover', () => cancelBtn.setAlpha(0.8));
      cancelBtn.on('pointerout',  () => cancelBtn.setAlpha(1.0));
      objs.push(cancelBtn);
    }

    available.forEach((unitType, i) => {
      const def = UNIT_TYPES[unitType];
      const alreadyOrdered = !!existingOrder;
      const canAfford = !alreadyOrdered && gs.players[p].iron >= def.cost.iron && gs.players[p].oil >= def.cost.oil;
      const label = `${def.name}  ⚙${def.cost.iron}${def.cost.oil > 0 ? ` 🛢${def.cost.oil}` : ''}  HP:${def.health} ATK:${def.attack} MOV:${def.move}`;
      const btn = this.add.text(w/2, py + 60 + (existingOrder ? 36 : 0) + i * 48, label, {
        font: '13px monospace', fill: canAfford ? '#ccffcc' : alreadyOrdered ? '#666666' : '#ff6666',
        backgroundColor: canAfford ? '#224422' : '#222222',
        padding: { x: 12, y: 8 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
        .setInteractive({ useHandCursor: canAfford });

      if (canAfford) {
        btn.on('pointerdown', () => {
          queueRecruit(gs, p, unitType, building.id);
          this._pushLog(`P${p} queued ${def.name}`);
          this._hideRecruitPanel();
          this._refresh();
        });
        btn.on('pointerover', () => btn.setAlpha(0.8));
        btn.on('pointerout',  () => btn.setAlpha(1.0));
      }
      objs.push(btn);
    });

    // Custom designs trained from this building
    const btype = building.type;
    const customDesigns = (gs.designs[p] || []).filter(d => CHASSIS_BUILDINGS[d.chassis] === btype);
    customDesigns.forEach((design, i) => {
      const idx = available.length + i;
      const canAfford = !existingOrder && gs.players[p].iron >= design.trainCost.iron && gs.players[p].oil >= design.trainCost.oil;
      const label = `★ ${design.name}  ⚙${design.trainCost.iron}${design.trainCost.oil > 0 ? ` 🛢${design.trainCost.oil}` : ''}  HP:${design.stats.health} ATK:${design.stats.soft_attack}/${design.stats.hard_attack} MOV:${design.stats.move}`;
      const btn = this.add.text(w/2, py + 60 + (existingOrder ? 36 : 0) + idx * 48, label, {
        font: '12px monospace', fill: canAfford ? '#ffffaa' : '#666655',
        backgroundColor: canAfford ? '#333311' : '#222211',
        padding: { x: 12, y: 8 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
        .setInteractive({ useHandCursor: canAfford });
      if (canAfford) {
        btn.on('pointerdown', () => {
          queueRecruit(gs, p, design.id, building.id);
          this._pushLog(`P${p} queued ${design.name}`);
          this._hideRecruitPanel();
          this._refresh();
        });
        btn.on('pointerover', () => btn.setAlpha(0.8));
        btn.on('pointerout',  () => btn.setAlpha(1.0));
      }
      objs.push(btn);
    });

    // "Design new unit" button
    const totalRows = available.length + customDesigns.length;
    const queueOffset = existingOrder ? 36 : 0;
    const designBtn = this.add.text(w/2, py + 60 + queueOffset + totalRows * 48 + 8, '[ + DESIGN NEW UNIT ]', {
      font: 'bold 12px monospace', fill: '#88ccff',
      backgroundColor: '#112233', padding: { x: 12, y: 7 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true });
    designBtn.on('pointerdown', () => {
      this._hideRecruitPanel();
      this._showDesignPanel(building);
    });
    designBtn.on('pointerover', () => designBtn.setAlpha(0.8));
    designBtn.on('pointerout',  () => designBtn.setAlpha(1.0));
    objs.push(designBtn);

    const closeBtnY = py + 60 + queueOffset + totalRows * 48 + 50;
    const closeBtn = this.add.text(w/2, closeBtnY, '[ CLOSE ]', {
      font: 'bold 13px monospace', fill: '#ffffff',
      backgroundColor: '#444444', padding: { x: 14, y: 7 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this._hideRecruitPanel());
    closeBtn.on('pointerover', () => closeBtn.setAlpha(0.8));
    closeBtn.on('pointerout',  () => closeBtn.setAlpha(1.0));
    objs.push(closeBtn);

    // Resize bg to fit
    const newH = closeBtnY - py + 40;
    bg.setSize(panelW, newH).setPosition(w/2, py + newH/2);

    this._addToUI(objs);
    this.recruitPanel = { visible: true, objects: objs };
    this._updateButtons();
  }

  _hideRecruitPanel() {
    if (this.recruitPanel?.objects) {
      for (const o of this.recruitPanel.objects) o.destroy();
    }
    this.recruitPanel = { visible: false, objects: [] };
    this.recruitBuilding = null;
  }

  // ── Design Panel ──────────────────────────────────────────────────────────
  _showDesignPanel(building) {
    this._hideDesignPanel();
    const gs = this.gameState;
    const p  = gs.currentPlayer;
    const w  = this.scale.width, h = this.scale.height;

    // Which chassis can this building train?
    const validChassis = Object.entries(CHASSIS_BUILDINGS)
      .filter(([, btype]) => btype === building.type)
      .map(([chassis]) => chassis);

    let selectedChassis = validChassis[0] || null;
    let selectedModules = new Set();

    const objs = [];
    const rebuild = () => {
      for (const o of objs) o.destroy();
      objs.length = 0;
      this._renderDesignPanel(building, validChassis, selectedChassis, selectedModules, p, objs,
        (chassis) => { selectedChassis = chassis; selectedModules = new Set(); rebuild(); },
        (modKey)  => { selectedModules.has(modKey) ? selectedModules.delete(modKey) : selectedModules.add(modKey); rebuild(); },
        () => {
          // Confirm design
          const modules = [...selectedModules];
          const cost = designRegistrationCost(modules);
          if (gs.players[p].iron < cost.iron) return;
          if (gs.players[p].oil  < cost.oil)  return;
          if (gs.designs[p].length >= MAX_DESIGNS_PER_PLAYER) return;
          const result = registerDesign(gs, p, selectedChassis, modules);
          if (result.ok) {
            this._pushLog(`P${p} designed ${UNIT_TYPES[selectedChassis].name} (${modules.length} mods)`);
            this._hideDesignPanel();
            this._showRecruitPanel(building);
            this._refresh();
          }
        },
        () => { this._hideDesignPanel(); this._showRecruitPanel(building); }
      );
    };

    this._addToUI(objs);
    this.designPanelObj = { objects: objs, rebuild };
    rebuild();
  }

  _renderDesignPanel(building, validChassis, selectedChassis, selectedModules, player, objs, onChassis, onModule, onConfirm, onClose) {
    const gs = this.gameState;
    const w  = this.scale.width, h = this.scale.height;
    const panelW = 580, D = 202;
    const px = w/2 - panelW/2;

    const bg = this.add.rectangle(w/2, h/2, panelW, h - 60, 0x0a0a14, 0.97)
      .setStrokeStyle(2, 0x4488cc).setScrollFactor(0).setDepth(D);
    objs.push(bg);

    let y = 38;
    const line = (text, color = '#cccccc', bold = false, xOff = 0, align = 'center') => {
      const t = this.add.text(w/2 + xOff, y, text, {
        font: `${bold?'bold ':''}12px monospace`, fill: color, align
      }).setOrigin(align === 'left' ? 0 : 0.5, 0).setScrollFactor(0).setDepth(D+1);
      objs.push(t);
      y += 18;
    };

    line('── UNIT DESIGNER ──', '#88ccff', true);
    line(`Slots: ${gs.designs[player].length}/${MAX_DESIGNS_PER_PLAYER}  |  Iron: ${gs.players[player].iron}  Oil: ${gs.players[player].oil}`, '#888888');
    y += 4;

    // Chassis selector
    line('CHASSIS:', '#aaaaaa', true);
    const chRow = y; y += 30;
    validChassis.forEach((chassis, i) => {
      const sel = chassis === selectedChassis;
      const btn = this.add.text(px + 20 + i * 120, chRow, UNIT_TYPES[chassis].name, {
        font: 'bold 11px monospace', fill: sel ? '#000000' : '#aaaaaa',
        backgroundColor: sel ? '#88ccff' : '#222244', padding: { x: 10, y: 6 }
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => onChassis(chassis));
      objs.push(btn);
    });

    if (!selectedChassis) return;

    // Base stats of chassis
    const base = UNIT_TYPES[selectedChassis];
    line(`Base: HP${base.health} MOV${base.move} RNG${base.range} SA${base.soft_attack} HA${base.hard_attack} PRC${base.pierce} ARM${base.armor} DEF${base.defense} EVA${base.evasion} ACC${base.accuracy}`, '#6688aa');
    y += 4;

    // Module list
    line('MODULES  (click to toggle):', '#aaaaaa', true);
    const validMods = Object.entries(MODULES).filter(([, m]) => m.chassis.includes(selectedChassis));

    for (const [key, mod] of validMods) {
      const sel = selectedModules.has(key);
      const deltaStr = Object.entries(mod.statDelta).map(([k, v]) => `${k}${v>0?'+':''}${v}`).join(' ');
      const costStr  = `⚙${mod.designCost.iron}${mod.designCost.oil > 0 ? ` 🛢${mod.designCost.oil}` : ''}`;
      const trainStr = `train:⚙${mod.trainCost.iron}${mod.trainCost.oil > 0 ? ` 🛢${mod.trainCost.oil}` : ''}`;
      const label    = `${sel ? '✓' : '○'} ${mod.name.padEnd(22)}  ${deltaStr.padEnd(30)}  ${costStr}  ${trainStr}`;
      const btn = this.add.text(px + 10, y, label, {
        font: '11px monospace', fill: sel ? '#aaffaa' : '#888888',
        backgroundColor: sel ? '#112211' : '#111111', padding: { x: 8, y: 5 }
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => onModule(key));
      btn.on('pointerover', () => btn.setAlpha(0.8));
      btn.on('pointerout',  () => btn.setAlpha(1.0));
      objs.push(btn);
      y += 22;
    }

    y += 6;
    // Preview stats
    const preview = computeDesignStats(selectedChassis, [...selectedModules]);
    const cost    = designRegistrationCost([...selectedModules]);
    const canAfford = gs.players[player].iron >= cost.iron && gs.players[player].oil >= cost.oil;
    const slotsFull = gs.designs[player].length >= MAX_DESIGNS_PER_PLAYER;

    line(`Preview: HP${preview.health} MOV${preview.move} RNG${preview.range} SA${preview.soft_attack} HA${preview.hard_attack} PRC${preview.pierce} ARM${preview.armor} DEF${preview.defense}`, '#aaddff', true);
    line(`Register cost: ⚙${cost.iron}${cost.oil > 0 ? ` 🛢${cost.oil}` : ''}  ${!canAfford ? '(NOT ENOUGH)' : slotsFull ? '(SLOTS FULL)' : '(affordable)'}`, canAfford && !slotsFull ? '#88ff88' : '#ff6666');
    y += 4;

    const confirmBtn = this.add.text(w/2 - 70, y, '[ REGISTER DESIGN ]', {
      font: 'bold 12px monospace', fill: (canAfford && !slotsFull) ? '#000000' : '#555555',
      backgroundColor: (canAfford && !slotsFull) ? '#44aa44' : '#222222', padding: { x: 12, y: 8 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D+1);
    if (canAfford && !slotsFull) {
      confirmBtn.setInteractive({ useHandCursor: true });
      confirmBtn.on('pointerdown', onConfirm);
      confirmBtn.on('pointerover', () => confirmBtn.setAlpha(0.8));
      confirmBtn.on('pointerout',  () => confirmBtn.setAlpha(1.0));
    }
    objs.push(confirmBtn);

    const cancelBtn = this.add.text(w/2 + 70, y, '[ CANCEL ]', {
      font: 'bold 12px monospace', fill: '#ffffff',
      backgroundColor: '#444444', padding: { x: 12, y: 8 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
    cancelBtn.on('pointerdown', onClose);
    cancelBtn.on('pointerover', () => cancelBtn.setAlpha(0.8));
    cancelBtn.on('pointerout',  () => cancelBtn.setAlpha(1.0));
    objs.push(cancelBtn);
    this._addToUI(objs);
  }

  _hideDesignPanel() {
    if (this.designPanelObj?.objects) {
      for (const o of this.designPanelObj.objects) o.destroy();
    }
    this.designPanelObj = null;
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _setupInput() {
    const cam = this.cameras.main;

    this.input.on('pointerdown', (ptr) => {
      if (ptr.button === 0) {
        this._isDragging = false;
        this._dragStart = { x: ptr.x, y: ptr.y };
        this._dragStartScroll = { x: cam.scrollX, y: cam.scrollY };
        // Snapshot panel state at mousedown — so pointerup knows not to re-open it
        this._panelOpenAtMouseDown = !!this.recruitPanel?.visible;
      }
    });

    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 0) {
        const dx = ptr.x - this._dragStart.x, dy = ptr.y - this._dragStart.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this._isDragging = true;
        if (this._isDragging) {
          cam.setScroll(this._dragStartScroll.x - dx/cam.zoom, this._dragStartScroll.y - dy/cam.zoom);
        }
      } else {
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex   = worldToHex(world.x, world.y);
        if (isValid(hex.q, hex.r)) {
          if (!this.hoveredHex || this.hoveredHex.q !== hex.q || this.hoveredHex.r !== hex.r) {
            this.hoveredHex = hex; this._redrawHighlights(); this._updateBottomPanel();
          }
        } else if (this.hoveredHex) { this.hoveredHex = null; this._redrawHighlights(); }
      }
    });

    this.input.on('pointerup', (ptr) => {
      if (ptr.button === 0 && !this._isDragging && !this._panelOpenAtMouseDown) {
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex   = worldToHex(world.x, world.y);
        if (isValid(hex.q, hex.r)) this._onHexClick(hex.q, hex.r);
      }
      if (ptr.button === 2 && !this._isDragging) {
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex   = worldToHex(world.x, world.y);
        if (isValid(hex.q, hex.r)) this._onHexRightClick(hex.q, hex.r);
      }
      this._isDragging = false;
    });

    // Suppress browser context menu so right-click works in-game
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.input.on('wheel', (ptr, _o, _dx, dy) => {
      const factor = dy > 0 ? 0.85 : 1.18;
      const newZoom = Phaser.Math.Clamp(cam.zoom * factor, 0.2, 4.0);
      const wBefore = cam.getWorldPoint(ptr.x, ptr.y);
      cam.setZoom(newZoom);
      const wAfter = cam.getWorldPoint(ptr.x, ptr.y);
      cam.scrollX += wBefore.x - wAfter.x;
      cam.scrollY += wBefore.y - wAfter.y;
    });

    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.input.keyboard.on('keydown-ESC', () => this._toggleSettings());
  }

  // ── World → Screen coordinate conversion ─────────────────────────────────
  _worldToScreen(wx, wy) {
    const cam = this.cameras.main;
    return {
      x: (wx - cam.scrollX) * cam.zoom + cam.x,
      y: (wy - cam.scrollY) * cam.zoom + cam.y,
    };
  }

  // ── Unit action framework ─────────────────────────────────────────────────
  // Returns array of {label, key, enabled, color, cb} for the selected unit.
  // Add special abilities here when ready — just push to the array.
  _getUnitActions(unit) {
    const gs   = this.gameState;
    const def  = UNIT_TYPES[unit.type];
    const actions = [];

    if (!unit.moved && !unit.suppressed) {
      actions.push({ label: 'MOVE',   key: 'move',   enabled: true,  color: 0x1a5c8a, cb: () => this._onMoveMode() });
    }
    if (!unit.attacked && !unit.suppressed) {
      const atk = getAttackableHexes(gs, unit, unit.q, unit.r);
      actions.push({ label: 'ATTACK', key: 'attack', enabled: atk.length > 0, color: 0x882222, cb: () => this._onAttackMode() });
    }
    if (def.canDigIn && !unit.dugIn && !unit.moved) {
      actions.push({ label: 'DIG IN', key: 'digin',  enabled: true,  color: 0x8B5A2B, cb: () => this._onDigIn() });
    }
    if (def.canBuild && unit.moved) {
      actions.push({ label: 'BUILD ▸', key: 'build',  enabled: true,  color: 0x335533, cb: () => this._showContextMenu(unit, 'build', 0) });
    }
    if (def.canHeal) {
      actions.push({ label: 'HEAL',   key: 'heal',   enabled: true,  color: 0x229944, cb: () => {} }); // passive — shows status
    }
    // Hook: special abilities (future — unit.abilities array)
    // (unit.abilities || []).forEach(ab => actions.push({ label: ab.name, key: ab.key, enabled: ab.canUse(gs, unit), color: 0x664488, cb: () => ab.use(gs, unit) }));
    actions.push({ label: 'WAIT',   key: 'wait',   enabled: true,  color: 0x444444, cb: () => this._clearSelection() });

    return actions;
  }

  // ── Unified context menu (root actions + submenus with pagination) ─────────
  // submenu: 'root' | 'build'   page: 0-based page index within that submenu
  _showContextMenu(unit, submenu = 'root', page = 0) {
    this._hideContextMenu();
    if (!this.settings.showContextMenu) return;

    const wp = hexToWorld(unit.q, unit.r);
    const { x: sx, y: sy } = this._worldToScreen(wp.x, wp.y);
    const sw = this.scale.width, sh = this.scale.height;

    const PAGE_SIZE = 6;
    const btnH = 30, btnW = 180, gap = 3;
    const DEPTH = 150;
    const objs  = [];

    // ── Build list of items to show ──────────────────────────────────────────
    let title = null;
    let items = []; // { label, color, enabled, cb }

    if (submenu === 'root') {
      const actions = this._getUnitActions(unit);
      items = actions.map(a => ({
        label:   a.label,
        color:   a.color,
        enabled: a.enabled,
        cb:      a.cb,
      }));
    } else if (submenu === 'build') {
      title = '▸ BUILD';
      const gs = this.gameState, p = gs.currentPlayer;
      const noBuilding = !buildingAt(gs, unit.q, unit.r);
      const res = gs.resourceHexes[`${unit.q},${unit.r}`];
      const iron = gs.players[p].iron, oil = gs.players[p].oil;

      // All possible build options — add more here as the game grows
      const allOpts = [];
      if (!roadAt(gs, unit.q, unit.r))
        allOpts.push({ label: `Road        1⚙`,  cost: { iron:1,oil:0 }, enabled: iron>=1,  cb: () => this._onBuildRoad() });
      if (res && noBuilding)
        allOpts.push({ label: `${res.type==='OIL'?'Oil Pump   4⚙ 2🛢':'Mine        4⚙'}`,
                       cost: { iron:4,oil: res.type==='OIL'?2:0 }, enabled: res.type==='OIL'?(iron>=4&&oil>=2):iron>=4,
                       cb: () => this._onBuildMine(res.type) });
      if (noBuilding)
        allOpts.push({ label: `Barracks    6⚙`,  cost:{iron:6,oil:0},  enabled: iron>=6,  cb: () => this._onBuildStructure('BARRACKS',6) });
      if (noBuilding)
        allOpts.push({ label: `Bunker      5⚙`,  cost:{iron:5,oil:0},  enabled: iron>=5,  cb: () => this._onBuildStructure('BUNKER',5) });
      if (noBuilding)
        allOpts.push({ label: `Vehicle Depot 8⚙ 2🛢`, cost:{iron:8,oil:2}, enabled: iron>=8&&oil>=2, cb: () => this._onBuildStructure('VEHICLE_DEPOT',8) });
      if (noBuilding)
        allOpts.push({ label: `Obs. Post   3⚙`,  cost:{iron:3,oil:0},  enabled: iron>=3,  cb: () => this._onBuildStructure('OBS_POST',3) });
      // Future entries just go here — pagination handles overflow automatically

      const totalPages = Math.max(1, Math.ceil(allOpts.length / PAGE_SIZE));
      page = Phaser.Math.Clamp(page, 0, totalPages - 1);
      const slice = allOpts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

      items = slice.map(o => ({
        label:   o.enabled ? o.label : `${o.label}  ✗`,
        color:   o.enabled ? 0x2a5533 : 0x222222,
        enabled: o.enabled,
        cb:      o.cb,
      }));

      // Pagination row (prev / page indicator / next) appended as items
      if (totalPages > 1) {
        items.push({
          label:   `${page > 0 ? '◀ ' : '  '}  ${page+1}/${totalPages}  ${page < totalPages-1 ? ' ▶' : '  '}`,
          color:   0x333355, enabled: true,
          cb: () => {
            // Toggle between pages; wrap around
            const next = (page + 1) % totalPages;
            this._showContextMenu(unit, 'build', next);
          }
        });
      }

      // Back button at bottom
      items.push({ label: '← BACK', color: 0x443322, enabled: true, cb: () => this._showContextMenu(unit, 'root', 0) });
    }

    // ── Position menu near unit, clamped to screen ───────────────────────────
    const rowCount = items.length + (title ? 1 : 0);
    let px = sx + 40;
    let py = sy - (rowCount * (btnH + gap)) / 2;
    if (px + btnW > sw - 10) px = sx - btnW - 14;
    if (py < 50) py = 50;
    if (py + rowCount * (btnH + gap) > sh - 130) py = sh - 130 - rowCount * (btnH + gap);

    // ── Title row ────────────────────────────────────────────────────────────
    let rowY = py;
    if (title) {
      const hdr = this.add.text(px, rowY, title, {
        font: 'bold 10px monospace', fill: '#aaffaa',
        backgroundColor: '#112211', padding: { x: 8, y: 5 },
        fixedWidth: btnW, align: 'left'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH);
      objs.push(hdr);
      rowY += btnH + gap;
    }

    // ── Item rows ────────────────────────────────────────────────────────────
    items.forEach(item => {
      const col = `#${item.color.toString(16).padStart(6,'0')}`;
      const btn = this.add.text(px, rowY, item.label, {
        font: `bold 11px monospace`, fill: item.enabled ? '#ffffff' : '#555555',
        backgroundColor: col, padding: { x: 8, y: 5 },
        fixedWidth: btnW, align: 'left'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH)
        .setInteractive({ useHandCursor: item.enabled });
      if (item.enabled) {
        btn.on('pointerdown', () => { this._hideContextMenu(); item.cb(); });
        btn.on('pointerover', () => btn.setAlpha(0.85));
        btn.on('pointerout',  () => btn.setAlpha(1.0));
      }
      objs.push(btn);
      rowY += btnH + gap;
    });

    this._addToUI(objs);
    this._contextMenuObjs = objs;
    this._contextMenuUnit = unit; // remember for rebuild
  }

  _hideContextMenu() {
    if (this._contextMenuObjs) {
      for (const o of this._contextMenuObjs) o.destroy();
      this._contextMenuObjs = null;
      this._contextMenuUnit = null;
    }
  }

  // ── Settings panel ────────────────────────────────────────────────────────
  _toggleSettings() {
    if (this._settingsOpen) { this._closeSettings(); }
    else { this._openSettings(); }
  }

  _openSettings() {
    this._closeSettings();
    this._settingsOpen = true;
    const w = this.scale.width, h = this.scale.height;
    const panelW = 340, D = 210;
    const objs = [];

    const bg = this.add.rectangle(w/2, h/2, panelW, 280, 0x111122, 0.97)
      .setStrokeStyle(2, 0x4466aa).setScrollFactor(0).setDepth(D);
    objs.push(bg);
    objs.push(this.add.text(w/2, h/2 - 120, '── SETTINGS ──', { font: 'bold 15px monospace', fill: '#88ccff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(D+1));

    const toggles = [
      { key: 'engineerAutoBuild', label: 'Engineer auto-build menu' },
      { key: 'autoAttackMode',    label: 'Auto-enter attack after move' },
      { key: 'showContextMenu',   label: 'Show unit context menu' },
    ];

    toggles.forEach((t, i) => {
      const ty = h/2 - 75 + i * 48;
      const makeRow = () => {
        if (this[`_settingRow_${t.key}`]) { for (const o of this[`_settingRow_${t.key}`]) o.destroy(); }
        const rowObjs = [];
        const lbl = this.add.text(w/2 - 140, ty, t.label, { font: '12px monospace', fill: '#cccccc' })
          .setOrigin(0, 0.5).setScrollFactor(0).setDepth(D+1);
        const val = this.settings[t.key];
        const tog = this.add.text(w/2 + 70, ty, val ? '[ ON ]' : '[ OFF ]', {
          font: 'bold 12px monospace', fill: val ? '#88ff88' : '#ff8888',
          backgroundColor: val ? '#224422' : '#442222', padding: { x: 8, y: 5 }
        }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
        tog.on('pointerdown', () => {
          this.settings[t.key] = !this.settings[t.key];
          makeRow();
        });
        tog.on('pointerover', () => tog.setAlpha(0.8));
        tog.on('pointerout',  () => tog.setAlpha(1.0));
        rowObjs.push(lbl, tog);
        this._addToUI(rowObjs);
        this[`_settingRow_${t.key}`] = rowObjs;
        // Replace in master objs list
        objs.push(...rowObjs);
      };
      makeRow();
    });

    const closeBtn = this.add.text(w/2, h/2 + 105, '[ CLOSE ]', {
      font: 'bold 13px monospace', fill: '#ffffff', backgroundColor: '#444444', padding: { x: 14, y: 7 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this._closeSettings());
    closeBtn.on('pointerover', () => closeBtn.setAlpha(0.8));
    closeBtn.on('pointerout',  () => closeBtn.setAlpha(1.0));
    objs.push(closeBtn);

    this._addToUI(objs);
    this._settingsObjs = objs;
  }

  _closeSettings() {
    if (this._settingsObjs) {
      for (const o of this._settingsObjs) { if (!o.destroyed) o.destroy(); }
      this._settingsObjs = null;
    }
    this._settingsOpen = false;
  }

  update() {
    const cam = this.cameras.main;
    const speed = 6 / cam.zoom;
    const wasdMoving = this.wasd.W.isDown || this.wasd.S.isDown || this.wasd.A.isDown || this.wasd.D.isDown;
    if (this.wasd.W.isDown) cam.scrollY -= speed;
    if (this.wasd.S.isDown) cam.scrollY += speed;
    if (this.wasd.A.isDown) cam.scrollX -= speed;
    if (this.wasd.D.isDown) cam.scrollX += speed;
    // Context menu is right-click only; close it if panning away
    if (wasdMoving && this._contextMenuObjs) this._hideContextMenu();
  }

  // ── Click handling ────────────────────────────────────────────────────────
  _onHexClick(q, r) {
    const gs = this.gameState;
    const clickedUnit     = unitAt(gs, q, r);
    const clickedBuilding = buildingAt(gs, q, r);

    if (this.mode === 'move') {
      const isReachable = this.reachable.some(h => h.q === q && h.r === r);
      if (isReachable && !clickedUnit) {
        gs.pendingMoves[this.selectedUnit.id] = { q, r };
        this.selectedUnit.q = q; this.selectedUnit.r = r; this.selectedUnit.moved = true;
        // Keep unit selected after move — show remaining actions
        this.reachable = [];
        if (!this.selectedUnit.attacked) {
          const atk = getAttackableHexes(gs, this.selectedUnit, q, r);
          if (atk.length > 0) {
            this.attackable = atk; this.mode = 'attack';
          } else {
            this.attackable = []; this.mode = 'select';
          }
        } else {
          this.attackable = []; this.mode = 'select';
        }
        // Engineers: auto-open build menu after moving (if setting enabled)
        this._refresh();
        // Engineer auto-build: pop open the build submenu after moving
        if (UNIT_TYPES[this.selectedUnit.type].canBuild && this.settings.engineerAutoBuild) {
          this._showContextMenu(this.selectedUnit, 'build', 0);
        }
        return;
      }
      // In move mode: clicking an enemy that's in attack range = auto-attack
      if (clickedUnit && clickedUnit.owner !== gs.currentPlayer && !this.selectedUnit.attacked) {
        const atk = getAttackableHexes(gs, this.selectedUnit, this.selectedUnit.q, this.selectedUnit.r);
        const target = atk.find(a => a.q === q && a.r === r);
        if (target) {
          gs.pendingAttacks[this.selectedUnit.id] = target.targetId;
          this.selectedUnit.attacked = true;
          this.reachable = []; this.attackable = []; this.mode = 'select';
          this._refresh(); return;
        }
      }
    }

    if (this.mode === 'attack') {
      const target = this.attackable.find(h => h.q === q && h.r === r);
      if (target) {
        gs.pendingAttacks[this.selectedUnit.id] = target.targetId;
        this.selectedUnit.attacked = true;
        this.reachable = []; this.attackable = []; this.mode = 'select';
        this._refresh();
        return;
      }
    }

    // Recruitment: click own building
    if (clickedBuilding && clickedBuilding.owner === gs.currentPlayer &&
        clickedBuilding.type !== 'ROAD' && BUILDING_TYPES[clickedBuilding.type].canRecruit.length > 0) {
      this._showRecruitPanel(clickedBuilding);
      return;
    }

    if (clickedUnit && clickedUnit.owner === gs.currentPlayer) {
      this._selectUnit(clickedUnit);
    } else {
      this._clearSelection();
    }
  }

  _selectUnit(unit) {
    this._hideContextMenu();
    this.selectedUnit = unit;
    if (!unit.moved) {
      this.reachable  = getReachableHexes(this.gameState, unit, this.terrain, MAP_SIZE);
      // Show attackable enemies overlaid on move range (informational, not attack-mode)
      this.attackable = !unit.attacked
        ? getAttackableHexes(this.gameState, unit, unit.q, unit.r)
        : [];
      this.mode = 'move';
    } else if (!unit.attacked) {
      this.reachable  = [];
      this.attackable = getAttackableHexes(this.gameState, unit, unit.q, unit.r);
      this.mode = 'attack';
    } else {
      this.reachable  = [];
      this.attackable = [];
      this.mode = 'select';
    }
    this._refresh();
    // No context menu on left-click — use right-click for that
  }

  // Right-click: open context menu for own unit, or inspect enemy
  _onHexRightClick(q, r) {
    const gs = this.gameState;
    const clickedUnit = gs.units.find(u => u.q === q && u.r === r && !u.dead);
    if (clickedUnit && clickedUnit.owner === gs.currentPlayer) {
      if (this.selectedUnit !== clickedUnit) this._selectUnit(clickedUnit);
      this._showContextMenu(clickedUnit);
    } else if (this.selectedUnit && this.selectedUnit.owner === gs.currentPlayer) {
      // Right-click on empty/enemy hex while unit selected — show menu for selected unit
      this._showContextMenu(this.selectedUnit);
    }
  }

  _clearSelection() {
    this._hideContextMenu();
    this.selectedUnit = null; this.reachable = []; this.attackable = []; this.mode = 'select';
    this._refresh();
  }

  _onCancel() { this._hideContextMenu(); this._clearSelection(); this._hideRecruitPanel(); }

  _onMoveMode() {
    if (!this.selectedUnit || this.selectedUnit.moved) return;
    this.mode = 'move';
    this.reachable  = getReachableHexes(this.gameState, this.selectedUnit, this.terrain, MAP_SIZE);
    this.attackable = [];
    this._refresh();
  }

  _onAttackMode() {
    if (!this.selectedUnit || this.selectedUnit.attacked) return;
    this.mode = 'attack';
    this.reachable  = [];
    this.attackable = getAttackableHexes(this.gameState, this.selectedUnit, this.selectedUnit.q, this.selectedUnit.r);
    this._refresh();
  }

  _onDigIn() {
    const u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canDigIn || u.dugIn || u.moved) return;
    u.dugIn = true; u.moved = true;
    this._clearSelection();
  }

  _onBuildRoad() {
    const gs = this.gameState;
    const u  = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (roadAt(gs, u.q, u.r)) return;
    if (gs.players[gs.currentPlayer].iron < 1) return;
    gs.players[gs.currentPlayer].iron -= 1;
    gs.buildings.push(createBuilding('ROAD', gs.currentPlayer, u.q, u.r));
    u.moved = true; u.building = true;
    this._redrawRoads();
    this._clearSelection();
  }

  _onBuildStructure(type, ironCost) {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (buildingAt(gs, u.q, u.r)) return;
    const oilCost = type === 'VEHICLE_DEPOT' ? 2 : 0;
    if (gs.players[gs.currentPlayer].iron < ironCost) return;
    if (gs.players[gs.currentPlayer].oil  < oilCost)  return;
    gs.players[gs.currentPlayer].iron -= ironCost;
    gs.players[gs.currentPlayer].oil  -= oilCost;
    gs.buildings.push(createBuilding(type, gs.currentPlayer, u.q, u.r));
    u.moved = true; u.building = true;
    this._clearSelection();
  }

  _onBuildMine(resType) {
    const gs  = this.gameState;
    const u   = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    const res = gs.resourceHexes[`${u.q},${u.r}`];
    if (!res || buildingAt(gs, u.q, u.r)) return;
    if (gs.players[gs.currentPlayer].iron < 4) return;
    gs.players[gs.currentPlayer].iron -= 4;
    const btype = (resType || res.type) === 'OIL' ? 'OIL_PUMP' : 'MINE';
    gs.buildings.push(createBuilding(btype, gs.currentPlayer, u.q, u.r));
    u.moved = true; u.building = true;
    this._clearSelection();
  }

  _onSubmit() {
    const gs = this.gameState;
    this._hideRecruitPanel();
    if (gs.currentPlayer === 1) {
      gs.players[1].submitted = true;
      gs.currentPlayer = 2;
      this._clearSelection();
      this._showPassScreen("Player 2's turn — take the controls");
    } else {
      gs.players[2].submitted = true;
      const events = resolveTurn(gs, this.terrain);
      const winner = checkWinner(gs);
      this._showResolution(events, winner);
    }
  }

  // ── Pass / Resolution screens ─────────────────────────────────────────────
  _showSplash(objects, onDismiss) {
    // Hide action buttons during splash
    Object.values(this.actBtns || {}).forEach(b => b.setVisible(false));
    this.btnSubmit?.setVisible(false);

    const btn = this.add.text(this.scale.width / 2, this.scale.height - 60, '[ CLICK TO CONTINUE ]', {
      font: 'bold 14px monospace', fill: '#ffffff',
      backgroundColor: '#334433', padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });
    this._addToUI([btn]);

    btn.on('pointerdown', () => {
      [...objects, btn].forEach(o => o.destroy());
      onDismiss();
    });
    btn.on('pointerover', () => btn.setAlpha(0.8));
    btn.on('pointerout',  () => btn.setAlpha(1.0));
  }

  _showPassScreen(msg) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.92).setScrollFactor(0).setDepth(200);
    const txt = this.add.text(w/2, h/2, msg, { font: 'bold 26px monospace', fill: '#ffffff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201);
    this._addToUI([overlay, txt]);
    this._showSplash([overlay, txt], () => this._refresh());
  }

  _showResolution(events, winner) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x0a0a0a, 0.93).setScrollFactor(0).setDepth(200);
    const combatLog = this.gameState._lastCombatLog || [];
    const objects = [overlay];

    // ── Header ──
    const header = this.add.text(w/2, 28, `── TURN ${this.gameState.turn - 1} RESOLUTION ──`, {
      font: 'bold 16px monospace', fill: '#ffdd44'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);
    objects.push(header);

    // ── Combat Breakdowns ──
    const TIER_COLOR = {
      'Catastrophic Failure': '#ff4444',
      'Repelled':             '#ff8844',
      'Neutral':              '#aaaaaa',
      'Effective':            '#88dd44',
      'Overwhelming':         '#44ffaa',
    };

    let yPos = 64;
    const lineH = 15;

    const addLine = (text, color = '#cccccc', bold = false, xOff = 0) => {
      const t = this.add.text(w/2 + xOff, yPos, text, {
        font: `${bold ? 'bold ' : ''}12px monospace`, fill: color
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);
      objects.push(t);
      yPos += lineH;
    };

    if (combatLog.length === 0) {
      addLine('(No combat this turn)', '#888888');
    } else {
      for (const entry of combatLog) {
        if (entry.type === 'miss') {
          addLine(`${entry.attackerName} (P${entry.attackerOwner}) → ${entry.targetName} (P${entry.targetOwner})  [OUT OF RANGE]`, '#888888', true);
          yPos += 4;
          continue;
        }

        const tierColor = TIER_COLOR[entry.tier] || '#ffffff';
        // Title row
        addLine(`${entry.attackerName} (P${entry.attackerOwner}) ⚔ ${entry.targetName} (P${entry.targetOwner})`, '#ffffff', true);

        // Stats row
        const attackLabel = entry.isArmored ? `Hard Atk:${entry.baseAttack}` : `Soft Atk:${entry.baseAttack}`;
        addLine(`  ${attackLabel}  Pierce:${entry.pierce} vs Armor:${entry.armor}  ratio:${entry.pierceRatio.toFixed(2)}`, '#aaddff');

        // Score breakdown
        const mods = [];
        if (entry.accuracy !== 0)  mods.push(`acc${entry.accuracy > 0 ? '+' : ''}${entry.accuracy}`);
        if (entry.evasion !== 0)   mods.push(`eva-${entry.evasion}`);
        if (entry.terrainMod !== 0) mods.push(`terrain-${entry.terrainMod}`);
        if (entry.dugInMod !== 0)  mods.push(`dugin-${entry.dugInMod}`);
        if (entry.bunkerMod !== 0) mods.push(`bunker-${entry.bunkerMod}`);
        if (entry.flankMod !== 0)  mods.push(`flank+${entry.flankMod}`);
        mods.push(`roll${entry.roll >= 0 ? '+' : ''}${entry.roll}`);
        addLine(`  Score: 50 + ${mods.join(' ')} = ${entry.score}`, '#ddddaa');

        // Outcome
        addLine(`  ► ${entry.tier}  |  Def takes ${entry.dmg} dmg  |  Att takes ${entry.attackerDmg} dmg${entry.suppressed ? '  |  SUPPRESSED' : ''}`, tierColor, true);

        yPos += 6; // spacing between combats
      }
    }

    // ── Other events (moves, captures, income) ──
    yPos += 4;
    const nonCombat = events.filter(e => !e.startsWith('[COMBAT]'));
    if (nonCombat.length > 0) {
      addLine('── Other Events ──', '#888888', true);
      for (const ev of nonCombat) addLine(ev, '#999999');
    }

    if (winner) {
      yPos += 10;
      addLine(`🏆  PLAYER ${winner} WINS!`, '#ffdd44', true);
      yPos += 6;
      addLine(`Game over — thanks for playing Attrition`, '#888888');
      this._addToUI(objects);
      this._showSplash(objects, () => { this.scene.restart(); });
    } else {
      yPos += 6;
      addLine(`Turn ${this.gameState.turn} begins`, '#666666');
      this._addToUI(objects);
      this._showSplash(objects, () => this._refresh());
    }
  }

  _pushLog(msg) {
    this._log.push(msg);
    if (this._log.length > 5) this._log.shift();
  }

  // ── Terrain generation ────────────────────────────────────────────────────
  _generateTerrain() {
    const map = {}, rng = this._seededRng(12345);
    for (let q = 0; q < MAP_SIZE; q++)
      for (let r = 0; r < MAP_SIZE; r++) map[`${q},${r}`] = 0;
    for (let i = 0; i < 30; i++) {
      const cq = Math.floor(rng() * MAP_SIZE), cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -2; dq <= 2; dq++)
        for (let dr = -2; dr <= 2; dr++)
          if (isValid(cq+dq,cr+dr) && rng()>0.4) map[`${cq+dq},${cr+dr}`] = 1;
    }
    for (let i = 0; i < 15; i++) {
      const cq = Math.floor(rng() * MAP_SIZE), cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -1; dq <= 1; dq++)
        for (let dr = -1; dr <= 1; dr++)
          if (isValid(cq+dq,cr+dr) && rng()>0.5) map[`${cq+dq},${cr+dr}`] = 2;
    }
    return map;
  }

  _seededRng(seed) {
    let s = seed;
    return () => { s = (s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
  }
}
