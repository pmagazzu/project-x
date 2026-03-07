import Phaser from 'phaser';
import {
  hexToWorld, worldToHex, hexVertices, isValid,
  MAP_SIZE, HEX_SIZE, getMapBounds
} from './HexGrid.js';
import { MenuScene } from './MenuScene.js';
import {
  createGameState, createBuilding, unitAt, buildingAt, roadAt,
  getReachableHexes, getAttackableHexes, getAttackRangeHexes, hexDistance, computeFog,
  findPath, resolveTurn, resolveImmediateAttack, resolveEndOfTurn, checkWinner, calcIncome, queueRecruit, registerDesign,
  UNIT_TYPES, PLAYER_COLORS, BUILDING_TYPES, RESOURCE_TYPES,
  MODULES, CHASSIS_BUILDINGS, MAX_DESIGNS_PER_PLAYER,
  designRegistrationCost, computeDesignStats,
  NAVAL_UNITS, SHALLOW_UNITS, canEnterTerrain, isStealthDetected
} from './GameState.js';

// ── Constants ─────────────────────────────────────────────────────────────
const TERRAIN        = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2, HILL: 3, SHALLOW: 4, OCEAN: 5, SAND: 6 };
const TERRAIN_LABELS = ['Plains','Forest','Mountain','Hill','Shallow Water','Ocean','Sand'];
const TERRAIN_COLORS = {
  0: { fill: 0x8aaa55, stroke: 0x6a8a35 },  // plains
  1: { fill: 0x1a4010, stroke: 0x0d2008 },  // forest
  2: { fill: 0x8a7a6a, stroke: 0x6a5a4a },  // mountain
  3: { fill: 0xb8a060, stroke: 0x9a8040 },  // hill
  4: { fill: 0x4499bb, stroke: 0x2277aa },  // shallow water
  5: { fill: 0x0d2a4a, stroke: 0x071a2e },  // ocean
  6: { fill: 0xd4b96a, stroke: 0xb09050 },  // sand/beach
};
const SELECTED_STROKE  = 0xffe066;
const HOVER_STROKE     = 0xaaddff;
const MOVE_HIGHLIGHT   = 0x00ffcc;
const ATTACK_HIGHLIGHT = 0xff6600;
const GAME_VERSION = 'v0.4.7';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  // Add game objects to the UI layer so the fixed uiCamera renders them
  // (main world camera ignores _uiLayer so zoom never displaces HUD)
  _addToUI(objs) {
    if (!this._uiLayer) return;
    for (const o of objs) { if (o && !o.destroyed) this._uiLayer.add(o); }
  }

  create() {
    // Read scenario config passed from MenuScene (or default)
    const data = this.scene.settings.data || {};
    this.scenario = data.scenario || 'default';
    // Map sizes per scenario
    const MAP_SIZES = { scout: 25, naval: 35, combat: 20, grand: 120, default: 25 };
    this.mapSize   = MAP_SIZES[this.scenario] || MAP_SIZE;

    this.gameState = createGameState(this.scenario);
    this.terrain   = this._generateTerrain();
    // After terrain is known, relocate any naval unit that spawned on invalid terrain
    this._fixNavalSpawns();



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
      zoomSpeed:         1.0,   // scroll wheel zoom speed (0.5 = slow, 1.0 = default, 2.0 = fast)
    };

    // Recruitment panel state
    this.recruitBuilding = null;

    // Build terrain RenderTexture
    const bounds  = getMapBounds(this.mapSize);
    this._bounds  = bounds;
    const padding = HEX_SIZE * 2;
    const rtW = Math.ceil(bounds.width  + padding * 2);
    const rtH = Math.ceil(bounds.height + padding * 2);

    // Terrain is drawn directly to a world Graphics object (avoids RT color-channel bugs).
    // For maps ≤50 tiles, this is fast enough. Grand map still uses RT for performance.
    this.terrainGfx = this.add.graphics().setDepth(0);
    this._drawTerrainDirect();
    // Keep terrainRT as a dummy object so existing camera ignore lists don't break
    this.terrainRT = this.add.renderTexture(1, 1, 1, 1).setVisible(false);

    // World graphics layers (depth order)
    this.roadGfx      = this.add.graphics().setDepth(5);
    this.resourceGfx  = this.add.graphics().setDepth(8);
    this.highlightGfx = this.add.graphics().setDepth(10);
    this.buildingGfx  = this.add.graphics().setDepth(15);
    this.unitGfx      = this.add.graphics().setDepth(20);
    // Fog: RenderTexture instead of Graphics — handles large maps (120×120+) without vertex overflow
    this.fogRT = this.add.renderTexture(0, 0, rtW, rtH)
      .setOrigin(0, 0).setPosition(bounds.minX - padding, bounds.minY - padding).setDepth(30);

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
      this.terrainGfx, this.terrainRT, this.roadGfx, this.resourceGfx,
      this.highlightGfx, this.buildingGfx, this.unitGfx, this.fogRT, this._uiLayer
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
    // Extend camera bounds by half a screen in each direction so players can
    // center a corner base on-screen without hitting an invisible wall.
    const sw0 = this.scale.width, sh0 = this.scale.height;
    cam.setBounds(bounds.minX - padding - sw0 * 0.5, bounds.minY - padding - sh0 * 0.5,
                  rtW + sw0, rtH + sh0);
    cam.ignore(this._uiLayer);

    // Fixed UI camera — zoom=1, no scroll, ignores all world graphics
    const sw = this.scale.width, sh = this.scale.height;
    this.uiCamera = this.cameras.add(0, 0, sw, sh).setName('ui').setScroll(0, 0).setZoom(1);
    this.uiCamera.transparent = true; // transparent background — must not cover world
    this.uiCamera.ignore([
      this.terrainGfx, this.terrainRT, this.roadGfx, this.resourceGfx,
      this.highlightGfx, this.buildingGfx, this.unitGfx, this.fogRT,
    ]);
    this.scale.on('resize', (gs) => this.uiCamera.setSize(gs.width, gs.height));

    this._setupInput();
    this._drawStaticLayers();
    this._freezeFog(); // lock fog for P1's first planning phase
    this._refresh();
  }

  // ── Terrain ──────────────────────────────────────────────────────────────
  _drawTerrainDirect() {
    this.terrainGfx.clear();
    for (let q = 0; q < this.mapSize; q++) {
      for (let r = 0; r < this.mapSize; r++) {
        const { x, y } = hexToWorld(q, r);
        this._drawHex(this.terrainGfx, x, y, this.terrain[`${q},${r}`] ?? 0, false, false);
      }
    }
  }

  // Legacy — kept for reference but no longer called (RT replaced by direct gfx)
  _drawTerrainToRT() {}

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
    // Forest: draw small tree triangles
    if (terrain === 1 && !isHovered && !isSelected) {
      gfx.fillStyle(0x2a6018, 0.9);
      const ts = 5; // tree size
      for (const [ox, oy] of [[-7,-4],[4,-6],[0,5],[-4,6],[7,2]]) {
        gfx.fillTriangle(cx+ox, cy+oy-ts, cx+ox-ts, cy+oy+ts, cx+ox+ts, cy+oy+ts);
      }
    }
    // Mountain: draw sharp peak lines
    if (terrain === 2 && !isHovered && !isSelected) {
      gfx.lineStyle(1.5, 0xffffff, 0.35);
      gfx.beginPath();
      gfx.moveTo(cx-8, cy+5); gfx.lineTo(cx-2, cy-7); gfx.lineTo(cx+4, cy+5);
      gfx.moveTo(cx+1, cy+5); gfx.lineTo(cx+7, cy-3); gfx.lineTo(cx+13, cy+5);
      gfx.strokePath();
    }
    // Hill: draw smooth rounded bump curves
    if (terrain === 3 && !isHovered && !isSelected) {
      gfx.lineStyle(2, 0xffffff, 0.25);
      gfx.beginPath();
      gfx.moveTo(cx-10, cy+4); gfx.lineTo(cx-5, cy-4); gfx.lineTo(cx, cy+4);
      gfx.moveTo(cx-2, cy+4); gfx.lineTo(cx+4, cy-3); gfx.lineTo(cx+10, cy+4);
      gfx.strokePath();
    }
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
    const gs = this.gameState;
    const roadSet = new Set(gs.buildings.filter(b => b.type === 'ROAD').map(b => `${b.q},${b.r}`));
    const HEX_NEIGHBORS_LOCAL = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

    for (const b of gs.buildings) {
      if (b.type !== 'ROAD') continue;
      const { x, y } = hexToWorld(b.q, b.r);
      // Light hex fill
      const verts = hexVertices(x, y);
      this.roadGfx.fillStyle(0xd4b896, 0.35);
      this.roadGfx.beginPath(); this.roadGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.roadGfx.lineTo(verts[i].x, verts[i].y);
      this.roadGfx.closePath(); this.roadGfx.fillPath();

      // Draw a thick brown line segment from center toward each adjacent road hex
      this.roadGfx.lineStyle(4, 0xaa8855, 0.9);
      for (const [dq, dr] of HEX_NEIGHBORS_LOCAL) {
        const nq = b.q + dq, nr = b.r + dr;
        if (!roadSet.has(`${nq},${nr}`)) continue;
        const { x: nx, y: ny } = hexToWorld(nq, nr);
        // Draw from center to midpoint between the two hex centers
        const mx = (x + nx) / 2, my = (y + ny) / 2;
        this.roadGfx.beginPath();
        this.roadGfx.moveTo(x, y);
        this.roadGfx.lineTo(mx, my);
        this.roadGfx.strokePath();
      }
      // Center dot
      this.roadGfx.fillStyle(0xaa8855, 0.95);
      this.roadGfx.fillCircle(x, y, 4);
    }
  }

  // ── Full refresh ──────────────────────────────────────────────────────────
  _refresh() {
    // Recompute fog based on current unit positions (own units may have moved during planning).
    // We-go integrity is maintained by _origQ/_origR on enemy units — enemy display positions
    // are locked to turn-start regardless of fog recomputation.
    this._currentFog = computeFog(this.gameState, this.gameState.currentPlayer, this.mapSize, this.terrain);
    this._redrawHighlights();
    this._redrawRoads();
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
    if (this.mode === 'attack_direct') {
      // Direct attack: only visible enemy hexes, bright
      for (const { q, r } of this.attackable) fillHex(q, r, ATTACK_HIGHLIGHT, 0.6);
    } else if (this.mode === 'attack') {
      // Blind fire: dim all range hexes, bright only where fog-visible enemies are at their DISPLAY position
      const gs = this.gameState;
      const fog = this._currentFog;
      for (const { q, r } of this.attackable) {
        const hasVisibleEnemy = gs.units.some(u => {
          if (u.owner === gs.currentPlayer || u.dead) return false;
          if (u.q !== q || u.r !== r) return false;
          if (fog && !fog.has(`${dq},${dr}`)) return false; // hidden in fog
          return true;
        });
        fillHex(q, r, ATTACK_HIGHLIGHT, hasVisibleEnemy ? 0.5 : 0.12);
      }
    } else {
      for (const { q, r } of this.attackable) fillHex(q, r, ATTACK_HIGHLIGHT, 0.3);
    }

    if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r, this.mapSize)) {
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

    // ── Pending move arrows (own units with queued moves) ───────────────────
    const gs = this.gameState;
    for (const u of gs.units) {
      if (u.owner !== gs.currentPlayer || !u.moved || u._origQ === undefined) continue;
      const from = hexToWorld(u._origQ, u._origR);
      const to   = hexToWorld(u.q, u.r);
      const color = PLAYER_COLORS[u.owner] || 0xffffff;
      // Dashed line from origin to destination
      this.highlightGfx.lineStyle(2, color, 0.6);
      this.highlightGfx.beginPath();
      // Draw dashed manually (4 segments)
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 0.5) / steps;
        if (i % 2 === 0) {
          this.highlightGfx.moveTo(from.x + (to.x - from.x) * t0, from.y + (to.y - from.y) * t0);
          this.highlightGfx.lineTo(from.x + (to.x - from.x) * t1, from.y + (to.y - from.y) * t1);
        }
      }
      this.highlightGfx.strokePath();
      // Arrowhead at destination
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const aLen = 10;
      this.highlightGfx.lineStyle(2, color, 0.9);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(to.x, to.y);
      this.highlightGfx.lineTo(to.x - aLen * Math.cos(angle - 0.4), to.y - aLen * Math.sin(angle - 0.4));
      this.highlightGfx.moveTo(to.x, to.y);
      this.highlightGfx.lineTo(to.x - aLen * Math.cos(angle + 0.4), to.y - aLen * Math.sin(angle + 0.4));
      this.highlightGfx.strokePath();
      // Ghost circle at origin to show where unit came from
      this.highlightGfx.lineStyle(1.5, color, 0.3);
      this.highlightGfx.strokeCircle(from.x, from.y, 10);
    }

    // ── Pending attack ghost lines (planned attacks) ───────────────────────
    // Similar to move arrows: show who will shoot whom before submit.
    for (const [attackerIdStr, planned] of Object.entries(gs.pendingAttacks || {})) {
      const attackerId = parseInt(attackerIdStr);
      const attacker = gs.units.find(u => u.id === attackerId && !u.dead);
      if (!attacker || attacker.owner !== gs.currentPlayer) continue;

      const from = hexToWorld(attacker.q, attacker.r);
      let tq = null, tr = null;

      // Direct target: unit id
      if (typeof planned === 'number') {
        const target = gs.units.find(u => u.id === planned && !u.dead);
        if (!target) continue;
        // IGOUGO: use real position
        tq = target.q;
        tr = target.r;
      }
      // Blind fire target: { hex: {q,r} }
      else if (planned && typeof planned === 'object' && planned.hex) {
        tq = planned.hex.q; tr = planned.hex.r;
      }

      if (tq === null || tr === null) continue;
      const to = hexToWorld(tq, tr);

      // Dotted red line
      this.highlightGfx.lineStyle(2, 0xff6666, 0.7);
      this.highlightGfx.beginPath();
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 0.5) / steps;
        if (i % 2 === 0) {
          this.highlightGfx.moveTo(from.x + (to.x - from.x) * t0, from.y + (to.y - from.y) * t0);
          this.highlightGfx.lineTo(from.x + (to.x - from.x) * t1, from.y + (to.y - from.y) * t1);
        }
      }
      this.highlightGfx.strokePath();

      // Arrowhead at target
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const aLen = 9;
      this.highlightGfx.lineStyle(2, 0xff8888, 0.9);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(to.x, to.y);
      this.highlightGfx.lineTo(to.x - aLen * Math.cos(angle - 0.45), to.y - aLen * Math.sin(angle - 0.45));
      this.highlightGfx.moveTo(to.x, to.y);
      this.highlightGfx.lineTo(to.x - aLen * Math.cos(angle + 0.45), to.y - aLen * Math.sin(angle + 0.45));
      this.highlightGfx.strokePath();
    }

    // ── Auto-road standing order path preview (yellow) ────────────────────
    for (const u of gs.units) {
      if (!u.roadOrder || !u.roadOrder.path || u.owner !== gs.currentPlayer) continue;
      const path = u.roadOrder.path;
      if (!path.length) continue;
      const pts = [{ q: u.q, r: u.r }, ...path];
      this.highlightGfx.lineStyle(1.5, 0xffdd44, 0.35);
      this.highlightGfx.beginPath();
      const steps = 10;
      for (let seg = 0; seg < pts.length - 1; seg++) {
        const from2 = hexToWorld(pts[seg].q, pts[seg].r);
        const to2   = hexToWorld(pts[seg+1].q, pts[seg+1].r);
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps, t1 = (i + 0.5) / steps;
          if (i % 2 === 0) {
            this.highlightGfx.moveTo(from2.x + (to2.x - from2.x) * t0, from2.y + (to2.y - from2.y) * t0);
            this.highlightGfx.lineTo(from2.x + (to2.x - from2.x) * t1, from2.y + (to2.y - from2.y) * t1);
          }
        }
      }
      this.highlightGfx.strokePath();
      const dest = hexToWorld(u.roadOrder.destQ, u.roadOrder.destR);
      this.highlightGfx.lineStyle(2, 0xffdd44, 0.7);
      const d = 6;
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(dest.x - d, dest.y - d); this.highlightGfx.lineTo(dest.x + d, dest.y + d);
      this.highlightGfx.moveTo(dest.x + d, dest.y - d); this.highlightGfx.lineTo(dest.x - d, dest.y + d);
      this.highlightGfx.strokePath();
    }

    // ── Auto-move standing order path preview (cyan) ───────────────────────
    for (const u of gs.units) {
      if (!u.moveOrder || u.owner !== gs.currentPlayer) continue;
      const pts = [{ q: u.q, r: u.r }, ...(u.moveOrder.path || [])];
      if (pts.length < 2) continue;
      this.highlightGfx.lineStyle(1.5, 0x44eeff, 0.4);
      this.highlightGfx.beginPath();
      const steps = 10;
      for (let seg = 0; seg < pts.length - 1; seg++) {
        const from2 = hexToWorld(pts[seg].q, pts[seg].r);
        const to2   = hexToWorld(pts[seg+1].q, pts[seg+1].r);
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps, t1 = (i + 0.5) / steps;
          if (i % 2 === 0) {
            this.highlightGfx.moveTo(from2.x + (to2.x - from2.x) * t0, from2.y + (to2.y - from2.y) * t0);
            this.highlightGfx.lineTo(from2.x + (to2.x - from2.x) * t1, from2.y + (to2.y - from2.y) * t1);
          }
        }
      }
      this.highlightGfx.strokePath();
      // Destination marker — small diamond
      const dest = hexToWorld(u.moveOrder.destQ, u.moveOrder.destR);
      this.highlightGfx.lineStyle(2, 0x44eeff, 0.8);
      const d = 7;
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(dest.x,     dest.y - d);
      this.highlightGfx.lineTo(dest.x + d, dest.y);
      this.highlightGfx.lineTo(dest.x,     dest.y + d);
      this.highlightGfx.lineTo(dest.x - d, dest.y);
      this.highlightGfx.closePath();
      this.highlightGfx.strokePath();
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

      } else if (b.type === 'NAVAL_YARD') {
        // Naval Yard: blue rectangle with a mast/crane arm
        const bw = s * 2.0, bh = s * 1.0;
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - bw/2 - 2, y - bh/2 - 2, bw + 4, bh + 4);
        this.buildingGfx.fillStyle(0x1a3a5c);
        this.buildingGfx.fillRect(x - bw/2, y - bh/2, bw, bh);
        // Crane arm
        this.buildingGfx.fillStyle(color);
        this.buildingGfx.fillRect(x - bw*0.05, y - bh/2 - s*1.2, s*0.2, s*1.2);
        this.buildingGfx.fillRect(x - bw*0.05 - s*0.6, y - bh/2 - s*1.1, s*0.65, s*0.15);
        this.buildingGfx.lineStyle(1.5, 0x88ccff, 0.8);
        this.buildingGfx.strokeRect(x - bw/2, y - bh/2, bw, bh);

      } else if (b.type === 'HARBOR') {
        // Harbor: dark pier shape with dock arms
        const bw = s * 1.6, bh = s * 0.7;
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - bw/2 - 2, y - bh/2 - 2, bw + 4, bh + 4);
        this.buildingGfx.fillStyle(0x2a4a3a);
        this.buildingGfx.fillRect(x - bw/2, y - bh/2, bw, bh);
        // Dock arms
        this.buildingGfx.fillStyle(color);
        this.buildingGfx.fillRect(x - bw*0.45, y - bh/2 - s*0.5, s*0.2, s*0.55);
        this.buildingGfx.fillRect(x + bw*0.25, y - bh/2 - s*0.5, s*0.2, s*0.55);
        this.buildingGfx.lineStyle(1.5, 0x44ff88, 0.7);
        this.buildingGfx.strokeRect(x - bw/2, y - bh/2, bw, bh);

      } else if (b.type === 'DRY_DOCK') {
        // Dry Dock: wide U-shaped structure
        const bw = s * 2.2, bh = s * 1.2;
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - bw/2 - 2, y - bh/2 - 2, bw + 4, bh + 4);
        this.buildingGfx.fillStyle(0x2a2a4a);
        this.buildingGfx.fillRect(x - bw/2, y - bh/2, bw, bh);
        // Inner dock channel
        this.buildingGfx.fillStyle(0x112233);
        this.buildingGfx.fillRect(x - bw*0.25, y - bh/2 + s*0.2, bw*0.5, bh*0.7);
        this.buildingGfx.lineStyle(2, color, 0.9);
        this.buildingGfx.strokeRect(x - bw/2, y - bh/2, bw, bh);

      } else if (b.type === 'NAVAL_BASE') {
        // Naval Base: large compound — double rect with flag
        const bw = s * 2.4, bh = s * 1.4;
        this.buildingGfx.fillStyle(0x000000);
        this.buildingGfx.fillRect(x - bw/2 - 2, y - bh/2 - 2, bw + 4, bh + 4);
        this.buildingGfx.fillStyle(0x1a2a3a);
        this.buildingGfx.fillRect(x - bw/2, y - bh/2, bw, bh);
        // Inner divider
        this.buildingGfx.lineStyle(1, 0x334455, 0.8);
        this.buildingGfx.lineBetween(x, y - bh/2, x, y + bh/2);
        // Flagpole
        this.buildingGfx.fillStyle(0xffffff);
        this.buildingGfx.fillRect(x - bw*0.35, y - bh/2 - s*1.0, s*0.12, s*1.1);
        this.buildingGfx.fillStyle(color);
        this.buildingGfx.fillTriangle(x - bw*0.35 + s*0.12, y - bh/2 - s*0.95,
          x - bw*0.35 + s*0.12, y - bh/2 - s*0.55,
          x - bw*0.35 + s*0.55, y - bh/2 - s*0.75);
        this.buildingGfx.lineStyle(2, color, 1.0);
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
      // IGOUGO: all positions are real/immediate — no we-go display offset needed
      const isEnemy = unit.owner !== gs.currentPlayer;
      const dispQ = unit.q;
      const dispR = unit.r;

      // Skip embarked units (they're inside a transport)
      if (unit.embarked) continue;

      // Hide enemy units in fog (use display position, not queued position)
      const key = `${dispQ},${dispR}`;
      if (isEnemy && fog && !fog.has(key)) continue;
      // Stealth: hide stealthy enemy units unless detected
      if (isEnemy && (UNIT_TYPES[unit.type]?.stealthy || 0) > 0) {
        if (!isStealthDetected(gs, unit, gs.currentPlayer)) continue; // not detected — skip render
      }

      const { x, y } = hexToWorld(dispQ, dispR);
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
      // Incoming attack warning (check both unit-id and hex-targeted attacks)
      const isTargeted = Object.values(gs.pendingAttacks).some(a =>
        a === unit.id || (a?.hex && a.hex.q === dispQ && a.hex.r === dispR));
      if (isTargeted) {
        this.unitGfx.lineStyle(3, 0xff2222, 0.85);
        this.unitGfx.strokeCircle(x, y, r + 9);
      }

      // Attack-available indicator: pulsing crosshair on enemies the selected unit can attack
      const isAttackTarget = this.attackable.some(h => h.q === dispQ && h.r === dispR);
      if (isAttackTarget && unit.owner !== gs.currentPlayer) {
        const cr = r + 7;
        // Outer ring
        this.unitGfx.lineStyle(2, 0xff4400, 0.9);
        this.unitGfx.strokeCircle(x, y, cr);
        // Crosshair ticks (4 short lines at N/S/E/W outside ring)
        const gap2 = 4, tick = 6;
        this.unitGfx.lineStyle(2, 0xff4400, 0.9);
        this.unitGfx.beginPath();
        this.unitGfx.moveTo(x, y - cr - gap2);        this.unitGfx.lineTo(x, y - cr - gap2 - tick);
        this.unitGfx.moveTo(x, y + cr + gap2);        this.unitGfx.lineTo(x, y + cr + gap2 + tick);
        this.unitGfx.moveTo(x - cr - gap2, y);        this.unitGfx.lineTo(x - cr - gap2 - tick, y);
        this.unitGfx.moveTo(x + cr + gap2, y);        this.unitGfx.lineTo(x + cr + gap2 + tick, y);
        this.unitGfx.strokePath();
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
      } else if (def.shape === 'boat_sm') {
        // Patrol Boat: small elongated oval / hull
        this.unitGfx.fillEllipse(x, y, r*2.2, r*1.0);
        this.unitGfx.lineStyle(2, 0x000000, alpha); this.unitGfx.strokeEllipse(x, y, r*2.2, r*1.0);
      } else if (def.shape === 'sub') {
        // Submarine: thin elongated with rounded ends, darker
        this.unitGfx.fillStyle(color, alpha * 0.85);
        this.unitGfx.fillEllipse(x, y, r*2.6, r*0.8);
        this.unitGfx.lineStyle(2, 0x000000, alpha);
        this.unitGfx.strokeEllipse(x, y, r*2.6, r*0.8);
        // Conning tower
        this.unitGfx.fillStyle(color, alpha);
        this.unitGfx.fillRect(x-r*0.15, y-r*0.7, r*0.3, r*0.5);
      } else if (def.shape === 'destroyer') {
        // Destroyer: elongated with pointed prow
        this.unitGfx.fillTriangle(x+r*1.2, y, x-r*1.0, y-r*0.6, x-r*1.0, y+r*0.6);
        this.unitGfx.lineStyle(2, 0x000000, alpha);
        this.unitGfx.strokeTriangle(x+r*1.2, y, x-r*1.0, y-r*0.6, x-r*1.0, y+r*0.6);
      } else if (def.shape === 'cruiser' || def.shape === 'cruiser_hv') {
        // Cruiser: wider hull with superstructure block
        const hw = def.shape === 'cruiser_hv' ? r*1.6 : r*1.3;
        this.unitGfx.fillEllipse(x, y, hw*2, r*1.1);
        this.unitGfx.lineStyle(2, 0x000000, alpha); this.unitGfx.strokeEllipse(x, y, hw*2, r*1.1);
        // Superstructure
        this.unitGfx.fillStyle(color, alpha * 0.7);
        this.unitGfx.fillRect(x-r*0.4, y-r*0.7, r*0.8, r*0.55);
      } else if (def.shape === 'battleship') {
        // Battleship: large wide hull
        this.unitGfx.fillEllipse(x, y, r*2.8, r*1.3);
        this.unitGfx.lineStyle(3, 0x000000, alpha); this.unitGfx.strokeEllipse(x, y, r*2.8, r*1.3);
        // Gun turret
        this.unitGfx.fillStyle(color, alpha * 0.8);
        this.unitGfx.fillCircle(x, y-r*0.3, r*0.4);
      } else if (def.shape === 'transport') {
        // Transport: wide boxy hull
        this.unitGfx.fillRect(x-r*1.2, y-r*0.65, r*2.4, r*1.3);
        this.unitGfx.lineStyle(2, 0x000000, alpha); this.unitGfx.strokeRect(x-r*1.2, y-r*0.65, r*2.4, r*1.3);
        // Cargo hold indicator
        if (unit.cargo && unit.cargo.length > 0) {
          this.unitGfx.fillStyle(0xffdd44, alpha);
          this.unitGfx.fillRect(x-r*0.3, y-r*0.2, r*0.6, r*0.5);
        }
      } else if (def.shape === 'landing') {
        // Landing Craft: flat-bottomed box with ramp front
        this.unitGfx.fillRect(x-r*0.9, y-r*0.6, r*1.8, r*1.1);
        this.unitGfx.lineStyle(2, 0x000000, alpha); this.unitGfx.strokeRect(x-r*0.9, y-r*0.6, r*1.8, r*1.1);
        // Ramp line
        this.unitGfx.lineStyle(2, 0xffaa44, alpha);
        this.unitGfx.beginPath(); this.unitGfx.moveTo(x+r*0.9, y-r*0.6); this.unitGfx.lineTo(x+r*0.9, y+r*0.5); this.unitGfx.strokePath();
      } else if (def.shape === 'battery') {
        // Coastal Battery: fortified emplacement — octagon + gun barrel
        const bs = r * 0.85;
        this.unitGfx.fillRect(x-bs, y-bs*0.7, bs*2, bs*1.4);
        this.unitGfx.lineStyle(3, 0x000000, alpha); this.unitGfx.strokeRect(x-bs, y-bs*0.7, bs*2, bs*1.4);
        // Gun barrel pointing right
        this.unitGfx.lineStyle(4, 0x333333, alpha);
        this.unitGfx.beginPath(); this.unitGfx.moveTo(x, y); this.unitGfx.lineTo(x+r*1.5, y); this.unitGfx.strokePath();
        // Muzzle
        this.unitGfx.fillStyle(0x333333, alpha); this.unitGfx.fillCircle(x+r*1.5, y, 3);
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
  // Call at turn start to lock in fog for the planning phase
  _freezeFog() {
    this._currentFog = computeFog(this.gameState, this.gameState.currentPlayer, this.mapSize, this.terrain);
  }

  _redrawFog() {
    // RenderTexture approach: fill entire map black, then erase visible hexes.
    // O(visible) erase calls vs O(mapSize²) fill calls — critical for 120×120+ maps.
    //
    // IMPORTANT: RenderTexture draw/erase coords are in RT-LOCAL space, not world space.
    // The RT is positioned at (fogRT.x, fogRT.y) in world space.
    // All hex world coords must be offset by (-fogRT.x, -fogRT.y) when drawing into the RT.
    this.fogRT.clear();

    const fog = this._currentFog || computeFog(this.gameState, this.gameState.currentPlayer, this.mapSize, this.terrain);

    // Fill entire RT black (fog) — in local coordinates, so always (0,0,w,h)
    const fillGfx = this.make.graphics({ add: false });
    fillGfx.fillStyle(0x000000, 0.65);
    fillGfx.fillRect(0, 0, this.fogRT.width, this.fogRT.height);
    this.fogRT.draw(fillGfx, 0, 0);
    fillGfx.destroy();

    if (fog.size === 0) return;

    // Erase (punch out) visible hexes — offset world coords into RT-local space
    const ox = this.fogRT.x, oy = this.fogRT.y;
    const eraseGfx = this.make.graphics({ add: false });
    eraseGfx.fillStyle(0xffffff, 1);
    for (const key of fog) {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToWorld(q, r);
      const verts = hexVertices(x - ox, y - oy); // shift into RT-local space
      eraseGfx.beginPath();
      eraseGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) eraseGfx.lineTo(verts[i].x, verts[i].y);
      eraseGfx.closePath();
      eraseGfx.fillPath();
    }
    this.fogRT.erase(eraseGfx, 0, 0);
    eraseGfx.destroy();
  }

  // ── Top bar ───────────────────────────────────────────────────────────────
  _createTopBar() {
    const w = this.scale.width;
    const D = 100;

    // Background
    this.topBarBg = this.add.rectangle(w/2, 22, w, 44, 0x111111, 0.92)
      .setScrollFactor(0).setDepth(D);

    // Back to menu button (leftmost)
    this.btnMenu = this._makeBtn(12, 11, '← MENU', 0x333333, () => this.scene.start('MenuScene'), D);

    // Resource cells — positioned right of menu button
    this.resIron = this._makeLabel(110, 11, '⚙ —', D);
    this.resOil  = this._makeLabel(230, 11, '🛢 —', D);

    // Version tag (right of oil, subtle)
    this.add.text(340, 11, GAME_VERSION, {
      font: '11px monospace', fill: '#445566', backgroundColor: '#111111', padding: { x: 4, y: 4 }
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D);

    this.turnLbl = this._makeLabel(w/2, 11, 'Turn 1 | Player 1 | PLANNING', D, true);

    // Settings gear button
    this.btnSettings = this._makeBtn(w - 160, 11, '⚙ Settings', 0x333355, () => this._toggleSettings(), D, 'right');

    // Submit button (always visible in top-right)
    this.btnSubmit = this._makeBtn(w - 10, 11, 'END TURN', 0x226622, () => this._onSubmit(), D, 'right');
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

    // Right: action buttons background (buttons rebuilt dynamically in _updateBottomPanel)
    this.actionBg = this.add.rectangle(w - 200, h - panH/2, 390, panH, 0x111111, 0.92)
      .setStrokeStyle(1, 0x444444).setScrollFactor(0).setDepth(D);

    this._dynBtns = [];
    this._contextMenuUnit = null;
  }

  _makeActionBtn(x, y, label, color, cb) {
    const w = 118, h = 42;
    const btn = this.add.text(x, y, label, {
      font: 'bold 13px monospace', fill: '#ffffff',
      backgroundColor: `#${color.toString(16).padStart(6,'0')}`,
      padding: { x: 0, y: 0 }, fixedWidth: w, fixedHeight: h, align: 'center'
    }).setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      this._contextMenuClicked = true; // prevent pointerup from firing _onHexClick
      cb();
    });
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
      // Own units: show custom design name if applicable; enemy: chassis type only (no deception)
      const isOwnUnit = u.owner === gs.currentPlayer;
      const displayName = isOwnUnit && u.designId !== undefined
        ? (gs.designs[u.owner]?.find(d => d.id === u.designId)?.name || def.name)
        : def.name;
      const nameLabel = isOwnUnit && u.designId !== undefined ? `★ ${displayName}` : `[ ${displayName} ]`;
      this.unitNameTxt.setText(`${nameLabel}  P${u.owner}`);
      this.unitStatsTxt.setText(`HP: ${u.health}/${u.maxHealth}  SA: ${def.soft_attack}  HA: ${def.hard_attack}  AP: ${def.pierce}  ARM: ${def.armor}  MOV: ${def.move}  RNG: ${def.range}`);
      const pa = gs.pendingAttacks[u.id];
      let status = '';
      status += u.suppressed ? '⚡ SUPPRESSED  ' : u.moved ? '✓ Moved  ' : '○ Can move  ';
      status += pa         ? '⚔ Attack queued  ' : u.attacked ? '✓ Attacked  ' : u.suppressed ? '' : '○ Can attack  ';
      if (u.dugIn) status += '🪖 Dug in';
      this.unitStatusTxt.setText(status);
    } else if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r, this.mapSize)) {
      const key  = `${this.hoveredHex.q},${this.hoveredHex.r}`;
      const t    = TERRAIN_LABELS[this.terrain[key]] || 'Plains';
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

    // Rebuild dynamic action buttons from _getUnitActions
    this._dynBtns.forEach(b => { try { b.destroy(); } catch(e){} });
    this._dynBtns = [];

    if (canAct) {
      const w2 = this.scale.width, h2 = this.scale.height;
      const panH2 = 120;
      const bw = 118, bh = 42, gap = 4;
      const ax = w2 - 390, ay = h2 - panH2 + 8;
      const actions = this._getUnitActions(u);
      const maxBtns = 6;
      const shown   = actions.slice(0, maxBtns);
      shown.forEach((a, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const btn = this._makeActionBtn(
          ax + col * (bw + gap),
          ay + row * (bh + gap),
          a.label,
          a.color,
          a.enabled ? a.cb : () => {}
        );
        if (!a.enabled) btn.setAlpha(0.4);
        this._uiLayer.add(btn);
        this._dynBtns.push(btn);
      });
    }
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
    let designName = ''; // set by player; defaults to chassis name on register

    const objs = [];
    const rebuild = () => {
      for (const o of objs) o.destroy();
      objs.length = 0;
      this._renderDesignPanel(building, validChassis, selectedChassis, selectedModules, p, objs, designName,
        (chassis) => { selectedChassis = chassis; selectedModules = new Set(); rebuild(); },
        (modKey)  => { selectedModules.has(modKey) ? selectedModules.delete(modKey) : selectedModules.add(modKey); rebuild(); },
        () => {
          // Open name prompt before registering
          const chassis = selectedChassis;
          const defaultName = `${UNIT_TYPES[chassis].name} Mk.${gs.designs[p].length + 1}`;
          const entered = window.prompt(`Name this design (your eyes only):\n(Enemy sees only chassis type: "${UNIT_TYPES[chassis].name}")`, designName || defaultName);
          if (entered === null) return; // cancelled
          designName = entered.trim() || defaultName;
          const modules = [...selectedModules];
          const cost = designRegistrationCost(modules);
          if (gs.players[p].iron < cost.iron) return;
          if (gs.players[p].oil  < cost.oil)  return;
          if (gs.designs[p].length >= MAX_DESIGNS_PER_PLAYER) return;
          const result = registerDesign(gs, p, chassis, modules, designName);
          if (result.ok) {
            this._pushLog(`P${p} registered design: "${designName}"`);
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

  _renderDesignPanel(building, validChassis, selectedChassis, selectedModules, player, objs, designName, onChassis, onModule, onConfirm, onClose) {
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
    const nameDisplay = designName || (selectedChassis ? `${UNIT_TYPES[selectedChassis].name} Mk.${gs.designs[player].length + 1}` : 'New Design');
    line(`Name: "${nameDisplay}"  (set on Register)`, '#ffdd88');
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

    const confirmBtn = this.add.text(w/2 - 70, y, '[ NAME & REGISTER ]', {
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
        if (isValid(hex.q, hex.r, this.mapSize)) {
          if (!this.hoveredHex || this.hoveredHex.q !== hex.q || this.hoveredHex.r !== hex.r) {
            this.hoveredHex = hex; this._redrawHighlights(); this._updateBottomPanel();
          }
        } else if (this.hoveredHex) { this.hoveredHex = null; this._redrawHighlights(); }
      }
    });

    this.input.on('pointerup', (ptr) => {
      if (ptr.button === 0 && !this._isDragging && !this._panelOpenAtMouseDown && !this._contextMenuClicked) {
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex   = worldToHex(world.x, world.y);
        // Also capture click pos so auto-menus can anchor here
        this._lastClickPos = { x: ptr.x, y: ptr.y };
        if (isValid(hex.q, hex.r, this.mapSize)) this._onHexClick(hex.q, hex.r);
      }
      this._contextMenuClicked = false;
      if (ptr.button === 2 && !this._isDragging) {
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex   = worldToHex(world.x, world.y);
        if (isValid(hex.q, hex.r, this.mapSize)) {
          this._menuAnchor = { x: ptr.x, y: ptr.y }; // remember cursor pos for menu placement
          this._onHexRightClick(hex.q, hex.r);
        }
      }
      this._isDragging = false;
    });

    // Suppress browser context menu so right-click works in-game
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.input.on('wheel', (ptr, _o, _dx, dy) => {
      const zs = this.settings.zoomSpeed ?? 1.0; // 1.0 = default, <1 = slower, >1 = faster
      const inFactor  = 1 - (1 - 0.85) * zs;   // zoom-out step scaled by speed
      const outFactor = 1 + (1.18 - 1)  * zs;   // zoom-in step scaled by speed
      const factor = dy > 0 ? inFactor : outFactor;
      const newZoom = Phaser.Math.Clamp(cam.zoom * factor, 0.2, 4.0);
      const wBefore = cam.getWorldPoint(ptr.x, ptr.y);
      cam.setZoom(newZoom);
      const wAfter = cam.getWorldPoint(ptr.x, ptr.y);
      cam.scrollX += wBefore.x - wAfter.x;
      cam.scrollY += wBefore.y - wAfter.y;
    });

    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.input.keyboard.on('keydown-ESC',   () => this._toggleSettings());
    this.input.keyboard.on('keydown-X',     () => { if (this.btnSubmit?.visible) this._onSubmit(); });
    this.input.keyboard.on('keydown-SPACE', () => { if (this._splashDismiss) { this._splashDismiss(); this._splashDismiss = null; } });
  }

  // ── World → Screen coordinate conversion ─────────────────────────────────
  _worldToScreen(wx, wy) {
    const cam = this.cameras.main;
    return {
      x: (wx - cam.scrollX) * cam.zoom + cam.x,
      y: (wy - cam.scrollY) * cam.zoom + cam.y,
    };
  }

  // ── Smart build shortcut ──────────────────────────────────────────────────
  // Returns {label, enabled, cb} for the single most obvious build action at
  // the engineer's current hex, or null if no clear winner (→ show submenu).
  _getSmartBuild(unit) {
    const gs = this.gameState, p = gs.currentPlayer;
    const existingB = buildingAt(gs, unit.q, unit.r);
    const noBuilding = !existingB || existingB.type === 'ROAD';
    const res = gs.resourceHexes[`${unit.q},${unit.r}`];
    const iron = gs.players[p].iron, oil = gs.players[p].oil;

    // Priority 1: resource hex with no building → Mine / Oil Pump
    if (res && noBuilding) {
      if (res.type === 'OIL') {
        const ok = iron >= 4 && oil >= 2;
        return { label: `OIL PUMP  4⚙ 2🛢`, enabled: ok, cb: () => this._onBuildMine('OIL') };
      } else {
        const ok = iron >= 4;
        return { label: `MINE      4⚙`, enabled: ok, cb: () => this._onBuildMine(res.type) };
      }
    }
    // Priority 2: no road on this hex → Road
    if (!roadAt(gs, unit.q, unit.r) && noBuilding) {
      return { label: `ROAD      1⚙`, enabled: iron >= 1, cb: () => this._onBuildRoad() };
    }
    return null; // no obvious single option → show full submenu
  }

  // ── Unit action framework ─────────────────────────────────────────────────
  // Returns array of {label, key, enabled, color, cb} for the selected unit.
  // Add special abilities here when ready — just push to the array.
  _isCoastalHex(q, r) {
    // Coast = land hex adjacent to ocean/shallow water
    const t = this.terrain[`${q},${r}`] ?? 0;
    if (t === 4 || t === 5) return false; // building must be on land
    const N = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
    return N.some(([dq, dr]) => {
      const nq = q + dq, nr = r + dr;
      if (!isValid(nq, nr, this.mapSize)) return false;
      const nt = this.terrain[`${nq},${nr}`] ?? 0;
      return nt === 4 || nt === 5;
    });
  }

  _getUnitActions(unit) {
    const gs   = this.gameState;
    const def  = UNIT_TYPES[unit.type];
    const actions = [];
    const isImmobile = def.immobile || unit.immobile;

    if (!unit.moved && !unit.suppressed && !isImmobile) {
      actions.push({ label: 'MOVE',   key: 'move',   enabled: true,  color: 0x1a5c8a, cb: () => this._onMoveMode() });
    }

    // Transport: LOAD (board adjacent land units) / UNLOAD (disembark to adjacent hex)
    if (def.capacity) {
      const cargo = unit.cargo || [];
      const cap = def.capacity;
      const maxLoad = cap.infantry + cap.vehicle;
      if (cargo.length < maxLoad) {
        actions.push({ label: `LOAD UNIT (${cargo.length}/${maxLoad})`, key: 'load', enabled: true, color: 0x336699,
          cb: () => this._enterLoadMode(unit) });
      }
      if (cargo.length > 0) {
        actions.push({ label: `UNLOAD (${cargo.length})`, key: 'unload', enabled: true, color: 0x226644,
          cb: () => this._enterUnloadMode(unit) });
      }
    }
    if (!unit.attacked && !unit.suppressed && def.attack > 0) {
      const visibleEnemies = getAttackableHexes(gs, unit, unit.q, unit.r, this._currentFog);
      const hasRange = def.range > 0;
      // ATTACK — only if confirmed visible enemy in range (direct fire, no penalty)
      if (visibleEnemies.length > 0) {
        actions.push({ label: 'ATTACK', key: 'attack', enabled: true, color: 0x882222,
          cb: () => this._onDirectAttackMode() });
      }
      // FIRE AT TILE — always available (blind fire, accuracy debuff, shows full range)
      if (hasRange) {
        actions.push({ label: 'FIRE AT TILE', key: 'fire_tile', enabled: true, color: 0x663311,
          cb: () => this._onAttackMode() });
      }
    }
    if (def.canDigIn && !unit.dugIn && !unit.moved) {
      actions.push({ label: 'DIG IN', key: 'digin',  enabled: true,  color: 0x8B5A2B, cb: () => this._onDigIn() });
    }
    if (unit.roadOrder) {
      actions.push({ label: '✕ CANCEL ROAD ORDER', key: 'cancel_road', enabled: true, color: 0x662222,
        cb: () => { delete unit.roadOrder; this._hideContextMenu(); this._refresh(); }
      });
    }
    // Auto-move standing order
    if (unit.moveOrder) {
      actions.push({ label: '✕ CANCEL MOVE ORDER', key: 'cancel_move_order', enabled: true, color: 0x334466,
        cb: () => { delete unit.moveOrder; this._hideContextMenu(); this._refresh(); }
      });
    } else if (!unit.moved) {
      actions.push({ label: '📍 SET MOVE ORDER', key: 'move_order', enabled: true, color: 0x224466,
        cb: () => this._enterMoveOrderMode(unit)
      });
    }
    if (def.canBuild) {
      const smart = this._getSmartBuild(unit);
      if (smart) {
        // Promote the obvious action directly into the root menu
        actions.push({ label: smart.label, key: 'build', enabled: smart.enabled, color: 0x2a6644,
          cb: () => { if (smart.enabled) { this._hideContextMenu(); smart.cb(); } }
        });
        // Still offer the full submenu below it for other options
        actions.push({ label: 'BUILD ▸', key: 'build_more', enabled: true, color: 0x224433,
          cb: () => this._showContextMenu(unit, 'build', 0)
        });
      } else {
        actions.push({ label: 'BUILD ▸', key: 'build', enabled: true, color: 0x335533,
          cb: () => this._showContextMenu(unit, 'build', 0)
        });
      }
    }
    if (def.canHeal) {
      actions.push({ label: 'HEAL',   key: 'heal',   enabled: true,  color: 0x229944, cb: () => {} }); // passive — shows status
    }
    // Engineer (or any unit) standing on a building with canRecruit: show USE BUILDING button
    if (def.canBuild) {
      const bldg = buildingAt(gs, unit.q, unit.r);
      if (bldg && bldg.owner === gs.currentPlayer && bldg.type !== 'ROAD' &&
          BUILDING_TYPES[bldg.type].canRecruit.length > 0) {
        actions.push({ label: `USE ${BUILDING_TYPES[bldg.type].name.toUpperCase()} ▸`, key: 'use_building', enabled: true, color: 0x225577,
          cb: () => { this._clearSelection(); this._showRecruitPanel(bldg); }
        });
      }
    }
    // Hook: special abilities (future — unit.abilities array)
    // (unit.abilities || []).forEach(ab => actions.push({ label: ab.name, key: ab.key, enabled: ab.canUse(gs, unit), color: 0x664488, cb: () => ab.use(gs, unit) }));
    // Undo move — only if moved but not yet attacked
    if (unit.moved && !unit.attacked && unit._origQ !== undefined) {
      actions.push({ label: '↩ UNDO MOVE', key: 'undo', enabled: true, color: 0x554422, cb: () => this._onUndoMove() });
    }
    actions.push({ label: 'WAIT',   key: 'wait',   enabled: true,  color: 0x444444, cb: () => this._clearSelection() });

    return actions;
  }

  // ── Unified context menu (root actions + submenus with pagination) ─────────
  // submenu: 'root' | 'build'   page: 0-based page index within that submenu
  _showContextMenu(unit, submenu = 'root', page = 0) {
    this._hideContextMenu();
    if (!this.settings.showContextMenu) return;

    const sw = this.scale.width, sh = this.scale.height;
    // Use stored cursor anchor (right-click origin); submenus reuse same anchor
    const anchor = this._menuAnchor || { x: sw / 2, y: sh / 2 };

    const PAGE_SIZE = 8;
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
      // Roads don't count as "a building" for placement purposes
      const existingBuilding = buildingAt(gs, unit.q, unit.r);
      const noBuilding = !existingBuilding || existingBuilding.type === 'ROAD';
      const res = gs.resourceHexes[`${unit.q},${unit.r}`];
      const iron = gs.players[p].iron, oil = gs.players[p].oil;
      const coastal = this._isCoastalHex(unit.q, unit.r);

      // All possible build options — add more here as the game grows
      const allOpts = [];
      if (!roadAt(gs, unit.q, unit.r))
        allOpts.push({ label: `Road        1⚙`,  cost: { iron:1,oil:0 }, enabled: iron>=1,  cb: () => this._onBuildRoad() });
      // Auto-road standing order (engineer pathfinds to destination, builds each turn)
      if (unit.roadOrder) {
        allOpts.push({ label: `✕ CANCEL ROAD ORDER`, cost: null, enabled: true, cb: () => { delete unit.roadOrder; this._hideContextMenu(); this._refresh(); } });
      } else {
        allOpts.push({ label: `AUTO-ROAD →`, cost: null, enabled: true, cb: () => this._enterRoadDestMode(unit) });
      }
      if (res && noBuilding)
        allOpts.push({ label: `${res.type==='OIL'?'Oil Pump   4⚙ 2🛢':'Mine        4⚙'}`,
                       cost: { iron:4,oil: res.type==='OIL'?2:0 }, enabled: res.type==='OIL'?(iron>=4&&oil>=2):iron>=4,
                       cb: () => this._onBuildMine(res.type) });
      // Land military buildings
      if (noBuilding) allOpts.push({ label: `Barracks    6⚙`,       cost:{iron:6,oil:0},  enabled: iron>=6,          cb: () => this._onBuildStructure('BARRACKS',6) });
      if (noBuilding) allOpts.push({ label: `Vehicle Depot 8⚙ 2🛢`, cost:{iron:8,oil:2},  enabled: iron>=8&&oil>=2,  cb: () => this._onBuildStructure('VEHICLE_DEPOT',8,2) });
      // Naval buildings (coastal land only)
      if (noBuilding) allOpts.push({ label: `Naval Yard  8⚙ 2🛢 ${coastal?'':'[COAST]'}`,   cost:{iron:8,oil:2},  enabled: coastal && iron>=8&&oil>=2,  cb: () => this._onBuildStructure('NAVAL_YARD',8,2) });
      if (noBuilding) allOpts.push({ label: `Harbor      5⚙ 1🛢 ${coastal?'':'[COAST]'}`,   cost:{iron:5,oil:1},  enabled: coastal && iron>=5&&oil>=1,  cb: () => this._onBuildStructure('HARBOR',5,1) });
      if (noBuilding) allOpts.push({ label: `Dry Dock   12⚙ 4🛢 ${coastal?'':'[COAST]'}`,   cost:{iron:12,oil:4}, enabled: coastal && iron>=12&&oil>=4, cb: () => this._onBuildStructure('DRY_DOCK',12,4) });
      if (noBuilding) allOpts.push({ label: `Naval Base 16⚙ 6🛢 ${coastal?'':'[COAST]'}`,   cost:{iron:16,oil:6}, enabled: coastal && iron>=16&&oil>=6, cb: () => this._onBuildStructure('NAVAL_BASE',16,6) });
      // Defensive structures
      if (noBuilding) allOpts.push({ label: `Bunker      5⚙`,       cost:{iron:5,oil:0},  enabled: iron>=5,          cb: () => this._onBuildStructure('BUNKER',5) });
      if (noBuilding) allOpts.push({ label: `Obs. Post   3⚙`,       cost:{iron:3,oil:0},  enabled: iron>=3,          cb: () => this._onBuildStructure('OBS_POST',3) });
      // Coastal Battery — spawns as immobile unit (no building on hex required)
      allOpts.push({ label: `Coast. Battery 6⚙ 1🛢`, cost:{iron:6,oil:1}, enabled: iron>=6&&oil>=1, cb: () => this._onBuildCoastalBattery() });
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

    // ── Position menu at cursor, clamped to screen ───────────────────────────
    const rowCount = items.length + (title ? 1 : 0);
    const menuH = rowCount * (btnH + gap);
    // Start just right of cursor; flip left if near right edge
    let px = anchor.x + 12;
    if (px + btnW > sw - 10) px = anchor.x - btnW - 12;
    // Center vertically on cursor; clamp top/bottom
    let py = anchor.y - menuH / 2;
    if (py < 50) py = 50;
    if (py + menuH > sh - 130) py = sh - 130 - menuH;

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
        btn.on('pointerdown', () => {
          this._contextMenuClicked = true; // prevent pointerup from firing _onHexClick
          this._hideContextMenu();
          item.cb();
        });
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

    const bg = this.add.rectangle(w/2, h/2, panelW, 330, 0x111122, 0.97)
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

    // Zoom speed control
    const zy = h/2 + 68;
    objs.push(this.add.text(w/2 - 140, zy, 'Scroll zoom speed', { font: '12px monospace', fill: '#cccccc' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(D+1));
    const zoomSteps = [0.5, 0.75, 1.0, 1.5, 2.0];
    const zoomLabels = ['Slow', 'Slow+', 'Default', 'Fast', 'Fast+'];
    const makeZoom = () => {
      if (this._zoomBtns) this._zoomBtns.forEach(b => b.destroy());
      this._zoomBtns = [];
      zoomSteps.forEach((spd, i) => {
        const active = Math.abs(this.settings.zoomSpeed - spd) < 0.01;
        const bx = w/2 - 80 + i * 46;
        const zb = this.add.text(bx, zy + 22, zoomLabels[i], {
          font: '10px monospace', fill: active ? '#ffee44' : '#888888',
          backgroundColor: active ? '#443300' : '#222222', padding: { x: 5, y: 4 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
        zb.on('pointerdown', () => { this.settings.zoomSpeed = spd; makeZoom(); });
        this._zoomBtns.push(zb);
        objs.push(zb);
        this._addToUI([zb]);
      });
    };
    makeZoom();

    const closeBtn = this.add.text(w/2, h/2 + 130, '[ CLOSE ]', {
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

    // ── Transport load mode ──────────────────────────────────────────────
    if (this.mode === 'transport_load') {
      const transport = this._transportUnit;
      if (transport && clickedUnit && clickedUnit.owner === gs.currentPlayer && clickedUnit !== transport) {
        const dist = hexDistance(transport.q, transport.r, q, r);
        if (dist <= 1) {
          if (!transport.cargo) transport.cargo = [];
          const def = UNIT_TYPES[transport.type];
          const cap = def.capacity;
          // Check capacity: count infantry vs vehicles in cargo
          const loadedInf = (transport.cargo || []).filter(id => {
            const u2 = gs.units.find(u => u.id === id);
            return u2 && !NAVAL_UNITS.has(u2.type) && !['TANK','ARTILLERY','ANTI_TANK','VEHICLE_DEPOT'].includes(u2.type);
          }).length;
          const loadedVeh = transport.cargo.length - loadedInf;
          const isVehicle = ['TANK','ARTILLERY','ANTI_TANK'].includes(clickedUnit.type);
          const ok = isVehicle ? loadedVeh < cap.vehicle : loadedInf < cap.infantry;
          if (ok) {
            transport.cargo.push(clickedUnit.id);
            clickedUnit.embarked = true; // hidden from map
          }
        }
      }
      this._cancelTransportMode();
      return;
    }

    // ── Transport unload mode ────────────────────────────────────────────
    if (this.mode === 'transport_unload') {
      const transport = this._transportUnit;
      if (transport && transport.cargo && transport.cargo.length > 0) {
        const dist = hexDistance(transport.q, transport.r, q, r);
        if (dist <= 1) {
          const ttype = this.terrain[`${q},${r}`] ?? 0;
          // Can only disembark on land/sand
          if (ttype <= 3 || ttype === 6) {
            // Unload first cargo unit to clicked hex (if empty)
            if (!unitAt(gs, q, r)) {
              const unitId = transport.cargo.shift();
              const cargoUnit = gs.units.find(u => u.id === unitId);
              if (cargoUnit) {
                cargoUnit.q = q; cargoUnit.r = r;
                cargoUnit.embarked = false;
                cargoUnit.moved = true; // used its move this turn
              }
            }
          }
        }
      }
      this._cancelTransportMode();
      return;
    }

    // ── Auto-move destination mode ────────────────────────────────────────
    if (this.mode === 'move_order') {
      const unit = this._moveOrderUnit;
      if (unit) {
        const path = findPath(this.terrain, this.mapSize, unit.q, unit.r, q, r, unit.type);
        if (path && path.length > 0) {
          unit.moveOrder = { destQ: q, destR: r, path };
        } else {
          console.log(`Auto-move: no path from (${unit.q},${unit.r}) to (${q},${r})`);
        }
      }
      this._cancelMoveOrderMode();
      return;
    }

    // ── Auto-road destination mode ───────────────────────────────────────
    if (this.mode === 'road_dest') {
      const unit = this._roadOrderUnit;
      if (unit) {
        const path = findPath(this.terrain, this.mapSize, unit.q, unit.r, q, r, 'ENGINEER');
        if (path && path.length > 0) {
          unit.roadOrder = { destQ: q, destR: r, path };
        } else {
          // Show brief "no path" feedback — just log; could add toast later
          console.log(`Auto-road: no path from (${unit.q},${unit.r}) to (${q},${r})`);
        }
      }
      this._cancelRoadDestMode();
      return;
    }

    if (this.mode === 'move') {
      const isReachable = this.reachable.some(h => h.q === q && h.r === r);
      // Allow move if hex is reachable and has no unit (or only the unit itself)
      const hexFree = !clickedUnit || clickedUnit.id === this.selectedUnit?.id;
      if (isReachable && hexFree) {
        // IGOUGO: movement is immediate. Save _origQ/_origR for undo only (not used in combat).
        this.selectedUnit._origQ = this.selectedUnit.q;
        this.selectedUnit._origR = this.selectedUnit.r;
        // Do NOT add to pendingMoves — position is real immediately
        this.selectedUnit.q = q; this.selectedUnit.r = r; this.selectedUnit.moved = true;
        // After move: stay in select mode. Unit remains selected.
        // Player clicks an enemy directly to attack (Civ-style) — no auto attack mode.
        this.reachable = [];
        this.attackable = getAttackableHexes(gs, this.selectedUnit, q, r, this._currentFog);
        this.mode = 'select';
        // Engineers: auto-open build menu after moving (if setting enabled)
        this._refresh();
        // Engineer auto-build: pop open the build submenu after moving
        if (UNIT_TYPES[this.selectedUnit.type].canBuild && this.settings.engineerAutoBuild) {
          // Anchor to where the player clicked to move the engineer
          this._menuAnchor = this._lastClickPos || this._menuAnchor || { x: this.scale.width/2, y: this.scale.height/2 };
          this._showContextMenu(this.selectedUnit, 'build', 0);
        }
        return;
      }
      // In move mode: clicking a visible enemy in range = quick direct fire
      if (clickedUnit && clickedUnit.owner !== gs.currentPlayer && !this.selectedUnit.attacked) {
        const range = UNIT_TYPES[this.selectedUnit.type].range;
        if (hexDistance(this.selectedUnit.q, this.selectedUnit.r, q, r) <= range) {
          this._showCombatPreview(this.selectedUnit, clickedUnit, false);
          return;
        }
      }
    }

    // Direct attack mode — only valid enemy hexes, no blind fire penalty
    if (this.mode === 'attack_direct') {
      const target = this.attackable.find(h => h.q === q && h.r === r);
      if (target) {
        const tUnit = gs.units.find(u => u.id === target.targetId);
        if (tUnit) this._showCombatPreview(this.selectedUnit, tUnit, false);
        return;
      }
    }

    if (this.mode === 'attack') {
      const inRange = this.attackable.find(h => h.q === q && h.r === r);
      if (inRange) {
        const blindTarget = gs.units.find(u => u.q === q && u.r === r && u.owner !== gs.currentPlayer);
        if (blindTarget) {
          this._showCombatPreview(this.selectedUnit, blindTarget, true);
        } else {
          this.selectedUnit.attacked = true;
          this.reachable = []; this.attackable = []; this.mode = 'select';
          this._refresh();
        }
        return;
      }
    }

    // Click on attack-indicator enemy target (works in select/move mode — direct fire shortcut)
    if (this.selectedUnit && !this.selectedUnit.attacked && !this.selectedUnit.suppressed) {
      const attackTarget = this.attackable.find(h => h.q === q && h.r === r);
      if (attackTarget && clickedUnit && clickedUnit.owner !== gs.currentPlayer) {
        this._showCombatPreview(this.selectedUnit, clickedUnit, false);
        return;
      }
    }

    // Own unit on hex? Always select unit first (even if building is also there)
    if (clickedUnit && clickedUnit.owner === gs.currentPlayer) {
      this._selectUnit(clickedUnit);
      return;
    }

    // Recruitment: click own building (no unit present)
    if (clickedBuilding && clickedBuilding.owner === gs.currentPlayer &&
        clickedBuilding.type !== 'ROAD' && BUILDING_TYPES[clickedBuilding.type].canRecruit.length > 0) {
      this._showRecruitPanel(clickedBuilding);
      return;
    }

    this._clearSelection();
  }

  _selectUnit(unit) {
    this._hideContextMenu();
    this.selectedUnit = unit;
    const gs = this.gameState;
    const isImmobile = UNIT_TYPES[unit.type]?.immobile || unit.immobile;
    if (!unit.moved && !isImmobile) {
      this.reachable  = getReachableHexes(gs, unit, this.terrain, this.mapSize);
      this.mode = 'move';
    } else {
      this.reachable  = [];
      this.mode = 'select';
    }
    // Always show attackable targets (fog-filtered) as clickable indicators on enemies
    if (!unit.attacked && !unit.suppressed && UNIT_TYPES[unit.type].attack > 0) {
      this.attackable = getAttackableHexes(gs, unit, unit.q, unit.r, this._currentFog);
    } else {
      this.attackable = [];
    }
    this._refresh();
  }

  // Right-click: open context menu when clicking ON a friendly unit; deselect everywhere else
  _onHexRightClick(q, r) {
    // Cancel special modes on right-click
    if (this.mode === 'road_dest') { this._cancelRoadDestMode(); return; }
    if (this.mode === 'move_order') { this._cancelMoveOrderMode(); return; }
    if (this.mode === 'transport_load' || this.mode === 'transport_unload') { this._cancelTransportMode(); return; }
    const gs = this.gameState;
    const clickedUnit = gs.units.find(u => u.q === q && u.r === r && !u.dead);
    if (clickedUnit && clickedUnit.owner === gs.currentPlayer) {
      // Right-clicked directly on own unit → select + show action menu
      if (this.selectedUnit !== clickedUnit) this._selectUnit(clickedUnit);
      this._showContextMenu(clickedUnit);
    } else {
      // Right-clicked on empty hex or enemy → deselect
      this._clearSelection();
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
    this.reachable  = getReachableHexes(this.gameState, this.selectedUnit, this.terrain, this.mapSize);
    this.attackable = [];
    this._refresh();
  }

  // Direct attack — only visible enemies, no blind fire penalty
  _onDirectAttackMode() {
    if (!this.selectedUnit || this.selectedUnit.attacked) return;
    this.mode = 'attack_direct';
    this.reachable  = [];
    this.attackable = getAttackableHexes(this.gameState, this.selectedUnit, this.selectedUnit.q, this.selectedUnit.r, this._currentFog);
    this._refresh();
  }

  // Blind fire — full tile range, applies accuracy debuff on resolution
  _onAttackMode() {
    if (!this.selectedUnit || this.selectedUnit.attacked) return;
    this.mode = 'attack';
    this.reachable  = [];
    this.attackable = getAttackRangeHexes(this.mapSize, this.selectedUnit, this.selectedUnit.q, this.selectedUnit.r, this.terrain);
    this._refresh();
  }

  _onUndoMove() {
    const u = this.selectedUnit, gs = this.gameState;
    if (!u || !u.moved || u.attacked || u._origQ === undefined) return;
    // Restore original position
    u.q = u._origQ; u.r = u._origR;
    u.moved = false;
    u.building = false;
    delete u._origQ; delete u._origR;
    u.attacked = false;
    this._clearSelection();
    this._redrawRoads(); // in case a road was staged
    this._refresh();
  }

  _onDigIn() {
    const u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canDigIn || u.dugIn || u.moved) return;
    u.dugIn = true; u.moved = true;
    this._clearSelection();
  }

  // ── Auto-move destination selection ──────────────────────────────────────
  _enterMoveOrderMode(unit) {
    this._hideContextMenu();
    this._moveOrderUnit = unit;
    this.mode = 'move_order';
    this._showHint('📍 Click destination for AUTO-MOVE order  (Right-click to cancel)');
    this._refresh();
  }

  _cancelMoveOrderMode() {
    this.mode = 'select';
    this._moveOrderUnit = null;
    this._clearHint();
    this._refresh();
  }

  // ── Auto-road destination selection ──────────────────────────────────────
  _enterRoadDestMode(unit) {
    this._hideContextMenu();
    this._roadOrderUnit = unit;
    this.mode = 'road_dest';
    // Show a HUD tip
    if (this._roadDestHint) { try { this._roadDestHint.destroy(); } catch(e){} }
    this._showHint('📍 Click destination for AUTO-ROAD order  (Right-click to cancel)');
    this._refresh();
  }

  _cancelRoadDestMode() {
    this.mode = 'select';
    this._roadOrderUnit = null;
    this._clearHint();
    this._refresh();
  }

  // ── Transport load/unload ─────────────────────────────────────────────────
  _enterLoadMode(transport) {
    this._hideContextMenu();
    this._transportUnit = transport;
    this.mode = 'transport_load';
    this._showHint('🚢 Click adjacent LAND UNIT to board  (Right-click to cancel)');
    this._refresh();
  }

  _enterUnloadMode(transport) {
    this._hideContextMenu();
    this._transportUnit = transport;
    this.mode = 'transport_unload';
    this._showHint('🚢 Click adjacent hex to disembark cargo  (Right-click to cancel)');
    this._refresh();
  }

  _showHint(text) {
    if (this._hintText) { try { this._hintText.destroy(); } catch(e){} }
    this._hintText = this.add.text(this.scale.width / 2, 80, text,
      { fontSize: '14px', color: '#ffdd88', backgroundColor: '#222', padding: { x:8, y:4 } })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);
    this._uiLayer.add(this._hintText);
  }

  _clearHint() {
    if (this._hintText) { try { this._hintText.destroy(); } catch(e){} this._hintText = null; }
    if (this._roadDestHint) { try { this._roadDestHint.destroy(); } catch(e){} this._roadDestHint = null; }
  }

  _cancelTransportMode() {
    this.mode = 'select';
    this._transportUnit = null;
    this._clearHint();
    this._refresh();
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

  _onBuildStructure(type, ironCost, oilCost = 0) {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (buildingAt(gs, u.q, u.r)) return;
    // Naval facilities must be on coastal land (adjacent to shallow/ocean)
    const NAVAL_FACILITIES = new Set(['NAVAL_YARD','HARBOR','DRY_DOCK','NAVAL_BASE']);
    if (NAVAL_FACILITIES.has(type) && !this._isCoastalHex(u.q, u.r)) {
      this._log.unshift('Build failed: naval facilities require a coastal hex');
      this._log = this._log.slice(0, 8);
      this._refresh();
      return;
    }
    if (gs.players[gs.currentPlayer].iron < ironCost) return;
    if (gs.players[gs.currentPlayer].oil  < oilCost)  return;
    gs.players[gs.currentPlayer].iron -= ironCost;
    gs.players[gs.currentPlayer].oil  -= oilCost;
    gs.buildings.push(createBuilding(type, gs.currentPlayer, u.q, u.r));
    u.moved = true; u.building = true;
    this._clearSelection();
    this._refresh();
  }

  _onBuildCoastalBattery() {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    const p = gs.currentPlayer;
    if (gs.players[p].iron < 6 || gs.players[p].oil < 1) return;
    gs.players[p].iron -= 6; gs.players[p].oil -= 1;
    const def = UNIT_TYPES['COASTAL_BATTERY'];
    // Assign ID using state counter (same pattern as createUnit)
    if (!gs._nextUnitId) gs._nextUnitId = Math.max(...gs.units.map(u2 => u2.id), ...gs.buildings.map(b => b.id), 0) + 1;
    const battery = {
      id: gs._nextUnitId++,
      type: 'COASTAL_BATTERY', owner: p,
      q: u.q, r: u.r,
      health: def.health, maxHealth: def.health,
      moved: true, attacked: false, dugIn: false, building: false, immobile: true,
    };
    gs.units.push(battery);
    u.moved = true; u.building = true;
    this._hideContextMenu();
    this._refresh();
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

  _showCombatPreview(attacker, target, blindFire) {
    const gs = this.gameState;
    const aDef = UNIT_TYPES[attacker.type];
    const tDef = UNIT_TYPES[target.type];
    const NAVAL_SET = new Set(['PATROL_BOAT','SUBMARINE','DESTROYER','CRUISER_LT','CRUISER_HV','BATTLESHIP','LANDING_CRAFT','TRANSPORT_SM','TRANSPORT_MD','TRANSPORT_LG']);
    const INDIRECT = new Set(['ARTILLERY','MORTAR']);
    const atkIsNaval = NAVAL_SET.has(attacker.type) || attacker.type==='COASTAL_BATTERY';
    const defIsNaval = NAVAL_SET.has(target.type);
    const tTerrain = (this.terrain[`${target.q},${target.r}`]) ?? 0;
    const tOnLand  = tTerrain <= 3 || tTerrain === 6;
    const navalVsNaval = atkIsNaval && defIsNaval;
    const navalVsLand  = atkIsNaval && tOnLand && !defIsNaval;
    const isArmored = tDef.armor > 2;
    let baseAtk = navalVsNaval ? aDef.hard_attack : (isArmored ? aDef.hard_attack : aDef.soft_attack);
    if (navalVsLand) baseAtk = Math.floor((aDef.naval_attack||1)*0.6);
    const pierceRatio = aDef.pierce < tDef.armor ? aDef.pierce/tDef.armor : 1;
    const pierceMod = Math.round((pierceRatio-0.5)*20);

    // Score breakdown (no random roll)
    const terrainMod = tTerrain===1?10:tTerrain===2?20:0;
    const dugInMod   = target.dugIn?8:0;
    const onBunker   = gs.buildings?.find(b=>b.type==='BUNKER'&&b.q===target.q&&b.r===target.r&&b.owner===target.owner);
    const bunkerMod  = onBunker?15:0;
    const blindMod   = blindFire?20:0;
    const baseScore  = 50;
    const preRollScore = Math.max(0, Math.min(100,
      baseScore + (aDef.accuracy||0) - (tDef.evasion||0)
      - terrainMod - dugInMod - bunkerMod - blindMod + pierceMod));
    const ROLL = 15; // ±15 random
    const scoreMin = Math.max(0, preRollScore - ROLL);
    const scoreMax = Math.min(100, preRollScore + ROLL);

    const tierAt = s => s<20?'Catastrophic Failure':s<40?'Repelled':s<60?'Neutral':s<80?'Effective':'Overwhelming';
    const dmgAt  = (s,ba,pr,def) => {
      if(s<20) return 0;
      if(s<40) return 0;
      if(s<60) return Math.max(0,Math.max(1,Math.round(ba*pr*0.5))-def);
      return Math.max(0,Math.max(1,Math.round(ba*pr))-def);
    };
    const tier   = tierAt(preRollScore);
    const tierLo = tierAt(scoreMin);
    const tierHi = tierAt(scoreMax);
    const expDmg = dmgAt(preRollScore, baseAtk, pierceRatio, tDef.defense||0);
    const maxDmg = dmgAt(scoreMax,     baseAtk, pierceRatio, tDef.defense||0);

    // Retaliation
    const dist = hexDistance(attacker.q,attacker.r,target.q,target.r);
    const subDiveBlock = tDef.noSurfaceRetaliation && !aDef.noSurfaceRetaliation;
    const canRet = !blindFire && !INDIRECT.has(attacker.type) && !subDiveBlock && dist<=(tDef.range||1) && !target.suppressed;
    let expRetDmg=0, retTier='';
    if (canRet) {
      const rBase = navalVsNaval ? tDef.hard_attack : ((aDef.armor>2)?tDef.hard_attack:tDef.soft_attack);
      const rPR   = tDef.pierce<aDef.armor ? tDef.pierce/aDef.armor : 1;
      const rPierceMod = Math.round((rPR-0.5)*20);
      const rScore = Math.max(0,Math.min(100, 50+(tDef.accuracy||0)-(aDef.evasion||0)+rPierceMod));
      expRetDmg = dmgAt(rScore,rBase,rPR,aDef.defense||0);
      retTier   = tierAt(rScore);
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    const TIER_COL={'Catastrophic Failure':'#ff4444','Repelled':'#ff8844','Neutral':'#cccccc','Effective':'#88ee44','Overwhelming':'#44ffcc'};
    const TIER_BG ={'Catastrophic Failure':0x4a0000,'Repelled':0x3a1800,'Neutral':0x1a1a1a,'Effective':0x0e2800,'Overwhelming':0x002a1a};
    const GLYPH={INFANTRY:'●',ENGINEER:'◆',RECON:'✶',TANK:'■',ARTILLERY:'▲',ANTI_TANK:'➤',MORTAR:'△',MEDIC:'✚',PATROL_BOAT:'◖',SUBMARINE:'▭',DESTROYER:'◉',CRUISER_LT:'⬒',CRUISER_HV:'⬓',BATTLESHIP:'⬔',LANDING_CRAFT:'⟂',TRANSPORT_SM:'◫',TRANSPORT_MD:'◫',TRANSPORT_LG:'◫',COASTAL_BATTERY:'▣'};
    const PC=[null,0x3366cc,0xcc3333];
    const sw=this.scale.width,sh=this.scale.height,cx=sw*0.5,cy=sh*0.5,D=210;
    const objs=[];

    const mk=(txt,x,y,col='#d0dde8',sz=12,bold=false,ox=0.5,oy=0.5)=>{
      const t=this.add.text(x,y,txt,{font:`${bold?'bold ':''}${sz}px monospace`,fill:col}).setOrigin(ox,oy).setScrollFactor(0).setDepth(D+1);
      objs.push(t);return t;
    };
    const bx=(x,y,w,h,fill,alpha=1,stroke=null)=>{
      const r=this.add.rectangle(x,y,w,h,fill,alpha).setDepth(D).setScrollFactor(0);
      if(stroke!==null)r.setStrokeStyle(1.5,stroke);objs.push(r);return r;
    };
    const hpBar=(x,y,bW,current,max,proj)=>{
      bx(x,y,bW,10,0x111111,1,0x334455);
      const f=Math.max(0,current)/Math.max(1,max);
      bx(x-bW/2+(bW*f)/2,y,bW*f,10,f>0.6?0x44bb44:f>0.3?0xddaa00:0xcc2222);
      const af=Math.max(0,current-proj)/Math.max(1,max);
      if(proj>0){const lw=bW*(f-af);bx(x-bW/2+bW*af+lw/2,y,lw,10,0x882222,0.7);}
    };

    const cW=Math.min(740,sw-24), cH=380;
    bx(cx,cy,sw,sh,0x000000,0.72);
    bx(cx,cy,cW,cH,0x0a0d12,0.98,0x2e3d50);

    // Header
    bx(cx,cy-cH/2+22,cW,44,0x0c1824,1,0x2e3d50);
    mk('⚔  ATTACK PREVIEW',cx-20,cy-cH/2+20,'#c8b87a',14,true,0.5,0.5);
    mk(blindFire?'BLIND FIRE':'',cx+cW/4,cy-cH/2+20,'#ff8844',10,true,0.5,0.5);
    mk('click ATTACK to confirm  ·  CANCEL to abort',cx,cy-cH/2+36,'#445566',9);

    // Unit portraits (top section)
    const pW=(cW-60)*0.38, pH=130, pY=cy-cH/2+56+pH/2;
    const lX=cx-cW/2+12+pW/2, rX=cx+cW/2-12-pW/2;
    const portrait=(pcx,pcy,type,owner,name,hp,maxHp,proj,role)=>{
      bx(pcx,pcy,pW,pH,0x0f151c,1,PC[owner]||0x445566);
      bx(pcx,pcy-pH/2+11,pW,22,owner===1?0x1a2a44:0x3a1414,1);
      mk(role,pcx,pcy-pH/2+11,role==='ATTACKER'?'#5588ee':'#ee5544',10,true);
      mk(GLYPH[type]||'◌',pcx,pcy-16,PC[owner]?'#'+PC[owner].toString(16).padStart(6,'0'):'#aaa',36,true);
      mk(name,pcx,pcy+22,'#dde8f0',11,true);
      hpBar(pcx,pcy+42,pW-16,hp,maxHp,proj);
      mk(`HP ${hp}/${maxHp} → ${Math.max(0,hp-proj)}${proj>0?' (−'+proj+')':''}`,pcx,pcy+56,proj>0?'#ff8888':hp<maxHp?'#ddaa44':'#77cc77',9);
    };
    portrait(lX,pY,attacker.type,attacker.owner,aDef.name,attacker.health,attacker.maxHealth||aDef.health,expRetDmg,'ATTACKER');
    portrait(rX,pY,target.type,target.owner,tDef.name,target.health,target.maxHealth||tDef.health,expDmg,'DEFENDER');

    // Center VS + attack str
    mk('VS',cx,pY-30,'#2a3a4a',14,true);
    mk(`${baseAtk}`,cx,pY-8,'#e8d090',20,true);
    mk('ATK STR',cx,pY+14,'#556677',9);

    // ── Score breakdown panel ─────────────────────────────────────────────────
    const sbY = cy-cH/2+56+pH+14;
    const sbH = 108;
    bx(cx, sbY+sbH/2, cW-16, sbH, 0x080c10, 0.95, 0x1e2d3a);
    mk('SCORE BREAKDOWN', cx, sbY+6, '#6688aa', 10, true, 0.5, 0);

    // Build modifier rows
    const rows = [
      ['Base score',        `${baseScore}`, '#778899'],
    ];
    if (aDef.accuracy)   rows.push([`Accuracy (${aDef.name})`,      `+${aDef.accuracy}`, '#88cc88']);
    if (tDef.evasion)    rows.push([`Evasion (${tDef.name})`,       `−${tDef.evasion}`,  '#cc8844']);
    if (terrainMod)      rows.push([`Terrain cover`,                 `−${terrainMod}`,    '#aa7744']);
    if (dugInMod)        rows.push([`Dug-in fortification`,          `−${dugInMod}`,      '#aa7744']);
    if (bunkerMod)       rows.push([`Bunker protection`,             `−${bunkerMod}`,     '#aa7744']);
    if (blindMod)        rows.push([`Blind fire penalty`,            `−${blindMod}`,      '#cc4444']);
    if (pierceMod !== 0) rows.push([`Pierce ${aDef.pierce} vs Armor ${tDef.armor}`, `${pierceMod>=0?'+':''}${pierceMod}`, pierceMod>=0?'#88cc88':'#cc8844']);
    rows.push([`Random roll`,                                        `±${ROLL}`,          '#7799aa']);

    // Two-column layout for rows
    const col1X=cx-cW/2+24, col2X=cx+10;
    const rH=14, rowStartY=sbY+20;
    rows.forEach((row,i)=>{
      const col = i<Math.ceil(rows.length/2)?0:1;
      const ri  = col===0?i:i-Math.ceil(rows.length/2);
      const rx  = col===0?col1X:col2X;
      const ry  = rowStartY+ri*rH;
      mk(`${row[0]}`, rx, ry, '#556677', 9, false, 0, 0);
      mk(row[1], rx+160, ry, row[2], 9, true, 0, 0);
    });
    // Score summary line
    mk(`Pre-roll score: ${preRollScore}  (range ${scoreMin}–${scoreMax})`, cx, sbY+sbH-10, '#aabbcc', 10, true, 0.5, 1);

    // ── Outcome band ──────────────────────────────────────────────────────────
    const outY = sbY + sbH + 6;
    bx(cx, outY+14, cW-16, 28, TIER_BG[tier]||0x1a1a1a, 1, 0x334455);
    const rangeStr = tierLo===tierHi ? tier : `${tierLo}  →  ${tier}  →  ${tierHi}`;
    mk(`Expected: ${rangeStr.toUpperCase()}  |  est. −${expDmg} to defender${canRet?`  ·  ↩ ret. −${expRetDmg}`:' · no retaliation'}`, cx, outY+14, TIER_COL[tier]||'#ccc', 10, true);

    // ── Buttons ───────────────────────────────────────────────────────────────
    const btnY = cy+cH/2-22;
    bx(cx, cy+cH/2-22, cW, 44, 0x080c10, 1, 0x2e3d50);
    const atkBtn=this.add.text(cx-80,btnY,'  ATTACK  ',{font:'bold 13px monospace',fill:'#ffffff',backgroundColor:'#992211',padding:{x:16,y:8}}).setOrigin(0.5,0.5).setScrollFactor(0).setDepth(D+2).setInteractive({useHandCursor:true});
    const canBtn=this.add.text(cx+80,btnY,'  CANCEL  ',{font:'bold 13px monospace',fill:'#aaaaaa',backgroundColor:'#1a1a2a',padding:{x:16,y:8}}).setOrigin(0.5,0.5).setScrollFactor(0).setDepth(D+2).setInteractive({useHandCursor:true});
    this._addToUI([...objs,atkBtn,canBtn]);

    const cleanup=()=>[...objs,atkBtn,canBtn].forEach(o=>{try{o.destroy();}catch(e){}});
    atkBtn.on('pointerdown',()=>{ this._contextMenuClicked=true; cleanup(); this._doImmediateAttack(attacker,target.id,blindFire); });
    canBtn.on('pointerdown',()=>{ this._contextMenuClicked=true; cleanup(); this._refresh(); });
    atkBtn.on('pointerover',()=>atkBtn.setStyle({fill:'#ffdddd'}));
    atkBtn.on('pointerout', ()=>atkBtn.setStyle({fill:'#ffffff'}));
  }

  _doImmediateAttack(attacker, targetId, blindFire) {
    // IGOUGO: resolve combat now, show card, refresh
    const gs = this.gameState;
    const target = gs.units.find(u => u.id === targetId);
    if (!target) return;
    const hpBefore = { atk: attacker.health, def: target.health };
    const log = resolveImmediateAttack(gs, attacker.id, targetId, blindFire);
    this.reachable = []; this.attackable = []; this.mode = 'select';
    // If attacker died from retaliation, clear selection
    const atkAlive = gs.units.find(u => u.id === attacker.id);
    if (!atkAlive) this.selectedUnit = null;
    this._refresh();
    // Show combat result card — dismiss on click or space after short delay
    if (log.length > 0) {
      const card = this._showCombatCard(log[0], 1, 1);
      const dismiss = () => {
        card.forEach(o => { try { o.destroy(); } catch(e){} });
        this._splashDismiss = null;
        this.input.off('pointerup', dismiss);
      };
      this._splashDismiss = dismiss;
      this.time.delayedCall(150, () => {
        this.input.on('pointerup', dismiss);
        this.input.keyboard?.once('keydown-SPACE', dismiss);
      });
    }
    const winner = checkWinner(gs);
    if (winner) { this._showResolution([], winner); }
  }

  _onSubmit() {
    // IGOUGO: end this player's turn (captures/income/spawns), then pass
    const gs = this.gameState;
    this._hideRecruitPanel();
    this._clearSelection();
    gs._mapSize = this.mapSize;
    const events = resolveEndOfTurn(gs, this.terrain);
    const winner = checkWinner(gs);
    if (winner) {
      this._showResolution([], winner);
      return;
    }
    this._freezeFog();
    this._showPassScreen(`Player ${gs.currentPlayer}'s turn — take the controls`);
  }

  // ── Animated resolution playback ──────────────────────────────────────────
  async _playResolutionAnimation() {
    const gs = this.gameState;
    
    this.btnSubmit?.setVisible(false);
    this._hideContextMenu();
    this._clearSelection();

    // Snapshot pre-resolve positions for animation
    const prePos = {};
    for (const u of gs.units) prePos[u.id] = { q: u.q, r: u.r };

    // Resolve everything (mutates state)
    gs._mapSize = this.mapSize; // needed by auto-road phase
    const events = resolveTurn(gs, this.terrain);
    const winner = checkWinner(gs);
    const finalUnits = gs.units;
    const playbackUnits = (gs._unitsAfterMoves || gs.units).map(u => ({ ...u }));

    // ── Phase 1: Animate moves ───────────────────────────────────────────────
    // Use explicit resolveTurn move log so movement always plays before combat,
    // even if movers later die in combat.
    const moveAnims = gs._lastMoveLog || [];

    if (moveAnims.length > 0) {
      // Flash "MOVES" banner
      const banner = this._makeBanner('⟶  MOVES RESOLVE');
      await this._wait(600);
      banner.destroy();

      const MOVE_COLORS = { 1: 0x4488ff, 2: 0xff4444 };
      const tweenPromises = moveAnims.map(m => new Promise(resolve => {
        const from = hexToWorld(m.from.q, m.from.r);
        const to   = hexToWorld(m.to.q, m.to.r);
        const dot  = this.add.circle(from.x, from.y, 10, MOVE_COLORS[m.owner] || 0xffffff, 0.9).setDepth(50);
        this.tweens.add({
          targets: dot, x: to.x, y: to.y, duration: 500, ease: 'Sine.easeInOut',
          onComplete: () => { dot.destroy(); resolve(); }
        });
      }));
      await Promise.all(tweenPromises);
      await this._wait(300);
      // Show post-move state BEFORE combat damage is revealed
      gs.units = playbackUnits;
      this._redrawUnits();
      await this._waitForAdvance('[ SPACE or CLICK → START COMBAT ]');
    }

    // ── Phase 2: Animate attacks ─────────────────────────────────────────────
    const combatLog = gs._lastCombatLog || [];
    if (combatLog.length > 0) {
      const banner = this._makeBanner('⚔  COMBAT RESOLVES — SPACE/CLICK TO STEP', 0x221100);
      await this._wait(600);
      banner.destroy();
      await this._wait(1000);

      // Ensure combat playback starts from post-move (pre-damage) snapshot.
      gs.units = playbackUnits;
      this._redrawUnits();

      const steps = combatLog.filter(e => e.type === 'combat' || e.type === 'miss' || e.type === 'blind_miss');
      for (let i = 0; i < steps.length; i++) {
        const entry = steps[i];
        const targetHex = entry.targetHex || entry.hex || null;
        if (!targetHex) continue;

        const { x, y } = hexToWorld(targetHex.q, targetHex.r);
        // Pan camera to the combat hex
        await new Promise(res => this.cameras.main.pan(x, y, 350, 'Sine.easeInOut', false, (_cam, p) => { if (p >= 1) res(); }));

        // Explicit attacker/defender markers + slower shot animation
        let atkMarker = null, defMarker = null;
        if (entry.attackerHex) {
          const from = hexToWorld(entry.attackerHex.q, entry.attackerHex.r);
          atkMarker = this.add.circle(from.x, from.y, 16, 0x2f88ff, 0.35).setDepth(58)
            .setStrokeStyle(2, 0x7fb7ff, 0.95);
          defMarker = this.add.circle(x, y, 16, 0xff4444, 0.35).setDepth(58)
            .setStrokeStyle(2, 0xffaaaa, 0.95);
          const atkTxt = this.add.text(from.x, from.y - 24, 'ATTACKER', { font: 'bold 10px monospace', fill: '#7fb7ff' })
            .setOrigin(0.5).setDepth(58);
          const defTxt = this.add.text(x, y - 24, 'DEFENDER', { font: 'bold 10px monospace', fill: '#ffaaaa' })
            .setOrigin(0.5).setDepth(58);

          // Beam + projectile dot (clear travel direction)
          const beam = this.add.line(0, 0, from.x, from.y, x, y, 0xffee88, 0.4).setOrigin(0, 0).setDepth(59);
          const proj = this.add.circle(from.x, from.y, 5, 0xffee88, 1.0).setDepth(60);
          await new Promise(res => {
            this.tweens.add({
              targets: proj, x, y, duration: 460, ease: 'Sine.easeInOut',
              onComplete: () => { try { proj.destroy(); beam.destroy(); } catch (e) {} res(); }
            });
          });

          atkTxt.destroy(); defTxt.destroy();
        }

        // Flash impact on defender
        const ring = this.add.circle(x, y, 28, entry.type === 'combat' ? 0xff4400 : 0xffcc00, 0.7).setDepth(60);
        await new Promise(res => {
          this.tweens.add({ targets: ring, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 520, ease: 'Quad.easeOut', onComplete: () => { ring.destroy(); res(); } });
        });

        // Apply this step damage only after shot + impact fully complete, then redraw bars.
        if (entry.type === 'combat') {
          const tgt = gs.units.find(u => u.id === entry.targetId);
          const atk = gs.units.find(u => u.id === entry.attackerId);
          if (tgt) tgt.health -= (entry.dmg || 0);
          if (atk) atk.health -= (entry.attackerDmg || 0);
          gs.units = gs.units.filter(u => u.health > 0);
          this._redrawUnits();
        }

        const card = this._showCombatCard(entry, i + 1, steps.length);
        await this._waitForAdvance();
        card.forEach(o => { try { o.destroy(); } catch (e) {} });
        try { atkMarker?.destroy(); defMarker?.destroy(); } catch (e) {}
      }
      // Restore authoritative final resolved state
      gs.units = finalUnits;
      this._redrawUnits();
      await this._wait(200);
    }

    this._showResolution(events, winner);
  }

  _makeBanner(text, bg = 0x111122) {
    const w = this.scale.width, h = this.scale.height;
    const lbl = this.add.text(w / 2, h / 2 - 60, text, {
      font: 'bold 18px monospace', fill: '#ffffff',
      backgroundColor: `#${bg.toString(16).padStart(6,'0')}`,
      padding: { x: 24, y: 12 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
    this._addToUI([lbl]);
    return lbl;
  }

  _wait(ms) { return new Promise(r => this.time.delayedCall(ms, r)); }

  _showCombatCard(entry, idx, total) {
    const objs = [];
    const sw = this.scale.width, sh = this.scale.height;
    const cx = sw * 0.5, cy = sh * 0.5;
    const D = 206;

    const GLYPH = { INFANTRY:'●', ENGINEER:'◆', RECON:'✶', TANK:'■', ARTILLERY:'▲',
      ANTI_TANK:'➤', MORTAR:'△', MEDIC:'✚', PATROL_BOAT:'◖', SUBMARINE:'▭',
      DESTROYER:'◉', CRUISER_LT:'⬒', CRUISER_HV:'⬓', BATTLESHIP:'⬔',
      LANDING_CRAFT:'⟂', TRANSPORT_SM:'◫', TRANSPORT_MD:'◫', TRANSPORT_LG:'◫',
      COASTAL_BATTERY:'▣' };
    const g = t => GLYPH[t] || '◌';

    const TIER_COL = {
      'Catastrophic Failure': '#ff4444', 'Repelled': '#ff8844',
      'Neutral': '#cccccc', 'Effective': '#88ee44', 'Overwhelming': '#44ffcc',
    };
    const TIER_BG = {
      'Catastrophic Failure': 0x4a0000, 'Repelled': 0x3a1800,
      'Neutral': 0x1a1a1a, 'Effective': 0x0e2800, 'Overwhelming': 0x002a1a,
    };
    const PC = [null, 0x3366cc, 0xcc3333]; // player colors

    const mk = (txt, x, y, col='#d0dde8', sz=12, bold=false, ox=0.5, oy=0.5) => {
      const t = this.add.text(x, y, txt, { font:`${bold?'bold ':''}${sz}px monospace`, fill:col })
        .setOrigin(ox, oy).setScrollFactor(0).setDepth(D+1);
      objs.push(t); return t;
    };
    const box = (x, y, w, h, fill, alpha=1, stroke=null) => {
      const r = this.add.rectangle(x, y, w, h, fill, alpha).setDepth(D).setScrollFactor(0);
      if (stroke !== null) r.setStrokeStyle(1.5, stroke);
      objs.push(r); return r;
    };
    const hpBar = (x, y, barW, current, max, dmg) => {
      const h = 10, bx = x - barW/2;
      box(x, y, barW, h, 0x111111, 1, 0x334455);
      const hpFrac = Math.max(0, current) / Math.max(1, max);
      const col = hpFrac > 0.6 ? 0x44bb44 : hpFrac > 0.3 ? 0xddaa00 : 0xcc2222;
      if (hpFrac > 0) box(bx + (barW*hpFrac)/2, y, barW*hpFrac, h, col);
      if (dmg > 0) {
        const lostW = Math.min(barW, barW * dmg / Math.max(1, max));
        const lostX = bx + barW*hpFrac + lostW/2;
        box(lostX, y, lostW, h, 0x882222, 0.6);
      }
    };

    // ── Backdrop ──────────────────────────────────────────────────────────────
    box(cx, cy, sw, sh, 0x000000, 0.65);

    // ── Card shell ────────────────────────────────────────────────────────────
    const cW = Math.min(700, sw - 32), cH = 320;
    const cX = cx, cY = cy;
    box(cX, cY, cW, cH, 0x0b0e14, 0.98, 0x2e3d50);

    // Top header strip
    const hdrBg = entry.panic ? 0x3d2000 : 0x0d1b2a;
    box(cX, cY - cH/2 + 22, cW, 44, hdrBg, 1, 0x2e3d50);
    const hdrTxt = entry.panic ? '⚡  PANIC CLASH' : '⚔  COMBAT';
    mk(hdrTxt, cX - 30, cY - cH/2 + 22, '#c8b87a', 15, true, 0.5, 0.5);
    if (total > 1) mk(`${idx} / ${total}`, cX + cW/2 - 16, cY - cH/2 + 22, '#556677', 11, false, 1, 0.5);

    // Portrait zones
    const pW = cW * 0.38, pH = 160;
    const lCX = cX - cW/2 + 16 + pW/2;
    const rCX = cX + cW/2 - 16 - pW/2;
    const pY  = cY - cH/2 + 44 + pH/2 + 4;

    const portrait = (pcx, pcy, type, owner, name, hpBefore, hpAfter, dmgTaken, role) => {
      const borderCol = PC[owner] || 0x445566;
      box(pcx, pcy, pW, pH, 0x0f151c, 1, borderCol);
      // Role label (ATTACKER / DEFENDER)
      const roleCol = role === 'ATTACKER' ? '#5588ee' : '#ee5544';
      box(pcx, pcy - pH/2 + 11, pW, 22, owner===1?0x1a2a44:0x3a1414, 1);
      mk(role, pcx, pcy - pH/2 + 11, roleCol, 10, true);
      // Big unit glyph
      mk(g(type), pcx, pcy - 22, PC[owner]?`#${PC[owner].toString(16).padStart(6,'0')}`:'#aaaaaa', 42, true);
      // Unit name
      mk(name, pcx, pcy + 28, '#dde8f0', 11, true);
      // HP bar
      hpBar(pcx, pcy + 50, pW - 20, hpAfter, hpBefore, dmgTaken);
      // HP text
      const hpColor = dmgTaken > 0 ? '#ff8888' : '#88cc88';
      mk(`HP  ${Math.max(0,hpAfter)} / ${hpBefore}${dmgTaken>0?'  (−'+dmgTaken+')':''}`, pcx, pcy + 65, hpColor, 10);
    };

    const atkHP0 = entry.attackerHPBefore ?? 0;
    const defHP0 = entry.targetHPBefore   ?? 0;
    const atkHP1 = Math.max(0, atkHP0 - (entry.attackerDmg||0));
    const defHP1 = Math.max(0, defHP0 - (entry.dmg||0));

    portrait(lCX, pY, entry.attackerType, entry.attackerOwner, entry.attackerName||'?', atkHP0, atkHP1, entry.attackerDmg||0, 'ATTACKER');
    portrait(rCX, pY, entry.targetType,   entry.targetOwner,   entry.targetName||'?',   defHP0, defHP1, entry.dmg||0,         'DEFENDER');

    // ── Center column: VS + outcome ───────────────────────────────────────────
    const midX = cX, midTop = pY - pH/2;
    mk('VS', midX, midTop + 28, '#334455', 18, true);

    // Strength numbers
    mk(`${entry.baseAttack ?? '?'}`, midX, midTop + 60, '#e8d090', 22, true);
    mk('ATK', midX, midTop + 80, '#7799aa', 9, false);

    // Score
    mk(`SCORE  ${entry.score ?? '?'}`, midX, midTop + 102, '#aabbcc', 11, true);

    // Roll
    const roll = entry.roll ?? 0;
    mk(`Roll  ${roll>=0?'+':''}${roll}`, midX, midTop + 118, roll>=0?'#88cc88':'#cc6666', 10);

    // ── Outcome banner ────────────────────────────────────────────────────────
    const outY = cY + cH/2 - 74;
    const tierCol  = TIER_COL[entry.tier]  || '#cccccc';
    const tierBgC  = TIER_BG[entry.tier]   || 0x1a1a1a;
    box(cX, outY, cW - 4, 30, tierBgC, 1, 0x445566);
    if (entry.type === 'combat' || entry.panic) {
      mk((entry.tier||'COMBAT').toUpperCase(), cX, outY, tierCol, 14, true);
    } else if (entry.type === 'miss') {
      mk('MISS — TARGET OUT OF RANGE', cX, outY, '#888888', 13, true);
    } else {
      mk('BLIND FIRE — EMPTY HEX', cX, outY, '#888888', 13, true);
    }

    // ── Score breakdown + roll reveal ─────────────────────────────────────────
    const modY = outY + 20;
    const rollCol = roll>5?'#88ee44':roll<-5?'#ff6644':'#aabbcc';
    const rollStr = roll>=0?`+${roll}`:String(roll);
    // Score line
    mk(`Score: ${entry.score??'?'}  (base 50 + roll ${rollStr})   Atk: ${entry.baseAttack??'?'}   Pierce ${entry.pierce??'?'} / Armor ${entry.armor??'?'}`, cX, modY, '#667788', 9, false, [0.5,0.5]);
    // Modifiers line
    const mods = [];
    if (entry.accuracy)        mods.push(`Acc ${(entry.accuracy??0)>=0?'+':''}${entry.accuracy}`);
    if (entry.evasion)         mods.push(`Eva −${entry.evasion}`);
    if (entry.terrainMod)      mods.push(`Terrain −${entry.terrainMod}`);
    if (entry.dugInMod)        mods.push(`Dug-in −${entry.dugInMod}`);
    if (entry.bunkerMod)       mods.push(`Bunker −${entry.bunkerMod}`);
    if (entry.flankMod)        mods.push(`Flank +${entry.flankMod}`);
    if (entry.blindFirePenalty) mods.push(`Blind −${entry.blindFirePenalty}`);
    if (entry.suppressed)      mods.push('SUPPRESSED');
    mk(mods.join('  ·  ')||'No modifiers', cX, modY+14, '#445566', 9, false, [0.5,0.5]);
    // Retaliation line
    if (entry.defenderCanRetaliate && entry.retaliationDmg > 0) {
      mk(`↩ Retaliation: ${entry.retaliationTier||'?'} (score ${entry.retaliationScore??'?'})  —  defender deals −${entry.retaliationDmg}`, cX, modY+28, '#ffcc88', 9, false, [0.5,0.5]);
    } else {
      mk(`↩ No retaliation — ${entry.blindFire?'blind fire':'defender dived / out of range'}`, cX, modY+28, '#334455', 9, false, [0.5,0.5]);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    box(cX, cY + cH/2 - 16, cW, 32, 0x080b10, 1, 0x2e3d50);
    mk('CLICK  or  SPACE  to  continue', cX, cY + cH/2 - 16, '#3a4a5a', 11, false);

    this._addToUI(objs);
    return objs;
  }

  _waitForAdvance(label = '[ SPACE or CLICK → NEXT COMBAT ]') {
    return new Promise(resolve => {
      const hint = this.add.text(this.scale.width / 2, this.scale.height - 56, label, {
        font: 'bold 13px monospace', fill: '#ffffff', backgroundColor: '#333333', padding: { x: 12, y: 6 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(205);
      this._addToUI([hint]);

      const done = () => {
        try { hint.destroy(); } catch (e) {}
        this.input.keyboard.off('keydown-SPACE', onSpace);
        this.input.off('pointerdown', onClick);
        resolve();
      };
      const onSpace = () => done();
      const onClick = () => done();
      this.input.keyboard.once('keydown-SPACE', onSpace);
      this.input.once('pointerdown', onClick);
    });
  }

  // ── Pass / Resolution screens ─────────────────────────────────────────────
  _showSplash(objects, onDismiss) {
    this.btnSubmit?.setVisible(false);

    const btn = this.add.text(this.scale.width / 2, this.scale.height - 60, '[ CLICK or SPACE to continue ]', {
      font: 'bold 14px monospace', fill: '#ffffff',
      backgroundColor: '#334433', padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });
    this._addToUI([btn]);

    const dismiss = () => {
      this._splashDismiss = null;
      [...objects, btn].forEach(o => { try { o.destroy(); } catch(e){} });
      onDismiss();
    };
    this._splashDismiss = dismiss;
    btn.on('pointerdown', dismiss);
    btn.on('pointerover', () => btn.setAlpha(0.8));
    btn.on('pointerout',  () => btn.setAlpha(1.0));
  }

  _showPassScreen(msg) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.92).setScrollFactor(0).setDepth(200);
    const txt = this.add.text(w/2, h/2, msg, { font: 'bold 26px monospace', fill: '#ffffff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201);
    this._addToUI([overlay, txt]);
    this._showSplash([overlay, txt], () => { this._freezeFog(); this._refresh(); });
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
        if (entry.type === 'blind_miss') {
          addLine(`${entry.attackerName} (P${entry.attackerOwner}) → (${entry.hex?.q},${entry.hex?.r})  [EMPTY HEX — no target]`, '#887744', true);
          yPos += 4;
          continue;
        }
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
      this._showSplash(objects, () => { this.scene.start('MenuScene'); });
    } else {
      yPos += 6;
      addLine(`Turn ${this.gameState.turn} begins`, '#666666');
      this._addToUI(objects);
      // IGOUGO: after resolution, pass to current player (already set by resolveTurn)
      const nextP = this.gameState.currentPlayer;
      this._showSplash(objects, () => {
        this._showPassScreen(`Player ${nextP}'s turn — take the controls`);
      });
    }
  }

  _pushLog(msg) {
    this._log.push(msg);
    if (this._log.length > 5) this._log.shift();
  }

  // ── Terrain generation ────────────────────────────────────────────────────
  // After terrain generation: if a naval unit is on invalid terrain, BFS to nearest valid hex.
  _fixNavalSpawns() {
    const gs = this.gameState;
    for (const unit of gs.units) {
      if (!NAVAL_UNITS.has(unit.type)) continue;
      const ttype = this.terrain[`${unit.q},${unit.r}`] ?? 0;
      if (canEnterTerrain(unit.type, ttype)) continue; // already valid

      // BFS outward from spawn to find nearest valid water hex
      const visited = new Set([`${unit.q},${unit.r}`]);
      const queue = [{ q: unit.q, r: unit.r }];
      let found = null;
      outer: while (queue.length > 0) {
        const { q, r } = queue.shift();
        for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
          const nq = q+dq, nr = r+dr;
          if (nq < 0 || nr < 0 || nq >= this.mapSize || nr >= this.mapSize) continue;
          const key = `${nq},${nr}`;
          if (visited.has(key)) continue;
          visited.add(key);
          const tt = this.terrain[key] ?? 0;
          if (canEnterTerrain(unit.type, tt) && !gs.units.find(u => u !== unit && u.q === nq && u.r === nr)) {
            found = { q: nq, r: nr };
            break outer;
          }
          queue.push({ q: nq, r: nr });
        }
      }
      if (found) { unit.q = found.q; unit.r = found.r; }
    }
  }

  _generateTerrain() {
    const ms = this.mapSize;
    const map = {};
    for (let q = 0; q < ms; q++)
      for (let r = 0; r < ms; r++) map[`${q},${r}`] = 0;

    if (this.scenario === 'combat') {
      // All plains — nothing to do
    } else if (this.scenario === 'naval') {
      this._genNavalTerrain(map, ms);
    } else {
      // Standard procedural terrain (scout / grand / default)
      const seed = this.scenario === 'grand' ? 99999 : 12345;
      const rng = this._seededRng(seed);
      const forestCount = this.scenario === 'grand' ? 80 : 30;
      const hillCount   = this.scenario === 'grand' ? 50 : 20;
      const mtCount     = this.scenario === 'grand' ? 25 : 10;
      for (let i = 0; i < forestCount; i++) {
        const cq = Math.floor(rng() * ms), cr = Math.floor(rng() * ms);
        for (let dq = -2; dq <= 2; dq++)
          for (let dr = -2; dr <= 2; dr++)
            if (isValid(cq+dq, cr+dr, ms) && rng()>0.4) map[`${cq+dq},${cr+dr}`] = 1;
      }
      for (let i = 0; i < hillCount; i++) {
        const cq = Math.floor(rng() * ms), cr = Math.floor(rng() * ms);
        for (let dq = -2; dq <= 2; dq++)
          for (let dr = -2; dr <= 2; dr++)
            if (isValid(cq+dq, cr+dr, ms) && rng()>0.55) map[`${cq+dq},${cr+dr}`] = 3;
      }
      for (let i = 0; i < mtCount; i++) {
        const cq = Math.floor(rng() * ms), cr = Math.floor(rng() * ms);
        for (let dq = -1; dq <= 1; dq++)
          for (let dr = -1; dr <= 1; dr++)
            if (isValid(cq+dq, cr+dr, ms) && rng()>0.5) map[`${cq+dq},${cr+dr}`] = 2;
      }
    }

    // Force buildings & unit spawns to plains (or sand for naval)
    const gs = this.gameState;
    const spawnType = this.scenario === 'naval' ? 6 : 0;
    for (const b of gs.buildings) map[`${b.q},${b.r}`] = spawnType;
    // Force land unit spawns to plain/sand — but skip naval units so they stay in water
    for (const u of gs.units) {
      if (!NAVAL_UNITS.has(u.type) && u.type !== 'COASTAL_BATTERY') {
        map[`${u.q},${u.r}`] = spawnType;
      }
    }
    for (const b of gs.buildings.filter(b => b.type === 'HQ')) {
      for (const [dq, dr] of [[-1,0],[1,0],[0,-1],[0,1],[1,-1],[-1,1]])
        if (isValid(b.q+dq, b.r+dr, ms)) map[`${b.q+dq},${b.r+dr}`] = spawnType;
    }
    return map;
  }

  _genNavalTerrain(map, ms) {
    // Start with all ocean
    for (let q = 0; q < ms; q++)
      for (let r = 0; r < ms; r++) map[`${q},${r}`] = 5; // OCEAN

    // ── Rectangular visual region via offset coordinates ──────────────────
    // In flat-top axial hex grids, the q∈[0,ms) r∈[0,ms) grid is a parallelogram.
    // We use "even-q offset" coords: offset_row = r + floor(q/2)
    // The playable rectangle is q∈[0,ms), offset_row∈[rowMin, rowMax).
    // Hexes outside this range stay OCEAN (impassable) — giving a rectangular map.
    const RECT_H = Math.round(ms * 0.65); // visual row count
    const rowMin = Math.round(ms * 0.1);
    const rowMax = rowMin + RECT_H;

    const inRect = (q, r) => {
      const offsetRow = r + Math.floor(q / 2);
      return q >= 0 && q < ms && offsetRow >= rowMin && offsetRow < rowMax;
    };

    // Helper: convert offset coords (col, offsetRow) → axial (q, r)
    const offsetToAxial = (col, offsetRow) => ({ q: col, r: offsetRow - Math.floor(col / 2) });

    const setIsland = (cq, cr, radius) => {
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          const nq = cq+dq, nr = cr+dr;
          if (!isValid(nq, nr, ms)) continue;
          const dist = Math.abs(dq) + Math.abs(dr) + Math.abs(-dq-dr);
          const hexDist = dist / 2;
          if (hexDist <= radius)          map[`${nq},${nr}`] = 6; // sand interior
          else if (hexDist <= radius+1.5) map[`${nq},${nr}`] = 4; // shallow shore
        }
      }
    };

    // Island row: same offset row for both → same VISUAL height (symmetric left-right)
    // Constraint: P2 island at col=ms-5 needs axial r = islandRow - floor((ms-5)/2) >= radius+1
    const radius = 5;
    const p2col = ms - 5;
    const p2floorQ = Math.floor(p2col / 2);
    const islandRow = Math.max(rowMin + Math.round(RECT_H * 0.5), p2floorQ + radius + 2);

    // P1 island: left side (radius 5)
    const p1 = offsetToAxial(4, islandRow);
    setIsland(p1.q, p1.r, radius);

    // P2 island: right next to P1, ~13 hexes away center-to-center (1-hex ocean channel)
    const p2 = offsetToAxial(17, islandRow);
    setIsland(p2.q, p2.r, 4); // radius 4 — slightly smaller, close neighbor

    // Far islands: neutral resource targets
    const far1 = offsetToAxial(p2col, islandRow);      // original far-right position
    setIsland(far1.q, far1.r, 3);                       // smaller neutral island
    const far2 = offsetToAxial(Math.floor(ms*0.55), islandRow); // center-right
    setIsland(far2.q, far2.r, 2);

    // Small mid-ocean islands
    const smalls = [
      [Math.floor(ms*0.28), islandRow - 5, 2],
      [Math.floor(ms*0.45), islandRow + 4, 2],
      [Math.floor(ms*0.68), islandRow - 3, 2],
      [Math.floor(ms*0.38), islandRow + 6, 1],
    ];
    for (const [col, orow, rad] of smalls) {
      const { q, r } = offsetToAxial(col, orow);
      if (isValid(q, r, ms)) setIsland(q, r, rad);
    }
  }

  _seededRng(seed) {
    let s = seed;
    return () => { s = (s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
  }
}
