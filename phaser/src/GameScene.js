import Phaser from 'phaser';
import {
  hexToWorld, worldToHex, hexVertices, isValid,
  MAP_SIZE, HEX_SIZE, ISO_SQUISH, getMapBounds
} from './HexGrid.js';
import { MenuScene } from './MenuScene.js';
import { planAITurn, AI_STRATEGIES, randomStrategy } from './AIPlayer.js';
import {
  createGameState, createUnit, createBuilding, unitAt, buildingAt, roadAt,
  getReachableHexes, getAttackableHexes, getAttackRangeHexes, hexDistance, computeFog,
  findPath, resolveTurn, resolveImmediateAttack, resolveEndOfTurn, checkWinner, calcIncome, queueRecruit, registerDesign,
  calcUpkeep, calcRPFromLabs, computeSupply, supplyPenalty, BUILDING_SUPPLY_RADIUS, getRecruitFoodCost,
  UNIT_TYPES, PLAYER_COLORS, BUILDING_TYPES, RESOURCE_TYPES,
  MODULES, CHASSIS_BUILDINGS, MAX_DESIGNS_PER_PLAYER,
  designRegistrationCost, computeDesignStats,
  NAVAL_UNITS, SHALLOW_UNITS, AIR_UNITS, canEnterTerrain, isStealthDetected,
  ROAD_TYPES, LOCKED_CHASSIS, hasLOS
} from './GameState.js';
import { TECH_TREE, RESEARCH_BRANCHES, prereqsMet, computeTechBonuses } from './ResearchData.js';

// ── Constants ─────────────────────────────────────────────────────────────
const TERRAIN        = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2, HILL: 3, SHALLOW: 4, OCEAN: 5, SAND: 6 };
const TERRAIN_LABELS = ['Plains','Forest','Mountain','Hill','Shallow Water','Ocean','Sand','Light Woods'];
const TERRAIN_COLORS = {
  0: { fill: 0x8aaa55, stroke: 0x6a8a35 },  // plains
  1: { fill: 0x1a4010, stroke: 0x0d2008 },  // dense forest
  2: { fill: 0x8a7a6a, stroke: 0x6a5a4a },  // mountain
  3: { fill: 0x8aaa55, stroke: 0x6a8a35 },  // hill (grass base — hill art overlaid)
  4: { fill: 0x4499bb, stroke: 0x2277aa },  // shallow water
  5: { fill: 0x0d2a4a, stroke: 0x071a2e },  // ocean
  6: { fill: 0xd4b96a, stroke: 0xb09050 },  // sand/beach
  7: { fill: 0x4a7030, stroke: 0x335020 },  // light woods
};
const SELECTED_STROKE  = 0xffe066;
const HOVER_STROKE     = 0xddaa33; // gold hover outline
const MOVE_HIGHLIGHT   = 0x00ffcc;
const ATTACK_HIGHLIGHT = 0xff6600;
export const GAME_VERSION = 'v1.4.38';

// Terrain type index → user_art filename key
const TERRAIN_ART_KEYS = {
  0: 'terrain_grass',
  1: 'terrain_forest',
  2: 'terrain_mountain',
  3: 'terrain_hill',
  4: 'terrain_shallow',
  5: 'terrain_ocean',
  6: 'terrain_sand',
  7: 'terrain_lightwoods',
};

const TERRAIN_ART_FILES = {
  terrain_grass:      'user_art/grass_tile.png',
  terrain_forest:     'user_art/forest_tile.png',
  terrain_mountain:   'user_art/mountain_tile.png',
  terrain_hill:       'user_art/grass_hill.png',
  terrain_shallow:    'user_art/water_shallow_tile.png',
  terrain_ocean:      'user_art/ocean_deep_tile.png',
  terrain_sand:       'user_art/sand_tile.png',
  terrain_lightwoods: 'user_art/lightwoods_tile_01.png',
};
// Sand tile variants (10 randomized versions for map variety)
const SAND_VARIANTS = 10;
const SAND_VARIANT_FILES = Array.from({length:SAND_VARIANTS},(_,i)=>({key:`terrain_sand_${i+1}`,file:`user_art/sand_tile_${String(i+1).padStart(2,'0')}.png`}));
// Grass tile variants
const GRASS_VARIANTS = 10;
const GRASS_VARIANT_FILES = Array.from({length:GRASS_VARIANTS},(_,i)=>({key:`terrain_grass_${i+1}`,file:`user_art/grass_tile_${String(i+1).padStart(2,'0')}.png`}));
// Dense forest tile variants
const FOREST_VARIANTS = 10;
const FOREST_VARIANT_FILES = Array.from({length:FOREST_VARIANTS},(_,i)=>({key:`terrain_forest_${i+1}`,file:`user_art/forest_tile_${String(i+1).padStart(2,'0')}.png`}));
// Ocean tile variants
const OCEAN_VARIANTS = 10;
const OCEAN_VARIANT_FILES = Array.from({length:OCEAN_VARIANTS},(_,i)=>({key:`terrain_ocean_${i+1}`,file:`user_art/ocean_tile_${String(i+1).padStart(2,'0')}.png`}));
// Shallow water tile variants
const SHALLOW_VARIANTS = 10;
const SHALLOW_VARIANT_FILES = Array.from({length:SHALLOW_VARIANTS},(_,i)=>({key:`terrain_shallow_${i+1}`,file:`user_art/shallow_tile_${String(i+1).padStart(2,'0')}.png`}));
// Light woods tile variants
const LIGHTWOODS_VARIANTS = 10;
const LIGHTWOODS_VARIANT_FILES = Array.from({length:LIGHTWOODS_VARIANTS},(_,i)=>({key:`terrain_lightwoods_${i+1}`,file:`user_art/lightwoods_tile_${String(i+1).padStart(2,'0')}.png`}));
// Mountain tile variants
const MOUNTAIN_VARIANTS = 10;
const MOUNTAIN_VARIANT_FILES = Array.from({length:MOUNTAIN_VARIANTS},(_,i)=>({key:`terrain_mountain_${i+1}`,file:`user_art/mountain_tile_${String(i+1).padStart(2,'0')}.png`}));
// Hill tile variants
const HILL_VARIANTS = 10;
const HILL_VARIANT_FILES = Array.from({length:HILL_VARIANTS},(_,i)=>({key:`terrain_hill_${i+1}`,file:`user_art/hill_tile_${String(i+1).padStart(2,'0')}.png`}));

// Farm tile variants (overlay for FARM buildings; looks like terrain, not a structure icon)
const FARM_VARIANTS = 6;
const FARM_VARIANT_FILES = Array.from({length:FARM_VARIANTS},(_,i)=>({key:`terrain_farm_${i+1}`,file:`user_art/farm_tile_${String(i+1).padStart(2,'0')}.png`}));

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    // Load terrain tiles — missing files are silently skipped
    for (const [key, file] of Object.entries(TERRAIN_ART_FILES)) {
      this.load.image(key, file);
    }
    // Load sand + grass tile variants
    for (const {key, file} of SAND_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of GRASS_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of FOREST_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of OCEAN_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of SHALLOW_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of LIGHTWOODS_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of MOUNTAIN_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of HILL_VARIANT_FILES) {
      this.load.image(key, file);
    }
    for (const {key, file} of FARM_VARIANT_FILES) {
      this.load.image(key, file);
    }
    this.load.on('loaderror', () => {}); // suppress console errors for missing tiles
  }

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
    this.procLandProfile = data.procLandProfile || 'continent';
    this.procQuickStart  = (data.procQuickStart !== undefined) ? !!data.procQuickStart : true;
    this.debugNoFog      = !!data.debugNoFog || this.scenario === 'mortar_test';
    // Map sizes per scenario
    const MAP_SIZES = { scout: 25, naval: 35, combat: 20, grand: 120, random: 40, air_test: 20, mortar_test: 20, custom: data.customSize || 40, default: 25 };
    this.mapSize   = MAP_SIZES[this.scenario] || MAP_SIZE;
    // AI players: set of player numbers controlled by AI
    this.aiPlayers  = new Set(data.aiP2 ? [2] : []);
    // AI strategy
    this.aiStrategy = data.aiStrategy || 'balanced';
    // Random map uses a unique seed each game
    this.mapSeed = (this.scenario === 'random' || this.scenario === 'custom') ? (Date.now() & 0xFFFFFF) : 0;

    this.gameState = createGameState(this.scenario);
    this.gameState._techTree = TECH_TREE; // inject for resolveEndOfTurn research tick
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
      zoomSpeed:         0.10,  // scroll wheel zoom speed (0.03 very slow .. 0.30 fast)
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
    // Layer for terrain art image objects (depth 2, world space, camera-managed)
    this.terrainArtLayer = this.add.layer().setDepth(2);
    // Mountain peak sprites overflow above their hex tile (depth 3, drawn in row order)
    this.mountainPeakLayer = this.add.layer().setDepth(3);
    // Keep terrainRT and terrainArtRT as dummy objects so camera ignore lists don't break
    this.terrainRT    = this.add.renderTexture(1, 1, 1, 1).setVisible(false);
    this.terrainArtRT = this.add.renderTexture(1, 1, 1, 1).setVisible(false);

    // World graphics layers (depth order)
    this.roadGfx      = this.add.graphics().setDepth(5);
    this.supplyGfx    = this.add.graphics().setDepth(7);  // supply overlay — above roads, below highlights
    this._supplyOverlayOn = false; // toggled by S key or button
    this.highlightGfx = this.add.graphics().setDepth(10);
    this.farmTileLayer = this.add.layer().setDepth(14); // farm terrain-overlays under building icons
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
      this.terrainGfx, this.terrainArtLayer, this.mountainPeakLayer, this.terrainArtRT, this.terrainRT,
      this.roadGfx, this.supplyGfx,
      this.highlightGfx, this.farmTileLayer, this.buildingGfx, this.unitGfx, this.fogRT, this._uiLayer
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
      this.terrainGfx, this.terrainArtLayer, this.mountainPeakLayer, this.terrainArtRT, this.terrainRT,
      this.roadGfx, this.supplyGfx,
      this.highlightGfx, this.farmTileLayer, this.buildingGfx, this.unitGfx, this.fogRT,
    ]);
    this.scale.on('resize', (gs) => this.uiCamera.setSize(gs.width, gs.height));

    // For random maps: place spawns + resources after terrain is generated
    if (this.scenario === 'random' || this.scenario === 'custom') this._placeProcSpawns(this.mapSeed);

    this._setupInput();
    this._drawStaticLayers();
    this._freezeFog(); // lock fog for P1's first planning phase
    this._refresh();
  }

  // ── Terrain ──────────────────────────────────────────────────────────────
  _drawTerrainDirect() {
    this.terrainGfx.clear();
    if (this.terrainArtLayer) this.terrainArtLayer.removeAll(true);
    if (this.mountainPeakLayer) this.mountainPeakLayer.removeAll(true);
    if (this.farmTileLayer) this.farmTileLayer.removeAll(true);

    const artW = HEX_SIZE * 2;
    const artH = Math.round(HEX_SIZE * Math.sqrt(3) * ISO_SQUISH);

    // Terrain art overlay — only enabled when tiles are properly formatted (transparent PNG, correct hex shape)
    const ENABLE_TERRAIN_ART = true;
    const hasAnyArt = ENABLE_TERRAIN_ART && Object.values(TERRAIN_ART_KEYS).some(k => this.textures.exists(k));

    // Bake hex fills + borders to a single canvas image.
    // This replaces 40k+ individual Phaser Graphics draw calls with one static image.
    // terrainGfx is left empty — _bakeTerrainBase handles all static terrain visuals.
    this._bakeTerrainBase(artW, artH);

    // Bake terrain art (PNG tiles) on top of the base fills
    if (hasAnyArt) {
      this._bakeTerrainArt(artW, artH);
    }
    // Mountain peaks rendered as overflow sprites (not hex-clipped, sorted by world Y)
    this._buildMountainPeaks(artW, artH);
  }

  // ── Bake hex fills + borders to a single canvas image (depth 0) ──────────
  // Replaces per-hex Phaser Graphics calls. terrainGfx is left empty after this.
  // The terrain art bake (depth 2) renders on top and provides PNG tile visuals.
  _bakeTerrainBase(artW, artH) {
    const bounds  = getMapBounds(this.mapSize);
    const padding = HEX_SIZE * 2;
    const cw = Math.ceil(bounds.maxX - bounds.minX + padding * 2);
    const ch = Math.ceil(bounds.maxY - bounds.minY + padding * 2);
    const offX = bounds.minX - padding;
    const offY = bounds.minY - padding;

    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');

    // Convert Phaser integer color + alpha to CSS rgba string
    const rgba = (hex, a) => {
      const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
      return `rgba(${r},${g},${b},${a})`;
    };

    const hw = artW / 2, hh = artH / 2;
    for (let q = 0; q < this.mapSize; q++) {
      for (let r = 0; r < this.mapSize; r++) {
        const ttype = this.terrain[`${q},${r}`] ?? 0;
        const { x, y } = hexToWorld(q, r);
        const cx = x - offX, cy = y - offY;
        const colors = TERRAIN_COLORS[ttype];

        // Flat-top hex vertices with ISO squish (same formula as _bakeTerrainArt clip)
        const vx = [], vy = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          vx.push(cx + hw * Math.cos(angle));
          vy.push(cy + hh * Math.sin(angle));
        }

        // Base fill
        ctx.beginPath();
        ctx.moveTo(vx[0], vy[0]);
        for (let i = 1; i < 6; i++) ctx.lineTo(vx[i], vy[i]);
        ctx.closePath();
        ctx.fillStyle = rgba(colors.fill, 1.0);
        ctx.fill();

        // Bevel highlight: top edges (verts 4-5-0-1-2)
        ctx.beginPath();
        ctx.moveTo(vx[4], vy[4]); ctx.lineTo(vx[5], vy[5]);
        ctx.lineTo(vx[0], vy[0]); ctx.lineTo(vx[1], vy[1]); ctx.lineTo(vx[2], vy[2]);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 3; ctx.stroke();

        // Bevel shadow: bottom edges (verts 2-3-4)
        ctx.beginPath();
        ctx.moveTo(vx[2], vy[2]); ctx.lineTo(vx[3], vy[3]); ctx.lineTo(vx[4], vy[4]);
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 3; ctx.stroke();

        // Outer border
        ctx.beginPath();
        ctx.moveTo(vx[0], vy[0]);
        for (let i = 1; i < 6; i++) ctx.lineTo(vx[i], vy[i]);
        ctx.closePath();
        ctx.strokeStyle = rgba(colors.stroke, 1.0);
        ctx.lineWidth = 1; ctx.stroke();
      }
    }

    if (this.textures.exists('_terrain_base_baked')) {
      this.textures.remove('_terrain_base_baked');
    }
    this.textures.addCanvas('_terrain_base_baked', canvas);

    if (this._terrainBaseImg) { try { this._terrainBaseImg.destroy(); } catch(e){} }
    // depth 0 within terrainArtLayer so terrain art (depth 2) renders on top
    this._terrainBaseImg = this.add.image(offX, offY, '_terrain_base_baked')
      .setOrigin(0, 0).setDepth(0);
    if (this.terrainArtLayer) this.terrainArtLayer.add(this._terrainBaseImg);
  }

  _bakeTerrainArt(artW, artH) {
    const bounds = getMapBounds(this.mapSize);
    const padding = HEX_SIZE * 2;
    const cw = Math.ceil(bounds.maxX - bounds.minX + padding * 2);
    const ch = Math.ceil(bounds.maxY - bounds.minY + padding * 2);
    const offX = bounds.minX - padding;
    const offY = bounds.minY - padding;

    // Create or reuse an OffscreenCanvas
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    for (let q = 0; q < this.mapSize; q++) {
      for (let r = 0; r < this.mapSize; r++) {
        const ttype = this.terrain[`${q},${r}`] ?? 0;
        // Pick variant tile deterministically by hex coords
        let artKey = TERRAIN_ART_KEYS[ttype];
        const _varHash = ((q * 1619 + r * 31337) ^ (q * 6791)) & 0xFFFFFF;
        if (ttype === 6) { // sand
          const varKey = `terrain_sand_${(_varHash % SAND_VARIANTS) + 1}`;
          if (this.textures.exists(varKey)) artKey = varKey;
        } else if (ttype === 1) { // dense forest
          const varKey = `terrain_forest_${(_varHash % FOREST_VARIANTS) + 1}`;
          if (this.textures.exists(varKey)) artKey = varKey;
        } else if (ttype === 0) { // grass/plains
          const varKey = `terrain_grass_${(_varHash % GRASS_VARIANTS) + 1}`;
          if (this.textures.exists(varKey)) artKey = varKey;
        } else if (ttype === 5) { // ocean
          const varKey = `terrain_ocean_${(_varHash % OCEAN_VARIANTS) + 1}`;
          if (this.textures.exists(varKey)) artKey = varKey;
        } else if (ttype === 4) { // shallow water
          const varKey = `terrain_shallow_${(_varHash % SHALLOW_VARIANTS) + 1}`;
          if (this.textures.exists(varKey)) artKey = varKey;
        } else if (ttype === 7) { // light woods
          const varKey = `terrain_lightwoods_${(_varHash % LIGHTWOODS_VARIANTS) + 1}`;
          if (this.textures.exists(varKey)) artKey = varKey;
        } else if (ttype === 3) { // hill variants — draw grass base first, then hill art on top
          const varKey = `terrain_hill_${(_varHash % HILL_VARIANTS) + 1}`;
          if (this.textures.exists(varKey)) artKey = varKey;
        } else if (ttype === 2) { // mountain -- skip bake; rendered as overflow peak sprites
          continue;
        }
        if (!artKey || !this.textures.exists(artKey)) continue;
        const srcImg = this.textures.get(artKey).getSourceImage();
        if (!srcImg || !srcImg.width) continue;
        const { x, y } = hexToWorld(q, r);
        const dx = x - offX - artW / 2;
        const dy = y - offY - artH / 2;

        // Clip to flat-top hex shape so rectangular tiles don't bleed outside
        ctx.save();
        ctx.beginPath();
        const vx = x - offX, vy = y - offY;
        const hw = artW / 2, hh = artH / 2;
        // Flat-top hex: 6 vertices at 0°,60°,120°,180°,240°,300° with isometric squish
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 180) * (60 * i);
          const px = vx + hw * Math.cos(angle);
          const py = vy + hh * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.clip();
        // For hills: draw a grass variant tile as background so transparent
        // parts of the hill art show grass pixels instead of flat fill color
        if (ttype === 3) {
          const grassKey = `terrain_grass_${(_varHash % GRASS_VARIANTS) + 1}`;
          const grassImg = this.textures.exists(grassKey)
            ? this.textures.get(grassKey).getSourceImage() : null;
          if (grassImg?.width) ctx.drawImage(grassImg, dx, dy, artW, artH);
        }
        ctx.drawImage(srcImg, dx, dy, artW, artH);
        ctx.restore();
      }
    }

    // Second pass: bake resource overlays on top — always visible under units/buildings
    for (let q = 0; q < this.mapSize; q++) {
      for (let r = 0; r < this.mapSize; r++) {
        const res = this.gameState.resourceHexes[`${q},${r}`];
        if (!res) continue;
        const { x, y } = hexToWorld(q, r);
        const vx = x - offX, vy = y - offY;
        const hw = artW / 2, hh = artH / 2;
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 180) * (60 * i);
          const px = vx + hw * Math.cos(angle), py = vy + hh * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = 0.62; // -38% opacity
        this._drawResourceOverlayCanvas(ctx, vx, vy, hw, hh, res.type);
        ctx.restore(); // also resets globalAlpha
      }
    }

    // Register as Phaser texture (replace if already exists)
    if (this.textures.exists('_terrain_art_baked')) {
      this.textures.remove('_terrain_art_baked');
    }
    this.textures.addCanvas('_terrain_art_baked', canvas);

    // Remove old baked image if exists
    if (this._terrainArtImg) { try { this._terrainArtImg.destroy(); } catch(e){} }

    // One image in world space at the map origin
    this._terrainArtImg = this.add.image(offX, offY, '_terrain_art_baked')
      .setOrigin(0, 0).setDepth(2);
    if (this.terrainArtLayer) this.terrainArtLayer.add(this._terrainArtImg);
  }

  // Mountain peaks: unclipped sprites that overflow above their hex tile (painter's order)
  _buildMountainPeaks(artW, artH) {
    if (!this.mountainPeakLayer) return;
    this.mountainPeakLayer.removeAll(true);

    // Collect mountain hexes sorted by world Y ascending (painter's algorithm: top rows first)
    const mtnHexes = [];
    for (let q = 0; q < this.mapSize; q++) {
      for (let r = 0; r < this.mapSize; r++) {
        if ((this.terrain[`${q},${r}`] ?? 0) === 2) {
          const { x, y } = hexToWorld(q, r);
          const hash = ((q * 1619 + r * 31337) ^ (q * 6791)) & 0xFFFFFF;
          mtnHexes.push({ x, y, hash });
        }
      }
    }
    if (mtnHexes.length === 0) return;
    mtnHexes.sort((a, b) => a.y - b.y);

    // Bake all peaks to a single canvas (replaces O(N) individual Image game objects).
    // Each peak is drawn at artW × sprH, bottom-anchored at (x, y + bottomY).
    const sprH   = artH * 2.5;
    const bottomY = artH * 0.5;

    const bounds  = getMapBounds(this.mapSize);
    const padding = HEX_SIZE * 2;
    const cw = Math.ceil(bounds.maxX - bounds.minX + padding * 2);
    const ch = Math.ceil(bounds.maxY - bounds.minY + padding * 2);
    const offX = bounds.minX - padding;
    const offY = bounds.minY - padding;

    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');

    for (const { x, y, hash } of mtnHexes) {
      const varKey = `terrain_mountain_${(hash % MOUNTAIN_VARIANTS) + 1}`;
      if (!this.textures.exists(varKey)) continue;
      const srcImg = this.textures.get(varKey).getSourceImage();
      if (!srcImg || !srcImg.width) continue;
      // dest rect: left = x - artW/2 - offX, top = y + bottomY - sprH - offY
      const dx = x - offX - artW / 2;
      const dy = y - offY + bottomY - sprH;
      ctx.drawImage(srcImg, dx, dy, artW, sprH);
    }

    if (this.textures.exists('_mountain_peaks_baked')) {
      this.textures.remove('_mountain_peaks_baked');
    }
    this.textures.addCanvas('_mountain_peaks_baked', canvas);

    if (this._mountainPeaksImg) { try { this._mountainPeaksImg.destroy(); } catch(e){} }
    this._mountainPeaksImg = this.add.image(offX, offY, '_mountain_peaks_baked')
      .setOrigin(0, 0).setDepth(1);
    if (this.mountainPeakLayer) this.mountainPeakLayer.add(this._mountainPeaksImg);
  }

  // Draw resource deposit overlay using canvas 2D API (baked into terrain texture)
  _drawResourceOverlayCanvas(ctx, cx, cy, hw, hh, type) {
    const s = hw * 0.55; // scale relative to hex half-width
    if (type === 'OIL') {
      // Spread dark oil seeps across the whole tile
      const puddles = [[-hw*0.55,hh*0.15,hw*0.38],[hw*0.35,-hh*0.35,hw*0.30],[hw*0.55,hh*0.40,hw*0.25],
                       [-hw*0.25,-hh*0.42,hw*0.28],[hw*0.05,hh*0.30,hw*0.33],[hw*0.42,-hh*0.05,hw*0.22],
                       [-hw*0.65,hh*0.35,hw*0.22],[-hw*0.05,-hh*0.18,hw*0.28]];
      for (const [ox, oy, r] of puddles) {
        ctx.beginPath();
        ctx.ellipse(cx+ox, cy+oy, r*1.55, r*0.85, 0, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(8,8,18,0.72)';
        ctx.fill();
      }
      // Iridescent sheen
      ctx.beginPath(); ctx.ellipse(cx-hw*0.38,cy+hh*0.12,hw*0.28,hh*0.14,0,0,Math.PI*2);
      ctx.fillStyle = 'rgba(30,50,160,0.32)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+hw*0.22,cy-hh*0.10,hw*0.20,hh*0.10,0,0,Math.PI*2);
      ctx.fillStyle = 'rgba(80,20,140,0.22)'; ctx.fill();

    } else if (type === 'IRON') {
      // Crack network spanning the tile
      ctx.strokeStyle = 'rgba(120,120,136,0.72)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx-hw*0.65,cy-hh*0.12); ctx.lineTo(cx-hw*0.12,cy+hh*0.20);
      ctx.lineTo(cx+hw*0.52,cy-hh*0.28);
      ctx.moveTo(cx-hw*0.12,cy+hh*0.20); ctx.lineTo(cx+hw*0.12,cy+hh*0.68);
      ctx.moveTo(cx+hw*0.52,cy-hh*0.28); ctx.lineTo(cx+hw*0.78,cy+hh*0.12);
      ctx.moveTo(cx-hw*0.38,cy-hh*0.52); ctx.lineTo(cx-hw*0.12,cy+hh*0.20);
      ctx.stroke();
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(160,160,160,0.50)';
      ctx.beginPath();
      ctx.moveTo(cx+hw*0.12,cy+hh*0.68); ctx.lineTo(cx+hw*0.38,cy+hh*0.82);
      ctx.moveTo(cx-hw*0.38,cy-hh*0.52); ctx.lineTo(cx-hw*0.65,cy-hh*0.72);
      ctx.stroke();
      // Ore nodules at crack nodes
      const nodes = [[-hw*0.65,-hh*0.12],[hw*0.52,-hh*0.28],[hw*0.12,hh*0.68],[-hw*0.38,-hh*0.52],[hw*0.78,hh*0.12]];
      for (const [ox, oy] of nodes) {
        const ns = hw*0.14;
        ctx.beginPath();
        ctx.moveTo(cx+ox,cy+oy-ns); ctx.lineTo(cx+ox-ns,cy+oy+ns*0.5); ctx.lineTo(cx+ox+ns,cy+oy+ns*0.5);
        ctx.closePath(); ctx.fillStyle = 'rgba(62,62,72,0.85)'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx+ox,cy+oy-ns); ctx.lineTo(cx+ox,cy+oy); ctx.lineTo(cx+ox+ns,cy+oy+ns*0.5);
        ctx.closePath(); ctx.fillStyle = 'rgba(170,170,200,0.55)'; ctx.fill();
      }
      // Metallic glint dots
      ctx.fillStyle = 'rgba(200,200,220,0.65)';
      for (const [ox,oy] of [[-hw*0.62,0],[hw*0.55,-hh*0.2],[hw*0.18,hh*0.72],[-hw*0.35,-hh*0.5],[hw*0.8,hh*0.15]]) {
        ctx.beginPath(); ctx.arc(cx+ox, cy+oy, 1.8, 0, Math.PI*2); ctx.fill();
      }

    } else if (type === 'WOOD') {
      // Stacked log cross-sections
      const logs = [[-hw*0.45,hh*0.20,hw*0.28,hh*0.16],[hw*0.12,hh*0.32,hw*0.24,hh*0.14],
                    [hw*0.50,-hh*0.12,hw*0.22,hh*0.13],[-hw*0.18,-hh*0.38,hw*0.20,hh*0.12],
                    [hw*0.32,hh*0.50,hw*0.18,hh*0.11]];
      for (const [ox,oy,rw,rh] of logs) {
        ctx.beginPath(); ctx.ellipse(cx+ox,cy+oy,rw,rh,0,0,Math.PI*2);
        ctx.fillStyle='rgba(78,42,14,0.80)'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx+ox,cy+oy-rh*0.3,rw*0.8,rh*0.5,0,0,Math.PI*2);
        ctx.fillStyle='rgba(115,66,24,0.50)'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx+ox,cy+oy,rw*0.55,0,Math.PI*2);
        ctx.strokeStyle='rgba(38,16,4,0.45)'; ctx.lineWidth=1; ctx.stroke();
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

    // ── Base fill ──────────────────────────────────────────────────────────
    gfx.fillStyle(colors.fill);
    gfx.beginPath(); gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath(); gfx.fillPath();

    // ── Bevel: top-half highlight / bottom-half shadow (raised tile look) ──
    if (!isSelected && !isHovered) {
      // Inner highlight (top 3 edges: verts 0→1→2→3)
      gfx.lineStyle(3, 0xffffff, 0.18);
      gfx.beginPath();
      gfx.moveTo(verts[4].x, verts[4].y);
      gfx.lineTo(verts[5].x, verts[5].y);
      gfx.lineTo(verts[0].x, verts[0].y);
      gfx.lineTo(verts[1].x, verts[1].y);
      gfx.lineTo(verts[2].x, verts[2].y);
      gfx.strokePath();
      // Inner shadow (bottom 3 edges: verts 2→3→4)
      gfx.lineStyle(3, 0x000000, 0.22);
      gfx.beginPath();
      gfx.moveTo(verts[2].x, verts[2].y);
      gfx.lineTo(verts[3].x, verts[3].y);
      gfx.lineTo(verts[4].x, verts[4].y);
      gfx.strokePath();
    }

    // ── Terrain details ────────────────────────────────────────────────────
    if (!isHovered && !isSelected) {
      // FOREST (1): tree canopy clusters
      if (terrain === 1) {
        for (const [ox, oy, s] of [[-7,-3,6],[4,-5,5],[0,5,6],[-3,6,4],[7,2,5]]) {
          gfx.fillStyle(0x1a5010, 0.85);
          gfx.fillTriangle(cx+ox, cy+oy-s, cx+ox-s, cy+oy+s*0.6, cx+ox+s, cy+oy+s*0.6);
          // trunk
          gfx.fillStyle(0x5a3010, 0.7);
          gfx.fillRect(cx+ox-1, cy+oy+s*0.6, 2, s*0.5);
        }
      }
      // MOUNTAIN (2): snow-capped peaks with shadow face
      if (terrain === 2) {
        for (const [ox, oy, s] of [[-6,3,10],[4,4,8]]) {
          // shadow face (right side)
          gfx.fillStyle(0x4a4a55, 0.5);
          gfx.fillTriangle(cx+ox, cy+oy-s, cx+ox+s*0.8, cy+oy+s*0.5, cx+ox, cy+oy+s*0.5);
          // main face
          gfx.fillStyle(0x888899, 0.7);
          gfx.fillTriangle(cx+ox, cy+oy-s, cx+ox-s*0.8, cy+oy+s*0.5, cx+ox+s*0.8, cy+oy+s*0.5);
          // snow cap
          gfx.fillStyle(0xeeeeff, 0.85);
          gfx.fillTriangle(cx+ox, cy+oy-s, cx+ox-s*0.3, cy+oy-s*0.45, cx+ox+s*0.3, cy+oy-s*0.45);
        }
      }
      // HILL (3): contour lines (2 arcs)
      if (terrain === 3) {
        gfx.lineStyle(1.5, 0xffffff, 0.3);
        gfx.beginPath();
        gfx.moveTo(cx-12, cy+6); gfx.lineTo(cx-6, cy-2); gfx.lineTo(cx+1, cy+6);
        gfx.strokePath();
        gfx.beginPath();
        gfx.moveTo(cx-2, cy+5); gfx.lineTo(cx+5, cy-2); gfx.lineTo(cx+12, cy+5);
        gfx.strokePath();
        gfx.lineStyle(1, 0x000000, 0.15);
        gfx.beginPath();
        gfx.moveTo(cx-12, cy+7); gfx.lineTo(cx-6, cy-1); gfx.lineTo(cx+1, cy+7);
        gfx.strokePath();
      }
      // SHALLOW WATER (4): wave lines
      if (terrain === 4) {
        gfx.lineStyle(1.5, 0xaaddff, 0.5);
        for (const dy of [-4, 3]) {
          gfx.beginPath();
          gfx.moveTo(cx-10, cy+dy);
          gfx.lineTo(cx-5, cy+dy-3); gfx.lineTo(cx, cy+dy); gfx.lineTo(cx+5, cy+dy-3); gfx.lineTo(cx+10, cy+dy);
          gfx.strokePath();
        }
      }
      // OCEAN (5): deeper wave lines
      if (terrain === 5) {
        gfx.lineStyle(2, 0x4488bb, 0.4);
        for (const dy of [-5, 2, 9]) {
          gfx.beginPath();
          gfx.moveTo(cx-11, cy+dy);
          gfx.lineTo(cx-6, cy+dy-4); gfx.lineTo(cx-1, cy+dy); gfx.lineTo(cx+5, cy+dy-4); gfx.lineTo(cx+11, cy+dy);
          gfx.strokePath();
        }
      }
      // SAND (6): fine stipple dots
      if (terrain === 6) {
        gfx.fillStyle(0xddbb55, 0.55);
        for (const [ox, oy] of [[-8,0],[-4,-5],[0,2],[5,-3],[8,5],[-2,7],[4,6],[-6,5]]) {
          gfx.fillCircle(cx+ox, cy+oy, 1.2);
        }
      }
      // LIGHT WOODS (7): 3 sparse trees — smaller than dense forest
      if (terrain === 7) {
        for (const [ox, oy, s] of [[-7,-2,4],[4,-4,4],[0,5,4]]) {
          gfx.fillStyle(0x2a6818, 0.80);
          gfx.fillTriangle(cx+ox, cy+oy-s, cx+ox-s, cy+oy+s*0.6, cx+ox+s, cy+oy+s*0.6);
          gfx.fillStyle(0x4a9a2a, 0.5);
          gfx.fillTriangle(cx+ox, cy+oy-s-1, cx+ox-s*0.5, cy+oy, cx+ox+s*0.5, cy+oy);
          gfx.fillStyle(0x5a3010, 0.6);
          gfx.fillRect(cx+ox-1, cy+oy+s*0.6, 2, s*0.4);
        }
      }
    }

    // ── Outer border ───────────────────────────────────────────────────────
    gfx.lineStyle(strokeW, strokeColor);
    gfx.beginPath(); gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath(); gfx.strokePath();
  }

  _drawResourceOverlay(gfx, cx, cy, type) {
    if (type === 'OIL') {
      // Large dark oil seeps spread across the tile — visible under units
      const puddles = [[-8,2,8],[ 5,-5,6.5],[ 9,6,5.5],[-4,-7,5],[1,4,7],[6,-1,4.5],[-10,5,4],[-1,-3,5]];
      for (const [ox, oy, r] of puddles) {
        gfx.fillStyle(0x0a0a14, 0.72);
        gfx.fillEllipse(cx+ox, cy+oy, r*2.4, r*1.4);
      }
      // Iridescent oil sheen (blue/purple tint)
      gfx.fillStyle(0x2233aa, 0.32);
      gfx.fillEllipse(cx-6, cy+3, 14, 7);
      gfx.fillStyle(0x552277, 0.22);
      gfx.fillEllipse(cx+4, cy-2, 10, 5);
      gfx.fillStyle(0x44aacc, 0.18);
      gfx.fillEllipse(cx-2, cy+5, 8, 4);
    } else if (type === 'IRON') {
      // Gray/brown ore-crack network filling the tile
      // Cracks — thick enough to read under a unit
      gfx.lineStyle(2.5, 0x7a7a88, 0.72);
      gfx.beginPath();
      gfx.moveTo(cx-10, cy-2); gfx.lineTo(cx-2, cy+3); gfx.lineTo(cx+8, cy-4);
      gfx.moveTo(cx-2, cy+3); gfx.lineTo(cx+2, cy+10);
      gfx.moveTo(cx+8, cy-4); gfx.lineTo(cx+12, cy+2);
      gfx.moveTo(cx-10, cy-2); gfx.lineTo(cx-12, cy+4);
      gfx.moveTo(cx-6, cy-8); gfx.lineTo(cx-2, cy+3);
      gfx.strokePath();
      // Secondary fine cracks
      gfx.lineStyle(1.2, 0x999999, 0.5);
      gfx.beginPath();
      gfx.moveTo(cx+2, cy+10); gfx.lineTo(cx+6, cy+13);
      gfx.moveTo(cx-6, cy-8); gfx.lineTo(cx-10, cy-11);
      gfx.strokePath();
      // Ore nodules at crack nodes — darker with bright face
      for (const [ox, oy, s] of [[-10,-1,5],[8,-3,4.5],[2,10,4],[-5,-8,4],[12,2,3.5]]) {
        gfx.fillStyle(0x4a4a55, 0.85);
        gfx.fillTriangle(cx+ox, cy+oy-s, cx+ox-s, cy+oy+s*0.5, cx+ox+s, cy+oy+s*0.5);
        gfx.fillStyle(0xaaaacc, 0.55);
        gfx.fillTriangle(cx+ox, cy+oy-s, cx+ox, cy+oy, cx+ox+s, cy+oy+s*0.5);
      }
      // Metallic glint specks
      gfx.fillStyle(0xccccee, 0.65);
      for (const [ox, oy] of [[-9,0],[9,-2],[3,11],[-4,-7],[13,3],[1,-1]]) {
        gfx.fillCircle(cx+ox, cy+oy, 1.5);
      }
    } else if (type === 'WOOD') {
      // Stacked log silhouettes — brown rounds across tile
      for (const [ox, oy, rw, rh] of [[-8,3,7,4],[2,5,6,3.5],[8,-2,5.5,3],[-3,-6,5,3],[5,6,4.5,2.5]]) {
        gfx.fillStyle(0x5a3010, 0.8);
        gfx.fillEllipse(cx+ox, cy+oy, rw*2, rh*2);
        gfx.fillStyle(0x7a4a22, 0.5);
        gfx.fillEllipse(cx+ox, cy+oy-rh*0.3, rw*1.6, rh);
        // ring lines
        gfx.lineStyle(1, 0x3a1a00, 0.45);
        gfx.strokeCircle(cx+ox, cy+oy, rw*0.55);
      }
    }
  }

  // ── Static layers (resources, roads) ─────────────────────────────────────
  _drawStaticLayers() {
    this._drawTerrainDirect();
    this._redrawRoads();
  }

  _redrawRoads() {
    this.roadGfx.clear();
    const gs = this.gameState;
    const HEX_NEIGHBORS_LOCAL = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

    // Build a map of visible road hex -> tier (0=dirt, 1=concrete, 2=rail)
    // Own roads are always visible; enemy roads require discovery memory.
    const roadMap = new Map(); // key -> { tier, building }
    const curP = Number(gs.currentPlayer) || 1;
    const discovered = this._discovered?.[curP] || new Set();
    for (const b of gs.buildings) {
      if (b.type === 'ROAD' || b.type === 'CONCRETE_ROAD' || b.type === 'RAILWAY') {
        const key = `${b.q},${b.r}`;
        const isOwn = Number(b.owner) === curP;
        if (!isOwn && !discovered.has(key)) continue;
        const tier = b.type === 'RAILWAY' ? 2 : b.type === 'CONCRETE_ROAD' ? 1 : 0;
        roadMap.set(key, { tier, b });
      }
    }

    // Road tier styling
    const TIER_STYLE = [
      { color: 0xb89a6a, width: 3, alpha: 0.85 },  // 0: dirt — warm tan
      { color: 0xaaaaaa, width: 4, alpha: 0.90 },  // 1: concrete — grey
      { color: 0x555566, width: 5, alpha: 0.95 },  // 2: railway — dark steel
    ];

    // Seeded jitter helper (deterministic per hex pair so it's stable)
    const jitter = (q, r, nq, nr, t) => {
      const seed = ((q * 1619 + r * 31337 + nq * 7919 + nr * 4001) & 0xFFFFF);
      const rng  = ((seed ^ (seed >> 5)) * 0x9e3779b9) & 0xFFFFF;
      return (((rng >> 3) & 0xFF) / 255 - 0.5) * 6 * (1 - t); // max ±3px, zero at endpoints
    };

    // Draw road segments — each edge drawn from both hexes, deduplicate by only drawing q<=nq
    for (const [key, { tier }] of roadMap) {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToWorld(q, r);
      const style = TIER_STYLE[tier] || TIER_STYLE[0];

      for (const [dq, dr] of HEX_NEIGHBORS_LOCAL) {
        const nq = q + dq, nr = r + dr;
        const nKey = `${nq},${nr}`;
        if (!roadMap.has(nKey)) continue;
        // Only draw once per pair (lower q, or same q lower r)
        if (nq < q || (nq === q && nr < r)) continue;

        // Use the higher tier of the two endpoints
        const nTier = roadMap.get(nKey).tier;
        const drawTier = Math.max(tier, nTier);
        const s = TIER_STYLE[drawTier] || TIER_STYLE[0];
        const { x: nx, y: ny } = hexToWorld(nq, nr);

        // Midpoint with natural perpendicular jitter
        const mx = (x + nx) / 2, my = (y + ny) / 2;
        // Perpendicular direction
        const dx = nx - x, dy = ny - y;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const px = -dy / len, py = dx / len; // perpendicular unit vector
        const j = jitter(q, r, nq, nr, 0.5);
        const cpx = mx + px * j, cpy = my + py * j; // curved control point

        // Draw shadow (1px wider, dark)
        this.roadGfx.lineStyle(s.width + 2, 0x000000, s.alpha * 0.3);
        this.roadGfx.beginPath();
        this.roadGfx.moveTo(x, y);
        this.roadGfx.lineTo(cpx + 1, cpy + 1);
        this.roadGfx.lineTo(nx, ny);
        this.roadGfx.strokePath();

        // Draw road line with slight curve (quadratic via midpoint jitter)
        this.roadGfx.lineStyle(s.width, s.color, s.alpha);
        this.roadGfx.beginPath();
        this.roadGfx.moveTo(x, y);
        this.roadGfx.lineTo(cpx, cpy);
        this.roadGfx.lineTo(nx, ny);
        this.roadGfx.strokePath();

        // Railway ties
        if (drawTier === 2) {
          const steps = 4;
          this.roadGfx.lineStyle(2, 0x7a6a55, 0.7);
          for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const tx = x + (nx - x) * t, ty = y + (ny - y) * t;
            const tpx = px * 4, tpy = py * 4;
            this.roadGfx.beginPath();
            this.roadGfx.moveTo(tx - tpx, ty - tpy);
            this.roadGfx.lineTo(tx + tpx, ty + tpy);
            this.roadGfx.strokePath();
          }
        }
      }

      // Center junction dot
      this.roadGfx.fillStyle(style.color, style.alpha);
      this.roadGfx.fillCircle(x, y, style.width * 0.7);
    }
  }

  // ── Full refresh ──────────────────────────────────────────────────────────
  _refresh() {
    // Normalize currentPlayer defensively (prevents '2' string vs 2 number bugs across visibility logic)
    this.gameState.currentPlayer = Number(this.gameState.currentPlayer) || 1;
    // Recompute fog based on current unit positions (own units may have moved during planning).
    // We-go integrity is maintained by _origQ/_origR on enemy units — enemy display positions
    // are locked to turn-start regardless of fog recomputation.
    if (this.debugNoFog) {
      this._currentFog = null;
      if (this.fogRT) this.fogRT.setVisible(false);
    } else {
      this._currentFog = computeFog(this.gameState, this.gameState.currentPlayer, this.mapSize, this.terrain);
      // Track discovered hex memory per player (used for fogged-road visibility)
      this._discovered = this._discovered || { 1: new Set(), 2: new Set() };
      const cp = Number(this.gameState.currentPlayer) || 1;
      for (const k of this._currentFog || []) this._discovered[cp].add(k);
      if (this.fogRT) this.fogRT.setVisible(true);
    }
    this._redrawHighlights();
    this._redrawRoads();
    this._redrawBuildings();
    this._redrawUnits();
    this._redrawFog();
    this._drawSupplyOverlay();
    this._updateTopBar();
    this._updateBottomPanel();
    this.btnSubmit?.setVisible(true);
  }

  // ── Supply overlay ────────────────────────────────────────────────────────
  _drawSupplyOverlay() {
    this.supplyGfx.clear();
    if (!this._supplyOverlayOn) return;
    const gs = this.gameState;
    const p  = gs.currentPlayer;
    const ms = this.mapSize;
    const supplied = computeSupply(gs, p, ms);
    const NBR = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

    // 1) Base area fill (draw full set; no viewport cull to avoid camera-dependent artifacts)
    for (const key of supplied) {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToWorld(q, r);
      const verts = hexVertices(x, y);
      this.supplyGfx.fillStyle(0x44ff88, 0.18);
      this.supplyGfx.fillPoints(verts, true);
      this.supplyGfx.lineStyle(1, 0x44ff88, 0.22);
      this.supplyGfx.strokePoints(verts, true);
    }

    // 2) Outer boundary ring (only where supply meets non-supply)
    this.supplyGfx.lineStyle(2.2, 0x99ffcc, 0.85);
    for (const key of supplied) {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToWorld(q, r);
      const verts = hexVertices(x, y);
      for (let i = 0; i < 6; i++) {
        const [dq, dr] = NBR[i];
        const nq = q + dq, nr = r + dr;
        const nKey = `${nq},${nr}`;
        if (supplied.has(nKey)) continue; // internal edge, skip
        const a = verts[i];
        const b = verts[(i + 1) % 6];
        this.supplyGfx.beginPath();
        this.supplyGfx.moveTo(a.x, a.y);
        this.supplyGfx.lineTo(b.x, b.y);
        this.supplyGfx.strokePath();
      }
    }
  }

  _toggleSupplyOverlay() {
    this._supplyOverlayOn = !this._supplyOverlayOn;
    if (this.btnSupply) {
      this.btnSupply.setStyle({
        fill:            this._supplyOverlayOn ? '#44ff88' : '#445544',
        backgroundColor: this._supplyOverlayOn ? '#0a2a18' : '#111a11',
      });
    }
    this._drawSupplyOverlay();
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
    };
    const outlineHex = (q, r, color, lineW = 2.5, alpha = 1.0) => {
      const { x, y } = hexToWorld(q, r);
      const verts = hexVertices(x, y);
      this.highlightGfx.lineStyle(lineW, color, alpha);
      this.highlightGfx.beginPath(); this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath(); this.highlightGfx.strokePath();
    };

    for (const { q, r } of this.reachable) fillHex(q, r, MOVE_HIGHLIGHT, 0.25);
    if (this.mode === 'attack_direct') {
      // Direct attack: red outline only on attackable hexes
      for (const { q, r } of this.attackable) outlineHex(q, r, ATTACK_HIGHLIGHT, 2.5);
    } else if (this.mode === 'attack') {
      // Blind fire: outline all range hexes; bright for visible enemies, dim for unknowns
      const gs = this.gameState;
      const fog = this._currentFog;
      for (const { q, r } of this.attackable) {
        const hasVisibleEnemy = gs.units.some(u => {
          if (u.owner === gs.currentPlayer || u.dead) return false;
          if (u.q !== q || u.r !== r) return false;
          if (fog && !fog.has(`${dq},${dr}`)) return false;
          return true;
        });
        outlineHex(q, r, ATTACK_HIGHLIGHT, 2.5, hasVisibleEnemy ? 1.0 : 0.3);
      }
    } else {
      for (const { q, r } of this.attackable) outlineHex(q, r, ATTACK_HIGHLIGHT, 2.0, 0.7);
    }

    if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r, this.mapSize)) {
      const { x, y } = hexToWorld(this.hoveredHex.q, this.hoveredHex.r);
      // Hover = transparent tint + bright border only — don't paint over baked terrain art
      const verts = hexVertices(x, y);
      this.highlightGfx.fillStyle(0xffffff, 0.10);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath(); this.highlightGfx.fillPath();
      this.highlightGfx.lineStyle(2, HOVER_STROKE, 1.0);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath(); this.highlightGfx.strokePath();
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
  // Compute camera viewport bounds in world space from scroll+zoom directly.
  // Using camera.worldView can return stale/zero dimensions during input event handlers,
  // causing all units/buildings to fail the cull check and disappear.
  _vpBounds(buf = HEX_SIZE * 3) {
    const cam = this.cameras.main;
    const cw  = cam.width  || this.scale.width;
    const ch  = cam.height || this.scale.height;
    const hw  = (cw / 2) / cam.zoom;
    const hh  = (ch / 2) / cam.zoom;
    const cx  = cam.scrollX + hw;
    const cy  = cam.scrollY + hh;
    return { L: cx - hw - buf, R: cx + hw + buf, T: cy - hh - buf, B: cy + hh + buf };
  }

  _redrawBuildings() {
    this.buildingGfx.clear();
    if (this.farmTileLayer) this.farmTileLayer.removeAll(true);
    // Viewport culling (large-map perf)
    const { L: _bvpL, R: _bvpR, T: _bvpT, B: _bvpB } = this._vpBounds();
    const fog = this._currentFog || null;

    const curP = Number(this.gameState.currentPlayer);
    for (const b of this.gameState.buildings) {
      try {
        if (ROAD_TYPES.has(b.type)) continue;
        // Fog-of-war: hide enemy buildings only when fog set is valid/non-empty
        if (fog && fog.size > 0 && Number(b.owner) !== curP && !fog.has(`${b.q},${b.r}`)) continue;
        const { x, y } = hexToWorld(b.q, b.r);
        // TEMP safety: disable building viewport culling to prevent disappearance regressions
        // if (x < _bvpL || x > _bvpR || y < _bvpT || y > _bvpB) continue;
        const color = PLAYER_COLORS[b.owner] || 0x888888;
        const s = HEX_SIZE * 0.3;

        // FARM is rendered as a terrain tile swap/overlay (not a building icon).
        if (b.type === 'FARM') {
          // Hard-visible farm tile: explicit cultivated field rendering (no subtle blend).
          const verts = hexVertices(x, y);
          const targetW = HEX_SIZE * 2;
          const targetH = Math.round(HEX_SIZE * Math.sqrt(3) * ISO_SQUISH);

          const farmFx = this.add.graphics().setDepth(0);
          // Base farm fill
          farmFx.fillStyle(0x7f5a2a, 0.95);
          farmFx.beginPath();
          farmFx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) farmFx.lineTo(verts[i].x, verts[i].y);
          farmFx.closePath();
          farmFx.fillPath();

          // Strong furrow stripes (primary visibility cue)
          for (let fy = y - targetH * 0.30, row = 0; fy <= y + targetH * 0.30; fy += 4, row++) {
            const col = row % 2 === 0 ? 0x4f3517 : 0xa8793a;
            const a = row % 2 === 0 ? 0.82 : 0.55;
            farmFx.lineStyle(2.0, col, a);
            farmFx.beginPath();
            farmFx.moveTo(x - targetW * 0.34, fy);
            farmFx.lineTo(x + targetW * 0.34, fy);
            farmFx.strokePath();
          }

          // Crop speckles for texture identity
          farmFx.fillStyle(0x9fc05e, 0.55);
          for (let i = 0; i < 42; i++) {
            const rx = x - targetW * 0.30 + ((i * 13) % Math.floor(targetW * 0.60));
            const ry = y - targetH * 0.26 + ((i * 17) % Math.floor(targetH * 0.52));
            farmFx.fillRect(rx, ry, 2, 2);
          }

          // Bold bright outline so farm is unmistakable.
          farmFx.lineStyle(2.4, 0xf0c36b, 0.98);
          farmFx.beginPath();
          farmFx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) farmFx.lineTo(verts[i].x, verts[i].y);
          farmFx.closePath();
          farmFx.strokePath();

          // Owner marker (larger and obvious)
          const badgeBg = this.add.rectangle(x + HEX_SIZE * 0.29, y - HEX_SIZE * 0.29, 20, 11, 0x111111, 0.9)
            .setStrokeStyle(1.4, 0xf0d8a0, 0.95).setDepth(1);
          const badge = this.add.circle(x + HEX_SIZE * 0.21, y - HEX_SIZE * 0.29, 4.0, color, 1.0)
            .setStrokeStyle(1, 0x111111, 0.95).setDepth(2);
          const glyph = this.add.text(x + HEX_SIZE * 0.33, y - HEX_SIZE * 0.29, 'F', {
            font: 'bold 9px monospace', fill: '#f6e3b6'
          }).setOrigin(0.5).setDepth(2);

          this.farmTileLayer?.add([farmFx, badgeBg, badge, glyph]);
          continue;
        }

      // ── Helper: pixel-building style with subtle team accents (less color dominance) ──
      const g = this.buildingGfx;
      const _mix = (a, b, t) => {
        const ca = Phaser.Display.Color.IntegerToColor(a);
        const cb = Phaser.Display.Color.IntegerToColor(b);
        return Phaser.Display.Color.GetColor(
          Math.floor(ca.red * (1 - t) + cb.red * t),
          Math.floor(ca.green * (1 - t) + cb.green * t),
          Math.floor(ca.blue * (1 - t) + cb.blue * t)
        );
      };
      const teamAccent = _mix(color, 0xffffff, 0.18);
      const _bldgRect = (bx, by, bw, bh, bodyColor) => {
        const px = Math.floor(bx), py = Math.floor(by), pw = Math.max(8, Math.floor(bw)), ph = Math.max(6, Math.floor(bh));
        const mutedBody = _mix(bodyColor, 0x777777, 0.35);
        g.fillStyle(0x000000, 0.55); g.fillRect(px + 2, py + 2, pw, ph); // shadow
        g.fillStyle(mutedBody);      g.fillRect(px, py, pw, ph);
        // subtle checker/noise to feel pixel-art tile-like
        g.fillStyle(_mix(mutedBody, 0x222222, 0.18), 0.35);
        for (let ix = 1; ix < pw - 1; ix += 4) {
          for (let iy = 1; iy < ph - 1; iy += 4) {
            if (((ix + iy) / 4) % 2 === 0) g.fillRect(px + ix, py + iy, 2, 2);
          }
        }
        // thin team accent strip instead of fully team-colored building
        g.fillStyle(teamAccent, 0.85); g.fillRect(px + 1, py + 1, pw - 2, 3);
        g.lineStyle(1.2, teamAccent, 0.95); g.strokeRect(px, py, pw, ph);
        // inner highlight
        g.lineStyle(1, 0xffffff, 0.22); g.beginPath();
        g.moveTo(px, py + ph - 1); g.lineTo(px, py); g.lineTo(px + pw - 1, py);
        g.strokePath();
      };
      const _flagpole = (px, py, fh) => {
        g.fillStyle(0xdddddd); g.fillRect(px - s*0.06, py - fh, s*0.12, fh);
        g.fillStyle(teamAccent);
        g.fillTriangle(px + s*0.06, py - fh + s*0.05, px + s*0.06, py - fh + s*0.4, px + s*0.45, py - fh + s*0.22);
      };

      if (b.type === 'HQ') {
        // HQ: command block + center keep + watch windows
        const bw = s * 2.05, bh = s * 1.35;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x6f6b62);
        // Keep/tower core
        _bldgRect(x - s*0.46, y - bh/2 - s*0.62, s*0.92, s*0.62, 0x7b766a);
        // Roof peak
        g.fillStyle(0x1f1f1f, 0.85);
        g.fillTriangle(x - s*0.58, y - bh/2 - s*0.62, x + s*0.58, y - bh/2 - s*0.62, x, y - bh/2 - s*1.08);
        // Windows/slits
        g.fillStyle(0xbfd8ff, 0.55);
        g.fillRect(x - s*0.62, y - s*0.05, s*0.14, s*0.16);
        g.fillRect(x - s*0.08, y - s*0.05, s*0.14, s*0.16);
        g.fillRect(x + s*0.46, y - s*0.05, s*0.14, s*0.16);
        // Door
        g.fillStyle(0x2a2119, 0.85); g.fillRect(x - s*0.18, y + s*0.16, s*0.36, s*0.34);
        _flagpole(x + s*0.62, y - bh/2, s * 1.25);

      } else if (b.type === 'MINE') {
        // Mine: pit mouth + timber frame + ore carts
        const bw = s * 1.85, bh = s * 0.9;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x57534b);
        // Shaft mouth
        g.fillStyle(0x1a1a1a, 0.9); g.fillRect(x - s*0.34, y - s*0.02, s*0.68, s*0.28);
        // Timber supports
        g.fillStyle(0x7a6248, 0.95);
        g.fillRect(x - s*0.4, y - s*0.12, s*0.08, s*0.42);
        g.fillRect(x + s*0.32, y - s*0.12, s*0.08, s*0.42);
        g.fillRect(x - s*0.4, y - s*0.12, s*0.8, s*0.08);
        // Ore carts
        g.fillStyle(0x8b8f94, 0.9);
        g.fillRect(x - s*0.72, y + s*0.1, s*0.24, s*0.14);
        g.fillRect(x + s*0.48, y + s*0.1, s*0.24, s*0.14);
        g.fillStyle(teamAccent, 0.8); g.fillRect(x - s*0.72, y + s*0.08, s*0.24, s*0.03);
        g.fillStyle(teamAccent, 0.8); g.fillRect(x + s*0.48, y + s*0.08, s*0.24, s*0.03);

      } else if (b.type === 'OIL_PUMP') {
        // Oil pump: base pad + derrick + pumpjack arm
        const bw = s * 1.68, bh = s * 0.76;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x2e2e36);
        // Derrick frame
        g.lineStyle(1.4, 0xa4a8ad, 0.9);
        g.beginPath();
        g.moveTo(x - s*0.5, y + s*0.18); g.lineTo(x - s*0.28, y - s*0.78);
        g.lineTo(x - s*0.06, y + s*0.18); g.strokePath();
        g.beginPath(); g.moveTo(x - s*0.44, y - s*0.46); g.lineTo(x - s*0.12, y - s*0.46); g.strokePath();
        // Pumpjack arm
        g.lineStyle(1.8, teamAccent, 0.95);
        g.beginPath(); g.moveTo(x - s*0.05, y - s*0.55); g.lineTo(x + s*0.55, y - s*0.35); g.strokePath();
        g.fillStyle(teamAccent, 0.95); g.fillCircle(x + s*0.55, y - s*0.35, s*0.1);
        // Well head + spill channel
        g.fillStyle(0x11161a, 0.9); g.fillRect(x + s*0.2, y - s*0.05, s*0.16, s*0.2);
        g.fillStyle(0x2f3d4f, 0.85); g.fillRect(x + s*0.38, y + s*0.08, s*0.26, s*0.08);

      } else if (b.type === 'VEHICLE_DEPOT' || b.type === 'ARMOR_WORKS') {
        // Vehicle Depot: wide factory — team-colored walls, dark roof, smokestacks
        const bw = s * 2.2, bh = s * 1.1;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, color);
        // Dark roof strip
        g.fillStyle(0x000000, 0.3); g.fillRect(x - bw/2, y - bh/2, bw, bh*0.3);
        // Smokestacks
        g.fillStyle(0x222222); g.fillRect(x - bw*0.28, y - bh/2 - s*0.8, s*0.35, s*0.85);
        g.fillStyle(0x222222); g.fillRect(x + bw*0.1,  y - bh/2 - s*0.6, s*0.35, s*0.65);
        g.fillStyle(0xddccbb, 0.5); g.fillRect(x - bw*0.28, y - bh/2 - s*0.85, s*0.35, s*0.12); // rim
        g.fillStyle(0xddccbb, 0.5); g.fillRect(x + bw*0.1,  y - bh/2 - s*0.65, s*0.35, s*0.12);
        // Vehicle silhouette (tank outline)
        g.lineStyle(1.5, 0xffffff, 0.45);
        g.strokeRect(x - s*0.55, y - s*0.1, s*1.1, s*0.45);
        g.beginPath(); g.moveTo(x - s*0.2, y - s*0.1); g.lineTo(x + s*0.2, y - s*0.35); g.lineTo(x + s*0.4, y - s*0.1); g.strokePath();

      } else if (b.type === 'BUNKER') {
        // Bunker: team-colored low hex dome with embrasure slits
        const verts = hexVertices(x, y).map(v => ({ x: x + (v.x-x)*0.52, y: y + (v.y-y)*0.52 }));
        g.fillStyle(0x000000, 0.45); // shadow
        g.beginPath(); g.moveTo(verts[0].x+2, verts[0].y+2);
        for (let i=1;i<verts.length;i++) g.lineTo(verts[i].x+2, verts[i].y+2);
        g.closePath(); g.fillPath();
        // Body (blended team color + olive)
        const bunkColor = Phaser.Display.Color.IntegerToColor(color);
        g.fillStyle(Phaser.Display.Color.GetColor(
          Math.floor(bunkColor.red*0.4+0x44*0.6),
          Math.floor(bunkColor.green*0.4+0x55*0.6),
          Math.floor(bunkColor.blue*0.4+0x33*0.6)));
        g.beginPath(); g.moveTo(verts[0].x, verts[0].y);
        for (let i=1;i<verts.length;i++) g.lineTo(verts[i].x, verts[i].y);
        g.closePath(); g.fillPath();
        g.lineStyle(2.5, color, 1.0);
        g.beginPath(); g.moveTo(verts[0].x, verts[0].y);
        for (let i=1;i<verts.length;i++) g.lineTo(verts[i].x, verts[i].y);
        g.closePath(); g.strokePath();
        // Embrasure slits
        g.lineStyle(1.5, 0x000000, 0.7);
        g.beginPath(); g.moveTo(x - s*0.28, y); g.lineTo(x + s*0.28, y); g.strokePath();
        g.beginPath(); g.moveTo(x, y - s*0.28); g.lineTo(x, y + s*0.28); g.strokePath();

      } else if (b.type === 'OBS_POST') {
        // Observation Post: team-colored tower with platform
        // Base
        g.fillStyle(0x000000, 0.4); g.fillRect(x - s*0.22, y - s*0.3, s*0.44, s*0.7); // shadow
        g.fillStyle(color); g.fillRect(x - s*0.19, y - s*0.3, s*0.38, s*0.65);
        // Tower shaft
        g.fillStyle(0x000000, 0.4); g.fillRect(x - s*0.16, y - s*1.5, s*0.32, s*1.25); // shadow
        g.fillStyle(color); g.fillRect(x - s*0.13, y - s*1.45, s*0.26, s*1.2);
        // Platform (wider)
        g.fillStyle(0x000000, 0.45); g.fillRect(x - s*0.52, y - s*1.6, s*1.04, s*0.28);
        g.fillStyle(0xddddcc); g.fillRect(x - s*0.5, y - s*1.58, s*1.0, s*0.25);
        g.lineStyle(1.5, color, 1.0); g.strokeRect(x - s*0.5, y - s*1.58, s*1.0, s*0.25);
        // Telescope dot
        g.fillStyle(color); g.fillCircle(x + s*0.3, y - s*1.5, s*0.13);

      } else if (b.type === 'BARRACKS' || b.type === 'ADV_BARRACKS') {
        // Barracks: long hall + roof + window row (pixel military block)
        const bw = s * 2.0, bh = s * 1.12;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x6a6f63);
        // Roof slab
        g.fillStyle(0x2f3330, 0.9); g.fillRect(x - bw/2 - 1, y - bh/2 - s*0.24, bw + 2, s*0.24);
        // Roof vents
        g.fillStyle(0x888, 0.9);
        g.fillRect(x - s*0.52, y - bh/2 - s*0.22, s*0.18, s*0.1);
        g.fillRect(x + s*0.34, y - bh/2 - s*0.22, s*0.18, s*0.1);
        // Window row
        g.fillStyle(0xb9d0f0, 0.45);
        for (let i = -2; i <= 2; i++) g.fillRect(x + i*s*0.24 - s*0.06, y - s*0.04, s*0.12, s*0.14);
        // Door + steps
        g.fillStyle(0x2b241d, 0.9); g.fillRect(x - s*0.16, y + s*0.12, s*0.32, s*0.36);
        g.fillStyle(0x555, 0.8); g.fillRect(x - s*0.22, y + s*0.48, s*0.44, s*0.08);

      } else if (b.type === 'LUMBER_CAMP') {
        // Lumber Camp: team-colored small hut + log cross-sections
        const bw = s * 1.5, bh = s * 0.9;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, color);
        g.fillStyle(0x000000, 0.3);
        g.fillTriangle(x - bw/2 - 1, y - bh/2, x + bw/2 + 1, y - bh/2, x, y - bh/2 - s*0.7);
        // Axe symbol
        g.lineStyle(2, 0xffffff, 0.75);
        g.beginPath(); g.moveTo(x - s*0.5, y + s*0.25); g.lineTo(x + s*0.4, y - s*0.5); g.strokePath();
        g.fillStyle(0xffffff, 0.75);
        g.fillTriangle(x + s*0.2, y - s*0.55, x + s*0.55, y - s*0.25, x + s*0.55, y - s*0.6);

      } else if (b.type === 'NAVAL_YARD' || b.type === 'NAVAL_DOCKYARD') {
        // Naval Yard: dock hall + gantry crane + slipway
        const bw = s * 2.15, bh = s * 1.02;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x4e5a62);
        // Slipway basin
        g.fillStyle(0x233a50, 0.85); g.fillRect(x - bw*0.28, y - bh/2 + s*0.14, bw*0.56, bh*0.66);
        // Hull chunk
        g.fillStyle(0x7f909d, 0.85); g.fillRect(x - s*0.32, y + s*0.02, s*0.64, s*0.14);
        g.fillTriangle(x + s*0.32, y + s*0.02, x + s*0.52, y + s*0.09, x + s*0.32, y + s*0.16);
        // Crane mast + boom
        g.fillStyle(0xcfd6dc, 0.95); g.fillRect(x - s*0.7, y - bh/2 - s*0.98, s*0.15, s*1.0);
        g.fillRect(x - s*0.7, y - bh/2 - s*0.98, s*0.72, s*0.12);
        g.lineStyle(1, 0xcfd6dc, 0.8); g.beginPath();
        g.moveTo(x - s*0.18, y - bh/2 - s*0.86); g.lineTo(x - s*0.18, y - bh/2 - s*0.22); g.strokePath();

      } else if (b.type === 'HARBOR') {
        // Harbor: team-colored pier with dock arms and water suggestion
        const bw = s * 2.0, bh = s * 0.75;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, color);
        // Dock arm left
        g.fillStyle(0xffffff, 0.7); g.fillRect(x - bw*0.42, y - bh/2 - s*0.6, s*0.22, s*0.65);
        // Dock arm right
        g.fillStyle(0xffffff, 0.7); g.fillRect(x + bw*0.2, y - bh/2 - s*0.6, s*0.22, s*0.65);
        // Water squiggle
        g.lineStyle(1.5, 0x44aaff, 0.6);
        g.beginPath(); g.moveTo(x - s*0.6, y + s*0.12); g.lineTo(x - s*0.2, y - s*0.05);
        g.lineTo(x + s*0.2, y + s*0.12); g.lineTo(x + s*0.6, y - s*0.05); g.strokePath();

      } else if (b.type === 'DRY_DOCK') {
        // Dry Dock: team-colored U-shaped structure with ship hull inside
        const bw = s * 2.3, bh = s * 1.2;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, color);
        // Inner dock channel (dark water)
        g.fillStyle(0x112244); g.fillRect(x - bw*0.27, y - bh/2 + s*0.18, bw*0.54, bh*0.7);
        // Ship hull cross-section
        g.lineStyle(1.5, 0x88bbdd, 0.7);
        g.strokeEllipse(x, y + s*0.15, bw*0.42, s*0.55);
        // Supports/keel blocks
        g.fillStyle(0x888888, 0.8);
        for (let i = -1; i <= 1; i++) {
          g.fillRect(x + i*s*0.35 - s*0.07, y - bh/2 + s*0.16, s*0.14, s*0.22);
        }

      } else if (b.type === 'NAVAL_BASE') {
        // Naval base: fortified command quay + dry basin + tower
        const bw = s * 2.56, bh = s * 1.44;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x4f5d68);
        // Inner basin
        g.fillStyle(0x1e3448, 0.86); g.fillRect(x - bw*0.26, y - bh/2 + s*0.18, bw*0.52, bh*0.74);
        // Quay blocks
        g.fillStyle(0x6f7f8b, 0.85);
        g.fillRect(x - bw*0.42, y + s*0.02, s*0.26, s*0.18);
        g.fillRect(x + bw*0.16, y + s*0.02, s*0.26, s*0.18);
        // Command tower
        _bldgRect(x - bw*0.43, y - bh/2 - s*0.58, s*0.56, s*0.58, 0x707a82);
        g.fillStyle(0xb8c9d8, 0.45); g.fillRect(x - bw*0.39, y - bh/2 - s*0.42, s*0.38, s*0.12);
        // Prow silhouette
        g.fillStyle(0x98adbf, 0.8);
        g.fillTriangle(x + s*0.1, y + s*0.02, x + s*0.56, y - s*0.16, x + s*0.56, y + s*0.2);
        _flagpole(x - bw*0.16, y - bh/2, s * 1.0);

      } else if (b.type === 'AIRFIELD' || b.type === 'ADV_AIRFIELD') {
        // Airfield: tarmac pad + runway markings + hangar slab
        const bw = s * 2.42, bh = s * 1.52;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x737a80);
        // Tarmac
        g.fillStyle(0x565d64, 0.8); g.fillRect(x - bw/2 + 2, y - bh/2 + 2, bw - 4, bh - 4);
        // Runway stripe and centerline
        g.fillStyle(0x9aa3ac, 0.85); g.fillRect(x - bw*0.42, y - s*0.11, bw*0.84, s*0.22);
        g.fillStyle(0xe5e8ea, 0.75);
        for (let i = -2; i <= 2; i++) g.fillRect(x + i*s*0.22 - s*0.03, y - s*0.03, s*0.06, s*0.06);
        // Hangar block
        g.fillStyle(0x444a50, 0.95); g.fillRect(x - s*0.95, y - bh/2 + s*0.15, s*0.72, s*0.5);
        g.fillStyle(0x2b2f33, 0.95); g.fillRect(x - s*0.88, y - bh/2 + s*0.23, s*0.58, s*0.34);
        // Windsock
        g.fillStyle(0xd8d8d8, 0.9); g.fillRect(x + bw*0.3, y - bh/2 - s*0.58, s*0.1, s*0.62);
        g.fillStyle(teamAccent, 0.9);
        g.fillTriangle(x + bw*0.3 + s*0.1, y - bh/2 - s*0.54,
          x + bw*0.3 + s*0.1, y - bh/2 - s*0.26,
          x + bw*0.3 + s*0.52, y - bh/2 - s*0.4);

      } else if (b.type === 'FARM') {
        // Farm: furrow patch + barn + silo
        const bw = s * 1.9, bh = s * 1.22;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x5f6b49);
        // Furrows
        g.lineStyle(1.2, 0x3f5a31, 0.78);
        for (let i = 0; i < 5; i++) {
          const ry = y - bh/2 + 4 + i * (bh - 8) / 4;
          g.beginPath(); g.moveTo(x - bw/2 + 3, ry); g.lineTo(x + bw/2 - 3, ry); g.strokePath();
        }
        // Barn
        g.fillStyle(0x8c3f2a, 0.95); g.fillRect(x + s*0.2, y - s*0.28, s*0.46, s*0.38);
        g.fillStyle(0x5c2619, 0.95); g.fillTriangle(x + s*0.16, y - s*0.28, x + s*0.70, y - s*0.28, x + s*0.43, y - s*0.56);
        // Silo
        g.fillStyle(0x9b9fa4, 0.9); g.fillRect(x - s*0.72, y - s*0.34, s*0.2, s*0.46);
        g.fillStyle(0xc9ced3, 0.9); g.fillCircle(x - s*0.62, y - s*0.34, s*0.1);

      } else if (b.type === 'MARKET') {
        // Market: stalls + canopies + coin sign
        const bw = s * 1.85, bh = s * 0.96;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x6a5d49);
        // Canopies
        const stripeW = bw / 6;
        for (let i = 0; i < 6; i++) {
          g.fillStyle(i%2===0 ? 0xd8d2c3 : teamAccent, 0.55);
          g.fillRect(x - bw/2 + i*stripeW, y - bh/2 - s*0.34, stripeW, s*0.34);
        }
        // Stall fronts
        g.fillStyle(0x463a2b, 0.85);
        g.fillRect(x - s*0.78, y - s*0.02, s*0.42, s*0.24);
        g.fillRect(x - s*0.24, y - s*0.02, s*0.42, s*0.24);
        g.fillRect(x + s*0.30, y - s*0.02, s*0.42, s*0.24);
        // Coin sign
        g.fillStyle(0xffcc55, 0.95); g.fillCircle(x, y + s*0.08, s*0.22);
        g.lineStyle(1.2, 0x000000, 0.35); g.strokeCircle(x, y + s*0.08, s*0.22);

      } else if (b.type === 'SCIENCE_LAB') {
        // Science lab: modular lab block + dish + glass tanks
        const bw = s * 1.78, bh = s * 1.14;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x556171);
        g.fillStyle(0x2f3e4d, 0.88); g.fillRect(x - bw/2 + 2, y - bh/2 + 2, bw - 4, bh - 4);
        // Satellite dish
        g.lineStyle(1.6, 0xd5dde5, 0.9);
        g.strokeEllipse(x - s*0.42, y - bh/2 - s*0.42, s*0.5, s*0.24);
        g.beginPath(); g.moveTo(x - s*0.42, y - bh/2 - s*0.3); g.lineTo(x - s*0.26, y - bh/2 - s*0.08); g.strokePath();
        // Lab glass columns
        g.fillStyle(0x95c6ff, 0.45);
        g.fillRect(x - s*0.06, y - s*0.2, s*0.14, s*0.42);
        g.fillRect(x + s*0.2, y - s*0.2, s*0.14, s*0.42);
        // Accent probe light
        g.fillStyle(teamAccent, 0.85); g.fillCircle(x + s*0.52, y - bh/2 - s*0.2, s*0.1);

      } else if (b.type === 'FACTORY') {
        // Factory: industrial block with sawtooth roof, vents, and status lamp
        const bw = s * 1.96, bh = s * 1.24;
        _bldgRect(x - bw/2, y - bh/2, bw, bh, 0x656565);
        g.fillStyle(0x3f3f3f, 0.9); g.fillRect(x - bw/2 + 2, y - bh/2 + 2, bw - 4, bh - 4);
        // Sawtooth roof profile
        g.fillStyle(0x2f2f2f, 0.95);
        for (let i = -2; i <= 1; i++) {
          const rx = x + i*s*0.36;
          g.fillTriangle(rx - s*0.16, y - bh/2 + s*0.08, rx + s*0.16, y - bh/2 + s*0.08, rx + s*0.02, y - bh/2 - s*0.18);
        }
        // Smokestacks
        g.fillStyle(0x5a5a5a, 1.0);
        g.fillRect(x - s*0.58, y - bh/2 - s*0.48, s*0.2, s*0.48);
        g.fillRect(x - s*0.12, y - bh/2 - s*0.58, s*0.2, s*0.58);
        g.fillRect(x + s*0.34, y - bh/2 - s*0.4, s*0.2, s*0.4);
        // Window strip
        g.fillStyle(0xb8c7d8, 0.35);
        for (let i = -2; i <= 2; i++) g.fillRect(x + i*s*0.22 - s*0.06, y + s*0.03, s*0.12, s*0.1);
        // Status light (green when active, red when toggled off)
        const active = (b.active !== false);
        g.fillStyle(active ? 0x44cc66 : 0xcc4444, 0.95);
        g.fillCircle(x + s*0.62, y + s*0.28, s*0.12);

      } else if (b.type === 'TRENCH') {
        // Trench: earthy zigzag
        g.fillStyle(0x887755, 0.7);
        g.fillRect(x - s*0.9, y - s*0.15, s*1.8, s*0.3);
        g.lineStyle(2, 0x665533, 0.9);
        g.beginPath(); g.moveTo(x - s*0.8, y); g.lineTo(x - s*0.4, y - s*0.3);
        g.lineTo(x, y + s*0.1); g.lineTo(x + s*0.4, y - s*0.3); g.lineTo(x + s*0.8, y); g.strokePath();

      } else if (b.type === 'AT_DITCH') {
        // AT Ditch: dark diagonal cuts
        g.fillStyle(0x553300, 0.8); g.fillRect(x - s*0.9, y - s*0.2, s*1.8, s*0.4);
        g.lineStyle(2, 0x221100, 0.9);
        for (let i = -3; i <= 3; i++) {
          g.beginPath(); g.moveTo(x + i*s*0.28 - s*0.15, y - s*0.2);
          g.lineTo(x + i*s*0.28 + s*0.15, y + s*0.2); g.strokePath();
        }

      } else if (b.type === 'PONTOON_BRIDGE') {
        // Pontoon Bridge: light brown planks over water
        g.fillStyle(0xccbb88, 0.85); g.fillRect(x - s*0.95, y - s*0.18, s*1.9, s*0.36);
        g.lineStyle(1.5, 0x998866, 0.8);
        for (let i = -3; i <= 3; i++) {
          const bx = x + i * s*0.28;
          g.beginPath(); g.moveTo(bx, y - s*0.18); g.lineTo(bx, y + s*0.18); g.strokePath();
        }
        // Float circles
        g.fillStyle(0x8899aa, 0.6);
        for (let i = -2; i <= 2; i++) g.fillCircle(x + i*s*0.35, y, s*0.1);
      }

      // ── Under-construction overlay ──────────────────────────────────────
      if (b.underConstruction) {
        const prog = b.buildProgress || 0;
        const total = b.buildTurnsRequired || 1;
        const fraction = prog / total;
        const hw = HEX_SIZE * 0.42;

        // Diagonal scaffolding hatching
        this.buildingGfx.lineStyle(1.5, 0xffcc00, 0.55);
        for (let i = -3; i <= 3; i++) {
          this.buildingGfx.beginPath();
          this.buildingGfx.moveTo(x + i * hw * 0.5 - hw, y - hw * 0.5);
          this.buildingGfx.lineTo(x + i * hw * 0.5 + hw, y + hw * 0.5);
          this.buildingGfx.strokePath();
        }

        // Progress bar background
        const barW = HEX_SIZE * 0.7, barH = 5;
        const barX = x - barW / 2, barY = y + HEX_SIZE * 0.28;
        this.buildingGfx.fillStyle(0x000000, 0.7);
        this.buildingGfx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        this.buildingGfx.fillStyle(0x888888, 0.8);
        this.buildingGfx.fillRect(barX, barY, barW, barH);
        this.buildingGfx.fillStyle(0xffcc00, 1.0);
        this.buildingGfx.fillRect(barX, barY, barW * fraction, barH);

        // Turn counter text: "2/3"
        this.buildingGfx.fillStyle(0x000000, 0.75);
        this.buildingGfx.fillRect(x - 10, barY - 12, 20, 11);
      }
      } catch (e) {
        // Prevent a single bad building definition from wiping the whole layer
        continue;
      }
    }

    // Remove floating construction text labels (they were duplicating/confusing).
    // Keep only the on-tile progress bar/scaffolding visual in buildingGfx.
    if (this._constructionLabels) {
      this._constructionLabels.forEach(t => t.destroy());
      this._constructionLabels = [];
    }
  }

  _unitShownTier(unit) {
    const gs = this.gameState;
    const def = UNIT_TYPES[unit.type] || {};
    const chassisTier = def.tier ?? 0;
    let modTier = 0;
    if (unit.designId !== undefined) {
      const d = gs.designs?.[unit.owner]?.find(dd => dd.id === unit.designId);
      if (d?.modules?.length) modTier = Math.max(0, ...d.modules.map(mk => MODULES[mk]?.tier ?? 0));
    }
    // Fallback inference: tech-gated chassis and stat deltas.
    let inferred = 0;
    if (def.unlockedBy) inferred = Math.max(inferred, (def.cost?.components || 0) > 0 ? 2 : 1);
    if (modTier === 0) {
      const base = UNIT_TYPES[unit.type] || {};
      const keys = ['soft_attack','hard_attack','pierce','armor','defense','range','move','accuracy','evasion','health','sight'];
      const delta = keys.reduce((s, k) => s + Math.abs((unit[k] ?? base[k] ?? 0) - (base[k] ?? 0)), 0);
      if (delta >= 1) inferred = Math.max(inferred, delta >= 6 ? 2 : 1);
    }
    return Math.max(0, Math.min(3, Math.max(chassisTier, modTier, inferred)));
  }

  // ── Units ─────────────────────────────────────────────────────────────────
  _redrawUnits() {
    this.unitGfx.clear();
    if (this._unitTierLabels) {
      for (const t of this._unitTierLabels) { try { t.destroy(); } catch(e){} }
    }
    this._unitTierLabels = [];
    const gs  = this.gameState;
    const fog = this._currentFog;

    // Build stacked-hex map: key "q,r" -> count of non-embarked visible units on that hex
    const _stackCount = new Map();
    for (const u of gs.units) {
      if (u.embarked) continue;
      const k = `${u.q},${u.r}`;
      _stackCount.set(k, (_stackCount.get(k) || 0) + 1);
    }
    // Viewport culling (large-map perf) — uses scroll+zoom, not worldView (avoids stale rect)
    const { L: _uvpL, R: _uvpR, T: _uvpT, B: _uvpB } = this._vpBounds();

    const curP = Number(gs.currentPlayer);
    for (const unit of gs.units) {
      // IGOUGO: all positions are real/immediate — no we-go display offset needed
      const isEnemy = Number(unit.owner) !== curP;
      const dispQ = unit.q;
      const dispR = unit.r;

      // Skip embarked units (they're inside a transport)
      if (unit.embarked) continue;

      // (no skip needed — slide animation is handled by interpolated position below)

      // Hide enemy units in fog (use display position, not queued position)
      const key = `${dispQ},${dispR}`;
      if (isEnemy && fog && fog.size > 0 && !fog.has(key)) continue;
      // Stealth: hide stealthy enemy units unless detected.
      // But if they have attacked, reveal them (no invisible firing).
      if (isEnemy && (UNIT_TYPES[unit.type]?.stealthy || 0) > 0) {
        const revealedByFiring = !!unit.attacked;
        if (!revealedByFiring && !isStealthDetected(gs, unit, gs.currentPlayer)) continue; // not detected — skip render
      }

      // If this unit is currently sliding, interpolate between from/to world coords
      let x, y;
      const _ss = this._slideState;
      if (_ss && _ss.unit === unit) {
        const t    = Math.min(1, (performance.now() - _ss.startTime) / _ss.duration);
        const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
        x = _ss.fromX + (_ss.toX - _ss.fromX) * ease;
        y = _ss.fromY + (_ss.toY - _ss.fromY) * ease;
      } else {
        const basePos = hexToWorld(dispQ, dispR);
        x = basePos.x;
        y = basePos.y;
      }
      // TEMP safety: disable unit viewport culling to prevent disappearance regressions
      // if (x < _uvpL || x > _uvpR || y < _uvpT || y > _uvpB) continue;

      const color = PLAYER_COLORS[unit.owner];
      const dim   = (Number(unit.owner) !== Number(gs.currentPlayer));
      const alpha = dim ? 0.6 : 1.0;
      const def   = UNIT_TYPES[unit.type];
      const r     = HEX_SIZE * 0.36;
      const spent = unit.moved && unit.attacked;
      const _mixU = (a, b, t) => {
        const ca = Phaser.Display.Color.IntegerToColor(a);
        const cb = Phaser.Display.Color.IntegerToColor(b);
        return Phaser.Display.Color.GetColor(
          Math.floor(ca.red * (1 - t) + cb.red * t),
          Math.floor(ca.green * (1 - t) + cb.green * t),
          Math.floor(ca.blue * (1 - t) + cb.blue * t)
        );
      };
      const movedOnly = unit.moved && !unit.attacked;
      const teamBase = _mixU(color, 0x6e6e6e, 0.68); // less dominant team fill
      const unitBodyColor = spent
        ? _mixU(teamBase, 0x7f7f7f, 0.55)            // fully spent (move+attack)
        : movedOnly
          ? _mixU(teamBase, 0x8a7a58, 0.38)          // moved but can still attack
          : teamBase;
      const unitAccent = spent
        ? _mixU(_mixU(color, 0xffffff, 0.22), 0x888888, 0.45)
        : movedOnly
          ? _mixU(_mixU(color, 0xffffff, 0.20), 0xc49444, 0.35)
          : _mixU(color, 0xffffff, 0.22);

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

      // ── Wargame counter (NATO-style) ───────────────────────────────────────
      const NAVAL_SHAPES = new Set(['boat_sm','sub','destroyer','cruiser','cruiser_hv','battleship','transport','landing','battery']);
      const isNaval = NAVAL_SHAPES.has(def.shape);
      const cW = r * 2.1;
      const cH = r * 1.7;
      const cx2 = x - cW/2, cy2 = y - cH/2;
      const fillAlpha = spent ? alpha * 0.5 : alpha;

      // Stack indicator: draw a second offset counter shadow behind main unit when 2+ units share hex
      const stackKey = `${dispQ},${dispR}`;
      if ((_stackCount.get(stackKey) || 0) > 1) {
        const offX = 4, offY = -4;
        this.unitGfx.fillStyle(0x000000, alpha * 0.25);
        this.unitGfx.fillRect(cx2 + offX + 2, cy2 + offY + 2, cW, cH);
        this.unitGfx.fillStyle(unitBodyColor, fillAlpha * 0.55);
        this.unitGfx.fillRect(cx2 + offX, cy2 + offY, cW, cH);
        this.unitGfx.lineStyle(1, 0x000000, alpha * 0.5);
        this.unitGfx.strokeRect(cx2 + offX, cy2 + offY, cW, cH);
      }

      // Drop shadow
      this.unitGfx.fillStyle(0x000000, alpha * 0.4);
      this.unitGfx.fillRect(cx2 + 2, cy2 + 2, cW, cH);

      // Counter body
      this.unitGfx.fillStyle(unitBodyColor, fillAlpha);
      this.unitGfx.fillRect(cx2, cy2, cW, cH);
      // subtle pixel texture for upgraded look
      this.unitGfx.fillStyle(0x000000, alpha * 0.10);
      for (let px = 2; px < cW - 2; px += 4) {
        for (let py = 2; py < cH - 2; py += 4) {
          if (((px + py) / 2) % 3 === 0) this.unitGfx.fillRect(cx2 + px, cy2 + py, 1.8, 1.8);
        }
      }
      // top accent stripe carries team color without dominating body
      this.unitGfx.fillStyle(unitAccent, alpha * 0.9);
      this.unitGfx.fillRect(cx2 + 1, cy2 + 1, cW - 2, 3);
      // Moved marker (amber pip) for units that already moved this turn.
      if (movedOnly) {
        this.unitGfx.fillStyle(0xd9a441, alpha * 0.95);
        this.unitGfx.fillCircle(cx2 + cW - 6, cy2 + 6, 3);
      }

      // Inner highlight (top + left edge)
      this.unitGfx.lineStyle(1, 0xffffff, fillAlpha * 0.35);
      this.unitGfx.beginPath();
      this.unitGfx.moveTo(cx2, cy2 + cH - 1); this.unitGfx.lineTo(cx2, cy2);
      this.unitGfx.lineTo(cx2 + cW - 1, cy2);
      this.unitGfx.strokePath();
      // Inner shadow (bottom + right edge)
      this.unitGfx.lineStyle(1, 0x000000, fillAlpha * 0.45);
      this.unitGfx.beginPath();
      this.unitGfx.moveTo(cx2 + 1, cy2 + cH); this.unitGfx.lineTo(cx2 + cW, cy2 + cH);
      this.unitGfx.lineTo(cx2 + cW, cy2 + 1);
      this.unitGfx.strokePath();

      // Outer border (double for selected unit)
      const borderW = (this.selectedUnit === unit) ? 2.5 : 1.5;
      const borderC = (this.selectedUnit === unit) ? 0xffff00 : unitAccent;
      this.unitGfx.lineStyle(borderW, borderC, alpha);
      this.unitGfx.strokeRect(cx2, cy2, cW, cH);

      // Enemy tier hint (T0..T3) — shows progression level only, not exact modules.
      if (isEnemy) {
        const shownTier = this._unitShownTier(unit);
        const tierCol = shownTier >= 3 ? 0xd9534f : shownTier === 2 ? 0xe49c3d : shownTier === 1 ? 0x4da3ff : 0x8a9aaa;

        // Large top band marker (high visibility)
        this.unitGfx.fillStyle(0x0b0f16, alpha * 0.92);
        this.unitGfx.fillRect(cx2 + 1, cy2 + 1, cW - 2, 4);
        this.unitGfx.fillStyle(tierCol, alpha * 0.98);
        const segW = Math.max(6, Math.floor((cW - 8) / 3));
        if (shownTier === 0) {
          this.unitGfx.fillRect(cx2 + 4, cy2 + 2, segW, 2);
        } else {
          for (let i = 0; i < shownTier; i++) this.unitGfx.fillRect(cx2 + 4 + i * (segW + 1), cy2 + 2, segW, 2);
        }

        // Keep bottom-right badge too
        const tx = cx2 + cW - 11, ty = cy2 + cH - 9;
        this.unitGfx.fillStyle(0x0b0f16, alpha * 0.95);
        this.unitGfx.fillRect(tx - 10, ty - 8, 20, 16);
        this.unitGfx.lineStyle(1.2, tierCol, alpha);
        this.unitGfx.strokeRect(tx - 10, ty - 8, 20, 16);
        if (shownTier === 0) {
          this.unitGfx.fillStyle(0x6f7c88, alpha * 0.95);
          this.unitGfx.fillRect(tx - 5, ty - 1, 10, 2);
        } else {
          this.unitGfx.fillStyle(tierCol, alpha * 0.98);
          for (let i = 0; i < shownTier; i++) this.unitGfx.fillRect(tx - 7 + i * 5, ty - 3, 4, 6);
        }
      }

      // Subtle tier counter for ALL units (integrated pips on counter, no floating text)
      {
        const shownTier = this._unitShownTier(unit);
        const tierCol = shownTier >= 3 ? 0xd9534f : shownTier === 2 ? 0xe49c3d : shownTier === 1 ? 0x4da3ff : 0x8a9aaa;
        const py = cy2 + 6;
        const startX = cx2 + cW - 16;
        // backdrop strip
        this.unitGfx.fillStyle(0x0b0f16, alpha * 0.72);
        this.unitGfx.fillRect(startX - 2, py - 3, 14, 6);
        if (shownTier === 0) {
          this.unitGfx.fillStyle(0x6f7c88, alpha * 0.9);
          this.unitGfx.fillRect(startX + 2, py - 1, 6, 2); // subtle T0 dash
        } else {
          this.unitGfx.fillStyle(tierCol, alpha * 0.95);
          for (let i = 0; i < shownTier; i++) this.unitGfx.fillRect(startX + i * 4, py - 2, 3, 4);
        }
      }

      // ── Type symbol (NATO-inspired) ────────────────────────────────────────
      const sg = this.unitGfx;
      const ss = r * 0.38; // symbol scale
      const symCol = 0xffffff;
      sg.lineStyle(1.8, symCol, fillAlpha * 0.92);
      sg.fillStyle(symCol, fillAlpha * 0.92);

      if (def.shape === 'circle') {
        // Infantry: X cross
        sg.beginPath();
        sg.moveTo(x - ss, y - ss * 0.75); sg.lineTo(x + ss, y + ss * 0.75);
        sg.moveTo(x + ss, y - ss * 0.75); sg.lineTo(x - ss, y + ss * 0.75);
        sg.strokePath();
      } else if (def.shape === 'square') {
        // Armor: horizontal oval
        sg.strokeEllipse(x, y, ss * 2.2, ss * 1.0);
      } else if (def.shape === 'triangle') {
        // Light infantry: single diagonal slash
        sg.beginPath();
        sg.moveTo(x - ss * 0.9, y + ss * 0.65); sg.lineTo(x + ss * 0.9, y - ss * 0.65);
        sg.strokePath();
      } else if (def.shape === 'diamond') {
        // Artillery: circle with 4 spokes
        sg.strokeCircle(x, y, ss * 0.55);
        sg.beginPath();
        sg.moveTo(x - ss * 1.1, y); sg.lineTo(x - ss * 0.6, y);
        sg.moveTo(x + ss * 0.6, y); sg.lineTo(x + ss * 1.1, y);
        sg.moveTo(x, y - ss * 1.1); sg.lineTo(x, y - ss * 0.6);
        sg.moveTo(x, y + ss * 0.6); sg.lineTo(x, y + ss * 1.1);
        sg.strokePath();
      } else if (def.shape === 'star') {
        // Recon: binocular glyph (distinct from mortar slash)
        sg.strokeCircle(x - ss * 0.45, y, ss * 0.34);
        sg.strokeCircle(x + ss * 0.45, y, ss * 0.34);
        sg.beginPath();
        sg.moveTo(x - ss * 0.12, y); sg.lineTo(x + ss * 0.12, y);
        sg.strokePath();
      } else if (def.shape === 'car') {
        // Armored car: hull + two wheels
        sg.strokeRect(x - ss * 0.9, y - ss * 0.35, ss * 1.8, ss * 0.8);
        sg.strokeCircle(x - ss * 0.55, y + ss * 0.6, ss * 0.23);
        sg.strokeCircle(x + ss * 0.55, y + ss * 0.6, ss * 0.23);
      } else if (def.shape === 'arrow') {
        // Anti-tank: right-pointing arrow
        sg.beginPath();
        sg.moveTo(x - ss * 0.9, y); sg.lineTo(x + ss * 0.5, y);
        sg.moveTo(x + ss * 0.5, y); sg.lineTo(x + ss * 0.1, y - ss * 0.55);
        sg.moveTo(x + ss * 0.5, y); sg.lineTo(x + ss * 0.1, y + ss * 0.55);
        sg.strokePath();
      } else if (def.shape === 'cross') {
        // Medic: red cross
        sg.lineStyle(2.2, 0xff4444, fillAlpha);
        sg.beginPath();
        sg.moveTo(x, y - ss * 0.9); sg.lineTo(x, y + ss * 0.9);
        sg.moveTo(x - ss * 0.9, y); sg.lineTo(x + ss * 0.9, y);
        sg.strokePath();
      } else if (isNaval) {
        if (def.shape === 'sub') {
          // Submarine: elongated hull + conning tower
          sg.strokeEllipse(x, y + ss * 0.1, ss * 2.4, ss * 0.8);
          sg.fillRect(x - ss * 0.15, y - ss * 0.6, ss * 0.3, ss * 0.5);
        } else if (def.shape === 'battleship') {
          // Battleship: wide hull + two turret circles
          sg.strokeEllipse(x, y + ss * 0.2, ss * 2.6, ss * 1.0);
          sg.fillCircle(x - ss * 0.5, y - ss * 0.2, ss * 0.3);
          sg.fillCircle(x + ss * 0.5, y - ss * 0.2, ss * 0.3);
        } else if (def.shape === 'transport') {
          // Transport: boxy rect + cargo dot
          sg.strokeRect(x - ss * 1.1, y - ss * 0.5, ss * 2.2, ss * 1.0);
          sg.fillCircle(x, y, ss * 0.25);
        } else if (def.shape === 'boat_sm') {
          // Patrol Boat: small compact V-hull
          sg.beginPath();
          sg.moveTo(x + ss * 0.9, y); sg.lineTo(x - ss * 0.5, y - ss * 0.45);
          sg.lineTo(x - ss * 0.5, y + ss * 0.45); sg.closePath(); sg.strokePath();
        } else if (def.shape === 'destroyer') {
          // Destroyer: long slim hull + mast tick
          sg.beginPath();
          sg.moveTo(x + ss * 1.4, y); sg.lineTo(x - ss * 1.0, y - ss * 0.45);
          sg.lineTo(x - ss * 1.0, y + ss * 0.45); sg.closePath(); sg.strokePath();
          // Mast
          sg.beginPath(); sg.moveTo(x, y - ss * 0.45); sg.lineTo(x, y - ss * 0.85); sg.strokePath();
        } else if (def.shape === 'landing') {
          // Landing Craft: flat-front box with ramp tick
          sg.strokeRect(x - ss * 0.9, y - ss * 0.5, ss * 1.8, ss * 1.0);
          sg.beginPath(); sg.moveTo(x + ss * 0.9, y - ss * 0.5); sg.lineTo(x + ss * 0.9, y + ss * 0.5); sg.strokePath();
        } else if (def.shape === 'battery') {
          // Coastal Battery: box + gun barrel pointing right
          sg.strokeRect(x - ss * 0.8, y - ss * 0.55, ss * 1.6, ss * 1.1);
          sg.lineStyle(2.5, symCol, fillAlpha * 0.92);
          sg.beginPath(); sg.moveTo(x + ss * 0.2, y); sg.lineTo(x + ss * 1.3, y); sg.strokePath();
          sg.fillCircle(x + ss * 1.3, y, ss * 0.2);
        } else {
          // Generic naval: medium pointed hull
          sg.beginPath();
          sg.moveTo(x + ss * 1.1, y); sg.lineTo(x - ss * 0.8, y - ss * 0.5);
          sg.lineTo(x - ss * 0.8, y + ss * 0.5); sg.closePath(); sg.strokePath();
        }
      } else if (def.shape === 'aa_gun') {
        // AA Emplacement: circle base + angled gun barrel pointing up-right
        sg.strokeCircle(x, y, ss * 0.7);
        sg.lineStyle(2.5, symCol, fillAlpha * 0.92);
        sg.beginPath(); sg.moveTo(x, y); sg.lineTo(x + ss * 0.5, y - ss * 1.0); sg.strokePath();
        sg.fillCircle(x + ss * 0.5, y - ss * 1.0, ss * 0.15);
        // Crosshair ticks
        sg.beginPath(); sg.moveTo(x - ss * 0.3, y); sg.lineTo(x + ss * 0.3, y); sg.strokePath();
        sg.beginPath(); sg.moveTo(x, y - ss * 0.3); sg.lineTo(x, y + ss * 0.3); sg.strokePath();
      } else if (def.shape === 'aircraft') {
        // ── Aircraft (biplane/bomber/obs) ────────────────────────────────────
        // Fuselage: horizontal bar
        sg.lineStyle(2.0, symCol, fillAlpha * 0.95);
        sg.beginPath();
        sg.moveTo(x - ss * 1.1, y); sg.lineTo(x + ss * 1.1, y); sg.strokePath();
        // Nose cone
        sg.beginPath();
        sg.moveTo(x + ss * 1.1, y); sg.lineTo(x + ss * 0.8, y - ss * 0.25);
        sg.lineTo(x + ss * 0.8, y + ss * 0.25); sg.closePath(); sg.fillPath();
        // Main wings (wide sweep)
        sg.lineStyle(2.0, symCol, fillAlpha * 0.95);
        sg.beginPath();
        sg.moveTo(x - ss * 0.15, y); sg.lineTo(x - ss * 0.65, y - ss * 0.9);
        sg.lineTo(x + ss * 0.35, y - ss * 0.9);  sg.lineTo(x + ss * 0.25, y);
        sg.closePath(); sg.strokePath();
        sg.beginPath();
        sg.moveTo(x - ss * 0.15, y); sg.lineTo(x - ss * 0.65, y + ss * 0.9);
        sg.lineTo(x + ss * 0.35, y + ss * 0.9);  sg.lineTo(x + ss * 0.25, y);
        sg.closePath(); sg.strokePath();
        // Tail fins
        sg.beginPath();
        sg.moveTo(x - ss * 0.9, y); sg.lineTo(x - ss * 1.1, y - ss * 0.45);
        sg.moveTo(x - ss * 0.9, y); sg.lineTo(x - ss * 1.1, y + ss * 0.45);
        sg.strokePath();
        // Biplane: second smaller upper wing
        if (unit.type === 'BIPLANE_FIGHTER') {
          sg.lineStyle(1.2, symCol, fillAlpha * 0.6);
          sg.beginPath();
          sg.moveTo(x - ss * 0.05, y - ss * 0.35); sg.lineTo(x - ss * 0.4, y - ss * 0.9);
          sg.moveTo(x - ss * 0.05, y + ss * 0.35); sg.lineTo(x - ss * 0.4, y + ss * 0.9);
          sg.strokePath();
        }
        // Obs plane: binoculars dot (tiny circle below nose)
        if (unit.type === 'OBS_PLANE') {
          sg.fillStyle(0xffffaa, fillAlpha * 0.9);
          sg.fillCircle(x + ss * 0.5, y + ss * 0.55, ss * 0.2);
        }
        // Altitude shadow line (visual cue: unit is airborne)
        sg.lineStyle(1, 0x000000, alpha * 0.2);
        sg.beginPath();
        sg.moveTo(x - ss * 0.6, y + cH * 0.7); sg.lineTo(x + ss * 0.6, y + cH * 0.7);
        sg.strokePath();
      }

      // Spent slash overlay (unit used all AP)
      if (spent) {
        sg.lineStyle(1.5, 0xff3333, alpha * 0.65);
        sg.beginPath();
        sg.moveTo(cx2 + cW - 1, cy2 + 1); sg.lineTo(cx2 + cW - 9, cy2 + 8);
        sg.strokePath();
      }

      // Health bar (below counter)
      const barW = cW * 0.9, barH = 4;
      const bx = x - barW/2, by = cy2 + cH + 3;
      const pct = unit.health / unit.maxHealth;
      const barColor = pct > 0.6 ? 0x44dd44 : pct > 0.3 ? 0xffcc00 : 0xff3333;
      this.unitGfx.fillStyle(0x111111, alpha); this.unitGfx.fillRect(bx, by, barW, barH);
      this.unitGfx.fillStyle(barColor, alpha); this.unitGfx.fillRect(bx, by, barW * pct, barH);
      this.unitGfx.lineStyle(1, 0x000000, alpha * 0.5); this.unitGfx.strokeRect(bx, by, barW, barH);

      // Fuel pip row for air units (shown below health bar)
      if (unit.fuel !== undefined && unit.fuelMax) {
        const fuelY = by + barH + 3;
        const pipW  = (barW - (unit.fuelMax - 1) * 1) / unit.fuelMax;
        for (let fi = 0; fi < unit.fuelMax; fi++) {
          const px = bx + fi * (pipW + 1);
          const filled = fi < unit.fuel;
          const pipColor = unit.fuel <= 1 ? 0xff3333 : unit.fuel <= 2 ? 0xff9900 : 0x44aaff;
          this.unitGfx.fillStyle(filled ? pipColor : 0x222222, alpha);
          this.unitGfx.fillRect(px, fuelY, pipW, 3);
          this.unitGfx.lineStyle(0.5, 0x000000, alpha * 0.4);
          this.unitGfx.strokeRect(px, fuelY, pipW, 3);
        }
      }

      // Out-of-supply indicator: red pip in top-left corner
      if (unit.outOfSupply > 0) {
        const oos = unit.outOfSupply;
        const pipR = 4;
        const pipX = cx2 + pipR + 1;
        const pipY = cy2 + pipR + 1;
        const pipCol = oos >= 3 ? 0xff2222 : oos >= 2 ? 0xff7700 : 0xffaa00;
        this.unitGfx.fillStyle(pipCol, alpha);
        this.unitGfx.fillCircle(pipX, pipY, pipR);
        this.unitGfx.lineStyle(1, 0x000000, alpha * 0.5);
        this.unitGfx.strokeCircle(pipX, pipY, pipR);
      }

      // Engineer busy indicator: small amber dot + wrench-arm lines in top-right corner of counter
      if (unit.type === 'ENGINEER' && (unit.roadOrder || unit.constructing)) {
        const dotR = 4;
        const dotX = cx2 + cW - dotR - 1;
        const dotY = cy2 + dotR + 1;
        // Amber fill
        this.unitGfx.fillStyle(0xffaa00, alpha);
        this.unitGfx.fillCircle(dotX, dotY, dotR);
        this.unitGfx.lineStyle(1, 0x000000, alpha * 0.6);
        this.unitGfx.strokeCircle(dotX, dotY, dotR);
        // Two short lines (wrench silhouette)
        this.unitGfx.lineStyle(1.5, 0x000000, alpha * 0.8);
        this.unitGfx.beginPath();
        this.unitGfx.moveTo(dotX - 2.5, dotY - 2.5); this.unitGfx.lineTo(dotX + 2.5, dotY + 2.5);
        this.unitGfx.moveTo(dotX + 2.5, dotY - 2.5); this.unitGfx.lineTo(dotX - 2.5, dotY + 2.5);
        this.unitGfx.strokePath();
      }

      // Auto-move/order badge: shows unit is executing an order in future turn resolution.
      if (unit.moveOrder || unit.roadOrder) {
        const bR = 5;
        const bX = cx2 + cW - bR - 1;
        const bY = cy2 + cH - bR - 1;
        this.unitGfx.fillStyle(0x44ccff, alpha);
        this.unitGfx.fillCircle(bX, bY, bR);
        this.unitGfx.lineStyle(1, 0x002233, alpha * 0.9);
        this.unitGfx.strokeCircle(bX, bY, bR);
        // Tiny arrow glyph
        this.unitGfx.lineStyle(1.5, 0x002233, alpha * 0.95);
        this.unitGfx.beginPath();
        this.unitGfx.moveTo(bX - 2.2, bY); this.unitGfx.lineTo(bX + 1.8, bY);
        this.unitGfx.moveTo(bX + 1.8, bY); this.unitGfx.lineTo(bX + 0.2, bY - 1.6);
        this.unitGfx.moveTo(bX + 1.8, bY); this.unitGfx.lineTo(bX + 0.2, bY + 1.6);
        this.unitGfx.strokePath();
      }
    }
  }

  // ── Fog of war ────────────────────────────────────────────────────────────
  // Call at turn start to lock in fog for the planning phase
  _freezeFog() {
    this.gameState.currentPlayer = Number(this.gameState.currentPlayer) || 1;
    if (this.debugNoFog) {
      this._currentFog = null;
      if (this.fogRT) this.fogRT.setVisible(false);
      return;
    }
    this._currentFog = computeFog(this.gameState, this.gameState.currentPlayer, this.mapSize, this.terrain);
    this._discovered = this._discovered || { 1: new Set(), 2: new Set() };
    const cp = Number(this.gameState.currentPlayer) || 1;
    for (const k of this._currentFog || []) this._discovered[cp].add(k);
  }

  _redrawFog() {
    if (this.debugNoFog) {
      this.fogRT?.clear();
      this.fogRT?.setVisible(false);
      return;
    }
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

    // Two-row top bar to prevent overlaps as features grow.
    this.topBarBg = this.add.rectangle(w/2, 37, w, 74, 0x0a0a0a, 0.96)
      .setScrollFactor(0).setDepth(D);
    this.add.rectangle(w/2, 37, w, 1, 0x1f2f1f, 1).setScrollFactor(0).setDepth(D + 1); // row divider
    this.add.rectangle(w/2, 74, w, 1, 0x2a4a2a, 1).setScrollFactor(0).setDepth(D + 1); // bottom accent

    // Row 1: nav + state
    this.btnMenu = this._makeBtn(10, 8, '← MENU', 0x222222, () => this.scene.start('MenuScene'), D);
    this.btnEconomy = this._makeBtn(112, 8, '📊 ECON', 0x2a2a14, () => this._toggleEconomy(), D);
    this.turnLbl = this._makeLabel(w/2, 8, 'Turn 1 | Player 1 | PLANNING', D, true);

    // Version tag
    this.add.text(w - 92, 10, GAME_VERSION, {
      font: '10px monospace', fill: '#334455'
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D);

    // Row 2: resources (left) + actions (right)
    this.resIron = this._makeLabel(10, 42, '⚙ —', D);
    this.resOil  = this._makeLabel(104, 42, '🛢 —', D);
    this.resWood = this._makeLabel(198, 42, '🪵 —', D);
    this.resFood = this._makeLabel(290, 42, '🍞 —', D);
    this.resGold = this._makeLabel(382, 42, '💰 —', D);
    this.resComp = this._makeLabel(474, 42, '🧩 —', D);
    this.resRp   = this._makeLabel(566, 42, '⚗ —', D);

    this.btnSupply   = this._makeBtn(w - 500, 42, '⬡ SUP',   0x111a11, () => this._toggleSupplyOverlay(), D, 'right');
    this.btnResearch = this._makeBtn(w - 414, 42, '⚗ RES',   0x442266, () => this._toggleResearch(), D, 'right');
    this.btnDesigner = this._makeBtn(w - 328, 42, '🔧 DES',   0x1a3322, () => this._toggleDesigner(), D, 'right');
    this.btnTrade    = this._makeBtn(w - 242, 42, '💱 TRADE', 0x3a2a11, () => this._toggleTrade(), D, 'right');
    this.btnSettings = this._makeBtn(w - 140, 42, '⚙ SET',   0x222244, () => this._toggleSettings(), D, 'right');
    this.btnSubmit   = this._makeBtn(w - 8,   42, 'END TURN',0x1a5c1a, () => this._confirmEndTurn(), D, 'right');

    // Explicit turn counter badge (high visibility)
    this.turnBadge = this.add.text(w - 8, 8, 'TURN 1', {
      font: 'bold 12px monospace', fill: '#fff7c2',
      backgroundColor: '#3a3312', padding: { x: 8, y: 4 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(D + 2);
  }

  _makeLabel(x, y, text, depth, center = false) {
    return this.add.text(x, y, text, {
      font: '12px monospace', fill: '#ccddcc',
      backgroundColor: '#141814', padding: { x: 6, y: 5 }
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
    const modeStr = this.mode === 'move' ? 'MOVING' : this.mode === 'sprint' ? 'SPRINTING' : this.mode === 'attack' ? 'ATTACKING' : 'PLANNING';
    const queueStr = myOrders.length
      ? '  |  ' + myOrders.map(r => {
          const name = r.designId !== undefined
            ? (gs.designs[p].find(d => d.id === r.designId)?.name || 'Unit')
            : UNIT_TYPES[r.type]?.name || '?';
          return `⚙${name}(${r.turnsLeft}t)`;
        }).join(' ')
      : '';

    const upkeep = calcUpkeep(gs, p);
    const unsupplied = gs.players[p].upkeepDebt && (gs.players[p].upkeepDebt.food > 0 || gs.players[p].upkeepDebt.iron > 0 || gs.players[p].upkeepDebt.oil > 0);
    const warnClr = unsupplied ? '#ff6644' : '#ccddcc';

    const fmtRes = (v) => typeof v === 'number' ? (v % 1 === 0 ? v : v.toFixed(1)) : '—';

    const netIron = +(inc.iron - upkeep.iron).toFixed(1);
    const netOil  = +(inc.oil  - upkeep.oil).toFixed(1);
    const netFood = +((inc.food || 0) - (upkeep.food || 0)).toFixed(1);
    const netWood = +(inc.wood || 0).toFixed(1);
    const netGold = +(inc.gold || 0).toFixed(1);

    const sgn = (v) => v > 0 ? `+${v}` : `${v}`;

    this.resIron.setText(`⚙ ${fmtRes(pl.iron)} ${sgn(netIron)}`);
    this.resOil.setText(`🛢 ${fmtRes(pl.oil)} ${sgn(netOil)}`);
    this.resWood.setText(`🪵 ${fmtRes(pl.wood || 0)} ${sgn(netWood)}`);
    this.resFood.setText(`🍞 ${fmtRes(pl.food || 0)} ${sgn(netFood)}`);
    this.resGold.setText(`💰 ${fmtRes(pl.gold || 0)} ${sgn(netGold)}`);
    this.resComp.setText(`🧩 ${fmtRes(pl.components || 0)}`);
    // Research: show active tech name + % or "no lab"
    const resState = pl.research;
    const activeRes = resState?.queue?.[0];
    const activeTech = activeRes ? TECH_TREE[activeRes.techId] : null;
    const rpPct = activeTech ? Math.floor(((activeRes.rpSpent || 0) / activeTech.cost) * 100) : 0;
    const rpLabel = inc.rp === 0 ? 'no lab' : activeTech ? `${activeTech.name.substring(0,12)} ${rpPct}%` : `idle (+${inc.rp}/t)`;
    this.resRp.setText(`⚗ ${rpLabel}`);
    this.resFood.setStyle({ fill: unsupplied ? '#ff6644' : '#ccddcc' });

    this.turnLbl.setText(`Turn ${gs.turn}  |  P${p}  |  ${modeStr}`);
    this.turnBadge?.setText(`TURN ${gs.turn}`);
  }

  // ── Bottom panel ──────────────────────────────────────────────────────────
  _createBottomPanel() {
    const w = this.scale.width, h = this.scale.height;
    const panH = 132, D = 100;

    // Left: unit info panel — dark background with subtle top border accent
    this.unitPanel = this.add.rectangle(200, h - panH/2, 390, panH, 0x0d0d0d, 0.96)
      .setStrokeStyle(1, 0x2a3a2a).setScrollFactor(0).setDepth(D);
    // Accent bar along top of panel
    this.add.rectangle(200, h - panH, 390, 2, 0x3a5c3a, 1)
      .setScrollFactor(0).setDepth(D + 1);
    this.unitNameTxt   = this._makeLabel(10, h - panH + 6,  '', D);
    this.unitStatsTxt  = this._makeLabel(10, h - panH + 28, '', D);
    this.unitStatusTxt = this._makeLabel(10, h - panH + 68, '', D);

    // Right: action buttons background
    this.actionBg = this.add.rectangle(w - 200, h - panH/2, 390, panH, 0x0d0d0d, 0.96)
      .setStrokeStyle(1, 0x2a3a2a).setScrollFactor(0).setDepth(D);
    this.add.rectangle(w - 200, h - panH, 390, 2, 0x3a5c3a, 1)
      .setScrollFactor(0).setDepth(D + 1);

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
      this.unitNameTxt.setText(`${nameLabel}  P${u.owner}  [Tier ${this._unitShownTier(u)}]`);
      const ap = (u.moved ? 0 : 1) + (u.attacked ? 0 : 1);
      const fuelStr = u.fuel !== undefined
        ? `  ⛽ ${u.fuel}/${u.fuelMax}${u.fuel <= 2 ? ' ⚠' : ''}`
        : '';
      this.unitStatsTxt.setText(
        `HP: ${u.health}/${u.maxHealth}  AP: ${ap}/2${fuelStr}` +
        `  SA: ${u.soft_attack ?? def.soft_attack}  HA: ${u.hard_attack ?? def.hard_attack}  PRC: ${u.pierce ?? def.pierce}  ARM: ${u.armor ?? def.armor}  MOV: ${u.move ?? def.move}  RNG: ${u.range ?? def.range}`
      );
      const pa = gs.pendingAttacks[u.id];
      let status = '';
      // Construction status takes priority
      if (u.constructing) {
        const bUnderConst = gs.buildings.find(b => b.id === u.constructing);
        if (bUnderConst && bUnderConst.underConstruction) {
          const prog = bUnderConst.buildProgress || 0, total = bUnderConst.buildTurnsRequired || 1;
          status = `🔨 Building ${BUILDING_TYPES[bUnderConst.type].name}: ${prog}/${total} turns  (locked)`;
        }
      } else if (u.fuel !== undefined) {
        // Air unit status line
        const fuelWarn = u.fuel <= 1 ? '🔴 FUEL CRITICAL — RTB now!  ' : u.fuel <= 2 ? '🟡 Low fuel — return to airfield  ' : '';
        status += fuelWarn;
        status += u.suppressed ? '⚡ SUPPRESSED  ' : u.moved ? '✓ Moved  ' : '○ Can move  ';
        status += pa ? '⚔ Attack queued  ' : u.attacked ? '✓ Attacked  ' : u.suppressed ? '' : '○ Can attack';
      } else {
        status += u.suppressed ? '⚡ SUPPRESSED  ' : u.moved ? '✓ Moved  ' : '○ Can move  ';
        status += pa ? '⚔ Attack queued  ' : u.attacked ? '✓ Attacked  ' : u.suppressed ? '' : '○ Can attack  ';
        if (u.dugIn) status += '🪖 Dug in  ';
        if (u.outOfSupply > 0) status += `⚠ OUT OF SUPPLY (${u.outOfSupply}t)`;
      }
      // Contextual modifiers affecting this unit right now
      const ttype = this.terrain?.[`${u.q},${u.r}`] ?? 0;
      const tLabel = TERRAIN_LABELS[ttype] || 'Plains';
      const effects = [];
      if (ttype === 1) effects.push('Terrain: Forest cover (+defense)');
      else if (ttype === 7) effects.push('Terrain: Light woods cover');
      else if (ttype === 2) effects.push('Terrain: Mountain cover (high)');
      else if (ttype === 0 || ttype === 6) {
        const infLike = new Set(['INFANTRY','ASSAULT_INFANTRY','SMG_SQUAD','LMG_TEAM','HMG_TEAM','SNIPER','ENGINEER','MEDIC','ANTI_TANK']);
        if (infLike.has(u.type) && !u.dugIn) effects.push('⚠ Open ground exposure penalty');
      }
      const fort = gs.buildings.find(b => (b.type==='BUNKER'||b.type==='TRENCH'||b.type==='SANDBAG') && b.q===u.q && b.r===u.r && b.owner===u.owner);
      if (fort) effects.push(`Fortification: ${BUILDING_TYPES[fort.type]?.name || fort.type}`);
      if (u.dugIn) effects.push('Dug in bonus active');
      if (u.outOfSupply > 0) {
        const pen = supplyPenalty(u.outOfSupply);
        effects.push(`Out of supply: −${pen.attackPenalty} attack / −${pen.movePenalty} move`);
      }
      const standB = gs.buildings.find(b => b.q === u.q && b.r === u.r && !ROAD_TYPES.has(b.type));
      const standRes = gs.resourceHexes[`${u.q},${u.r}`];
      if (standB) effects.push(`Standing on: ${BUILDING_TYPES[standB.type]?.name || standB.type} (${Number(standB.owner)===Number(u.owner)?'friendly':'enemy'})`);
      else if (standRes) effects.push(`Resource tile: ${standRes.type}`);
      const fxLine = effects.length ? `\n${effects.slice(0,3).join('  ·  ')}` : '';
      this.unitStatusTxt.setText(`${status}${fxLine}`);
    } else if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r, this.mapSize)) {
      const key  = `${this.hoveredHex.q},${this.hoveredHex.r}`;
      const t    = TERRAIN_LABELS[this.terrain[key]] || 'Plains';
      const res  = gs.resourceHexes[key];
      const bu   = buildingAt(gs, this.hoveredHex.q, this.hoveredHex.r);
      const hu   = unitAt(gs, this.hoveredHex.q, this.hoveredHex.r);
      this.unitNameTxt.setText(`(${this.hoveredHex.q}, ${this.hoveredHex.r})  ${t}${res ? `  [${RESOURCE_TYPES[res.type].name}]` : ''}`);
      this.unitStatsTxt.setText(bu ? `Building: ${BUILDING_TYPES[bu.type].name}  (P${bu.owner})` : '');
      if (hu) {
        const huDef = UNIT_TYPES[hu.type];
        const hoverOwn = Number(hu.owner) === Number(gs.currentPlayer);
        const hoverName = hoverOwn && hu.designId !== undefined
          ? (gs.designs[hu.owner]?.find(d => d.id === hu.designId)?.name || huDef.name)
          : huDef.name;
        const hoverPrefix = hoverOwn && hu.designId !== undefined ? '★ ' : '';
        let tierTxt = '';
        if (!hoverOwn) {
          tierTxt = `  [Tier ${this._unitShownTier(hu)}]`;
        }
        this.unitStatusTxt.setText(`Unit: P${hu.owner} ${hoverPrefix}${hoverName}  HP: ${hu.health}/${hu.maxHealth}${tierTxt}`);
      } else {
        this.unitStatusTxt.setText('');
      }
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
      const panH2 = 132;
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
    const panelW = 480, panelH = 80 + available.length * 52 + 60;
    const px = w / 2 - panelW / 2, py = h / 2 - panelH / 2;
    const objs = [];

    // Panel background
    const bg = this.add.rectangle(w/2, h/2, panelW, panelH, 0x0b0e0b, 0.98)
      .setStrokeStyle(2, 0x334433).setScrollFactor(0).setDepth(200)
      .setInteractive();
    bg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(bg);

    // Top header strip
    const headerStrip = this.add.rectangle(w/2, py + 22, panelW, 44, 0x111a11, 1)
      .setScrollFactor(0).setDepth(200);
    objs.push(headerStrip);

    const title = this.add.text(w/2, py + 22, `RECRUIT  ·  ${BUILDING_TYPES[building.type].name.toUpperCase()}`, {
      font: 'bold 14px monospace', fill: '#c8b87a'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    objs.push(title);

    // Show queue summary for this building (queue supported)
    const buildingQueue = gs.pendingRecruits.filter(r => r.buildingId === building.id && r.owner === p);
    if (buildingQueue.length > 0) {
      const next = buildingQueue[0];
      const orderName = next.designId !== undefined
        ? (gs.designs[p].find(d => d.id === next.designId)?.name || 'Custom Unit')
        : UNIT_TYPES[next.type]?.name || '?';
      const turnsStr = next.turnsLeft > 0 ? `${next.turnsLeft}t left` : 'ready next turn';
      const orderTxt = this.add.text(w/2, py + 52, `⏳ Queue ${buildingQueue.length}  |  Next: ${orderName} (${turnsStr})`, {
        font: 'bold 12px monospace', fill: '#ffdd44', backgroundColor: '#333300', padding: { x: 10, y: 5 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
      objs.push(orderTxt);
      const cancelBtn = this.add.text(w/2, py + 76, '[ ✕ CANCEL NEXT ]', {
        font: '11px monospace', fill: '#ff8888', backgroundColor: '#330000', padding: { x: 8, y: 5 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true });
      cancelBtn.on('pointerdown', () => {
        this._contextMenuClicked = true;
        const toCancel = buildingQueue[0];
        const refundType = toCancel.type;
        const refundDesign = toCancel.designId !== undefined ? gs.designs[p].find(d => d.id === toCancel.designId) : null;
        const cost = refundDesign ? refundDesign.trainCost : (refundType ? UNIT_TYPES[refundType].cost : { iron: 0, oil: 0, components: 0 });
        gs.players[p].iron += (cost.iron || 0);
        gs.players[p].oil  += (cost.oil || 0);
        gs.players[p].components = (gs.players[p].components || 0) + (cost.components || 0);
        const idx = gs.pendingRecruits.findIndex(r => r === toCancel);
        if (idx >= 0) gs.pendingRecruits.splice(idx, 1);
        this._hideRecruitPanel();
        this._showRecruitPanel(building);
        this._refresh();
      });
      cancelBtn.on('pointerover', () => cancelBtn.setAlpha(0.8));
      cancelBtn.on('pointerout',  () => cancelBtn.setAlpha(1.0));
      objs.push(cancelBtn);
    }

    const baseRowY = py + 50 + (buildingQueue.length > 0 ? 62 : 0);
    const rowH = 52, rowW = panelW - 24;

    available.forEach((unitType, i) => {
      const def = UNIT_TYPES[unitType];
      const queueCapReached = buildingQueue.length >= 6;
      const foodCost = getRecruitFoodCost(unitType);
      const canAfford = !queueCapReached && gs.players[p].iron >= (def.cost.iron||0) && gs.players[p].oil >= (def.cost.oil||0) && (gs.players[p].components||0) >= (def.cost.components||0) && (gs.players[p].food||0) >= foodCost;
      const _bt = def.buildTime ?? 1;
      const ry = baseRowY + i * rowH + rowH/2;

      // Row background
      const rowBg = this.add.rectangle(w/2, ry, rowW, rowH - 4, canAfford ? 0x112211 : 0x0e0e0e, 1)
        .setStrokeStyle(1, canAfford ? 0x2a4a2a : 0x1a1a1a).setScrollFactor(0).setDepth(200)
        .setInteractive({ useHandCursor: canAfford });
      objs.push(rowBg);

      // Unit name left
      const nameClr = canAfford ? '#c8e0b0' : queueCapReached ? '#445544' : '#664444';
      const tierTag = `T${def.tier ?? 0}`;
      const nameTxt = this.add.text(w/2 - rowW/2 + 12, ry - 8, `${def.name}  [${tierTag}]`, {
        font: `bold 13px monospace`, fill: nameClr
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(201);
      objs.push(nameTxt);

      // Stats line below name
      const statStr = `HP ${def.health}  ·  MOV ${def.move}  ·  SA ${def.soft_attack}  HA ${def.hard_attack}  ·  ⏱${_bt}t`;
      const statTxt = this.add.text(w/2 - rowW/2 + 12, ry + 10, statStr, {
        font: '10px monospace', fill: '#445544'
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(201);
      objs.push(statTxt);

      // Cost right
      const costStr = `⚙${def.cost.iron||0}${(def.cost.oil||0) > 0 ? `  🛢${def.cost.oil}` : ''}${(def.cost.components||0) > 0 ? `  🧩${def.cost.components}` : ''}${foodCost > 0 ? `  🌾${foodCost}` : ''}`;
      const costClr = canAfford ? '#88bb66' : '#554444';
      const costTxt = this.add.text(w/2 + rowW/2 - 12, ry, costStr, {
        font: 'bold 12px monospace', fill: costClr
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(201);
      objs.push(costTxt);

      if (canAfford) {
        rowBg.on('pointerdown', () => {
          this._contextMenuClicked = true;
          queueRecruit(gs, p, unitType, building.id);
          this._pushLog(`P${p} queued ${def.name}`);
          this._hideRecruitPanel();
          this._refresh();
        });
        rowBg.on('pointerover', () => { rowBg.setFillStyle(0x1a3a1a, 1).setStrokeStyle(1, 0x44aa44); nameTxt.setStyle({ fill: '#eeff88' }); });
        rowBg.on('pointerout',  () => { rowBg.setFillStyle(0x112211, 1).setStrokeStyle(1, 0x2a4a2a); nameTxt.setStyle({ fill: nameClr }); });
      }
    });

    // Custom designs trained from this building (same visual card style as standard units)
    const btype = building.type;
    const customDesigns = (gs.designs[p] || []).filter(d => CHASSIS_BUILDINGS[d.chassis] === btype);
    customDesigns.forEach((design, i) => {
      const idx = available.length + i;
      const queueCapReached = buildingQueue.length >= 6;
      const dFoodCost = getRecruitFoodCost(design.chassis);
      const canAfford = !queueCapReached && gs.players[p].iron >= (design.trainCost.iron||0) && gs.players[p].oil >= (design.trainCost.oil||0) && (gs.players[p].components||0) >= (design.trainCost.components||0) && (gs.players[p].food||0) >= dFoodCost;
      const _dbt = UNIT_TYPES[design.chassis]?.buildTime ?? 1;
      const ry = baseRowY + idx * rowH + rowH/2;
      const modTier = Math.max(0, ...((design.modules || []).map(mk => MODULES[mk]?.tier ?? 0)));
      const chassisTier = UNIT_TYPES[design.chassis]?.tier ?? 0;
      const shownTier = Math.max(chassisTier, modTier);

      const rowBg = this.add.rectangle(w/2, ry, rowW, rowH - 4, canAfford ? 0x1a1a0d : 0x0e0e0e, 1)
        .setStrokeStyle(1, canAfford ? 0x666622 : 0x333333)
        .setScrollFactor(0).setDepth(201)
        .setInteractive({ useHandCursor: canAfford });
      objs.push(rowBg);

      const nameTxt = this.add.text(w/2 - rowW/2 + 12, ry - 8, `★ ${design.name}  [T${shownTier}]`, {
        font: 'bold 13px monospace', fill: canAfford ? '#f2e9a8' : '#666655'
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(201);
      objs.push(nameTxt);

      const statTxt = this.add.text(w/2 - rowW/2 + 12, ry + 10,
        `HP ${design.stats.health}  ·  MOV ${design.stats.move}  ·  SA ${design.stats.soft_attack}  HA ${design.stats.hard_attack}  ·  ⏱${_dbt}t`, {
        font: '10px monospace', fill: '#666655'
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(201);
      objs.push(statTxt);

      const costTxt = this.add.text(w/2 + rowW/2 - 12, ry, `⚙${design.trainCost.iron||0}${(design.trainCost.oil||0) > 0 ? `  🛢${design.trainCost.oil}` : ''}${(design.trainCost.components||0) > 0 ? `  🧩${design.trainCost.components}` : ''}${dFoodCost > 0 ? `  🌾${dFoodCost}` : ''}`, {
        font: 'bold 12px monospace', fill: canAfford ? '#d6c86a' : '#554444'
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(201);
      objs.push(costTxt);

      if (canAfford) {
        rowBg.on('pointerdown', () => {
          this._contextMenuClicked = true;
          queueRecruit(gs, p, design.id, building.id);
          this._pushLog(`P${p} queued ${design.name}`);
          this._hideRecruitPanel();
          this._refresh();
        });
        rowBg.on('pointerover', () => { rowBg.setFillStyle(0x2b2b14, 1).setStrokeStyle(1, 0x888833); nameTxt.setStyle({ fill: '#fff7bb' }); });
        rowBg.on('pointerout',  () => { rowBg.setFillStyle(0x1a1a0d, 1).setStrokeStyle(1, 0x666622); nameTxt.setStyle({ fill: '#f2e9a8' }); });
      }
    });

    // Footer button row
    const totalRows = available.length + customDesigns.length;
    const footerY = baseRowY + totalRows * rowH + 10;
    const closeBtnY = footerY;
    const closeBtn = this.add.text(w/2, closeBtnY, 'CLOSE  ✕', {
      font: 'bold 11px monospace', fill: '#aaaaaa',
      backgroundColor: '#1a1a1a', padding: { x: 10, y: 6 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this._contextMenuClicked = true; this._hideRecruitPanel(); });
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
    const unlockedTechs = new Set(gs.players[player]?.research?.unlocked || []);
    const validMods = Object.entries(MODULES).filter(([, m]) => {
      if (!m.chassis.includes(selectedChassis)) return false;
      if (m.requiredTech && !unlockedTechs.has(m.requiredTech)) return false;
      return true;
    });

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

  // ── Standalone Unit Designer (top-bar button) ─────────────────────────────
  _toggleDesigner() {
    if (this._designerOpen) this._closeDesigner();
    else this._openDesigner();
  }

  _closeDesigner() {
    if (this._designerObjs) {
      for (const o of this._designerObjs) o.destroy();
      this._designerObjs = null;
    }
    this._designerOpen = false;
    if (this.btnDesigner) this.btnDesigner.setStyle({ backgroundColor: '#1a3322' });
  }

  _openDesigner() {
    this._closeDesigner();
    this._closeResearch?.();   // close research if open
    this._closeTrade?.();
    this._closeEconomy?.();
    this._hideRecruitPanel?.();
    this._hideDesignPanel?.();
    this._hideContextMenu?.();
    const gs  = this.gameState;
    const p   = gs.currentPlayer;
    const w   = this.scale.width, h = this.scale.height;
    const D   = 215;
    const objs = [];
    this._designerObjs  = objs;
    this._designerOpen  = true;
    if (this.btnDesigner) this.btnDesigner.setStyle({ backgroundColor: '#2a6644' });

    // Chassis available = always-available (not locked) + research-unlocked
    const bonuses = computeTechBonuses(gs.players[p].research?.unlocked || []);
    const ALL_CHASSIS = Object.keys(CHASSIS_BUILDINGS).filter(ch =>
      !LOCKED_CHASSIS.has(ch) || bonuses.unlockedChassis.has(ch)
    );

    let selChassis = ALL_CHASSIS[0] || null;
    let selMods    = new Set();
    let designName = '';

    const rebuild = () => {
      for (const o of objs) o.destroy();
      objs.length = 0;
      this._renderDesignerPanel(gs, p, w, h, D, objs, ALL_CHASSIS, selChassis, selMods, designName,
        (ch) => { selChassis = ch; selMods = new Set(); rebuild(); },
        (mk) => {
          if (selMods.has(mk)) {
            selMods.delete(mk);
          } else {
            const mod = MODULES[mk];
            // Enforce mutual exclusions (foundation for deeper design trees)
            if (mod?.mutuallyExclusiveWith) {
              for (const ex of mod.mutuallyExclusiveWith) selMods.delete(ex);
            }
            // Also remove any selected modules that list this one as mutually exclusive
            for (const picked of [...selMods]) {
              const pm = MODULES[picked];
              if (pm?.mutuallyExclusiveWith?.includes(mk)) selMods.delete(picked);
            }
            selMods.add(mk);
          }
          rebuild();
        },
        () => {
          // Register
          const chassis = selChassis;
          const def = `${UNIT_TYPES[chassis]?.name || chassis} Mk.${(gs.designs[p]?.length || 0) + 1}`;
          const mods  = [...selMods];
          const cost  = designRegistrationCost(mods);
          if (gs.players[p].iron < cost.iron || gs.players[p].oil < cost.oil) return;
          if ((gs.designs[p]?.length || 0) >= MAX_DESIGNS_PER_PLAYER) return;
          this._openNameModal('Name Unit Design', designName || def, (enteredName) => {
            designName = enteredName || def;
            const res = registerDesign(gs, p, chassis, mods, designName);
            if (res.ok) {
              this._pushLog(`P${p} designed: "${designName}"`);
              selMods = new Set(); designName = '';
              this._refresh();
              this._closeDesigner();
            }
          }, () => {});
        },
        () => this._closeDesigner()
      );
      // IMPORTANT: each rebuild creates fresh objects — reattach to UI layer
      // so they aren't rendered by both world+UI cameras (duplicate ghosting).
      this._addToUI(objs);
    };
    rebuild();
  }

  _openNameModal(title, defaultText, onSubmit, onCancel) {
    const w = this.scale.width, h = this.scale.height;
    const D = 260;
    const objs = [];
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.72).setScrollFactor(0).setDepth(D).setInteractive();
    overlay.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(overlay);
    const card = this.add.rectangle(w/2, h/2, 520, 180, 0x101820, 0.98).setStrokeStyle(2, 0x446688).setScrollFactor(0).setDepth(D+1);
    objs.push(card);
    objs.push(this.add.text(w/2, h/2 - 58, title, { font:'bold 14px monospace', fill:'#ccddff' }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2));

    let value = (defaultText || '').slice(0, 28);
    const inputLbl = this.add.text(w/2, h/2 - 18, value || ' ', {
      font:'bold 16px monospace', fill:'#ffffff', backgroundColor:'#1a2430', padding:{x:12,y:8}, fixedWidth: 430, align: 'left'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2);
    objs.push(inputLbl);

    const hint = this.add.text(w/2, h/2 + 16, 'Type name, Enter=confirm, Esc=cancel', {
      font:'10px monospace', fill:'#778899'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2);
    objs.push(hint);

    const confirm = this.add.text(w/2 - 70, h/2 + 52, '[ CREATE ]', {
      font:'bold 12px monospace', fill:'#aaffaa', backgroundColor:'#173217', padding:{x:10,y:6}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
    const cancel = this.add.text(w/2 + 70, h/2 + 52, '[ CANCEL ]', {
      font:'bold 12px monospace', fill:'#ffaaaa', backgroundColor:'#321717', padding:{x:10,y:6}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
    objs.push(confirm, cancel);

    this._nameModalOpen = true;
    const cleanup = () => {
      this._nameModalOpen = false;
      if (this._nameModalKeyCb) this.input.keyboard.off('keydown', this._nameModalKeyCb);
      this._nameModalKeyCb = null;
      for (const o of objs) { try { o.destroy(); } catch(e){} }
    };
    const submit = () => { const out = (value.trim() || defaultText || 'New Design').slice(0, 28); cleanup(); onSubmit?.(out); };
    const abort = () => { cleanup(); onCancel?.(); };

    confirm.on('pointerdown', () => { this._contextMenuClicked = true; submit(); });
    cancel.on('pointerdown', () => { this._contextMenuClicked = true; abort(); });

    this._nameModalKeyCb = (ev) => {
      if (ev.key === 'Enter') return submit();
      if (ev.key === 'Escape') return abort();
      if (ev.key === 'Backspace') value = value.slice(0, -1);
      else if (ev.key && ev.key.length === 1 && value.length < 28) value += ev.key;
      inputLbl.setText(value || ' ');
    };
    this.input.keyboard.on('keydown', this._nameModalKeyCb);
    this._addToUI(objs);
  }

  _renderDesignerPanel(gs, p, w, h, D, objs, allChassis, selChassis, selMods, designName, onChassis, onMod, onRegister, onClose) {
    const panW  = Math.min(w - 40, 860);
    const panH  = h - 60;
    const px    = w / 2 - panW / 2;
    const py    = 50;
    const col1X = px + 16;        // left column x (chassis + modules)
    const col2X = px + panW * 0.55; // right column x (stat comparison + designs)
    const col2W = panW * 0.42;

    // Background — interactive to absorb all clicks and prevent bleed-through
    const bg = this.add.rectangle(w/2, py + panH/2, panW, panH, 0x080c10, 0.97)
      .setStrokeStyle(2, 0x3a6a3a).setScrollFactor(0).setDepth(D)
      .setInteractive();
    bg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(bg);

    // Header strip
    const hdr = this.add.rectangle(w/2, py + 22, panW, 44, 0x0d1a14, 1)
      .setScrollFactor(0).setDepth(D);
    objs.push(hdr);
    objs.push(this.add.text(w/2, py + 22, '🔧  UNIT DESIGNER', {
      font: 'bold 15px monospace', fill: '#88ddaa'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));

    // Slot / resource info
    const slotFull = (gs.designs[p]?.length || 0) >= MAX_DESIGNS_PER_PLAYER;
    objs.push(this.add.text(col2X + col2W, py + 22,
      `Designs: ${gs.designs[p]?.length || 0}/${MAX_DESIGNS_PER_PLAYER}  ⚙${gs.players[p].iron}  🛢${gs.players[p].oil}`, {
      font: '11px monospace', fill: slotFull ? '#ff8888' : '#88aa88'
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D+1));

    // Close button (top-right)
    const closeX = px + panW - 10;
    const closeBtn = this.add.text(closeX, py + 22, '✕', {
      font: 'bold 16px monospace', fill: '#888888'
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this._contextMenuClicked = true; onClose(); });
    closeBtn.on('pointerover', () => closeBtn.setStyle({ fill: '#ffffff' }));
    closeBtn.on('pointerout',  () => closeBtn.setStyle({ fill: '#888888' }));
    objs.push(closeBtn);

    // ── LEFT COLUMN: Chassis tabs ────────────────────────────────────────
    let ly = py + 56;
    objs.push(this.add.text(col1X, ly, 'CHASSIS', {
      font: 'bold 10px monospace', fill: '#668866'
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
    ly += 16;

    const tabW = 110, tabH = 28, tabGap = 4;
    allChassis.forEach((ch, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const tx = col1X + col * (tabW + tabGap);
      const ty = ly + row * (tabH + tabGap);
      const sel = ch === selChassis;
      const def = UNIT_TYPES[ch];
      const tabBg = this.add.rectangle(tx + tabW/2, ty + tabH/2, tabW, tabH,
        sel ? 0x1e4e2e : 0x111a14, 1)
        .setStrokeStyle(1, sel ? 0x44cc66 : 0x223322)
        .setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
      tabBg.on('pointerdown', () => { this._contextMenuClicked = true; onChassis(ch); });
      tabBg.on('pointerover', () => { if (!sel) tabBg.setFillStyle(0x1a3a22); });
      tabBg.on('pointerout',  () => { if (!sel) tabBg.setFillStyle(0x111a14); });
      objs.push(tabBg);
      const lbl = this.add.text(tx + tabW/2, ty + tabH/2, `${def?.name || ch} [T${def?.tier ?? 0}]`, {
        font: `${sel ? 'bold ' : ''}9px monospace`, fill: sel ? '#aaffcc' : '#668866'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2);
      objs.push(lbl);
    });
    const tabRows = Math.ceil(allChassis.length / 3);
    ly += tabRows * (tabH + tabGap) + 10;

    // ── Modules for selected chassis ─────────────────────────────────────
    if (selChassis) {
      const base = UNIT_TYPES[selChassis];
      objs.push(this.add.text(col1X, ly, 'MODULES', {
        font: 'bold 10px monospace', fill: '#668866'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
      ly += 16;

      const unlockedTechs = new Set(gs.players[p]?.research?.unlocked || []);
      const validMods = Object.entries(MODULES).filter(([, m]) => {
        if (!m.chassis.includes(selChassis)) return false;
        if (m.requiredTech && !unlockedTechs.has(m.requiredTech)) return false;
        return true;
      });
      if (validMods.length === 0) {
        objs.push(this.add.text(col1X, ly, '(no modules for this chassis)', {
          font: '10px monospace', fill: '#445544'
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
        ly += 16;
      }

      const modW = panW * 0.50 - 20;
      for (const [key, mod] of validMods) {
        const sel = selMods.has(key);
        const deltaStr = Object.entries(mod.statDelta).map(([k, v]) => `${k}${v>0?'+':''}${v}`).join(' ');
        const regCost  = `reg⚙${mod.designCost.iron}${mod.designCost.oil ? `🛢${mod.designCost.oil}` : ''}`;
        const trainCst = `train⚙${mod.trainCost.iron}${mod.trainCost.oil ? `🛢${mod.trainCost.oil}` : ''}`;
        const rowBg = this.add.rectangle(col1X + modW/2, ly + 13, modW, 26,
          sel ? 0x1a3a1a : 0x0e140e, 1)
          .setStrokeStyle(1, sel ? 0x44cc44 : 0x1e2e1e)
          .setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
        rowBg.on('pointerdown', () => { this._contextMenuClicked = true; onMod(key); });
        rowBg.on('pointerover', () => rowBg.setFillStyle(sel ? 0x1a4a1a : 0x141e14));
        rowBg.on('pointerout',  () => rowBg.setFillStyle(sel ? 0x1a3a1a : 0x0e140e));
        objs.push(rowBg);

        // Check mark + name
        objs.push(this.add.text(col1X + 6, ly + 13, `${sel ? '✓' : '○'} ${mod.name}`, {
          font: `${sel ? 'bold ' : ''}10px monospace`, fill: sel ? '#aaffaa' : '#668866'
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D+2));

        // Delta
        objs.push(this.add.text(col1X + modW * 0.45, ly + 13, deltaStr, {
          font: '10px monospace', fill: sel ? '#88ffcc' : '#446644'
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D+2));

        // Cost
        objs.push(this.add.text(col1X + modW - 6, ly + 13, `${regCost} ${trainCst}`, {
          font: '9px monospace', fill: '#556655'
        }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D+2));

        ly += 28;
      }
    }

    // ── RIGHT COLUMN: Stat comparison + existing designs ──────────────────
    let ry = py + 56;

    if (selChassis) {
      const base    = UNIT_TYPES[selChassis];
      const preview = computeDesignStats(selChassis, [...selMods]);
      const regCost = designRegistrationCost([...selMods]);
      const canAfford = gs.players[p].iron >= regCost.iron && gs.players[p].oil >= regCost.oil;

      // Stat comparison table header
      objs.push(this.add.text(col2X, ry, 'STAT COMPARISON', {
        font: 'bold 10px monospace', fill: '#668866'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
      ry += 16;

      const STATS = [
        ['Health',      'health'],
        ['Movement',    'move'],
        ['Range',       'range'],
        ['Soft Atk',    'soft_attack'],
        ['Hard Atk',    'hard_attack'],
        ['Pierce',      'pierce'],
        ['Armor',       'armor'],
        ['Defense',     'defense'],
        ['Evasion',     'evasion'],
        ['Accuracy',    'accuracy'],
      ];

      // Column headers
      objs.push(this.add.text(col2X + 90,  ry, 'BASE', { font: 'bold 9px monospace', fill: '#557755' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D+1));
      objs.push(this.add.text(col2X + 130, ry, 'WITH MODS', { font: 'bold 9px monospace', fill: '#88cc88' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D+1));
      objs.push(this.add.text(col2X + 185, ry, 'DELTA', { font: 'bold 9px monospace', fill: '#aaaaaa' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D+1));
      ry += 14;

      for (const [label, key] of STATS) {
        const bv = base[key] ?? 0;
        const pv = preview[key] ?? 0;
        const dv = pv - bv;
        const dColor = dv > 0 ? '#44ff88' : dv < 0 ? '#ff6655' : '#444444';
        const dStr   = dv === 0 ? '—' : `${dv > 0 ? '+' : ''}${dv}`;

        // Row bg alternating
        const rowBg2 = this.add.rectangle(col2X + col2W/2, ry + 8, col2W, 18,
          ry % 36 < 18 ? 0x0c140c : 0x0a120a, 1).setScrollFactor(0).setDepth(D+1);
        objs.push(rowBg2);

        objs.push(this.add.text(col2X + 2,   ry + 8, label, { font: '10px monospace', fill: '#668866' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D+2));
        objs.push(this.add.text(col2X + 90,  ry + 8, `${bv}`, { font: '10px monospace', fill: '#557755' }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(D+2));
        objs.push(this.add.text(col2X + 130, ry + 8, `${pv}`, { font: `bold 10px monospace`, fill: '#aaffaa' }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(D+2));
        objs.push(this.add.text(col2X + 185, ry + 8, dStr, { font: 'bold 10px monospace', fill: dColor }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(D+2));
        ry += 18;
      }

      ry += 8;
      // Train cost preview
      const trainCost = computeDesignStats(selChassis, [...selMods]); // reuse
      const baseCost  = UNIT_TYPES[selChassis]?.cost || {};
      let tIron = baseCost.iron || 0, tOil = baseCost.oil || 0;
      for (const mk of selMods) {
        const m = MODULES[mk];
        if (m) { tIron += m.trainCost.iron || 0; tOil += m.trainCost.oil || 0; }
      }
      tIron = Math.max(0, tIron);

      objs.push(this.add.text(col2X, ry, `Train cost per unit:  ⚙${tIron}${tOil > 0 ? `  🛢${tOil}` : ''}`, {
        font: '10px monospace', fill: '#99aa66'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
      ry += 16;
      objs.push(this.add.text(col2X, ry, `Register cost (one-time):  ⚙${regCost.iron}${regCost.oil > 0 ? `  🛢${regCost.oil}` : ''}`, {
        font: '10px monospace', fill: canAfford ? '#88cc66' : '#cc4444'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
      ry += 22;

      // Register button
      const btnColor = (canAfford && !slotFull) ? 0x226633 : 0x222222;
      const btnTxtClr = (canAfford && !slotFull) ? '#aaffaa' : '#555555';
      const regBtnW = col2W, regBtnH = 30;
      const regBtnBg = this.add.rectangle(col2X + col2W/2, ry + regBtnH/2, regBtnW, regBtnH, btnColor, 1)
        .setStrokeStyle(1, canAfford && !slotFull ? 0x44aa66 : 0x333333)
        .setScrollFactor(0).setDepth(D+1);
      objs.push(regBtnBg);
      const regBtnLbl = this.add.text(col2X + col2W/2, ry + regBtnH/2,
        slotFull ? '[ DESIGN SLOTS FULL ]' : (canAfford ? '[ NAME & REGISTER DESIGN ]' : '[ CANNOT AFFORD ]'), {
        font: 'bold 11px monospace', fill: btnTxtClr
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2);
      objs.push(regBtnLbl);
      if (canAfford && !slotFull) {
        regBtnBg.setInteractive({ useHandCursor: true });
        regBtnBg.on('pointerdown', () => { this._contextMenuClicked = true; onRegister(); });
        regBtnBg.on('pointerover', () => regBtnBg.setFillStyle(0x2a8844));
        regBtnBg.on('pointerout',  () => regBtnBg.setFillStyle(btnColor));
      }
      ry += regBtnH + 12;
    }

    // ── Existing designs list ─────────────────────────────────────────────
    const designs = gs.designs[p] || [];
    if (designs.length > 0) {
      objs.push(this.add.text(col2X, ry, `MY DESIGNS  (${designs.length}/${MAX_DESIGNS_PER_PLAYER})`, {
        font: 'bold 10px monospace', fill: '#668866'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
      ry += 16;

      for (const d of designs) {
        const base    = UNIT_TYPES[d.chassis];
        const bldType = CHASSIS_BUILDINGS[d.chassis] || '?';
        const modNames = (d.modules || []).map(mk => MODULES[mk]?.name || mk).join(', ') || 'none';
        const statStr  = `HP${d.stats.health} MOV${d.stats.move} SA${d.stats.soft_attack} HA${d.stats.hard_attack} ARM${d.stats.armor}`;
        const trainStr = `⚙${d.trainCost.iron}${d.trainCost.oil ? ` 🛢${d.trainCost.oil}` : ''}`;

        const rowH2 = 44;
        const dRowBg = this.add.rectangle(col2X + col2W/2, ry + rowH2/2, col2W, rowH2, 0x0c1a10, 1)
          .setStrokeStyle(1, 0x224422).setScrollFactor(0).setDepth(D+1);
        objs.push(dRowBg);

        objs.push(this.add.text(col2X + 6, ry + 6, `★ ${d.name}`, {
          font: 'bold 10px monospace', fill: '#aaffaa'
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+2));
        objs.push(this.add.text(col2X + 6, ry + 20, `${base?.name || d.chassis}  |  ${statStr}  |  ${trainStr}`, {
          font: '9px monospace', fill: '#668866'
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+2));
        objs.push(this.add.text(col2X + 6, ry + 32, `mods: ${modNames}  |  built@${bldType.replace('_',' ')}`, {
          font: '9px monospace', fill: '#445544'
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+2));
        ry += rowH2 + 4;
      }
    } else if (selChassis) {
      objs.push(this.add.text(col2X, ry, 'No designs registered yet.', {
        font: '10px monospace', fill: '#445544'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
    }
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
      // When the standalone designer is open, block world-click handling entirely.
      if (this._designerOpen) {
        this._contextMenuClicked = false;
        this._isDragging = false;
        return;
      }
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
          // In attack modes, treat RMB as target confirm (same as LMB) for faster mortar/artillery flow.
          if (this.mode === 'attack' || this.mode === 'attack_direct') {
            this._onHexClick(hex.q, hex.r);
          } else {
            this._menuAnchor = { x: ptr.x, y: ptr.y }; // remember cursor pos for menu placement
            const shiftRmb = !!ptr.event?.shiftKey;
            this._onHexRightClick(hex.q, hex.r, shiftRmb);
          }
        }
      }
      this._isDragging = false;
    });

    // Suppress browser context menu so right-click works in-game
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.input.on('wheel', (_ptr, _o, _dx, dy) => {
      // Centered zoom: always zoom toward screen center (no top-left drift).
      const step = 1.10;
      const dir = dy > 0 ? -1 : 1; // wheel down => zoom out
      const factor = dir > 0 ? step : (1 / step);
      if (this._zoomTarget === undefined) this._zoomTarget = cam.zoom;
      this._zoomTarget = Phaser.Math.Clamp(this._zoomTarget * factor, 0.2, 4.0);
      this._zoomPointer = { x: this.scale.width / 2, y: this.scale.height / 2 };
      this._zoomLastInputAt = performance.now();
    });

    this.input.keyboard.enableGlobalCapture();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this._shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.input.keyboard.on('keydown-ESC',   () => { if (this._nameModalOpen) return; if (!this._endTurnPending) this._toggleSettings(); });
    this.input.keyboard.on('keydown-X',     () => { if (this._nameModalOpen) return; this._confirmEndTurn(); });
    this.input.keyboard.on('keydown-M',     () => {
      if (this._nameModalOpen) return;
      if (!this.selectedUnit || Number(this.selectedUnit.owner) !== Number(this.gameState.currentPlayer)) return;
      this._enterMoveOrderMode(this.selectedUnit);
    });
    this.input.keyboard.on('keydown-N',     () => {
      if (this._nameModalOpen) return;
      this._selectNextReadyUnit();
    });
    this.input.keyboard.on('keydown-C',     () => {
      if (this._nameModalOpen) return;
      const u = this.selectedUnit;
      if (!u || Number(u.owner) !== Number(this.gameState.currentPlayer) || !u.moveOrder) return;
      delete u.moveOrder;
      this._pushLog(`P${u.owner} canceled move order for ${UNIT_TYPES[u.type]?.name || u.type}`);
      this._refresh();
    });
    // Supply overlay hotkey intentionally disabled (was keydown-S). Use UI button only.
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this._nameModalOpen) return;
      const now = performance.now();
      if (this._spaceGuardUntil && now < this._spaceGuardUntil) return;
      if (this._splashDismiss) {
        this._spaceGuardUntil = now + 380; // prevent chained submit from same key-repeat burst
        this._splashDismiss();
        this._splashDismiss = null;
        return;
      }
      if (this._endTurnPending) { this._onSubmit(); this._hideEndTurnConfirm(); return; }
      this._confirmEndTurn();
    });
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
    const noBuilding = !existingB || ROAD_TYPES.has(existingB.type);
    const res = gs.resourceHexes[`${unit.q},${unit.r}`];
    const iron = gs.players[p].iron, oil = gs.players[p].oil, wood = gs.players[p].wood || 0;
    const ttype = this.terrain[`${unit.q},${unit.r}`] ?? 0;
    const onForest  = ttype === 1 || ttype === 7;

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
    // Priority 1b: terrain-based extractors
    if (onForest  && noBuilding && !res) return { label: `LUMBER CAMP  2⚙`,    enabled: iron>=2,           cb: () => this._onBuildLumberCamp() };
    // Priority 2: no road on this hex → Road
    if (!roadAt(gs, unit.q, unit.r) && noBuilding) {
      return { label: `ROAD      1🪵`, enabled: wood >= 1, cb: () => this._onBuildRoad() };
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
    // Patrol Boat sprint: 2nd shorter move after first, but negates attack
    const movedThisTurn = unit._origQ !== undefined && (unit.q !== unit._origQ || unit.r !== unit._origR);
    if (def.canSprint && movedThisTurn && !unit.sprinted && !unit.attacked && !unit.suppressed) {
      actions.push({ label: `SPRINT +${def.sprintMove} (no attack)`, key: 'sprint', enabled: true, color: 0x1a6655,
        cb: () => this._onSprintMode(unit) });
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
    const canOffensivelyAttack = ((def.attack || 0) > 0) || ((def.soft_attack || 0) > 0) || ((def.hard_attack || 0) > 0) || ((def.naval_attack || 0) > 0);
    if (!unit.attacked && !unit.suppressed && canOffensivelyAttack) {
      const attackFog = AIR_UNITS.has(unit.type) ? null : this._currentFog;
      const visibleEnemies = getAttackableHexes(gs, unit, unit.q, unit.r, attackFog);
      // Single, consistent attack UX for all units (including mortar/artillery).
      if (visibleEnemies.length > 0) {
        actions.push({ label: 'ATTACK', key: 'attack', enabled: true, color: 0x882222,
          cb: () => this._onDirectAttackMode() });
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
    // Cancel active construction
    if (unit.constructing) {
      const bUnderConst = gs.buildings.find(b => b.id === unit.constructing);
      if (bUnderConst && bUnderConst.underConstruction) {
        actions.push({ label: `✕ CANCEL BUILD (no refund)`, key: 'cancel_build', enabled: true, color: 0x662222,
          cb: () => {
            // Remove the under-construction building; no resource refund
            gs.buildings = gs.buildings.filter(b => b.id !== unit.constructing);
            delete unit.constructing;
            unit.moved = false; // free the engineer
            this._hideContextMenu();
            this._refresh();
          }
        });
      }
    }
    if (def.canBuild && !unit.constructing) {
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
      if (bldg && bldg.owner === gs.currentPlayer && !ROAD_TYPES.has(bldg.type) &&
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
      const undoBlocked = !!unit._scoutedMove;
      actions.push({
        label: undoBlocked ? '↩ UNDO MOVE [revealed fog]' : '↩ UNDO MOVE',
        key: 'undo',
        enabled: !undoBlocked,
        color: undoBlocked ? 0x553322 : 0x554422,
        cb: () => this._onUndoMove()
      });
    }

    // Enemy building interaction: raid or hold for capture (non-HQ/core only)
    const standB = gs.buildings.find(b => b.q === unit.q && b.r === unit.r && !ROAD_TYPES.has(b.type));
    const raidBlocked = new Set(['HQ','NAVAL_BASE','ARMOR_WORKS','ADV_BARRACKS','ADV_AIRFIELD','NAVAL_DOCKYARD']);
    if (standB && Number(standB.owner) !== Number(gs.currentPlayer) && !raidBlocked.has(standB.type)) {
      actions.push({
        label: 'RAID BUILDING', key: 'raid', enabled: true, color: 0x774411,
        cb: () => {
          const b = gs.buildings.find(x => x.id === standB.id);
          if (!b) return;
          const p = gs.players[gs.currentPlayer];
          if (b.type === 'MINE') p.iron = (p.iron || 0) + 2;
          if (b.type === 'OIL_PUMP') p.oil = (p.oil || 0) + 1;
          if (b.type === 'LUMBER_CAMP' || b.type === 'FARM') p.wood = (p.wood || 0) + 2;
          gs.buildings = gs.buildings.filter(x => x.id !== b.id);
          unit.moved = true; unit.attacked = true;
          this._pushLog(`P${gs.currentPlayer} raided ${BUILDING_TYPES[b.type]?.name || b.type}`);
          this._hideContextMenu();
          this._refresh();
        }
      });
    }

    const hasCargo = Array.isArray(unit.cargo) && unit.cargo.length > 0;
    actions.push({
      label: hasCargo ? 'DISBAND [unload first]' : 'DISBAND UNIT',
      key: 'disband',
      enabled: !hasCargo,
      color: 0x662222,
      cb: () => {
        if (hasCargo) return;
        gs.units = gs.units.filter(u => u.id !== unit.id);
        delete gs.pendingMoves?.[unit.id];
        delete gs.pendingAttacks?.[unit.id];
        this._pushLog(`P${gs.currentPlayer} disbanded ${unit.designName || UNIT_TYPES[unit.type]?.name || unit.type}`);
        this._clearSelection();
        this._hideContextMenu();
        this._refresh();
      }
    });

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
    const btnH = 32, btnW = 220, gap = 4;
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
      const noBuilding = !existingBuilding || ROAD_TYPES.has(existingBuilding.type);
      const res = gs.resourceHexes[`${unit.q},${unit.r}`];
      const iron = gs.players[p].iron, oil = gs.players[p].oil, wood = gs.players[p].wood || 0;
      const coastal = this._isCoastalHex(unit.q, unit.r);
      const ttype = this.terrain[`${unit.q},${unit.r}`] ?? 0;
      const onForest  = ttype === 1 || ttype === 7;

      // All possible build options — grouped for readability
      const allOpts = [];
      const addHeader = (label) => allOpts.push({ header: true, label: `── ${label} ──`, enabled: false, cb: () => {} });

      addHeader('ROADS');
      // Road building — show upgrade option if existing road is lower tier
      const existingRoad = roadAt(gs, unit.q, unit.r);
      const existingTier = existingRoad ? (BUILDING_TYPES[existingRoad.type]?.roadTier ?? 0) : -1;
      const unlocked = gs.players[p].research?.unlocked || [];
      const hasConcreteTech = unlocked.includes('CONCRETE_ROADS');
      const hasRailTech     = unlocked.includes('RAILWAYS');
      if (!existingRoad) {
        allOpts.push({ label: `Dirt Road   1🪵`,  cost: { iron:0, oil:0, wood:1 }, enabled: wood>=1,  cb: () => this._onBuildRoad('ROAD') });
      } else if (existingTier < 1 && hasConcreteTech) {
        allOpts.push({ label: `Upgrade→Concrete  2⚙`, cost: { iron:2,oil:0,wood:0 }, enabled: iron>=2,
          cb: () => this._onUpgradeRoad(unit, 'CONCRETE_ROAD') });
      } else if (existingTier < 2 && hasRailTech) {
        allOpts.push({ label: `Upgrade→Railway  4⚙ 1🛢 2🪵`, cost: { iron:4,oil:1,wood:2 },
          enabled: iron>=4 && oil>=1 && wood>=2,
          cb: () => this._onUpgradeRoad(unit, 'RAILWAY') });
      }
      // Auto-road standing order (engineer pathfinds to destination, builds each turn)
      if (unit.roadOrder) {
        allOpts.push({ label: `✕ CANCEL ROAD ORDER`, cost: null, enabled: true, cb: () => { delete unit.roadOrder; this._hideContextMenu(); this._refresh(); } });
      } else {
        allOpts.push({ label: `AUTO-ROAD →`, cost: null, enabled: true, cb: () => this._enterRoadDestMode(unit) });
      }
      addHeader('RESOURCE EXTRACTION');
      if (res && noBuilding)
        allOpts.push({ label: `${res.type==='OIL'?'Oil Pump   4⚙ 2🛢':'Mine        4⚙'}`,
                       cost: { iron:4,oil: res.type==='OIL'?2:0 }, enabled: res.type==='OIL'?(iron>=4&&oil>=2):iron>=4,
                       cb: () => this._onBuildMine(res.type) });
      if (onForest && noBuilding)
        allOpts.push({ label: `Lumber Camp 2⚙`, cost:{iron:2,oil:0,wood:0}, enabled: iron>=2,
                       cb: () => this._onBuildLumberCamp() });
      addHeader('LAND MILITARY');
      if (noBuilding) allOpts.push({ label: `Barracks    4⚙ 4🪵`,    cost:{iron:4,oil:0,wood:4},  enabled: iron>=4&&wood>=4,        cb: () => this._onBuildStructure('BARRACKS',4,0,4) });
      if (noBuilding) allOpts.push({ label: `Vehicle Depot 8⚙ 2🛢`, cost:{iron:8,oil:2},          enabled: iron>=8&&oil>=2,         cb: () => this._onBuildStructure('VEHICLE_DEPOT',8,2) });
      if (noBuilding) allOpts.push({ label: `Adv Barracks T2 10⚙ 2🛢 6🪵 2🧩`, cost:{iron:10,oil:2,wood:6,components:2}, enabled: iron>=10&&oil>=2&&wood>=6&&(gs.players[p].components||0)>=2, cb: () => this._onBuildStructure('ADV_BARRACKS',10,2,6,2) });
      if (noBuilding) allOpts.push({ label: `Armor Works T2 14⚙ 4🛢 4🪵 3🧩`,  cost:{iron:14,oil:4,wood:4,components:3}, enabled: iron>=14&&oil>=4&&wood>=4&&(gs.players[p].components||0)>=3, cb: () => this._onBuildStructure('ARMOR_WORKS',14,4,4,3) });
      if (noBuilding) allOpts.push({ label: `Airfield     6⚙ 2🛢 2🪵`,      cost:{iron:6,oil:2,wood:2}, enabled: iron>=6&&oil>=2&&wood>=2, cb: () => this._onBuildStructure('AIRFIELD',6,2,2) });
      if (noBuilding) allOpts.push({ label: `Adv Airfield T2 12⚙ 5🛢 4🪵 3🧩`, cost:{iron:12,oil:5,wood:4,components:3}, enabled: iron>=12&&oil>=5&&wood>=4&&(gs.players[p].components||0)>=3, cb: () => this._onBuildStructure('ADV_AIRFIELD',12,5,4,3) });
      addHeader('NAVAL');
      if (noBuilding && coastal) allOpts.push({ label: `Naval Yard  8⚙ 2🛢`,   cost:{iron:8,oil:2},  enabled: iron>=8&&oil>=2,  cb: () => this._onBuildStructure('NAVAL_YARD',8,2) });
      if (noBuilding && coastal) allOpts.push({ label: `Harbor      5⚙ 1🛢 1🧩`,   cost:{iron:5,oil:1,components:1},  enabled: iron>=5&&oil>=1&&(gs.players[p].components||0)>=1,  cb: () => this._onBuildStructure('HARBOR',5,1,0,1) });
      if (noBuilding && coastal) allOpts.push({ label: `Dry Dock   12⚙ 4🛢 2🧩`,   cost:{iron:12,oil:4,components:2}, enabled: iron>=12&&oil>=4&&(gs.players[p].components||0)>=2, cb: () => this._onBuildStructure('DRY_DOCK',12,4,0,2) });
      if (noBuilding && coastal) allOpts.push({ label: `Naval Base 16⚙ 6🛢 3🧩`,   cost:{iron:16,oil:6,components:3}, enabled: iron>=16&&oil>=6&&(gs.players[p].components||0)>=3, cb: () => this._onBuildStructure('NAVAL_BASE',16,6,0,3) });
      if (noBuilding && coastal) allOpts.push({ label: `Naval Dockyard T2 16⚙ 5🛢 4🪵 3🧩`, cost:{iron:16,oil:5,wood:4,components:3}, enabled: iron>=16&&oil>=5&&wood>=4&&(gs.players[p].components||0)>=3, cb: () => this._onBuildStructure('NAVAL_DOCKYARD',16,5,4,3) });
      addHeader('DEFENSE & OBSTACLES');
      if (noBuilding) allOpts.push({ label: `Bunker      3⚙ 2🪵`,   cost:{iron:3,oil:0,wood:2},  enabled: iron>=3&&wood>=2, cb: () => this._onBuildStructure('BUNKER',3,0,2) });
      if (noBuilding) allOpts.push({ label: `Obs. Post   3⚙`,       cost:{iron:3,oil:0},         enabled: iron>=3,          cb: () => this._onBuildStructure('OBS_POST',3) });
      // Obstacles & logistics (require research)
      if (unlocked.includes('barbed_wire')   && noBuilding)
        allOpts.push({ label: `Barbed Wire 1🪵`,  cost:{iron:0,oil:0,wood:1}, enabled: wood>=1,    cb: () => this._onBuildStructure('BARBED_WIRE',0,0,1) });
      if (unlocked.includes('sandbag_improved') && noBuilding)
        allOpts.push({ label: `Sandbag Post 1🪵`, cost:{iron:0,oil:0,wood:1}, enabled: wood>=1,    cb: () => this._onBuildStructure('SANDBAG',0,0,1) });
      if (unlocked.includes('supply_depot') && noBuilding)
        allOpts.push({ label: `Supply Depot 3⚙ 1🛢 1🪵`, cost:{iron:3,oil:1,wood:1}, enabled: iron>=3&&oil>=1&&wood>=1, cb: () => this._onBuildStructure('SUPPLY_DEPOT',3,1,1) });
      addHeader('ECONOMY & RESEARCH');
      const foodGold = gs.players[p].food || 0;
      const gold = gs.players[p].gold || 0;
      const onPlains = (ttype === 0 || ttype === 6 || ttype === 7);
      if (noBuilding && onPlains) allOpts.push({ label: `Farm 🍞     2⚙ 3🪵`,   cost:{iron:2,oil:0,wood:3}, enabled: iron>=2&&wood>=3, cb: () => this._onBuildStructure('FARM',2,0,3) });
      if (noBuilding) allOpts.push({ label: `Market 💰   3⚙ 4🪵`,             cost:{iron:3,oil:0,wood:4}, enabled: iron>=3&&wood>=4, cb: () => this._onBuildStructure('MARKET',3,0,4) });
      if (noBuilding) allOpts.push({ label: `Science Lab ⚗  6⚙ 4🪵`,         cost:{iron:6,oil:0,wood:4}, enabled: iron>=6&&wood>=4, cb: () => this._onBuildStructure('SCIENCE_LAB',6,0,4) });
      if (noBuilding) allOpts.push({ label: `Factory 🧩    10⚙ 3🛢 8🪵`,      cost:{iron:10,oil:3,wood:8}, enabled: iron>=10&&oil>=3&&wood>=8, cb: () => this._onBuildStructure('FACTORY',10,3,8) });
      // Coastal Battery — must be placed on coastal land hex
      if (coastal) allOpts.push({ label: `Coast. Battery 6⚙ 1🛢`, cost:{iron:6,oil:1}, enabled: iron>=6&&oil>=1, cb: () => this._onBuildCoastalBattery() });
      // AA Emplacement — spawns as immobile anti-air unit
      allOpts.push({ label: `AA Emplacement 4⚙ 1🛢`, cost:{iron:4,oil:1}, enabled: iron>=4&&oil>=1, cb: () => this._onBuildAAEmplacement() });
      // Future entries just go here — pagination handles overflow automatically

      const totalPages = Math.max(1, Math.ceil(allOpts.length / PAGE_SIZE));
      page = Phaser.Math.Clamp(page, 0, totalPages - 1);
      const slice = allOpts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

      items = slice.map(o => ({
        label:   o.header ? o.label : (o.enabled ? o.label : `${o.label}  ✗`),
        color:   o.header ? 0x1d2b1d : (o.enabled ? 0x2a5533 : 0x222222),
        enabled: o.header ? false : o.enabled,
        cb:      o.cb,
        header:  !!o.header,
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

    // Menu backdrop panel (cleaner visual grouping)
    const panelBg = this.add.rectangle(px + btnW/2, py + menuH/2, btnW + 10, menuH + 8, 0x0a0f0a, 0.94)
      .setStrokeStyle(1, 0x334433).setScrollFactor(0).setDepth(DEPTH - 1).setOrigin(0.5)
      .setInteractive();
    panelBg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(panelBg);

    // ── Title row ────────────────────────────────────────────────────────────
    let rowY = py;
    if (title) {
      const hdr = this.add.text(px, rowY, title, {
        font: 'bold 11px monospace', fill: '#bfffd2',
        backgroundColor: '#16321f', padding: { x: 10, y: 6 },
        fixedWidth: btnW, align: 'center'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH);
      objs.push(hdr);
      rowY += btnH + gap;
    }

    // ── Item rows ────────────────────────────────────────────────────────────
    items.forEach(item => {
      const col = `#${item.color.toString(16).padStart(6,'0')}`;
      const btn = this.add.text(px, rowY, item.label, {
        font: `bold 11px monospace`, fill: item.enabled ? '#ffffff' : '#666666',
        backgroundColor: col, padding: { x: 10, y: 6 },
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
    this._closeTrade?.();
    this._closeEconomy?.();
    this._settingsOpen = true;
    const w = this.scale.width, h = this.scale.height;
    const panelW = 560, panelH = 420, D = 210;
    const objs = [];

    const bg = this.add.rectangle(w/2, h/2, panelW, panelH, 0x111122, 0.97)
      .setStrokeStyle(2, 0x4466aa).setScrollFactor(0).setDepth(D);
    objs.push(bg);
    objs.push(this.add.text(w/2, h/2 - panelH/2 + 22, '── SETTINGS ──', {
      font: 'bold 15px monospace', fill: '#88ccff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));

    let y = h/2 - panelH/2 + 62;
    const leftX = w/2 - panelW/2 + 24;
    const rightX = w/2 + panelW/2 - 90;

    const mkToggleRow = (key, label) => {
      const lbl = this.add.text(leftX, y, label, { font: '12px monospace', fill: '#cccccc' })
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(D+1);
      const val = !!this.settings[key];
      const tog = this.add.text(rightX, y, val ? '[ ON ]' : '[ OFF ]', {
        font: 'bold 12px monospace', fill: val ? '#88ff88' : '#ff8888',
        backgroundColor: val ? '#224422' : '#442222', padding: { x: 10, y: 5 }
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
      tog.on('pointerdown', () => { this.settings[key] = !this.settings[key]; this._openSettings(); });
      tog.on('pointerover', () => tog.setAlpha(0.8));
      tog.on('pointerout',  () => tog.setAlpha(1.0));
      objs.push(lbl, tog);
      y += 40;
    };

    mkToggleRow('engineerAutoBuild', 'Engineer auto-build menu');
    mkToggleRow('autoAttackMode',    'Auto-enter attack after move');
    mkToggleRow('showContextMenu',   'Show unit context menu');

    // Zoom speed row (compact, no collisions)
    objs.push(this.add.text(leftX, y, 'Scroll zoom speed', {
      font: '12px monospace', fill: '#cccccc'
    }).setOrigin(0,0.5).setScrollFactor(0).setDepth(D+1));

    const zoomSteps = [0.03, 0.05, 0.08, 0.10, 0.14, 0.18, 0.24, 0.30];
    let zi = zoomSteps.findIndex(v => Math.abs(v - this.settings.zoomSpeed) < 0.01);
    if (zi < 0) zi = 3;

    const minus = this.add.text(rightX - 60, y, '[-]', {
      font:'bold 12px monospace', fill:'#dddddd', backgroundColor:'#222222', padding:{x:8,y:5}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor:true });
    const valLbl = this.add.text(rightX, y, `${zoomSteps[zi]}x`, {
      font:'bold 12px monospace', fill:'#ffee88', backgroundColor:'#332b11', padding:{x:10,y:5}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1);
    const plus = this.add.text(rightX + 60, y, '[+]', {
      font:'bold 12px monospace', fill:'#dddddd', backgroundColor:'#222222', padding:{x:8,y:5}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor:true });
    minus.on('pointerdown', () => { this.settings.zoomSpeed = zoomSteps[Math.max(0, zi - 1)]; this._openSettings(); });
    plus.on('pointerdown',  () => { this.settings.zoomSpeed = zoomSteps[Math.min(zoomSteps.length - 1, zi + 1)]; this._openSettings(); });
    objs.push(minus, valLbl, plus);
    y += 44;

    // AI toggle row
    objs.push(this.add.text(leftX, y, 'Player 2 AI', { font: '12px monospace', fill: '#cccccc' })
      .setOrigin(0,0.5).setScrollFactor(0).setDepth(D+1));
    const isAI = this.aiPlayers.has(2);
    const aiTog = this.add.text(rightX, y, isAI ? '[ ON 🤖 ]' : '[ OFF ]', {
      font:'bold 12px monospace', fill:isAI ? '#ffcc44' : '#888888',
      backgroundColor:isAI ? '#332200' : '#222222', padding:{x:10,y:5}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor:true });
    aiTog.on('pointerdown', () => { if (this.aiPlayers.has(2)) this.aiPlayers.delete(2); else this.aiPlayers.add(2); this._openSettings(); });
    objs.push(aiTog);
    y += 40;

    // AI strategy row (wider spacing)
    objs.push(this.add.text(leftX, y, 'AI Strategy', { font: '12px monospace', fill: '#cccccc' })
      .setOrigin(0,0.5).setScrollFactor(0).setDepth(D+1));
    const stratKeys = Object.keys(AI_STRATEGIES);
    stratKeys.forEach((key, i) => {
      const isActive = this.aiStrategy === key;
      const sb = this.add.text(w/2 - 60 + i * 72, y + 26, AI_STRATEGIES[key].label, {
        font:'10px monospace', fill:isActive ? '#ffcc44' : '#888888',
        backgroundColor:isActive ? '#332200' : '#222222', padding:{x:6,y:4}
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor:true });
      sb.on('pointerdown', () => { this.aiStrategy = key; this._openSettings(); });
      objs.push(sb);
    });

    const closeBtn = this.add.text(w/2, h/2 + panelH/2 - 26, '[ CLOSE ]', {
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

  // ── Economy Panel ─────────────────────────────────────────────────────────
  _toggleEconomy() {
    if (this._economyOpen) this._closeEconomy();
    else this._openEconomy();
  }

  _closeEconomy() {
    if (this._economyObjs) {
      for (const o of this._economyObjs) { try { o.destroy(); } catch(e){} }
      this._economyObjs = null;
    }
    this._economyOpen = false;
    if (this.btnEconomy) this.btnEconomy.setStyle({ backgroundColor: '#2a2a14' });
  }

  _openEconomy() {
    this._closeEconomy();
    this._closeTrade?.();
    this._closeResearch?.();
    this._closeDesigner?.();
    this._closeSettings?.();
    this._economyOpen = true;
    if (this.btnEconomy) this.btnEconomy.setStyle({ backgroundColor: '#5a5a1f' });

    const gs = this.gameState;
    const p = gs.currentPlayer;
    const pl = gs.players[p];
    const w = this.scale.width, h = this.scale.height;
    const D = 222;
    const panW = Math.min(820, w - 24), panH = Math.min(500, h - 24);
    const px = w / 2, py = h / 2;
    const objs = [];

    const bg = this.add.rectangle(px, py, panW, panH, 0x0f1114, 0.985)
      .setStrokeStyle(2, 0x667788).setScrollFactor(0).setDepth(D).setInteractive();
    bg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(bg);

    const hdr = this.add.text(px, py - panH/2 + 16, '📊 ECONOMY (AT A GLANCE)', {
      font:'bold 14px monospace', fill:'#cde4ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1);
    objs.push(hdr);

    const closeBtn = this.add.text(px + panW/2 - 12, py - panH/2 + 16, '✕', {
      font:'bold 16px monospace', fill:'#aaaaaa'
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this._contextMenuClicked = true; this._closeEconomy(); });
    objs.push(closeBtn);

    const inc = calcIncome(gs, p);
    const upkeep = calcUpkeep(gs, p);
    const net = {
      iron: +(inc.iron - upkeep.iron).toFixed(1),
      oil: +(inc.oil - upkeep.oil).toFixed(1),
      food: +((inc.food || 0) - (upkeep.food || 0)).toFixed(1),
      gold: +(inc.gold || 0).toFixed(1),
      rp: +(inc.rp || 0).toFixed(1),
    };

    const left = px - panW/2 + 16;
    const right = px + 8;
    let y = py - panH/2 + 42;

    // KPI cards
    const cardW = Math.floor((panW - 40) / 2);
    const cardH = 52;
    const card = (cx, cy, title, body, tone = 0x1a2028) => {
      const r = this.add.rectangle(cx, cy, cardW, cardH, tone, 0.95)
        .setStrokeStyle(1, 0x3a4d62).setScrollFactor(0).setDepth(D+1);
      const t1 = this.add.text(cx - cardW/2 + 10, cy - 15, title, { font:'bold 10px monospace', fill:'#9fb6cc' })
        .setOrigin(0,0).setScrollFactor(0).setDepth(D+2);
      const t2 = this.add.text(cx - cardW/2 + 10, cy + 2, body, { font:'12px monospace', fill:'#e4eef9' })
        .setOrigin(0,0).setScrollFactor(0).setDepth(D+2);
      objs.push(r, t1, t2);
    };

    card(px - cardW/2 - 6, y + cardH/2, 'STOCKPILE', `⚙${pl.iron}  🛢${pl.oil}  🪵${pl.wood||0}  🍞${(pl.food||0).toFixed(1)}  💰${(pl.gold||0).toFixed(1)}  🧩${pl.components||0}`);
    card(px + cardW/2 + 6, y + cardH/2, 'NET / TURN', `⚙${net.iron>=0?'+':''}${net.iron}  🛢${net.oil>=0?'+':''}${net.oil}  🍞${net.food>=0?'+':''}${net.food}  💰+${net.gold}  ⚗+${net.rp}`,
      (net.iron < 0 || net.oil < 0 || net.food < 0) ? 0x2a1717 : 0x17241a);
    y += cardH + 16;

    // Left: buildings summary (concise)
    const myBuildings = gs.buildings.filter(b => Number(b.owner) === Number(p) && !ROAD_TYPES.has(b.type));
    const countByType = {};
    for (const b of myBuildings) countByType[b.type] = (countByType[b.type] || 0) + 1;
    const bTop = Object.entries(countByType)
      .sort((a,b)=> (b[1]-a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([t,c]) => `${String(c).padStart(2,' ')}x ${BUILDING_TYPES[t]?.name || t}`)
      .join('\n');

    objs.push(this.add.text(left, y, 'BUILDINGS', {
      font:'bold 11px monospace', fill:'#ffddaa'
    }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
    objs.push(this.add.text(left, y + 16, bTop || '(none)', {
      font:'10px monospace', fill:'#c5d2de', lineSpacing: 2
    }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));

    // Right: units summary (concise)
    const myUnits = gs.units.filter(u => Number(u.owner) === Number(p));
    const uCount = {};
    for (const u of myUnits) uCount[u.type] = (uCount[u.type] || 0) + 1;
    const uTop = Object.entries(uCount)
      .sort((a,b)=> (b[1]-a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([t,c]) => `${String(c).padStart(2,' ')}x ${UNIT_TYPES[t]?.name || t}`)
      .join('\n');

    objs.push(this.add.text(right, y, 'UNITS', {
      font:'bold 11px monospace', fill:'#ffddaa'
    }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
    objs.push(this.add.text(right, y + 16, uTop || '(none)', {
      font:'10px monospace', fill:'#c5d2de', lineSpacing: 2
    }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));

    // Factory controls (clear + simple)
    const myFactories = gs.buildings.filter(b => Number(b.owner) === Number(p) && b.type === 'FACTORY' && !b.underConstruction);
    const activeFactories = myFactories.filter(f => f.active !== false).length;
    const fy = py + panH/2 - 70;

    objs.push(this.add.text(left, fy - 18,
      `FACTORIES: ${activeFactories}/${myFactories.length} ONLINE  (1⚙ +1🛢 +1🪵 -> 1🧩 each)`,
      { font:'10px monospace', fill:'#99ddaa' }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));

    const mkBtn = (x, label, bgc, cb) => {
      const b = this.add.text(x, fy + 2, label, {
        font:'bold 10px monospace', fill:'#fff', backgroundColor:bgc, padding:{x:8,y:5}
      }).setOrigin(0,0).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor:true });
      b.on('pointerdown', () => { this._contextMenuClicked = true; cb(); });
      objs.push(b);
    };

    mkBtn(left, '[ALL ON]', '#225522', () => {
      for (const f of myFactories) f.active = true;
      this._pushLog(`P${p}: all factories ON`);
      this._refresh();
      this._openEconomy();
    });
    mkBtn(left + 90, '[ALL OFF]', '#552222', () => {
      for (const f of myFactories) f.active = false;
      this._pushLog(`P${p}: all factories OFF`);
      this._refresh();
      this._openEconomy();
    });

    this._addToUI(objs);
    this._economyObjs = objs;
  }

  // ── Trade Contracts Panel ─────────────────────────────────────────────────
  _toggleTrade() {
    if (this._tradeOpen) this._closeTrade();
    else this._openTrade();
  }

  _closeTrade() {
    if (this._tradeObjs) {
      for (const o of this._tradeObjs) { try { o.destroy(); } catch(e){} }
      this._tradeObjs = null;
    }
    this._tradeOpen = false;
    if (this.btnTrade) this.btnTrade.setStyle({ backgroundColor: '#3a2a11' });
  }

  _showFactoryPanel(factory) {
    this._hideContextMenu();
    const w = this.scale.width, h = this.scale.height;
    const D = 230;
    const objs = [];
    const bg = this.add.rectangle(w/2, h/2, 380, 170, 0x121212, 0.97)
      .setStrokeStyle(2, 0x666666).setScrollFactor(0).setDepth(D).setInteractive();
    bg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(bg);
    const active = factory.active !== false;
    objs.push(this.add.text(w/2, h/2 - 50, 'FACTORY CONTROL', {
      font:'bold 14px monospace', fill:'#dddddd'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));
    objs.push(this.add.text(w/2, h/2 - 20, `Status: ${active ? 'ONLINE' : 'OFFLINE'}  |  Converts 1⚙ +1🛢 +1🪵 -> 1🧩`, {
      font:'10px monospace', fill: active ? '#88dd88' : '#dd8888'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));
    const toggle = this.add.text(w/2 - 70, h/2 + 24, active ? '[ TURN OFF ]' : '[ TURN ON ]', {
      font:'bold 12px monospace', fill:'#ffffff', backgroundColor: active ? '#552222' : '#225522', padding:{x:10,y:6}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor:true });
    const close = this.add.text(w/2 + 70, h/2 + 24, '[ CLOSE ]', {
      font:'bold 12px monospace', fill:'#dddddd', backgroundColor:'#333333', padding:{x:10,y:6}
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor:true });
    toggle.on('pointerdown', () => {
      this._contextMenuClicked = true;
      factory.active = !active;
      this._pushLog(`Factory ${factory.active ? 'ON' : 'OFF'}`);
      for (const o of objs) { try { o.destroy(); } catch(e){} }
      this._refresh();
    });
    close.on('pointerdown', () => {
      this._contextMenuClicked = true;
      for (const o of objs) { try { o.destroy(); } catch(e){} }
    });
    objs.push(toggle, close);
    this._addToUI(objs);
  }

  _openTrade() {
    this._closeTrade();
    this._closeResearch?.();
    this._closeDesigner?.();
    this._closeSettings?.();
    this._closeEconomy?.();
    this._tradeOpen = true;
    if (this.btnTrade) this.btnTrade.setStyle({ backgroundColor: '#6a4a11' });

    const gs = this.gameState;
    const p = gs.currentPlayer;
    const other = p === 1 ? 2 : 1;
    if (!gs.tradeOffers) gs.tradeOffers = [];

    const w = this.scale.width, h = this.scale.height;
    const D = 220;
    const panW = Math.min(760, w - 30), panH = Math.min(520, h - 40);
    const px = w / 2, py = h / 2;
    const objs = [];

    const rebuild = () => {
      for (const o of objs) { try { o.destroy(); } catch(e){} }
      objs.length = 0;

      // Trade v2 rules
      const MAX_PENDING_PER_PLAYER = 5;
      const OFFER_EXPIRY_TURNS = 3;
      // Expire old pending offers
      for (const t of gs.tradeOffers) {
        if (t.status === 'pending' && (gs.turn - (t.createdTurn || gs.turn)) > OFFER_EXPIRY_TURNS) {
          t.status = 'expired';
          t.resolvedTurn = gs.turn;
        }
      }

      const bg = this.add.rectangle(px, py, panW, panH, 0x120f0a, 0.98)
        .setStrokeStyle(2, 0x886633).setScrollFactor(0).setDepth(D).setInteractive();
      bg.on('pointerdown', () => { this._contextMenuClicked = true; });
      objs.push(bg);

      objs.push(this.add.text(px, py - panH/2 + 16, '💱 TRADE CONTRACTS', {
        font: 'bold 14px monospace', fill: '#ffdd88'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));

      const closeBtn = this.add.text(px + panW/2 - 12, py - panH/2 + 16, '✕', {
        font: 'bold 16px monospace', fill: '#aaaaaa'
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
      closeBtn.on('pointerdown', () => { this._contextMenuClicked = true; this._closeTrade(); });
      objs.push(closeBtn);

      const my = gs.players[p], op = gs.players[other];
      objs.push(this.add.text(px - panW/2 + 16, py - panH/2 + 40,
        `P${p} You: ⚙${my.iron} 🛢${my.oil} 🪵${my.wood||0} 🍞${(my.food||0).toFixed(1)} 💰${(my.gold||0).toFixed(1)}   |   P${other}: ⚙${op.iron} 🛢${op.oil} 🪵${op.wood||0} 🍞${(op.food||0).toFixed(1)} 💰${(op.gold||0).toFixed(1)}`,
        { font:'10px monospace', fill:'#c8b890' }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));

      let y = py - panH/2 + 70;
      objs.push(this.add.text(px - panW/2 + 16, y, 'Incoming Offers:', { font:'bold 11px monospace', fill:'#ddbb88' })
        .setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
      y += 18;

      const incoming = gs.tradeOffers.filter(t => t.status === 'pending' && t.to === p).slice(-6);
      const myPendingOutgoing = gs.tradeOffers.filter(t => t.status === 'pending' && t.from === p).length;
      const resValue = (pack) => ((pack.iron||0)*10 + (pack.oil||0)*12 + (pack.wood||0)*6 + (pack.food||0)*5 + (pack.gold||0));
      if (incoming.length === 0) {
        objs.push(this.add.text(px - panW/2 + 16, y, '(none)', { font:'10px monospace', fill:'#776655' })
          .setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
        y += 18;
      }

      for (const t of incoming) {
        const row = this.add.rectangle(px, y + 11, panW - 32, 22, 0x1a140c, 1)
          .setStrokeStyle(1, 0x4a3a22).setScrollFactor(0).setDepth(D+1);
        objs.push(row);
        const turnsLeft = Math.max(0, OFFER_EXPIRY_TURNS - (gs.turn - (t.createdTurn || gs.turn)));
        const giveV = resValue(t.give || {}), getV = resValue(t.get || {});
        const ratio = getV > 0 ? (giveV / getV) : 0;
        const fair = ratio >= 0.9 && ratio <= 1.1 ? '≈ fair' : (ratio < 0.9 ? 'good for you' : 'expensive');
        objs.push(this.add.text(px - panW/2 + 22, y + 11,
          `P${t.from}: 💰${t.give.gold||0} → ⚙${t.get.iron||0} 🛢${t.get.oil||0} 🪵${t.get.wood||0} 🍞${t.get.food||0}  | ${fair} | ${turnsLeft}t left`,
          { font:'10px monospace', fill:'#ccbb99' }).setOrigin(0,0.5).setScrollFactor(0).setDepth(D+2));

        const accept = this.add.text(px + panW/2 - 120, y + 11, '[ACCEPT]', {
          font:'bold 10px monospace', fill:'#88dd88', backgroundColor:'#163016', padding:{x:6,y:3}
        }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor:true });
        accept.on('pointerdown', () => {
          this._contextMenuClicked = true;
          const from = gs.players[t.from], to = gs.players[t.to];
          const can = (from.gold||0) >= (t.give.gold||0) &&
                      (to.iron||0) >= (t.get.iron||0) &&
                      (to.oil||0) >= (t.get.oil||0) &&
                      (to.wood||0) >= (t.get.wood||0) &&
                      (to.food||0) >= (t.get.food||0);
          if (!can) { this._pushLog('Trade failed: resources changed since offer was made.'); t.status = 'void'; rebuild(); return; }
          from.gold -= (t.give.gold||0);
          to.gold   = (to.gold||0) + (t.give.gold||0);
          to.iron   -= (t.get.iron||0); from.iron += (t.get.iron||0);
          to.oil    -= (t.get.oil||0);  from.oil  += (t.get.oil||0);
          to.wood   = (to.wood||0) - (t.get.wood||0); from.wood = (from.wood||0) + (t.get.wood||0);
          to.food   = +((to.food||0) - (t.get.food||0)).toFixed(1);
          from.food = +((from.food||0) + (t.get.food||0)).toFixed(1);
          t.status = 'accepted'; t.resolvedTurn = gs.turn;
          this._pushLog(`Trade accepted: P${t.from}⇄P${t.to}`);
          this._refresh();
          rebuild();
        });
        objs.push(accept);

        const decline = this.add.text(px + panW/2 - 48, y + 11, '[DECLINE]', {
          font:'bold 10px monospace', fill:'#dd8888', backgroundColor:'#301616', padding:{x:6,y:3}
        }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor:true });
        decline.on('pointerdown', () => { this._contextMenuClicked = true; t.status='declined'; t.resolvedTurn = gs.turn; rebuild(); });
        objs.push(decline);
        y += 26;
      }

      y += 12;
      const capReached = myPendingOutgoing >= MAX_PENDING_PER_PLAYER;
      objs.push(this.add.text(px - panW/2 + 16, y, `Create Offer to P${other}:  (${myPendingOutgoing}/${MAX_PENDING_PER_PLAYER} pending)`, {
        font:'bold 11px monospace', fill: capReached ? '#cc6666' : '#ddbb88'
      }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
      y += 18;

      const mkOfferBtn = (label, giveGold, getIron=0, getOil=0, getWood=0, getFood=0) => {
        const canAfford = (my.gold||0) >= giveGold;
        const enabled = canAfford && !capReached;
        const b = this.add.text(px - panW/2 + 16, y, `${label}  (give 💰${giveGold} for ⚙${getIron} 🛢${getOil} 🪵${getWood} 🍞${getFood})`, {
          font:'10px monospace',
          fill: enabled ? '#ffeeaa' : '#776655',
          backgroundColor: enabled ? '#2a220f' : '#15120c',
          padding:{x:8,y:5}
        }).setOrigin(0,0).setScrollFactor(0).setDepth(D+2);
        if (enabled) {
          b.setInteractive({ useHandCursor:true });
          b.on('pointerdown', () => {
            this._contextMenuClicked = true;
            gs.tradeOffers.push({
              id: Date.now() + Math.floor(Math.random()*1000),
              from: p, to: other,
              give: { gold: giveGold },
              get: { iron: getIron, oil: getOil, wood: getWood, food: getFood },
              status: 'pending', createdTurn: gs.turn,
            });
            this._pushLog(`P${p} offered trade to P${other}`);
            rebuild();
          });
        }
        objs.push(b);
        y += 28;
      };

      mkOfferBtn('Offer A', 50, 5, 0, 0, 0);
      mkOfferBtn('Offer B', 50, 0, 4, 0, 0);
      mkOfferBtn('Offer C', 40, 0, 0, 6, 0);
      mkOfferBtn('Offer D', 40, 0, 0, 0, 8);

      const custom = this.add.text(px - panW/2 + 16, y + 6, '[CUSTOM OFFER…]', {
        font:'bold 10px monospace', fill: capReached ? '#667788' : '#aaddff', backgroundColor: capReached ? '#11161b' : '#112233', padding:{x:8,y:5}
      }).setOrigin(0,0).setScrollFactor(0).setDepth(D+2);
      if (!capReached) custom.setInteractive({ useHandCursor:true });
      custom.on('pointerdown', () => {
        if (capReached) return;
        this._contextMenuClicked = true;
        const g = Number(window.prompt('Gold you give?', '50') || '0');
        const i = Number(window.prompt('Iron you want?', '0') || '0');
        const o = Number(window.prompt('Oil you want?', '0') || '0');
        const wv = Number(window.prompt('Wood you want?', '0') || '0');
        const f = Number(window.prompt('Food you want?', '0') || '0');
        if (!(g > 0)) return;
        if ((my.gold||0) < g) return;
        gs.tradeOffers.push({
          id: Date.now() + Math.floor(Math.random()*1000),
          from: p, to: other,
          give: { gold: Math.max(0, Math.floor(g)) },
          get: { iron: Math.max(0, Math.floor(i)), oil: Math.max(0, Math.floor(o)), wood: Math.max(0, Math.floor(wv)), food: Math.max(0, Math.floor(f)) },
          status: 'pending', createdTurn: gs.turn,
        });
        this._pushLog(`P${p} offered custom trade to P${other}`);
        rebuild();
      });
      objs.push(custom);

      // Keep only recent contract history to avoid unbounded growth
      gs.tradeOffers = gs.tradeOffers.slice(-40);

      this._addToUI(objs);
      this._tradeObjs = objs;
    };

    rebuild();
  }

  // ── Research Panel ─────────────────────────────────────────────────────────
  _toggleResearch() {
    if (this._researchOpen) { this._closeResearch(); }
    else { this._openResearch(); }
  }

  _openResearch() {
    this._closeResearch();
    this._closeSettings();
    this._closeDesigner?.();
    this._closeTrade?.();
    this._closeEconomy?.();
    this._researchOpen = true;
    const gs  = this.gameState;
    const p   = gs.currentPlayer;
    const pl  = gs.players[p];
    if (!pl.research) pl.research = { queue: [], unlocked: [], slots: 1 };
    const res = pl.research;
    const unlockedSet = new Set(res.unlocked || []);
    const w = this.scale.width, h = this.scale.height;
    const panW = Math.min(860, w - 30), panH = h - 60;
    const px = w / 2, py = h / 2;
    const D = 195;
    const objs = [];

    // Panel background
    const bg = this.add.rectangle(px, py, panW, panH, 0x080c14, 0.97)
      .setStrokeStyle(2, 0x553388).setScrollFactor(0).setDepth(D);
    objs.push(bg);
    const hdrStrip = this.add.rectangle(px, py - panH/2 + 20, panW, 40, 0x0e0820, 1)
      .setScrollFactor(0).setDepth(D);
    objs.push(hdrStrip);
    objs.push(this.add.text(px, py - panH/2 + 14, '\u2500\u2500 RESEARCH \u2500\u2500', {
      font: 'bold 14px monospace', fill: '#cc88ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));

    const labs = gs.buildings.filter(b => b.type === 'SCIENCE_LAB' && b.owner === p && !b.underConstruction).length;
    const inc  = calcIncome(gs, p);
    objs.push(this.add.text(px, py - panH/2 + 33, `Labs: ${labs}  |  +${inc.rp} RP/turn  |  Slots: ${res.slots || 1}  |  Queue: ${res.queue.length}`, {
      font: '10px monospace', fill: '#8866aa'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));

    const closeBtn = this.add.text(px + panW/2 - 10, py - panH/2 + 20, '\u2715', {
      font: 'bold 16px monospace', fill: '#888888'
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this._closeResearch());
    closeBtn.on('pointerover', () => closeBtn.setStyle({ fill: '#ffffff' }));
    closeBtn.on('pointerout',  () => closeBtn.setStyle({ fill: '#888888' }));
    objs.push(closeBtn);

    const branches  = Object.entries(RESEARCH_BRANCHES);
    const tabW      = Math.floor((panW - 20) / branches.length);
    const tabY      = py - panH/2 + 52;
    let selBranch   = this._researchSelBranch || branches[0][0];

    const KIND_COLOR = { chassis:0xddaa00, building:0x44bb44, economy:0x44aacc, stat:0x6688cc, research:0xcc66cc };
    const KIND_LABEL = { chassis:'\ud83d\udd13 NEW CHASSIS', building:'\ud83c\udfd7 BUILDING', economy:'\ud83d\udcc8 ECONOMY', stat:'\ud83d\udcca STAT', research:'\u26d7 RESEARCH' };

    const makePanel = (branch) => {
      if (this._researchContentObjs) {
        for (const o of this._researchContentObjs) { try { o.destroy(); } catch(e){} }
      }
      this._researchContentObjs = [];
      this._researchSelBranch = branch;
      const addC = (obj) => { this._researchContentObjs.push(obj); this._addToUI([obj]); };
      const gfx = this.add.graphics().setScrollFactor(0).setDepth(D+1);
      addC(gfx);

      // Branch tabs
      branches.forEach(([key, def], i) => {
        const tx = px - panW/2 + 10 + i * (tabW + 2) + tabW / 2;
        const isSel = key === branch;
        const tb = this.add.rectangle(tx, tabY, tabW, 22, isSel ? 0x331a55 : 0x111122, 1)
          .setStrokeStyle(1, isSel ? 0xcc88ff : 0x333355).setScrollFactor(0).setDepth(D+2).setOrigin(0.5);
        tb.setInteractive({ useHandCursor: true });
        tb.on('pointerdown', () => { this._contextMenuClicked = true; makePanel(key); });
        addC(tb);
        addC(this.add.text(tx, tabY, `${def.icon} ${def.label}`, {
          font: `${isSel ? 'bold ' : ''}10px monospace`, fill: isSel ? '#cc88ff' : '#667788'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(D+3));
      });

      // Tree layout
      const branchTechs = Object.values(TECH_TREE).filter(t => t.branch === branch);
      const byTier = {};
      for (const t of branchTechs) { (byTier[t.tier] = byTier[t.tier] || []).push(t); }
      const tiers   = Object.keys(byTier).map(Number).sort((a,b) => a-b);
      const nodeW   = 196, nodeH = 76, tierGapY = 52, nodeGapX = 12;
      const treeTop = tabY + 28;
      const nodePos = {};

      tiers.forEach((tier, ti) => {
        const row    = byTier[tier];
        const totalW = row.length * (nodeW + nodeGapX) - nodeGapX;
        const rowX0  = px - totalW / 2 + nodeW / 2;
        const rowY   = treeTop + ti * (nodeH + tierGapY) + nodeH / 2;
        row.forEach((tech, ri) => { nodePos[tech.id] = { x: rowX0 + ri*(nodeW+nodeGapX), y: rowY }; });
      });

      // Prereq lines
      gfx.lineStyle(2, 0x553388, 0.55);
      for (const tech of branchTechs) {
        const to = nodePos[tech.id];
        if (!to) continue;
        for (const preId of (tech.prereqs || [])) {
          const from = nodePos[preId];
          if (!from) continue;
          const fx=from.x, fy=from.y+nodeH/2, tx2=to.x, ty2=to.y-nodeH/2;
          gfx.beginPath();
          gfx.moveTo(fx,fy); gfx.lineTo(fx, fy+(ty2-fy)*0.4);
          gfx.lineTo(tx2, fy+(ty2-fy)*0.6); gfx.lineTo(tx2,ty2);
          gfx.strokePath();
          gfx.fillStyle(0x553388,0.55);
          gfx.fillTriangle(tx2,ty2,tx2-4,ty2-7,tx2+4,ty2-7);
        }
      }

      // Nodes
      for (const tech of branchTechs) {
        const pos = nodePos[tech.id];
        if (!pos) continue;
        const { x:nx, y:ny } = pos;
        const nx0=nx-nodeW/2, ny0=ny-nodeH/2;
        const isUnlocked = unlockedSet.has(tech.id);
        const inQueue    = res.queue.some(q => q.techId === tech.id);
        const isActive   = res.queue[0]?.techId === tech.id;
        const prereqOk   = prereqsMet(tech.id, unlockedSet);
        const isChassis  = tech.kind === 'chassis';
        const kindColor  = KIND_COLOR[tech.kind] || 0x6688cc;
        const fillC      = isUnlocked ? 0x142614 : inQueue ? 0x141426 : prereqOk ? 0x12121e : 0x0c0c12;
        const borderC    = isUnlocked ? 0x44cc44 : isActive ? 0xcc88ff : isChassis ? 0xddaa00 : kindColor;

        const nodeBg = this.add.rectangle(nx, ny, nodeW, nodeH, fillC, 0.96)
          .setStrokeStyle(isChassis||isActive ? 2 : 1, borderC).setScrollFactor(0).setDepth(D+2).setOrigin(0.5);
        addC(nodeBg);

        // Kind badge top-right
        const badgeTxt = KIND_LABEL[tech.kind] || '';
        if (badgeTxt) {
          addC(this.add.text(nx+nodeW/2-3, ny0+3, badgeTxt, {
            font:'8px monospace', fill:'#' + kindColor.toString(16).padStart(6,'0')
          }).setOrigin(1,0).setScrollFactor(0).setDepth(D+3));
        }

        const icon    = isUnlocked ? '\u2713' : isActive ? '\u25b6' : inQueue ? '\u25cc' : prereqOk ? '' : '\ud83d\udd12';
        const nameClr = isUnlocked ? '#66dd66' : isChassis ? '#ffdd88' : prereqOk ? '#ccddff' : '#445566';
        addC(this.add.text(nx0+5, ny0+4, `${icon} ${tech.name}`, {
          font:'bold 10px monospace', fill:nameClr, wordWrap:{width:nodeW-40}
        }).setScrollFactor(0).setDepth(D+3));

        addC(this.add.text(nx0+5, ny0+19, tech.desc, {
          font:'9px monospace', fill:'#7788aa', wordWrap:{width:nodeW-10}
        }).setScrollFactor(0).setDepth(D+3));

        addC(this.add.text(nx0+5, ny+nodeH/2-13, `Cost: ${tech.cost} RP`, {
          font:'9px monospace', fill:'#8866aa'
        }).setScrollFactor(0).setDepth(D+3));

        if (inQueue) {
          const item = res.queue.find(q => q.techId === tech.id);
          const pct  = Math.min(1, (item?.rpSpent||0)/tech.cost);
          addC(this.add.rectangle(nx0+5, ny+nodeH/2-5, (nodeW-10)*pct, 5, 0x9944ff, 1).setScrollFactor(0).setDepth(D+3).setOrigin(0,0.5));
          addC(this.add.rectangle(nx0+5, ny+nodeH/2-5, nodeW-10, 5, 0x222233, 0.4).setScrollFactor(0).setDepth(D+2).setOrigin(0,0.5));
          addC(this.add.text(nx+nodeW/2-3, ny+nodeH/2-5, `${Math.round(pct*100)}%`, {
            font:'8px monospace', fill:'#aa88cc'
          }).setOrigin(1,0.5).setScrollFactor(0).setDepth(D+3));
        }

        if (!isUnlocked && !inQueue && prereqOk) {
          const qb = this.add.text(nx+nodeW/2-3, ny0+3, '\u25b6 Queue', {
            font:'bold 9px monospace', fill:'#ffcc44', backgroundColor:'#221a00', padding:{x:3,y:2}
          }).setOrigin(1,0).setScrollFactor(0).setDepth(D+4).setInteractive({useHandCursor:true});
          qb.on('pointerdown', () => { this._contextMenuClicked=true; res.queue.push({techId:tech.id,rpSpent:0}); makePanel(branch); });
          qb.on('pointerover', () => qb.setAlpha(0.8));
          qb.on('pointerout',  () => qb.setAlpha(1.0));
          addC(qb);
        }
        if (inQueue && !isUnlocked) {
          const cb = this.add.text(nx+nodeW/2-3, ny+nodeH/2-15, '\u2715 Cancel', {
            font:'9px monospace', fill:'#ff6644', backgroundColor:'#220000', padding:{x:3,y:2}
          }).setOrigin(1,1).setScrollFactor(0).setDepth(D+4).setInteractive({useHandCursor:true});
          cb.on('pointerdown', () => { this._contextMenuClicked=true; res.queue=res.queue.filter(q=>q.techId!==tech.id); makePanel(branch); });
          cb.on('pointerover', () => cb.setAlpha(0.8));
          cb.on('pointerout',  () => cb.setAlpha(1.0));
          addC(cb);
        }
      }
    };

    this._addToUI(objs);
    this._researchObjs = objs;
    this._researchContentObjs = [];
    makePanel(selBranch);
  }

  _closeResearch() {
    if (this._researchObjs) {
      for (const o of this._researchObjs) { try { o.destroy(); } catch(e){} }
      this._researchObjs = null;
    }
    if (this._researchContentObjs) {
      for (const o of this._researchContentObjs) { try { o.destroy(); } catch(e){} }
      this._researchContentObjs = null;
    }
    this._researchOpen = false;
  }

  update() {
    const cam = this.cameras.main;

    // Smooth zoom toward target with soft speed ramp (trackpad-friendly)
    if (this._zoomTarget !== undefined) {
      const dz = this._zoomTarget - cam.zoom;
      if (Math.abs(dz) > 0.0005) {
        const ramp = 0.14 + Math.min(0.26, Math.abs(dz) * 0.35); // soft acceleration
        const nextZoom = cam.zoom + dz * ramp;
        const px = this._zoomPointer?.x ?? (this.scale.width / 2);
        const py = this._zoomPointer?.y ?? (this.scale.height / 2);
        const before = cam.getWorldPoint(px, py);
        cam.setZoom(Phaser.Math.Clamp(nextZoom, 0.2, 4.0));
        const after = cam.getWorldPoint(px, py);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
      } else {
        this._zoomTarget = cam.zoom;
      }
    }

    const shiftHeld = this._shiftKey?.isDown ?? false;
    const speed = (6 / cam.zoom) * (shiftHeld ? 2.5 : 1);
    const W = this.wasd;
    const keyboardBlocked = !!this._nameModalOpen;
    if (!keyboardBlocked && (W.W.isDown || W.UP.isDown))    cam.scrollY -= speed;
    if (!keyboardBlocked && (W.S.isDown || W.DOWN.isDown))  cam.scrollY += speed;
    if (!keyboardBlocked && (W.A.isDown || W.LEFT.isDown))  cam.scrollX -= speed;
    if (!keyboardBlocked && (W.D.isDown || W.RIGHT.isDown)) cam.scrollX += speed;
    const moving = !keyboardBlocked && (W.W.isDown || W.S.isDown || W.A.isDown || W.D.isDown ||
                   W.UP.isDown || W.DOWN.isDown || W.LEFT.isDown || W.RIGHT.isDown);
    if (moving && this._contextMenuObjs) this._hideContextMenu();

    // Drive slide animation: redraw units every frame while slide is in progress
    if (this._slideState) {
      const { startTime, duration } = this._slideState;
      this._redrawUnits();
      if (performance.now() - startTime >= duration) {
        this._slideState = null;
        this._redrawUnits(); // final draw at destination
      }
    }
  }

  // ── Click handling ────────────────────────────────────────────────────────
  _onHexClick(q, r) {
    const gs = this.gameState;
    let clickedUnit     = unitAt(gs, q, r);
    let clickedBuilding = buildingAt(gs, q, r);
    const enemyAtDisplayHex = gs.units.find(u => {
      if (u.dead || Number(u.owner) === Number(gs.currentPlayer)) return false;
      const dq = (u._origQ !== undefined) ? u._origQ : u.q;
      const dr = (u._origR !== undefined) ? u._origR : u.r;
      return dq === q && dr === r;
    });

    // Fog safety: do not allow interaction with unseen enemy units/buildings
    const fog = this._currentFog;
    const isVisibleHex = !fog || fog.has(`${q},${r}`);
    const curPClick = Number(gs.currentPlayer);
    if (!isVisibleHex) {
      if (clickedUnit && Number(clickedUnit.owner) !== curPClick) clickedUnit = null;
      if (clickedBuilding && Number(clickedBuilding.owner) !== curPClick) clickedBuilding = null;
    }

    // Hard attack shortcut: if selected unit clicks any highlighted attack hex, always open preview.
    if (this.selectedUnit && Number(this.selectedUnit.owner) === curPClick && !this.selectedUnit.attacked && !this.selectedUnit.suppressed) {
      const attackTarget = (this.attackable || []).find(h => h.q === q && h.r === r);
      if (attackTarget) {
        const targetUnit = gs.units.find(u => u.id === attackTarget.targetId && !u.dead)
          || gs.units.find(u => !u.dead && Number(u.owner) !== curPClick && u.q === attackTarget.q && u.r === attackTarget.r);
        if (targetUnit) {
          this._showCombatPreview(this.selectedUnit, targetUnit, false);
          return;
        }
        this._pushLog('Attack target stale/missing on clicked attack hex');
        this._refresh();
        return;
      }

      // Fallback enemy click check (range/LOS rule) using display-hex enemy lookup.
      const enemyClick = enemyAtDisplayHex || (clickedUnit && Number(clickedUnit.owner) !== curPClick ? clickedUnit : null);
      if (enemyClick) {
        const effRange = this.selectedUnit.range ?? UNIT_TYPES[this.selectedUnit.type]?.range ?? 1;
        const d = hexDistance(this.selectedUnit.q, this.selectedUnit.r, enemyClick.q, enemyClick.r);
        const indirect = (this.selectedUnit.type === 'ARTILLERY' || this.selectedUnit.type === 'MORTAR');
        const losOk = indirect || hasLOS(this.selectedUnit.q, this.selectedUnit.r, enemyClick.q, enemyClick.r, this.terrain, this.mapSize);
        if (d >= 1 && d <= effRange && losOk) {
          this._showCombatPreview(this.selectedUnit, enemyClick, false);
          return;
        }
        this._pushLog(`Attack rejected: ${d > effRange ? 'out of range' : (losOk ? 'invalid state' : 'no LOS')}`);
        this._refresh();
        return;
      }
    }

    // Left-click cycle support on crowded hexes (units/building).
    // Repeated clicks on same tile rotate selection target.
    if (this.mode === 'select') {
      const unitsHere = gs.units.filter(u => !u.dead && u.q === q && u.r === r)
        .filter(u => isVisibleHex || Number(u.owner) === curPClick);
      const bHere = gs.buildings.filter(b => b.q === q && b.r === r && !ROAD_TYPES.has(b.type))
        .filter(b => isVisibleHex || Number(b.owner) === curPClick);
      const cycleTargets = [
        ...unitsHere.map(u => ({ kind: 'unit', id: u.id })),
        ...bHere.map(b => ({ kind: 'building', id: b.id })),
      ];
      if (cycleTargets.length > 1) {
        const sameHex = this._cycleHex && this._cycleHex.q === q && this._cycleHex.r === r;
        const nextIdx = sameHex ? ((this._cycleIdx || 0) + 1) % cycleTargets.length : 0;
        this._cycleHex = { q, r };
        this._cycleIdx = nextIdx;
        const pick = cycleTargets[nextIdx];
        if (pick.kind === 'unit') {
          clickedUnit = gs.units.find(u => u.id === pick.id) || clickedUnit;
          clickedBuilding = null;
          // Bring selected stack item to top draw order for clarity.
          const idx = gs.units.findIndex(u => u.id === pick.id);
          if (idx >= 0) gs.units.push(gs.units.splice(idx, 1)[0]);
        } else {
          clickedBuilding = gs.buildings.find(b => b.id === pick.id) || clickedBuilding;
          clickedUnit = null;
        }
      } else {
        this._cycleHex = { q, r };
        this._cycleIdx = 0;
      }
    }

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
        const path = findPath(this.terrain, this.mapSize, unit.q, unit.r, q, r, unit.type, this.gameState);
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
        const path = findPath(this.terrain, this.mapSize, unit.q, unit.r, q, r, 'ENGINEER', this.gameState);
        if (path && path.length > 0) {
          unit.roadOrder = { destQ: q, destR: r, path };
          // Lock engineer for this turn — order counts as their action
          unit.moved = true; unit.movesLeft = 0; unit.building = true;
          // Immediately place a road on the engineer's current tile (starting hex)
          const gs = this.gameState;
          const owner = unit.owner;
          const roadCost = BUILDING_TYPES['ROAD'].buildCost;
          const hasRoadAlready = gs.buildings.some(b => ROAD_TYPES.has(b.type) && b.q === unit.q && b.r === unit.r);
          const canAfford = gs.players[owner].wood >= (roadCost.wood || 1);
          if (!hasRoadAlready && canAfford) {
            gs.players[owner].wood -= (roadCost.wood || 1);
            gs.buildings.push({ id: Date.now(), type: 'ROAD', q: unit.q, r: unit.r, owner });
          }
          this._clearSelection();
        } else {
          // Show brief "no path" feedback — just log; could add toast later
          console.log(`Auto-road: no path from (${unit.q},${unit.r}) to (${q},${r})`);
        }
      }
      this._cancelRoadDestMode();
      return;
    }

    if (this.mode === 'sprint') {
      const isReachable = this.reachable.some(h => h.q === q && h.r === r);
      const _isMovingAir0 = AIR_UNITS.has(this.selectedUnit?.type);
      const hexFree = !clickedUnit || clickedUnit.id === this.selectedUnit?.id ||
        (_isMovingAir0 && clickedUnit.owner === this.selectedUnit.owner && !AIR_UNITS.has(clickedUnit.type));
      if (isReachable && hexFree) {
        this.selectedUnit.q = q; this.selectedUnit.r = r;
        delete this.selectedUnit.moveOrder; // manual movement overrides standing order
        this.selectedUnit.dugIn = false;
        this.selectedUnit.sprinted = true;
        this.selectedUnit.attacked = true; // sprint negates attack
        this.selectedUnit.movesLeft = 0;
        this.reachable = []; this.attackable = [];
        this.mode = 'select';
        this._refresh();
      } else {
        this.mode = 'select'; this.reachable = []; this._refresh();
      }
      return;
    }

    if (this.mode === 'move') {
      const isReachable = this.reachable.some(h => h.q === q && h.r === r);
      // Allow move if hex is reachable and has no unit (or only the unit itself)
      // Air units can share a hex with friendly ground units
      // Engineers can share a hex with any friendly unit (road building through occupied tiles)
      const _isMovingAir = AIR_UNITS.has(this.selectedUnit?.type);
      const _isMovingEngineer = this.selectedUnit?.type === 'ENGINEER';
      const hexFree = !clickedUnit || clickedUnit.id === this.selectedUnit?.id ||
        (_isMovingAir && clickedUnit.owner === this.selectedUnit.owner && !AIR_UNITS.has(clickedUnit.type)) ||
        (_isMovingEngineer && clickedUnit.owner === this.selectedUnit.owner);
      if (isReachable && hexFree) {
        // If engineer is currently constructing, moving off tile must confirm cancel first.
        if (this.selectedUnit.constructing) {
          const b = gs.buildings.find(x => x.id === this.selectedUnit.constructing);
          const bName = b ? (BUILDING_TYPES[b.type]?.name || b.type) : 'construction';
          const ok = window.confirm(`Cancel current build (${bName}) and move engineer?\nNo refund.`);
          if (!ok) {
            this.mode = 'select';
            this.reachable = [];
            this.attackable = [];
            this._refresh();
            return;
          }
          // Cancel in-progress build (no refund)
          if (b) gs.buildings = gs.buildings.filter(x => x.id !== b.id);
          delete this.selectedUnit.constructing;
          this._pushLog(`P${gs.currentPlayer} canceled build to move engineer.`);
        }

        // IGOUGO: movement is immediate.
        // Save _origQ/_origR on FIRST move only (undo returns to turn-start position).
        if (this.selectedUnit._origQ === undefined) {
          this.selectedUnit._origQ = this.selectedUnit.q;
          this.selectedUnit._origR = this.selectedUnit.r;
        }
        // Capture start world position for slide animation
        const _slideFrom = hexToWorld(this.selectedUnit.q, this.selectedUnit.r);
        // Snapshot pre-move fog to detect if move reveals new hexes (prevent scouting exploit)
        const _preFog = this._currentFog ? new Set(this._currentFog) : null;
        // Deduct movement cost and update partial-move budget
        const _movedHex = this.reachable.find(h => h.q === q && h.r === r);
        const _moveCost  = _movedHex?.cost ?? UNIT_TYPES[this.selectedUnit.type].move;
        const _maxMove   = UNIT_TYPES[this.selectedUnit.type].move;
        this.selectedUnit.movesLeft = Math.max(0,
          (this.selectedUnit.movesLeft ?? _maxMove) - _moveCost);
        // Do NOT add to pendingMoves — position is real immediately
        this.selectedUnit.q = q; this.selectedUnit.r = r;
        delete this.selectedUnit.moveOrder; // manual movement overrides standing order
        this.selectedUnit.dugIn = false;
        this.selectedUnit.moved = (this.selectedUnit.movesLeft <= 0);
        // Check if move revealed new fog hexes — if so, undo is blocked
        if (_preFog) {
          const postFog = computeFog(gs, gs.currentPlayer, this.mapSize, this.terrain);
          const revealedNew = [...postFog].some(k => !_preFog.has(k));
          this.selectedUnit._scoutedMove = revealedNew;
        }
        // After move: if movement budget remains, keep reachable highlighted from new position.
        // Otherwise clear reachable (unit is done moving).
        if (this.selectedUnit.movesLeft > 0) {
          this.reachable = getReachableHexes(gs, this.selectedUnit, this.terrain, this.mapSize);
        } else {
          this.reachable = [];
        }
        this.attackable = getAttackableHexes(gs, this.selectedUnit, q, r, this._currentFog);
        this.mode = 'select';
        // Slide animation: no separate Game Objects — driven purely by update() loop.
        // _slideState stores the unit + from/to world coords + timing.
        // _redrawUnits() reads _slideState to draw the unit at an interpolated position
        // every frame until the animation completes. No camera/transform ambiguity possible.
        const _slideTo = hexToWorld(q, r);
        // Kill any previous slide
        this._slideState = null;
        this._refresh(); // draws scene; _redrawUnits will use normal positions (no slide yet)
        // Start new slide state — update() drives _redrawUnits() every frame
        this._slideState = {
          unit:      this.selectedUnit,
          fromX:     _slideFrom.x,
          fromY:     _slideFrom.y,
          toX:       _slideTo.x,
          toY:       _slideTo.y,
          startTime: performance.now(),
          duration:  180,
        };
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
        const tUnit = gs.units.find(u => u.id === target.targetId) ||
          gs.units.find(u => !u.dead && Number(u.owner) !== Number(gs.currentPlayer) && u.q === target.q && u.r === target.r);
        if (tUnit) {
          // Emergency stability hotfix: execute direct attack immediately on valid click
          // to avoid preview-path desync blocking combat.
          this._showCombatPreview(this.selectedUnit, tUnit, false);
          return;
        }
      }

      // Strong fallback: clicked enemy gets direct validity check from live state.
      if (this.selectedUnit && clickedUnit && Number(clickedUnit.owner) !== Number(gs.currentPlayer)) {
        const aDef = UNIT_TYPES[this.selectedUnit.type] || {};
        const dist = hexDistance(this.selectedUnit.q, this.selectedUnit.r, clickedUnit.q, clickedUnit.r);
        const inRange = dist >= 1 && dist <= (aDef.range || 0);
        const indirect = (this.selectedUnit.type === 'ARTILLERY' || this.selectedUnit.type === 'MORTAR');
        const losOk = indirect || hasLOS(this.selectedUnit.q, this.selectedUnit.r, clickedUnit.q, clickedUnit.r, this.terrain, this.mapSize);
        if (inRange && losOk) {
          this._showCombatPreview(this.selectedUnit, clickedUnit, false);
          return;
        }
      }
    }

    if (this.mode === 'attack') {
      const inRange = this.attackable.find(h => h.q === q && h.r === r);
      const enemyOnHex = gs.units.find(u => !u.dead && Number(u.owner) !== Number(gs.currentPlayer) && u.q === q && u.r === r);
      if (inRange && enemyOnHex) {
        this._showCombatPreview(this.selectedUnit, enemyOnHex, true);
        return;
      }

      // Hard fallback: if attackable cache desynced, still allow enemy click by geometric range.
      if (enemyOnHex && this.selectedUnit) {
        const effRange = this.selectedUnit.range ?? UNIT_TYPES[this.selectedUnit.type]?.range ?? 1;
        const d = hexDistance(this.selectedUnit.q, this.selectedUnit.r, q, r);
        if (d >= 1 && d <= effRange) {
          this._pushLog(`Indirect fallback: geometric-range fire on (${q},${r})`);
          this._showCombatPreview(this.selectedUnit, enemyOnHex, true);
          return;
        }
      }

      if (inRange && !enemyOnHex) {
        // Do NOT consume attack on empty tile; keep mode active and explain why.
        this._pushLog(`Indirect fire: no enemy unit on (${q},${r})`);
      } else {
        this._pushLog(`Indirect fire: tile (${q},${r}) out of range`);
      }
      this._refresh();
      return;
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
    if (clickedUnit && Number(clickedUnit.owner) === Number(gs.currentPlayer)) {
      this._selectUnit(clickedUnit);
      return;
    }

    // Factory control: click own factory to open ON/OFF control panel
    if (clickedBuilding && Number(clickedBuilding.owner) === Number(gs.currentPlayer) && clickedBuilding.type === 'FACTORY') {
      this._showFactoryPanel(clickedBuilding);
      return;
    }

    // Recruitment: click own building (no unit present)
    if (clickedBuilding && Number(clickedBuilding.owner) === Number(gs.currentPlayer) &&
        clickedBuilding.type !== 'ROAD' && BUILDING_TYPES[clickedBuilding.type].canRecruit.length > 0) {
      this._showRecruitPanel(clickedBuilding);
      return;
    }

    this._clearSelection();
  }

  _selectNextReadyUnit() {
    const gs = this.gameState;
    const curP = Number(gs.currentPlayer);
    const ready = gs.units.filter(u => !u.dead && !u.embarked && Number(u.owner) === curP && !u.moved);
    if (ready.length === 0) {
      this._pushLog(`P${curP}: no unmoved units left`);
      this._refresh();
      return;
    }

    let idx = 0;
    if (this.selectedUnit) {
      const curIdx = ready.findIndex(u => u.id === this.selectedUnit.id);
      if (curIdx >= 0) idx = (curIdx + 1) % ready.length;
    }

    const pick = ready[idx];
    this._selectUnit(pick);
    const { x, y } = hexToWorld(pick.q, pick.r);
    this.cameras.main.pan(x, y, 180, 'Sine.easeOut', true);
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
    const _defA = UNIT_TYPES[unit.type] || {};
    const canOffensivelyAttack = ((_defA.attack || 0) > 0) || ((_defA.soft_attack || 0) > 0) || ((_defA.hard_attack || 0) > 0) || ((_defA.naval_attack || 0) > 0);
    if (!unit.attacked && !unit.suppressed && canOffensivelyAttack) {
      const attackFog = AIR_UNITS.has(unit.type) ? null : this._currentFog;
      this.attackable = getAttackableHexes(gs, unit, unit.q, unit.r, attackFog);
    } else {
      this.attackable = [];
    }
    this._refresh();
  }

  _showMoveOrderQuickMenu(q, r) {
    const unit = this.selectedUnit;
    if (!unit) return;
    const ax = this._menuAnchor?.x ?? (this.scale.width * 0.5);
    const ay = this._menuAnchor?.y ?? (this.scale.height * 0.5);

    this._hideContextMenu();
    const objs = [];
    const bg = this.add.rectangle(ax, ay, 250, 72, 0x0b0f16, 0.98).setScrollFactor(0).setDepth(210).setStrokeStyle(1.5, 0x2e3d50);
    const title = this.add.text(ax, ay - 20, `Hex (${q},${r})`, { font: 'bold 12px monospace', fill: '#8ea5bc' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(211);
    const btn = this.add.text(ax, ay + 4, '📍 SET MOVE ORDER HERE', {
      font: 'bold 12px monospace', fill: '#d8eefc', backgroundColor: '#224466', padding: { x: 8, y: 5 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(211).setInteractive({ useHandCursor: true });

    const close = () => {
      if (this._contextMenuObjs) this._contextMenuObjs.forEach(o => { try { o.destroy(); } catch(e){} });
      this._contextMenuObjs = null;
    };

    btn.on('pointerdown', () => {
      this._contextMenuClicked = true;
      const path = findPath(this.terrain, this.mapSize, unit.q, unit.r, q, r, unit.type, this.gameState);
      if (path && path.length > 0) {
        unit.moveOrder = { destQ: q, destR: r, path };
        this._pushLog(`P${unit.owner} sets move order to (${q},${r})`);
      } else {
        this._pushLog(`Move order failed — no path to (${q},${r})`);
      }
      close();
      this._refresh();
    });

    objs.push(bg, title, btn);
    this._contextMenuObjs = objs;
    this._addToUI(objs);
  }

  // Right-click: own unit => unit menu. Else deselect/cancel by default.
  // Shift+RMB on a tile with a selected friendly unit => quick move-order menu.
  _onHexRightClick(q, r, shiftRmb = false) {
    // Cancel special modes on right-click
    if (this.mode === 'road_dest') { this._cancelRoadDestMode(); return; }
    if (this.mode === 'move_order') { this._cancelMoveOrderMode(); return; }
    if (this.mode === 'transport_load' || this.mode === 'transport_unload') { this._cancelTransportMode(); return; }

    const gs = this.gameState;
    const clickedUnit = gs.units.find(u => u.q === q && u.r === r && !u.dead);
    const enemyAtDisplayHex = gs.units.find(u => {
      if (u.dead || Number(u.owner) === Number(gs.currentPlayer)) return false;
      const dq = (u._origQ !== undefined) ? u._origQ : u.q;
      const dr = (u._origR !== undefined) ? u._origR : u.r;
      return dq === q && dr === r;
    });

    // Right-click anywhere should first close transient menus/panels.
    this._hideContextMenu();
    this._hideRecruitPanel?.();
    this._closeFactoryPanel?.();

    // Hard path: right-click highlighted attack hex / enemy with selected attacker => preview.
    if (this.selectedUnit && !this.selectedUnit.attacked && !this.selectedUnit.suppressed) {
      const curP = Number(gs.currentPlayer);
      const attackTarget = (this.attackable || []).find(h => h.q === q && h.r === r);
      if (attackTarget) {
        const targetUnit = gs.units.find(u => u.id === attackTarget.targetId && !u.dead)
          || gs.units.find(u => !u.dead && Number(u.owner) !== curP && u.q === attackTarget.q && u.r === attackTarget.r);
        if (targetUnit) {
          this._showCombatPreview(this.selectedUnit, targetUnit, false);
          return;
        }
      }
      const enemyClick = enemyAtDisplayHex || (clickedUnit && Number(clickedUnit.owner) !== curP ? clickedUnit : null);
      if (enemyClick) {
        const effRange = this.selectedUnit.range ?? UNIT_TYPES[this.selectedUnit.type]?.range ?? 1;
        const d = hexDistance(this.selectedUnit.q, this.selectedUnit.r, enemyClick.q, enemyClick.r);
        const indirect = (this.selectedUnit.type === 'ARTILLERY' || this.selectedUnit.type === 'MORTAR');
        const losOk = indirect || hasLOS(this.selectedUnit.q, this.selectedUnit.r, enemyClick.q, enemyClick.r, this.terrain, this.mapSize);
        if (d >= 1 && d <= effRange && losOk) {
          this._showCombatPreview(this.selectedUnit, enemyClick, false);
          return;
        }
        this._pushLog(`Attack rejected (RMB): ${d > effRange ? 'out of range' : (losOk ? 'invalid state' : 'no LOS')}`);
        this._refresh();
        return;
      }
    }

    if (clickedUnit && clickedUnit.owner === gs.currentPlayer) {
      if (this.selectedUnit !== clickedUnit) this._selectUnit(clickedUnit);
      this._showContextMenu(clickedUnit);
      return;
    }

    // Power-user shortcut only: Shift+RMB opens move-order quick menu.
    if (shiftRmb && this.selectedUnit && Number(this.selectedUnit.owner) === Number(gs.currentPlayer)) {
      this._showMoveOrderQuickMenu(q, r);
      return;
    }

    // Default muscle memory behavior: deselect/cancel.
    this._clearSelection();
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

  _onSprintMode(unit) {
    const movedThisTurn = unit && unit._origQ !== undefined && (unit.q !== unit._origQ || unit.r !== unit._origR);
    if (!unit || !movedThisTurn || unit.sprinted || unit.attacked) return;
    this.selectedUnit = unit;
    this.mode = 'sprint';
    const def = UNIT_TYPES[unit.type];
    // Sprint uses a fresh fixed movement budget (do not inherit current movesLeft)
    const sprintUnit = Object.assign({}, unit, { move: def.sprintMove, movesLeft: def.sprintMove, moved: false });
    this.reachable  = getReachableHexes(this.gameState, sprintUnit, this.terrain, this.mapSize);
    this.attackable = [];
    this._hideContextMenu();
    this._refresh();
  }

  // Direct attack — only visible enemies, no blind fire penalty
  _onDirectAttackMode() {
    if (!this.selectedUnit || this.selectedUnit.attacked) return;
    this.mode = 'attack_direct';
    this.reachable  = [];
    const attackFog = AIR_UNITS.has(this.selectedUnit.type) ? null : this._currentFog;
    this.attackable = getAttackableHexes(this.gameState, this.selectedUnit, this.selectedUnit.q, this.selectedUnit.r, attackFog);
    this._refresh();
  }

  // Blind fire — full tile range, applies accuracy debuff on resolution
  _onAttackMode() {
    if (!this.selectedUnit || this.selectedUnit.attacked) return;
    this.mode = 'attack';
    this.reachable  = [];
    this.attackable = getAttackRangeHexes(this.mapSize, this.selectedUnit, this.selectedUnit.q, this.selectedUnit.r, this.terrain);
    this._pushLog(`Indirect mode: ${this.selectedUnit.type} range=${this.selectedUnit.range ?? UNIT_TYPES[this.selectedUnit.type]?.range} targets=${this.attackable.length}`);
    this._refresh();
  }

  _onUndoMove() {
    const u = this.selectedUnit, gs = this.gameState;
    if (!u || !u.moved || u.attacked || u._origQ === undefined) return;
    // Block undo if this move revealed new fog hexes (anti-scouting exploit)
    if (u._scoutedMove) {
      this._log.unshift('⚠ Undo blocked — move revealed new territory');
      this._log = this._log.slice(0, 8);
      this._refresh();
      return;
    }
    // Restore original position
    u.q = u._origQ; u.r = u._origR;
    u.moved = false;
    u.building = false;
    delete u._origQ; delete u._origR; delete u._scoutedMove;
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

  _onBuildRoad(roadType = 'ROAD') {
    const gs = this.gameState;
    const u  = this.selectedUnit;
    const p  = gs.currentPlayer;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (roadAt(gs, u.q, u.r)) return;
    const cost = BUILDING_TYPES[roadType]?.buildCost || { iron:0, oil:0, wood:1 };
    const pl = gs.players[p];
    if ((pl.wood || 0) < (cost.wood || 0)) return;
    if ((pl.iron || 0) < (cost.iron || 0)) return;
    if ((pl.oil  || 0) < (cost.oil  || 0)) return;
    pl.wood = (pl.wood || 0) - (cost.wood || 0);
    pl.iron = (pl.iron || 0) - (cost.iron || 0);
    pl.oil  = (pl.oil  || 0) - (cost.oil  || 0);
    gs.buildings.push(createBuilding(roadType, p, u.q, u.r));
    u.moved = true; u.building = true;
    this._redrawRoads();
    this._clearSelection();
  }

  _onUpgradeRoad(unit, newType) {
    const gs = this.gameState;
    const p  = gs.currentPlayer;
    if (!unit || !UNIT_TYPES[unit.type].canBuild) return;
    const existing = roadAt(gs, unit.q, unit.r);
    if (!existing) return;
    const cost = BUILDING_TYPES[newType]?.buildCost || {};
    const pl = gs.players[p];
    if ((pl.wood || 0) < (cost.wood || 0)) return;
    if ((pl.iron || 0) < (cost.iron || 0)) return;
    if ((pl.oil  || 0) < (cost.oil  || 0)) return;
    pl.wood = (pl.wood || 0) - (cost.wood || 0);
    pl.iron = (pl.iron || 0) - (cost.iron || 0);
    pl.oil  = (pl.oil  || 0) - (cost.oil  || 0);
    // Replace old road with upgraded type
    const idx = gs.buildings.indexOf(existing);
    if (idx >= 0) gs.buildings.splice(idx, 1, createBuilding(newType, existing.owner, existing.q, existing.r));
    unit.moved = true; unit.building = true;
    this._hideContextMenu();
    this._redrawRoads();
    this._clearSelection();
  }

  _onBuildLumberCamp() {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (buildingAt(gs, u.q, u.r)) return;
    const ttype = this.terrain[`${u.q},${u.r}`] ?? 0;
    if (ttype !== 1 && ttype !== 7) return;
    if (gs.players[gs.currentPlayer].iron < 2) return;
    gs.players[gs.currentPlayer].iron -= 2;
    this._placeBuilding('LUMBER_CAMP', u);
  }

  // Central building placement — handles multi-turn construction
  _placeBuilding(type, engineer) {
    const gs = this.gameState;
    const def = BUILDING_TYPES[type];
    const turns = def.buildTurns || 0;
    const b = createBuilding(type, gs.currentPlayer, engineer.q, engineer.r);
    if (turns > 0) {
      b.underConstruction = true;
      b.buildProgress = 0;
      b.buildTurnsRequired = turns;
      engineer.constructing = b.id;
    }
    gs.buildings.push(b);
    engineer.moved = true; engineer.building = true;
    this._clearSelection();
    this._refresh();
  }

  _onBuildStructure(type, ironCost, oilCost = 0, woodCost = 0, compCost = 0) {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (buildingAt(gs, u.q, u.r)) return;
    const NAVAL_FACILITIES = new Set(['NAVAL_YARD','HARBOR','DRY_DOCK','NAVAL_BASE','NAVAL_DOCKYARD']);
    if (NAVAL_FACILITIES.has(type) && !this._isCoastalHex(u.q, u.r)) {
      this._log.unshift('Build failed: naval facilities require a coastal hex');
      this._log = this._log.slice(0, 8);
      this._refresh();
      return;
    }
    if (gs.players[gs.currentPlayer].iron < ironCost) return;
    if (gs.players[gs.currentPlayer].oil  < oilCost)  return;
    if ((gs.players[gs.currentPlayer].wood || 0) < woodCost) return;
    if ((gs.players[gs.currentPlayer].components || 0) < compCost) return;
    gs.players[gs.currentPlayer].iron -= ironCost;
    gs.players[gs.currentPlayer].oil  -= oilCost;
    gs.players[gs.currentPlayer].wood  = (gs.players[gs.currentPlayer].wood || 0) - woodCost;
    gs.players[gs.currentPlayer].components = (gs.players[gs.currentPlayer].components || 0) - compCost;
    this._placeBuilding(type, u);
  }

  _onBuildCoastalBattery() {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    const p = gs.currentPlayer;
    const ttype = this.terrain[`${u.q},${u.r}`] ?? 0;
    const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
    const coastal = (ttype <= 3 || ttype === 6 || ttype === 7) && neighbors.some(([dq,dr]) => {
      const t = this.terrain[`${u.q + dq},${u.r + dr}`];
      return t === 4 || t === 5;
    });
    if (!coastal) { this._pushLog('Build failed: Coastal Battery must be on a coastal hex'); this._refresh(); return; }
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

  _onBuildAAEmplacement() {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    const p = gs.currentPlayer;
    if (gs.players[p].iron < 4 || gs.players[p].oil < 1) return;
    gs.players[p].iron -= 4; gs.players[p].oil -= 1;
    const def = UNIT_TYPES['AA_EMPLACEMENT'];
    if (!gs._nextUnitId) gs._nextUnitId = Math.max(...gs.units.map(u2 => u2.id), ...gs.buildings.map(b => b.id), 0) + 1;
    const aa = {
      id: gs._nextUnitId++,
      type: 'AA_EMPLACEMENT', owner: p,
      q: u.q, r: u.r,
      health: def.health, maxHealth: def.health,
      moved: true, attacked: false, dugIn: false, building: false, immobile: true,
    };
    gs.units.push(aa);
    u.moved = true; u.building = true;
    this._hideContextMenu();
    this._refresh();
  }

  _onBuildMine(resType) {
    const gs  = this.gameState;
    const u   = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    const res = gs.resourceHexes[`${u.q},${u.r}`];
    const existing = buildingAt(gs, u.q, u.r);
    const blockedByNonRoad = !!(existing && !ROAD_TYPES.has(existing.type));
    if (!res || blockedByNonRoad) return;
    if (gs.players[gs.currentPlayer].iron < 4) return;
    const btype = (resType || res.type) === 'OIL' ? 'OIL_PUMP' : 'MINE';
    if (btype === 'OIL_PUMP' && gs.players[gs.currentPlayer].oil < 0) return; // safety
    gs.players[gs.currentPlayer].iron -= 4;
    this._placeBuilding(btype, u);
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
    const tOnLand  = tTerrain <= 3 || tTerrain === 6 || tTerrain === 7;
    const navalVsNaval = atkIsNaval && defIsNaval;
    const navalVsLand  = atkIsNaval && tOnLand && !defIsNaval;
    const isArmored = tDef.armor > 2;
    let baseAtk = navalVsNaval ? aDef.hard_attack : (isArmored ? aDef.hard_attack : aDef.soft_attack);
    if (navalVsLand) baseAtk = Math.floor((aDef.naval_attack||1)*0.6);
    const fighterStrafePenalty = AIR_UNITS.has(attacker.type) && !AIR_UNITS.has(target.type) && aDef.antiAir;
    if (fighterStrafePenalty) baseAtk = Math.max(1, Math.floor(baseAtk * 0.5));
    const atkSupPen = attacker.outOfSupply > 0 ? supplyPenalty(attacker.outOfSupply).attackPenalty : 0;
    const defSupPen = target.outOfSupply > 0 ? supplyPenalty(target.outOfSupply).attackPenalty : 0;
    if (atkSupPen > 0) baseAtk = Math.max(1, baseAtk - atkSupPen);
    const pierceRatio = aDef.pierce < tDef.armor ? aDef.pierce/tDef.armor : 1;
    const pierceMod = Math.round((pierceRatio-0.5)*20);
    const dist = hexDistance(attacker.q, attacker.r, target.q, target.r);
    const infRangePenalty = (attacker.type === 'INFANTRY' && dist >= 2) ? 8 : 0;
    if (infRangePenalty > 0) baseAtk = Math.max(1, baseAtk - 1);

    // Score breakdown (no random roll)
    const terrainMod = tTerrain===1?10:tTerrain===2?20:(tTerrain===7?5:0);
    const infLike = new Set(['INFANTRY','ASSAULT_INFANTRY','SMG_SQUAD','LMG_TEAM','HMG_TEAM','SNIPER','ENGINEER','MEDIC','ANTI_TANK']);
    const onFort = !!gs.buildings?.find(b => (b.type==='BUNKER'||b.type==='TRENCH'||b.type==='SANDBAG') && b.q===target.q && b.r===target.r && b.owner===target.owner);
    const openPlainMod = ((tTerrain===0 || tTerrain===6) && infLike.has(target.type) && !target.dugIn && !onFort) ? 6 : 0;
    const dugInMod   = target.dugIn?8:0;
    const onBunker   = gs.buildings?.find(b=>b.type==='BUNKER'&&b.q===target.q&&b.r===target.r&&b.owner===target.owner);
    const bunkerMod  = onBunker?15:0;
    const blindMod   = blindFire?20:0;
    const aaBonus    = (aDef.antiAir && AIR_UNITS.has(target.type)) ? 10 : 0;
    const baseScore  = 50;
    const preRollScore = Math.max(0, Math.min(100,
      baseScore + (aDef.accuracy||0) + aaBonus - Math.max(0, (tDef.evasion||0) - (defSupPen*2))
      - terrainMod - dugInMod - bunkerMod - blindMod + pierceMod
      + openPlainMod - infRangePenalty - (atkSupPen * 3) + (defSupPen * 3)));
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
    const effDef = Math.max(0, (tDef.defense||0) - defSupPen);
    const expDmg = dmgAt(preRollScore, baseAtk, pierceRatio, effDef);
    const maxDmg = dmgAt(scoreMax,     baseAtk, pierceRatio, effDef);

    // Retaliation
    const retDist = hexDistance(attacker.q,attacker.r,target.q,target.r);
    const subDiveBlock = tDef.noSurfaceRetaliation && !aDef.noSurfaceRetaliation;
    const retHasLOS = retDist <= 1 || !this.terrain || hasLOS(target.q, target.r, attacker.q, attacker.r, this.terrain, this.mapSize);
    const canRet = !blindFire && !INDIRECT.has(attacker.type) && !subDiveBlock && retDist<=(tDef.range||1) && retHasLOS && !target.suppressed;
    const noRetReason = blindFire ? 'blind fire' :
      (INDIRECT.has(attacker.type) ? 'indirect fire attacker' :
      (subDiveBlock ? 'defender dived' :
      (retDist > (tDef.range||1) ? 'defender out of range' :
      (!retHasLOS ? 'no line of sight' :
      (target.suppressed ? 'defender suppressed' : 'no valid retaliation')))));
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
    const GLYPH={INFANTRY:'●',ENGINEER:'◆',RECON:'✶',TANK:'■',ARTILLERY:'▲',ANTI_TANK:'➤',MORTAR:'△',MEDIC:'✚',PATROL_BOAT:'◖',SUBMARINE:'▭',DESTROYER:'◉',CRUISER_LT:'⬒',CRUISER_HV:'⬓',BATTLESHIP:'⬔',LANDING_CRAFT:'⟂',TRANSPORT_SM:'◫',TRANSPORT_MD:'◫',TRANSPORT_LG:'◫',COASTAL_BATTERY:'▣',AA_EMPLACEMENT:'⊕'};
    const PC=[null,0x3366cc,0xcc3333];
    const sw=this.scale.width,sh=this.scale.height,cx=sw*0.5,cy=sh*0.5,D=210;
    const objs=[];

    const UI_SCALE = 1.45; // readable without overlap
    const mk=(txt,x,y,col='#d0dde8',sz=12,bold=false,ox=0.5,oy=0.5)=>{
      const t=this.add.text(x,y,txt,{font:`${bold?'bold ':''}${Math.max(10, Math.round(sz*UI_SCALE))}px monospace`,fill:col}).setOrigin(ox,oy).setScrollFactor(0).setDepth(D+1);
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

    const cW=Math.min(980,sw-80), cH=Math.min(620,sh-120);
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

    // Center quick-comparison
    mk('VS',cx,pY-30,'#2a3a4a',14,true);
    mk(`${baseAtk}`,cx,pY-8,'#e8d090',20,true);
    mk('ATTACK POWER',cx,pY+14,'#556677',9);

    // Under-card per-unit stats (explicit)
    const atkStats = `ATK ${baseAtk}  DEF ${aDef.defense||0}  ARM ${aDef.armor||0}  RNG ${aDef.range||1}  ACC ${aDef.accuracy||0}  EVA ${aDef.evasion||0}`;
    const defStats = `ATK ${tDef.soft_attack||0}/${tDef.hard_attack||0}  DEF ${tDef.defense||0}  ARM ${tDef.armor||0}  RNG ${tDef.range||1}  ACC ${tDef.accuracy||0}  EVA ${tDef.evasion||0}`;
    mk(atkStats, lX, pY + 74, '#8fb9ff', 8, true);
    mk(defStats, rX, pY + 74, '#ffb38f', 8, true);

    // ── Score breakdown panel ─────────────────────────────────────────────────
    const sbY = cy-cH/2+56+pH+14;
    const sbH = 108;
    bx(cx, sbY+sbH/2, cW-16, sbH, 0x080c10, 0.95, 0x1e2d3a);
    mk('HIT QUALITY BREAKDOWN (0–100)', cx, sbY+6, '#6688aa', 10, true, 0.5, 0);

    // Build modifier rows
    const rows = [
      ['Base hit quality',  `${baseScore}`, '#778899'],
    ];
    if (aDef.accuracy)   rows.push([`Accuracy (${aDef.name})`,      `+${aDef.accuracy}`, '#88cc88']);
    if (tDef.evasion)    rows.push([`Evasion (${tDef.name})`,       `−${tDef.evasion}`,  '#cc8844']);
    if (terrainMod)      rows.push([`Terrain cover`,                 `−${terrainMod}`,    '#aa7744']);
    if (openPlainMod)    rows.push([`Open plains exposure`,          `+${openPlainMod}`,  '#ff9966']);
    if (dugInMod)        rows.push([`Dug-in fortification`,          `−${dugInMod}`,      '#aa7744']);
    if (bunkerMod)       rows.push([`Bunker protection`,             `−${bunkerMod}`,     '#aa7744']);
    if (blindMod)        rows.push([`Blind fire penalty`,            `−${blindMod}`,      '#cc4444']);
    if (infRangePenalty) rows.push([`Infantry max-range penalty`,    `−${infRangePenalty} score / −1 ATK`, '#ffbb66']);
    if (fighterStrafePenalty) rows.push([`Fighter strafing penalty`, `ATK x0.5`, '#ffbb66']);
    if (atkSupPen>0)     rows.push([`Attacker out-of-supply`,        `−${atkSupPen*3} score / −${atkSupPen} ATK`, '#ff9966']);
    if (defSupPen>0)     rows.push([`Defender out-of-supply`,        `+${defSupPen*3} score / DEF−${defSupPen}`, '#ff9966']);
    if (pierceMod !== 0) rows.push([`Pierce ${aDef.pierce} vs Armor ${tDef.armor}`, `${pierceMod>=0?'+':''}${pierceMod}`, pierceMod>=0?'#88cc88':'#cc8844']);
    rows.push([`Random variance roll`,                               `±${ROLL}`,          '#7799aa']);

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
    mk(`Pre-roll hit quality: ${preRollScore} / 100  (possible ${scoreMin}–${scoreMax} after random roll)`, cx, sbY+sbH-26, '#aabbcc', 10, true, 0.5, 1);
    mk(`Roll = random ±${ROLL} added at resolve time (represents battlefield variance)`, cx, sbY+sbH-6, '#88a0b8', 9, false, 0.5, 1);

    // ── Outcome band ──────────────────────────────────────────────────────────
    const outY = sbY + sbH + 6;
    bx(cx, outY+14, cW-16, 28, TIER_BG[tier]||0x1a1a1a, 1, 0x334455);
    const rangeStr = tierLo===tierHi ? tier : `${tierLo}  →  ${tier}  →  ${tierHi}`;
    mk(`Expected: ${rangeStr.toUpperCase()}  |  est. −${expDmg} to defender${canRet?`  ·  ↩ ret. −${expRetDmg}`:` · no retaliation (${noRetReason})`}`, cx, outY+14, TIER_COL[tier]||'#ccc', 10, true);

    // ── Buttons ───────────────────────────────────────────────────────────────
    const btnY = cy+cH/2-22;
    bx(cx, cy+cH/2-22, cW, 44, 0x080c10, 1, 0x2e3d50);
    const atkBtn=this.add.text(cx-80,btnY,'  ATTACK  ',{font:'bold 13px monospace',fill:'#ffffff',backgroundColor:'#992211',padding:{x:16,y:8}}).setOrigin(0.5,0.5).setScrollFactor(0).setDepth(D+2).setInteractive({useHandCursor:true});
    const canBtn=this.add.text(cx+80,btnY,'  CANCEL  ',{font:'bold 13px monospace',fill:'#aaaaaa',backgroundColor:'#1a1a2a',padding:{x:16,y:8}}).setOrigin(0.5,0.5).setScrollFactor(0).setDepth(D+2).setInteractive({useHandCursor:true});
    this._addToUI([...objs,atkBtn,canBtn]);

    const cleanup=()=>[...objs,atkBtn,canBtn].forEach(o=>{try{o.destroy();}catch(e){}});
    atkBtn.on('pointerdown',()=>{
      this._contextMenuClicked=true;
      // Short on-card strike animation before resolve
      const slash = this.add.graphics().setScrollFactor(0).setDepth(D+3);
      const sx1 = lX + pW*0.15, sy1 = pY - 12;
      const sx2 = rX - pW*0.15, sy2 = pY - 12;
      slash.lineStyle(6, 0xff4444, 0.95);
      slash.beginPath(); slash.moveTo(sx1, sy1); slash.lineTo(sx2, sy2); slash.strokePath();
      this.tweens.add({ targets: slash, alpha: 0, duration: 140, onComplete: () => { try { slash.destroy(); } catch(e){} } });
      this.time.delayedCall(120, () => { cleanup(); this._doImmediateAttack(attacker,target.id,blindFire); });
    });
    canBtn.on('pointerdown',()=>{ this._contextMenuClicked=true; cleanup(); this._refresh(); });
    atkBtn.on('pointerover',()=>atkBtn.setStyle({fill:'#ffdddd'}));
    atkBtn.on('pointerout', ()=>atkBtn.setStyle({fill:'#ffffff'}));
  }

  _showIndirectConfirm(attacker, target) {
    if (!attacker || !target) return;
    const w = this.scale.width, h = this.scale.height, D = 212;
    const objs = [];
    const bg = this.add.rectangle(w/2, h/2, 520, 180, 0x0b1016, 0.98).setScrollFactor(0).setDepth(D).setStrokeStyle(2, 0x445566);
    const t1 = this.add.text(w/2, h/2 - 56, 'INDIRECT ATTACK CONFIRM', { font: 'bold 16px monospace', fill: '#d7e9ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1);
    const dist = hexDistance(attacker.q, attacker.r, target.q, target.r);
    const rng = attacker.range ?? UNIT_TYPES[attacker.type]?.range ?? 1;
    const t2 = this.add.text(w/2, h/2 - 24, `${attacker.type} -> ${target.type}   Range ${dist}/${rng}   LOS ignored by attacker`, { font: '12px monospace', fill: '#9fc3e8' }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1);
    const t3 = this.add.text(w/2, h/2 + 2, 'Defender retaliation still uses defender LOS/range rules', { font: '11px monospace', fill: '#7f95ab' }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1);
    const atkBtn = this.add.text(w/2 - 90, h/2 + 52, '  ATTACK  ', { font: 'bold 13px monospace', fill: '#ffffff', backgroundColor: '#992211', padding: { x: 14, y: 7 } }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
    const canBtn = this.add.text(w/2 + 90, h/2 + 52, '  CANCEL  ', { font: 'bold 13px monospace', fill: '#cccccc', backgroundColor: '#1a1a2a', padding: { x: 14, y: 7 } }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor: true });
    objs.push(bg, t1, t2, t3, atkBtn, canBtn);
    this._addToUI(objs);

    const cleanup = () => objs.forEach(o => { try { o.destroy(); } catch(e){} });
    atkBtn.on('pointerdown', () => { cleanup(); this._doImmediateAttack(attacker, target.id, false); });
    canBtn.on('pointerdown', () => { cleanup(); this._refresh(); });
  }

  _doImmediateAttack(attacker, targetId, blindFire) {
    // IGOUGO: resolve combat now, show card, refresh
    const gs = this.gameState;
    const target = gs.units.find(u => u.id === targetId);
    if (!target) { this._pushLog('Attack failed: target missing'); return; }
    const hpBefore = { atk: attacker.health, def: target.health };
    let log = [];
    try {
      log = resolveImmediateAttack(gs, attacker.id, targetId, blindFire) || [];
    } catch (e) {
      this._pushLog(`Attack resolver error: ${e?.message || e}`);
      this._refresh();
      return;
    }
    this.reachable = []; this.attackable = []; this.mode = 'select';
    // Road sabotage: air units or artillery can damage roads on the target hex
    const defender = gs.units.find(u => u.id === targetId);
    const defQ = defender?.q ?? targetId?.q;
    const defR = defender?.r ?? targetId?.r;
    if (defQ != null) {
      const isAirAttacker = attacker && UNIT_TYPES[attacker.type]?.air;
      const isArtilleryAttacker = attacker && (attacker.type === 'ARTILLERY' || attacker.type === 'MORTAR');
      if (isAirAttacker || isArtilleryAttacker) {
        const roadB = roadAt(gs, defQ, defR);
        if (roadB) {
          const tier = BUILDING_TYPES[roadB.type]?.roadTier ?? 0;
          if (tier > 0) {
            // Downgrade: railway → concrete → dirt
            const downgradeType = tier === 2 ? 'CONCRETE_ROAD' : 'ROAD';
            const idx = gs.buildings.indexOf(roadB);
            if (idx >= 0) {
              gs.buildings.splice(idx, 1, createBuilding(downgradeType, roadB.owner, roadB.q, roadB.r));
              this._pushLog(`Road on (${roadB.q},${roadB.r}) damaged — downgraded to ${BUILDING_TYPES[downgradeType].name}`);
            }
          } else {
            // Dirt road — destroy with 40% chance
            if (Math.random() < 0.4) {
              gs.buildings = gs.buildings.filter(b => b !== roadB);
              this._pushLog(`Dirt road on (${roadB.q},${roadB.r}) destroyed!`);
            }
          }
        }
      }
    }
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
    } else {
      this._pushLog('Attack resolved with no combat log entry (unexpected)');
    }
    const winner = checkWinner(gs);
    if (winner) { this._showResolution([], winner); }
  }

  _confirmEndTurn() {
    if (this._splashDismiss) return; // pass screen still active
    if (this._endTurnPending) { this._onSubmit(); this._hideEndTurnConfirm(); return; }
    this._endTurnPending = true;
    const D = 200;
    const w = this.scale.width, h = this.scale.height;
    const bw = 260, bh = 72, bx = w - 10 - bw, by = 44;

    // Dim overlay behind the confirm box
    this._etcOverlay = this.add.rectangle(bx + bw/2, by + bh/2, bw + 4, bh + 4, 0x000000, 0.55)
      .setScrollFactor(0).setDepth(D - 1);

    // Confirm box
    this._etcBox = this.add.rectangle(bx + bw/2, by + bh/2, bw, bh, 0x1a2a1a, 1)
      .setScrollFactor(0).setDepth(D).setStrokeStyle(2, 0x44aa44);

    this._etcLabel = this.add.text(bx + bw/2, by + 10, 'End Turn?', {
      font: 'bold 15px monospace', fill: '#ffffff'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D);

    // YES button
    this._etcYes = this.add.text(bx + 20, by + 36, '[ YES ]', {
      font: 'bold 13px monospace', fill: '#88ff88',
      backgroundColor: '#226622', padding: { x: 10, y: 6 }
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: true });
    this._etcYes.on('pointerdown', () => { this._onSubmit(); this._hideEndTurnConfirm(); });
    this._etcYes.on('pointerover', () => this._etcYes.setAlpha(0.75));
    this._etcYes.on('pointerout',  () => this._etcYes.setAlpha(1.0));

    // NO button
    this._etcNo = this.add.text(bx + bw - 20, by + 36, '[ NO ]', {
      font: 'bold 13px monospace', fill: '#ff8888',
      backgroundColor: '#662222', padding: { x: 10, y: 6 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: true });
    this._etcNo.on('pointerdown', () => this._hideEndTurnConfirm());
    this._etcNo.on('pointerover', () => this._etcNo.setAlpha(0.75));
    this._etcNo.on('pointerout',  () => this._etcNo.setAlpha(1.0));

    this._etcHint = this.add.text(bx + bw/2, by + bh - 10, 'SPACE to confirm  •  ESC to cancel', {
      font: '10px monospace', fill: '#aaaaaa'
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(D);

    this._addToUI([this._etcOverlay, this._etcBox, this._etcLabel, this._etcYes, this._etcNo, this._etcHint]);

    // ESC cancels
    this._etcEscCb = () => this._hideEndTurnConfirm();
    this.input.keyboard.once('keydown-ESC', this._etcEscCb);
  }

  _hideEndTurnConfirm() {
    this._endTurnPending = false;
    [this._etcOverlay, this._etcBox, this._etcLabel, this._etcYes, this._etcNo, this._etcHint]
      .forEach(o => { if (o && !o.destroyed) o.destroy(); });
    this._etcOverlay = this._etcBox = this._etcLabel = this._etcYes = this._etcNo = this._etcHint = null;
    if (this._etcEscCb) { this.input.keyboard.off('keydown-ESC', this._etcEscCb); this._etcEscCb = null; }
  }

  _onSubmit() {
    this._hideEndTurnConfirm();
    // IGOUGO: end this player's turn (captures/income/spawns), then pass
    const gs = this.gameState;
    this._hideRecruitPanel();
    this._clearSelection();
    gs._mapSize = this.mapSize;
    const events = resolveEndOfTurn(gs, this.terrain);

    // Research completion notifications (clear, explicit, impossible to miss)
    const researchEvents = events.filter(e => /researched:/i.test(e));
    if (researchEvents.length > 0) {
      for (const e of researchEvents) this._pushLog(`🔬 ${e}`);
      this._showResearchToast(researchEvents);
    }

    const winner = checkWinner(gs);
    if (winner) {
      this._showResolution([], winner);
      return;
    }
    this._freezeFog();
    this._refresh();

    // If the next player is AI-controlled, skip the pass screen and run AI automatically
    if (this.aiPlayers.has(gs.currentPlayer)) {
      this._runAITurn();
    } else {
      this._showPassScreen(`Player ${gs.currentPlayer}'s turn — take the controls`);
    }
  }

  // ── AI turn runner ────────────────────────────────────────────────────────

  _runAITurn() {
    const gs  = this.gameState;
    const w   = this.scale.width, h = this.scale.height;
    const stratLabel = AI_STRATEGIES[this.aiStrategy]?.label || 'Balanced';

    // Status bar (replaces pass screen for AI turn)
    const overlay = this.add.rectangle(w/2, 22, w, 44, 0x1a1200, 0.92)
      .setScrollFactor(0).setDepth(200);
    const lbl = this.add.text(w/2, 22, `⚙  AI Player ${gs.currentPlayer} — ${stratLabel} — acting…`, {
      font: 'bold 14px monospace', fill: '#ffcc44',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(201);
    this._addToUI([overlay, lbl]);

    // Plan all actions (does NOT execute — pure data)
    const actions = planAITurn(gs, this.terrain, this.mapSize, this.aiStrategy);
    const aiCounts = actions.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});
    this._pushLog(`AI P${gs.currentPlayer}: ${actions.length} actions (move:${aiCounts.move||0} atk:${aiCounts.attack||0} build:${aiCounts.build||0} recruit:${aiCounts.recruit||0} design:${aiCounts.design||0})`);

    // Execute actions sequentially with delays and visual feedback
    this._executeAIActions(actions, 0, () => {
      // All done — dismiss status bar and end AI's turn
      try { overlay.destroy(); } catch(e){}
      try { lbl.destroy();     } catch(e){}
      this._onSubmit();
    });
  }

  _executeAIActions(actions, index, onDone) {
    if (index >= actions.length) { onDone(); return; }

    const action = actions[index];
    const next   = () => this._executeAIActions(actions, index + 1, onDone);
    const gs     = this.gameState;

    if (action.type === 'move') {
      const unit = gs.units.find(u => u.id === action.unitId);
      if (!unit) { next(); return; }

      // Snap position and play slide animation
      const fromW = hexToWorld(action.fromQ, action.fromR);
      unit.q = action.toQ; unit.r = action.toR;
      unit.dugIn = false;
      unit.moved = true; unit.movesLeft = 0;

      this._slideState = {
        unit, fromX: fromW.x, fromY: fromW.y,
        toX: hexToWorld(action.toQ, action.toR).x,
        toY: hexToWorld(action.toQ, action.toR).y,
        startTime: performance.now(), duration: 220,
      };
      this._refresh();
      // Wait for slide to finish + small gap
      this.time.delayedCall(350, next);

    } else if (action.type === 'attack') {
      const attacker = gs.units.find(u => u.id === action.attackerId);
      const target   = gs.units.find(u => u.id === action.targetId);
      if (!attacker || !target) { next(); return; }

      // Execute the attack (critical: pass attacker.id, not attacker object)
      let log = [];
      try {
        log = resolveImmediateAttack(gs, attacker.id, action.targetId, false) || [];
      } catch (e) {
        this._pushLog(`AI attack error: ${e?.message || e}`);
      }
      attacker.attacked = true;
      this._refresh();

      // Show combat flash + card for transparency
      this._showAICombatFlash(action.attackerQ, action.attackerR, action.targetQ, action.targetR);
      if (log.length > 0) {
        const card = this._showCombatCard(log[0], 1, 1);
        let done = false;
        const dismiss = () => {
          if (done) return;
          done = true;
          card.forEach(o => { try { o.destroy(); } catch(e){} });
          this._splashDismiss = null;
          this.input.off('pointerup', dismiss);
          next();
        };
        this._splashDismiss = dismiss;
        this.time.delayedCall(120, () => {
          this.input.on('pointerup', dismiss);
          this.input.keyboard?.once('keydown-SPACE', dismiss);
        });
      } else {
        this._pushLog('AI attack resolved with no combat log entry');
        this.time.delayedCall(200, next);
      }

    } else if (action.type === 'recruit') {
      queueRecruit(gs, gs.currentPlayer, action.unitType, action.buildingId);
      const cost = UNIT_TYPES[action.unitType]?.cost || {};
      const res  = gs.players[gs.currentPlayer];
      res.iron -= (cost.iron || 0);
      res.oil  -= (cost.oil  || 0);
      res.wood  = (res.wood || 0) - (cost.wood || 0);
      this._updateTopBar();
      next();

    } else if (action.type === 'digin') {
      const unit = gs.units.find(u => u.id === action.unitId);
      if (unit && UNIT_TYPES[unit.type]?.canDigIn) {
        unit.dugIn = true; unit.moved = true;
        this._refresh();
      }
      next();

    } else if (action.type === 'build') {
      const unit = gs.units.find(u => u.id === action.unitId);
      const p = gs.currentPlayer;
      if (!unit || unit.owner !== p || !UNIT_TYPES[unit.type]?.canBuild) { next(); return; }

      const bType = action.buildingType;
      const cost = BUILDING_TYPES[bType]?.buildCost || {};
      const pl = gs.players[p];

      // Placement validity similar to player build flow.
      const onRoad = !!roadAt(gs, unit.q, unit.r);
      const hasNonRoadBuilding = !!(buildingAt(gs, unit.q, unit.r) && !onRoad);
      if (bType === 'ROAD') {
        if (onRoad) { next(); return; }
      } else if (hasNonRoadBuilding) {
        next(); return;
      }

      if ((pl.iron || 0) < (cost.iron || 0) || (pl.oil || 0) < (cost.oil || 0) ||
          (pl.wood || 0) < (cost.wood || 0) || (pl.components || 0) < (cost.components || 0)) {
        next(); return;
      }

      pl.iron = (pl.iron || 0) - (cost.iron || 0);
      pl.oil = (pl.oil || 0) - (cost.oil || 0);
      pl.wood = (pl.wood || 0) - (cost.wood || 0);
      pl.components = (pl.components || 0) - (cost.components || 0);

      if (bType === 'ROAD') {
        gs.buildings.push(createBuilding('ROAD', p, unit.q, unit.r));
        this._redrawRoads();
      } else {
        const def = BUILDING_TYPES[bType] || {};
        const b = createBuilding(bType, p, unit.q, unit.r);
        const turns = def.buildTurns || 0;
        if (turns > 0) {
          b.underConstruction = true;
          b.buildProgress = 0;
          b.buildTurnsRequired = turns;
          unit.constructing = b.id;
        }
        gs.buildings.push(b);
      }

      unit.moved = true;
      unit.building = true;
      this._refresh();
      this.time.delayedCall(120, next);

    } else if (action.type === 'design') {
      const result = registerDesign(gs, gs.currentPlayer, action.chassis, action.modules, action.name);
      if (result.ok) this._updateTopBar();
      next();

    } else {
      next();
    }
  }

  // Brief visual flash on attacker + target hexes when AI attacks
  _showAICombatFlash(aqQ, aqR, tqQ, tqR) {
    const aPos  = hexToWorld(aqQ, aqR);
    const tPos  = hexToWorld(tqQ, tqR);
    const flash = this.add.graphics().setDepth(35);

    // Attacker: orange ring
    flash.lineStyle(3, 0xff8800, 0.9);
    flash.strokeCircle(aPos.x, aPos.y, HEX_SIZE * 0.55);
    // Target: red ring
    flash.lineStyle(3, 0xff2222, 0.9);
    flash.strokeCircle(tPos.x, tPos.y, HEX_SIZE * 0.55);
    // Arrow-like line
    flash.lineStyle(2, 0xff5500, 0.6);
    flash.beginPath();
    flash.moveTo(aPos.x, aPos.y);
    flash.lineTo(tPos.x, tPos.y);
    flash.strokePath();

    // Fade and destroy after 600ms
    this.tweens.add({
      targets: flash, alpha: 0, duration: 550, ease: 'Linear',
      onComplete: () => { try { flash.destroy(); } catch(e){} }
    });
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
      COASTAL_BATTERY:'▣', AA_EMPLACEMENT:'⊕' };
    const g = t => GLYPH[t] || '◌';

    const PC = [null, 0x3366cc, 0xcc3333];
    const SCALE = 1.45;
    const mk = (txt, x, y, col='#d0dde8', sz=12, bold=false, ox=0.5, oy=0.5, wrapW=null) => {
      const style = { font:`${bold?'bold ':''}${Math.max(10, Math.round(sz*SCALE))}px monospace`, fill:col };
      if (wrapW) style.wordWrap = { width: wrapW };
      const t = this.add.text(x, y, txt, style).setOrigin(ox, oy).setScrollFactor(0).setDepth(D+1);
      objs.push(t); return t;
    };
    const box = (x, y, w, h, fill, alpha=1, stroke=null) => {
      const r = this.add.rectangle(x, y, w, h, fill, alpha).setDepth(D).setScrollFactor(0);
      if (stroke !== null) r.setStrokeStyle(1.5, stroke);
      objs.push(r); return r;
    };

    const cW = Math.min(1160, sw - 18), cH = Math.min(680, sh - 20);
    const cX = cx, cY = cy;
    box(cx, cy, sw, sh, 0x000000, 0.62);
    box(cX, cY, cW, cH, 0x0b0e14, 0.985, 0x2e3d50);

    // Header
    box(cX, cY - cH/2 + 24, cW, 48, 0x0d1b2a, 1, 0x2e3d50);
    mk('⚔  COMBAT', cX, cY - cH/2 + 24, '#d8c48a', 15, true);
    if (total > 1) mk(`${idx} / ${total}`, cX + cW/2 - 18, cY - cH/2 + 24, '#8ea5bc', 10, false, 1, 0.5);

    // Portrait cards
    const pW = Math.floor(cW * 0.38), pH = 180;
    const lCX = cX - cW*0.29, rCX = cX + cW*0.29;
    const pY = cY - cH/2 + 160;

    const atkHP0 = entry.attackerHPBefore ?? 0;
    const defHP0 = entry.targetHPBefore ?? 0;
    const atkHP1 = Math.max(0, atkHP0 - (entry.attackerDmg || 0));
    const defHP1 = Math.max(0, defHP0 - (entry.dmg || 0));

    const hpBar = (x, y, w, hp, max, dmg) => {
      box(x, y, w, 12, 0x111111, 1, 0x334455);
      const frac = Math.max(0, hp) / Math.max(1, max);
      if (frac > 0) box(x - w/2 + (w*frac)/2, y, w*frac, 12, frac > 0.6 ? 0x44bb44 : frac > 0.3 ? 0xddaa00 : 0xcc2222);
      if (dmg > 0) {
        const lostW = Math.min(w, w * dmg / Math.max(1, max));
        box(x - w/2 + w*frac + lostW/2, y, lostW, 12, 0x882222, 0.6);
      }
    };

    const portrait = (pcx, role, type, owner, name, hp0, hp1, dmgTaken) => {
      box(pcx, pY, pW, pH, 0x0f151c, 1, PC[owner] || 0x445566);
      box(pcx, pY - pH/2 + 14, pW, 24, owner===1?0x1a2a44:0x3a1414, 1);
      mk(role, pcx, pY - pH/2 + 14, role === 'ATTACKER' ? '#77a9ff' : '#ff8888', 10, true);
      mk(g(type), pcx, pY - 30, PC[owner]?`#${PC[owner].toString(16).padStart(6,'0')}`:'#aaaaaa', 36, true);
      mk(name || '?', pcx, pY + 18, '#eef6ff', 12, true);
      hpBar(pcx, pY + 48, pW - 28, hp1, hp0, dmgTaken);
      mk(`HP ${hp1}/${hp0}${dmgTaken>0?`  (-${dmgTaken})`:''}`, pcx, pY + 66, dmgTaken>0?'#ffaaaa':'#99dd99', 10, true);
    };

    portrait(lCX, 'ATTACKER', entry.attackerType, entry.attackerOwner, entry.attackerName, atkHP0, atkHP1, entry.attackerDmg || 0);
    portrait(rCX, 'DEFENDER', entry.targetType, entry.targetOwner, entry.targetName, defHP0, defHP1, entry.dmg || 0);

    // Outcome banner
    const outY = pY + pH/2 + 26;
    const outcome = entry.attackerDmg > (entry.dmg || 0) ? 'ATTACK REPELLED' : ((entry.dmg || 0) > entry.attackerDmg ? 'ATTACK SUCCESSFUL' : 'EXCHANGE');
    box(cX, outY, cW - 24, 44, outcome === 'ATTACK SUCCESSFUL' ? 0x1a3a1a : outcome === 'ATTACK REPELLED' ? 0x3a1a1a : 0x2a2200, 1, 0x445566);
    mk(outcome, cX, outY, outcome === 'ATTACK SUCCESSFUL' ? '#88ee88' : outcome === 'ATTACK REPELLED' ? '#ee8888' : '#ddbb66', 14, true);

    // Details block
    const gs = this.gameState;
    const atkU = gs.units.find(u => u.id === entry.attackerId);
    const defU = gs.units.find(u => u.id === entry.targetId);
    const atkTerrain = atkU ? (TERRAIN_LABELS[this.terrain?.[`${atkU.q},${atkU.r}`] ?? 0] || 'Plains') : '?';
    const defTerrain = defU ? (TERRAIN_LABELS[this.terrain?.[`${defU.q},${defU.r}`] ?? 0] || 'Plains') : '?';
    const atkDesign = atkU?.designId !== undefined ? gs.designs?.[atkU.owner]?.find(d => d.id === atkU.designId) : null;
    const defDesign = defU?.designId !== undefined ? gs.designs?.[defU.owner]?.find(d => d.id === defU.designId) : null;
    const atkMods = (atkDesign?.moduleKeys || []).map(k => MODULES[k]?.name || k).slice(0,4).join(', ');
    const defMods = (defDesign?.moduleKeys || []).map(k => MODULES[k]?.name || k).slice(0,4).join(', ');

    const roll = entry.roll ?? 0;
    const rollStr = roll >= 0 ? `+${roll}` : `${roll}`;
    const detailTop = outY + 36;
    const wrap = cW - 48;
    mk(`CALC: hit quality ${entry.score ?? '?'} / 100 = 50 + roll ${rollStr} + acc(${entry.accuracy ?? 0}) - evasion(${entry.evasion ?? 0}) - cover(${(entry.terrainMod||0)+(entry.dugInMod||0)+(entry.bunkerMod||0)}) + other mods`, cX, detailTop, '#d8e6f3', 10, true, 0.5, 0, wrap);
    mk(`ATTACKER: ATK ${entry.baseAttack ?? '?'}  pierce ${entry.pierce ?? '?'}  terrain ${atkTerrain}${atkMods ? `  ·  modules: ${atkMods}` : ''}`, cX, detailTop + 40, '#9cc9ff', 10, true, 0.5, 0, wrap);
    mk(`DEFENDER: armor ${entry.armor ?? '?'}  terrain ${defTerrain}${defMods ? `  ·  modules: ${defMods}` : ''}`, cX, detailTop + 74, '#ffbf9f', 10, true, 0.5, 0, wrap);

    const modParts = [];
    if (entry.openPlainMod) modParts.push(`open+${entry.openPlainMod}`);
    if (entry.flankMod) modParts.push(`flank+${entry.flankMod}`);
    if (entry.attackerSupplyPenalty) modParts.push(`atkOOS-${entry.attackerSupplyPenalty*3}`);
    if (entry.defenderSupplyPenalty) modParts.push(`defOOS+${entry.defenderSupplyPenalty*3}`);
    if (entry.infantryRangePenalty) modParts.push(`infRng-${entry.infantryRangePenalty}`);
    if (entry.blindFirePenalty) modParts.push(`blind-${entry.blindFirePenalty}`);
    mk(`MODIFIERS: ${modParts.length ? modParts.join('  ·  ') : 'none'}`, cX, detailTop + 108, '#f1f5f9', 10, true, 0.5, 0, wrap);

    const retText = (entry.defenderCanRetaliate && entry.retaliationDmg > 0)
      ? `RETALIATION: YES  (${entry.retaliationTier || '?'}, hit quality ${entry.retaliationScore ?? '?'})  defender deals -${entry.retaliationDmg}`
      : `RETALIATION: NO  (${entry.blindFire ? 'blind fire' : (entry.retHasLOS===false ? 'no LOS' : 'out of range / suppressed / invalid')})`;
    mk(retText, cX, detailTop + 142, (entry.defenderCanRetaliate ? '#ffcf95' : '#91a4b8'), 10, true, 0.5, 0, wrap);

    box(cX, cY + cH/2 - 18, cW, 34, 0x080b10, 1, 0x2e3d50);
    mk('CLICK or SPACE to continue', cX, cY + cH/2 - 18, '#dbe8f5', 10, true);

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
      this._spaceGuardUntil = performance.now() + 380;
      this._splashDismiss = null;
      [...objects, btn].forEach(o => { try { o.destroy(); } catch(e){} });
      onDismiss();
    };
    this._splashDismiss = dismiss;
    btn.on('pointerdown', dismiss);
    btn.on('pointerover', () => btn.setAlpha(0.8));
    btn.on('pointerout',  () => btn.setAlpha(1.0));
  }

  _focusPlayerHQ(player, smooth = true) {
    const hq = this.gameState.buildings.find(b => b.type === 'HQ' && Number(b.owner) === Number(player));
    if (!hq) return;
    const cam = this.cameras.main;
    const { x, y } = hexToWorld(hq.q, hq.r);

    // Use camera-native centering/pan to avoid manual scroll math drift.
    if (!smooth) {
      cam.centerOn(x, y);
      return;
    }

    cam.pan(x, y, 320, 'Sine.easeOut', true, (_cam, progress) => {
      if (progress >= 1) {
        // snap-finalize to exact center (eliminates residual offset)
        cam.centerOn(x, y);
      }
    });
  }

  _showPassScreen(msg) {
    // Safety: clear any lingering end-turn confirm state so pass-screen SPACE can't auto-submit.
    this._hideEndTurnConfirm?.();
    this._endTurnPending = false;

    const w = this.scale.width, h = this.scale.height;
    const gs = this.gameState;
    const p = gs.currentPlayer;
    const PC_HEX = p === 1 ? '#2255aa' : '#aa2222';
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.88).setScrollFactor(0).setDepth(200);
    // Center card
    const card = this.add.rectangle(w/2, h/2, 440, 120, 0x0a0d0a, 0.98).setScrollFactor(0).setDepth(200);
    card.setStrokeStyle(2, p === 1 ? 0x2255aa : 0xaa2222);
    // Top accent
    const accent = this.add.rectangle(w/2, h/2 - 58, 440, 4, p === 1 ? 0x2255aa : 0xaa2222, 1).setScrollFactor(0).setDepth(201);
    const playerLbl = this.add.text(w/2, h/2 - 22, `PLAYER ${p}`, {
      font: 'bold 28px monospace', fill: PC_HEX
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    const subLbl = this.add.text(w/2, h/2 + 16, 'TAKE THE CONTROLS  ·  CLICK TO CONTINUE', {
      font: '11px monospace', fill: '#334433'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    this._addToUI([overlay, card, accent, playerLbl, subLbl]);
    this._showSplash([overlay, card, accent, playerLbl, subLbl], () => {
      this._focusPlayerHQ(p, true);
      this._freezeFog();
      this._refresh();
      // Extra anti-loop guard: after pass-screen SPACE dismiss, ignore submit SPACE for a short window.
      this._spaceGuardUntil = Math.max(this._spaceGuardUntil || 0, performance.now() + 1400);
    });
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

        // Hit-quality breakdown
        const mods = [];
        if (entry.accuracy !== 0)  mods.push(`acc${entry.accuracy > 0 ? '+' : ''}${entry.accuracy}`);
        if (entry.evasion !== 0)   mods.push(`eva-${entry.evasion}`);
        if (entry.terrainMod !== 0) mods.push(`terrain-${entry.terrainMod}`);
        if ((entry.openPlainMod||0) !== 0) mods.push(`open+${entry.openPlainMod||0}`);
        if (entry.dugInMod !== 0)  mods.push(`dugin-${entry.dugInMod}`);
        if (entry.bunkerMod !== 0) mods.push(`bunker-${entry.bunkerMod}`);
        if ((entry.attackerSupplyPenalty||0) !== 0) mods.push(`atkOOS-${(entry.attackerSupplyPenalty||0)*3}`);
        if ((entry.defenderSupplyPenalty||0) !== 0) mods.push(`defOOS+${(entry.defenderSupplyPenalty||0)*3}`);
        if ((entry.infantryRangePenalty||0) !== 0) mods.push(`infRng-${entry.infantryRangePenalty||0}`);
        if (entry.flankMod !== 0)  mods.push(`flank+${entry.flankMod}`);
        mods.push(`roll${entry.roll >= 0 ? '+' : ''}${entry.roll}`);
        addLine(`  Hit quality: 50 + ${mods.join(' ')} = ${entry.score}`, '#ddddaa');

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

  _showResearchToast(researchEvents) {
    const w = this.scale.width;
    const D = 260;
    const lines = researchEvents.map(e => e.replace(/^P\d+\s+researched:\s*/i, ''));
    const text = lines.length === 1
      ? `🔬 Research Complete: ${lines[0].replace(/!+$/,'')}`
      : `🔬 Research Complete (${lines.length})\n${lines.map(s => `• ${s.replace(/!+$/,'')}`).join('\n')}`;

    const box = this.add.rectangle(w/2, 96, Math.min(760, w - 30), lines.length > 1 ? 68 : 44, 0x1b2a1b, 0.96)
      .setStrokeStyle(2, 0x77cc77, 0.95)
      .setScrollFactor(0).setDepth(D);
    const lbl = this.add.text(w/2, 96, text, {
      font: lines.length > 1 ? 'bold 11px monospace' : 'bold 12px monospace',
      fill: '#ddffdd', align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1);
    this._addToUI([box, lbl]);

    this.tweens.add({
      targets: [box, lbl],
      alpha: 0,
      delay: 2200,
      duration: 360,
      onComplete: () => { try { box.destroy(); } catch(e){} try { lbl.destroy(); } catch(e){} }
    });
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
    } else if (this.scenario === 'mortar_test') {
      // Deliberate LOS blockers between mortar and all in-range targets.
      for (const [q, r] of [[6,10], [6,11], [6,9]]) map[`${q},${r}`] = 2; // mountains
    } else if (this.scenario === 'naval') {
      this._genNavalTerrain(map, ms);
    } else if (this.scenario === 'random' || this.scenario === 'custom') {
      this._genProcTerrain(map, ms, this.mapSeed, this.procLandProfile || 'islands');
    } else {
      // Standard procedural terrain (scout / grand / default)
      const seed = this.scenario === 'grand' ? 99999 : 12345;
      const rng = this._seededRng(seed);
      const forestCount    = this.scenario === 'grand' ? 80 : 30;
      const lightWoodCount = this.scenario === 'grand' ? 60 : 25; // light woods: more frequent, smaller patches
      const hillCount      = this.scenario === 'grand' ? 50 : 20;
      const mtCount        = this.scenario === 'grand' ? 25 : 10;
      // Dense forest — large blobs
      for (let i = 0; i < forestCount; i++) {
        const cq = Math.floor(rng() * ms), cr = Math.floor(rng() * ms);
        for (let dq = -2; dq <= 2; dq++)
          for (let dr = -2; dr <= 2; dr++)
            if (isValid(cq+dq, cr+dr, ms) && rng()>0.4) map[`${cq+dq},${cr+dr}`] = 1;
      }
      // Light woods — smaller scattered patches, often bordering dense forest or alone
      for (let i = 0; i < lightWoodCount; i++) {
        const cq = Math.floor(rng() * ms), cr = Math.floor(rng() * ms);
        for (let dq = -2; dq <= 2; dq++)
          for (let dr = -2; dr <= 2; dr++)
            if (isValid(cq+dq, cr+dr, ms) && rng()>0.55 && map[`${cq+dq},${cr+dr}`] === 0)
              map[`${cq+dq},${cr+dr}`] = 7; // only overwrite plains, not forests/hills
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

  // ── Deterministic value noise helpers ────────────────────────────────────
  _noise2D(x, y, seed) {
    const fade = t => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + t * (b - a);
    const hash = (ix, iy) => {
      let h = ((ix * 1619 + iy * 31337 + seed * 6791) & 0x7FFFFFFF);
      h ^= h >>> 13; h = Math.imul(h, 0x45d9f3b) | 0; h ^= h >>> 15;
      return (h >>> 0) / 0xFFFFFFFF;
    };
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = fade(x - ix), fy = fade(y - iy);
    return lerp(lerp(hash(ix, iy), hash(ix+1, iy), fx),
                lerp(hash(ix, iy+1), hash(ix+1, iy+1), fx), fy);
  }
  _fbm(x, y, seed, octaves = 4) {
    let v = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      v   += this._noise2D(x * freq, y * freq, seed + i * 997) * amp;
      max += amp; amp *= 0.5; freq *= 2.1;
    }
    return v / max; // 0..1
  }

  // ── Procedural map generation ─────────────────────────────────────────────
  _genProcTerrain(map, ms, seed, landProfile = 'islands') {
    // Special preset: mostly ocean with player medium islands + small central islands
    if (landProfile === 'naval_supremacy') {
      this._genNavalTerrain(map, ms);
      return;
    }

    // Profile-tuned procedural knobs
    const PROFILE = {
      islands:        { scale: 0.090, sea: 0.56, edgeFalloff: 1.25, edgeStart: 0.55, islandAmp: 0.30, islandRad: 0.18, centers: [[0.18,0.24],[0.36,0.20],[0.55,0.26],[0.74,0.22],[0.80,0.40],[0.68,0.56],[0.48,0.66],[0.30,0.62],[0.16,0.52]] },
      large_islands:  { scale: 0.076, sea: 0.53, edgeFalloff: 1.15, edgeStart: 0.58, islandAmp: 0.36, islandRad: 0.24, centers: [[0.20,0.28],[0.50,0.24],[0.76,0.32],[0.30,0.66],[0.64,0.70]] },
      continent:      { scale: 0.045, sea: 0.36, edgeFalloff: 0.8, edgeStart: 0.70, islandAmp: 0.00, islandRad: 0.0, centers: [] },
      two_continents: { scale: 0.055, sea: 0.39, edgeFalloff: 1.0, edgeStart: 0.63, islandAmp: 0.00, islandRad: 0.0, centers: [] },
      archipelago:    { scale: 0.115, sea: 0.52, edgeFalloff: 1.35, edgeStart: 0.50, islandAmp: 0.24, islandRad: 0.13, centers: [[0.18,0.22],[0.36,0.20],[0.54,0.26],[0.72,0.24],[0.82,0.36],[0.72,0.52],[0.54,0.58],[0.34,0.62],[0.18,0.56]] },
      landlocked:     { scale: 0.060, sea: -99, edgeFalloff: 0.0, edgeStart: 1.0, islandAmp: 0.0, islandRad: 0.0, centers: [] },
    }[landProfile] || { scale: 0.075, sea: 0.44, edgeFalloff: 1.2, edgeStart: 0.55, islandAmp: 0.0, islandRad: 0.0, centers: [] };

    // Scale noise by map size so small maps don't become overly noisy/distorted.
    const sizeScale = Phaser.Math.Clamp(ms / 40, 0.65, 1.25);
    const SCALE     = PROFILE.scale * sizeScale; // lower = larger, smoother features
    const isContinentLike = (landProfile === 'continent' || landProfile === 'two_continents');
    const SEA_LV    = PROFILE.sea - (isContinentLike ? 0.08 : 0);   // below → ocean (boost continent landmass size)
    const COAST_LV  = SEA_LV + 0.04;
    const HILL_LV   = 0.64;
    const MTN_LV    = 0.79;

    // Build height map
    const h = {};

    // World-space normalization helps avoid rhombus/square bias from raw q/r axes.
    const cHex = hexToWorld(Math.floor(ms * 0.5), Math.floor(ms * 0.5));
    const corners = [hexToWorld(0, 0), hexToWorld(ms - 1, 0), hexToWorld(0, ms - 1), hexToWorld(ms - 1, ms - 1)];
    const maxDX = Math.max(...corners.map(p => Math.abs(p.x - cHex.x))) || 1;
    const maxDY = Math.max(...corners.map(p => Math.abs(p.y - cHex.y))) || 1;

    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        let v = this._fbm(q * SCALE, r * SCALE, seed);

        // Island profile shaping (hard mode): build discrete island blobs, not one continent
        if (PROFILE.islandAmp > 0 && PROFILE.centers.length > 0) {
          let bump = 0;
          for (const [cxn, cyn] of PROFILE.centers) {
            const cx = cxn * ms, cy = cyn * ms;
            const dx = (q - cx) / ms, dy = (r - cy) / ms;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < PROFILE.islandRad) {
              const t = 1 - (d / PROFILE.islandRad);
              bump = Math.max(bump, t); // nearest-island blob field
            }
          }

          // Make islands discrete by relying on blob field + high-frequency breakup,
          // and strongly downweight the broad fbm continent tendency.
          const breakup = this._fbm(q * 0.17 + 500, r * 0.17 + 900, seed + 7777, 3);
          const micro   = this._fbm(q * 0.29 + 130, r * 0.29 + 260, seed + 9999, 2);

          if (landProfile === 'islands') {
            v = (v * 0.20) + (bump * 0.95) + (breakup * 0.22) + (micro * 0.10) - 0.34;
          } else if (landProfile === 'large_islands') {
            v = (v * 0.25) + (bump * 1.00) + (breakup * 0.18) + (micro * 0.08) - 0.28;
          } else {
            // archipelago keeps lighter shaping
            v += bump * PROFILE.islandAmp + breakup * 0.08;
          }
        }

        // Civ-like continent shaping pass: one main landmass with irregular lobes.
        if (isContinentLike) {
          const cx = ms * (0.50 + (this._fbm(seed * 0.001, 2.1, seed + 301, 1) - 0.5) * 0.10);
          const cy = ms * (0.50 + (this._fbm(seed * 0.001, 2.9, seed + 307, 1) - 0.5) * 0.10);
          const a = ms * (0.26 + this._fbm(seed * 0.001, 3.7, seed + 313, 1) * 0.08);
          const b = ms * (0.20 + this._fbm(seed * 0.001, 4.3, seed + 317, 1) * 0.07);

          // Main ellipse + two side lobes for natural coastline silhouette
          const d0 = Math.sqrt(((q - cx) / Math.max(1, a)) ** 2 + ((r - cy) / Math.max(1, b)) ** 2);
          const l1x = cx + ms * 0.16, l1y = cy - ms * 0.06;
          const l2x = cx - ms * 0.14, l2y = cy + ms * 0.10;
          const d1 = Math.sqrt(((q - l1x) / Math.max(1, a * 0.62)) ** 2 + ((r - l1y) / Math.max(1, b * 0.68)) ** 2);
          const d2 = Math.sqrt(((q - l2x) / Math.max(1, a * 0.58)) ** 2 + ((r - l2y) / Math.max(1, b * 0.64)) ** 2);
          const blob = Math.max(0, 1 - d0, 1 - d1, 1 - d2);

          const coastBreak = this._fbm(q * 0.14 + 911, r * 0.14 + 377, seed + 4040, 3) * 0.22;
          v = (v * 0.34) + (blob * 1.02) + coastBreak - 0.24;
        }

        // Soft edge falloff with coastline roughness (avoids perfect geometric blobs)
        const cxOff = (this._fbm(seed * 0.001, 11.3, seed + 51, 1) - 0.5) * 0.22;
        const cyOff = (this._fbm(seed * 0.001, 19.7, seed + 77, 1) - 0.5) * 0.18;

        const wp = hexToWorld(q, r);
        // For continent-like profiles, normalize in world-space to reduce axial rhombus imprint.
        let ex = isContinentLike
          ? ((wp.x - cHex.x) / maxDX) + (cxOff * 0.65)
          : ((q / ms) - (0.5 + cxOff)) * 2;
        let er = isContinentLike
          ? ((wp.y - cHex.y) / maxDY) + (cyOff * 0.65)
          : ((r / ms) - (0.5 + cyOff)) * 2;

        const coastWarpAmp = isContinentLike ? 0.12 : 0.14;
        const coastWarpA = this._fbm(q * 0.11 + 310, r * 0.11 + 740, seed + 4242, 3) * coastWarpAmp;
        const coastWarpB = this._fbm(q * 0.09 + 120, r * 0.09 + 520, seed + 9898, 3) * coastWarpAmp;
        ex += coastWarpA;
        er += coastWarpB;

        // Continent-like profiles: rotated + angular-warped ellipse to avoid trapezoid silhouettes.
        let edgeDist;
        if (landProfile === 'continent' || landProfile === 'two_continents') {
          const rot = (this._fbm(seed * 0.001, 7.7, seed + 203, 1) - 0.5) * 1.2; // ~±34°
          const cr = Math.cos(rot), sr = Math.sin(rot);
          const rx = ex * cr - er * sr;
          const ry = ex * sr + er * cr;

          const ax = 1.00 + (this._fbm(seed * 0.001, 31.1, seed + 91, 1) - 0.5) * 0.12;
          const ay = 1.00 + (this._fbm(seed * 0.001, 37.9, seed + 117, 1) - 0.5) * 0.12;

          const theta = Math.atan2(ry, rx);
          const angWarp =
            Math.sin(theta * 3 + seed * 0.013) * 0.08 +
            Math.sin(theta * 5 - seed * 0.009) * 0.04;

          const radial = Math.sqrt((rx / ax) * (rx / ax) + (ry / ay) * (ry / ay));
          const boxy = Math.max(Math.abs(rx), Math.abs(ry));
          edgeDist = (radial + angWarp) * 0.96 + boxy * 0.04;
        } else {
          edgeDist = Math.max(Math.abs(ex), Math.abs(er));
        }

        // Extra raggedness around shoreline band
        const shoreNoise = this._fbm(q * 0.20 + 700, r * 0.20 + 300, seed + 1313, 2) * (isContinentLike ? 0.09 : 0.10);
        edgeDist += shoreNoise;

        // Guard against map-edge clipping creating trapezoid-looking continents.
        if (isContinentLike) {
          const edgePad = Math.floor(ms * 0.16);
          const mQR = Math.min(q, r, (ms - 1) - q, (ms - 1) - r);
          const sum = q + r;
          const mDiag = Math.min(sum, (2 * (ms - 1)) - sum);
          const m = Math.min(mQR, mDiag);
          if (m < edgePad) {
            const t = (edgePad - m) / Math.max(1, edgePad);
            v -= t * 0.45; // stronger coast push near all map boundaries/diagonals
          }
        }

        v -= Math.max(0, edgeDist - PROFILE.edgeStart) * PROFILE.edgeFalloff;

        // Two-continent profile: carve central ocean channel
        if (landProfile === 'two_continents') {
          const center = ms * 0.5;
          const band = Math.abs(q - center) / ms;
          if (band < 0.09) v -= (0.22 - band);
        }
        h[`${q},${r}`] = v;
      }
    }

    // Classify terrain from height + ridge/veg noise for more natural relief.
    const NEIGHBORS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        const v = h[`${q},${r}`];
        if (v < SEA_LV) { map[`${q},${r}`] = 5; continue; } // ocean

        const ridge = this._fbm(q * 0.085 + 420, r * 0.085 + 140, seed + 5555, 3);
        const rough = this._fbm(q * 0.16 + 740, r * 0.16 + 260, seed + 6666, 2);

        // Mountains: rarer and more range-like; not blanket coverage.
        const mtnV = isContinentLike ? (MTN_LV + 0.02) : MTN_LV;
        const isMountain = (v > mtnV && ridge > 0.60) || (v > mtnV + 0.03 && ridge > 0.54);
        if (isMountain) { map[`${q},${r}`] = 2; continue; }

        // Hills: tone down on continent profiles to avoid hill carpets.
        const hillV = isContinentLike ? (HILL_LV + 0.06) : HILL_LV;
        const isHill = (v > hillV && ridge > (isContinentLike ? 0.56 : 0.48)) ||
                       (v > hillV + 0.06) ||
                       (!isContinentLike && ridge > 0.72 && rough > 0.56);
        if (isHill) { map[`${q},${r}`] = 3; continue; }

        // Flat land — secondary noise for vegetation
        const n2 = this._fbm(q * 0.18 + 200, r * 0.18 + 100, seed + 3333, 3);
        if      (n2 > 0.67) map[`${q},${r}`] = 1; // dense forest
        else if (n2 > 0.54) map[`${q},${r}`] = 7; // light woods
        else                map[`${q},${r}`] = 0; // plains/grass
      }
    }

    // Relief harmonization: reduce lone mountain spikes; add hill shoulders near mountains.
    {
      const snapRelief = { ...map };
      for (let q = 0; q < ms; q++) {
        for (let r = 0; r < ms; r++) {
          const t = snapRelief[`${q},${r}`];
          if (t === 2) {
            let mAdj = 0;
            for (const [dq, dr] of NEIGHBORS) if (snapRelief[`${q+dq},${r+dr}`] === 2) mAdj++;
            if (mAdj <= 1) map[`${q},${r}`] = 3; // lonely mountain -> hill
          }
        }
      }
      const snap2Relief = { ...map };
      for (let q = 0; q < ms; q++) {
        for (let r = 0; r < ms; r++) {
          if (snap2Relief[`${q},${r}`] !== 2) continue;
          for (const [dq, dr] of NEIGHBORS) {
            const k = `${q+dq},${r+dr}`;
            if (snap2Relief[k] === 0 || snap2Relief[k] === 7) {
              const roll = this._fbm((q+dq) * 0.31 + 90, (r+dr) * 0.31 + 210, seed + 777, 2);
              if (roll > 0.35) map[k] = 3; // hill shoulder around mountain
            }
          }
        }
      }
    }

    // Two passes of cellular automata to smooth jagged terrain
    for (let pass = 0; pass < 2; pass++) {
      const snap = {...map};
      for (let q = 0; q < ms; q++) {
        for (let r = 0; r < ms; r++) {
          const t = snap[`${q},${r}`];
          if (t === 2 || t === 3) continue; // keep high terrain
          const landN = NEIGHBORS.filter(([dq,dr]) => {
            const k = `${q+dq},${r+dr}`;
            return snap[k] !== undefined && snap[k] !== 5;
          }).length;
          // Isolated ocean specks surrounded by land → fill in
          if (t === 5 && landN >= 5) map[`${q},${r}`] = 0;
          // Isolated land surrounded by ocean → submerge
          if (t !== 5 && landN <= 1) map[`${q},${r}`] = 5;
        }
      }
    }

    // Mark shallow water (ocean hex adjacent to land) and coastal sand
    const snap2 = {...map};
    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        const t = snap2[`${q},${r}`];
        const adjTypes = NEIGHBORS.map(([dq,dr]) => snap2[`${q+dq},${r+dr}`]);
        if (t === 5) {
          // Ocean next to land → shallow water
          if (adjTypes.some(n => n !== undefined && n !== 5 && n !== 4))
            map[`${q},${r}`] = 4;
        } else if (t === 0 || t === 7) {
          // Flat land next to water → sand (beach)
          if (adjTypes.some(n => n === 5 || n === 4))
            map[`${q},${r}`] = 6;
        }
      }
    }

    // Global map-ocean ring: all procedural maps except landlocked get an ocean border.
    if (landProfile !== 'landlocked') {
      // Target 6-hex ocean frame, but clamp on small maps to preserve playable interior.
      const ring = Math.min(6, Math.max(3, Math.floor(ms * 0.2))); // e.g., 25->5, 35->6
      for (let q = 0; q < ms; q++) {
        for (let r = 0; r < ms; r++) {
          if (q < ring || r < ring || q >= ms - ring || r >= ms - ring) {
            map[`${q},${r}`] = 5;
          }
        }
      }
      // inner ring as shallow to soften coast transition
      for (let q = ring; q < ms - ring; q++) {
        for (let r = ring; r < ms - ring; r++) {
          if (q === ring || r === ring || q === ms - ring - 1 || r === ms - ring - 1) {
            if (map[`${q},${r}`] !== 5) map[`${q},${r}`] = 4;
          }
        }
      }
    }
  }

  // ── Proc-gen spawn placement ──────────────────────────────────────────────
  _placeProcSpawns(seed) {
    const gs   = this.gameState;
    const ms   = this.mapSize;
    const map  = this.terrain;
    const NEIGHBORS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

    const isLand = (q, r) => {
      if (!isValid(q, r, ms)) return false;
      const t = map[`${q},${r}`];
      return t !== 4 && t !== 5; // not water
    };
    const isWalkable = (q, r) => isLand(q, r) && map[`${q},${r}`] !== 2; // not mountain
    const adjWater   = (q, r) => NEIGHBORS.some(([dq,dr]) => {
      const t = map[`${q+dq},${r+dr}`];
      return t === 4 || t === 5;
    });
    const adjLand    = (q, r) => NEIGHBORS.some(([dq,dr]) => isLand(q+dq, r+dr));

    // Connected walkable land component size cache for spawn fairness.
    const _compSizeCache = new Map();
    const _walkCompSize = (sq, sr) => {
      const seedK = `${sq},${sr}`;
      if (_compSizeCache.has(seedK)) return _compSizeCache.get(seedK);
      if (!isWalkable(sq, sr)) return 0;
      const qv = [{ q: sq, r: sr }];
      const seen = new Set();
      while (qv.length) {
        const cur = qv.pop();
        const k = `${cur.q},${cur.r}`;
        if (seen.has(k)) continue;
        if (!isWalkable(cur.q, cur.r)) continue;
        seen.add(k);
        for (const [dq, dr] of NEIGHBORS) {
          const nq = cur.q + dq, nr = cur.r + dr;
          if (!isValid(nq, nr, ms)) continue;
          const nk = `${nq},${nr}`;
          if (!seen.has(nk) && isWalkable(nq, nr)) qv.push({ q: nq, r: nr });
        }
      }
      const size = seen.size;
      for (const k of seen) _compSizeCache.set(k, size);
      _compSizeCache.set(seedK, size);
      return size;
    };

    const landProfile = this.procLandProfile || 'continent';
    const minSpawnComp = (() => {
      if (landProfile === 'continent' || landProfile === 'two_continents') return Math.max(40, Math.floor(ms * ms * 0.08));
      if (landProfile === 'landlocked') return Math.max(36, Math.floor(ms * ms * 0.07));
      return Math.max(16, Math.floor(ms * ms * 0.03));
    })();

    // Find best HQ spawn: walkable, on sufficiently large landmass, near center-row
    const findSpawn = (qMin, qMax) => {
      const centerR = Math.floor(ms / 2);
      let best = null, bestScore = -Infinity;
      for (let q = qMin; q <= qMax; q++) {
        for (let r = 1; r < ms - 1; r++) {
          if (!isWalkable(q, r)) continue;
          const compSize = _walkCompSize(q, r);
          if (compSize < minSpawnComp) continue; // reject tiny islands/peninsulas
          const walkNeighbors = NEIGHBORS.filter(([dq,dr]) => isWalkable(q+dq, r+dr)).length;
          if (walkNeighbors < 4) continue; // needs room for buildings
          const score = walkNeighbors * 10 - Math.abs(r - centerR) + Math.min(30, compSize * 0.08);
          if (score > bestScore) { bestScore = score; best = { q, r }; }
        }
      }
      return best;
    };

    let p1 = findSpawn(Math.floor(ms * 0.08), Math.floor(ms * 0.28));
    let p2 = findSpawn(Math.floor(ms * 0.72), Math.floor(ms * 0.92));



    if (!p1 || !p2) {
      // Fallback pass: pick best walkable hex on largest available component by side.
      const pickBestBySide = (qMin, qMax) => {
        let best = null, bestScore = -Infinity;
        const centerR = Math.floor(ms / 2);
        for (let q = qMin; q <= qMax; q++) {
          for (let r = 1; r < ms - 1; r++) {
            if (!isWalkable(q, r)) continue;
            const compSize = _walkCompSize(q, r);
            const walkNeighbors = NEIGHBORS.filter(([dq,dr]) => isWalkable(q+dq, r+dr)).length;
            const score = compSize * 2 + walkNeighbors * 6 - Math.abs(r - centerR);
            if (score > bestScore) { bestScore = score; best = { q, r }; }
          }
        }
        return best;
      };
      if (!p1) p1 = pickBestBySide(Math.floor(ms * 0.05), Math.floor(ms * 0.40));
      if (!p2) p2 = pickBestBySide(Math.floor(ms * 0.60), Math.floor(ms * 0.95));

      // Last-resort hard fallback: force spawn positions if terrain is too barren
      const fb1 = { q: Math.floor(ms * 0.15), r: Math.floor(ms * 0.5) };
      const fb2 = { q: Math.floor(ms * 0.85), r: Math.floor(ms * 0.5) };
      [fb1, fb2].forEach(pos => { map[`${pos.q},${pos.r}`] = 0; });
      if (!p1) { map[`${fb1.q},${fb1.r}`] = 0; Object.assign(p1 = fb1, {}); }
      if (!p2) { map[`${fb2.q},${fb2.r}`] = 0; Object.assign(p2 = fb2, {}); }
    }

    // Island profiles: prefer opposite landmasses for P1/P2 when possible.
    const islandLike = new Set(['islands','large_islands','archipelago','naval_supremacy']);
    if (p1 && p2 && islandLike.has(this.procLandProfile || 'islands')) {
      const isLandTile = (q, r) => {
        const t = map[`${q},${r}`];
        return t !== undefined && t !== 4 && t !== 5;
      };
      const compFrom = (start) => {
        const seen = new Set();
        const qv = [start];
        while (qv.length) {
          const cur = qv.pop();
          const k = `${cur.q},${cur.r}`;
          if (seen.has(k)) continue;
          seen.add(k);
          for (const [dq, dr] of NEIGHBORS) {
            const nq = cur.q + dq, nr = cur.r + dr;
            if (!isValid(nq, nr, ms) || !isLandTile(nq, nr)) continue;
            const nk = `${nq},${nr}`;
            if (!seen.has(nk)) qv.push({ q: nq, r: nr });
          }
        }
        return seen;
      };
      const c1 = compFrom(p1);
      if (c1.has(`${p2.q},${p2.r}`)) {
        // Find best alternate spawn on a different component, biased to right side.
        let alt = null, best = -1;
        for (let q = Math.floor(ms * 0.55); q < Math.floor(ms * 0.95); q++) {
          for (let r = 1; r < ms - 1; r++) {
            if (!isLandTile(q, r)) continue;
            const k = `${q},${r}`;
            if (c1.has(k)) continue;
            const score = (q / ms) * 100 + Math.abs((ms * 0.5) - r) * -0.2;
            if (score > best) { best = score; alt = { q, r }; }
          }
        }
        if (alt) p2 = alt;
      }
    }

    // Force HQ hexes and nearby hexes to walkable plains
    const clearForSpawn = (q, r) => {
      map[`${q},${r}`] = 0;
      NEIGHBORS.forEach(([dq,dr]) => { if (isValid(q+dq,r+dr,ms)) map[`${q+dq},${r+dr}`] = 0; });
    };
    clearForSpawn(p1.q, p1.r);
    clearForSpawn(p2.q, p2.r);

    // Helper: find nearest hex of a specific terrain type within radius
    const findNearby = (cq, cr, terrainSet, maxR = 6) => {
      for (let d = 1; d <= maxR; d++) {
        for (let dq = -d; dq <= d; dq++) {
          for (let dr = -d; dr <= d; dr++) {
            if (Math.abs(dq) + Math.abs(dr) + Math.abs(dq+dr) !== d * 2) continue; // hex ring
            const q2 = cq+dq, r2 = cr+dr;
            if (!isValid(q2,r2,ms)) continue;
            if (terrainSet.has(map[`${q2},${r2}`]) && !gs.buildings.find(b=>b.q===q2&&b.r===r2))
              return { q: q2, r: r2 };
          }
        }
      }
      return null;
    };
    // Find a free walkable hex near origin, not occupied
    const findFreeNear = (cq, cr, maxR = 5) => {
      for (let d = 1; d <= maxR; d++) {
        for (let dq = -d; dq <= d; dq++) {
          for (let dr = -d; dr <= d; dr++) {
            if (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr) !== d*2) continue;
            const q2=cq+dq, r2=cr+dr;
            if (!isValid(q2,r2,ms)) continue;
            if (isWalkable(q2,r2) && !gs.buildings.find(b=>b.q===q2&&b.r===r2) && !gs.units.find(u=>u.q===q2&&u.r===r2))
              return { q:q2, r:r2 };
          }
        }
      }
      return null;
    };
    const findCoastalNear = (cq, cr, maxR = 8) => {
      for (let d = 1; d <= maxR; d++) {
        for (let dq = -d; dq <= d; dq++) {
          for (let dr = -d; dr <= d; dr++) {
            if (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr) !== d*2) continue;
            const q2=cq+dq, r2=cr+dr;
            if (!isValid(q2,r2,ms)) continue;
            if (isLand(q2,r2) && adjWater(q2,r2) && !gs.buildings.find(b=>b.q===q2&&b.r===r2))
              return { q:q2, r:r2 };
          }
        }
      }
      return null;
    };

    const quickStart = !!this.procQuickStart;
    const placeSpawns = (player, hq, enemyHq) => {
      const ownSide = (q, r) => {
        if (!enemyHq) return true;
        const dOwn = Math.abs(q - hq.q) + Math.abs(r - hq.r);
        const dEnemy = Math.abs(q - enemyHq.q) + Math.abs(r - enemyHq.r);
        return dOwn <= dEnemy;
      };

      // HQ + starting dirt road under HQ
      gs.buildings.push(createBuilding('HQ', player, hq.q, hq.r));
      gs.buildings.push(createBuilding('ROAD', player, hq.q, hq.r));

      // Resource sites near HQ (always placed as resource hexes; buildings depend on quick-start)
      let ironHex = findNearby(hq.q, hq.r, new Set([2,3]), 6) || findNearby(hq.q, hq.r, new Set([0,7]), 7) || findFreeNear(hq.q, hq.r, 5);
      if (ironHex && !ownSide(ironHex.q, ironHex.r)) {
        ironHex = findNearby(hq.q, hq.r, new Set([2,3,0,7]), 8) || ironHex;
      }
      if (ironHex) {
        if (map[`${ironHex.q},${ironHex.r}`] === 5 || map[`${ironHex.q},${ironHex.r}`] === 4)
          map[`${ironHex.q},${ironHex.r}`] = 3; // ensure it's land
        gs.resourceHexes[`${ironHex.q},${ironHex.r}`] = { type: 'IRON' };
        if (quickStart) gs.buildings.push(createBuilding('MINE', player, ironHex.q, ironHex.r));
      }

      // Bonus own-side iron to avoid low-iron/opening deadlocks on ocean-heavy maps.
      let ironHex2 = null;
      for (let d = 3; d <= 10 && !ironHex2; d++) {
        for (let dq = -d; dq <= d && !ironHex2; dq++) {
          for (let dr = -d; dr <= d && !ironHex2; dr++) {
            const q2 = hq.q + dq, r2 = hq.r + dr;
            if (!isValid(q2, r2, ms) || !ownSide(q2, r2)) continue;
            if (ironHex && ironHex.q === q2 && ironHex.r === r2) continue;
            const t = map[`${q2},${r2}`];
            if (t === 4 || t === 5) continue;
            const key = `${q2},${r2}`;
            if (!gs.resourceHexes[key]) ironHex2 = { q: q2, r: r2 };
          }
        }
      }
      if (ironHex2) {
        if (map[`${ironHex2.q},${ironHex2.r}`] === 0 || map[`${ironHex2.q},${ironHex2.r}`] === 7) map[`${ironHex2.q},${ironHex2.r}`] = 3;
        gs.resourceHexes[`${ironHex2.q},${ironHex2.r}`] = { type: 'IRON' };
      }

      const oilHex = findNearby(hq.q, hq.r, new Set([0,6,7]), 5) || findFreeNear(hq.q, hq.r, 5);
      if (oilHex && !(ironHex && oilHex.q === ironHex.q && oilHex.r === ironHex.r)) {
        gs.resourceHexes[`${oilHex.q},${oilHex.r}`] = { type: 'OIL' };
        if (quickStart) gs.buildings.push(createBuilding('OIL_PUMP', player, oilHex.q, oilHex.r));
      }

      // Barracks + Naval Yard still start prebuilt for baseline playability
      const barrHex = findFreeNear(hq.q, hq.r, 3);
      if (barrHex) gs.buildings.push(createBuilding('BARRACKS', player, barrHex.q, barrHex.r));
      const coastHex = findCoastalNear(hq.q, hq.r, 10);
      if (coastHex) gs.buildings.push(createBuilding('NAVAL_YARD', player, coastHex.q, coastHex.r));

      // Farm site near HQ
      const farmHex = findNearby(hq.q, hq.r, new Set([0, 7]), 4) || findFreeNear(hq.q, hq.r, 3);
      if (farmHex) {
        map[`${farmHex.q},${farmHex.r}`] = 0; // ensure plains
        if (quickStart) gs.buildings.push(createBuilding('FARM', player, farmHex.q, farmHex.r));
      }

      // Guaranteed wood access on player's own side; Lumber Camp prebuilt only in quick start.
      let woodHex = null;
      for (let d = 2; d <= 8 && !woodHex; d++) {
        for (let dq = -d; dq <= d && !woodHex; dq++) {
          for (let dr = -d; dr <= d && !woodHex; dr++) {
            const q2 = hq.q + dq, r2 = hq.r + dr;
            if (!isValid(q2, r2, ms)) continue;
            if (!ownSide(q2, r2)) continue;
            const t = map[`${q2},${r2}`];
            if (t === 1 || t === 7) woodHex = { q: q2, r: r2 };
          }
        }
      }
      if (!woodHex) {
        // force a reachable own-side light-woods tile
        for (let d = 2; d <= 8 && !woodHex; d++) {
          for (let dq = -d; dq <= d && !woodHex; dq++) {
            for (let dr = -d; dr <= d && !woodHex; dr++) {
              const q2 = hq.q + dq, r2 = hq.r + dr;
              if (!isValid(q2, r2, ms)) continue;
              if (!ownSide(q2, r2)) continue;
              const t = map[`${q2},${r2}`];
              if (t === 4 || t === 5) continue;
              woodHex = { q: q2, r: r2 };
            }
          }
        }
      }
      if (woodHex) {
        map[`${woodHex.q},${woodHex.r}`] = (map[`${woodHex.q},${woodHex.r}`] === 1 ? 1 : 7);
        if (quickStart && !gs.buildings.find(b => b.q === woodHex.q && b.r === woodHex.r)) {
          gs.buildings.push(createBuilding('LUMBER_CAMP', player, woodHex.q, woodHex.r));
        }
      }

      // 2 engineers near HQ
      const eng1 = findFreeNear(hq.q, hq.r, 3);
      if (eng1) gs.units.push(createUnit('ENGINEER', player, eng1.q, eng1.r));
      const eng2 = findFreeNear(hq.q, hq.r, 3);
      if (eng2) gs.units.push(createUnit('ENGINEER', player, eng2.q, eng2.r));
    };

    placeSpawns(1, p1, p2);
    placeSpawns(2, p2, p1);

    // Scatter extra iron/oil resources across the map
    this._placeResources(seed);
  }

  _placeResources(seed) {
    const gs  = this.gameState;
    const ms  = this.mapSize;
    const map = this.terrain;
    const rng = this._seededRng(seed + 9999);

    // Terrain affinity per resource (preferred terrain types)
    const IRON_PREFER = new Set([2, 3]);    // mountain, hill (best)
    const IRON_OK     = new Set([0, 7]);    // plains, light woods (fallback)
    const OIL_TERRAIN = new Set([0, 6, 7]); // plains, sand, light woods

    // Scale minimum deposits to *land area* (more stable with large ocean borders)
    let landTiles = 0;
    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        const t = map[`${q},${r}`];
        if (t !== 4 && t !== 5) landTiles++;
      }
    }
    const landScale = Math.max(0.35, landTiles / (40 * 40 * 0.55)); // normalize to ~55% land baseline
    const MIN_IRON = Math.max(10, Math.round(14 * landScale));
    const MIN_OIL  = Math.max(6,  Math.round(8  * landScale));

    const free = (q, r) =>
      !gs.resourceHexes[`${q},${r}`] &&
      !gs.buildings.find(b => b.q === q && b.r === r);

    const isLandType = t => t !== 4 && t !== 5;

    // First pass: probability scatter across map
    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        if (!free(q, r)) continue;
        const t = map[`${q},${r}`];
        if (!isLandType(t)) continue;
        if (IRON_PREFER.has(t) && rng() < 0.22) {
          gs.resourceHexes[`${q},${r}`] = { type: 'IRON' };
        } else if (OIL_TERRAIN.has(t) && rng() < 0.08) {
          gs.resourceHexes[`${q},${r}`] = { type: 'OIL' };
        }
      }
    }

    // Second pass: guarantee minimums — force-place if under target
    const counts = () => {
      let iron = 0, oil = 0;
      for (const v of Object.values(gs.resourceHexes)) {
        if (v.type === 'IRON') iron++; else if (v.type === 'OIL') oil++;
      }
      return { iron, oil };
    };

    const forcePlace = (type, terrainSets, needed) => {
      if (needed <= 0) return;
      const candidates = [];
      for (let q = 0; q < ms; q++) {
        for (let r = 0; r < ms; r++) {
          if (!free(q, r)) continue;
          const t = map[`${q},${r}`];
          if (!isLandType(t)) continue;
          if (terrainSets.some(s => s.has(t))) candidates.push(`${q},${r}`);
        }
      }
      // Fisher-Yates shuffle with seeded rng
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      let placed = 0;
      for (const key of candidates) {
        if (placed >= needed) break;
        if (!gs.resourceHexes[key]) { gs.resourceHexes[key] = { type }; placed++; }
      }
    };

    const c = counts();
    forcePlace('IRON', [IRON_PREFER, IRON_OK], MIN_IRON - c.iron);
    forcePlace('OIL',  [OIL_TERRAIN],           MIN_OIL  - c.oil);

    // Third pass: side-fairness guarantee for iron (prevents one-side starvation).
    const hq1 = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === 1);
    const hq2 = gs.buildings.find(b => b.type === 'HQ' && Number(b.owner) === 2);
    if (hq1 && hq2) {
      const sideOf = (q, r) => {
        const d1 = Math.abs(q - hq1.q) + Math.abs(r - hq1.r);
        const d2 = Math.abs(q - hq2.q) + Math.abs(r - hq2.r);
        return d1 <= d2 ? 1 : 2;
      };

      const sideIronCount = (side) => {
        let n = 0;
        for (const [key, v] of Object.entries(gs.resourceHexes)) {
          if (v.type !== 'IRON') continue;
          const [qs, rs] = key.split(',');
          const q = Number(qs), r = Number(rs);
          if (sideOf(q, r) === side) n++;
        }
        return n;
      };

      const minPerSideIron = Math.max(6, Math.round(MIN_IRON * 0.4));
      for (const side of [1, 2]) {
        let need = minPerSideIron - sideIronCount(side);
        if (need <= 0) continue;

        const preferred = [];
        const fallback = [];
        for (let q = 0; q < ms; q++) {
          for (let r = 0; r < ms; r++) {
            if (sideOf(q, r) !== side) continue;
            if (!free(q, r)) continue;
            const t = map[`${q},${r}`];
            if (!isLandType(t)) continue;
            if (IRON_PREFER.has(t)) preferred.push(`${q},${r}`);
            else if (IRON_OK.has(t)) fallback.push(`${q},${r}`);
          }
        }

        const pickFrom = [preferred, fallback];
        for (const arr of pickFrom) {
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          for (const key of arr) {
            if (need <= 0) break;
            if (!gs.resourceHexes[key]) {
              gs.resourceHexes[key] = { type: 'IRON' };
              need--;
            }
          }
          if (need <= 0) break;
        }
      }
    }
  }

  _genNavalTerrain(map, ms) {
    // Start with all ocean
    for (let q = 0; q < ms; q++)
      for (let r = 0; r < ms; r++) map[`${q},${r}`] = 5; // OCEAN

    // Helper: convert offset coords (col, offsetRow) → axial (q, r)
    const offsetToAxial = (col, offsetRow) => ({ q: col, r: offsetRow - Math.floor(col / 2) });

    // setIsland: terrain-varied land core surrounded by 2 rings of shallow water
    //   dist <= 1               → grass (center of island)
    //   dist <= radius-1        → mix of grass (0) and light woods (7)
    //   dist <= radius          → sand coast
    //   dist <= radius+2        → shallow water (2-hex coastal ring)
    //   beyond                  → ocean
    const setIsland = (cq, cr, radius) => {
      const shell = radius + 2;
      for (let dq = -shell; dq <= shell; dq++) {
        for (let dr = -shell; dr <= shell; dr++) {
          const nq = cq+dq, nr = cr+dr;
          if (!isValid(nq, nr, ms)) continue;
          const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(-dq-dr)) / 2;
          if (dist <= shell) {
            let ttype;
            if (dist > radius) {
              ttype = 4; // shallow coast ring
            } else if (dist === radius) {
              ttype = 6; // sandy beach ring
            } else if (radius >= 3 && dist <= 1) {
              ttype = 0; // grass center
            } else if (radius >= 4 && dist <= radius - 2) {
              // Interior: mix grass and light woods via deterministic hash
              const h = (((nq * 1619 + nr * 31337) ^ (nq * 6791)) & 0xFFFF) / 0xFFFF;
              ttype = h < 0.45 ? 7 : 0; // 45% light woods, 55% grass
            } else {
              ttype = 6; // inner sand / beach
            }
            map[`${nq},${nr}`] = ttype;
          }
        }
      }
    };

    // Island row: centered vertically in the map
    // ms=35: RECT_H≈23, rowMin≈4 → islandRow≈15+4=19, bumped to 22 for axial validity
    const RECT_H = Math.round(ms * 0.65);
    const rowMin = Math.round(ms * 0.1);
    const islandRow = rowMin + Math.round(RECT_H * 0.5);

    // ── Main player islands ─────────────────────────────────────────────
    // P1: left, col=4, radius=5
    // P2: right, col=25, radius=5
    // Center-to-center hex dist ≈ 21; gap between shallow rings = 21-7-7 = 7 ocean hexes ✓
    const p1 = offsetToAxial(4, islandRow);
    setIsland(p1.q, p1.r, 5);

    const p2 = offsetToAxial(25, islandRow);
    setIsland(p2.q, p2.r, 5);

    // ── Neutral islands (resource targets in the channel) ───────────────
    // Small mid-channel island at center
    const mid = offsetToAxial(14, islandRow);
    setIsland(mid.q, mid.r, 2);

    // Two small islands slightly off-center row
    const smalls = [
      [Math.floor(ms*0.28), islandRow - 4, 2],
      [Math.floor(ms*0.68), islandRow + 4, 2],
      [Math.floor(ms*0.38), islandRow + 5, 1],
      [Math.floor(ms*0.60), islandRow - 5, 1],
      [ms - 4, islandRow, 3],  // far-right island (neutral late-game target)
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
