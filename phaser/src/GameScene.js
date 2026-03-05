import Phaser from 'phaser';
import {
  hexToWorld, worldToHex, hexVertices, isValid,
  MAP_SIZE, HEX_SIZE, getMapBounds
} from './HexGrid.js';
import {
  createGameState, createBuilding, unitAt, buildingAt, roadAt,
  getReachableHexes, getAttackableHexes, computeFog,
  resolveTurn, checkWinner, calcIncome, queueRecruit,
  UNIT_TYPES, PLAYER_COLORS, BUILDING_TYPES, RESOURCE_TYPES, MINE_COST
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

    // Recruitment panel state
    this.recruitBuilding = null;  // building clicked for recruitment

    // Build terrain RenderTexture
    const bounds  = getMapBounds();
    this._bounds  = bounds;
    const padding = HEX_SIZE * 2;
    const rtW = Math.ceil(bounds.width  + padding * 2);
    const rtH = Math.ceil(bounds.height + padding * 2);

    this.terrainRT = this.add.renderTexture(0, 0, rtW, rtH)
      .setOrigin(0, 0).setPosition(bounds.minX - padding, bounds.minY - padding);
    this._drawTerrainToRT();

    // Layers (depth order)
    this.roadGfx      = this.add.graphics().setDepth(5);
    this.resourceGfx  = this.add.graphics().setDepth(8);
    this.highlightGfx = this.add.graphics().setDepth(10);
    this.buildingGfx  = this.add.graphics().setDepth(15);
    this.unitGfx      = this.add.graphics().setDepth(20);
    this.fogGfx       = this.add.graphics().setDepth(30);

    // HUD
    this.hudText = this.add.text(12, 8, '', {
      font: '13px monospace', fill: '#cccccc',
      backgroundColor: '#00000099', padding: { x: 8, y: 4 }
    }).setScrollFactor(0).setDepth(100);

    // Event log
    this.logText = this.add.text(12, 0, '', {
      font: '12px monospace', fill: '#aaaaaa',
      backgroundColor: '#00000099', padding: { x: 6, y: 4 }
    }).setScrollFactor(0).setDepth(100);
    this._log = [];

    // Buttons
    this._createButtons();

    // Recruitment panel (hidden initially)
    this._createRecruitPanel();

    // Camera
    const cam = this.cameras.main;
    cam.centerOn((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    cam.setZoom(1.0);
    cam.setBounds(bounds.minX - padding, bounds.minY - padding, rtW, rtH);

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
    this._updateHUD();
    this._updateButtons();
    this._updateLogPosition();
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

  // ── Buttons ───────────────────────────────────────────────────────────────
  _createButtons() {
    const w = this.scale.width;
    this.btnSubmit  = this._makeButton(w-140, 12, 'SUBMIT TURN',  0x226622, () => this._onSubmit());
    this.btnAttack  = this._makeButton(w-270, 12, 'ATTACK',       0x882222, () => this._onAttackMode());
    this.btnDigIn   = this._makeButton(w-360, 12, 'DIG IN',       0x8B5A2B, () => this._onDigIn());
    this.btnBuild   = this._makeButton(w-460, 12, 'ROAD',         0x664422, () => this._onBuildRoad());
    this.btnMine    = this._makeButton(w-540, 12, 'MINE/OIL',     0x557755, () => this._onBuildMine());
    this.btnBunker  = this._makeButton(w-640, 12, 'BUNKER',       0x665544, () => this._onBuildStructure('BUNKER', 5));
    this.btnDepot   = this._makeButton(w-740, 12, 'V.DEPOT',      0x334466, () => this._onBuildStructure('VEHICLE_DEPOT', 8));
    this.btnObsPost = this._makeButton(w-840, 12, 'OBS.POST',     0x336688, () => this._onBuildStructure('OBS_POST', 3));
    this.btnCancel  = this._makeButton(w-940, 12, 'CANCEL',       0x444444, () => this._onCancel());
  }

  _makeButton(x, y, label, color, cb) {
    const btn = this.add.text(x, y, label, {
      font: 'bold 12px monospace', fill: '#ffffff',
      backgroundColor: `#${color.toString(16).padStart(6,'0')}`,
      padding: { x: 8, y: 5 }
    }).setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', cb);
    btn.on('pointerover', () => btn.setAlpha(0.8));
    btn.on('pointerout',  () => btn.setAlpha(1.0));
    return btn;
  }

  _updateButtons() {
    const gs      = this.gameState;
    const hasUnit = !!this.selectedUnit;
    const canAct  = hasUnit && this.selectedUnit.owner === gs.currentPlayer;
    const u       = this.selectedUnit;

    this.btnSubmit.setVisible(true);

    this.btnAttack.setVisible(canAct && !u.attacked && this.mode !== 'attack');
    this.btnCancel.setVisible(hasUnit || this.mode !== 'select' || !!this.recruitBuilding);

    const canDigIn = canAct && UNIT_TYPES[u.type].canDigIn && !u.dugIn && !u.moved;
    this.btnDigIn.setVisible(canDigIn);

    // Build Mine: engineer on iron resource hex, no existing building
    const canBuildMine = canAct && UNIT_TYPES[u.type].canBuild &&
      this.gameState.resourceHexes[`${u.q},${u.r}`]?.type === 'IRON' &&
      !buildingAt(gs, u.q, u.r) &&
      gs.players[gs.currentPlayer].iron >= 4;
    this.btnMine.setVisible(canBuildMine);

    // Build Oil Pump button (reuse build button label logic)
    const canBuildOil = canAct && UNIT_TYPES[u.type].canBuild &&
      this.gameState.resourceHexes[`${u.q},${u.r}`]?.type === 'OIL' &&
      !buildingAt(gs, u.q, u.r) &&
      gs.players[gs.currentPlayer].iron >= 4;
    // We'll repurpose btnMine for any resource build
    if (canBuildOil) {
      this.btnMine.setVisible(true);
      this.btnMine.setText('BUILD OIL PUMP');
      this._buildingOil = true;
    } else {
      this.btnMine.setText('BUILD MINE');
      this._buildingOil = false;
    }

    const isEngineer = canAct && UNIT_TYPES[u.type].canBuild;
    const p = gs.currentPlayer;

    this.btnBuild.setVisible(isEngineer && !roadAt(gs, u.q, u.r) && gs.players[p].iron >= 1);

    const resCost = 4, res = gs.resourceHexes[`${u.q},${u.r}`];
    const noBuilding = !buildingAt(gs, u.q, u.r);
    this.btnMine.setVisible(isEngineer && !!res && noBuilding && gs.players[p].iron >= resCost);
    if (isEngineer && res) this.btnMine.setText(res.type === 'OIL' ? 'OIL PUMP' : 'MINE');

    this.btnBunker.setVisible(isEngineer && noBuilding && gs.players[p].iron >= 5);
    this.btnDepot.setVisible(isEngineer && noBuilding && gs.players[p].iron >= 8 && gs.players[p].oil >= 2);
    this.btnObsPost.setVisible(isEngineer && noBuilding && gs.players[p].iron >= 3);
  }

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

    available.forEach((unitType, i) => {
      const def = UNIT_TYPES[unitType];
      const canAfford = gs.players[p].iron >= def.cost.iron && gs.players[p].oil >= def.cost.oil;
      const label = `${def.name}  ⚙${def.cost.iron}${def.cost.oil > 0 ? ` 🛢${def.cost.oil}` : ''}  HP:${def.health} ATK:${def.attack} MOV:${def.move}`;
      const btn = this.add.text(w/2, py + 60 + i * 48, label, {
        font: '13px monospace', fill: canAfford ? '#ccffcc' : '#ff6666',
        backgroundColor: canAfford ? '#224422' : '#332222',
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

    const closeBtn = this.add.text(w/2, py + panelH - 28, '[ CLOSE ]', {
      font: 'bold 13px monospace', fill: '#ffffff',
      backgroundColor: '#444444', padding: { x: 14, y: 7 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this._hideRecruitPanel());
    closeBtn.on('pointerover', () => closeBtn.setAlpha(0.8));
    closeBtn.on('pointerout',  () => closeBtn.setAlpha(1.0));
    objs.push(closeBtn);

    this.recruitPanel = { visible: true, objects: objs };
    this._updateButtons();
  }

  _hideRecruitPanel() {
    if (this.recruitPanel?.objects) {
      for (const o of this.recruitPanel.objects) o.destroy();
    }
    this.recruitPanel = { visible: false, objects: [] };
    this.recruitBuilding = null;
    this._updateButtons();
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
            this.hoveredHex = hex; this._redrawHighlights(); this._updateHUD();
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
      this._isDragging = false;
    });

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
  }

  update() {
    const cam = this.cameras.main;
    const speed = 6 / cam.zoom;
    if (this.wasd.W.isDown) cam.scrollY -= speed;
    if (this.wasd.S.isDown) cam.scrollY += speed;
    if (this.wasd.A.isDown) cam.scrollX -= speed;
    if (this.wasd.D.isDown) cam.scrollX += speed;
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
        this._onCancel(); return;
      }
      this._onCancel();
    }

    if (this.mode === 'attack') {
      const target = this.attackable.find(h => h.q === q && h.r === r);
      if (target) {
        gs.pendingAttacks[this.selectedUnit.id] = target.targetId;
        this.selectedUnit.attacked = true;
        this._onCancel(); return;
      }
      this._onCancel();
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
    this.selectedUnit = unit;
    this.reachable  = unit.moved ? [] : getReachableHexes(this.gameState, unit, this.terrain, MAP_SIZE);
    this.attackable = unit.attacked ? [] : [];  // shown only in attack mode
    this.mode = unit.moved ? 'select' : 'move';
    this._refresh();
  }

  _clearSelection() {
    this.selectedUnit = null; this.reachable = []; this.attackable = []; this.mode = 'select';
    this._refresh();
  }

  _onCancel() { this._clearSelection(); this._hideRecruitPanel(); }

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

  _onBuildMine() {
    const gs  = this.gameState;
    const u   = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    const res = gs.resourceHexes[`${u.q},${u.r}`];
    if (!res || buildingAt(gs, u.q, u.r)) return;
    if (gs.players[gs.currentPlayer].iron < 4) return;
    gs.players[gs.currentPlayer].iron -= 4;
    const btype = this._buildingOil ? 'OIL_PUMP' : 'MINE';
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
    // Hide game buttons while splash is showing
    [this.btnSubmit, this.btnAttack, this.btnDigIn, this.btnBuild, this.btnMine,
     this.btnBunker, this.btnDepot, this.btnObsPost, this.btnCancel]
      .forEach(b => b.setVisible(false));

    const btn = this.add.text(this.scale.width / 2, this.scale.height - 60, '[ CLICK TO CONTINUE ]', {
      font: 'bold 14px monospace', fill: '#ffffff',
      backgroundColor: '#334433', padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });

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
    this._showSplash([overlay, txt], () => this._refresh());
  }

  _showResolution(events, winner) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.9).setScrollFactor(0).setDepth(200);
    let text = `── Turn ${this.gameState.turn - 1} Resolution ──\n\n${events.join('\n') || '(No actions)'}`;
    if (winner) text += `\n\n🏆 PLAYER ${winner} WINS!`;
    else text += `\n\nTurn ${this.gameState.turn} begins`;
    const txt = this.add.text(w/2, h/2 - 20, text, {
      font: '13px monospace', fill: '#ffffff', align: 'center', wordWrap: { width: w - 80 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    if (!winner) {
      this._showSplash([overlay, txt], () => this._refresh());
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  _updateHUD() {
    const gs  = this.gameState;
    const p   = gs.currentPlayer;
    const pl  = gs.players[p];
    const inc = calcIncome(gs, p);
    let info  = '';

    if (this.selectedUnit) {
      const u = this.selectedUnit, def = UNIT_TYPES[u.type];
      info = `  |  ${def.name} HP:${u.health}/${u.maxHealth}`;
      info += u.moved ? ' [moved]' : ' [can move]';
      const pa = gs.pendingAttacks[u.id];
      info += pa ? ' [⚔queued]' : u.attacked ? ' [attacked]' : ' [can attack]';
      if (u.dugIn) info += ' [dug in]';
    } else if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r)) {
      const key = `${this.hoveredHex.q},${this.hoveredHex.r}`;
      const t = ['Plains','Forest','Mountain'][this.terrain[key]];
      const res = gs.resourceHexes[key];
      const u   = unitAt(gs, this.hoveredHex.q, this.hoveredHex.r);
      const b   = buildingAt(gs, this.hoveredHex.q, this.hoveredHex.r);
      info = `  |  (${this.hoveredHex.q},${this.hoveredHex.r}) ${t}`;
      if (res) info += ` [${RESOURCE_TYPES[res.type].name}]`;
      if (b)   info += ` — ${BUILDING_TYPES[b.type].name}`;
      if (u)   info += ` — P${u.owner} ${UNIT_TYPES[u.type].name} HP:${u.health}`;
    }

    const modeStr = this.mode === 'move' ? 'MOVING' : this.mode === 'attack' ? 'ATTACKING' : 'SELECT';
    const pending = gs.pendingRecruits.filter(r => r.owner === p).length;
    const pendingStr = pending ? `  [${pending} recruiting]` : '';

    this.hudText.setText(
      `Attrition | P${p} | ⚙${pl.iron}(+${inc.iron}) 🛢${pl.oil}(+${inc.oil}) | Turn:${gs.turn} | ${modeStr}${pendingStr}${info}`
    );
  }

  _updateLogPosition() {
    this.logText.setPosition(12, this.scale.height - this.logText.height - 8);
  }

  _pushLog(msg) {
    this._log.push(msg);
    if (this._log.length > 5) this._log.shift();
    this.logText.setText(this._log.join('\n'));
    this._updateLogPosition();
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
