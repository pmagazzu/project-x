import Phaser from 'phaser';
import {
  hexToWorld, worldToHex, hexVertices, isValid,
  MAP_SIZE, HEX_SIZE, ISO_SQUISH, getMapBounds
} from './HexGrid.js';
import { MenuScene } from './MenuScene.js';
import { planAITurn, AI_STRATEGIES, randomStrategy, getAIKPIReport, pickAIStrategyForMap, buildAIOverviewForGame } from './AIPlayer.js';
import { getEngineerBuildOptions, ENGINEER_BUILD_CATEGORIES } from './EngineerBuildOptions.js';
import {
  createGameState, createUnit, createBuilding, unitAt, buildingAt, primaryBuildingAt, roadAt,
  canEngineerBuildAt,
  enemyAtHex, resolveAttackTargetUnit, canUnitAttackTarget, unitCanAttack, isUnitAlive,
  getReachableHexes, getAttackableHexes, getAttackRangeHexes, hexDistance, computeFog,
  findPath, findRoadPath, resolveTurn, resolveImmediateAttack, resolveEndOfTurn, checkWinner, isPlayerMilitarilyEliminated, calcIncome, queueRecruit, queueGlobalRecruit, deployReadyGlobalRecruit,
  getGlobalRecruitOptionsForVTC, getGlobalRecruitOptionsForPlayer, pickProductionAnchorBuilding, getOwnedDeployVTBuildings,
  enumerateGlobalDeployHexes, deployReadyGlobalRecruitAtHex, deployReadyVtcUnitAtHex, upgradeSettlement, canPromoteSettlement, PRODUCTION_VTC_TYPES,
  getVtcQueueSummary, MAX_VTC_TRAIN_QUEUE,
  isNavalDeployAllowed, getNavalCoastalCheckRadius, getNavalDeployRadius,
  isHQNetworkPluggedToNeutralRoads, registerDesign,
  getUnitPopCost, recalcPlayerPopulation, calcPopUsedByPlayer, getPopBreakdown, canAffordPipelinePop,
  calcUpkeep, calcRPFromLabs, computeSupply, invalidateSupplyCache, isHexInSupply, supplyPenalty, BUILDING_SUPPLY_RADIUS, VTC_SUPPLY_RADIUS, getRecruitFoodCost, getUnitSupplyRadius,
  UNIT_TYPES, PLAYER_COLORS, BUILDING_TYPES, RESOURCE_TYPES,
  MODULES, CHASSIS_BUILDINGS, getMaxDesignSlots, BASE_DESIGN_SLOTS,
  designRegistrationCost, designTrainCost, computeDesignStats, computeEffectiveTier,
  formatResourceCost, getChassisTier, getModuleResourceCost, getPlayerIndustryTier,
  canPlayerUseModule, playerHasResources, refundResources, getUnitTierIntel, inferTierFromUnit, getPlayerMaxTrainableTier,
  getUnitThreatBand, getPlayerCapital, isPlayerCapitalBuilding,
  UNIT_TIER_COLORS, MATERIAL_KEYS, MATERIAL_LABELS,
  NAVAL_UNITS, SHALLOW_UNITS, AIR_UNITS, canEnterTerrain, isStealthDetected,
  ROAD_TYPES, LOCKED_CHASSIS, hasLOS
} from './GameState.js';
import { TECH_TREE, RESEARCH_BRANCHES, prereqsMet, computeTechBonuses, getNextDesignSlotTech } from './ResearchData.js';
import {
  GAME_THEME, TERRAIN_COLORS_V2, initSpriteArt, replaceCanvasTexture,
  getUnitArtTextureKey, hasUnitSprite, placeWorldSprite, USER_UNIT_ART_FILES,
} from './GraphicsAssets.js';
import {
  COMBAT_GLYPH, TIER_COL, TIER_BG,
  getCombatIntel, analyzeCombat, buildResolveSteps,
} from './CombatUI.js';
import { renderCombatPreviewPanel, renderCombatResultPanel } from './CombatPanelUI.js';
import { getVictoryPointLeader } from './VictoryPoints.js';
import { getVtcControlStatus } from './VictoryVtcControl.js';
import { PLAYER_LABELS, VICTORY_MODES, clampPlayerCount, getPlayerIds } from './GameConfig.js';
import { pickBalancedSpawnPoints, pickBalancedVictoryZones, pickIslandSpawnPoints, MIN_ISLAND_LAND_TILES } from './SpawnBalance.js';
import { getBuildingCounterGlyph } from './BuildingCounters.js';
import {
  getVtcUpgradeMenu, getProduceCatalog, purchaseVtcUpgrade,
} from './SettlementSystem.js';
import {
  migrateGlobalQueuesToVtc, enumerateVtcDeployHexes, getVtcFacilityChips, getVtcFacilityBadgeGlyphs,
  cancelVtcQueueHead, getVtcInspectorLines, LEGACY_PRODUCTION_MAP_HIDDEN,
} from './VtcProduction.js';

// ── Constants ─────────────────────────────────────────────────────────────
const TERRAIN        = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2, HILL: 3, SHALLOW: 4, OCEAN: 5, SAND: 6 };
const TERRAIN_LABELS = ['Plains','Forest','Mountain','Hill','Shallow Water','Ocean','Sand','Light Woods'];
const TERRAIN_COLORS = TERRAIN_COLORS_V2;
const SELECTED_STROKE  = 0xffe066;
const HOVER_STROKE     = 0xddaa33; // gold hover outline
const MOVE_HIGHLIGHT   = 0x00ffcc;
const ATTACK_HIGHLIGHT = 0xff6600;
export const GAME_VERSION = 'v1.21.28';

const SETTLEMENT_TYPES = new Set(['VILLAGE', 'TOWN', 'CITY']);
const BUILD_MENU = {
  bg: 0x0c1018,
  stroke: 0x6a3a9a,
  accent: 0xaa55ee,
  accentHi: 0xdd99ff,
  tabOn: 0x4a2080,
  tabOff: 0x1a2030,
  produce: 0x2a4a6a,
  deploy: 0x553388,
  ready: 0x3a6a4a,
  queue: 0x3a4a6a,
  muted: 0x8899aa,
  gold: 0xffcc44,
};

const DEPLOY_HIGHLIGHT = 0xaa55ee;

/** HUD chrome — map zoom anchors to the playfield between these insets. */
const PLAYFIELD_UI = { top: 74, bottom: 132, left: 136 };
const ECON_BUILDINGS = new Set(['FARM','MINE','OIL_PUMP','LUMBER_CAMP','MARKET','PORT']);

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
    for (const [key, file] of Object.entries(USER_UNIT_ART_FILES)) {
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
    initSpriteArt(this);
    // Ensure terrain art assets exist even if Phaser skipped/short-circuited scene preload.
    const _terrainAssetDefs = [
      ...Object.entries(TERRAIN_ART_FILES).map(([key, path]) => ({ key, path })),
      ...SAND_VARIANT_FILES,
      ...GRASS_VARIANT_FILES,
      ...FOREST_VARIANT_FILES,
      ...OCEAN_VARIANT_FILES,
      ...SHALLOW_VARIANT_FILES,
      ...LIGHTWOODS_VARIANT_FILES,
      ...MOUNTAIN_VARIANT_FILES,
      ...HILL_VARIANT_FILES,
      ...FARM_VARIANT_FILES,
    ];
    const _missingTerrainArt = _terrainAssetDefs.filter(({ key }) => !this.textures.exists(key));
    if (_missingTerrainArt.length) {
      console.warn('Terrain art missing at GameScene.create(), loading on demand', _missingTerrainArt.slice(0, 8).map(x => x.key));
      this.load.reset();
      for (const { key, path } of _missingTerrainArt) this.load.image(key, path);
      this.load.once('complete', () => {
        this._drawStaticLayers();
        this._refresh();
      });
      this.load.start();
    }
    // Read scenario config passed from MenuScene (or default)
    const data = this.scene.settings.data || {};
    this.scenario = data.scenario || 'default';
    this.procLandProfile = data.procLandProfile || 'continent';
    this.procQuickStart  = (data.procQuickStart !== undefined) ? !!data.procQuickStart : true;
    this.debugNoFog      = data.debugNoFog !== undefined
      ? !!data.debugNoFog
      : (this.scenario === 'mortar_test' || this.scenario === 'coastal_battery_test' || (this.procLandProfile === 'two_continents'));
    this.supplyEnabled   = data.supplyEnabled !== undefined ? !!data.supplyEnabled : true;
    this.combatLineGap   = data.combatLineGap ?? 10;
    this._mapBuilderMode = !!data.mapBuilder;
    this._aiViewerMode = !!(data.aiViewerMode || data.spectatorMode);
    this._aiSimSpeed = Math.max(1, Number(data.aiSimSpeed) || 1); // 1=normal,2=fast,4=turbo
    this._aiAutoplayPaused = false;
    this._aiTurnInProgress = false;
    this._aiLastProgressAt = Date.now();
    this._aiTurnId = 0;
    this._aiPendingSteps = [];
    this._aiActiveFinishTurn = null;
    this._aiActiveTurnPlayer = null;
    this._autoStopTurn = Number(data.autoStopTurn) || 0;
    this._aiLabExport = !!data.aiLabExport;
    this._startSupplyTruck = !!data.startSupplyTruck;
    this._aiLabTurns = [];
    this._runHistory = [];
    this._aiLastPlans = {};
    this._maxRunHistoryTurns = 60;
    this._lastSnapshotGameTurn = -1;
    if (this._mapBuilderMode) this.debugNoFog = true;
    this._customMapData = data.customMap || null;
    // Map sizes per scenario
    const MAP_SIZES = { scout: 25, naval: 35, combat: 20, combat_test: data.customSize || Math.max(28, this.combatLineGap + 26), grand: 120, ai_viewer: 360, random: 40, air_test: 20, mortar_test: 20, coastal_battery_test: 20, custom: data.customSize || 40, default: 25 };
    this.mapSize   = MAP_SIZES[this.scenario] || MAP_SIZE;
    this.playerCount = clampPlayerCount(data.playerCount || 2);
    this.humanPlayer = clampPlayerCount(data.humanPlayer || 1);
    if (this.humanPlayer > this.playerCount) this.humanPlayer = 1;
    // AI players: set of player numbers controlled by AI
    this.aiPlayers  = new Set();
    if (Array.isArray(data.aiPlayers)) {
      for (const p of data.aiPlayers) this.aiPlayers.add(Number(p));
    }
    if (data.aiP1) this.aiPlayers.add(1);
    if (data.aiP2) this.aiPlayers.add(2);
    // Legacy fallback only when launch sends no AI config at all.
    if (this.aiPlayers.size === 0 && !this._aiViewerMode
        && data.aiP1 === undefined && data.aiP2 === undefined && !Array.isArray(data.aiPlayers)) {
      for (let p = 1; p <= this.playerCount; p++) {
        if (p !== this.humanPlayer) this.aiPlayers.add(p);
      }
    }
    // Skirmish only: opponentAiEnabled is authoritative (avoids aiP2-default bug when playing as P2).
    if (data.opponentAiEnabled === true && !this._aiViewerMode) {
      this.aiPlayers.clear();
      for (let p = 1; p <= this.playerCount; p++) {
        if (Number(p) !== Number(this.humanPlayer)) this.aiPlayers.add(p);
      }
    }
    // Spectator / AI-vs-AI: every seat is AI regardless of humanPlayer launch default.
    if (this._aiViewerMode) {
      this.aiPlayers.clear();
      for (let p = 1; p <= this.playerCount; p++) this.aiPlayers.add(p);
    } else {
      this.aiPlayers.delete(this.humanPlayer);
    }
    // AI strategy — map-aware default per AI slot
    this.aiStrategy = data.aiStrategy || pickAIStrategyForMap(null, this.mapSize);
    this.aiStrategies = data.aiStrategies ? { ...data.aiStrategies } : {};
    // Random/custom maps: mixed seed so endless runs don't feel like clones
    if (this.scenario === 'random' || this.scenario === 'custom') {
      const t = Date.now() >>> 0;
      const r = (Math.random() * 0x100000000) >>> 0;
      this.mapSeed = (t ^ r ^ ((t << 13) | (t >>> 19))) >>> 0;
    } else {
      this.mapSeed = 0;
    }

    this.gameState = createGameState(this.scenario, {
      combatLineGap: this.combatLineGap,
      mapSize: this.mapSize,
      supplyEnabled: this.supplyEnabled,
      playerCount: this.playerCount,
      victoryMode: data.victoryMode || VICTORY_MODES.VTC_CONTROL,
      victoryPointTarget: data.victoryPointTarget || 100,
      vtcPopScale: data.vtcPopScale ?? 1,
    });
    migrateGlobalQueuesToVtc(this.gameState);
    this.gameState._techTree = TECH_TREE; // inject for resolveEndOfTurn research tick
    this.gameState._aiPlayers = [...this.aiPlayers];
    this.terrain   = this._generateTerrain();
    this.gameState._terrain = this.terrain;
    for (const p of this.aiPlayers) {
      if (!this.aiStrategies[p]) {
        this.aiStrategies[p] = data.aiStrategy
          ? data.aiStrategy
          : pickAIStrategyForMap(this.terrain, this.mapSize);
      }
    }
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
    this._deployMode = null; // { readyId } — click highlighted hex to deploy
    this._deployHexes = []; // { q, r, buildingId }[] valid deploy tiles
    this._buildMenuOpen = true;
    this._buildMenuTab = 'produce'; // produce | deploy | struct
    this._buildMenuFocusBuilding = null;
    this._buildMenuStructPage = 0;
    this._engineerBuildCategory = 'roads';

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
    this._supplyOverlayOn = false; // toggled by [L] or SUP button (not S — WASD pan)
    this.highlightGfx = this.add.graphics().setDepth(10);
    this.victoryZoneGfx = this.add.graphics().setDepth(11);
    this.farmTileLayer = this.add.layer().setDepth(14);
    this.buildingGfx  = this.add.graphics().setDepth(16);
    this.buildingSpriteLayer = this.add.layer().setDepth(17); // labels above buildingGfx
    this.unitSpriteLayer = this.add.layer().setDepth(19);
    this.unitGfx      = this.add.graphics().setDepth(20);
    // Fog: RenderTexture instead of Graphics — handles large maps (120×120+) without vertex overflow
    this.fogRT = this.add.renderTexture(0, 0, rtW, rtH)
      .setOrigin(0, 0).setPosition(bounds.minX - padding, bounds.minY - padding).setDepth(30);

    this._log = [];
    this._combatHistory = [];
    this._combatLogOpen = false;
    this._combatLogScroll = 0;
    this._combatLogSelected = -1;

    // UI Layer — all HUD/panel objects go here
    this._uiLayer = this.add.layer().setDepth(99);

    // Build static UI panels
    this._createTopBar();
    this._initCommandDockRows();
    this._layoutCommandDock(this.scale.height);
    this._createBottomPanel();
    this._createRecruitPanel();
    if (this._aiViewerMode && this._isSpectatorDuel()) {
      const labelFor = (s) => s >= 4 ? 'TURBO' : (s >= 2 ? 'FAST' : 'NORMAL');
      this._aiSpeedBtn = this.add.text(this.scale.width - 12, 54, `[AI SPEED: ${labelFor(this._aiSimSpeed)}]`, {
        font: 'bold 11px monospace', fill: '#88ffcc', backgroundColor: '#102018', padding: { x: 8, y: 5 }
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(210).setInteractive({ useHandCursor: true });
      this._aiSpeedBtn.on('pointerdown', () => {
        this._aiSimSpeed = this._aiSimSpeed >= 4 ? 1 : (this._aiSimSpeed >= 2 ? 4 : 2);
        this._aiSpeedBtn.setText(`[AI SPEED: ${labelFor(this._aiSimSpeed)}]`);
      });
      this._addToUI([this._aiSpeedBtn]);
    }

    // Move all scroll-factor-0 objects created so far into _uiLayer
    // (catches top bar, bottom panel, buttons, etc. without touching each line)
    const worldObjs = new Set([
      this.terrainGfx, this.terrainArtLayer, this.mountainPeakLayer, this.terrainArtRT, this.terrainRT,
      this.roadGfx, this.supplyGfx,
      this.highlightGfx, this.victoryZoneGfx, this.farmTileLayer, this.buildingSpriteLayer, this.buildingGfx,
      this.unitSpriteLayer, this.unitGfx, this.fogRT, this._uiLayer
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
    cam.roundPixels = true;

    // Fixed UI camera — zoom=1, no scroll, ignores all world graphics
    const sw = this.scale.width, sh = this.scale.height;
    this.uiCamera = this.cameras.add(0, 0, sw, sh).setName('ui').setScroll(0, 0).setZoom(1);
    this.uiCamera.transparent = true; // transparent background — must not cover world
    this.uiCamera.roundPixels = true;
    this.uiCamera.ignore([
      this.terrainGfx, this.terrainArtLayer, this.mountainPeakLayer, this.terrainArtRT, this.terrainRT,
      this.roadGfx, this.supplyGfx,
      this.highlightGfx, this.victoryZoneGfx, this.farmTileLayer, this.buildingSpriteLayer, this.buildingGfx,
      this.unitSpriteLayer, this.unitGfx, this.fogRT,
    ]);
    this.scale.on('resize', (gs) => this._onResize(gs));

    // For random/custom maps: place spawns + resources after terrain is generated unless builder/custom-map overrides.
    if (this._customMapData) {
      this._applyCustomMapData(this._customMapData);
      const hasCoreState = (this.gameState.units?.length || 0) > 0 || (this.gameState.buildings?.length || 0) > 0;
      if (!hasCoreState && !this._mapBuilderMode) this._placeProcSpawns(this.mapSeed);
    } else if (!this._mapBuilderMode && (this.scenario === 'random' || this.scenario === 'custom')) {
      this._placeProcSpawns(this.mapSeed);
    }

    // Skirmish/custom maps spawn HQs on map edges — snap to the human HQ so turn 1 isn't an empty viewport.
    // AI-vs-AI spectator: keep the map-centered camera; player pans freely.
    if (!this._mapBuilderMode && !this._aiViewerMode
        && (this.scenario === 'random' || this.scenario === 'custom')) {
      const focusP = this.humanPlayer || this.gameState.currentPlayer || 1;
      this._focusPlayerHQ(focusP, false);
    }

    this._setupInput();
    if (this._mapBuilderMode) this._initMapBuilder();
    this._drawStaticLayers();
    this._freezeFog(); // lock fog for P1's first planning phase
    this._refresh();
    if (this.aiPlayers.size > 0) {
      this._pushLog(`AI control: P${[...this.aiPlayers].sort((a, b) => a - b).join(', P')}`);
    }
    // Rebuild terrain art once more after initial refresh so generated maps and overlays settle
    // before the final visible terrain layer is attached.
    this._drawStaticLayers();
    this._refresh();


    // Auto-start if current player is AI (supports AI vs AI autoplay starts)
    if (this._isAiControlled(this.gameState.currentPlayer)) {
      this.time.delayedCall(120, () => {
        if (!this._aiAutoplayPaused && this._isAiControlled(this.gameState.currentPlayer)) this._runAITurn();
      });
    }
  }

  _applyCustomMapData(mapData) {
    if (!mapData) return;
    if (Number(mapData.mapSize) && Number(mapData.mapSize) === Number(this.mapSize)) {
      if (mapData.terrain && typeof mapData.terrain === 'object') this.terrain = { ...mapData.terrain };
      if (mapData.resourceHexes && typeof mapData.resourceHexes === 'object') this.gameState.resourceHexes = { ...mapData.resourceHexes };
      if (Array.isArray(mapData.buildings)) this.gameState.buildings = mapData.buildings.map(b => ({ ...b }));
      if (Array.isArray(mapData.units)) this.gameState.units = mapData.units.map(u => ({ ...u }));
    }
  }

  _initMapBuilder() {
    // Builder canvas starts as pure ocean so creators can sculpt from blank water.
    this.gameState.units = [];
    this.gameState.buildings = [];
    this.gameState.resourceHexes = {};
    for (let q = 0; q < this.mapSize; q++) {
      for (let r = 0; r < this.mapSize; r++) {
        if (!isValid(q, r, this.mapSize)) continue;
        this.terrain[`${q},${r}`] = 5; // OCEAN
      }
    }

    this._builder = {
      mode: 'terrain',
      terrainType: 2, // default to mountain so first paint is visibly obvious
      resourceTypes: ['IRON','OIL'],
      resourceIdx: 0,
      resourceType: 'IRON',
      owner: 1,
      buildingTypes: ['HQ','BARRACKS','NAVAL_YARD','AIRFIELD','MINE','OIL_PUMP','ROAD'],
      unitTypes: ['ENGINEER','INFANTRY','RECON','MORTAR','TANK','PATROL_BOAT','SUPPLY_TRUCK','SUPPLY_SHIP'],
      buildingIdx: 0,
      unitIdx: 0,
      hud: null,
      banner: null,
      lastPaintKey: null,
      history: [],
      future: [],
    };
    this._builder.banner = this.add.text(this.scale.width / 2, 18, 'MAP BUILDER ACTIVE', {
      font: 'bold 14px monospace', fill: '#99ff99', backgroundColor: '#102810', padding: { x: 10, y: 6 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(260);
    this._builder.hud = this.add.text(10, 46, '', {
      font: '11px monospace', fill: '#cfe8cf', backgroundColor: '#0d1a0d', padding: { x: 8, y: 6 }
    }).setScrollFactor(0).setDepth(250);
    this._addToUI([this._builder.hud, this._builder.banner]);
    this._pushLog('Map Builder: click/drag to paint. T terrain, R resource, B building, U unit, X erase. Q/E owner. [ ] cycle type. Z undo, Y redo, V validate, O export, I import, P playtest.');
    this._updateBuilderHud();
  }

  _updateBuilderHud() {
    if (!this._mapBuilderMode || !this._builder?.hud) return;
    const mode = this._builder.mode;
    const tName = TERRAIN_LABELS[this._builder.terrainType] || 'Plains';
    const rName = this._builder.resourceType;
    const bType = this._builder.buildingTypes[this._builder.buildingIdx];
    const uType = this._builder.unitTypes[this._builder.unitIdx];
    this._builder.hud.setText(
      `MAP BUILDER (PHASE C)\n` +
      `Mode:${mode.toUpperCase()} Owner:P${this._builder.owner} Terrain:${tName} Resource:${rName} Building:${bType} Unit:${uType}\n` +
      `Keys: T/R/B/U · X erase · Q/E owner · [ ] cycle B/U/R · 1-8 terrain · Z undo · Y redo · V validate · I/O · P playtest`
    );
  }

  _builderSnapshot() {
    return {
      terrain: { ...this.terrain },
      resourceHexes: { ...this.gameState.resourceHexes },
      buildings: this.gameState.buildings.map(b => ({ ...b })),
      units: this.gameState.units.map(u => ({ ...u })),
    };
  }

  _builderPushHistory() {
    if (!this._builder) return;
    this._builder.history.push(this._builderSnapshot());
    if (this._builder.history.length > 120) this._builder.history.shift();
    this._builder.future = [];
  }

  _builderApplySnapshot(snap) {
    if (!snap) return;
    this.terrain = { ...snap.terrain };
    this.gameState.resourceHexes = { ...snap.resourceHexes };
    this.gameState.buildings = snap.buildings.map(b => ({ ...b }));
    this.gameState.units = snap.units.map(u => ({ ...u }));
    this._drawStaticLayers();
    this._refresh();
  }

  _builderPaint(q, r) {
    const key = `${q},${r}`;
    if (!isValid(q, r, this.mapSize)) return;
    if (this._builder.lastPaintKey === `${this._builder.mode}:${key}`) return;
    this._builder.lastPaintKey = `${this._builder.mode}:${key}`;
    this._builderPushHistory();
    if (this._builder.mode === 'terrain') {
      this.terrain[key] = this._builder.terrainType;
      delete this.gameState.resourceHexes[key];
    } else if (this._builder.mode === 'resource') {
      this.gameState.resourceHexes[key] = { type: this._builder.resourceType };
    } else if (this._builder.mode === 'building') {
      const bType = this._builder.buildingTypes[this._builder.buildingIdx];
      this.gameState.buildings = this.gameState.buildings.filter(b => !(b.q === q && b.r === r));
      this.gameState.buildings.push(createBuilding(bType, this._builder.owner, q, r));
    } else if (this._builder.mode === 'unit') {
      const uType = this._builder.unitTypes[this._builder.unitIdx];
      this.gameState.units = this.gameState.units.filter(u => !(u.q === q && u.r === r));
      this.gameState.units.push(createUnit(uType, this._builder.owner, q, r));
    } else if (this._builder.mode === 'erase') {
      delete this.gameState.resourceHexes[key];
      this.gameState.buildings = this.gameState.buildings.filter(b => !(b.q === q && b.r === r));
      this.gameState.units = this.gameState.units.filter(u => !(u.q === q && u.r === r));
    }
    this._drawStaticLayers();
    this._refresh();
  }

  _exportCustomMapJson() {
    const payload = {
      mapSize: this.mapSize,
      terrain: this.terrain,
      resourceHexes: this.gameState.resourceHexes,
      buildings: this.gameState.buildings,
      units: this.gameState.units,
    };
    return JSON.stringify(payload);
  }

  _importCustomMapJson(raw) {
    try {
      const data = JSON.parse(raw);
      this._applyCustomMapData(data);
      this._drawStaticLayers();
      this._refresh();
      this._pushLog('Map JSON imported.');
    } catch (e) {
      this._pushLog(`Import failed: ${e?.message || e}`);
    }
  }

  _validateBuilderMap() {
    const pc = this.playerCount || this.gameState.playerCount || 2;
    for (let p = 1; p <= pc; p++) {
      const hasCap = this.gameState.buildings.some(b =>
        Number(b.owner) === p && (b.type === 'HQ' || (b.type === 'VILLAGE' && b.isCapital)));
      if (!hasCap) return { ok: false, reason: `Map needs capital (HQ or home village) for P${p}.` };
    }

    for (const u of this.gameState.units) {
      const tt = this.terrain?.[`${u.q},${u.r}`] ?? 0;
      if (!canEnterTerrain(u.type, tt)) {
        return { ok: false, reason: `${UNIT_TYPES[u.type]?.name || u.type} at (${u.q},${u.r}) is on invalid terrain.` };
      }
    }

    const p1Res = this.gameState.resourceHexes ? Object.keys(this.gameState.resourceHexes).filter(k => {
      const [q, r] = k.split(',').map(Number);
      const hq = getPlayerCapital(this.gameState, 1);
      return hq ? hexDistance(hq.q, hq.r, q, r) <= 10 : false;
    }).length : 0;
    const p2Res = this.gameState.resourceHexes ? Object.keys(this.gameState.resourceHexes).filter(k => {
      const [q, r] = k.split(',').map(Number);
      const hq = getPlayerCapital(this.gameState, 2);
      return hq ? hexDistance(hq.q, hq.r, q, r) <= 10 : false;
    }).length : 0;
    if (Math.abs(p1Res - p2Res) > 3) {
      return { ok: false, reason: `Resource fairness warning too high near HQs (P1:${p1Res}, P2:${p2Res}).` };
    }

    return { ok: true };
  }

  _toggleSpectatorStats() {
    if (this._specStatsObjs) {
      this._specStatsObjs.forEach(o => { try { o.destroy(); } catch(e){} });
      this._specStatsObjs = null;
      return;
    }
    const w = this.scale.width;
    const bg = this.add.rectangle(w - 230, 178, 460, 200, 0x0b1118, 0.94).setScrollFactor(0).setDepth(210).setStrokeStyle(1, 0x335577);
    const txt = this.add.text(w - 450, 86, '', { font: '11px monospace', fill: '#cfe0ff' }).setScrollFactor(0).setDepth(211);
    this._specStatsObjs = [bg, txt];
    this._specStatsText = txt;
    this._updateSpectatorStats();
  }

  _updateSpectatorStats() {
    if (!this._specStatsText) return;
    const gs = this.gameState;
    const pLine = (p) => {
      const pl = gs.players?.[p] || {};
      const inc = calcIncome(gs, p);
      const upk = calcUpkeep(gs, p);
      const units = gs.units.filter(u => Number(u.owner) === p && !u.embarked);
      const combat = units.filter(u => {
        const d = UNIT_TYPES[u.type] || {};
        return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
      }).length;
      const eng = units.filter(u => u.type === 'ENGINEER').length;
      const uns = units.filter(u => (u.outOfSupply || 0) > 0).length;
      const roads = gs.buildings.filter(b => Number(b.owner) === p && b.type === 'ROAD').length;
      const roadsVisible = gs.buildings.filter(b => Number(b.owner) === p && b.type === 'ROAD')
        .filter(r => !gs.buildings.some(b => Number(b.owner) === p && !ROAD_TYPES.has(b.type) && b.q === r.q && b.r === r.r)).length;
      const telem = this._aiTelemetry?.[p] || { roadsPlanned: 0, roadsAttempted: 0, roadsSucceeded: 0, blocked: {} };
      const mines = gs.buildings.filter(b => Number(b.owner) === p && b.type === 'MINE').length;
      const oils = gs.buildings.filter(b => Number(b.owner) === p && b.type === 'OIL_PUMP').length;
      const farms = gs.buildings.filter(b => Number(b.owner) === p && b.type === 'FARM').length;
      const netIron = (inc.iron - upk.iron).toFixed(1);
      const netOil = (inc.oil - upk.oil).toFixed(1);
      const netFood = ((inc.food || 0) - (upk.food || 0)).toFixed(1);
      return `P${p}  Rsrc ⚙${Math.floor(pl.iron||0)} 🛢${Math.floor(pl.oil||0)} 🪵${Math.floor(pl.wood||0)} 🍞${Math.floor(pl.food||0)}\n` +
             `    Net  ⚙${netIron} 🛢${netOil} 🍞${netFood} | Units ${units.length} (combat ${combat}, eng ${eng}, uns ${uns})\n` +
             `    Infra roads ${roads} (corridor ${roadsVisible}) mine ${mines} oil ${oils} farm ${farms}\n` +
             `    RoadDbg def ${telem.roadDeficit||0} plan ${telem.roadsPlanned||0} try ${telem.roadsAttempted||0} ok ${telem.roadsSucceeded||0} blkOcc ${telem.blocked?.occupied||0} blkWood ${telem.blocked?.noWood||0} why ${telem.plannerReason||'n/a'}`;
    };

    const doctrineLine = (p) => {
      const dbg = gs._aiDebug?.[p];
      const m = dbg?.missions || {};
      const parts = Object.entries(m).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`);
      const phase = dbg?.logisticsEmergency ? 'LOGI!' : (dbg?.deceptionActive ? 'DECOY' : 'steady');
      const lane = dbg?.primaryLane ? ` lane ${dbg.primaryLane}` : '';
      return `    AI ${phase}${lane} | missions ${parts.length ? parts.join(' ') : '—'}`;
    };

    const paused = this._aiAutoplayPaused ? 'PAUSED' : 'RUNNING';
    this._specStatsText.setText(
      `AI VS AI DEBUG  |  Turn ${gs.turn}  |  Current P${gs.currentPlayer}  |  ${paused}\n` +
      `${pLine(1)}\n${doctrineLine(1)}\n\n${pLine(2)}\n${doctrineLine(2)}`
    );
  }

  _onResize(gs) {
    const w = gs.width, h = gs.height;
    this.uiCamera?.setSize(w, h);

    // Top bar relayout
    this.topBarBg?.setPosition(w/2, 37).setSize(w, 74);
    this.topBarDivider?.setPosition(w/2, 37).setSize(w, 1);
    this.topBarAccent?.setPosition(w/2, 74).setSize(w, 1);
    this.turnLbl?.setPosition(w/2, 8);
    this.versionTag?.setPosition(w - 110, 8);
    this.btnPauseAI?.setPosition(w - 610, 8);
    this.btnStatsAI?.setPosition(w - 700, 8);
    this.btnSupply?.setPosition(w - 420, 42);
    this.btnResearch?.setPosition(w - 334, 42);
    this.btnMore?.setPosition(w - 248, 42);
    this.btnSettings?.setPosition(w - 162, 42);
    this.btnMenu?.setPosition(10, 8).setDepth(130);
    this._layoutCommandDock(h);
    this.btnSubmit?.setPosition(w - 8, 42);
    this.turnBadge?.setPosition(w - 8, 8);

    this._layoutInspectorChrome();
    this._updateBottomPanel();

    if (this._specStatsObjs?.length) {
      this._specStatsObjs[0]?.setPosition(w - 230, 164);
      this._specStatsText?.setPosition(w - 450, 86);
    }

    // Rebuild open research panel to fit new width/height.
    if (this._researchOpen) {
      this._closeResearch();
      this._toggleResearch();
    }
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

    replaceCanvasTexture(this, '_terrain_base_baked', canvas);

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
    ctx.imageSmoothingEnabled = false;
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
        ctx.drawImage(srcImg, Math.round(dx), Math.round(dy), Math.round(artW), Math.round(artH));

        // Pixel-art terrain treatments per tile type for stronger tactical readability.
        if (ttype === 0) {
          // plains: light pixel grain
          ctx.fillStyle = 'rgba(255,255,255,0.09)';
          for (let i = 0; i < 18; i++) {
            const px = Math.round(vx - hw + ((_varHash + i * 17) % Math.round(artW)));
            const py = Math.round(vy - hh + (((_varHash >> 3) + i * 29) % Math.round(artH)));
            ctx.fillRect(px, py, 2, 2);
          }
        } else if (ttype === 3) {
          // hills: contour-like horizontal bands to clearly separate from plains
          ctx.fillStyle = 'rgba(60,38,18,0.16)';
          for (let i = 0; i < 4; i++) {
            const bandY = Math.round(vy - hh * 0.45 + i * hh * 0.30);
            ctx.fillRect(Math.round(vx - hw * 0.55), bandY, Math.round(hw * 1.1), 2);
          }
          ctx.fillStyle = 'rgba(255,230,180,0.08)';
          for (let i = 0; i < 3; i++) {
            const bandY = Math.round(vy - hh * 0.32 + i * hh * 0.30);
            ctx.fillRect(Math.round(vx - hw * 0.40), bandY, Math.round(hw * 0.8), 1);
          }
        } else if (ttype === 6) {
          // sand: warm dither speckle
          ctx.fillStyle = 'rgba(255,245,210,0.10)';
          for (let i = 0; i < 16; i++) {
            const px = Math.round(vx - hw + ((_varHash + i * 23) % Math.round(artW)));
            const py = Math.round(vy - hh + (((_varHash >> 4) + i * 13) % Math.round(artH)));
            ctx.fillRect(px, py, 2, 2);
          }
        } else if (ttype === 5) {
          // deep water: blocky wave bands
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          for (let i = 0; i < 3; i++) {
            const waveY = Math.round(vy - hh * 0.30 + i * hh * 0.32);
            ctx.fillRect(Math.round(vx - hw * 0.60), waveY, Math.round(hw * 1.20), 2);
          }
        } else if (ttype === 4) {
          // shallow water: brighter shoreline shimmer
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          for (let i = 0; i < 2; i++) {
            const waveY = Math.round(vy - hh * 0.18 + i * hh * 0.28);
            ctx.fillRect(Math.round(vx - hw * 0.52), waveY, Math.round(hw * 1.04), 2);
          }
        } else if (ttype === 1 || ttype === 7) {
          // woods: chunky canopy clusters
          ctx.fillStyle = 'rgba(18,48,18,0.18)';
          for (let i = 0; i < 8; i++) {
            const px = Math.round(vx - hw * 0.55 + ((_varHash + i * 31) % Math.round(hw * 1.1)));
            const py = Math.round(vy - hh * 0.48 + (((_varHash >> 5) + i * 19) % Math.round(hh * 0.96)));
            ctx.fillRect(px, py, 4, 3);
          }
        }

        // crisp terrain border for readability
        ctx.strokeStyle = ttype === 5 ? 'rgba(200,220,255,0.18)' : 'rgba(0,0,0,0.20)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
        ctx.globalAlpha = 0.92;
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

    replaceCanvasTexture(this, '_mountain_peaks_baked', canvas);

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
    } else if (type === 'WOOD') {
      // Stacked log silhouettes — brown rounds across tile
      for (const [ox, oy, rw, rh] of [[-8,3,7,4],[2,5,6,3.5],[8,-2,5.5,3],[-3,-6,5,3],[5,6,4.5,2.5]]) {
        gfx.fillStyle(0x5a3010, 0.8);
        gfx.fillEllipse(cx+ox, cy+oy, rw*2, rh*2);
        gfx.fillStyle(0x7a4a22, 0.5);
        gfx.fillEllipse(cx+ox, cy+oy-rh*0.3, rw*1.6, rh);
      }
    }
  }

  // ── Static layers (resources, roads) ─────────────────────────────────────
  _drawStaticLayers() {
    this._drawTerrainDirect();
    this._redrawRoads();
    this._drawVictoryZones();
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
    const showAllRoads = !!this.debugNoFog;
    for (const b of gs.buildings) {
      if (ROAD_TYPES.has(b.type)) {
        const key = `${b.q},${b.r}`;
        const isOwn = Number(b.owner) === curP;
        const isNeutralInfra = Number(b.owner) === 0;
        if (!showAllRoads && !isOwn && !isNeutralInfra && !discovered.has(key)) continue;
        const tier = BUILDING_TYPES[b.type]?.roadTier ?? 0;
        roadMap.set(key, { tier, b });
      }
    }

    // Road tier styling
    const TIER_STYLE = [
      { color: 0xb89a6a, width: 3, alpha: 0.85 },  // 0: dirt
      { color: 0x998877, width: 3, alpha: 0.88 },  // 1: gravel
      { color: 0xaaaaaa, width: 4, alpha: 0.90 },  // 2: concrete
      { color: 0x555566, width: 5, alpha: 0.95 },  // 3: railway
    ];

    // Seeded jitter helper (deterministic per hex pair so it's stable)
    const jitter = (q, r, nq, nr, t) => {
      const seed = ((q * 1619 + r * 31337 + nq * 7919 + nr * 4001) & 0xFFFFF);
      const rng  = ((seed ^ (seed >> 5)) * 0x9e3779b9) & 0xFFFFF;
      return (((rng >> 3) & 0xFF) / 255 - 0.5) * 6 * (1 - t); // max ±3px, zero at endpoints
    };

    const cullRoadDraw = roadMap.size > 500 || this.mapSize >= 90;
    const vp = cullRoadDraw ? this._vpBounds(HEX_SIZE * 6) : null;

    // Draw road segments — each edge drawn from both hexes, deduplicate by only drawing q<=nq
    for (const [key, { tier }] of roadMap) {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToWorld(q, r);
      if (vp && (x < vp.L || x > vp.R || y < vp.T || y > vp.B)) continue;
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
        if (drawTier === 3) {
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

  _invalidateSupplyCache() {
    invalidateSupplyCache(this.gameState);
    this._supplyCache = null;
    this._supplyCacheKey = null;
  }

  /** AI turn: avoid full map redraw every move/attack (major late-game perf win). */
  _aiRefreshUnitsOnly() {
    this._redrawUnits();
    this._updateTopBar();
  }

  _aiRefreshAfterBuild(roadPlaced = false) {
    this._invalidateSupplyCache();
    if (roadPlaced) this._roadsDirty = true;
    else {
      this._redrawBuildings();
    }
    this._redrawUnits();
  }

  _getCachedSupply(player) {
    const gs = this.gameState;
    const key = `${gs.turn}|${gs.buildings.length}|${gs.units.length}`;
    if (this._supplyCacheKey !== key) {
      this._supplyCacheKey = key;
      this._supplyCache = {};
    }
    const p = Number(player);
    if (!this._supplyCache[p]) {
      this._supplyCache[p] = computeSupply(gs, p, this.mapSize);
    }
    return this._supplyCache[p];
  }

  _stopCameraMotion() {
    const cam = this.cameras.main;
    if (!cam) return;
    cam.stopFollow();
    this.tweens.killTweensOf(cam);
    if (typeof cam.resetFX === 'function') cam.resetFX();
  }

  _snapshotSpectatorCamera() {
    if (!this._aiViewerMode) return null;
    this._stopCameraMotion();
    const cam = this.cameras.main;
    if (!cam) return null;
    return { scrollX: cam.scrollX, scrollY: cam.scrollY, zoom: cam.zoom };
  }

  _restoreSpectatorCamera(snap) {
    if (!snap || !this._aiViewerMode) return;
    this._stopCameraMotion();
    const cam = this.cameras.main;
    if (!cam) return;
    cam.setScroll(snap.scrollX, snap.scrollY);
    cam.setZoom(snap.zoom);
  }

  // ── Full refresh ──────────────────────────────────────────────────────────
  _refresh(opts = {}) {
    const camSnap = this._snapshotSpectatorCamera();
    if (opts.light) {
      this._updateTopBar();
      this._updateBottomPanel();
      this._restoreSpectatorCamera(camSnap);
      return;
    }
    if (opts.invalidateSupply) this._invalidateSupplyCache();
    // Normalize currentPlayer defensively (prevents '2' string vs 2 number bugs across visibility logic)
    this.gameState.currentPlayer = Number(this.gameState.currentPlayer) || 1;
    this.gameState._terrain = this.terrain;
    // Recompute fog based on current unit positions (own units may have moved during planning).
    // We-go integrity is maintained by _origQ/_origR on enemy units — enemy display positions
    // are locked to turn-start regardless of fog recomputation.
    if (this.debugNoFog) {
      this._currentFog = null;
      if (this.fogRT) this.fogRT.setVisible(false);
    } else {
      const fogSig = this._fogVisionSignature();
      if (fogSig !== this._fogCacheSig) {
        this._fogCacheSig = fogSig;
        this._currentFog = computeFog(this.gameState, this.gameState.currentPlayer, this.mapSize, this.terrain);
      }
      // Track discovered hex memory per player (used for fogged-road visibility)
      this._discovered = this._discovered || {};
      const cp = Number(this.gameState.currentPlayer) || 1;
      if (!this._discovered[cp]) this._discovered[cp] = new Set();
      for (const pid of getPlayerIds(this.gameState)) {
        if (!this._discovered[pid]) this._discovered[pid] = new Set();
      }
      const disc = this._discovered[cp];
      if (disc.size < 48000) {
        for (const k of this._currentFog || []) disc.add(k);
      }
      if (this.fogRT) this.fogRT.setVisible(true);
      this._fogDirty = true;
    }
    this._redrawHighlights();
    this._redrawRoads();
    this._redrawBuildings();
    this._redrawUnits();
    if (this._fogDirty) {
      this._redrawFog();
      this._fogDirty = false;
    }
    this._drawSupplyOverlay();
    this._updateTopBar();
    this._updateBottomPanel();
    this._updateSpectatorStats();
    this.btnSubmit?.setVisible(true);
    this._restoreSpectatorCamera(camSnap);
  }

  // ── Supply overlay ────────────────────────────────────────────────────────
  _drawSupplyOverlay() {
    this.supplyGfx.clear();
    if (!this._supplyOverlayOn) return;
    const gs = this.gameState;
    const p  = gs.currentPlayer;
    const ms = this.mapSize;
    if (!gs.supplyEnabled) return;
    const supplied = this._getCachedSupply(p);
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

    // 2a) Mobile logistics bubble for selected supply truck / ship
    if (this.selectedUnit && (this.selectedUnit.type === 'SUPPLY_SHIP' || this.selectedUnit.type === 'SUPPLY_TRUCK')) {
      const rad = getUnitSupplyRadius(gs, p, this.selectedUnit);
      const sq = this.selectedUnit.q, sr = this.selectedUnit.r;
      const bubbleKeys = new Set();
      const queue = [{ q: sq, r: sr, rem: rad }];
      const visited = new Map();
      visited.set(`${sq},${sr}`, rad);
      while (queue.length > 0) {
        const { q, r, rem } = queue.shift();
        bubbleKeys.add(`${q},${r}`);
        if (rem <= 0) continue;
        for (const [dq, dr] of NBR) {
          const nq = q + dq, nr = r + dr;
          if (nq < 0 || nr < 0 || nq >= ms || nr >= ms) continue;
          const nextRem = rem - 1;
          const key = `${nq},${nr}`;
          const prev = visited.get(key) ?? -1;
          if (nextRem > prev) {
            visited.set(key, nextRem);
            queue.push({ q: nq, r: nr, rem: nextRem });
          }
        }
      }
      const fill = this.selectedUnit.type === 'SUPPLY_SHIP' ? 0x00aaff : 0x88cc44;
      const stroke = this.selectedUnit.type === 'SUPPLY_SHIP' ? 0x00ccff : 0xaadd66;
      for (const key of bubbleKeys) {
        const [hq, hr] = key.split(',').map(Number);
        const { x: hx, y: hy } = hexToWorld(hq, hr);
        const hverts = hexVertices(hx, hy);
        this.supplyGfx.fillStyle(fill, 0.2);
        this.supplyGfx.fillPoints(hverts, true);
        this.supplyGfx.lineStyle(1.5, stroke, 0.55);
        this.supplyGfx.strokePoints(hverts, true);
      }
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

    for (const { q, r } of this.reachable) fillHex(q, r, GAME_THEME.moveFill, 0.32);
    if (this.mode === 'attack_direct') {
      // Direct attack: red outline only on attackable hexes
      for (const { q, r } of this.attackable) outlineHex(q, r, ATTACK_HIGHLIGHT, 2.5);
    } else if (this.mode === 'attack') {
      // Blind fire: outline all range hexes; bright for visible enemies, dim for unknowns
      const gs = this.gameState;
      const fog = this._currentFog;
      for (const { q, r } of this.attackable) {
        const hasVisibleEnemy = gs.units.some(u => {
          if (u.owner === gs.currentPlayer || u.dead || u.embarked) return false;
          if (u.q !== q || u.r !== r) return false;
          if (fog && !fog.has(`${q},${r}`)) return false;
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

    if (this._deployMode && this._deployHexes?.length) {
      for (const site of this._deployHexes) {
        fillHex(site.q, site.r, DEPLOY_HIGHLIGHT, 0.38);
        outlineHex(site.q, site.r, DEPLOY_HIGHLIGHT, 2.5, 0.95);
      }
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
  _playerId(p) {
    const id = Number(p);
    return Number.isFinite(id) && id >= 1 ? id : 1;
  }

  _isAiControlled(p) {
    return this.aiPlayers.has(this._playerId(p));
  }

  _isSpectatorDuel() {
    if (!this._aiViewerMode || this.playerCount < 2) return false;
    for (let p = 1; p <= this.playerCount; p++) {
      if (!this._isAiControlled(p)) return false;
    }
    return true;
  }

  _drawVictoryZones() {
    this.victoryZoneGfx?.clear();
    const gs = this.gameState;
    if (gs.victoryMode !== VICTORY_MODES.POINTS) return;
    const zones = gs.victoryZones || [];
    if (!zones.length) return;

    const g = this.victoryZoneGfx;
    for (const zone of zones) {
      const { x, y } = hexToWorld(zone.q, zone.r);
      const verts = hexVertices(x, y);
      g.fillStyle(0xffcc44, 0.14);
      g.beginPath();
      g.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
      g.closePath();
      g.fillPath();
      g.lineStyle(2.5, 0xffcc44, 0.82);
      g.beginPath();
      g.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
      g.closePath();
      g.strokePath();
      const pts = zone.pointsPerTurn || 1;
      g.fillStyle(0x1a1408, 0.88);
      g.fillCircle(x, y - 2, 9);
      g.lineStyle(1, 0xffcc44, 0.95);
      g.strokeCircle(x, y - 2, 9);
    }
  }

  // Compute camera viewport bounds in world space from scroll+zoom directly.
  // Using camera.worldView can return stale/zero dimensions during input event handlers,
  // causing all units/buildings to fail the cull check and disappear.
  _vpBounds(buf = HEX_SIZE * 4) {
    const cam = this.cameras.main;
    const cw  = cam.width  || this.scale.width;
    const ch  = cam.height || this.scale.height;
    const hw  = (cw / 2) / cam.zoom;
    const hh  = (ch / 2) / cam.zoom;
    const cx  = cam.scrollX + hw;
    const cy  = cam.scrollY + hh;
    return { L: cx - hw - buf, R: cx + hw + buf, T: cy - hh - buf, B: cy + hh + buf };
  }

  _drawBuildingCounter(b, x, y, color, s, alphaOverride = 1) {
    const g = this.buildingGfx;
    const glyph = getBuildingCounterGlyph(b.type);
    const typeDef = BUILDING_TYPES[b.type];
    const isSettlement = SETTLEMENT_TYPES.has(b.type);
    const isMinor = !isSettlement && b.type !== 'HQ';
    const scale = isMinor ? 0.72 : (isSettlement ? 0.88 : 1);
    const cW = s * 2.35 * scale;
    const cH = s * 1.75 * scale;
    const cx2 = x - cW / 2;
    const cy2 = y - cH / 2;
    const alpha = Math.max(0.12, Math.min(1, alphaOverride * (isMinor ? 0.78 : 1)));
    const _mix = (a, bCol, t) => {
      const ca = Phaser.Display.Color.IntegerToColor(a);
      const cb = Phaser.Display.Color.IntegerToColor(bCol);
      return Phaser.Display.Color.GetColor(
        Math.floor(ca.red * (1 - t) + cb.red * t),
        Math.floor(ca.green * (1 - t) + cb.green * t),
        Math.floor(ca.blue * (1 - t) + cb.blue * t),
      );
    };
    const teamBase = _mix(color, 0x6e6e6e, 0.68);
    const bodyColor = b.underConstruction ? _mix(teamBase, 0x7f7f7f, 0.45) : teamBase;
    const accent = _mix(color, 0xffffff, 0.22);
    const typeAccent = typeDef?.color ? _mix(typeDef.color, color, 0.42) : accent;

    // Settlements: soft footprint only. Minor structures: no circle pad.
    if (isSettlement) {
      const padR = Math.max(cW, cH) * 0.4;
      g.fillStyle(_mix(typeAccent, bodyColor, 0.35), alpha * 0.22);
      g.fillCircle(x, y, padR);
      g.lineStyle(1, accent, alpha * 0.4);
      g.strokeCircle(x, y, padR);
    } else if (!isMinor) {
      const padR = Math.max(cW, cH) * 0.48;
      g.fillStyle(_mix(typeAccent, bodyColor, 0.35), alpha * 0.3);
      g.fillCircle(x, y, padR);
      g.lineStyle(1, accent, alpha * 0.55);
      g.strokeCircle(x, y, padR);
    }

    g.fillStyle(0x000000, isMinor ? 0.22 : 0.32);
    g.fillRect(cx2 + 1, cy2 + 1, cW, cH);
    g.fillStyle(bodyColor, alpha);
    g.fillRect(cx2, cy2, cW, cH);
    if (!isMinor) {
      g.fillStyle(accent, alpha * 0.75);
      g.fillRect(cx2 + 1, cy2 + 1, cW - 2, 2);
      g.fillStyle(typeAccent, alpha * 0.8);
      g.fillRect(cx2 + 1, cy2 + cH - 3, cW - 2, 2);
    }

    g.lineStyle(1, accent, alpha * (isMinor ? 0.45 : 0.7));
    g.strokeRect(cx2, cy2, cW, cH);

    const lbl = this.add.text(x, y + 1, glyph, {
      font: `${isMinor ? 'bold 10px' : 'bold 12px'} monospace`,
      fill: isMinor ? '#d8dcc8' : '#fff8e8',
      stroke: '#0a0a0a',
      strokeThickness: isMinor ? 2 : 3,
    }).setOrigin(0.5).setDepth(17).setAlpha(alpha);
    this.buildingSpriteLayer?.add(lbl);

    if (b.type === 'FACTORY' && b.active === false) {
      g.fillStyle(0xcc4444, 0.95);
      g.fillCircle(cx2 + cW - 5, cy2 + 5, 3);
    }

    if (isSettlement) {
      const badges = getVtcFacilityBadgeGlyphs(b);
      if (badges.length) {
        const badgeStr = badges.join(' ');
        const badgeLbl = this.add.text(x, y + cH * 0.52, badgeStr, {
          font: 'bold 8px monospace',
          fill: '#e8f0ff',
          stroke: '#0a0a0a',
          strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(17).setAlpha(alpha * 0.95);
        this.buildingSpriteLayer?.add(badgeLbl);
      }
    }

    if (b.underConstruction) {
      const prog = b.buildProgress || 0;
      const total = b.buildTurnsRequired || 1;
      const fraction = prog / total;
      const barW = HEX_SIZE * 0.75;
      const barH = 4;
      const barX = x - barW / 2;
      const barY = y + cH * 0.42;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      g.fillStyle(0x888888, 0.85);
      g.fillRect(barX, barY, barW, barH);
      g.fillStyle(0xffcc00, 1);
      g.fillRect(barX, barY, barW * fraction, barH);
      g.lineStyle(1, 0xffcc00, 0.45);
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(x + i * s * 0.35 - s, y - s * 0.35);
        g.lineTo(x + i * s * 0.35 + s, y + s * 0.35);
        g.strokePath();
      }
    } else if (isSettlement && b.captureProgress?.required) {
      const cp = b.captureProgress;
      const fraction = Math.min(1, (cp.turns || 0) / cp.required);
      const barW = HEX_SIZE * 0.75;
      const barH = 4;
      const barX = x - barW / 2;
      const barY = y + cH * 0.42;
      const capColor = PLAYER_COLORS[cp.player] || 0xffaa44;
      g.fillStyle(0x000000, 0.75);
      g.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      g.fillStyle(0x444444, 0.9);
      g.fillRect(barX, barY, barW, barH);
      g.fillStyle(capColor, 0.95);
      g.fillRect(barX, barY, barW * fraction, barH);
    }
  }

  _redrawBuildings() {
    this.buildingGfx.clear();
    if (this.farmTileLayer) this.farmTileLayer.removeAll(true);
    if (this.buildingSpriteLayer) this.buildingSpriteLayer.removeAll(true);
    // Viewport culling (large-map perf)
    const { L: _bvpL, R: _bvpR, T: _bvpT, B: _bvpB } = this._vpBounds();
    const fog = this._currentFog || null;

    const curP = Number(this.gameState.currentPlayer);
    for (const b of this.gameState.buildings) {
      try {
        if (ROAD_TYPES.has(b.type)) continue;
        if (LEGACY_PRODUCTION_MAP_HIDDEN.has(b.type)) continue;
        const isSettlement = SETTLEMENT_TYPES.has(b.type);
        const hexKey = `${b.q},${b.r}`;
        const inFog = !!(fog && fog.size > 0 && !fog.has(hexKey));
        // Fog: hide unseen enemy buildings — settlements always show (dimmed when unexplored).
        if (!isSettlement && inFog && Number(b.owner) !== curP) continue;
        const { x, y } = hexToWorld(b.q, b.r);
        const isOwnBld = Number(b.owner) === curP;
        if (!isOwnBld && !isSettlement && (x < _bvpL || x > _bvpR || y < _bvpT || y > _bvpB)) continue;
        const color = PLAYER_COLORS[b.owner] || 0x888888;
        const s = HEX_SIZE * (isSettlement ? 0.5 : 0.44);
        let drawAlpha = 1;
        if (isSettlement) {
          if (inFog) drawAlpha = 0.36;
          else if (Number(b.owner) === 0) drawAlpha = 0.78;
          else if (!isOwnBld) drawAlpha = 0.62;
        }

        // FARM is rendered as a terrain tile swap/overlay (not a building icon).
        if (b.type === 'FARM') {
          const targetH = Math.round(HEX_SIZE * Math.sqrt(3) * ISO_SQUISH);
          const verts = hexVertices(x, y);
          const targetW = HEX_SIZE * 2;

          const farmFx = this.add.graphics().setDepth(0);
          // Base farm fill (olive palette — matches grass hexes)
          farmFx.fillStyle(0x6a8448, 0.92);
          farmFx.beginPath();
          farmFx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) farmFx.lineTo(verts[i].x, verts[i].y);
          farmFx.closePath();
          farmFx.fillPath();

          // Strong furrow stripes (primary visibility cue)
          for (let fy = y - targetH * 0.30, row = 0; fy <= y + targetH * 0.30; fy += 4, row++) {
            const col = row % 2 === 0 ? 0x5a7838 : 0x9ab068;
            const a = row % 2 === 0 ? 0.75 : 0.5;
            farmFx.lineStyle(2.0, col, a);
            farmFx.beginPath();
            farmFx.moveTo(x - targetW * 0.34, fy);
            farmFx.lineTo(x + targetW * 0.34, fy);
            farmFx.strokePath();
          }

          // Crop speckles for texture identity
          farmFx.fillStyle(0xb8cc88, 0.5);
          for (let i = 0; i < 42; i++) {
            const rx = x - targetW * 0.30 + ((i * 13) % Math.floor(targetW * 0.60));
            const ry = y - targetH * 0.26 + ((i * 17) % Math.floor(targetH * 0.52));
            farmFx.fillRect(rx, ry, 2, 2);
          }

          // Bold bright outline so farm is unmistakable.
          farmFx.lineStyle(2.0, 0x7a9850, 0.85);
          farmFx.beginPath();
          farmFx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) farmFx.lineTo(verts[i].x, verts[i].y);
          farmFx.closePath();
          farmFx.strokePath();

          this.farmTileLayer?.add(farmFx);
          continue;
        }

        this._drawBuildingCounter(b, x, y, color, s, drawAlpha);
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

  _unitShownTier(unit, viewerPlayer = null) {
    const gs = this.gameState;
    const vp = viewerPlayer ?? gs.currentPlayer;
    const isEnemy = Number(unit.owner) !== Number(vp);
    let intelLevel = 3;
    if (isEnemy) {
      const key = `${unit.q},${unit.r}`;
      const inSight = !this._currentFog || this._currentFog.has(key);
      const fought = !!unit._tierIntelConfirmed;
      intelLevel = fought ? 2 : (inSight ? 1 : 0);
    }
    return getUnitTierIntel(gs, unit, vp, { intelLevel }).tier;
  }

  _unitTierIntelLabel(unit, viewerPlayer = null) {
    const gs = this.gameState;
    const vp = viewerPlayer ?? gs.currentPlayer;
    const isEnemy = Number(unit.owner) !== Number(vp);
    let intelLevel = 3;
    if (isEnemy) {
      const key = `${unit.q},${unit.r}`;
      const inSight = !this._currentFog || this._currentFog.has(key);
      intelLevel = unit._tierIntelConfirmed ? 2 : (inSight ? 1 : 0);
    }
    return getUnitTierIntel(gs, unit, vp, { intelLevel });
  }

  _tierColor(tier) {
    return UNIT_TIER_COLORS[Math.max(0, Math.min(5, tier ?? 0))] ?? 0x8a9aaa;
  }

  /** Subtle threat glyph for enemy units (Light / Medium / Heavy). */
  _drawThreatGlyph(gfx, x, y, band, alpha = 1) {
    if (!band) return;
    const pips = band.pips || 2;
    const col = band.color ?? 0xd4a24e;
    const bx = x - 10;
    const by = y - 10;
    gfx.fillStyle(0x0b0f16, alpha * 0.82);
    gfx.fillRect(bx - 1, by - 1, 14, 8);
    gfx.fillStyle(col, alpha * 0.95);
    if (pips === 1) {
      gfx.fillRect(bx + 4, by + 2, 5, 3);
    } else {
      for (let i = 0; i < pips; i++) gfx.fillRect(bx + 1 + i * 4, by + 2, 3, 4);
    }
  }

  // ── Units ─────────────────────────────────────────────────────────────────
  _redrawUnits() {
    this.unitGfx.clear();
    if (this.unitSpriteLayer) this.unitSpriteLayer.removeAll(true);
    const gs  = this.gameState;
    const fog = this._currentFog;
    const supplyByOwner = gs.supplyEnabled === false ? {} : (() => {
      const out = {};
      for (const pid of getPlayerIds(gs)) out[pid] = this._getCachedSupply(pid);
      return out;
    })();

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
      if (isEnemy && unit.hidden && !isStealthDetected(gs, unit, gs.currentPlayer)) continue;
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
      if (isEnemy && (x < _uvpL || x > _uvpR || y < _uvpT || y > _uvpB)) continue;

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

      const sprH = HEX_SIZE * 1.28;
      const artKey = hasUnitSprite(this, unit.type, unit.owner)
        ? getUnitArtTextureKey(unit.type, unit.owner)
        : null;
      const sprAlpha = spent ? alpha * 0.45 : alpha;
      const unitSpr = artKey
        ? placeWorldSprite(this, this.unitSpriteLayer, artKey, x, y, sprH,
          PLAYER_COLORS[unit.owner] || 0xffffff, sprAlpha, 0)
        : null;
      const drewUnitSprite = !!unitSpr;

      // ── Wargame counter (NATO-style) — fallback when no unit sprite art ─────
      const NAVAL_SHAPES = new Set(['boat_sm','sub','destroyer','cruiser','cruiser_hv','battleship','transport','landing','battery']);
      const isNaval = NAVAL_SHAPES.has(def.shape);
      const cW = r * 2.1;
      const cH = r * 1.7;
      const cx2 = x - cW/2, cy2 = y - cH/2;
      const fillAlpha = spent ? alpha * 0.5 : alpha;

      if (drewUnitSprite) {
        if (this.selectedUnit === unit) {
          this.unitGfx.lineStyle(3, SELECTED_STROKE, alpha);
          this.unitGfx.strokeCircle(x, y, sprH * 0.55);
        }
        this.unitGfx.fillStyle(0x000000, alpha * 0.35);
        this.unitGfx.fillEllipse(x + 2, y + sprH * 0.42, sprH * 0.7, sprH * 0.18);
        // Own units: tier pips; enemies: threat class only (no floating T# labels)
        if (!isEnemy) {
          const tierIntel = this._unitTierIntelLabel(unit);
          const shownTier = tierIntel.tier;
          const tierCol = this._tierColor(shownTier);
          const py = y - sprH * 0.35;
          const startX = x + sprH * 0.22;
          this.unitGfx.fillStyle(0x0b0f16, alpha * 0.72);
          this.unitGfx.fillRect(startX - 2, py - 3, 14, 6);
          if (shownTier === 0) {
            this.unitGfx.fillStyle(0x6f7c88, alpha * 0.9);
            this.unitGfx.fillRect(startX + 2, py - 1, 6, 2);
          } else {
            this.unitGfx.fillStyle(tierCol, alpha * 0.95);
            for (let i = 0; i < shownTier; i++) this.unitGfx.fillRect(startX + i * 4, py - 2, 3, 4);
          }
        } else {
          this._drawThreatGlyph(this.unitGfx, x - sprH * 0.28, y - sprH * 0.32, getUnitThreatBand(unit), alpha);
        }
        // HP bar under sprite
        const hpFrac = unit.health / (unit.maxHealth || unit.health || 1);
        const barW = sprH * 0.9, barH = 4;
        const barX = x - barW / 2, barY = y + sprH * 0.42;
        this.unitGfx.fillStyle(0x000000, alpha * 0.65);
        this.unitGfx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        this.unitGfx.fillStyle(hpFrac > 0.5 ? 0x44cc66 : hpFrac > 0.25 ? 0xcccc44 : 0xcc4444, alpha);
        this.unitGfx.fillRect(barX, barY, barW * hpFrac, barH);
        if (movedOnly) {
          this.unitGfx.fillStyle(0xd9a441, alpha * 0.95);
          this.unitGfx.fillCircle(x + sprH * 0.38, y - sprH * 0.38, 4);
        }
        const liveUnsupSpr = gs.supplyEnabled !== false && !unit.embarked && !(unit.ignoreSupply > 0)
          && !supplyByOwner[unit.owner]?.has(`${unit.q},${unit.r}`);
        if (unit.outOfSupply > 0 || liveUnsupSpr) {
          const oos = Math.max(unit.outOfSupply || 0, liveUnsupSpr ? 1 : 0);
          const pipCol = oos >= 2 ? 0xff2222 : 0xff8800;
          this.unitGfx.fillStyle(pipCol, alpha);
          this.unitGfx.fillCircle(x - sprH * 0.38, y - sprH * 0.38, 4);
        }
        if (unit.type === 'ENGINEER' && (unit.roadOrder || unit.constructing)) {
          this.unitGfx.fillStyle(0xffaa00, alpha);
          this.unitGfx.fillCircle(x + sprH * 0.38, y - sprH * 0.38, 4);
        }
        if (unit.moveOrder || unit.roadOrder) {
          this.unitGfx.fillStyle(0x44ccff, alpha);
          this.unitGfx.fillCircle(x + sprH * 0.42, y - sprH * 0.42, 5);
        }
        continue;
      }

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

      if (isEnemy) {
        this._drawThreatGlyph(this.unitGfx, cx2 + 4, cy2 + 4, getUnitThreatBand(unit), alpha);
      } else {
        const tierIntel = this._unitTierIntelLabel(unit);
        const shownTier = tierIntel.tier;
        const tierCol = this._tierColor(shownTier);
        const py = cy2 + 6;
        const startX = cx2 + cW - 16;
        this.unitGfx.fillStyle(0x0b0f16, alpha * 0.72);
        this.unitGfx.fillRect(startX - 2, py - 3, 14, 6);
        if (shownTier === 0) {
          this.unitGfx.fillStyle(0x6f7c88, alpha * 0.9);
          this.unitGfx.fillRect(startX + 2, py - 1, 6, 2);
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

      // Out-of-supply indicator: live + persisted status
      const liveUnsup = gs.supplyEnabled !== false && !unit.embarked && !(unit.ignoreSupply > 0) && !supplyByOwner[unit.owner]?.has(`${unit.q},${unit.r}`);
      if (unit.outOfSupply > 0 || liveUnsup) {
        const oos = Math.max(unit.outOfSupply || 0, liveUnsup ? 1 : 0);
        const pipR = 4;
        const pipX = cx2 + pipR + 1;
        const pipY = cy2 + pipR + 1;
        const pipCol = oos >= 2 ? 0xff2222 : 0xff8800;
        this.unitGfx.fillStyle(pipCol, alpha);
        this.unitGfx.fillCircle(pipX, pipY, pipR);
        this.unitGfx.lineStyle(1, 0x000000, alpha * 0.5);
        this.unitGfx.strokeCircle(pipX, pipY, pipR);
      } else if (NAVAL_UNITS.has(unit.type) && unit.type !== 'SUPPLY_SHIP' &&
          unit.navalSupply !== undefined && unit.navalSupply <= 2 && (unit.outOfSupply || 0) === 0) {
        const pipR = 4;
        const pipX = cx2 + pipR + 1;
        const pipY = cy2 + pipR + 1;
        this.unitGfx.fillStyle(0x0088ff, 0.8);
        this.unitGfx.fillCircle(pipX, pipY, pipR);
        this.unitGfx.lineStyle(1, 0x000000, 0.4);
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
  _fogVisionSignature() {
    const gs = this.gameState;
    const cp = Number(gs?.currentPlayer) || 1;
    let sig = `${cp}|${gs?.turn || 0}|`;
    for (const u of gs?.units || []) {
      if (Number(u.owner) !== cp) continue;
      sig += `u${u.id}:${u.q},${u.r};`;
    }
    for (const b of gs?.buildings || []) {
      if (Number(b.owner) !== cp) continue;
      const sight = BUILDING_TYPES[b.type]?.sight || 0;
      if (sight > 0) sig += `b${b.id}:${b.q},${b.r};`;
    }
    return sig;
  }

  // Call at turn start to lock in fog for the planning phase
  _freezeFog() {
    this.gameState.currentPlayer = Number(this.gameState.currentPlayer) || 1;
    if (this.debugNoFog) {
      this._currentFog = null;
      this._fogCacheSig = null;
      if (this.fogRT) this.fogRT.setVisible(false);
      return;
    }
    this._fogCacheSig = this._fogVisionSignature();
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
    fillGfx.fillStyle(GAME_THEME.fogFill, GAME_THEME.fogAlpha);
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
    this.topBarBg = this.add.rectangle(w/2, 37, w, 74, GAME_THEME.hudBg, 0.97)
      .setStrokeStyle(1, GAME_THEME.hudStroke, 0.35).setScrollFactor(0).setDepth(D);
    this.topBarDivider = this.add.rectangle(w/2, 37, w, 1, 0x2a3550, 1).setScrollFactor(0).setDepth(D + 1);
    this.topBarAccent = this.add.rectangle(w/2, 74, w, 2, GAME_THEME.hudAccent, 1).setScrollFactor(0).setDepth(D + 1);

    // Row 1: nav + state (depth above logistics dock so ← MENU stays clickable)
    this.btnMenu = this._makeBtn(10, 8, '← MENU', 0x222222, () => this.scene.start('MenuScene'), D + 30);
    this.turnLbl = this._makeLabel(w/2, 8, 'Turn 1 | Player 1 | PLANNING', D, true);

    // Version tag
    this.versionTag = this.add.text(w - 110, 8, GAME_VERSION, {
      font: '11px monospace', fill: '#5a6f8a'
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D);

    // Row 2: primary tools (detail panels live under MORE)
    this.btnSupply   = this._makeBtn(w - 420, 42, '⬡ SUP [L]', 0x111a11, () => this._toggleSupplyOverlay(), D, 'right');
    this.btnResearch = this._makeBtn(w - 334, 42, '⚗ RES',   0x442266, () => this._toggleResearch(), D, 'right');
    this.btnMore     = this._makeBtn(w - 248, 42, '☰ MORE',  0x2a2244, () => this._toggleMoreTools(), D, 'right');
    this.btnSettings = this._makeBtn(w - 162, 42, '⚙ SET',   0x222244, () => this._toggleSettings(), D, 'right');
    this.btnSubmit   = this._makeBtn(w - 8,   42, 'END TURN',0x1a5c1a, () => this._confirmEndTurn(), D, 'right');
    this._moreToolsOpen = false;
    this._moreToolsBtns = [];
    if (this._aiViewerMode && this._isSpectatorDuel()) {
      this.btnPauseAI = this._makeBtn(w - 610, 8, '⏸ AI', 0x3a2a11, () => {
        this._aiAutoplayPaused = !this._aiAutoplayPaused;
        this._pushLog(this._aiAutoplayPaused ? 'AI autoplay paused.' : 'AI autoplay resumed.');
        if (!this._aiAutoplayPaused && this._isAiControlled(this.gameState.currentPlayer)) this._runAITurn();
        this._updateTopBar();
      }, D, 'right');
      this.btnStatsAI = this._makeBtn(w - 700, 8, '📈 STATS', 0x1f2f44, () => this._toggleSpectatorStats(), D, 'right');
    }

    // Explicit turn counter badge (high visibility)
    this.turnBadge = this.add.text(w - 8, 8, 'TURN 1', {
      font: 'bold 12px monospace', fill: '#fff7c2',
      backgroundColor: '#3a3312', padding: { x: 8, y: 4 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(D + 2);

    // Left command dock — positioned in _layoutCommandDock (below top bar, not over ← MENU)
    const dockW = 152;
    this.sidebarEcoBg = this.add.rectangle(0, 0, dockW, 200, 0x0a0812, 0.96)
      .setStrokeStyle(2, 0xff66cc).setScrollFactor(0).setDepth(D)
      .setInteractive({ useHandCursor: true });
    this.sidebarEcoBg.on('pointerdown', () => this._toggleEconomy());
    this._dockTopStripe = this.add.rectangle(0, 0, dockW, 5, 0xffcc44, 1)
      .setScrollFactor(0).setDepth(D + 1);
    this.sidebarEcoTitle = this.add.text(0, 0, 'LOGISTICS', {
      font: 'bold 14px monospace', fill: '#ffcc44',
    }).setScrollFactor(0).setDepth(D + 1);
    this.sidebarUpkeepBanner = this.add.text(0, 0, '', {
      font: '11px monospace', fill: '#cc88aa', wordWrap: { width: dockW - 16 },
    }).setScrollFactor(0).setDepth(D + 1);
    this.sidebarResearchBar = this.add.text(0, 0, '', {
      font: '11px monospace', fill: '#bb99ee', wordWrap: { width: dockW - 16 },
    }).setScrollFactor(0).setDepth(D + 1);
  }

  _makeCommandCard(x, y, w, h, label, depth) {
    const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x141018, 0.98)
      .setStrokeStyle(1, 0x3a2848).setScrollFactor(0).setDepth(depth);
    const stripe = this.add.rectangle(x + 3, y + 4, 3, h - 8, 0xff66cc, 0.85)
      .setScrollFactor(0).setDepth(depth + 1);
    const title = this.add.text(x + 10, y + 4, label, {
      font: 'bold 10px monospace', fill: '#8899aa',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1);
    const val = this.add.text(x + 10, y + 18, '—', {
      font: 'bold 13px monospace', fill: '#e8ead8',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1);
    return { bg, stripe, title, val };
  }

  _positionCommandCard(card, x, y, w, h) {
    if (!card) return;
    card.bg?.setPosition(x + w / 2, y + h / 2).setSize(w, h);
    card.stripe?.setPosition(x + 3, y + 4).setSize(3, Math.max(4, h - 8));
    card.title?.setPosition(x + 10, y + 4);
    card.val?.setPosition(x + 10, y + 18);
  }

  _layoutCommandDock(viewH = this.scale.height) {
    const dockX = 8;
    const dockW = 152;
    const dockTop = 82; // below 74px top bar + ← MENU
    const dockH = Math.min(368, Math.max(240, viewH - dockTop - 148));
    const dockY = dockTop + dockH / 2;
    const dockLeft = dockX;

    this._dockGeom = { dockX, dockW, dockH, dockY, dockTop };

    this.sidebarEcoBg?.setPosition(dockLeft + dockW / 2, dockY).setSize(dockW, dockH);
    this._dockTopStripe?.setPosition(dockLeft + dockW / 2, dockTop + 2.5);
    this.sidebarEcoTitle?.setPosition(dockLeft + 10, dockTop + 14);
    this.sidebarUpkeepBanner?.setPosition(dockLeft + 10, dockTop + 36);
    this.sidebarResearchBar?.setPosition(dockLeft + 10, dockTop + 58);

    const cardW = dockW - 12;
    const cardH = 34;
    const gap = 4;
    let cy = dockTop + 82;
    const keys = ['iron', 'oil', 'wood', 'food', 'pop', 'gold', 'parts', 'steel', 'alloy', 'rp'];
    for (const key of keys) {
      this._positionCommandCard(this._cmdCards?.[key], dockLeft + 6, cy, cardW, cardH);
      cy += cardH + gap;
    }
  }

  _initCommandDockRows() {
    const D = 101;
    const dockX = 8;
    const dockW = 152;
    const cardW = dockW - 12;
    const cardH = 34;
    const mk = (label) => this._makeCommandCard(dockX + 6, 0, cardW, cardH, label, D);
    this._cmdCards = {
      iron: mk('IRON'),
      oil: mk('OIL'),
      wood: mk('WOOD'),
      food: mk('FOOD'),
      pop: mk('POP'),
      gold: mk('GOLD'),
      parts: mk('PARTS'),
      steel: mk('STEEL'),
      alloy: mk('ALLOY'),
      rp: mk('RESEARCH'),
    };
  }

  _setCommandCard(card, line, color = '#e8ead8') {
    card?.val?.setText(line)?.setStyle({ fill: color });
  }

  _pushInputBlocker(tag) {
    this._inputBlockers = this._inputBlockers || new Set();
    if (!this._inputBlocker) {
      const w = this.scale.width, h = this.scale.height;
      this._inputBlocker = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.001)
        .setScrollFactor(0).setDepth(194).setInteractive();
      this._inputBlocker.on('pointerdown', (_p, _x, _y, ev) => { try { ev?.stopPropagation?.(); } catch (e) {} });
    }
    this._inputBlockers.add(tag);
    this._syncTopBarBlocked();
  }

  _popInputBlocker(tag) {
    this._inputBlockers?.delete(tag);
    if (!this._inputBlockers?.size) {
      try { this._inputBlocker?.destroy(); } catch (e) {}
      this._inputBlocker = null;
    }
    this._syncTopBarBlocked();
  }

  _syncTopBarBlocked() {
    const blocked = (this._inputBlockers?.size || 0) > 0
      || !!this._researchOpen || !!this._settingsOpen || !!this._designerOpen
      || !!this._economyOpen || !!this._aiOverviewOpen || !!this._tradeOpen || !!this._endTurnPending
      || !!this._researchCompletePopup;
    for (const b of [this.btnSubmit, this.btnSettings, this.btnResearch, this.btnMore, this.btnSupply]) {
      if (!b) continue;
      if (blocked) { b.disableInteractive(); b.setAlpha(0.28); }
      else { b.setInteractive({ useHandCursor: true }); b.setAlpha(1); }
    }
  }

  _formatSupplyStatus(u, gs) {
    if (gs.supplyEnabled === false) return null;
    const oos = u.outOfSupply || 0;
    if (oos <= 0) {
      const key = `${u.q},${u.r}`;
      const live = !computeSupply(gs, u.owner, this.mapSize)?.has(key);
      if (live) return { level: 'warn', text: 'Supply cut — will be OOS next turn', pen: supplyPenalty(1) };
      return null;
    }
    const pen = supplyPenalty(oos);
    const lines = [`Out of supply ${oos} turn${oos > 1 ? 's' : ''}`, `−${pen.movePenalty} move, −${pen.attackPenalty} attack/defense`];
    if (oos >= 3) lines.push('Critical — consider retreat or supply truck');
    return { level: oos >= 2 ? 'crit' : 'oos', text: lines.join(' · '), pen };
  }

  _makeSidebarResRow(x, y, icon, label, depth) {
    const t = this.add.text(x, y, icon, {
      font: 'bold 14px monospace', fill: '#d8ead8',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    const val = this.add.text(x + 22, y, `${label}`, {
      font: '13px monospace', fill: '#c8d8c8',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    t.setData('valueText', val);
    t.setData('label', label);
    return t;
  }

  _toggleMoreTools() {
    this._moreToolsOpen = !this._moreToolsOpen;
    for (const b of this._moreToolsBtns || []) { try { b.destroy(); } catch (e) {} }
    this._moreToolsBtns = [];
    if (!this._moreToolsOpen) {
      this.btnMore?.setStyle({ backgroundColor: '#2a2244' });
      return;
    }
    this.btnMore?.setStyle({ backgroundColor: '#4a3080' });
    const w = this.scale.width;
    const defs = [
      { label: '💱 TRADE', color: 0x3a2a11, cb: () => this._toggleTrade() },
      { label: '🔧 DESIGN', color: 0x1a3322, cb: () => this._toggleDesigner() },
      { label: '📊 ECON+', color: 0x2a2a14, cb: () => this._toggleEconomy() },
      { label: '⚔ COMBAT LOG', color: 0x3a1828, cb: () => this._toggleCombatLog() },
    ];
    if (this.aiPlayers?.size >= 1) {
      defs.push({ label: '🤖 AI LAB', color: 0x2a1844, cb: () => this._toggleAIOverview() });
      defs.push({ label: '📥 EXPORT JSON', color: 0x1a3344, cb: () => this._downloadRunJson('manual') });
    }
    defs.forEach((d, i) => {
      const btn = this._makeBtn(w - 248, 74 + i * 28, d.label, d.color, () => {
        this._moreToolsOpen = false;
        this._toggleMoreTools();
        d.cb();
      }, 102, 'right');
      this._moreToolsBtns.push(btn);
      this._addToUI([btn]);
    });
  }

  _makeLabel(x, y, text, depth, center = false) {
    return this.add.text(x, y, text, {
      font: '13px monospace', fill: '#d8ead8',
      backgroundColor: '#141814', padding: { x: 8, y: 6 }, stroke: '#081008', strokeThickness: 1
    }).setOrigin(center ? 0.5 : 0, 0).setScrollFactor(0).setDepth(depth);
  }

  _setSidebarResRow(rowIcon, line) {
    const val = rowIcon?.getData?.('valueText');
    if (val) val.setText(line);
    else rowIcon?.setText(line);
  }

  _setCommandDockHighlight(active) {
    this.sidebarEcoBg?.setStrokeStyle(2, active ? 0xffcc44 : 0xff66cc);
  }

  _showHoverTip(text, x, y) {
    this._hideHoverTip();
    this._hoverTipBg = this.add.rectangle(x + 46, y + 10, 88, 18, 0x111111, 0.92)
      .setStrokeStyle(1, 0x444444).setScrollFactor(0).setDepth(12000);
    this._hoverTipText = this.add.text(x + 6, y + 1, text, {
      font: 'bold 8px monospace', fill: '#f1f1f1'
    }).setScrollFactor(0).setDepth(12001);
  }

  _hideHoverTip() {
    this._hoverTipBg?.destroy?.();
    this._hoverTipText?.destroy?.();
    this._hoverTipBg = null;
    this._hoverTipText = null;
  }

  _makeBtn(x, y, label, color, cb, depth = 100, origin = 'left') {
    const ox = origin === 'right' ? 1 : 0;
    const btn = this.add.text(x, y, label, {
      font: 'bold 14px monospace', fill: '#ffffff',
      backgroundColor: `#${color.toString(16).padStart(6,'0')}`,
      padding: { x: 12, y: 8 }, stroke: '#111111', strokeThickness: 1
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
    let vtcQueued = 0, vtcReady = 0;
    for (const b of gs.buildings) {
      if (Number(b.owner) !== Number(p) || !PRODUCTION_VTC_TYPES.has(b.type)) continue;
      vtcQueued += (b.trainQueue?.length || 0);
      vtcReady += (b.readyUnits?.length || 0);
    }
    const modeStr = this.mode === 'move' ? 'MOVING' : this.mode === 'sprint' ? 'SPRINTING' : this.mode === 'attack' ? 'ATTACKING' : 'PLANNING';
    const legacyQueue = myOrders.length
      ? myOrders.map(r => {
          const name = r.designId !== undefined
            ? (gs.designs[p].find(d => d.id === r.designId)?.name || 'Unit')
            : UNIT_TYPES[r.type]?.name || '?';
          return `⚙${name}(${r.turnsLeft}t)`;
        }).join(' ')
      : '';
    const vtcQueue = vtcQueued ? `🏭VTC×${vtcQueued}` : '';
    const readyQueue = vtcReady ? `📦Ready:${vtcReady}` : '';
    const queueBits = [legacyQueue, vtcQueue, readyQueue].filter(Boolean);
    const queueStr = queueBits.length ? `  |  ${queueBits.join(' ')}` : '';

    const upkeep = calcUpkeep(gs, p);
    const unitsOOS = gs.units.filter(u => Number(u.owner) === p && !u.dead && (u.outOfSupply || 0) > 0).length;

    const fmtRes = (v) => typeof v === 'number' ? (v % 1 === 0 ? v : v.toFixed(1)) : '—';

    const netIron = +(inc.iron - upkeep.iron).toFixed(1);
    const netOil  = +(inc.oil  - upkeep.oil).toFixed(1);
    const netFood = +((inc.food || 0) - (upkeep.food || 0)).toFixed(1);
    const netWood = +(inc.wood || 0).toFixed(1);
    const netGold = +(inc.gold || 0).toFixed(1);

    const sgn = (v) => v > 0 ? `+${v}` : `${v}`;

    // Turns-to-zero for each resource (warn when ≤3 turns)
    const _ttz = (stock, netPer) => (netPer >= 0 ? Infinity : Math.floor(stock / Math.abs(netPer)));
    const ttzIron = _ttz(pl.iron, netIron);
    const ttzOil  = _ttz(pl.oil,  netOil);
    const ttzFood = _ttz(pl.food || 0, netFood);
    const ttzSuffix = (ttz) => ttz <= 1 ? ' !!!' : ttz <= 3 ? ` (${ttz}t)` : '';

    const debt = pl.upkeepDebt || { food: 0, iron: 0, oil: 0 };
    const inDebt = debt.food > 0 || debt.iron > 0 || debt.oil > 0;
    const upkeepLine = inDebt
      ? `⚠ DEBT  🍞${debt.food} ⚙${debt.iron} 🛢${debt.oil}`
      : (unitsOOS > 0 ? `⚠ ${unitsOOS} OUT OF SUPPLY` : `Upkeep 🍞${upkeep.food} ⚙${upkeep.iron} 🛢${upkeep.oil}`);
    this.sidebarUpkeepBanner?.setText(upkeepLine);
    this.sidebarUpkeepBanner?.setStyle({ fill: inDebt || unitsOOS > 0 ? '#ff6644' : '#99aabb' });

    const resState = pl.research;
    const activeRes = resState?.queue?.[0];
    const activeTech = activeRes ? TECH_TREE[activeRes.techId] : null;
    const rpPct = activeTech ? Math.floor(((activeRes.rpSpent || 0) / activeTech.cost) * 100) : 0;
    const rpDock = inc.rp === 0 ? 'Research: no lab'
      : (activeTech ? `⚗ ${activeTech.name.substring(0, 14)} ${rpPct}%` : `⚗ idle +${inc.rp}/t`);
    this.sidebarResearchBar?.setText(rpDock);

    const rowFill = (ttz, critical) => critical ? '#ff4422' : (ttz <= 3 ? '#ffaa33' : '#e8ead8');
    const c = this._cmdCards || {};
    this._setCommandCard(c.iron, `${fmtRes(pl.iron)}  ${sgn(netIron)}${ttzSuffix(ttzIron)}`, rowFill(ttzIron, ttzIron <= 1));
    this._setCommandCard(c.oil, `${fmtRes(pl.oil)}  ${sgn(netOil)}${ttzSuffix(ttzOil)}`, rowFill(ttzOil, ttzOil <= 1));
    this._setCommandCard(c.wood, `${fmtRes(pl.wood || 0)}  ${sgn(netWood)}`);
    this._setCommandCard(c.food, `${fmtRes(pl.food || 0)}  ${sgn(netFood)}${ttzSuffix(ttzFood)}`, unitsOOS > 0 ? '#ff6644' : rowFill(ttzFood, ttzFood <= 1));
    recalcPlayerPopulation(gs, p);
    const pop = getPopBreakdown(gs, p);
    const waitNote = pop.waiting > 0 ? ` · ${pop.waiting} wait` : '';
    const trainNote = pop.reserve > 0 ? ` +${pop.reserve} train` : '';
    const popText = (pop.avail < 1 && pop.used >= pop.cap)
      ? `${pop.fielded}/${pop.cap} map · full${trainNote}${waitNote}`
      : `${pop.fielded}/${pop.cap} map · ${pop.avail} free${trainNote}${waitNote}`;
    const popWarn = pop.fielded < Math.max(4, Math.floor(pop.cap * 0.3)) && pop.avail >= 4;
    this._setCommandCard(c.pop, popText, popWarn ? '#ff8888' : '#c8e8c8');
    this._setCommandCard(c.gold, `${fmtRes(pl.gold || 0)}  ${sgn(netGold)}`);
    this._setCommandCard(c.parts, `${fmtRes(pl.components || 0)}`);
    this._setCommandCard(c.steel, `${fmtRes(pl.hardenedSteel || 0)}`);
    this._setCommandCard(c.alloy, `${fmtRes(pl.aviationAlloy || 0)}`);
    this._setCommandCard(c.rp, activeTech ? `${activeTech.name.substring(0, 12)} ${rpPct}%` : (inc.rp ? `+${inc.rp}/t` : '—'), '#bb99ee');

    if (gs.victoryMode === VICTORY_MODES.POINTS) {
      const vp = gs.victoryPoints?.[p] || 0;
      const tgt = gs.victoryPointTarget || 100;
      const ids = Object.keys(gs.players || {}).map(Number).filter(n => n >= 1).sort((a, b) => a - b);
      const vpBoard = ids.map(id => {
        const pts = gs.victoryPoints?.[id] || 0;
        const tag = (PLAYER_LABELS[id] || `P${id}`).slice(0, 1);
        return `${tag}${pts}`;
      }).join(' ');
      this.turnLbl.setText(`Turn ${gs.turn}  |  P${p} (${PLAYER_LABELS[p] || '?'})  |  VP ${vp}/${tgt}  |  ${vpBoard}  |  ${modeStr}`);
    } else if (gs.victoryMode === VICTORY_MODES.VTC_CONTROL) {
      const vtc = getVtcControlStatus(gs);
      const streak = vtc.controller === p ? `${vtc.streak}/${vtc.target}` : (vtc.controller ? `P${vtc.controller} ${vtc.streak}/${vtc.target}` : `0/${vtc.target}`);
      this.turnLbl.setText(`Turn ${gs.turn}  |  P${p}  |  VTC ${vtc.vtcs} hex  |  Hold ${streak}  |  ${modeStr}${queueStr}`);
    } else if ((gs.playerCount || 2) > 2) {
      this.turnLbl.setText(`Turn ${gs.turn}  |  P${p} (${PLAYER_LABELS[p] || '?'})  |  ${modeStr}${queueStr}`);
    } else {
      this.turnLbl.setText(`Turn ${gs.turn}  |  P${p}  |  ${modeStr}${queueStr}`);
    }
    this.turnBadge?.setText(`TURN ${gs.turn}`);
    if (this.btnPauseAI) this.btnPauseAI.setText(this._aiAutoplayPaused ? '▶ AI' : '⏸ AI');
  }

  // ── Bottom inspector + action rail ────────────────────────────────────────
  _createBottomPanel() {
    this._inspectorPanH = 212;
    this._inspectorTabManual = null;
    this._inspectorTab = 'unit';
    this._inspectorLines = [];
    this._inspectorTabBtns = {};

    const D = 100;
    this.inspectorBg = this.add.rectangle(0, 0, 500, this._inspectorPanH, GAME_THEME.hudBg, 0.97)
      .setStrokeStyle(2, GAME_THEME.hudStroke).setScrollFactor(0).setDepth(D);
    this.inspectorAccent = this.add.rectangle(0, 0, 500, 3, GAME_THEME.hudAccent, 1)
      .setScrollFactor(0).setDepth(D + 1);

    const tabDefs = [
      ['unit', 'UNIT', 0],
      ['hex', 'HEX', 1],
      ['build', 'BUILD', 2],
    ];
    for (const [key, label, idx] of tabDefs) {
      const tab = this.add.text(12 + idx * 62, 0, label, {
        font: 'bold 12px monospace', fill: '#8899aa',
        backgroundColor: '#1a1028', padding: { x: 8, y: 4 },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true });
      tab.on('pointerdown', () => {
        this._contextMenuClicked = true;
        this._inspectorTabManual = key;
        this._inspectorTab = key;
        if (key === 'build') {
          this._buildMenuOpen = true;
        }
        this._updateInspectorTabVisuals();
        this._updateBottomPanel();
      });
      this._inspectorTabBtns[key] = tab;
    }

    this.inspectorTitle = this.add.text(12, 0, 'Inspector', {
      font: 'bold 15px monospace', fill: '#ffcc44',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2);
    this.inspectorChips = this.add.text(12, 0, '', {
      font: '12px monospace', fill: '#99bbdd',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2);
    for (let i = 0; i < 4; i++) {
      this._inspectorLines.push(this.add.text(12, 0, '', {
        font: '13px monospace', fill: '#d8ead8', wordWrap: { width: 476 },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2));
    }

    // Legacy aliases (resize / old refs)
    this.unitPanel = this.inspectorBg;
    this.unitNameTxt = this.inspectorTitle;
    this.unitStatsTxt = this.inspectorChips;
    this.unitStatusTxt = this._inspectorLines[0];

    this.actionBg = this.add.rectangle(0, 0, 380, this._inspectorPanH, BUILD_MENU.bg, 0.97)
      .setStrokeStyle(2, BUILD_MENU.stroke).setScrollFactor(0).setDepth(D + 5);
    this.actionAccent = this.add.rectangle(0, 0, 380, 3, BUILD_MENU.accent, 1)
      .setScrollFactor(0).setDepth(D + 6);

    this._dynBtns = [];
    this._contextMenuUnit = null;
    this._layoutInspectorChrome();
    this._updateInspectorTabVisuals();
    this._addToUI([
      this.inspectorBg, this.inspectorAccent, this.actionBg, this.actionAccent,
      ...Object.values(this._inspectorTabBtns || {}),
      this.inspectorTitle, this.inspectorChips, ...(this._inspectorLines || []),
    ]);
  }

  _isVtcBuildPanelActive() {
    const focus = this._buildMenuFocusBuilding;
    const p = this.gameState?.currentPlayer;
    return !!(this._buildMenuOpen && focus && ['VILLAGE', 'TOWN', 'CITY'].includes(focus.type)
      && Number(focus.owner) === Number(p));
  }

  _getBottomChromeLayout() {
    const w = this.scale.width, h = this.scale.height;
    const baseH = this._inspectorPanH || 212;
    const engineerPanel = this._buildMenuOpen && this._isEngineerBuildPanelActive();
    const vtcPanel = this._isVtcBuildPanelActive();
    const actionPanH = engineerPanel
      ? Math.min(360, h - PLAYFIELD_UI.top - 16)
      : vtcPanel
        ? Math.min(Math.floor(h * 0.58), h - PLAYFIELD_UI.top - 24)
        : baseH;
    // Tall VTC build menu is right-rail only; left inspector stays compact.
    const inspPanH = vtcPanel && !engineerPanel ? baseH : actionPanH;
    const actionTopY = h - actionPanH;
    const inspTopY = h - inspPanH;
    const actionCx = w - (vtcPanel ? 210 : 198);
    const contentLeft = actionCx - (vtcPanel ? 200 : 190);
    return {
      w, h, vtcPanel, engineerPanel,
      panH: actionPanH, topY: actionTopY,
      inspPanH, inspTopY, actionCx, contentLeft,
    };
  }

  _renderEngineerBuildPanel(eng) {
    const { topY, panH, contentLeft } = this._getBottomChromeLayout();
    const ax = contentLeft;
    const maxY = topY + panH - 8;
    let ay = topY + 8;
    const colW = 168;
    const btnH = 28;
    const gap = 3;

    this._addBuildMenuText(ax, ay, '🔧 ENGINEER CORPS', { font: 'bold 13px monospace', fill: '#88ffcc' });
    ay += 20;

    const quickBtns = [];
    if (!eng.roadOrder) {
      quickBtns.push({ label: 'AUTO-ROAD →', color: 0x2a4455, cb: () => this._enterRoadDestMode(eng) });
    } else {
      quickBtns.push({ label: '✕ CANCEL ROAD', color: 0x662222, cb: () => { delete eng.roadOrder; this._refresh(); } });
    }
    if (eng.moveOrder) {
      quickBtns.push({ label: '✕ CANCEL MOVE', color: 0x334466, cb: () => { delete eng.moveOrder; this._refresh(); } });
    } else if (!eng.moved) {
      quickBtns.push({ label: 'Shift+RMB move', color: 0x223344, cb: () => {} });
    }
    let qx = ax;
    for (const qb of quickBtns) {
      const btn = this._makeActionBtn(qx, ay, qb.label, qb.color, qb.cb, { width: 108, height: 26, fontSize: 10 });
      if (qb.label.startsWith('Shift')) btn.setAlpha(0.55);
      this._uiLayer.add(btn);
      this._dynBtns.push(btn);
      qx += 108 + gap;
    }
    ay += 30;

    const cat = this._engineerBuildCategory || 'roads';
    const tabW = 66;
    ENGINEER_BUILD_CATEGORIES.forEach((c, i) => {
      const active = cat === c.key;
      const tx = ax + i * (tabW + 2);
      const tab = this.add.text(tx, ay, c.label, {
        font: 'bold 9px monospace',
        fill: active ? BUILD_MENU.gold : BUILD_MENU.muted,
        backgroundColor: active ? '#2a4433' : '#1a2228',
        padding: { x: 5, y: 4 },
        fixedWidth: tabW,
        align: 'center',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(112).setInteractive({ useHandCursor: true });
      tab.on('pointerdown', () => {
        this._engineerBuildCategory = c.key;
        this._buildMenuStructPage = 0;
        this._updateBottomPanel();
      });
      this._uiLayer.add(tab);
      this._dynBtns.push(tab);
    });
    ay += 26;

    const allOpts = getEngineerBuildOptions(this, eng);
    const pool = allOpts.filter(o => !o.header && o.category === cat);
    const PAGE_SIZE = 12;
    const totalPages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
    const page = Phaser.Math.Clamp(this._buildMenuStructPage || 0, 0, totalPages - 1);
    this._buildMenuStructPage = page;
    const slice = pool.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    let row = 0;
    let col = 0;
    for (const o of slice) {
      const bx = ax + col * (colW + gap);
      const by = ay + row * (btnH + gap);
      if (by + btnH > maxY - 30) break;
      const label = o.enabled ? o.label : `${o.label}  ✗`;
      const item = { label, enabled: o.enabled, cb: o.cb, color: o.enabled ? 0x2a5533 : 0x222222 };
      const btn = this._makeActionBtn(bx, by, label, item.color, () => this._runContextMenuItem(item, eng), {
        width: colW, height: btnH, fontSize: 9, dimmed: !o.enabled,
      });
      this._uiLayer.add(btn);
      this._dynBtns.push(btn);
      col += 1;
      if (col >= 2) { col = 0; row += 1; }
    }

    const navY = Math.min(maxY - 22, ay + (row + 1) * (btnH + gap) + 4);
    if (totalPages > 1) {
      if (page > 0) {
        const prev = this._makeActionBtn(ax, navY, '◀ PREV', 0x333355, () => {
          this._buildMenuStructPage = page - 1;
          this._updateBottomPanel();
        }, { width: 72, height: 22, fontSize: 9 });
        this._uiLayer.add(prev);
        this._dynBtns.push(prev);
      }
      const pgLbl = this._addBuildMenuText(ax + 80, navY + 4, `PAGE ${page + 1}/${totalPages}`, { fill: '#8899aa', font: '9px monospace' });
      pgLbl.setDepth(112);
      if (page < totalPages - 1) {
        const next = this._makeActionBtn(ax + 168, navY, 'NEXT ▶', 0x333355, () => {
          this._buildMenuStructPage = page + 1;
          this._updateBottomPanel();
        }, { width: 72, height: 22, fontSize: 9 });
        this._uiLayer.add(next);
        this._dynBtns.push(next);
      }
    }
  }

  _isCurrentPlayerHumanControlled() {
    if (this._aiViewerMode || this._mapBuilderMode) return false;
    const gs = this.gameState;
    if (!gs) return false;
    return !this._isAiControlled(gs.currentPlayer);
  }

  _canControlBuildMenu() {
    return this._isCurrentPlayerHumanControlled();
  }

  _isEngineerBuildPanelActive() {
    const gs = this.gameState;
    const u = this.selectedUnit;
    if (!gs || !u) return false;
    return !!(UNIT_TYPES[u.type]?.canBuild
      && Number(u.owner) === Number(gs.currentPlayer)
      && !u.constructing);
  }

  _layoutInspectorChrome() {
    const { panH, topY, inspPanH, inspTopY, actionCx, engineerPanel } = this._getBottomChromeLayout();
    const inspW = 500;
    const ix = inspW / 2 + 8;

    this.inspectorBg?.setPosition(ix, inspTopY + inspPanH / 2).setSize(inspW, inspPanH);
    this.inspectorAccent?.setPosition(ix, inspTopY + 1.5);
    const tabY = inspTopY + 8;
    for (const [key, tab] of Object.entries(this._inspectorTabBtns || {})) {
      const idx = key === 'unit' ? 0 : key === 'hex' ? 1 : 2;
      tab?.setPosition(12 + idx * 62, tabY);
    }
    this.inspectorTitle?.setPosition(12, inspTopY + 34);
    this.inspectorChips?.setPosition(12, inspTopY + 56);
    for (let i = 0; i < (this._inspectorLines?.length || 0); i++) {
      this._inspectorLines[i]?.setPosition(12, inspTopY + 76 + i * 18);
    }

    const actionW = engineerPanel ? 392 : 380;
    this.actionBg?.setPosition(actionCx, topY + panH / 2).setSize(actionW, panH).setVisible(true);
    this.actionAccent?.setPosition(actionCx, topY + 1).setVisible(true);
  }

  _updateInspectorTabVisuals() {
    const active = this._inspectorTab || 'unit';
    for (const [key, tab] of Object.entries(this._inspectorTabBtns || {})) {
      const on = key === active;
      tab?.setStyle({
        fill: on ? '#ffcc44' : '#8899aa',
        backgroundColor: on ? '#4a2080' : '#1a1028',
      });
    }
  }

  _resolveInspectorTab(gs) {
    if (this._inspectorTabManual) return this._inspectorTabManual;
    // Pin UNIT tab while a unit is selected (no auto-flip on hover)
    if (this.selectedUnit) return 'unit';
    const hex = this.hoveredHex;
    if (hex && isValid(hex.q, hex.r, this.mapSize)) {
      const bu = buildingAt(gs, hex.q, hex.r);
      if (bu && !ROAD_TYPES.has(bu.type)) return 'build';
      return 'hex';
    }
    return 'unit';
  }

  _inspectorUnitContent(gs, u) {
    const def = UNIT_TYPES[u.type];
    const isOwn = Number(u.owner) === Number(gs.currentPlayer);
    const displayName = isOwn && u.designId !== undefined
      ? (gs.designs[u.owner]?.find(d => d.id === u.designId)?.name || def.name)
      : def.name;
    const prefix = isOwn && u.designId !== undefined ? '★ ' : '';
    const tierIntel = this._unitTierIntelLabel(u);
    const threat = getUnitThreatBand(u);
    const tierLbl = isOwn ? tierIntel.label : `${threat.label}${tierIntel.certain ? ` · ${tierIntel.label}` : (tierIntel.label.startsWith('~') || tierIntel.label.includes('–') ? ` · est. ${tierIntel.label}` : '')}`;
    const title = `${prefix}${displayName}  ·  Player ${u.owner}  ·  ${tierLbl}`;
    const ap = (u.moved ? 0 : 1) + (u.attacked ? 0 : 1);
    const fuel = u.fuel !== undefined ? `  Fuel ${u.fuel}/${u.fuelMax}` : '';
    const chips = `HP ${u.health}/${u.maxHealth}  ·  AP ${ap}/2${fuel}  ·  MOV ${u.move ?? def.move}  ·  RNG ${u.range ?? def.range}`;
    const lines = [
      `Soft ${u.soft_attack ?? def.soft_attack}  ·  Hard ${u.hard_attack ?? def.hard_attack}  ·  Pierce ${u.pierce ?? def.pierce}  ·  Armor ${u.armor ?? def.armor}`,
    ];
    const pa = gs.pendingAttacks[u.id];
    const status = [];
    const sup = this._formatSupplyStatus(u, gs);
    if (sup) status.push(sup.level === 'warn' ? `⚠ ${sup.text}` : `⛔ ${sup.text}`);
    if (u.constructing) {
      const b = gs.buildings.find(bb => bb.id === u.constructing);
      if (b?.underConstruction) {
        status.push(`Building ${BUILDING_TYPES[b.type]?.name || b.type} (${b.buildProgress || 0}/${b.buildTurnsRequired || 1})`);
      }
    } else {
      if (u.suppressed) status.push('Suppressed');
      status.push(u.moved ? 'Moved' : 'Can move');
      status.push(pa ? 'Attack queued' : u.attacked ? 'Attacked' : u.suppressed ? '' : 'Can attack');
      if (u.dugIn) status.push('Dug in');
      if ((u.outOfSupply || 0) > 0 && !sup) status.push(`Out of supply ${u.outOfSupply}t`);
    }
    lines.push(status.filter(Boolean).join('  ·  '));

    if (sup?.pen) {
      lines.push(`Supply debuff: −${sup.pen.movePenalty} MOV, −${sup.pen.attackPenalty} ATK/DEF`);
    }

    const ttype = this.terrain?.[`${u.q},${u.r}`] ?? 0;
    const effects = [];
    if (ttype === 1) effects.push('Forest cover');
    else if (ttype === 2) effects.push('Mountain cover');
    else if (ttype === 0 || ttype === 6) {
      const infLike = new Set(['INFANTRY','ASSAULT_INFANTRY','SMG_SQUAD','LMG_TEAM','HMG_TEAM','SNIPER','ENGINEER','MEDIC','ANTI_TANK']);
      if (infLike.has(u.type) && !u.dugIn) effects.push('Open ground exposure');
    }
    const standB = gs.buildings.find(b => b.q === u.q && b.r === u.r && !ROAD_TYPES.has(b.type));
    const standRes = gs.resourceHexes[`${u.q},${u.r}`];
    if (standB) effects.push(`On ${BUILDING_TYPES[standB.type]?.name || standB.type}`);
    else if (standRes) effects.push(`On ${standRes.type} deposit`);
    lines.push(`Hex (${u.q},${u.r}) ${TERRAIN_LABELS[ttype] || 'Plains'}${effects.length ? '  ·  ' + effects.join('  ·  ') : ''}`);
    return { title, chips, lines };
  }

  _inspectorHexContent(gs, hex) {
    const key = `${hex.q},${hex.r}`;
    const ttype = this.terrain[key] ?? 0;
    const t = TERRAIN_LABELS[ttype] || 'Plains';
    const res = gs.resourceHexes[key];
    const bu = buildingAt(gs, hex.q, hex.r);
    const hu = unitAt(gs, hex.q, hex.r);
    const inSupply = isHexInSupply(gs, gs.currentPlayer, this.mapSize, hex.q, hex.r);
    const title = `Hex (${hex.q}, ${hex.r})  ·  ${t}`;
    const chips = res ? `${RESOURCE_TYPES[res.type]?.name || res.type} deposit` : (bu ? BUILDING_TYPES[bu.type]?.name : 'No resource');
    const lines = [
      bu ? `Building: ${BUILDING_TYPES[bu.type]?.name} (P${bu.owner})${bu.underConstruction ? ' — under construction' : ''}` : 'No structure on tile',
      hu ? `Unit present: P${hu.owner} ${UNIT_TYPES[hu.type]?.name}` : 'No unit on tile',
      `Supply: ${gs.supplyEnabled === false ? 'Disabled' : (inSupply ? 'In network' : 'Out of supply')}${roadAt(gs, hex.q, hex.r) ? '  ·  Road' : ''}`,
    ];
    return { title, chips, lines };
  }

  _inspectorBuildContent(gs, hex, fogVisible = null) {
    const bu = buildingAt(gs, hex.q, hex.r);
    if (!bu || ROAD_TYPES.has(bu.type)) {
      return {
        title: 'No building',
        chips: 'Select a hex with a structure',
        lines: ['Hover or click a tile with a VTC, Mine, HQ, etc.'],
      };
    }
    const def = BUILDING_TYPES[bu.type] || {};
    const viewer = Number(gs.currentPlayer);
    const isOwn = Number(bu.owner) === viewer;
    const isVtc = PRODUCTION_VTC_TYPES.has(bu.type);
    const facilityChips = isVtc ? getVtcFacilityChips(bu) : [];
    const title = isVtc
      ? `${def.name || bu.type}  ·  P${bu.owner}${facilityChips.length ? `  ·  ${facilityChips.join(' · ')}` : ''}`
      : `${def.name || bu.type}  ·  Player ${bu.owner}`;
    const chips = bu.underConstruction
      ? `Building… ${bu.buildProgress || 0}/${bu.buildTurnsRequired || 1} turns`
      : (isOwn ? 'Friendly' : 'Enemy')
        + (isVtc ? '  ·  VTC' : (def.canRecruit?.length ? `  ·  Recruits: ${def.canRecruit.length} types` : ''));
    const lines = [];
    if (!isVtc && def.buildCost) {
      const c = def.buildCost;
      lines.push(`Build cost: ${c.iron ? `⚙${c.iron} ` : ''}${c.wood ? `🪵${c.wood} ` : ''}${c.oil ? `🛢${c.oil}` : ''}`.trim());
    }
    const recruit = gs.pendingRecruits.find(r => r.buildingId === bu.id && Number(r.owner) === Number(bu.owner));
    if (recruit) lines.push(`Training: ${recruit.type || 'unit'} (${recruit.turnsLeft} turns left)`);
    if (isVtc) {
      lines.push(...getVtcInspectorLines(gs, viewer, bu, fogVisible));
    } else if (['VILLAGE', 'TOWN', 'CITY', 'HQ'].includes(bu.type) && isOwn) {
      const vs = getVtcQueueSummary(gs, bu.owner, bu.id);
      if (vs.training) {
        lines.push(`Training: ${UNIT_TYPES[vs.training.type]?.name || vs.training.type} (${vs.training.turnsLeft}t)`);
      }
      if (vs.pending.length > 1) lines.push(`Queued: ${vs.pending.length - 1} more`);
      if (vs.ready.length) lines.push(`Ready to deploy: ${vs.ready.length}`);
    }
    if (['VILLAGE', 'TOWN', 'CITY'].includes(bu.type) && isOwn && !isVtc) {
      const rad = VTC_SUPPLY_RADIUS[bu.type];
      if (rad) lines.push(`Supply bubble: ${rad} hexes (owned)`);
    }
    lines.push(`Location: (${bu.q}, ${bu.r})`);
    return { title, chips, lines };
  }

  _makeActionBtn(x, y, label, color, cb, opts = {}) {
    const w = opts.width ?? 118;
    const h = opts.height ?? 34;
    const fontSize = opts.fontSize ?? 11;
    const btn = this.add.text(x, y, label, {
      font: `bold ${fontSize}px monospace`, fill: opts.fill || '#f4f8ff',
      backgroundColor: `#${color.toString(16).padStart(6, '0')}`,
      padding: { x: 4, y: 3 }, fixedWidth: w, fixedHeight: h, align: 'center',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(opts.depth ?? 112).setInteractive({ useHandCursor: true });
    const run = () => {
      this._contextMenuClicked = true;
      cb();
    };
    btn.on('pointerdown', () => { this._contextMenuClicked = true; });
    btn.on('pointerup', (ptr) => { if (ptr.button === 0) run(); });
    btn.on('pointerover', () => {
      btn.setAlpha(0.88);
      if (opts.disabledReason) this._setBuildMenuHint(opts.disabledReason);
    });
    btn.on('pointerout', () => {
      btn.setAlpha(opts.dimmed ? 0.45 : 1.0);
      if (opts.disabledReason) this._setBuildMenuHint('');
    });
    if (opts.dimmed) btn.setAlpha(0.45);
    return btn;
  }

  _setBuildMenuHint(text) {
    if (!this._buildMenuHint) return;
    this._buildMenuHint.setText(text || '');
    this._buildMenuHint.setVisible(!!text);
  }

  _addBuildMenuText(x, y, text, style = {}) {
    const t = this.add.text(x, y, text, {
      font: style.font || '11px monospace',
      fill: style.fill || '#99aabb',
      backgroundColor: style.bg,
      padding: style.padding || { x: 4, y: 2 },
    }).setOrigin(style.originX ?? 0, style.originY ?? 0).setScrollFactor(0).setDepth(style.depth ?? 112);
    this._uiLayer.add(t);
    this._dynBtns.push(t);
    return t;
  }

  _renderBuildMenuTabBtn(ax, y, label, tabKey, active, icon = '', tabIndex = 0, tabW = 108) {
    const w = tabW, h = 26;
    const x = ax + tabIndex * (tabW + 2);
    const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, active ? BUILD_MENU.tabOn : BUILD_MENU.tabOff, active ? 0.98 : 0.92)
      .setStrokeStyle(2, active ? BUILD_MENU.accentHi : 0x334455)
      .setScrollFactor(0).setDepth(111).setInteractive({ useHandCursor: true });
    const txt = this.add.text(x + w / 2, y + h / 2, `${icon}${label}`, {
      font: 'bold 10px monospace',
      fill: active ? BUILD_MENU.gold : BUILD_MENU.muted,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(112);
    const click = () => {
      this._contextMenuClicked = true;
      this._buildMenuTab = tabKey;
      this._hideContextMenu(true);
      this._updateBottomPanel();
    };
    bg.on('pointerdown', click);
    txt.on('pointerdown', click);
    this._uiLayer.add(bg);
    this._uiLayer.add(txt);
    this._dynBtns.push(bg, txt);
  }

  _renderVtcProductionPanel(ax, y, gs, p, buildingId, panelW = 220) {
    const q = getVtcQueueSummary(gs, p, buildingId);
    const bg = this.add.rectangle(ax + panelW / 2, y + 18, panelW, 38, 0x141828, 0.95)
      .setStrokeStyle(1, 0x334455).setScrollFactor(0).setDepth(111);
    this._uiLayer.add(bg);
    this._dynBtns.push(bg);
    const train = q.training;
    const trainLabel = train
      ? `${UNIT_TYPES[train.type]?.name || train.type} (${train.turnsLeft ?? 0}t)`
      : 'idle';
    this._addBuildMenuText(ax + 6, y + 4, `TRAINING  ·  ${trainLabel}`, { fill: '#88bbdd', font: 'bold 9px monospace' });
    const queueNames = q.pending.slice(1).map(r => UNIT_TYPES[r.type]?.name || r.type).join(', ');
    this._addBuildMenuText(ax + 6, y + 16, `QUEUED ${q.pending.length}/${MAX_VTC_TRAIN_QUEUE}${queueNames ? `: ${queueNames}` : ''}`, {
      fill: '#778899', font: '9px monospace',
    });
    const readyNames = q.ready.map(r => UNIT_TYPES[r.type]?.name || r.type).join(', ') || '—';
    this._addBuildMenuText(ax + 6, y + 28, `READY (${q.ready.length}): ${readyNames}`, { fill: '#88dd99', font: '9px monospace' });
    if (q.pending.length > 0 && this._isHumanTurn()) {
      const cancel = this._addBuildMenuText(ax + panelW - 8, y + 4, '✕ cancel head', {
        fill: '#ff8888', font: '9px monospace', originX: 1,
      });
      cancel.setInteractive({ useHandCursor: true });
      cancel.on('pointerdown', () => {
        const out = cancelVtcQueueHead(gs, p, buildingId);
        if (out.ok) {
          const def = UNIT_TYPES[out.type];
          if (def?.cost) refundResources(gs.players[p], def.cost);
          gs.players[p].food = (gs.players[p].food || 0) + getRecruitFoodCost(out.type);
          recalcPlayerPopulation(gs, p);
        }
        this._refresh();
      });
    }
    return y + 42;
  }

  _formatRecruitCost(def, foodCost) {
    const parts = [];
    if (def.cost.iron) parts.push(`⚙${def.cost.iron}`);
    if (def.cost.oil) parts.push(`🛢${def.cost.oil}`);
    if (def.cost.wood) parts.push(`🪵${def.cost.wood}`);
    if (def.cost.components) parts.push(`🧩${def.cost.components}`);
    if (foodCost) parts.push(`🌾${foodCost}`);
    return parts.join(' ');
  }

  _inspectorProductionSummary(gs, p) {
    let training = 0, queued = 0, ready = 0;
    for (const b of gs.buildings) {
      if (Number(b.owner) !== Number(p) || !PRODUCTION_VTC_TYPES.has(b.type)) continue;
      const s = getVtcQueueSummary(gs, p, b.id);
      if (s.training) training++;
      queued += s.pending.length;
      ready += s.ready.length;
    }
    const plugged = isHQNetworkPluggedToNeutralRoads(gs, p, this.mapSize);
    return {
      title: 'War production',
      chips: `READY ${ready}  ·  QUEUED ${queued}  ·  TRAINING ${training}${plugged ? '' : '  ·  ⚠ plug HQ to road grid'}`,
      lines: [
        'Each VTC has its own train queue — click a settlement, use [B] UPGRADE / PRODUCE.',
        ready ? `Deploy ready units at their training VTC (${ready} waiting).` : 'No units ready — train at a captured VTC.',
      ],
    };
  }

  _isHumanTurn() {
    return this._canControlBuildMenu();
  }

  _toggleBuildMenu() {
    if (!this._canControlBuildMenu()) return;
    this._buildMenuOpen = !this._buildMenuOpen;
    if (!this._buildMenuOpen) {
      this._deployMode = null;
      this._deployHexes = [];
      this._hideContextMenu(true);
    }
    this._updateBottomPanel();
    this._redrawHighlights();
  }

  _focusBuildMenuBuilding(building) {
    if (!building || !PRODUCTION_VTC_TYPES.has(building.type)) return;
    this._buildMenuFocusBuilding = building;
    this._buildMenuOpen = true;
    const p = this.gameState.currentPlayer;
    const canUpgrade = ['VILLAGE', 'TOWN', 'CITY'].includes(building.type)
      && Number(building.owner) === Number(p) && !isPlayerCapitalBuilding(building);
    this._buildMenuTab = canUpgrade ? 'upgrade' : 'produce';
    this._updateBottomPanel();
  }

  _clearBuildMenuBuildingFocus() {
    this._buildMenuFocusBuilding = null;
  }

  _startDeployMode(readyId, buildingId = null) {
    const gs = this.gameState;
    const p = gs.currentPlayer;
    const bId = buildingId || this._buildMenuFocusBuilding?.id;
    const b = gs.buildings.find(x => x.id === bId);
    const ready = b?.readyUnits?.find(r => r.id === readyId);
    if (!ready || !bId) return;
    this._deployMode = { readyId, buildingId: bId };
    this._deployHexes = enumerateVtcDeployHexes(gs, p, bId, ready.type);
    this._buildMenuTab = 'deploy';
    this._buildMenuOpen = true;
    this._pushLog(`Deploy ${UNIT_TYPES[ready.type]?.name || ready.type}: click a purple hex`);
    this._updateBottomPanel();
    this._redrawHighlights();
  }

  _cancelDeployMode() {
    this._deployMode = null;
    this._deployHexes = [];
    this._redrawHighlights();
  }

  _formatUpgradeCost(cost = {}) {
    const parts = [];
    if (cost.iron) parts.push(`⚙${cost.iron}`);
    if (cost.oil) parts.push(`🛢${cost.oil}`);
    if (cost.wood) parts.push(`🪵${cost.wood}`);
    if (cost.components) parts.push(`🧩${cost.components}`);
    return parts.join(' ') || '—';
  }

  _renderBuildMenuUpgradeTab(ax, ay, gs, p, focus, panelH, bw, bh, gap) {
    const menu = getVtcUpgradeMenu(gs, p, focus.id);
    if (!menu) {
      this._addBuildMenuText(ax, ay, 'No upgrades for this site.', { fill: '#aa8888' });
      return;
    }
    if (!this._buildMenuHint) {
      this._buildMenuHint = this.add.text(ax, panelH - 22, '', {
        font: '10px monospace', fill: '#ffcc88', wordWrap: { width: 220 },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(113).setVisible(false);
      this._uiLayer.add(this._buildMenuHint);
    }
    this._buildMenuHint.setPosition(ax, panelH - 22);

    if (menu.promoting) {
      this._addBuildMenuText(ax, ay, `Promoting → ${BUILDING_TYPES[menu.promoteTarget]?.name || menu.promoteTarget} (${menu.promoteTurnsLeft}t left)`, {
        fill: '#ffdd88', font: 'bold 10px monospace',
      });
      return;
    }

    this._addBuildMenuText(ax, ay, `Upgrades ${menu.requiredDone}/${menu.requiredTotal} · Engineers build forts on the map`, {
      fill: '#99aabb', font: '9px monospace',
    });
    ay += 14;

    let col = 0;
    for (const it of menu.items) {
      if (it.external) {
        const mark = it.complete ? '✓' : '○';
        this._addBuildMenuText(ax, ay, `${mark} ${it.label}`, {
          fill: it.complete ? '#88cc88' : '#aa9988', font: '9px monospace',
        });
        ay += 12;
        continue;
      }
      const status = it.complete ? '✓' : it.building ? `${it.turnsLeft}t` : '+';
      const costStr = this._formatUpgradeCost(it.cost);
      const label = `${status} ${it.label}\n${costStr}`;
      const enabled = !it.complete && !it.building && it.canBuy;
      const bx = ax + col * (bw + gap);
      const btn = this._makeActionBtn(bx, ay, label, enabled ? 0x335544 : 0x252530, () => {
        const out = purchaseVtcUpgrade(gs, p, focus.id, it.id);
        if (!out.ok) this._pushLog(`Upgrade failed: ${out.reason}`);
        else this._pushLog(`Building ${it.label} (${out.turns} turns)`);
        this._refresh();
      }, {
        height: 38, fontSize: 9, dimmed: !enabled,
        disabledReason: it.complete ? 'Already built' : (it.building ? 'Under construction' : (it.reason || '')),
      });
      this._uiLayer.add(btn);
      this._dynBtns.push(btn);
      col += 1;
      if (col >= 2) { col = 0; ay += 42; }
      if (ay > panelH - 50) break;
    }
    if (col) ay += 42;

    if (menu.promoteTarget) {
      const promo = menu.canPromote;
      const pc = menu.promoteCost || {};
      const promoLabel = `↑ Promote ${BUILDING_TYPES[menu.promoteTarget]?.name}\n${this._formatUpgradeCost(pc)} · ${menu.promoteTurns}t`;
      const promoBtn = this._makeActionBtn(ax, ay, promoLabel, promo.ok ? 0x446633 : 0x333333, () => {
        const out = upgradeSettlement(gs, p, focus.id);
        if (!out.ok) this._pushLog(`Promote failed: ${out.reason}`);
        else this._pushLog(`Promoting → ${BUILDING_TYPES[out.target]?.name} (${out.turns} turns)`);
        this._buildMenuFocusBuilding = gs.buildings.find(b => b.id === focus.id) || null;
        this._refresh();
      }, {
        height: 40, fontSize: 9, dimmed: !promo.ok,
        disabledReason: promo.ok ? '' : (promo.reason || ''),
      });
      this._uiLayer.add(promoBtn);
      this._dynBtns.push(promoBtn);
    }
  }

  _renderBuildMenu() {
    const gs = this.gameState;
    const p = gs.currentPlayer;
    const { h, topY, contentLeft } = this._getBottomChromeLayout();
    const ax = contentLeft;
    let ay = topY + 8;
    const bw = 112, bh = 30, gap = 3;

    if (this._isEngineerBuildPanelActive()) {
      this._renderEngineerBuildPanel(this.selectedUnit);
      return;
    }

    if (this._buildMenuTab === 'struct') this._buildMenuTab = 'produce';
    const focus = this._buildMenuFocusBuilding;
    const anchor = focus && Number(focus.owner) === Number(p)
      ? focus
      : pickProductionAnchorBuilding(gs, p);

    const settleIcon = focus?.type === 'CITY' ? '🏙' : focus?.type === 'TOWN' ? '🏘'
      : (focus?.isCapital || focus?.type === 'HQ') ? '⭐' : focus?.type === 'VILLAGE' ? '🛖' : '⚔';
    this._addBuildMenuText(ax, ay, focus
      ? `${settleIcon} ${BUILDING_TYPES[focus.type]?.name || focus.type}`
      : '⚔ ARMY COMMAND', {
      font: 'bold 13px monospace', fill: BUILD_MENU.gold,
    });
    this._addBuildMenuText(ax + 228, topY + 6, '[B]', {
      font: '10px monospace', fill: BUILD_MENU.muted,
    });
    ay += 20;

    if (focus) {
      const def = BUILDING_TYPES[focus.type] || {};
      const chips = getVtcFacilityChips(focus);
      this._addBuildMenuText(ax, ay, `Owner P${focus.owner}  ·  (${focus.q},${focus.r})${chips.length ? `  ·  ${chips.join(' · ')}` : '  ·  buy facilities in UPGRADE'}`, {
        fill: '#99bbdd', font: '10px monospace',
      });
      ay += 14;
      const clr = this.add.text(ax + 218, topY + 8, '✕', {
        font: 'bold 12px monospace', fill: '#ffaaaa', backgroundColor: '#331111', padding: { x: 6, y: 2 },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(112).setInteractive({ useHandCursor: true });
      clr.on('pointerdown', () => { this._clearBuildMenuBuildingFocus(); this._updateBottomPanel(); });
      this._uiLayer.add(clr);
      this._dynBtns.push(clr);
    }

    const showUpgradeTab = focus && ['VILLAGE', 'TOWN', 'CITY'].includes(focus.type)
      && Number(focus.owner) === Number(p) && !isPlayerCapitalBuilding(focus);
    if (showUpgradeTab && this._buildMenuTab !== 'upgrade' && this._buildMenuTab !== 'produce' && this._buildMenuTab !== 'deploy') {
      this._buildMenuTab = 'upgrade';
    }

    const tabY = ay;
    const tabW = showUpgradeTab ? 72 : 108;
    let ti = 0;
    if (showUpgradeTab) {
      this._renderBuildMenuTabBtn(ax, tabY, 'UPGRADE', 'upgrade', this._buildMenuTab === 'upgrade', '⬆ ', ti++, tabW);
    }
    this._renderBuildMenuTabBtn(ax, tabY, 'PRODUCE', 'produce', this._buildMenuTab === 'produce', '⚙ ', ti++, tabW);
    this._renderBuildMenuTabBtn(ax, tabY, 'DEPLOY', 'deploy', this._buildMenuTab === 'deploy', '📍 ', ti++, tabW);
    ay += 32;

    if (this._buildMenuTab === 'upgrade' && showUpgradeTab) {
      this._renderBuildMenuUpgradeTab(ax, ay, gs, p, focus, h, bw, bh, gap);
      return;
    }

    const vtcId = anchor?.id;
    if (vtcId && PRODUCTION_VTC_TYPES.has(anchor.type)) {
      ay = this._renderVtcProductionPanel(ax, ay, gs, p, vtcId, 228);
    }

    if (this._buildMenuTab === 'deploy') {
      const ready = vtcId ? (getVtcQueueSummary(gs, p, vtcId).ready || []) : [];
      this._addBuildMenuText(ax, ay, 'Deploy only from the VTC that trained the unit.', {
        fill: '#ccaadd', font: '10px monospace',
      });
      ay += 14;
      if (this._deployMode) {
        const hint = this._addBuildMenuText(ax, ay, '▶ DEPLOY MODE — click purple hex  ·  tap here to cancel', {
          fill: '#ffccff', font: 'bold 10px monospace', bg: '#2a1040',
        });
        hint.setInteractive({ useHandCursor: true });
        hint.on('pointerdown', () => { this._cancelDeployMode(); this._updateBottomPanel(); });
        ay += 20;
      }
      if (!ready.length) {
        this._addBuildMenuText(ax, ay, 'Nothing ready at this VTC — train on PRODUCE.', { fill: '#888888' });
        return;
      }
      for (const r of ready) {
        const active = this._deployMode?.readyId === r.id;
        const def = UNIT_TYPES[r.type] || {};
        const label = `${active ? '▶ ' : ''}Deploy ${def.name || r.type}`;
        const btn = this._makeActionBtn(ax, ay, label, active ? BUILD_MENU.deploy : 0x2a4455, () => this._startDeployMode(r.id, vtcId), {
          width: 228, height: 32, fontSize: 11,
        });
        this._uiLayer.add(btn);
        this._dynBtns.push(btn);
        ay += 36;
      }
      return;
    }

    // PRODUCE tab
    if (!anchor) {
      this._addBuildMenuText(ax, ay, 'Click a captured village / town / city on the map.', {
        fill: '#aa8888', font: '11px monospace',
      });
      return;
    }
    const anchorName = BUILDING_TYPES[anchor.type]?.name || anchor.type;
    this._addBuildMenuText(ax, ay, `Local queue · ${anchorName}`, { fill: '#aabbcc', font: 'bold 10px monospace' });
    ay += 14;
    const coastalR = getNavalCoastalCheckRadius(anchor);
    const anchorCoastal = isNavalDeployAllowed(gs, anchor, coastalR);
    if (anchorCoastal) {
      this._addBuildMenuText(ax, ay, `Naval: queue here · deploy on water within ${getNavalDeployRadius(anchor)} hex`, {
        fill: '#88ccff', font: '10px monospace',
      });
      ay += 14;
    } else {
      const coastalAlt = getOwnedDeployVTBuildings(gs, p).find(b =>
        isNavalDeployAllowed(gs, b, getNavalCoastalCheckRadius(b)));
      if (coastalAlt) {
        const altName = BUILDING_TYPES[coastalAlt.type]?.name || coastalAlt.type;
        this._addBuildMenuText(ax, ay, `Naval: click coastal ${altName} on map (${coastalAlt.q},${coastalAlt.r})`, {
          fill: '#7799bb', font: '10px monospace',
        });
        ay += 14;
      }
    }
    if (!this._buildMenuHint) {
      this._buildMenuHint = this.add.text(ax, ay, '', {
        font: '10px monospace', fill: '#ffcc88', wordWrap: { width: 220 },
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(113).setVisible(false);
      this._uiLayer.add(this._buildMenuHint);
    }
    this._buildMenuHint.setPosition(ax, h - 22);
    const catalog = getProduceCatalog(gs, p, anchor.id);
    const pl = gs.players[p];
    const rowW = 228;
    for (const entry of catalog) {
      const { unitType, canQueue, reason } = entry;
      const def = UNIT_TYPES[unitType];
      if (!def) continue;
      const foodCost = getRecruitFoodCost(unitType);
      const canAfford = (pl.iron || 0) >= (def.cost.iron || 0) && (pl.oil || 0) >= (def.cost.oil || 0)
        && (pl.food || 0) >= foodCost && (pl.components || 0) >= (def.cost.components || 0);
      const enabled = canQueue && canAfford;
      const costStr = this._formatRecruitCost(def, foodCost);
      const label = `${def.name}  ${costStr}  ⏱${def.buildTime ?? 1}`;
      const btn = this._makeActionBtn(ax, ay, label, enabled ? BUILD_MENU.produce : 0x252530, () => {
        if (!canQueue) return;
        const out = queueGlobalRecruit(gs, p, unitType, anchor.id);
        if (!out.ok) this._pushLog(`Queue failed: ${out.reason}`);
        else this._pushLog(`Queued ${def.name} at ${anchorName}`);
        this._refresh();
      }, {
        width: rowW, height: 28, fontSize: 9, dimmed: !enabled,
        disabledReason: !canQueue ? reason : (!canAfford ? 'Cannot afford' : ''),
      });
      this._uiLayer.add(btn);
      this._dynBtns.push(btn);
      ay += 30;
      if (ay > h - 36) break;
    }
    const localReady = getVtcQueueSummary(gs, p, anchor.id).ready;
    if (localReady.length) {
      const depHint = this._addBuildMenuText(ax, ay + 4, `✓ ${localReady.length} ready here — DEPLOY tab`, {
        fill: '#88ffaa', font: 'bold 10px monospace',
      });
      depHint.setInteractive({ useHandCursor: true });
      depHint.on('pointerdown', () => { this._buildMenuTab = 'deploy'; this._updateBottomPanel(); });
    }
  }

  _updateBottomPanel() {
    this._layoutInspectorChrome();
    const gs = this.gameState;
    const u = this.selectedUnit;
    const canAct = u && Number(u.owner) === Number(gs.currentPlayer);

    this._inspectorTab = this._resolveInspectorTab(gs);
    this._updateInspectorTabVisuals();

    let content = { title: 'Inspector', chips: 'Select a unit or use tabs', lines: ['UNIT = selected unit · HEX = terrain · BUILD = structure'] };
    if (this._inspectorTab === 'unit' && u) {
      content = this._inspectorUnitContent(gs, u);
    } else if (this._inspectorTab === 'unit' && !u && this._isHumanTurn()) {
      content = this._inspectorProductionSummary(gs, gs.currentPlayer);
    } else if (this._inspectorTab === 'unit' && !u) {
      content = { title: 'No unit selected', chips: 'Click your unit on the map', lines: ['Hover a hex for terrain info (HEX tab)'] };
    } else if (this._inspectorTab === 'build' && this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r, this.mapSize)) {
      content = this._inspectorBuildContent(gs, this.hoveredHex, this._currentFog);
    } else if (this._inspectorTab === 'hex' && this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r, this.mapSize)) {
      content = this._inspectorHexContent(gs, this.hoveredHex);
    } else if (u) {
      content = this._inspectorUnitContent(gs, u);
    }

    this.inspectorTitle?.setText(content.title);
    this.inspectorChips?.setText(content.chips || '');
    for (let i = 0; i < (this._inspectorLines?.length || 0); i++) {
      this._inspectorLines[i]?.setText(content.lines?.[i] || '');
    }

    this._dynBtns.forEach(b => { try { b.destroy(); } catch (e) {} });
    this._dynBtns = [];
    this._hideContextMenu(true);

    const canBuild = this._canControlBuildMenu();
    this.actionBg?.setVisible(canBuild);
    this.actionAccent?.setVisible(canBuild);

    if (canBuild) {
      if (this._buildMenuOpen) {
        this._renderBuildMenu();
      } else {
        const { contentLeft, topY: ty } = this._getBottomChromeLayout();
        const hint = this.add.text(contentLeft, ty + 24, '[B]  BUILD MENU', {
          font: 'bold 12px monospace', fill: '#ddaaff', backgroundColor: '#2a1040', padding: { x: 8, y: 6 },
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(110).setInteractive({ useHandCursor: true });
        hint.on('pointerdown', () => this._toggleBuildMenu());
        this._uiLayer.add(hint);
        this._dynBtns.push(hint);
      }
    }
  }

  _hideBuildMenu() { this._buildMenuOpen = false; this._cancelDeployMode(); this._updateBottomPanel(); }

  // ── Recruitment panel ─────────────────────────────────────────────────────
  _createRecruitPanel() {
    // Panel uses plain screen-space objects (no Container — avoids input issues)
    this.recruitPanel = { visible: false, objects: [] };
  }

  _showRecruitPanel(building) {
    this._hideRecruitPanel();
    this.recruitBuilding = building;
    const gs = this.gameState;
    const isVTC = ['VILLAGE', 'TOWN', 'CITY', 'HQ'].includes(building.type);
    const available = isVTC
      ? getGlobalRecruitOptionsForVTC(gs, gs.currentPlayer, building.id)
      : BUILDING_TYPES[building.type].canRecruit;
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
    const buildingQueue = isVTC
      ? (getVtcQueueSummary(gs, p, building.id).pending || [])
      : gs.pendingRecruits.filter(r => r.buildingId === building.id && r.owner === p);
    const readyGlobal = isVTC ? (getVtcQueueSummary(gs, p, building.id).ready || []) : [];
    if (buildingQueue.length > 0) {
      const next = buildingQueue[0];
      const orderName = UNIT_TYPES[next.type]?.name || '?';
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
        const cost = refundType ? UNIT_TYPES[refundType].cost : { iron: 0, oil: 0 };
        refundResources(gs.players[p], cost);
        if (refundType) {
          gs.players[p].food = (gs.players[p].food || 0) + getRecruitFoodCost(refundType);
          recalcPlayerPopulation(gs, p);
        }
        if (isVTC) {
          cancelVtcQueueHead(gs, p, building.id);
        } else {
          const idx = gs.pendingRecruits.findIndex(r => r === toCancel);
          if (idx >= 0) gs.pendingRecruits.splice(idx, 1);
        }
        this._hideRecruitPanel();
        this._showRecruitPanel(building);
        this._refresh();
      });
      cancelBtn.on('pointerover', () => cancelBtn.setAlpha(0.8));
      cancelBtn.on('pointerout',  () => cancelBtn.setAlpha(1.0));
      objs.push(cancelBtn);
    }

    if (isVTC && readyGlobal.length > 0) {
      const readyTxt = this.add.text(w/2, py + (buildingQueue.length > 0 ? 100 : 58), `📦 Ready to deploy: ${readyGlobal.map(r => UNIT_TYPES[r.type]?.name || r.type).join(', ')}`, {
        font: '11px monospace', fill: '#a8e6ff', backgroundColor: '#0f2333', padding: { x: 8, y: 5 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
      objs.push(readyTxt);
      const deployBtn = this.add.text(w/2, py + (buildingQueue.length > 0 ? 124 : 82), '[ DEPLOY NEXT HERE ]', {
        font: '11px monospace', fill: '#88ddaa', backgroundColor: '#133322', padding: { x: 8, y: 5 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true });
      deployBtn.on('pointerdown', () => {
        this._contextMenuClicked = true;
        const nextReady = readyGlobal[0];
        if (!nextReady) return;
        const sites = enumerateVtcDeployHexes(gs, p, building.id, nextReady.type);
        const site = sites[0];
        const out = site
          ? deployReadyVtcUnitAtHex(gs, p, building.id, nextReady.id, site.q, site.r)
          : { ok: false, reason: 'No deploy hex' };
        if (!out.ok) this._pushLog(`Deploy failed: ${out.reason}`);
        else this._pushLog(`P${p} deployed ${UNIT_TYPES[nextReady.type]?.name || nextReady.type} at ${BUILDING_TYPES[building.type].name}`);
        this._hideRecruitPanel();
        this._refresh();
      });
      objs.push(deployBtn);
    }

    const extraReadyRows = isVTC && readyGlobal.length > 0 ? 48 : 0;
    const baseRowY = py + 50 + (buildingQueue.length > 0 ? 62 : 0) + extraReadyRows;
    const rowH = 52, rowW = panelW - 24;

    available.forEach((unitType, i) => {
      const def = UNIT_TYPES[unitType];
      const queueCapReached = buildingQueue.length >= 6;
      const foodCost = getRecruitFoodCost(unitType);
      const canAfford = !queueCapReached && playerHasResources(gs.players[p], def.cost) && (gs.players[p].food||0) >= foodCost;
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
      const popCost = getUnitPopCost(unitType);
      recalcPlayerPopulation(gs, p);
      const popGate = isVTC ? canAffordPipelinePop(gs, p, unitType) : { ok: (gs.players[p].population || 0) >= popCost };
      const hasPop = popGate.ok;
      const costStr = `⚙${def.cost.iron||0}${(def.cost.oil||0) > 0 ? `  🛢${def.cost.oil}` : ''}${(def.cost.components||0) > 0 ? `  🧩${def.cost.components}` : ''}${foodCost > 0 ? `  🌾${foodCost}` : ''}  👥${popCost}`;
      const costClr = (canAfford && hasPop) ? '#88bb66' : '#554444';
      const costTxt = this.add.text(w/2 + rowW/2 - 12, ry, costStr, {
        font: 'bold 12px monospace', fill: costClr
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(201);
      objs.push(costTxt);

      if (canAfford && hasPop) {
        rowBg.on('pointerdown', () => {
          this._contextMenuClicked = true;
          if (isVTC) queueGlobalRecruit(gs, p, unitType, building.id);
          else queueRecruit(gs, p, unitType, building.id);
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
    const customDesigns = isVTC ? [] : (gs.designs[p] || []).filter(d => CHASSIS_BUILDINGS[d.chassis] === btype);
    customDesigns.forEach((design, i) => {
      const idx = available.length + i;
      const queueCapReached = buildingQueue.length >= 6;
      const dFoodCost = getRecruitFoodCost(design.chassis);
      const dPopCost = getUnitPopCost(design.chassis);
      recalcPlayerPopulation(gs, p);
      const canAfford = !queueCapReached && playerHasResources(gs.players[p], design.trainCost) && (gs.players[p].food||0) >= dFoodCost
        && (gs.players[p].population || 0) >= dPopCost;
      const _dbt = UNIT_TYPES[design.chassis]?.buildTime ?? 1;
      const ry = baseRowY + idx * rowH + rowH/2;
      const shownTier = design.effectiveTier ?? computeEffectiveTier(design.chassis, design.modules || [], design.stats);

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

      const costTxt = this.add.text(w/2 + rowW/2 - 12, ry, `${formatResourceCost(design.trainCost)}${dFoodCost > 0 ? `  🌾${dFoodCost}` : ''}  👥${dPopCost}`, {
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
          if (!playerHasResources(gs.players[p], cost)) return;
          if (gs.designs[p].length >= getMaxDesignSlots(gs, p)) return;
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
    const unlockedTechs = new Set(gs.players[player]?.research?.unlocked || []);
    const maxSlots = getMaxDesignSlots(gs, player);
    const nameDisplay = designName || (selectedChassis ? `${UNIT_TYPES[selectedChassis].name} Mk.${gs.designs[player].length + 1}` : 'New Design');
    line(`Name: "${nameDisplay}"  (set on Register)`, '#ffdd88');
    line(`Slots: ${gs.designs[player].length}/${maxSlots}  (base ${BASE_DESIGN_SLOTS})  |  Iron: ${gs.players[player].iron}  Oil: ${gs.players[player].oil}`, '#888888');
    if (gs.designs[player].length >= maxSlots) {
      const nextSlot = getNextDesignSlotTech(unlockedTechs);
      if (nextSlot) line(`Unlock +1 slot: ${nextSlot.name} (${nextSlot.cost} RP, Industrial)`, '#ffaa66');
    }
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
    const effTier = computeEffectiveTier(selectedChassis, [...selectedModules], preview);
    const canAfford = playerHasResources(gs.players[player], cost);
    const slotsFull = gs.designs[player].length >= maxSlots;

    line(`Effective tier: T${effTier}`, '#ffcc66', true);
    line(`Preview: HP${preview.health} MOV${preview.move} RNG${preview.range} SA${preview.soft_attack} HA${preview.hard_attack} PRC${preview.pierce} ARM${preview.armor} DEF${preview.defense}`, '#aaddff', true);
    line(`Register: ${formatResourceCost(cost)}  ${!canAfford ? '(NOT ENOUGH)' : slotsFull ? '(SLOTS FULL)' : '(affordable)'}`, canAfford && !slotsFull ? '#88ff88' : '#ff6666');
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
            const unlockedTechs = new Set(gs.players[p]?.research?.unlocked || []);
            const gate = canPlayerUseModule(gs, p, mk, unlockedTechs);
            if (!gate.ok) return;
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
          if (!playerHasResources(gs.players[p], cost)) return;
          if ((gs.designs[p]?.length || 0) >= getMaxDesignSlots(gs, p)) return;
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
    const panW  = Math.min(w - 160, 780);
    const panH  = Math.min(h - 130, 560);
    const px    = w / 2 - panW / 2;
    const py    = 78;
    const col1X = px + 16;        // left column x (chassis + modules)
    const col2X = px + panW * 0.55; // right column x (stat comparison + designs)
    const col2W = panW * 0.42;

    // Background — interactive to absorb all clicks and prevent bleed-through
    const bg = this.add.rectangle(w/2, py + panH/2, panW, panH, 0x0c1018, 0.97)
      .setStrokeStyle(3, 0x88cc66).setScrollFactor(0).setDepth(D)
      .setInteractive();
    bg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(bg);

    // Header strip
    const hdr = this.add.rectangle(w/2, py + 22, panW, 44, 0x1a2838, 1)
      .setScrollFactor(0).setDepth(D);
    objs.push(hdr);
    this.add.rectangle(w/2, py + 2, panW, 4, 0x66ccff, 1).setScrollFactor(0).setDepth(D + 1);
    objs.push(this.add.text(w/2, py + 22, '🔧  UNIT DESIGNER', {
      font: 'bold 16px monospace', fill: '#a8e8ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1));

    // Slot / resource info
    const maxDesignSlots = getMaxDesignSlots(gs, p);
    const slotFull = (gs.designs[p]?.length || 0) >= maxDesignSlots;
    const indTier = getPlayerIndustryTier(gs, p);
    const slotHint = slotFull ? (getNextDesignSlotTech(gs.players[p]?.research?.unlocked)?.name || 'max slots') : '';
    objs.push(this.add.text(col2X + col2W, py + 22,
      `Slots ${gs.designs[p]?.length || 0}/${maxDesignSlots}  ·  Industry T${indTier}  ·  🧩${gs.players[p].components || 0}  🔩${gs.players[p].hardenedSteel || 0}  ✈${gs.players[p].aviationAlloy || 0}${slotFull && slotHint ? `  ·  +1: ${slotHint}` : ''}`, {
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
      const lbl = this.add.text(tx + tabW/2, ty + tabH/2, `${def?.name || ch} [T${getChassisTier(ch)}]`, {
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
      const modEntries = Object.entries(MODULES).filter(([, m]) => m.chassis.includes(selChassis));
      if (modEntries.length === 0) {
        objs.push(this.add.text(col1X, ly, '(no modules for this chassis)', {
          font: '10px monospace', fill: '#445544'
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
        ly += 16;
      }

      const modW = panW * 0.50 - 20;
      for (const [key, mod] of modEntries) {
        const gate = canPlayerUseModule(gs, p, key, unlockedTechs);
        const sel = selMods.has(key);
        const deltaStr = Object.entries(mod.statDelta).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ');
        const matStr = formatResourceCost(getModuleResourceCost(mod));
        const rowBg = this.add.rectangle(col1X + modW / 2, ly + 13, modW, 26,
          sel ? 0x1a3a1a : 0x0e140e, 1)
          .setStrokeStyle(1, sel ? 0x44cc44 : (gate.ok ? 0x1e2e1e : 0x442222))
          .setScrollFactor(0).setDepth(D + 1);
        if (gate.ok) {
          rowBg.setInteractive({ useHandCursor: true });
          rowBg.on('pointerdown', () => {
            this._contextMenuClicked = true;
            this.tweens.add({ targets: rowBg, scaleX: 1.04, scaleY: 1.04, duration: 70, yoyo: true });
            onMod(key);
          });
          rowBg.on('pointerover', () => rowBg.setFillStyle(sel ? 0x1a4a1a : 0x141e14));
          rowBg.on('pointerout', () => rowBg.setFillStyle(sel ? 0x1a3a1a : 0x0e140e));
        }
        objs.push(rowBg);
        const nameFill = !gate.ok ? '#664444' : (sel ? '#aaffaa' : '#668866');
        objs.push(this.add.text(col1X + 6, ly + 8, `${sel ? '✓' : '○'} ${mod.name}  [M${mod.tier ?? 0}]`, {
          font: `${sel ? 'bold ' : ''}10px monospace`, fill: nameFill,
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2));
        if (!gate.ok) {
          objs.push(this.add.text(col1X + 6, ly + 20, gate.reason, {
            font: '9px monospace', fill: '#aa6666',
          }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2));
        }
        objs.push(this.add.text(col1X + modW * 0.42, ly + 13, deltaStr, {
          font: '9px monospace', fill: sel ? '#88ffcc' : '#446644',
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 2));
        objs.push(this.add.text(col1X + modW - 6, ly + 13, matStr || '—', {
          font: '9px monospace', fill: '#556655',
        }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 2));
        ly += 28;
      }
    }

    // ── RIGHT COLUMN: Stat comparison + existing designs ──────────────────
    let ry = py + 56;

    if (selChassis) {
      const base    = UNIT_TYPES[selChassis];
      const preview = computeDesignStats(selChassis, [...selMods]);
      const regCost = designRegistrationCost([...selMods]);
      const effTier = computeEffectiveTier(selChassis, [...selMods], preview);
      const maxTier = getPlayerMaxTrainableTier(gs, p);
      const pl = gs.players[p];
      const canAfford = playerHasResources(pl, regCost);
      const tierOk = effTier <= maxTier;

      const TIER_FILL_HEX = ['#8a9aaa', '#4da3ff', '#e49c3d', '#d9534f', '#c44dff', '#ff3366'];
      objs.push(this.add.text(col2X, ry, `EFFECTIVE UNIT TIER  T${effTier}`, {
        font: 'bold 12px monospace', fill: TIER_FILL_HEX[effTier] || '#8a9aaa',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1));
      ry += 18;
      objs.push(this.add.text(col2X, ry, `Industry cap T${maxTier} · chassis T${getChassisTier(selChassis)} + modules + budget`, {
        font: '9px monospace', fill: tierOk ? '#778877' : '#cc8866',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1));
      ry += 14;
      if (!tierOk) {
        objs.push(this.add.text(col2X, ry, `⚠ Design exceeds industry — trim modules or upgrade factories`, {
          font: '9px monospace', fill: '#ffaa66',
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1));
        ry += 14;
      }

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
      const trainCost = designTrainCost(selChassis, [...selMods]);
      objs.push(this.add.text(col2X, ry, `Train / unit:  ${formatResourceCost(trainCost)}`, {
        font: '10px monospace', fill: '#99aa66',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1));
      ry += 16;
      objs.push(this.add.text(col2X, ry, `Register (once):  ${formatResourceCost(regCost)}`, {
        font: '10px monospace', fill: canAfford ? '#88cc66' : '#cc4444',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1));
      ry += 22;

      // Register button
      const btnColor = (canAfford && !slotFull && tierOk) ? 0x226633 : 0x222222;
      const btnTxtClr = (canAfford && !slotFull && tierOk) ? '#aaffaa' : '#555555';
      const regBtnW = col2W, regBtnH = 30;
      const regBtnBg = this.add.rectangle(col2X + col2W/2, ry + regBtnH/2, regBtnW, regBtnH, btnColor, 1)
        .setStrokeStyle(1, canAfford && !slotFull && tierOk ? 0x44aa66 : 0x333333)
        .setScrollFactor(0).setDepth(D+1);
      objs.push(regBtnBg);
      const regBtnLbl = this.add.text(col2X + col2W/2, ry + regBtnH/2,
        slotFull ? '[ DESIGN SLOTS FULL ]' : (!tierOk ? '[ TIER TOO HIGH ]' : (canAfford ? '[ NAME & REGISTER DESIGN ]' : '[ CANNOT AFFORD ]')), {
        font: 'bold 11px monospace', fill: btnTxtClr
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2);
      objs.push(regBtnLbl);
      if (canAfford && !slotFull && tierOk) {
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
      objs.push(this.add.text(col2X, ry, `MY DESIGNS  (${designs.length}/${getMaxDesignSlots(gs, p)})`, {
        font: 'bold 10px monospace', fill: '#668866'
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1));
      ry += 16;

      for (const d of designs) {
        const base    = UNIT_TYPES[d.chassis];
        const bldType = CHASSIS_BUILDINGS[d.chassis] || '?';
        const modNames = (d.modules || []).map(mk => MODULES[mk]?.name || mk).join(', ') || 'none';
        const statStr  = `HP${d.stats.health} MOV${d.stats.move} SA${d.stats.soft_attack} HA${d.stats.hard_attack} ARM${d.stats.armor}`;
        const trainStr = formatResourceCost(d.trainCost);
        const dTier = d.effectiveTier ?? computeEffectiveTier(d.chassis, d.modules, d.stats);

        const rowH2 = 44;
        const dRowBg = this.add.rectangle(col2X + col2W/2, ry + rowH2/2, col2W, rowH2, 0x0c1a10, 1)
          .setStrokeStyle(1, 0x224422).setScrollFactor(0).setDepth(D+1);
        objs.push(dRowBg);

        objs.push(this.add.text(col2X + 6, ry + 6, `★ ${d.name}  [T${dTier}]`, {
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
        if (this._contextMenuObjs?.length && this._contextMenuHitTest(ptr.x, ptr.y)) {
          this._contextMenuClicked = true;
        }
        this._isDragging = false;
        this._dragStart = { x: ptr.x, y: ptr.y };
        this._dragStartScroll = { x: cam.scrollX, y: cam.scrollY };
        // Snapshot panel state at mousedown — so pointerup knows not to re-open it
        this._panelOpenAtMouseDown = !!this.recruitPanel?.visible;
      }
    });

    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 0) {
        if (this._mapBuilderMode) {
          const world = cam.getWorldPoint(ptr.x, ptr.y);
          const hex = worldToHex(world.x, world.y);
          if (isValid(hex.q, hex.r, this.mapSize)) this._builderPaint(hex.q, hex.r);
        } else {
          const dx = ptr.x - this._dragStart.x, dy = ptr.y - this._dragStart.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this._isDragging = true;
          if (this._isDragging) {
            cam.setScroll(this._dragStartScroll.x - dx/cam.zoom, this._dragStartScroll.y - dy/cam.zoom);
          }
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
      let overMenu = false;
      // When the standalone designer is open, block world-click handling entirely.
      if (this._designerOpen) {
        this._contextMenuClicked = false;
        this._isDragging = false;
        return;
      }
      if (ptr.button === 0 && !this._isDragging && !this._panelOpenAtMouseDown) {
        overMenu = !!(this._contextMenuObjs?.length && this._contextMenuHitTest(ptr.x, ptr.y));
        if (this._contextMenuDismissLock) {
          this._contextMenuClicked = true;
          this._contextMenuDismissLock = false;
        } else if (overMenu) {
          this._contextMenuClicked = true;
        }
        if (this._contextMenuObjs && !this._contextMenuClicked) {
          this._hideContextMenu(true);
        }
        if (!this._contextMenuClicked) {
          const world = cam.getWorldPoint(ptr.x, ptr.y);
          const hex   = worldToHex(world.x, world.y);
          this._lastClickPos = { x: ptr.x, y: ptr.y };
          if (isValid(hex.q, hex.r, this.mapSize)) this._onHexClick(hex.q, hex.r);
        }
      }
      const keepMenuClick = overMenu && this._contextMenuClicked;
      if (!keepMenuClick) this._contextMenuClicked = false;
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
      if (this._mapBuilderMode && this._builder) this._builder.lastPaintKey = null;
    });

    // Suppress browser context menu so right-click works in-game
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.input.on('wheel', (_ptr, _o, _dx, dy) => {
      if (this._researchOpen && this._researchTreeBounds) {
        const b = this._researchTreeBounds;
        const mx = _ptr.x, my = _ptr.y;
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          const max = this._researchMaxScroll || 0;
          this._researchScrollY = Phaser.Math.Clamp((this._researchScrollY || 0) - dy * 0.45, -max, 0);
          this._researchRenderBranch?.(this._researchSelBranch);
          return;
        }
      }
      // Centered zoom: always zoom toward screen center (no top-left drift).
      const step = 1.10;
      const dir = dy > 0 ? -1 : 1; // wheel down => zoom out
      const factor = dir > 0 ? step : (1 / step);
      if (this._zoomTarget === undefined) this._zoomTarget = cam.zoom;
      this._zoomTarget = Phaser.Math.Clamp(this._zoomTarget * factor, 0.2, 4.0);
      this._zoomPointer = this._playfieldScreenCenter();
      this._zoomLastInputAt = performance.now();
    });

    this.input.keyboard.enableGlobalCapture();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this._shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    const queueZoomStep = (zoomIn) => {
      const step = 1.10;
      const factor = zoomIn ? step : (1 / step);
      if (this._zoomTarget === undefined) this._zoomTarget = cam.zoom;
      this._zoomTarget = Phaser.Math.Clamp(this._zoomTarget * factor, 0.2, 4.0);
      this._zoomPointer = this._playfieldScreenCenter();
      this._zoomLastInputAt = performance.now();
    };

    // Keyboard zoom increments: [ = out, ] = in
    this.input.keyboard.on('keydown', (ev) => {
      if (this._nameModalOpen || this._mapBuilderMode) return;
      if (ev.code === 'BracketLeft') queueZoomStep(false);
      else if (ev.code === 'BracketRight') queueZoomStep(true);
    });
    if (this._mapBuilderMode) {
      this.input.keyboard.on('keydown-T', () => { if (!this._builder) return; this._builder.mode = 'terrain'; this._updateBuilderHud(); });
      this.input.keyboard.on('keydown-R', () => { if (!this._builder) return; this._builder.mode = 'resource'; this._updateBuilderHud(); });
      this.input.keyboard.on('keydown-B', () => { if (!this._builder) return; this._builder.mode = 'building'; this._updateBuilderHud(); });
      this.input.keyboard.on('keydown-U', () => { if (!this._builder) return; this._builder.mode = 'unit'; this._updateBuilderHud(); });
      this.input.keyboard.on('keydown-X', () => { if (!this._builder) return; this._builder.mode = 'erase'; this._updateBuilderHud(); });
      this.input.keyboard.on('keydown-Q', () => { if (!this._builder) return; this._builder.owner = 1; this._updateBuilderHud(); });
      this.input.keyboard.on('keydown-E', () => { if (!this._builder) return; this._builder.owner = 2; this._updateBuilderHud(); });
      this.input.keyboard.on('keydown-I', () => {
        const raw = window.prompt('Paste map JSON');
        if (raw) this._importCustomMapJson(raw);
      });
      this.input.keyboard.on('keydown-O', () => {
        const txt = this._exportCustomMapJson();
        if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(txt).catch(() => {});
        window.prompt('Map JSON (copied if browser allows):', txt);
      });
      this.input.keyboard.on('keydown-Z', () => {
        if (!this._builder?.history?.length) return;
        this._builder.future.push(this._builderSnapshot());
        const prev = this._builder.history.pop();
        this._builderApplySnapshot(prev);
      });
      this.input.keyboard.on('keydown-Y', () => {
        if (!this._builder?.future?.length) return;
        this._builder.history.push(this._builderSnapshot());
        const next = this._builder.future.pop();
        this._builderApplySnapshot(next);
      });
      this.input.keyboard.on('keydown-V', () => {
        const valid = this._validateBuilderMap();
        const msg = valid.ok ? 'Builder validation OK.' : `Builder validation failed: ${valid.reason}`;
        this._pushLog(msg);
        if (!valid.ok) window.alert(msg);
      });
      this.input.keyboard.on('keydown-P', () => {
        const valid = this._validateBuilderMap();
        if (!valid.ok) { this._pushLog(`Builder validate failed: ${valid.reason}`); return; }
        const customMap = JSON.parse(this._exportCustomMapJson());
        this.scene.start('GameScene', { scenario: 'custom', customSize: this.mapSize, aiP2: this._aiP2, aiStrategy: 'balanced', customMap });
      });
      this.input.keyboard.on('keydown', (ev) => {
        if (!this._builder) return;
        const n = Number(ev.key);
        if (Number.isInteger(n) && n >= 1 && n <= 8) {
          this._builder.terrainType = n - 1;
          this._updateBuilderHud();
          return;
        }
        if (ev.code === 'BracketLeft') {
          if (this._builder.mode === 'building') this._builder.buildingIdx = (this._builder.buildingIdx - 1 + this._builder.buildingTypes.length) % this._builder.buildingTypes.length;
          if (this._builder.mode === 'unit') this._builder.unitIdx = (this._builder.unitIdx - 1 + this._builder.unitTypes.length) % this._builder.unitTypes.length;
          if (this._builder.mode === 'resource') {
            this._builder.resourceIdx = (this._builder.resourceIdx - 1 + this._builder.resourceTypes.length) % this._builder.resourceTypes.length;
            this._builder.resourceType = this._builder.resourceTypes[this._builder.resourceIdx];
          }
          this._updateBuilderHud();
          return;
        }
        if (ev.code === 'BracketRight') {
          if (this._builder.mode === 'building') this._builder.buildingIdx = (this._builder.buildingIdx + 1) % this._builder.buildingTypes.length;
          if (this._builder.mode === 'unit') this._builder.unitIdx = (this._builder.unitIdx + 1) % this._builder.unitTypes.length;
          if (this._builder.mode === 'resource') {
            this._builder.resourceIdx = (this._builder.resourceIdx + 1) % this._builder.resourceTypes.length;
            this._builder.resourceType = this._builder.resourceTypes[this._builder.resourceIdx];
          }
          this._updateBuilderHud();
        }
      });
    }

    this.input.keyboard.on('keydown-ESC',   () => {
      if (this._nameModalOpen) return;
      if (this._combatLogOpen) { this._closeCombatLog(); return; }
      if (!this._endTurnPending) this._toggleSettings();
    });
    this.input.keyboard.on('keydown-X',     () => { if (this._nameModalOpen || this._mapBuilderMode) return; this._confirmEndTurn(); });
    this.input.keyboard.on('keydown-B', () => {
      if (this._nameModalOpen || this._mapBuilderMode || this._designerOpen) return;
      this._toggleBuildMenu();
    });
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
    this.input.keyboard.on('keydown-L', () => {
      if (this._nameModalOpen || this._mapBuilderMode) return;
      this._toggleSupplyOverlay();
    });
    this.input.keyboard.on('keydown', (ev) => this._onContextMenuHotkey(ev));
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this._nameModalOpen) return;
      if (this._aiViewerMode && this._isSpectatorDuel()) {
        this._aiAutoplayPaused = !this._aiAutoplayPaused;
        this._pushLog(this._aiAutoplayPaused ? 'AI autoplay paused.' : 'AI autoplay resumed.');
        if (!this._aiAutoplayPaused && this._isAiControlled(this.gameState.currentPlayer)) {
          this._runAITurn();
        }
        return;
      }
      const now = performance.now();
      if (this._spaceGuardUntil && now < this._spaceGuardUntil) return;
      if (this._gameOverActive) return; // game-over: only explicit MAIN MENU button leaves
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

  /** Center of the visible map area (between top bar, bottom panel, left sidebar). */
  _playfieldScreenCenter() {
    const w = this.scale.width;
    const h = this.scale.height;
    return {
      x: PLAYFIELD_UI.left + (w - PLAYFIELD_UI.left) * 0.5,
      y: PLAYFIELD_UI.top + (h - PLAYFIELD_UI.top - PLAYFIELD_UI.bottom) * 0.5,
    };
  }

  /** Set zoom while keeping the world point under (screenX, screenY) fixed. */
  _setCameraZoomAtScreen(cam, screenX, screenY, zoom) {
    if (typeof cam.preRender === 'function') cam.preRender();
    const before = cam.getWorldPoint(screenX, screenY);
    cam.setZoom(Phaser.Math.Clamp(zoom, 0.2, 4.0));
    if (typeof cam.preRender === 'function') cam.preRender();
    const after = cam.getWorldPoint(screenX, screenY);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    if (typeof cam.preRender === 'function') cam.preRender();
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
    if (unit.type === 'ANTI_TANK' && !unit.moved && !unit.attacked && !unit.hidden) {
      const unlocked = new Set(gs.players[gs.currentPlayer]?.research?.unlocked || []);
      if (unlocked.has('anti_tank_ambush')) {
        actions.push({ label: 'SET AMBUSH', key: 'ambush', enabled: true, color: 0x5c2e7a, cb: () => this._onAmbush() });
      }
    }
    if (unit.roadOrder) {
      actions.push({ label: '✕ CANCEL ROAD ORDER', key: 'cancel_road', enabled: true, color: 0x662222,
        cb: () => { delete unit.roadOrder; this._hideContextMenu(true); this._refresh(); }
      });
    }
    // Auto-move standing order
    if (unit.moveOrder) {
      actions.push({ label: '✕ CANCEL MOVE ORDER', key: 'cancel_move_order', enabled: true, color: 0x334466,
        cb: () => { delete unit.moveOrder; this._hideContextMenu(true); this._refresh(); }
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
            this._hideContextMenu(true);
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
          cb: () => { if (smart.enabled) { this._hideContextMenu(true); smart.cb(); } }
        });
        // Still offer the full submenu below it for other options
        actions.push({ label: 'BUILD ▸', key: 'build_more', enabled: true, color: 0x224433, openSubmenu: 'build', page: 0 });
      } else {
        actions.push({ label: 'BUILD ▸', key: 'build', enabled: true, color: 0x335533, openSubmenu: 'build', page: 0 });
      }
    }
    if (def.canHeal) {
      actions.push({ label: 'HEAL',   key: 'heal',   enabled: true,  color: 0x229944, cb: () => {} }); // passive — shows status
    }
    // Engineer (or any unit) standing on a building with canRecruit: show USE BUILDING button
    if (def.canBuild) {
      const bldg = buildingAt(gs, unit.q, unit.r);
      if (bldg && bldg.owner === gs.currentPlayer && !ROAD_TYPES.has(bldg.type) &&
          BUILDING_TYPES[bldg.type].canRecruit.length > 0
          && !['VILLAGE', 'TOWN', 'CITY', 'HQ'].includes(bldg.type)) {
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
        hint: undoBlocked ? 'Move revealed new territory — cannot undo' : 'Return to position at turn start',
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
          this._hideContextMenu(true);
          this._refresh();
        }
      });
    }

    const hasCargo = Array.isArray(unit.cargo) && unit.cargo.length > 0;
    actions.push({
      label: hasCargo ? 'DISBAND [unload first]' : 'DISBAND UNIT',
      key: 'disband',
      enabled: !hasCargo,
      hint: hasCargo ? 'Unload all cargo before disbanding' : 'Remove unit from the map',
      color: 0x662222,
      cb: () => {
        if (hasCargo) return;
        gs.units = gs.units.filter(u => u.id !== unit.id);
        delete gs.pendingMoves?.[unit.id];
        delete gs.pendingAttacks?.[unit.id];
        this._pushLog(`P${gs.currentPlayer} disbanded ${unit.designName || UNIT_TYPES[unit.type]?.name || unit.type}`);
        this._clearSelection();
        this._hideContextMenu(true);
        this._refresh();
      }
    });

    actions.push({ label: 'WAIT',   key: 'wait',   enabled: true,  color: 0x444444, cb: () => this._clearSelection() });

    return actions;
  }

  // ── Unified context menu (root actions + submenus with pagination) ─────────
  // submenu: 'root' | 'build'   page: 0-based page index within that submenu
  _contextMenuHitTest(x, y) {
    const b = this._contextMenuBounds;
    if (!b) return false;
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  _openContextSubmenu(unit, submenu, page = 0) {
    if (!unit) return;
    this._contextMenuDismissLock = true;
    this._contextMenuClicked = true;
    this._contextMenuSuppressDismissUntil = (this.time?.now ?? performance.now()) + 400;
    const replace = !!this._contextMenuObjs?.length;
    try {
      this._showContextMenu(unit, submenu, page, replace);
    } catch (err) {
      console.error('Context submenu failed:', err);
      this._pushLog(`Menu error: ${err?.message || err}`);
      this._hideContextMenu(true);
    }
  }

  _showContextMenu(unit, submenu = 'root', page = 0, replace = false) {
    if (!unit) return;
    // Floating action menu removed — engineer build uses bottom-right panel; shift+RMB for move orders.
    if (submenu === 'root') return;
    if (replace) {
      const old = this._contextMenuObjs;
      if (old) {
        for (const o of old) { try { o.destroy(); } catch (e) {} }
      }
      this._contextMenuObjs = null;
      this._setContextMenuHint(null);
    } else {
      this._hideContextMenu(true);
    }

    const sw = this.scale.width, sh = this.scale.height;
    const anchor = this._menuAnchor || { x: sw / 2, y: sh / 2 };

    const PAGE_SIZE = 8;
    const btnH = 30, btnW = 248, gap = 3;
    const DEPTH = 150;
    const objs = [];
    const aDef = UNIT_TYPES[unit?.type];

    // ── Build list of items to show ──────────────────────────────────────────
    let title = null;
    let items = []; // { label, color, enabled, cb }

    if (submenu === 'root') {
      const actions = this._getUnitActions(unit);
      items = actions.map(a => ({
        label:       a.label,
        color:       a.color,
        enabled:     a.enabled,
        cb:          a.cb,
        openSubmenu: a.openSubmenu,
        page:        a.page,
        hint:        a.hint,
      }));
    } else if (submenu === 'build') {
      title = '▸ BUILD';
      const allOpts = getEngineerBuildOptions(this, unit);
      const mapped = allOpts.map(o => ({
        label: o.header ? o.label : (o.enabled ? o.label : `${o.label}  ✗`),
        color: o.header ? 0x1d2b1d : (o.enabled ? 0x2a5533 : 0x222222),
        enabled: o.header ? false : o.enabled,
        cb: o.cb,
        header: !!o.header,
      }));
      const totalPages = Math.max(1, Math.ceil(mapped.length / PAGE_SIZE));
      page = Phaser.Math.Clamp(page, 0, totalPages - 1);
      const slice = mapped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      items = slice;
      if (totalPages > 1) {
        if (page > 0) {
          items.push({ label: '◀ PREV PAGE', color: 0x333355, enabled: true, openSubmenu: 'build', page: page - 1 });
        }
        items.push({ label: `PAGE ${page + 1} / ${totalPages}`, color: 0x333355, enabled: false, header: true });
        if (page < totalPages - 1) {
          items.push({ label: 'NEXT PAGE ▶', color: 0x333355, enabled: true, openSubmenu: 'build', page: page + 1 });
        }
      }

    }

    // ── Position menu at cursor, clamped to screen ───────────────────────────
    const rootTitle = submenu === 'root' && aDef
      ? `${aDef.name}${unit.designName ? ` · ${unit.designName}` : ''}`
      : null;
    const rowCount = items.length + (title ? 1 : 0) + (rootTitle ? 1 : 0) + 1; // footer hint row
    const menuH = rowCount * (btnH + gap) + 10;
    let px = anchor.x + 14;
    if (px + btnW > sw - 10) px = anchor.x - btnW - 14;
    let py;
    if (replace && this._contextMenuBounds) {
      px = this._contextMenuBounds.x;
      py = this._contextMenuBounds.y;
    } else {
      py = anchor.y - menuH / 2;
      if (py < PLAYFIELD_UI.top + 4) py = PLAYFIELD_UI.top + 4;
      if (py + menuH > sh - PLAYFIELD_UI.bottom - 8) py = sh - PLAYFIELD_UI.bottom - 8 - menuH;
    }

    const panelCx = px + btnW / 2;
    const panelCy = py + menuH / 2;
    const panelBg = this.add.rectangle(panelCx, panelCy, btnW + 14, menuH + 6, 0x100818, 0.96)
      .setStrokeStyle(2, 0xff66cc).setScrollFactor(0).setDepth(DEPTH - 1).setOrigin(0.5)
      .setInteractive({ useHandCursor: false });
    const absorbMenuPointer = () => { this._contextMenuClicked = true; };
    panelBg.on('pointerdown', absorbMenuPointer);
    panelBg.on('pointerup', absorbMenuPointer);
    objs.push(panelBg);
    this._contextMenuBounds = { x: px, y: py, w: btnW + 14, h: menuH + 6 };
    objs.push(this.add.rectangle(panelCx, py + 2, btnW + 8, 3, 0xffcc44, 1)
      .setScrollFactor(0).setDepth(DEPTH));

    let rowY = py + 8;
    if (rootTitle) {
      objs.push(this.add.text(px + 8, rowY, rootTitle, {
        font: 'bold 12px monospace', fill: '#ffcc44',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 1));
      rowY += btnH;
    }
    if (title) {
      objs.push(this.add.text(px + 8, rowY, title, {
        font: 'bold 11px monospace', fill: '#99ddbb',
        backgroundColor: '#1a2830', padding: { x: 8, y: 4 },
        fixedWidth: btnW - 16, align: 'center',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 1));
      rowY += btnH + gap;
    }

    const hotkeyItems = [];
    let hotkeyIdx = 0;
    items.forEach((item) => {
      if (item.header) {
        objs.push(this.add.text(px + 8, rowY, item.label, {
          font: '10px monospace', fill: '#6688aa',
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 1));
        rowY += btnH;
        return;
      }
      const hk = item.enabled && hotkeyIdx < 9 ? `[${hotkeyIdx + 1}] ` : '    ';
      if (item.enabled) {
        hotkeyItems.push(item);
        hotkeyIdx += 1;
      }
      const col = `#${item.color.toString(16).padStart(6, '0')}`;
      if (item.enabled) {
        const zone = this.add.zone(px + btnW / 2, rowY + btnH / 2, btnW - 4, btnH - 2)
          .setScrollFactor(0).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', absorbMenuPointer);
        zone.on('pointerup', (ptr) => {
          if (ptr.button !== 0) return;
          absorbMenuPointer();
          this._runContextMenuItem(item, unit);
        });
        zone.on('pointerover', () => this._setContextMenuHint(item.hint || item.label, px, py + menuH + 4));
        zone.on('pointerout', () => this._setContextMenuHint(null));
        objs.push(zone);
      }
      const btn = this.add.text(px + 6, rowY, `${hk}${item.label}`, {
        font: 'bold 11px monospace',
        fill: item.enabled ? '#f0f8ff' : '#666680',
        backgroundColor: item.enabled ? col : '#1a1a22',
        padding: { x: 8, y: 5 },
        fixedWidth: btnW - 12,
        align: 'left',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 3);
      objs.push(btn);
      rowY += btnH + gap;
    });

    objs.push(this.add.text(px + 8, rowY, 'ESC close  ·  1-9 quick pick', {
      font: '9px monospace', fill: '#556677',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 1));

    this._addToUI(objs);
    this._contextMenuObjs = objs;
    this._contextMenuUnit = unit;
    this._contextMenuHotkeyItems = hotkeyItems;
    this._contextMenuHotkeyUnit = unit;
  }

  _runContextMenuItem(item, unit) {
    if (!item?.enabled) return;
    const now = this.time?.now ?? performance.now();
    if (this._contextMenuLastPickAt != null && now - this._contextMenuLastPickAt < 100) return;
    this._contextMenuLastPickAt = now;
    this._contextMenuClicked = true;
    const menuUnit = unit || this._contextMenuUnit;
    if (!menuUnit) return;
    if (item.openSubmenu) {
      if (item.openSubmenu === 'build' && this._isEngineerBuildPanelActive()) {
        this._buildMenuStructPage = item.page || 0;
        this._updateBottomPanel();
        return;
      }
      this._openContextSubmenu(menuUnit, item.openSubmenu, item.page || 0);
      return;
    }
    this._hideContextMenu(true);
    item.cb?.();
    if (this._isEngineerBuildPanelActive()) this._updateBottomPanel();
  }

  _onContextMenuHotkey(ev) {
    if (!this._contextMenuObjs?.length) return;
    if (this._nameModalOpen || this._designerOpen || this._mapBuilderMode) return;
    if (ev.code === 'Escape') {
      this._hideContextMenu(true);
      return;
    }
    const n = Number(ev.key);
    if (!Number.isInteger(n) || n < 1 || n > (this._contextMenuHotkeyItems?.length || 0)) return;
    const pick = this._contextMenuHotkeyItems[n - 1];
    if (pick) this._runContextMenuItem(pick, this._contextMenuHotkeyUnit);
  }

  _setContextMenuHint(text, x, y) {
    if (this._contextMenuHint) {
      try { this._contextMenuHint.destroy(); } catch (e) {}
      this._contextMenuHint = null;
    }
    if (!text) return;
    this._contextMenuHint = this.add.text(x, y, text, {
      font: '10px monospace', fill: '#c8d8e8',
      backgroundColor: '#0d1218', padding: { x: 8, y: 4 },
      wordWrap: { width: 260 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(155);
    this._addToUI([this._contextMenuHint]);
  }

  _hideContextMenu(instant = false) {
    this._setContextMenuHint(null);

    if (this._contextMenuTween) {
      try { this._contextMenuTween.stop(); } catch (e) {}
      this._contextMenuTween = null;
    }

    const objs = this._contextMenuObjs;
    if (!objs?.length) {
      this._contextMenuUnit = null;
      this._contextMenuHotkeyItems = null;
      this._contextMenuHotkeyUnit = null;
      this._contextMenuBounds = null;
      return;
    }
    this._contextMenuObjs = null;
    this._contextMenuUnit = null;
    this._contextMenuHotkeyItems = null;
    this._contextMenuHotkeyUnit = null;
    this._contextMenuBounds = null;

    const destroyAll = () => {
      for (const o of objs) {
        try {
          o.disableInteractive?.();
          o.destroy();
        } catch (e) {}
      }
    };

    for (const o of objs) {
      try { o.disableInteractive?.(); } catch (e) {}
    }

    if (instant) {
      destroyAll();
      return;
    }

    const tweenables = objs.filter((o) => o.active && o.setAlpha);
    if (!tweenables.length) {
      destroyAll();
      return;
    }

    this._contextMenuTween = this.tweens.add({
      targets: tweenables,
      alpha: 0,
      duration: 60,
      onComplete: () => {
        this._contextMenuTween = null;
        destroyAll();
      },
    });
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
    this._closeCombatLog?.();
    this._settingsOpen = true;
    this._pushInputBlocker('settings');
    const w = this.scale.width, h = this.scale.height;
    const panelW = 560, panelH = 420, D = 210;
    const objs = [];

    const bg = this.add.rectangle(w/2, h/2, panelW, panelH, 0x111122, 0.97)
      .setStrokeStyle(2, 0x4466aa).setScrollFactor(0).setDepth(D)
      .setInteractive();
    bg.on('pointerdown', () => {});
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

    // AI toggle row (skirmish / debug only — spectator endless keeps all seats on AI)
    if (!this._aiViewerMode) {
      objs.push(this.add.text(leftX, y, 'Player 2 AI', { font: '12px monospace', fill: '#cccccc' })
        .setOrigin(0,0.5).setScrollFactor(0).setDepth(D+1));
      const isAI = this._isAiControlled(2);
      const aiTog = this.add.text(rightX, y, isAI ? '[ ON 🤖 ]' : '[ OFF ]', {
        font:'bold 12px monospace', fill:isAI ? '#ffcc44' : '#888888',
        backgroundColor:isAI ? '#332200' : '#222222', padding:{x:10,y:5}
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor:true });
      aiTog.on('pointerdown', () => {
        if (this._isAiControlled(2)) this.aiPlayers.delete(2);
        else this.aiPlayers.add(2);
        this._openSettings();
      });
      objs.push(aiTog);
      y += 40;
    }

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
      sb.on('pointerdown', () => { this.aiStrategy = key; this.aiStrategies[2] = key; this._openSettings(); });
      objs.push(sb);
    });

    const dlBtn = this.add.text(w/2, h/2 + panelH/2 - 66, '📥 DOWNLOAD JSON REPORT', {
      font: 'bold 15px monospace', fill: '#ffffff', backgroundColor: '#2a4a6a', padding: { x: 14, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D+1).setInteractive({ useHandCursor: true });
    dlBtn.on('pointerdown', () => this._downloadRunJson('manual'));
    dlBtn.on('pointerover', () => dlBtn.setAlpha(0.8));
    dlBtn.on('pointerout',  () => dlBtn.setAlpha(1.0));
    objs.push(dlBtn);

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
    this._popInputBlocker('settings');
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
    this._setCommandDockHighlight(false);
  }

  // ── AI dev overview (per-AI economy, doctrine, research, designs) ─────────
  _toggleAIOverview() {
    if (this._aiOverviewOpen) this._closeAIOverview();
    else this._openAIOverview();
  }

  _closeAIOverview() {
    if (this._aiOverviewObjs) {
      for (const o of this._aiOverviewObjs) { try { o.destroy(); } catch (e) {} }
      this._aiOverviewObjs = null;
    }
    this._aiOverviewOpen = false;
    this._setCommandDockHighlight(false);
  }

  _openAIOverview() {
    this._closeAIOverview();
    this._closeEconomy?.();
    this._closeTrade?.();
    this._closeResearch?.();
    this._closeDesigner?.();
    this._closeSettings?.();
    this._closeCombatLog?.();
    this._aiOverviewOpen = true;
    this._setCommandDockHighlight(true);

    const gs = this.gameState;
    const rows = buildAIOverviewForGame(gs, this.terrain, this.mapSize, this.aiPlayers, this.aiStrategies);
    const w = this.scale.width, h = this.scale.height;
    const D = 222;
    const panW = Math.min(620, Math.floor(w * 0.52));
    const panH = Math.min(h - 48, Math.floor(h * 0.82));
    const px = w - panW / 2 - 14;
    const py = 52 + panH / 2;
    const objs = [];

    const bg = this.add.rectangle(px, py, panW, panH, 0x100818, 0.98)
      .setStrokeStyle(3, 0x8866cc).setScrollFactor(0).setDepth(D).setInteractive();
    bg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(bg);

    objs.push(this.add.text(px, py - panH / 2 + 22, '🤖 AI LAB', {
      font: 'bold 24px monospace', fill: '#f0e0ff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1));

    const closeBtn = this.add.text(px + panW / 2 - 16, py - panH / 2 + 22, '✕', {
      font: 'bold 22px monospace', fill: '#cccccc',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this._contextMenuClicked = true; this._closeAIOverview(); });
    objs.push(closeBtn);

    const histN = (this._runHistory?.length || 0) + (this._aiLabTurns?.length || 0);
    const turnLine = this.add.text(px, py - panH / 2 + 52, `Turn ${gs.turn} · ${rows.length} AI · ${histN} turns logged`, {
      font: '15px monospace', fill: '#bbaadd',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 1);
    objs.push(turnLine);

    const dlBtn = this.add.text(px - panW / 2 + 20, py - panH / 2 + 50, '📥 DOWNLOAD JSON', {
      font: 'bold 14px monospace', fill: '#ffffff', backgroundColor: '#2a4a6a', padding: { x: 10, y: 6 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true });
    dlBtn.on('pointerdown', () => { this._contextMenuClicked = true; this._downloadRunJson('ai-lab'); });
    dlBtn.on('pointerover', () => dlBtn.setAlpha(0.85));
    dlBtn.on('pointerout', () => dlBtn.setAlpha(1));
    objs.push(dlBtn);

    let y = py - panH / 2 + 88;
    const left = px - panW / 2 + 20;
    const wrap = panW - 40;

    const missionStr = (m) => {
      const parts = Object.entries(m || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`);
      return parts.length ? parts.join(' ') : '—';
    };

    for (const row of rows) {
      if (y > py + panH / 2 - 36) break;
      const econ = row.economy || {};
      const bud = row.armyBudget || {};
      const block = [
        `P${row.player} · ${row.strategyLabel} (${row.strategy})`,
        `Phase ${row.phase} · endgame ${((row.endgamePressure || 0) * 100).toFixed(0)}% · hoard ${((row.stockpilePressure || 0) * 100).toFixed(0)}%`,
        row.focusEnemy ? `Focus P${row.focusEnemy}` : 'Focus —',
        row.theaterMode
          ? `Theater ${row.primaryTheaterId} · obj ${row.theaterObjective || '?'} · lane ${row.primaryLane || '?'}`
          : `Lane ${row.primaryLane || '?'}`,
        `Eco Fe${econ.iron?.toFixed?.(0) ?? econ.iron} Oil${econ.oil?.toFixed?.(0) ?? econ.oil} W${econ.wood?.toFixed?.(0) ?? econ.wood} C${econ.components?.toFixed?.(0) ?? econ.components} RP${econ.rp?.toFixed?.(0) ?? econ.rp}`,
        row.pop
          ? `Pop ${row.pop.fielded}/${row.pop.cap} map · ${row.pop.avail} free${row.pop.waiting ? ` · ${row.pop.waiting} wait` : ''}`
          : 'Pop —',
        `Army ${bud.myCombat || 0}/${bud.maxCombat || '?'} units ${bud.myUnits || 0}/${bud.maxUnits || '?'}`,
        row.actionPlan
          ? `Plan atk:${row.actionPlan.attacks} move:${row.actionPlan.moves} bld:${row.actionPlan.builds} rec:${row.actionPlan.recruits} raids:${row.actionPlan.extractorRaids} close+${row.actionPlan.closingAttackFloor}`
          : 'Plan —',
        `Missions: ${missionStr(row.missions)}`,
        `Research: ${row.researchQueue?.length ? row.researchQueue.map(t => `${t.name} ${t.pct}%`).join(', ') : 'idle'} (${row.unlockedCount} done)`,
        `Designs: ${row.designs?.length ? row.designs.map(d => d.name).join(', ') : 'none'}`,
      ].join('\n');
      const t = this.add.text(left, y, block, {
        font: '13px monospace', fill: '#e8dcf8', wordWrap: { width: wrap }, lineSpacing: 5,
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1);
      objs.push(t);
      y += t.height + 14;
      objs.push(this.add.rectangle(px, y - 6, panW - 32, 2, 0x554477, 0.7)
        .setScrollFactor(0).setDepth(D + 1));
      y += 6;
    }

    if (!rows.length) {
      objs.push(this.add.text(px, py, 'No AI players in this match.', {
        font: '16px monospace', fill: '#9988aa',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1));
    }

    this._aiOverviewObjs = objs;
    this._addToUI(objs);
  }

  // ── Combat log (full fight history for AI vs AI review) ─────────────────────
  _toggleCombatLog() {
    if (this._combatLogOpen) this._closeCombatLog();
    else this._openCombatLog();
  }

  _closeCombatLog() {
    if (this._combatLogObjs) {
      for (const o of this._combatLogObjs) { try { o.destroy(); } catch (e) {} }
      this._combatLogObjs = null;
    }
    this._combatLogOpen = false;
  }

  _formatCombatHistoryLine(entry, gs) {
    if (!entry) return 'Unknown combat';
    const turn = gs?.turn ?? '?';
    if (entry.type === 'miss') {
      const atk = UNIT_TYPES[entry.attackerType]?.name || entry.attackerType || '?';
      const def = UNIT_TYPES[entry.targetType]?.name || entry.targetType || '?';
      const why = entry.reason === 'out_of_range' ? 'out of range' : entry.reason === 'no_los' ? 'no LOS' : (entry.reason || 'miss');
      return `T${turn}  P${entry.attackerOwner ?? '?'} ${atk} → ${def}: ${why}`;
    }
    const atk = entry.attackerName || UNIT_TYPES[entry.attackerType]?.name || entry.attackerType || '?';
    const def = entry.targetName || UNIT_TYPES[entry.targetType]?.name || entry.targetType || '?';
    const defHpEnd = Math.max(0, (entry.targetHPBefore ?? 0) - (entry.dmg || 0));
    const atkHpEnd = Math.max(0, (entry.attackerHPBefore ?? 0) - (entry.attackerDmg || 0));
    const defKilled = defHpEnd <= 0;
    const atkKilled = atkHpEnd <= 0;
    const killTag = defKilled && atkKilled ? '  ☠both' : defKilled ? '  ☠def' : atkKilled ? '  ☠atk' : '';
    const hex = entry.targetHex ? ` @${entry.targetHex.q},${entry.targetHex.r}` : '';
    let fortTag = '';
    if (entry.fortName) {
      fortTag = ` [${entry.fortName} T${entry.fortTier ?? '?'} −${entry.bunkerMod || 0}`;
      if (entry.fortIndirectBonus) fortTag += ` +${entry.fortIndirectBonus} arty/air`;
      if (entry.fortAssault) fortTag += ` assault−${entry.fortAssault}`;
      fortTag += ']';
    } else if (entry.bunkerMod) {
      fortTag = ` [fort −${entry.bunkerMod}]`;
    }
    return `T${turn}  P${entry.attackerOwner} ${atk} → P${entry.targetOwner} ${def}${hex}: ${entry.tier || '?'}  −${entry.dmg || 0}/−${entry.attackerDmg || 0}${fortTag}${killTag}`;
  }

  _recordCombat(entry) {
    if (!entry) return;
    const gs = this.gameState;
    const rec = {
      id: (this._combatHistory?.length || 0) + 1,
      turn: gs?.turn ?? 0,
      line: this._formatCombatHistoryLine(entry, gs),
      entry: { ...entry },
    };
    if (!this._combatHistory) this._combatHistory = [];
    this._combatHistory.push(rec);
    if (this._combatHistory.length > 300) this._combatHistory.shift();
    if (this._combatLogOpen) {
      if (this._combatLogSelected < 0) this._combatLogSelected = this._combatHistory.length - 1;
      this._openCombatLog();
    }
  }

  _openCombatLog() {
    this._closeCombatLog();
    this._closeTrade?.();
    this._closeEconomy?.();
    this._closeAIOverview?.();
    this._closeResearch?.();
    this._closeDesigner?.();
    this._closeSettings?.();
    this._combatLogOpen = true;

    const w = this.scale.width;
    const h = this.scale.height;
    const D = 224;
    const panW = Math.min(640, w - 40);
    const panH = Math.min(h - 80, 560);
    const px = w - panW / 2 - 12;
    const py = 70 + panH / 2;
    const objs = [];
    const ROW_H = 28;
    const VISIBLE = Math.floor((panH - 240) / ROW_H);

    const history = this._combatHistory || [];
    const maxScroll = Math.max(0, history.length - VISIBLE);
    if (this._combatLogScroll > maxScroll) this._combatLogScroll = maxScroll;
    if (this._combatLogSelected < 0 && history.length > 0) {
      this._combatLogSelected = history.length - 1;
    }
    const winStart = Math.max(0, history.length - VISIBLE - this._combatLogScroll);

    const bg = this.add.rectangle(px, py, panW, panH, 0x100818, 0.98)
      .setStrokeStyle(2, 0xff6688).setScrollFactor(0).setDepth(D).setInteractive();
    bg.on('pointerdown', () => { this._contextMenuClicked = true; });
    objs.push(bg);

    objs.push(this.add.text(px, py - panH / 2 + 18, `⚔ COMBAT LOG  (${history.length})`, {
      font: 'bold 14px monospace', fill: '#ffccaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1));

    const closeBtn = this.add.text(px + panW / 2 - 14, py - panH / 2 + 18, '✕', {
      font: 'bold 16px monospace', fill: '#aaaaaa',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this._contextMenuClicked = true; this._closeCombatLog(); });
    objs.push(closeBtn);

    const listTop = py - panH / 2 + 44;
    const listLeft = px - panW / 2 + 12;
    const listW = panW - 24;

    objs.push(this.add.text(listLeft, listTop - 4, 'Newest at bottom · click row for detail', {
      font: '9px monospace', fill: '#778899',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1));

    const slice = history.slice(winStart, winStart + VISIBLE);
    slice.forEach((rec, i) => {
      const idx = winStart + i;
      const y = listTop + i * ROW_H;
      const sel = idx === this._combatLogSelected;
      const rowBg = this.add.rectangle(listLeft + listW / 2, y + ROW_H / 2, listW, ROW_H - 2,
        sel ? 0x2a1a28 : 0x141018, 1)
        .setStrokeStyle(1, sel ? 0xff88aa : 0x332233)
        .setScrollFactor(0).setDepth(D + 1).setInteractive({ useHandCursor: true });
      rowBg.on('pointerdown', () => {
        this._contextMenuClicked = true;
        this._combatLogSelected = idx;
        this._openCombatLog();
      });
      objs.push(rowBg);
      const tierCol = TIER_COL[rec.entry?.tier] || '#c8d0d8';
      objs.push(this.add.text(listLeft + 6, y + 4, rec.line, {
        font: `${sel ? 'bold ' : ''}8px monospace`, fill: tierCol,
        wordWrap: { width: listW - 14 }, lineSpacing: 2,
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2));
    });

    if (history.length === 0) {
      objs.push(this.add.text(px, listTop + 40, 'No combats yet.\nFights appear here as they resolve.', {
        font: '11px monospace', fill: '#667788', align: 'center',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 1));
    }

    const navY = py + panH / 2 - 168;
    const mkNav = (label, x, delta) => {
      const b = this.add.text(x, navY, label, {
        font: 'bold 11px monospace', fill: '#ccddee', backgroundColor: '#223344', padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => {
        this._contextMenuClicked = true;
        this._combatLogScroll = Math.max(0, Math.min(maxScroll, this._combatLogScroll + delta));
        this._openCombatLog();
      });
      objs.push(b);
    };
    mkNav('▲ NEWER', px - 80, -1);
    mkNav('▼ OLDER', px + 80, 1);
    objs.push(this.add.text(px, navY + 22, `${history.length ? winStart + 1 : 0}–${Math.min(history.length, winStart + slice.length)} of ${history.length}`, {
      font: '9px monospace', fill: '#8899aa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1));

    const detailY = py + panH / 2 - 148;
    const detailH = 132;
    const selRec = history[this._combatLogSelected];
    objs.push(this.add.rectangle(px, detailY + detailH / 2, panW - 20, detailH, 0x080c10, 0.96)
      .setStrokeStyle(1, 0x445566).setScrollFactor(0).setDepth(D + 1));
    objs.push(this.add.text(px - panW / 2 + 18, detailY + 4, 'CODEX: Menu → Attrition Codex for full combat rules', {
      font: '8px monospace', fill: '#556677',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2));
    if (selRec?.entry) {
      const e = selRec.entry;
      const steps = buildResolveSteps(e);
      objs.push(this.add.text(px - panW / 2 + 20, detailY + 16, 'SELECTED FIGHT', {
        font: 'bold 10px monospace', fill: '#88aacc',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2));
      const fortLine = e.fortName
        ? `Fort: ${e.fortName} T${e.fortTier ?? '?'}  cover −${e.bunkerMod || 0}${e.fortIndirectBonus ? `  arty/air +${e.fortIndirectBonus}` : ''}${e.fortAssault ? `  assault −${e.fortAssault}` : ''}`
        : '';
      const summary = this.add.text(px - panW / 2 + 20, detailY + 30,
        `${e.attackerName || e.attackerType} (P${e.attackerOwner}) → ${e.targetName || e.targetType} (P${e.targetOwner})\nTier ${e.tier || '?'} · score ${e.score ?? '?'}/100 · −${e.dmg || 0} / −${e.attackerDmg || 0}${fortLine ? `\n${fortLine}` : ''}`,
        { font: '9px monospace', fill: '#dde8f0', wordWrap: { width: panW - 44 }, lineSpacing: 3 },
      ).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2);
      objs.push(summary);
      let stepY = detailY + 30 + summary.height + 6;
      steps.slice(0, 5).forEach((s) => {
        const st = this.add.text(px - panW / 2 + 24, stepY, s, {
          font: '8px monospace', fill: '#99aabb', wordWrap: { width: panW - 52 },
        }).setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2);
        objs.push(st);
        stepY += st.height + 4;
      });
      const ret = (e.defenderCanRetaliate && (e.retaliationDmg || 0) > 0)
        ? `Retaliation: ${e.retaliationTier} −${e.retaliationDmg}`
        : 'Retaliation: none';
      objs.push(this.add.text(px - panW / 2 + 20, detailY + detailH - 14, ret, {
        font: '9px monospace', fill: '#ffcf95',
      }).setOrigin(0, 1).setScrollFactor(0).setDepth(D + 2));
    } else {
      objs.push(this.add.text(px, detailY + 40, 'Select a combat row above.', {
        font: '10px monospace', fill: '#778899',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));
    }

    this._combatLogObjs = objs;
    this._addToUI(objs);
  }

  _openEconomy() {
    this._closeEconomy();
    this._closeAIOverview?.();
    this._closeTrade?.();
    this._closeResearch?.();
    this._closeDesigner?.();
    this._closeSettings?.();
    this._closeCombatLog?.();
    this._economyOpen = true;
    this._setCommandDockHighlight(true);

    const gs = this.gameState;
    const p = gs.currentPlayer;
    const pl = gs.players[p];
    const w = this.scale.width, h = this.scale.height;
    const D = 222;
    const panW = Math.min(360, Math.floor(w * 0.3));
    const panH = Math.min(h - 90, 520);
    const px = 8 + panW / 2;
    const py = 74 + panH / 2;
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

    // ── Turns-to-zero helper ──────────────────────────────────────────────
    // Returns how many turns until a resource hits zero given net change per turn.
    // Returns Infinity if net is positive or zero (won't run out).
    const turnsToZero = (stock, netPerTurn) => {
      if (netPerTurn >= 0) return Infinity;
      return Math.floor(stock / Math.abs(netPerTurn));
    };

    const ttzIron = turnsToZero(pl.iron, net.iron);
    const ttzOil  = turnsToZero(pl.oil,  net.oil);
    const ttzFood = turnsToZero(pl.food || 0, net.food);

    // Debt state: did we fail to pay upkeep last turn?
    const debt = pl.upkeepDebt || { food: 0, iron: 0, oil: 0 };
    const inDebt = debt.food > 0 || debt.iron > 0 || debt.oil > 0;

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

    card(px - cardW/2 - 6, y + cardH/2, 'STOCKPILE', `⚙${pl.iron}  🛢${pl.oil}  🪵${pl.wood||0}  🍞${(pl.food||0).toFixed(1)}  💰${(pl.gold||0).toFixed(1)}  🧩${pl.components||0}  🔩${pl.hardenedSteel||0}  ✈${pl.aviationAlloy||0}`);
    card(px + cardW/2 + 6, y + cardH/2, 'NET / TURN', `⚙${net.iron>=0?'+':''}${net.iron}  🛢${net.oil>=0?'+':''}${net.oil}  🍞${net.food>=0?'+':''}${net.food}  💰+${net.gold}  ⚗+${net.rp}`,
      (net.iron < 0 || net.oil < 0 || net.food < 0) ? 0x2a1717 : 0x17241a);
    y += cardH + 16;

    // ── Upkeep breakdown row ──────────────────────────────────────────────
    const upkeepColor = inDebt ? '#ff5533' : '#ffccaa';
    objs.push(this.add.text(left, y, `UPKEEP / TURN:  ⚙-${upkeep.iron.toFixed(2)}  🛢-${upkeep.oil.toFixed(2)}  🍞-${upkeep.food.toFixed(2)}${inDebt ? '  ⚠ DEBT ACTIVE' : ''}`, {
      font:'bold 10px monospace', fill: upkeepColor
    }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
    y += 16;

    // ── Turns-to-zero warnings ─────────────────────────────────────────────
    const warnParts = [];
    if (ttzIron !== Infinity) warnParts.push(`⚙ runs out in ${ttzIron}t`);
    if (ttzOil  !== Infinity) warnParts.push(`🛢 runs out in ${ttzOil}t`);
    if (ttzFood !== Infinity) warnParts.push(`🍞 runs out in ${ttzFood}t`);
    const imminent = warnParts.some(() => {
      const vals = [ttzIron, ttzOil, ttzFood].filter(v => v !== Infinity);
      return vals.some(v => v <= 2);
    });
    const anyWarn = warnParts.length > 0;
    if (anyWarn) {
      const warnStr = `⚠  ${warnParts.join('   ')}`;
      const warnClr = [ttzIron, ttzOil, ttzFood].some(v => v !== Infinity && v <= 2) ? '#ff4422' : '#ffcc33';
      objs.push(this.add.text(left, y, warnStr, {
        font:'bold 10px monospace', fill: warnClr
      }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
      y += 16;
    }

    // ── Desertion warning ─────────────────────────────────────────────────
    // Units desert after 2 consecutive turns of upkeep debt. Show if at risk.
    if (inDebt) {
      const debtLines = [];
      if (debt.food > 0) debtLines.push(`🍞 debt: ${debt.food}/2 turns`);
      if (debt.iron > 0) debtLines.push(`⚙ debt: ${debt.iron}/2 turns`);
      if (debt.oil  > 0) debtLines.push(`🛢 debt: ${debt.oil}/2 turns`);
      const debtStr = `⚠ SUPPLY DEBT — units desert at 2 turns:  ${debtLines.join('  ')}`;
      objs.push(this.add.text(left, y, debtStr, {
        font:'bold 10px monospace', fill:'#ff4422',
        backgroundColor: '#2a0a00', padding: { x: 6, y: 3 }
      }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));
      y += 20;
    }

    y += 4;

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

    // Port imports: buy basic materials with gold (debug/econ utility)
    const myPorts = gs.buildings.filter(b => Number(b.owner) === Number(p) && b.type === 'PORT' && !b.underConstruction).length;
    if (myPorts > 0) {
      const iy = fy - 42;
      objs.push(this.add.text(left, iy - 16, `PORT IMPORTS (${myPorts})  —  spend gold for +2 resources`, {
        font:'10px monospace', fill:'#8fd2ff'
      }).setOrigin(0,0).setScrollFactor(0).setDepth(D+1));

      const importBtn = (x, label, key, goldCost) => {
        const can = (pl.gold || 0) >= goldCost;
        const b = this.add.text(x, iy, `${label} ${goldCost}💰`, {
          font:'bold 10px monospace', fill: can ? '#ffffff' : '#999999',
          backgroundColor: can ? '#1f3f5a' : '#333333', padding:{x:8,y:5}
        }).setOrigin(0,0).setScrollFactor(0).setDepth(D+2).setInteractive({ useHandCursor:true });
        b.on('pointerdown', () => {
          this._contextMenuClicked = true;
          if ((pl.gold || 0) < goldCost) return;
          pl.gold -= goldCost;
          pl[key] = (pl[key] || 0) + 2;
          this._pushLog(`P${p}: imported +2 ${key} via Port (${goldCost}💰)`);
          this._refresh();
          this._openEconomy();
        });
        objs.push(b);
      };
      importBtn(left,      '[+2 IRON ⚙]', 'iron', 2);
      importBtn(left + 116,'[+2 OIL 🛢]', 'oil', 2);
      importBtn(left + 228,'[+2 WOOD 🪵]','wood', 2);
      importBtn(left + 348,'[+2 FOOD 🍞]','food', 2);
    }

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
    this._setCommandDockHighlight(!!this._economyOpen);
  }

  _showFactoryPanel(factory) {
    this._hideContextMenu(true);
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

    const gs = this.gameState;
    const p = gs.currentPlayer;
    const other = p === 1 ? 2 : 1;
    if (!gs.tradeOffers) gs.tradeOffers = [];

    const w = this.scale.width, h = this.scale.height;
    const D = 220;
    const panW = Math.min(420, Math.floor(w * 0.34));
    const panH = Math.min(h - 90, 480);
    const px = w - 8 - panW / 2;
    const py = 74 + panH / 2;
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
    this._pushInputBlocker('research');
    const gs  = this.gameState;
    const p   = gs.currentPlayer;
    const pl  = gs.players[p];
    if (!pl.research) pl.research = { queue: [], unlocked: [], slots: 1 };
    const res = pl.research;
    const unlockedSet = new Set(res.unlocked || []);
    const w = this.scale.width, h = this.scale.height;
    const panW = w - 32, panH = h - 32;
    const px = w / 2, py = h / 2;
    const D = 195;
    const objs = [];
    const branchW = 128, detailW = 288, hdrH = 56;
    const treeLeft = px - panW / 2 + branchW + 10;
    const treeTop  = py - panH / 2 + hdrH + 8;
    const treeW    = panW - branchW - detailW - 28;
    const treeH    = panH - hdrH - 20;

    this._researchTreeBounds = { x: treeLeft, y: treeTop, w: treeW, h: treeH };
    if (this._researchScrollY === undefined) this._researchScrollY = 0;

    const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '\u2026' : s);
    const hexFill = (c) => '#' + c.toString(16).padStart(6, '0');

    const bg = this.add.rectangle(px, py, panW, panH, 0x100818, 0.98)
      .setStrokeStyle(3, 0xff66cc).setScrollFactor(0).setDepth(D)
      .setInteractive();
    bg.on('pointerdown', () => {});
    objs.push(bg);
    objs.push(this.add.rectangle(px, py - panH / 2 + 3, panW, 6, 0xffcc44, 0.85)
      .setScrollFactor(0).setDepth(D + 1));
    const hdrStrip = this.add.rectangle(px, py - panH / 2 + hdrH / 2, panW, hdrH, 0x1a0c28, 1)
      .setStrokeStyle(1, 0x553366).setScrollFactor(0).setDepth(D + 1);
    objs.push(hdrStrip);
    objs.push(this.add.text(px, py - panH / 2 + 17, 'RESEARCH LAB', {
      font: 'bold 18px monospace', fill: '#ffcc44'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    const labs = gs.buildings.filter(b => b.type === 'SCIENCE_LAB' && b.owner === p && !b.underConstruction).length;
    const inc  = calcIncome(gs, p);
    objs.push(this.add.text(px, py - panH / 2 + 38, `Labs ${labs}  \u2022  +${inc.rp} RP/turn  \u2022  Slots ${res.slots || 1}  \u2022  Queue ${res.queue.length}`, {
      font: '13px monospace', fill: '#ccb8dd'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    const closeBtn = this.add.text(px + panW / 2 - 14, py - panH / 2 + 22, '\u2715', {
      font: 'bold 18px monospace', fill: '#886688'
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 3).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this._closeResearch());
    closeBtn.on('pointerover', () => closeBtn.setStyle({ fill: '#ffcc44' }));
    closeBtn.on('pointerout',  () => closeBtn.setStyle({ fill: '#886688' }));
    objs.push(closeBtn);

    const branches = Object.entries(RESEARCH_BRANCHES);
    let selBranch = this._researchSelBranch || branches[0][0];

    const KIND_COLOR = {
      chassis: 0xddaa00, building: 0x44bb44, economy: 0x44aacc, stat: 0x6688cc,
      research: 0xcc66cc, module: 0xcc8844, doctrine: 0xcc4488,
    };
    const KIND_LABEL = {
      chassis: 'CHASSIS', building: 'BUILD', economy: 'ECON', stat: 'STAT',
      research: 'R&D', module: 'MODULE', doctrine: 'DOCTRINE',
    };

    const NODE_W = 124, NODE_H = 52, COL_GAP = 20, ROW_GAP = 8, TIER_HDR = 22;
    const detailLeft = px + panW / 2 - detailW - 8;
    const detailTop  = treeTop;
    const detailH    = treeH;

    const makePanel = (branch) => {
      if (this._researchContentObjs) {
        for (const o of this._researchContentObjs) { try { o.destroy(); } catch (e) {} }
      }
      this._researchContentObjs = [];
      this._researchSelBranch = branch;
      const addC = (obj, masked = false) => {
        this._researchContentObjs.push(obj);
        this._addToUI([obj]);
        if (masked && this._researchMask) obj.setMask(this._researchMask);
        return obj;
      };

      if (!this._researchMaskGfx) {
        this._researchMaskGfx = this.make.graphics({ add: false });
      }
      this._researchMaskGfx.clear();
      this._researchMaskGfx.fillStyle(0xffffff);
      this._researchMaskGfx.fillRect(treeLeft, treeTop, treeW, treeH);
      this._researchMask = this._researchMaskGfx.createGeometryMask();

      addC(this.add.rectangle(treeLeft + treeW / 2, treeTop + treeH / 2, treeW, treeH, 0x0a0612, 0.55)
        .setStrokeStyle(2, 0x442255).setScrollFactor(0).setDepth(D + 1));
      addC(this.add.text(treeLeft + treeW / 2, treeTop + treeH + 10, 'scroll to browse tree', {
        font: '11px monospace', fill: '#554466'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

      // Branch tabs — only the active branch is highlighted (magenta), not per-tech kind
      const tabX = px - panW / 2 + branchW / 2 + 6;
      const tabY0 = treeTop + 18;
      branches.forEach(([key, def], i) => {
        const ty = tabY0 + i * 38;
        const isSel = key === branch;
        const tb = this.add.rectangle(tabX, ty, branchW - 12, 34, isSel ? 0x4a2080 : 0x140c1c, 1)
          .setStrokeStyle(isSel ? 3 : 1, isSel ? 0xff66cc : 0x332244)
          .setScrollFactor(0).setDepth(D + 2).setOrigin(0.5);
        tb.setInteractive({ useHandCursor: true });
        tb.on('pointerdown', () => {
          this._contextMenuClicked = true;
          this._researchScrollY = 0;
          this.tweens.add({ targets: tb, scaleX: 0.92, scaleY: 0.92, duration: 50, yoyo: true });
          makePanel(key);
        });
        tb.on('pointerover', () => { if (!isSel) tb.setStrokeStyle(2, 0x8866aa); });
        tb.on('pointerout',  () => { if (!isSel) tb.setStrokeStyle(1, 0x332244); });
        addC(tb);
        addC(this.add.text(tabX, ty, `${def.icon} ${def.label}`, {
          font: `${isSel ? 'bold ' : ''}12px monospace`, fill: isSel ? '#ffffff' : '#8899aa'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
      });

      // Detail pane chrome
      addC(this.add.rectangle(detailLeft + detailW / 2, detailTop + detailH / 2, detailW, detailH, 0x140a20, 0.92)
        .setStrokeStyle(2, 0xff66cc).setScrollFactor(0).setDepth(D + 1));

      const branchTechs = Object.values(TECH_TREE).filter(t => t.branch === branch);
      const byTier = {};
      for (const t of branchTechs) { (byTier[t.tier] = byTier[t.tier] || []).push(t); }
      const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
      const sortTier = (row) => [...row].sort((a, b) => {
        const da = (a.prereqs || []).length, db = (b.prereqs || []).length;
        return da !== db ? da - db : a.name.localeCompare(b.name);
      });

      const scrollY = this._researchScrollY || 0;
      const treeInnerTop = treeTop + 22 + TIER_HDR;
      const maxColRows = Math.max(1, ...tiers.map(t => byTier[t].length));
      const contentH = TIER_HDR + maxColRows * (NODE_H + ROW_GAP) + 24;
      this._researchMaxScroll = Math.max(0, contentH - treeH);

      const nodePos = {};
      tiers.forEach((tier, ti) => {
        const colX = treeLeft + 12 + ti * (NODE_W + COL_GAP) + NODE_W / 2;
        const row = sortTier(byTier[tier]);
        row.forEach((tech, ri) => {
          nodePos[tech.id] = {
            x: colX,
            y: treeInnerTop + ri * (NODE_H + ROW_GAP) + NODE_H / 2 + scrollY,
          };
        });
        addC(this.add.text(colX, treeTop + 10 + scrollY, `T${tier}`, {
          font: 'bold 11px monospace', fill: '#9988bb'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3), true);
      });

      const gfx = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
      addC(gfx, true);
      gfx.lineStyle(2, 0x8844cc, 0.45);
      for (const tech of branchTechs) {
        const to = nodePos[tech.id];
        if (!to) continue;
        for (const preId of (tech.prereqs || [])) {
          const from = nodePos[preId];
          if (!from) continue;
          const fx = from.x + NODE_W / 2, fy = from.y;
          const tx2 = to.x - NODE_W / 2, ty2 = to.y;
          const midX = (fx + tx2) / 2;
          gfx.beginPath();
          gfx.moveTo(fx, fy);
          gfx.lineTo(midX, fy);
          gfx.lineTo(midX, ty2);
          gfx.lineTo(tx2, ty2);
          gfx.strokePath();
          gfx.fillStyle(0xcc66ff, 0.7);
          gfx.fillTriangle(tx2, ty2, tx2 - 5, ty2 - 8, tx2 + 5, ty2 - 8);
        }
      }

      const bumpClick = (targets) => {
        this.tweens.add({ targets, scaleX: 0.94, scaleY: 0.94, duration: 55, yoyo: true, ease: 'Quad.easeOut' });
      };

      // Node colors = research state only (locked / ready / queued / done / selected)
      const nodeStyle = (tech) => {
        const isUnlocked = unlockedSet.has(tech.id);
        const inQueue    = res.queue.some(q => q.techId === tech.id);
        const isActive   = res.queue[0]?.techId === tech.id;
        const prereqOk   = prereqsMet(tech.id, unlockedSet);
        const isSel      = this._researchSelTechId === tech.id;
        let fill = 0x0c0814, border = 0x333344, text = '#667788', strokeW = 2;
        if (isUnlocked) { fill = 0x142818; border = 0x44cc77; text = '#88ffbb'; }
        else if (isActive) { fill = 0x281838; border = 0xee66ff; text = '#eeccff'; strokeW = 3; }
        else if (inQueue) { fill = 0x201030; border = 0x9955cc; text = '#ccaaee'; }
        else if (prereqOk) { fill = 0x181428; border = 0x6688bb; text = '#ddeeff'; }
        if (isSel) { border = 0xffffff; strokeW = 3; }
        return { fill, border, text, strokeW };
      };

      for (const tech of branchTechs) {
        const pos = nodePos[tech.id];
        if (!pos) continue;
        const { x: nx, y: ny } = pos;
        if (ny < treeTop - NODE_H || ny > treeTop + treeH + NODE_H) continue;

        const st = nodeStyle(tech);
        const kindColor = KIND_COLOR[tech.kind] || 0x6688cc;
        const kindTag = KIND_LABEL[tech.kind] || tech.kind;

        const shadow = this.add.rectangle(nx + 2, ny + 2, NODE_W, NODE_H, 0x000000, 0.35)
          .setScrollFactor(0).setDepth(D + 1).setOrigin(0.5);
        addC(shadow, true);

        const nodeBg = this.add.rectangle(nx, ny, NODE_W, NODE_H, st.fill, 0.97)
          .setStrokeStyle(st.strokeW, st.border).setScrollFactor(0).setDepth(D + 2).setOrigin(0.5);
        nodeBg.setInteractive({ useHandCursor: true });
        nodeBg.on('pointerdown', () => {
          this._contextMenuClicked = true;
          this._researchSelTechId = tech.id;
          bumpClick(nodeBg);
          makePanel(branch);
        });
        nodeBg.on('pointerover', () => nodeBg.setStrokeStyle(st.strokeW + 1, 0xffffff));
        nodeBg.on('pointerout',  () => nodeBg.setStrokeStyle(st.strokeW, st.border));
        addC(nodeBg, true);

        const isUnlocked = unlockedSet.has(tech.id);
        const inQueue    = res.queue.some(q => q.techId === tech.id);
        const isActive   = res.queue[0]?.techId === tech.id;
        const prereqOk   = prereqsMet(tech.id, unlockedSet);
        const status = isUnlocked ? '\u2713' : isActive ? '\u25b6' : inQueue ? '\u25cc' : prereqOk ? '\u25cb' : '\u25a0';
        addC(this.add.text(nx - NODE_W / 2 + 8, ny - 12, `${status} ${trunc(tech.name, 15)}`, {
          font: 'bold 11px monospace', fill: st.text
        }).setScrollFactor(0).setDepth(D + 3), true);
        addC(this.add.text(nx - NODE_W / 2 + 8, ny + 4, `${tech.cost} RP`, {
          font: '11px monospace', fill: '#aa99bb'
        }).setScrollFactor(0).setDepth(D + 3), true);
        addC(this.add.text(nx + NODE_W / 2 - 6, ny + NODE_H / 2 - 10, kindTag, {
          font: 'bold 8px monospace', fill: hexFill(kindColor)
        }).setOrigin(1, 1).setScrollFactor(0).setDepth(D + 3), true);

        if (inQueue) {
          const item = res.queue.find(q => q.techId === tech.id);
          const pct  = Math.min(1, (item?.rpSpent || 0) / tech.cost);
          const barY = ny + NODE_H / 2 - 6;
          addC(this.add.rectangle(nx - NODE_W / 2 + 5, barY, NODE_W - 10, 4, 0x221133, 0.8)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 2), true);
          addC(this.add.rectangle(nx - NODE_W / 2 + 5, barY, (NODE_W - 10) * pct, 4, 0xcc66ff, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 3), true);
        }
      }

      // Detail pane for selected tech
      const selId = this._researchSelTechId;
      let selTech = selId ? TECH_TREE[selId] : null;
      if (!selTech || selTech.branch !== branch) {
        selTech = branchTechs.find(t => prereqsMet(t.id, unlockedSet) && !unlockedSet.has(t.id))
          || branchTechs.find(t => !unlockedSet.has(t.id))
          || branchTechs[0];
        if (selTech) this._researchSelTechId = selTech.id;
      }

      const dx = detailLeft + 12, dy = detailTop + 14;
      if (selTech) {
        const isUnlocked = unlockedSet.has(selTech.id);
        const inQueue    = res.queue.some(q => q.techId === selTech.id);
        const isActive   = res.queue[0]?.techId === selTech.id;
        const prereqOk   = prereqsMet(selTech.id, unlockedSet);
        const kColor = KIND_COLOR[selTech.kind] || 0x6688cc;

        addC(this.add.text(dx, dy, selTech.name, {
          font: 'bold 15px monospace', fill: '#f0e8ff', wordWrap: { width: detailW - 24 }
        }).setScrollFactor(0).setDepth(D + 3));
        addC(this.add.text(dx, dy + 26, KIND_LABEL[selTech.kind] || selTech.kind.toUpperCase(), {
          font: 'bold 11px monospace', fill: hexFill(kColor)
        }).setScrollFactor(0).setDepth(D + 3));
        addC(this.add.text(dx, dy + 44, selTech.desc, {
          font: '12px monospace', fill: '#c8d4e8', wordWrap: { width: detailW - 24 }, lineSpacing: 4
        }).setScrollFactor(0).setDepth(D + 3));

        const preTxt = (selTech.prereqs || []).length
          ? (selTech.prereqs || []).map(id => TECH_TREE[id]?.name || id).join(', ')
          : 'none (starter)';
        addC(this.add.text(dx, dy + 108, `Requires: ${preTxt}`, {
          font: '11px monospace', fill: '#9988aa', wordWrap: { width: detailW - 24 }
        }).setScrollFactor(0).setDepth(D + 3));
        addC(this.add.text(dx, dy + 138, `Cost: ${selTech.cost} RP`, {
          font: 'bold 13px monospace', fill: '#cc88ff'
        }).setScrollFactor(0).setDepth(D + 3));

        if (inQueue) {
          const item = res.queue.find(q => q.techId === selTech.id);
          const pct  = Math.min(1, (item?.rpSpent || 0) / selTech.cost);
          addC(this.add.text(dx, dy + 160, `Progress: ${Math.round(pct * 100)}%${isActive ? ' (active)' : ''}`, {
            font: '12px monospace', fill: '#cc66ff'
          }).setScrollFactor(0).setDepth(D + 3));
        }

        const btnY = detailTop + detailH - 48;
        if (!isUnlocked && !inQueue && prereqOk) {
          const qb = this.add.text(detailLeft + detailW / 2, btnY, '\u25b6  QUEUE RESEARCH', {
            font: 'bold 14px monospace', fill: '#ffffff', backgroundColor: '#cc44aa', padding: { x: 12, y: 8 }
          }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 4).setInteractive({ useHandCursor: true });
          qb.on('pointerdown', () => {
            this._contextMenuClicked = true;
            res.queue.push({ techId: selTech.id, rpSpent: 0 });
            bumpClick(qb);
            makePanel(branch);
          });
          qb.on('pointerover', () => qb.setStyle({ backgroundColor: '#ee66cc' }));
          qb.on('pointerout',  () => qb.setStyle({ backgroundColor: '#cc44aa' }));
          addC(qb);
        } else if (inQueue && !isUnlocked) {
          const cb = this.add.text(detailLeft + detailW / 2, btnY, '\u2715  CANCEL', {
            font: 'bold 13px monospace', fill: '#ffaa88', backgroundColor: '#2a0810', padding: { x: 12, y: 6 }
          }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 4).setInteractive({ useHandCursor: true });
          cb.on('pointerdown', () => {
            this._contextMenuClicked = true;
            res.queue = res.queue.filter(q => q.techId !== selTech.id);
            makePanel(branch);
          });
          addC(cb);
        } else if (isUnlocked) {
          addC(this.add.text(detailLeft + detailW / 2, btnY, 'UNLOCKED', {
            font: 'bold 14px monospace', fill: '#44ff88'
          }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
        } else if (!prereqOk) {
          addC(this.add.text(detailLeft + detailW / 2, btnY, 'LOCKED', {
            font: 'bold 14px monospace', fill: '#665577'
          }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
        }
      }
    };

    this._addToUI(objs);
    this._researchObjs = objs;
    this._researchContentObjs = [];
    this._researchRenderBranch = makePanel;
    makePanel(selBranch);
  }

  _closeResearch() {
    if (this._researchObjs) {
      for (const o of this._researchObjs) { try { o.destroy(); } catch (e) {} }
      this._researchObjs = null;
    }
    if (this._researchContentObjs) {
      for (const o of this._researchContentObjs) { try { o.destroy(); } catch (e) {} }
      this._researchContentObjs = null;
    }
    if (this._researchMaskGfx) {
      try { this._researchMaskGfx.destroy(); } catch (e) {}
      this._researchMaskGfx = null;
    }
    this._researchMask = null;
    this._researchRenderBranch = null;
    this._researchTreeBounds = null;
    this._researchOpen = false;
    this._popInputBlocker('research');
    this._syncTopBarBlocked();
  }

  update() {
    const cam = this.cameras.main;

    // Smooth zoom toward target with soft speed ramp (trackpad-friendly)
    if (this._zoomTarget !== undefined) {
      const dz = this._zoomTarget - cam.zoom;
      if (Math.abs(dz) > 0.0005) {
        const ramp = 0.14 + Math.min(0.26, Math.abs(dz) * 0.35); // soft acceleration
        const nextZoom = cam.zoom + dz * ramp;
        const center = this._zoomPointer || this._playfieldScreenCenter();
        this._setCameraZoomAtScreen(cam, center.x, center.y, nextZoom);
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
    if (moving && this._contextMenuObjs) this._hideContextMenu(true);

    // AI autoplay self-heal: recover stuck AI turns (spectator duel + human vs AI).
    if (!this._aiAutoplayPaused && this._isAiControlled(this.gameState?.currentPlayer)) {
      const now = Date.now();
      const idleMs = now - (this._aiLastProgressAt || 0);
      if (this._aiTurnInProgress && idleMs > 20000 && this._aiActiveFinishTurn) {
        this._pushLog(`AI hard recover: forcing end of P${this._aiActiveTurnPlayer ?? this.gameState.currentPlayer} turn`);
        this._cancelAIPendingSteps();
        const fin = this._aiActiveFinishTurn;
        this._aiActiveFinishTurn = null;
        this._aiTurnInProgress = false;
        fin?.();
      } else if (!this._nameModalOpen && !this._settingsOpen && !this._endTurnPending
          && idleMs > 8000 && !this._aiTurnInProgress
          && !isPlayerMilitarilyEliminated(this.gameState, this.gameState.currentPlayer)) {
        if (this._aiViewerMode && this._isSpectatorDuel()) {
          this._pushLog(`AI autoplay self-heal: restarting P${this.gameState.currentPlayer} turn`);
        }
        this._aiLastProgressAt = now;
        this._runAITurn();
      }
    }

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
    if (this._mapBuilderMode) {
      this._builderPaint(q, r);
      return;
    }
    if (!this._isCurrentPlayerHumanControlled()) return;
    const gs = this.gameState;
    let clickedUnit     = unitAt(gs, q, r);
    let clickedBuilding = buildingAt(gs, q, r);

    // Fog safety: do not allow interaction with unseen enemy units/buildings
    const fog = this._currentFog;
    const isVisibleHex = !fog || fog.has(`${q},${r}`);
    const curPClick = Number(gs.currentPlayer);
    const enemyOnHex = isVisibleHex ? enemyAtHex(gs, q, r, curPClick) : null;
    if (!isVisibleHex) {
      if (clickedUnit && Number(clickedUnit.owner) !== curPClick) clickedUnit = null;
      if (clickedBuilding && Number(clickedBuilding.owner) !== curPClick) clickedBuilding = null;
    }

    // Unified attack click — any mode; never fall through to deselect on enemy clicks.
    if (this._tryCombatAtHex(q, r, enemyOnHex, curPClick)) return;

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
        this.selectedUnit.hidden = false;
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
        this.selectedUnit.hidden = false;
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
        if (UNIT_TYPES[this.selectedUnit.type].canBuild && this.settings.engineerAutoBuild) {
          this._buildMenuOpen = true;
          this._updateBottomPanel();
        }
        return;
      }
    }

    if (this.mode === 'attack_direct' || this.mode === 'attack') {
      this._pushLog(this.mode === 'attack'
        ? `Indirect: pick a hex in range${enemyOnHex ? '' : ' with an enemy'}`
        : 'Attack: click an enemy in range (orange outline)');
      this._refresh();
      return;
    }

    // Deploy ready unit at highlighted hex
    if (this._deployMode) {
      const site = this._deployHexes?.find(s => s.q === q && s.r === r);
      if (site) {
        const out = this._deployMode.buildingId
          ? deployReadyVtcUnitAtHex(gs, gs.currentPlayer, this._deployMode.buildingId, this._deployMode.readyId, q, r)
          : deployReadyGlobalRecruitAtHex(gs, gs.currentPlayer, this._deployMode.readyId, q, r);
        if (!out.ok) this._pushLog(`Deploy failed: ${out.reason}`);
        else this._pushLog(`Deployed ${UNIT_TYPES[gs.units[gs.units.length - 1]?.type]?.name || 'unit'}`);
        this._cancelDeployMode();
        this._refresh();
        return;
      }
    }

    // Own HQ / settlement — open build menu upgrades & production for this site
    if (clickedBuilding && Number(clickedBuilding.owner) === Number(gs.currentPlayer)
        && PRODUCTION_VTC_TYPES.has(clickedBuilding.type)) {
      this._focusBuildMenuBuilding(clickedBuilding);
      if (clickedUnit && Number(clickedUnit.owner) === Number(gs.currentPlayer)) {
        this.selectedUnit = clickedUnit;
        this.reachable = getReachableHexes(gs, clickedUnit, this.terrain, this.mapSize);
        this.attackable = getAttackableHexes(gs, clickedUnit, clickedUnit.q, clickedUnit.r, this._currentFog);
      } else {
        this.selectedUnit = null;
        this.reachable = [];
        this.attackable = [];
      }
      this.mode = 'select';
      this._refresh();
      return;
    }

    // Own unit on hex
    if (clickedUnit && Number(clickedUnit.owner) === Number(gs.currentPlayer)) {
      this._selectUnit(clickedUnit);
      return;
    }

    // Factory control: click own factory to open ON/OFF control panel
    if (clickedBuilding && Number(clickedBuilding.owner) === Number(gs.currentPlayer) && clickedBuilding.type === 'FACTORY') {
      this._showFactoryPanel(clickedBuilding);
      return;
    }

    // Legacy building recruit (barracks/yard)
    if (clickedBuilding && Number(clickedBuilding.owner) === Number(gs.currentPlayer) &&
        clickedBuilding.type !== 'ROAD' && BUILDING_TYPES[clickedBuilding.type].canRecruit.length > 0
        && !['VILLAGE', 'TOWN', 'CITY', 'HQ'].includes(clickedBuilding.type)) {
      this._showRecruitPanel(clickedBuilding);
      return;
    }

    if (this._tryCombatAtHex(q, r, enemyOnHex, curPClick)) return;
    this._clearSelection();
  }

  /** Live unit reference from game state (avoids stale selection objects). */
  _liveUnit(unit) {
    if (!unit) return null;
    return this.gameState.units.find(u => u.id == unit.id && isUnitAlive(u)) || null;
  }

  /**
   * Civ-style attack: validate target and resolve combat immediately (no preview gate).
   * Returns true if the click was consumed.
   */
  _tryCombatAtHex(q, r, enemyOnHex, curPClick) {
    const gs = this.gameState;
    const attacker = this._liveUnit(this.selectedUnit);
    if (!attacker || Number(attacker.owner) !== curPClick) return false;

    const attackEntry = (this.attackable || []).find(h => h.q === q && h.r === r);
    const target = enemyOnHex || resolveAttackTargetUnit(gs, attackEntry);
    if (!target) return false;

    const blindFire = this.mode === 'attack';
    const terr = gs._terrain || this.terrain;
    const check = canUnitAttackTarget(gs, attacker, target, terr, blindFire);
    if (!check.ok) {
      this._pushLog(`Cannot attack: ${check.reason}`);
      this._refresh();
      return true;
    }

    // IGOUGO / Civ-style: fire now, show result card (move + attack same turn).
    this._doImmediateAttack(attacker.id, target.id, blindFire);
    return true;
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
    if (this.selectedUnit?.id !== unit?.id) this._hideContextMenu(true);
    this._inspectorTabManual = null;
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
    if (unitCanAttack(unit)) {
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

    this._hideContextMenu(true);
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
    if (!this._mapBuilderMode && !this._isCurrentPlayerHumanControlled()) return;
    if (this._mapBuilderMode) {
      const seq = ['terrain','resource','building','unit','erase'];
      const idx = seq.indexOf(this._builder.mode);
      this._builder.mode = seq[(idx + 1) % seq.length];
      this._updateBuilderHud();
      return;
    }
    // Cancel special modes on right-click
    if (this.mode === 'road_dest') { this._cancelRoadDestMode(); return; }
    if (this.mode === 'move_order') { this._cancelMoveOrderMode(); return; }
    if (this.mode === 'transport_load' || this.mode === 'transport_unload') { this._cancelTransportMode(); return; }

    const gs = this.gameState;
    const curP = Number(gs.currentPlayer);
    const clickedUnit = unitAt(gs, q, r);
    const enemyOnHexRmb = enemyAtHex(gs, q, r, curP);

    // Right-click anywhere should first close transient menus/panels.
    this._hideContextMenu(true);
    this._hideRecruitPanel?.();
    this._closeFactoryPanel?.();

    if (this._tryCombatAtHex(q, r, enemyOnHexRmb, curP)) return;

    if (clickedUnit && clickedUnit.owner === gs.currentPlayer) {
      if (this.selectedUnit !== clickedUnit) this._selectUnit(clickedUnit);
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
    this._hideContextMenu(true);
    this._inspectorTabManual = null;
    this._cancelDeployMode();
    this._buildMenuTab = 'produce';
    this.selectedUnit = null; this.reachable = []; this.attackable = []; this.mode = 'select';
    this._refresh();
  }

  _onCancel() { this._hideContextMenu(true); this._clearSelection(); this._hideRecruitPanel(); }

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
    this._hideContextMenu(true);
    this._refresh();
  }

  // Direct attack — only visible enemies, no blind fire penalty
  _onDirectAttackMode() {
    const u = this._liveUnit(this.selectedUnit);
    if (!u || !unitCanAttack(u)) return;
    this.selectedUnit = u;
    this._contextMenuClicked = false;
    this._contextMenuSuppressDismissUntil = 0;
    this._hideContextMenu(true);
    this.mode = 'attack_direct';
    this.reachable  = [];
    const attackFog = AIR_UNITS.has(u.type) ? null : this._currentFog;
    this.attackable = getAttackableHexes(this.gameState, u, u.q, u.r, attackFog);
    this._pushLog(`ATTACK: click an enemy in range (${this.attackable.length} target${this.attackable.length === 1 ? '' : 's'})`);
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

  _onAmbush() {
    const gs = this.gameState;
    const u = this.selectedUnit;
    if (!u || u.type !== 'ANTI_TANK' || u.moved || u.attacked || u.hidden) return;
    const unlocked = new Set(gs.players[gs.currentPlayer]?.research?.unlocked || []);
    if (!unlocked.has('anti_tank_ambush')) return;
    u.hidden = true;
    u.moved = true;
    this._clearSelection();
  }

  // ── Auto-move destination selection ──────────────────────────────────────
  _enterMoveOrderMode(unit) {
    this._hideContextMenu(true);
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
    this._hideContextMenu(true);
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
    this._hideContextMenu(true);
    this._transportUnit = transport;
    this.mode = 'transport_load';
    this._showHint('🚢 Click adjacent LAND UNIT to board  (Right-click to cancel)');
    this._refresh();
  }

  _enterUnloadMode(transport) {
    this._hideContextMenu(true);
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
    if (!this._canPlaceRoadAt(u.q, u.r)) return;
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
    this._hideContextMenu(true);
    this._redrawRoads();
    this._clearSelection();
  }

  _onBuildLumberCamp() {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (!canEngineerBuildAt(gs, u.q, u.r, 'LUMBER_CAMP')) return;
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
    if (!ROAD_TYPES.has(type) && !ECON_BUILDINGS.has(type)) {
      const hasRoad = gs.buildings.some(r => ROAD_TYPES.has(r.type) && r.q === engineer.q && r.r === engineer.r);
      if (!hasRoad) gs.buildings.push(createBuilding('ROAD', gs.currentPlayer, engineer.q, engineer.r));
    }
    engineer.moved = true; engineer.building = true;
    this._clearSelection();
    this._refresh();
  }

  _onBuildStructure(type, ironCost, oilCost = 0, woodCost = 0, compCost = 0, steelCost = 0) {
    const gs = this.gameState, u = this.selectedUnit;
    if (!u || !UNIT_TYPES[u.type].canBuild) return;
    if (!canEngineerBuildAt(gs, u.q, u.r, type)) {
      this._pushLog('Build failed: structure already on this tile');
      return;
    }
    const def = BUILDING_TYPES[type];
    const unlocked = new Set(gs.players[gs.currentPlayer].research?.unlocked || []);
    if (def?.requiresTech && !unlocked.has(def.requiresTech)) return;
    if (def?.placementTerrain) {
      const t = this.terrain[`${u.q},${u.r}`] ?? 0;
      if (!def.placementTerrain.has(t)) {
        this._pushLog('Build failed: need open terrain (plains/sand/light woods)');
        return;
      }
    }
    const NAVAL_FACILITIES = new Set(['NAVAL_YARD','HARBOR','DRY_DOCK','NAVAL_BASE','NAVAL_DOCKYARD']);
    const coastalBuildings = new Set([...NAVAL_FACILITIES, 'PORT', 'SUPPLY_PORT']);
    if (coastalBuildings.has(type) && !this._isCoastalHex(u.q, u.r)) {
      this._log.unshift('Build failed: naval facilities require a coastal hex');
      this._log = this._log.slice(0, 8);
      this._refresh();
      return;
    }
    const pl = gs.players[gs.currentPlayer];
    if (pl.iron < ironCost) return;
    if (pl.oil < oilCost) return;
    if ((pl.wood || 0) < woodCost) return;
    if ((pl.components || 0) < compCost) return;
    if ((pl.hardenedSteel || 0) < steelCost) return;
    pl.iron -= ironCost;
    pl.oil -= oilCost;
    pl.wood = (pl.wood || 0) - woodCost;
    pl.components = (pl.components || 0) - compCost;
    pl.hardenedSteel = (pl.hardenedSteel || 0) - steelCost;
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
    this._hideContextMenu(true);
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
    this._hideContextMenu(true);
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
    const atk = this._liveUnit(attacker);
    const tgt = this.gameState.units.find(u => u.id === target?.id && !u.dead);
    if (!atk || !tgt) {
      this._pushLog('Combat preview failed: unit not found');
      return;
    }
    try {
      if (this._combatPreviewCleanup) {
        try { this._combatPreviewCleanup(); } catch (e) { /* ignore */ }
        this._combatPreviewCleanup = null;
      }
      this._combatPreviewCleanup = renderCombatPreviewPanel(this, atk, tgt, blindFire, {
        onAttack: () => {
          this._combatPreviewCleanup = null;
          this._doImmediateAttack(atk.id, tgt.id, blindFire);
        },
        onCancel: () => {
          this._combatPreviewCleanup = null;
          this._refresh();
        },
      });
    } catch (e) {
      this._pushLog(`Combat preview error: ${e?.message || e}`);
      console.error(e);
    }
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
    atkBtn.on('pointerdown', () => { cleanup(); this._doImmediateAttack(attacker.id, target.id, false); });
    canBtn.on('pointerdown', () => { cleanup(); this._refresh(); });
  }

  _doImmediateAttack(attackerId, targetId, blindFire) {
    // IGOUGO / Civ-style: resolve combat now, show result card, refresh
    const gs = this.gameState;
    const attacker = gs.units.find(u => u.id == attackerId && isUnitAlive(u));
    const target = gs.units.find(u => u.id == targetId && isUnitAlive(u));
    if (!attacker) { this._pushLog('Attack failed: attacker missing'); return; }
    if (!target) { this._pushLog('Attack failed: target missing'); return; }

    if (this._combatPreviewCleanup) {
      try { this._combatPreviewCleanup(); } catch (e) { /* ignore */ }
      this._combatPreviewCleanup = null;
    }

    let log = [];
    try {
      log = resolveImmediateAttack(gs, attackerId, targetId, blindFire) || [];
      if (log[0]?.type === 'miss') {
        const reason = log[0].reason;
        const msg = reason === 'no_los' ? 'no line of sight'
          : reason === 'out_of_range' ? 'out of range'
          : reason === 'invalid_target' ? 'invalid target'
          : 'attack failed';
        this._pushLog(`Attack failed: ${msg}`);
        this._refresh();
        return;
      }
      if (log[0]) this._recordCombat(log[0]);
      if (target && isUnitAlive(target)) target._tierIntelConfirmed = true;
      if (attacker && isUnitAlive(attacker)) attacker._tierIntelConfirmed = true;
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
            const downgradeType = tier >= 3 ? 'CONCRETE_ROAD' : tier >= 2 ? 'GRAVEL_ROAD' : 'ROAD';
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
    const atkAlive = gs.units.find(u => u.id === attackerId);
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
      if (this._aiViewerMode && this._isSpectatorDuel()) {
        this.time.delayedCall(2000, () => {
          if (this._splashDismiss === dismiss) dismiss();
        });
      }
    } else {
      this._pushLog('Attack resolved with no combat log entry (unexpected)');
    }
    const winner = checkWinner(gs);
    if (winner) {
      this._cancelAIPendingSteps();
      this._aiTurnInProgress = false;
      this._showResolution([], winner);
    }
  }

  _confirmEndTurn() {
    if (this._aiViewerMode) return;
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

  _canPlaceRoadAt(q, r) {
    const tt = this.terrain?.[`${q},${r}`] ?? 0;
    // No roads on mountains.
    return tt !== 2;
  }

  _forceAIRoadIfNeeded(player) {
    const gs = this.gameState;
    const roadsNow = gs.buildings.filter(b => Number(b.owner) === Number(player) && b.type === 'ROAD').length;
    const turn = gs.turn || 1;
    const roadFloor = turn <= 5 ? 2 : turn <= 10 ? 5 : turn <= 15 ? 8 : 12;
    if (roadsNow >= roadFloor) return false;

    const pl = gs.players[player] || {};
    const roadCost = BUILDING_TYPES['ROAD']?.buildCost || { wood: 1 };
    if ((pl.wood || 0) < (roadCost.wood || 1)) return false;

    const engineers = gs.units.filter(u => Number(u.owner) === Number(player) && u.type === 'ENGINEER' && !u.embarked && !u.constructing);
    for (const e of engineers) {
      const onRoad = !!roadAt(gs, e.q, e.r);
      const b = buildingAt(gs, e.q, e.r);
      const hasNonRoadBuilding = !!(b && !ROAD_TYPES.has(b.type));
      if (!onRoad && !hasNonRoadBuilding && this._canPlaceRoadAt(e.q, e.r)) {
        gs.players[player].wood -= (roadCost.wood || 1);
        gs.buildings.push(createBuilding('ROAD', player, e.q, e.r));
        return true;
      }
    }
    return false;
  }

  _summarizeAIAction(a) {
    if (!a || !a.type) return null;
    switch (a.type) {
      case 'move': return { type: 'move', unitId: a.unitId, to: [a.toQ ?? a.q, a.toR ?? a.r] };
      case 'attack': return { type: 'attack', unitId: a.unitId, target: [a.targetQ ?? a.q, a.targetR ?? a.r] };
      case 'build': return { type: 'build', buildingType: a.buildingType, at: [a.q, a.r], unitId: a.unitId };
      case 'recruit': return { type: 'recruit', unitType: a.unitType, buildingId: a.buildingId, global: !!a.global };
      case 'global_deploy': return { type: 'global_deploy', readyId: a.readyId, at: [a.q, a.r] };
      case 'research_queue': return { type: 'research_queue', techId: a.techId };
      case 'design': return { type: 'design', chassis: a.chassis, name: a.name };
      case 'transport_load': return { type: 'transport_load', transportId: a.transportId, cargoUnitId: a.cargoUnitId };
      case 'transport_unload': return { type: 'transport_unload', transportId: a.transportId };
      default: return { type: a.type };
    }
  }

  _snapshotPlayerEconomy(gs, p) {
    const pl = gs.players?.[p] || {};
    recalcPlayerPopulation(gs, p);
    const pop = getPopBreakdown(gs, p);
    const inc = calcIncome(gs, p);
    const upk = calcUpkeep(gs, p);
    const units = gs.units.filter(u => Number(u.owner) === p && !u.embarked);
    const combat = units.filter(u => {
      const d = UNIT_TYPES[u.type] || {};
      return (d.attack || 0) > 0 || (d.soft_attack || 0) > 0 || (d.hard_attack || 0) > 0;
    });
    const byType = {};
    for (const u of units) { byType[u.type] = (byType[u.type] || 0) + 1; }
    const bld = gs.buildings.filter(b => Number(b.owner) === p);
    const bldCounts = {};
    for (const b of bld) { bldCounts[b.type] = (bldCounts[b.type] || 0) + 1; }
    const res = pl.research || {};
    const techTree = gs._techTree || TECH_TREE || {};
    return {
      resources: {
        iron: pl.iron || 0, oil: pl.oil || 0, wood: pl.wood || 0, food: pl.food || 0,
        components: pl.components || 0, rp: pl.rp || 0, gold: pl.gold || 0,
        hardenedSteel: pl.hardenedSteel || 0, aviationAlloy: pl.aviationAlloy || 0,
      },
      income: inc,
      upkeep: upk,
      net: {
        iron: +(inc.iron - upk.iron).toFixed(2),
        oil: +(inc.oil - upk.oil).toFixed(2),
        food: +((inc.food || 0) - (upk.food || 0)).toFixed(2),
        rp: +(inc.rp || 0).toFixed(2),
      },
      units: units.length,
      combatUnits: combat.length,
      unsupplied: units.filter(u => (u.outOfSupply || 0) > 0).length,
      population: pop.avail,
      popFree: pop.avail,
      popCap: pop.cap,
      popUsed: pop.used,
      popFielded: pop.fielded,
      popReserved: pop.reserve,
      popQueued: pop.queued,
      popReady: pop.ready,
      popWaiting: pop.waiting,
      unitTypes: byType,
      buildings: bldCounts,
      research: {
        queue: (res.queue || []).map(item => {
          const tech = techTree[item.techId];
          const pct = tech ? Math.min(100, Math.round(((item.rpSpent || 0) / tech.cost) * 100)) : 0;
          return { techId: item.techId, name: tech?.name || item.techId, pct };
        }),
        unlockedCount: (res.unlocked || []).length,
      },
      designs: (gs.designs[p] || []).map(d => ({
        name: d.name, chassis: d.chassis, role: d.aiRole || 'custom', tier: d.effectiveTier,
      })),
      victoryPoints: gs.victoryPoints?.[p] ?? null,
    };
  }

  _compactAiDebug(dbg) {
    if (!dbg) return null;
    const bud = dbg.armyBudget;
    return {
      strategicPhase: dbg.strategicPhase,
      primaryLane: dbg.primaryLane,
      secondaryLane: dbg.secondaryLane,
      endgamePressure: dbg.endgamePressure,
      stockpilePressure: dbg.stockpilePressure,
      focusEnemy: dbg.focusEnemy,
      theaterMode: dbg.theaterMode,
      primaryTheaterId: dbg.primaryTheaterId,
      theaterObjective: dbg.theaterObjective,
      missions: dbg.missions,
      economy: dbg.economy,
      recruitMix: dbg.recruitMix,
      actionPlan: dbg.actionPlan,
      designs: dbg.designs,
      researchQueue: dbg.researchQueue,
      deceptionActive: dbg.deceptionActive,
      logisticsEmergency: dbg.logisticsEmergency,
      transportOps: dbg.transportOps,
      armyBudget: bud ? {
        myUnits: bud.myUnits, myCombat: bud.myCombat,
        maxUnits: bud.maxUnits, maxCombat: bud.maxCombat,
      } : undefined,
    };
  }

  _recordTurnSnapshot(endingPlayer) {
    const gs = this.gameState;
    if (!gs) return;
    const snapTurn = this._autoStopTurn > 0 ? Math.min(gs.turn, this._autoStopTurn) : gs.turn;
    // One snapshot per game turn (not per player end-turn in 1v1).
    if (this._lastSnapshotGameTurn === snapTurn) return;
    this._lastSnapshotGameTurn = snapTurn;
    const turn = snapTurn;
    if (turn > 24 && turn % 2 !== 0) return;
    if (turn > 48 && turn % 4 !== 0) return;

    const lite = turn > 32 || (gs.buildings?.length || 0) > 700;
    const playerIds = getPlayerIds(gs);
    const players = {};
    for (const p of playerIds) {
      if (lite) {
        const full = this._snapshotPlayerEconomy(gs, p);
        players[p] = {
          resources: full.resources,
          units: full.units,
          combatUnits: full.combatUnits,
          unsupplied: full.unsupplied,
          buildings: full.buildings,
        };
      } else {
        players[p] = this._snapshotPlayerEconomy(gs, p);
      }
    }
    const ai = {};
    for (const p of this.aiPlayers) {
      const lp = this._aiLastPlans?.[p];
      const telem = this._aiTelemetry?.[p];
      ai[p] = {
        strategy: this.aiStrategies[p] || this.aiStrategy,
        debug: this._compactAiDebug(gs._aiDebug?.[p]),
        telemetry: telem ? {
          strategicPhase: telem.strategicPhase,
          primaryLane: telem.primaryLane,
          roadDeficit: telem.roadDeficit,
          unsuppliedNow: telem.unsuppliedNow,
          plannerReason: telem.plannerReason,
          recruitMix: telem.recruitMix,
        } : null,
        lastPlan: lp ? {
          turn: lp.turn,
          strategy: lp.strategy,
          actionCounts: lp.actionCounts,
          phase: lp.debug?.strategicPhase,
        } : null,
      };
    }
    const entry = {
      turn: snapTurn,
      endingPlayer,
      currentPlayer: gs.currentPlayer,
      phase: gs.phase,
      players,
      ai,
      victoryPoints: gs.victoryMode === VICTORY_MODES.POINTS ? { ...gs.victoryPoints } : undefined,
    };
    this._runHistory = this._runHistory || [];
    this._runHistory.push(entry);
    const cap = this._maxRunHistoryTurns || 100;
    if (this._runHistory.length > cap) {
      this._runHistory.splice(0, this._runHistory.length - cap);
    }
    if (this._aiLabExport) {
      this._aiLabTurns = this._runHistory;
    }
  }

  _compactCombatLog(limit = 120) {
    const hist = this._combatHistory || [];
    return hist.slice(-limit).map(e => {
      if (!e?.entry) return { turn: e?.turn, type: e?.type || 'unknown' };
      const x = e.entry;
      return {
        turn: e.turn ?? this.gameState?.turn,
        attacker: `${x.attackerName || x.attackerType} P${x.attackerOwner}`,
        target: `${x.targetName || x.targetType} P${x.targetOwner}`,
        dmg: x.dmg, attackerDmg: x.attackerDmg, score: x.score,
        fort: x.fortName || null,
      };
    });
  }

  _buildRunPayload(reason = 'manual') {
    const gs = this.gameState;
    const outTurn = (reason === 'ai-lab-auto-stop' && this._autoStopTurn > 0)
      ? Math.min(gs.turn, this._autoStopTurn) : gs.turn;
    const playerIds = getPlayerIds(gs);
    const playersNow = {};
    for (const p of playerIds) {
      playersNow[p] = this._snapshotPlayerEconomy(gs, p);
    }
    const history = (this._runHistory?.length ? this._runHistory : this._aiLabTurns) || [];
    const winner = checkWinner(gs);
    return {
      meta: {
        reason,
        exportedAt: new Date().toISOString(),
        version: GAME_VERSION,
        turn: outTurn,
        winner: winner || null,
        mapSize: this.mapSize,
        scenario: this.scenario,
        playerCount: this.playerCount,
        humanPlayer: this.humanPlayer,
        aiPlayers: [...this.aiPlayers],
        aiStrategies: { ...this.aiStrategies },
        aiStrategy: this.aiStrategy,
        victoryMode: gs.victoryMode,
        victoryPointTarget: gs.victoryPointTarget,
        supplyEnabled: gs.supplyEnabled,
        mapSeed: this.mapSeed || 0,
      },
      turn: outTurn,
      // Per-turn timeline: economy, AI debug, missions, plans
      turns: history,
      // Current snapshot (even mid-game manual export)
      current: {
        players: playersNow,
        aiOverview: buildAIOverviewForGame(gs, this.terrain, this.mapSize, this.aiPlayers, this.aiStrategies),
        aiDebug: Object.fromEntries(
          [...this.aiPlayers].map(p => [p, this._compactAiDebug(gs._aiDebug?.[p])]).filter(([, v]) => v),
        ),
        lastAiPlans: Object.fromEntries(
          [...this.aiPlayers].map(p => {
            const lp = this._aiLastPlans?.[p];
            if (!lp) return null;
            return [p, {
              turn: lp.turn, strategy: lp.strategy,
              actionCounts: lp.actionCounts,
              actions: (lp.actions || []).slice(0, 60),
            }];
          }).filter(Boolean),
        ),
        victoryPoints: gs.victoryPoints ? { ...gs.victoryPoints } : undefined,
        victoryZones: (gs.victoryZones || []).map(z => ({ q: z.q, r: z.r, pointsPerTurn: z.pointsPerTurn })),
      },
      final: {
        players: gs.players,
        units: gs.units.map(u => ({
          id: u.id, type: u.type, owner: u.owner, q: u.q, r: u.r,
          health: u.health, outOfSupply: u.outOfSupply || 0, embarked: !!u.embarked,
        })),
        buildings: gs.buildings.map(b => ({
          id: b.id, type: b.type, owner: b.owner, q: b.q, r: b.r,
          underConstruction: !!b.underConstruction,
        })),
        resourceHexes: (gs.turn > 80 && Object.keys(gs.resourceHexes || {}).length > 120)
          ? { _note: 'trimmed for export size', count: Object.keys(gs.resourceHexes || {}).length }
          : gs.resourceHexes,
      },
      telemetry: this._aiTelemetry || {},
      combatLog: this._compactCombatLog(150),
      gameLog: (this._log || []).slice(-400),
      // Back-compat alias
      log: (this._log || []).slice(-400),
    };
  }

  _downloadRunJson(reason = 'manual') {
    const payload = this._buildRunPayload(reason);
    const txt = JSON.stringify(payload, null, 2);
    const blob = new Blob([txt], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attrition-run-${reason}-turn${this.gameState.turn}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const turns = payload.turns?.length || 0;
    this._pushLog(`📥 JSON exported (${(txt.length / 1024).toFixed(0)} KB, ${turns} turns logged)`);
  }

  _showAILabExport(reason = 'ai-lab-auto-stop', titleText = null) {
    const gs = this.gameState;

    const w = this.scale.width, h = this.scale.height;
    const boxW = Math.min(760, w - 40);
    const boxH = 280;
    const bg = this.add.rectangle(w/2, h/2, boxW, boxH, 0x0d1118, 0.97).setScrollFactor(0).setDepth(220).setStrokeStyle(3, 0x6688cc);
    const defaultTitle = reason === 'game-end'
      ? `RUN COMPLETE — GAME ENDED · TURN ${gs.turn}`
      : `RUN COMPLETE — AUTO-STOP · TURN ${gs.turn}`;
    const title = this.add.text(w/2, h/2 - 88, titleText || defaultTitle, {
      font: 'bold 24px monospace', fill: '#e8f4ff', wordWrap: { width: boxW - 48 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(221);
    const sub = this.add.text(w/2, h/2 - 36, 'Download the full JSON report (economy timeline, AI decisions, combat log).', {
      font: '16px monospace', fill: '#9fb8d8', wordWrap: { width: boxW - 56 }, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(221);
    const dl = this.add.text(w/2, h/2 + 28, '📥 DOWNLOAD JSON REPORT', {
      font: 'bold 18px monospace', fill: '#ffffff', backgroundColor: '#2a5a8a', padding: { x: 18, y: 12 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(221).setInteractive({ useHandCursor: true });
    const close = this.add.text(w/2, h/2 + 88, 'CLOSE', {
      font: 'bold 15px monospace', fill: '#cccccc', backgroundColor: '#333333', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(221).setInteractive({ useHandCursor: true });
    this._addToUI([bg, title, sub, dl, close]);

    dl.on('pointerdown', () => this._downloadRunJson(reason));
    const cleanup = () => [bg, title, sub, dl, close].forEach(o => { try { o.destroy(); } catch(e){} });
    close.on('pointerdown', cleanup);
  }

  _onSubmit() {
    const camSnap = this._snapshotSpectatorCamera();
    this._aiLastProgressAt = Date.now();
    this._hideEndTurnConfirm();
    const gs = this.gameState;
    const endingPlayer = gs.currentPlayer;
    this._hideRecruitPanel();
    this._clearSelection();
    if (this._isAiControlled(gs.currentPlayer)) this._forceAIRoadIfNeeded(gs.currentPlayer);
    gs._aiPlayers = [...this.aiPlayers];
    gs._mapSize = this.mapSize;
    const events = resolveEndOfTurn(gs, this.terrain);

    const researchEvents = events.filter(e => /researched:/i.test(e));
    if (researchEvents.length > 0) {
      for (const e of researchEvents) this._pushLog(`🔬 ${e}`);
      if (!this._isAiControlled(endingPlayer)) {
        this._showResearchCompletePopup(researchEvents);
      }
    }

    // Per-turn run history — defer 1 frame so end-turn UI stays responsive
    if (this.aiPlayers?.size > 0) {
      this.time.delayedCall(0, () => {
        if (this.gameState) this._recordTurnSnapshot(endingPlayer);
      });
    }

    const winner = checkWinner(gs);
    if (winner) {
      this._cancelAIPendingSteps();
      this._aiTurnInProgress = false;
      this._showResolution([], winner);
      return;
    }

    // Auto-stop harness runs at configured turn cap.
    const effectiveTurn = this._autoStopTurn > 0 ? Math.min(gs.turn, this._autoStopTurn) : gs.turn;
    if (this._autoStopTurn > 0 && effectiveTurn >= this._autoStopTurn) {
      this._aiAutoplayPaused = true;
      this._refresh();
      if (this._aiLabExport) this._showAILabExport('ai-lab-auto-stop', `AI LAB RUN COMPLETE (AUTO-STOP · TURN ${this._autoStopTurn})`);
      return;
    }

    this._freezeFog();
    this._refresh();

    if (!this._aiViewerMode && Number(gs.currentPlayer) === Number(this.humanPlayer)) {
      this._focusPlayerHQ(gs.currentPlayer, true);
    }

    // If the next player is AI-controlled, skip the pass screen and run AI automatically
    if (this._isAiControlled(gs.currentPlayer)) {
      if (this._aiAutoplayPaused) {
        this._pushLog('AI autoplay paused. Press SPACE to resume.');
      } else {
        this.time.delayedCall(50, () => {
          if (this._isAiControlled(this.gameState?.currentPlayer)) this._runAITurn();
        });
      }
    } else {
      this._showPassScreen(`Player ${gs.currentPlayer}'s turn — take the controls`);
    }
    this._restoreSpectatorCamera(camSnap);
  }

  // ── AI turn runner ────────────────────────────────────────────────────────

  _cancelAIPendingSteps() {
    for (const step of this._aiPendingSteps || []) {
      try {
        if (step?.remove) step.remove();
        else clearTimeout(step);
      } catch (e) {}
    }
    this._aiPendingSteps = [];
    this._slideState = null;
  }

  _scheduleAIStep(ms, fn, turnId = this._aiTurnId) {
    const wrapped = () => {
      if (this._aiTurnId !== turnId) return;
      this._aiLastProgressAt = Date.now();
      fn();
    };
    const ev = this.time.delayedCall(this._simMs(ms), wrapped);
    (this._aiPendingSteps = this._aiPendingSteps || []).push(ev);
    return ev;
  }

  _scheduleAIStepTimeout(ms, fn, turnId = this._aiTurnId) {
    const handle = setTimeout(() => {
      if (this._aiTurnId !== turnId) return;
      this._aiLastProgressAt = Date.now();
      fn();
    }, this._simMs(ms));
    (this._aiPendingSteps = this._aiPendingSteps || []).push(handle);
    return handle;
  }

  _aiActionBudget(gs, player) {
    const turn = Number(gs?.turn || 1);
    const mapN = Number(this.mapSize || gs?._mapSize || 40);
    const myUnits = gs.units.filter(u => Number(u.owner) === Number(player) && !u.embarked).length;
    const techScale = Math.floor(turn / 6);
    const mapScale = Math.floor(mapN / 7);
    const armyScale = Math.floor(myUnits * 1.1);
    // Scales up through mid/late game but hard-bounded for stability.
    const lateTighten = turn > 60 ? Math.floor((turn - 60) / 5) : 0;
    const midMapLate = mapN >= 60 && mapN < 90 && turn > 100 ? Math.floor((turn - 100) / 6) : 0;
    const largeMapPenalty = mapN >= 90 ? Math.floor((mapN - 90) / 8) + (turn > 120 ? Math.floor((turn - 120) / 8) : 0) : 0;
    const budgetCap = mapN >= 90 ? 72 : (mapN >= 60 && turn > 120 ? 84 : 96);
    return Math.max(18, Math.min(budgetCap, 10 + techScale + mapScale + armyScale - lateTighten - midMapLate - largeMapPenalty));
  }

  _prioritizeAIActions(actions) {
    const rank = {
      attack: 0, global_deploy: 1, recruit: 2, transport_unload: 3, transport_load: 4,
      move: 5, digin: 6, build: 7,
    };
    return [...(actions || [])].sort((a, b) => (rank[a.type] ?? 8) - (rank[b.type] ?? 8));
  }

  _applyAIStabilityCaps(actions, gs, player) {
    const budget = this._aiActionBudget(gs, player);
    const turn = gs.turn || 1;
    const perUnitCap = Math.max(2, Math.min(6, 2 + Math.floor(turn / 25)));
    const attackCap = Math.max(6, Math.min(22, Math.floor(budget * 0.22)));
    const hugeMap = Number(this.mapSize || gs?._mapSize || 40) >= 90;
    const moveCap = Math.max(8, Math.min(Math.floor(budget * 0.55), hugeMap ? 36 : (turn > 80 ? 48 : 64)));
    let buildCap = Math.max(4, Math.min(Math.floor(budget * 0.28), hugeMap ? 12 : (turn > 80 ? 14 : 24)));
    const hasArmyAction = (actions || []).some(a =>
      ['attack', 'move', 'recruit', 'global_deploy', 'vtc_upgrade'].includes(a.type));
    if (!hasArmyAction) buildCap = Math.min(buildCap, 2);
    const recruitCap = Math.max(2, Math.min(Math.floor(budget * 0.14), hugeMap ? 5 : 7));
    const kept = [];
    const byUnit = {};
    let moves = 0, builds = 0, recruits = 0, attacks = 0;
    for (const a of actions || []) {
      if (kept.length >= budget) break;
      if (a.type === 'attack') {
        if (attacks >= attackCap) continue;
        attacks += 1;
      }
      if (a.type === 'move' && moves >= moveCap) continue;
      if (a.type === 'build' && builds >= buildCap) continue;
      if (a.type === 'recruit' && recruits >= recruitCap) continue;
      if (a.unitId != null) {
        const lim = (a.type === 'build' || a.type === 'move') ? perUnitCap : 2;
        byUnit[a.unitId] = byUnit[a.unitId] || 0;
        if (byUnit[a.unitId] >= lim) continue;
        byUnit[a.unitId] += 1;
      }
      kept.push(a);
      if (a.type === 'move') moves += 1;
      if (a.type === 'build') builds += 1;
      if (a.type === 'recruit') recruits += 1;
    }
    return { actions: kept, budget, truncated: (actions?.length || 0) - kept.length };
  }

  _dropNoProgressMoves(actions, gs, player, aiDebug) {
    if (!Array.isArray(actions) || actions.length === 0) return actions || [];
    const noContact = !aiDebug?.mapSummary?.enemyCombatCentroid;
    if (!noContact) return actions;
    const goals = [];
    for (const b of gs.buildings || []) {
      if (b.underConstruction || ROAD_TYPES.has(b.type)) continue;
      if (isPlayerCapitalBuilding(b) && Number(b.owner) !== Number(player)) goals.push(b);
      else if (Number(b.owner) === 0 && ['VILLAGE', 'TOWN', 'CITY'].includes(b.type)) goals.push(b);
      else if (Number(b.owner) !== Number(player) && Number(b.owner) > 0
        && ['VILLAGE', 'TOWN', 'CITY', 'MINE', 'OIL_PUMP'].includes(b.type)) goals.push(b);
    }
    if (!goals.length) return actions;
    const distToGoals = (q, r) => Math.min(...goals.map((g) => hexDistance(q, r, g.q, g.r)));
    const nonMoves = actions.filter((a) => a.type !== 'move' || a.unitId == null);
    const moves = actions.filter((a) => a.type === 'move' && a.unitId != null);
    const closer = moves.filter((a) => {
      const u = gs.units.find(x => x.id === a.unitId);
      if (!u) return true;
      const curD = distToGoals(u.q, u.r);
      const newD = distToGoals(a.toQ, a.toR);
      return newD < curD;
    });
    const keptMoves = closer.length ? closer : moves.slice(0, Math.min(6, moves.length));
    const merged = [...nonMoves, ...keptMoves];
    return merged.length ? merged : actions;
  }

  _runAITurn() {
    if (this._aiTurnInProgress) return;
    this._cancelAIPendingSteps();
    this._aiTurnId = (this._aiTurnId || 0) + 1;
    const turnId = this._aiTurnId;
    this._aiTurnInProgress = true;
    this._aiLastProgressAt = Date.now();
    this._roadsDirty = false;
    const gs  = this.gameState;

    const winnerNow = checkWinner(gs);
    if (winnerNow) {
      this._aiTurnInProgress = false;
      this._pushLog(`Game over — P${winnerNow} wins.`);
      this._showResolution([], winnerNow);
      return;
    }
    if (isPlayerMilitarilyEliminated(gs, gs.currentPlayer)) {
      this._aiTurnInProgress = false;
      this._pushLog(`P${gs.currentPlayer} has no field army (standoff / rebuild).`);
    }
    const preUnitsByOwner = {
      1: gs.units.filter(u => Number(u.owner) === 1).length,
      2: gs.units.filter(u => Number(u.owner) === 2).length,
    };
    const w   = this.scale.width, h = this.scale.height;
    const stratLabel = AI_STRATEGIES[this.aiStrategy]?.label || 'Balanced';

    // Status bar (replaces pass screen for AI turn)
    const preKPI = getAIKPIReport(gs, gs.currentPlayer);
    let overlay = null, lbl = null, kpiLbl = null;
    const spectatorMode = this._isSpectatorDuel();
    if (!spectatorMode) {
      overlay = this.add.rectangle(w/2, 34, w, 68, 0x1a1200, 0.92)
        .setScrollFactor(0).setDepth(200);
      lbl = this.add.text(w/2, 20, `⚙  AI Player ${gs.currentPlayer} — ${stratLabel} — acting…`, {
        font: 'bold 14px monospace', fill: '#ffcc44',
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(201);
      kpiLbl = this.add.text(w/2, 44, preKPI.summary, {
        font: '12px monospace', fill: preKPI.health === 'POOR' ? '#ff6666' : (preKPI.health === 'WARN' ? '#ffcc66' : '#99ff99'),
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(201);
      this._addToUI([overlay, lbl, kpiLbl]);
    }

    const runPlannedAITurn = () => {
    if (this._aiTurnId !== turnId) return;
    // Plan all actions (does NOT execute — pure data). Yield first so UI can paint "acting…".
    let actions = [];
    const mapN = Number(this.mapSize || gs._mapSize || 40);
    const plannerMs = mapN >= 150 ? 8000 : (mapN >= 120 ? 6000 : (mapN >= 60 ? 4500 : 6000));
    gs._aiPlannerDeadline = performance.now() + plannerMs;
    const tPlan0 = performance.now();
    const planWatchdog = setTimeout(() => {
      if (performance.now() - tPlan0 > plannerMs + 500) {
        this._pushLog(`AI P${gs.currentPlayer}: planner slow (>${plannerMs}ms) — may still be running`);
      }
    }, plannerMs + 500);
    try {
      actions = planAITurn(gs, this.terrain, this.mapSize, this.aiStrategies?.[gs.currentPlayer] || this.aiStrategy);
    } catch (e) {
      delete gs._aiPlannerDeadline;
      this._pushLog(`AI planner crash: ${e?.message || e}`);
      this._aiTelemetry = this._aiTelemetry || {};
      this._aiTelemetry[gs.currentPlayer] = {
        turn: gs.turn,
        roadDeficit: 0,
        roadsPlanned: 0,
        roadsAttempted: 0,
        roadsSucceeded: 0,
        plannerReason: 'planner_crash',
        blocked: { occupied: 0, noWood: 0, alreadyRoad: 0, invalidBuilder: 0 },
      };
      this._cancelAIPendingSteps();
      this._aiActiveFinishTurn = null;
      this._aiTurnInProgress = false;
      this._aiLastProgressAt = Date.now();
      this._onSubmit();
      return;
    } finally {
      clearTimeout(planWatchdog);
      delete gs._aiPlannerDeadline;
    }
    const planMs = performance.now() - tPlan0;
    if (planMs > 2500) {
      this._pushLog(`AI P${gs.currentPlayer}: planner took ${Math.round(planMs)}ms (${actions.length} actions)`);
    }
    actions = this._dropNoProgressMoves(actions, gs, gs.currentPlayer, gs._aiDebug?.[gs.currentPlayer]);
    actions = this._prioritizeAIActions(actions);
    const capped = this._applyAIStabilityCaps(actions, gs, gs.currentPlayer);
    actions = capped.actions;
    if (capped.truncated > 0) {
      this._pushLog(`AI P${gs.currentPlayer}: stability cap trimmed ${capped.truncated} actions (budget ${capped.budget})`);
    }
    if (!actions.length) {
      this._pushLog(`AI P${gs.currentPlayer}: no actions after planning — ending turn`);
    }
    const aiCounts = actions.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});
    const roadsBuiltThisTurn = actions.filter(a => a.type === 'build' && a.buildingType === 'ROAD').length;
    const depotsBuiltThisTurn = actions.filter(a => a.type === 'build' && a.buildingType === 'SUPPLY_DEPOT').length;
    const engineersQueued = actions.filter(a => a.type === 'recruit' && a.unitType === 'ENGINEER').length;
    const trucksQueued = actions.filter(a => a.type === 'recruit' && a.unitType === 'SUPPLY_TRUCK').length;
    const engineerActionIds = new Set(actions.filter(a => a.unitId != null).map(a => a.unitId));
    const myUnitsNow = gs.units.filter(u => Number(u.owner) === Number(gs.currentPlayer) && !u.embarked);
    const unsuppliedNow = myUnitsNow.filter(u => (u.outOfSupply || 0) > 0).length;
    const engineersIdle = myUnitsNow.filter(u => u.type === 'ENGINEER' && !u.constructing && !engineerActionIds.has(u.id)).length;
    const logisticsOverride = unsuppliedNow >= Math.max(2, Math.floor(myUnitsNow.length * 0.2));
    const strategicMem = gs._aiStrategicMemory?.[gs.currentPlayer] || null;
    const aiDebug = gs._aiDebug?.[gs.currentPlayer] || null;
    this._aiLastPlans = this._aiLastPlans || {};
    this._aiLastPlans[gs.currentPlayer] = {
      turn: gs.turn,
      strategy: this.aiStrategies?.[gs.currentPlayer] || this.aiStrategy,
      actionCounts: { ...aiCounts },
      actionPlan: gs._aiDebug?.[gs.currentPlayer]?.actionPlan || null,
      debug: this._compactAiDebug(aiDebug),
      actions: actions.slice(0, 80).map(a => this._summarizeAIAction(a)).filter(Boolean),
    };
    this._aiTelemetry = this._aiTelemetry || {};
    const roadsNow = gs.buildings.filter(b => Number(b.owner) === Number(gs.currentPlayer) && b.type === 'ROAD').length;
    const roadFloor = (gs.turn <= 5) ? 2 : (gs.turn <= 10) ? 5 : (gs.turn <= 15) ? 8 : 12;
    this._aiTelemetry[gs.currentPlayer] = {
      turn: gs.turn,
      roadDeficit: Math.max(0, roadFloor - roadsNow),
      roadsPlanned: roadsBuiltThisTurn,
      roadsAttempted: 0,
      roadsSucceeded: 0,
      logisticsOverride,
      unsuppliedNow,
      depotsPlanned: depotsBuiltThisTurn,
      trucksQueued,
      engineersIdle,
      strategicPhase: aiDebug?.strategicPhase || strategicMem?.phase || null,
      strategicPhaseTurns: strategicMem?.phaseTurns || null,
      strategicLaneScore: strategicMem?.laneScore || null,
      primaryLane: aiDebug?.primaryLane || strategicMem?.primaryLane || null,
      secondaryLane: aiDebug?.secondaryLane || strategicMem?.secondaryLane || null,
      corridorPlan: aiDebug?.corridorPlan || null,
      engineerAssignments: aiDebug?.engineerAssignments || null,
      engineerTaskLocks: aiDebug?.engineerTaskLocks ?? null,
      engineersStalled: aiDebug?.engineersStalled ?? null,
      forceSplit: aiDebug?.forceSplit || null,
      recruitMix: aiDebug?.recruitMix || null,
      centerBiasScore: aiDebug?.centerBiasScore ?? null,
      unsuppliedClusters: aiDebug?.unsuppliedClusters || null,
      mapSummary: aiDebug?.mapSummary || null,
      logisticsActionsTaken: roadsBuiltThisTurn + depotsBuiltThisTurn + trucksQueued,
      plannerReason: aiDebug?.plannerReason
        || (logisticsOverride
          ? (roadsBuiltThisTurn > 0 || depotsBuiltThisTurn > 0 || trucksQueued > 0 ? 'logistics_override' : 'logistics_pressure')
          : (roadsBuiltThisTurn > 0 ? 'planned' : (roadsNow >= roadFloor ? 'floor_met' : 'no_viable_plan'))),
      blocked: { occupied: 0, noWood: 0, alreadyRoad: 0, invalidBuilder: 0 },
    };
    this._pushLog(`AI P${gs.currentPlayer}: ${actions.length} actions (move:${aiCounts.move||0} atk:${aiCounts.attack||0} build:${aiCounts.build||0} recruit:${aiCounts.recruit||0} design:${aiCounts.design||0})`);
    this._pushLog(`AI P${gs.currentPlayer}: roadsPlanned=${roadsBuiltThisTurn} depotsPlanned=${depotsBuiltThisTurn} engQueued=${engineersQueued} engIdle=${engineersIdle} trucksQueued=${trucksQueued} oos=${unsuppliedNow} override=${logisticsOverride ? 'Y' : 'N'} phase=${aiDebug?.strategicPhase||strategicMem?.phase||'n/a'} lane=${aiDebug?.primaryLane||strategicMem?.primaryLane||'n/a'}/${aiDebug?.secondaryLane||strategicMem?.secondaryLane||'n/a'} centerBias=${aiDebug?.centerBiasScore ?? 'n/a'}`);
    this._pushLog(`AI P${gs.currentPlayer}: ${preKPI.summary}`);

    // Execute actions sequentially with delays and visual feedback
    let aiTurnDone = false;
    this._aiActiveTurnPlayer = gs.currentPlayer;
    const finishAITurn = () => {
      if (this._aiTurnId !== turnId) return;
      if (aiTurnDone) return;
      aiTurnDone = true;
      this._cancelAIPendingSteps();
      this._aiActiveFinishTurn = null;
      this._aiActiveTurnPlayer = null;
      this._aiTurnInProgress = false;
      this._aiLastProgressAt = Date.now();
      const postKPI = getAIKPIReport(gs, gs.currentPlayer);
      this._pushLog(`AI P${gs.currentPlayer}: post-action ${postKPI.summary}`);
      const postUnitsByOwner = {
        1: gs.units.filter(u => Number(u.owner) === 1).length,
        2: gs.units.filter(u => Number(u.owner) === 2).length,
      };
      for (const p of [1, 2]) {
        const delta = postUnitsByOwner[p] - (preUnitsByOwner[p] || 0);
        if (delta <= -8) {
          this._pushLog(`⚠ MASS LOSS P${p}: ${preUnitsByOwner[p]} -> ${postUnitsByOwner[p]} (Δ${delta}) on AI P${gs.currentPlayer} turn`);
        }
      }
      // All done — one full redraw then end turn
      try { overlay?.destroy(); } catch(e){}
      try { lbl?.destroy();     } catch(e){}
      try { kpiLbl?.destroy();  } catch(e){}
      const planP = gs.currentPlayer;
      const planCounts = this._aiLastPlans?.[planP]?.actionCounts || {};
      const buildOnlyPlan = (planCounts.build || 0) > 0
        && !(planCounts.move || planCounts.attack || planCounts.recruit || planCounts.global_deploy)
        && actions.length <= 2;
      gs._aiStagnation = gs._aiStagnation || {};
      const stagMem = gs._aiStagnation[planP] || { buildOnlyStreak: 0 };
      stagMem.buildOnlyStreak = buildOnlyPlan ? (stagMem.buildOnlyStreak || 0) + 1 : 0;
      stagMem.lastTurn = gs.turn;
      gs._aiStagnation[planP] = stagMem;
      if (buildOnlyPlan && stagMem.buildOnlyStreak >= 2) {
        this._pushLog(`AI P${planP}: stagnation breakout armed (${stagMem.buildOnlyStreak} build-only turns)`);
      }

      this._freezeFog();
      if (this._roadsDirty) {
        this._redrawRoads();
        this._roadsDirty = false;
      }
      this._refresh();
      this._onSubmit();
    };

    this._aiActiveFinishTurn = finishAITurn;

    // Freeze guard: never let AI turn hang indefinitely.
    this._scheduleAIStep(12000, () => {
      if (!aiTurnDone) {
        this._pushLog(`AI P${gs.currentPlayer}: watchdog timeout, forcing turn submit`);
        finishAITurn();
      }
    }, turnId);

    this._executeAIActions(actions, 0, finishAITurn, turnId);
    };

    if (lbl) lbl.setText(`⚙  AI Player ${gs.currentPlayer} — ${stratLabel} — planning…`);
    // Yield one frame so the planning overlay paints before synchronous planner work.
    this.time.delayedCall(16, runPlannedAITurn);
  }

  _executeAIActions(actions, index, onDone, turnId = this._aiTurnId) {
    if (this._aiTurnId !== turnId) return;
    if (index >= actions.length) { onDone(); return; }

    const action = actions[index];
    let advanced = false;
    const next = () => {
      if (this._aiTurnId !== turnId) return;
      if (advanced) return;
      advanced = true;
      this._aiLastProgressAt = Date.now();
      this._executeAIActions(actions, index + 1, onDone, turnId);
    };
    const stepWatchdog = this._scheduleAIStepTimeout(4500, () => {
      if (!advanced) {
        this._pushLog(`AI action watchdog: forcing next (${action.type})`);
        next();
      }
    }, turnId);
    const gs     = this.gameState;

    try {
    if (action.type === 'move') {
      const unit = gs.units.find(u => u.id === action.unitId);
      if (!unit) { next(); return; }
      // Explicit AI move overrides any standing order to prevent end-turn move/unmove loops.
      delete unit.moveOrder;
      delete unit.roadOrder;

      // Snap position and play slide animation
      const fromW = hexToWorld(action.fromQ, action.fromR);
      unit.q = action.toQ; unit.r = action.toR;
      unit.dugIn = false;
      unit.hidden = false;
      unit.moved = true; unit.movesLeft = 0;

      const mapN = Number(this.mapSize || 75);
      const slideMs = mapN >= 60 ? 140 : 220;
      this._slideState = {
        unit, fromX: fromW.x, fromY: fromW.y,
        toX: hexToWorld(action.toQ, action.toR).x,
        toY: hexToWorld(action.toQ, action.toR).y,
        startTime: performance.now(), duration: slideMs,
      };
      this._aiRefreshUnitsOnly();
      // Wait for slide to finish + small gap
      this._scheduleAIStep(slideMs + 90, next, turnId);

    } else if (action.type === 'attack') {
      const attacker = gs.units.find(u => u.id === action.attackerId);
      const target   = gs.units.find(u => u.id === action.targetId);
      if (!attacker || !target) { next(); return; }

      // Execute the attack (critical: pass attacker.id, not attacker object)
      let log = [];
      try {
        log = resolveImmediateAttack(gs, attacker.id, action.targetId, false) || [];
        if (log[0]) this._recordCombat(log[0]);
      } catch (e) {
        this._pushLog(`AI attack error: ${e?.message || e}`);
      }
      attacker.attacked = true;
      this._aiRefreshUnitsOnly();

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
        this._scheduleAIStep(120, () => {
          if (this._aiTurnId !== turnId) return;
          this.input.on('pointerup', dismiss);
          this.input.keyboard?.once('keydown-SPACE', dismiss);
        }, turnId);
        const combatCardMs = (this.mapSize || 40) >= 60 ? 1200 : 2500;
        if (this._aiViewerMode && this._isSpectatorDuel()) {
          this._scheduleAIStep(Math.min(700, combatCardMs), () => { if (!done) dismiss(); }, turnId);
        }
        this._scheduleAIStep(combatCardMs, () => { if (!done) dismiss(); }, turnId);
      } else {
        this._pushLog('AI attack resolved with no combat log entry');
        this._scheduleAIStep(200, next, turnId);
      }

    } else if (action.type === 'global_deploy') {
      const unitType = action.unitType
        || gs.buildings.find(b => b.id === action.buildingId)?.readyUnits
          ?.find(r => r.id === action.readyId)?.type;
      const out = action.buildingId
        ? deployReadyVtcUnitAtHex(gs, gs.currentPlayer, action.buildingId, action.readyId, action.q, action.r)
        : deployReadyGlobalRecruitAtHex(gs, gs.currentPlayer, action.readyId, action.q, action.r);
      if (out.ok) {
        this._pushLog(`AI deployed ${UNIT_TYPES[unitType]?.name || unitType || 'unit'} at (${action.q},${action.r})`);
        this._invalidateSupplyCache();
        this._aiRefreshAfterBuild(false);
      } else {
        this._pushLog(`AI deploy failed: ${out.reason || 'unknown'} (${unitType || 'unit'})`);
      }
      this._updateTopBar();
      next();

    } else if (action.type === 'recruit') {
      if (action.global) {
        queueGlobalRecruit(gs, gs.currentPlayer, action.unitType, action.buildingId);
      } else {
        queueRecruit(gs, gs.currentPlayer, action.unitType, action.buildingId);
      }
      this._updateTopBar();
      next();

    } else if (action.type === 'vtc_upgrade') {
      const out = purchaseVtcUpgrade(gs, gs.currentPlayer, action.buildingId, action.upgradeId);
      if (out.ok) this._pushLog(`AI VTC upgrade started (${action.upgradeId})`);
      this._refresh();
      this._updateTopBar();
      next();

    } else if (action.type === 'upgrade_settlement') {
      const out = upgradeSettlement(gs, gs.currentPlayer, action.buildingId);
      if (out.ok) {
        this._pushLog(`AI promoting settlement → ${out.target} (${out.turns}t)`);
      }
      this._refresh();
      this._updateTopBar();
      next();

    } else if (action.type === 'digin') {
      const unit = gs.units.find(u => u.id === action.unitId);
      if (unit && UNIT_TYPES[unit.type]?.canDigIn) {
        unit.dugIn = true; unit.moved = true;
        this._redrawUnits();
      }
      next();

    } else if (action.type === 'ambush') {
      const unit = gs.units.find(u => u.id === action.unitId);
      const unlocked = new Set(gs.players[gs.currentPlayer]?.research?.unlocked || []);
      if (unit && unit.type === 'ANTI_TANK' && !unit.moved && !unit.attacked && unlocked.has('anti_tank_ambush')) {
        unit.hidden = true;
        unit.moved = true;
        this._redrawUnits();
      }
      next();

    } else if (action.type === 'build') {
      const unit = gs.units.find(u => u.id === action.unitId);
      const p = gs.currentPlayer;
      const bType = action.buildingType;
      const telem = this._aiTelemetry?.[p];
      const roadAttempt = bType === 'ROAD';
      if (roadAttempt && telem) telem.roadsAttempted += 1;
      if (!unit || unit.owner !== p || !UNIT_TYPES[unit.type]?.canBuild) {
        if (roadAttempt && telem) telem.blocked.invalidBuilder += 1;
        next(); return;
      }

      const cost = BUILDING_TYPES[bType]?.buildCost || {};
      const pl = gs.players[p];

      // Placement validity similar to player build flow.
      const onRoad = !!roadAt(gs, unit.q, unit.r);
      const anyNonRoadBuilding = gs.buildings.some(b => b.q === unit.q && b.r === unit.r && !ROAD_TYPES.has(b.type));
      if (bType === 'ROAD') {
        if (!this._canPlaceRoadAt(unit.q, unit.r)) { if (telem) telem.blocked.occupied += 1; next(); return; }
        if (onRoad) { if (telem) telem.blocked.alreadyRoad += 1; next(); return; }
        if (anyNonRoadBuilding) { if (telem) telem.blocked.occupied += 1; next(); return; }
      } else if (anyNonRoadBuilding) {
        next(); return;
      }

      if ((pl.iron || 0) < (cost.iron || 0) || (pl.oil || 0) < (cost.oil || 0) ||
          (pl.wood || 0) < (cost.wood || 0) || (pl.components || 0) < (cost.components || 0)) {
        if (roadAttempt && telem) telem.blocked.noWood += 1;
        next(); return;
      }

      pl.iron = (pl.iron || 0) - (cost.iron || 0);
      pl.oil = (pl.oil || 0) - (cost.oil || 0);
      pl.wood = (pl.wood || 0) - (cost.wood || 0);
      pl.components = (pl.components || 0) - (cost.components || 0);

      if (bType === 'ROAD') {
        gs.buildings.push(createBuilding('ROAD', p, unit.q, unit.r));
        if (telem) telem.roadsSucceeded += 1;
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
        if (!ECON_BUILDINGS.has(bType)) {
          const hasRoad = gs.buildings.some(r => ROAD_TYPES.has(r.type) && r.q === unit.q && r.r === unit.r);
          if (!hasRoad) gs.buildings.push(createBuilding('ROAD', p, unit.q, unit.r));
        }
      }

      unit.moved = true;
      unit.building = true;
      this._aiRefreshAfterBuild(ROAD_TYPES.has(bType));
      this._scheduleAIStep(120, next, turnId);

    } else if (action.type === 'design') {
      const result = registerDesign(gs, gs.currentPlayer, action.chassis, action.modules, action.name);
      if (result.ok) this._updateTopBar();
      next();

    } else if (action.type === 'research_queue') {
      const pl = gs.players?.[gs.currentPlayer];
      if (pl) {
        pl.research = pl.research || { queue: [], unlocked: [], slots: 1 };
        const q = pl.research.queue || (pl.research.queue = []);
        const unlocked = new Set(pl.research.unlocked || []);
        const alreadyQueued = q.some(it => it.techId === action.techId);
        if (!alreadyQueued && !unlocked.has(action.techId)) {
          q.push({ techId: action.techId, rpSpent: 0 });
          this._pushLog(`AI P${gs.currentPlayer}: queued research ${action.techId}`);
        }
      }
      next();

    } else if (action.type === 'transport_load') {
      const transport = gs.units.find(u => u.id === action.transportId);
      const cargoUnit = gs.units.find(u => u.id === action.cargoUnitId);
      if (transport && cargoUnit && cargoUnit.owner === gs.currentPlayer) {
        const dist = hexDistance(transport.q, transport.r, cargoUnit.q, cargoUnit.r);
        if (dist <= 1) {
          const def = UNIT_TYPES[transport.type];
          const cap = def?.capacity;
          if (cap) {
            if (!transport.cargo) transport.cargo = [];
            const loadedInf = (transport.cargo || []).filter(id => {
              const u2 = gs.units.find(u => u.id === id);
              return u2 && !['TANK', 'ARTILLERY', 'ANTI_TANK'].includes(u2.type);
            }).length;
            const loadedVeh = transport.cargo.length - loadedInf;
            const isVehicle = ['TANK', 'ARTILLERY', 'ANTI_TANK'].includes(cargoUnit.type);
            const ok = isVehicle ? loadedVeh < cap.vehicle : loadedInf < cap.infantry;
            if (ok) {
              transport.cargo.push(cargoUnit.id);
              cargoUnit.embarked = true;
              this._pushLog(`AI P${gs.currentPlayer}: loaded ${cargoUnit.type} onto transport`);
            }
          }
        }
      }
      this._aiRefreshUnitsOnly();
      next();

    } else if (action.type === 'transport_unload') {
      const transport = gs.units.find(u => u.id === action.transportId);
      if (transport && transport.cargo?.length > 0) {
        const dist = hexDistance(transport.q, transport.r, action.toQ, action.toR);
        if (dist <= 1) {
          const ttype = this.terrain[`${action.toQ},${action.toR}`] ?? 0;
          if ((ttype <= 3 || ttype === 6) && !unitAt(gs, action.toQ, action.toR)) {
            const unitId = transport.cargo.shift();
            const cargoUnit = gs.units.find(u => u.id === unitId);
            if (cargoUnit) {
              cargoUnit.q = action.toQ;
              cargoUnit.r = action.toR;
              cargoUnit.embarked = false;
              cargoUnit.moved = true;
              this._pushLog(`AI P${gs.currentPlayer}: unloaded ${cargoUnit.type}`);
            }
          }
        }
      }
      this._aiRefreshUnitsOnly();
      next();

    } else {
      next();
    }
    } catch (e) {
      this._pushLog(`AI action crash (${action?.type || 'unknown'}): ${e?.message || e}`);
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
    this._hideContextMenu(true);
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
        // Pan camera to the combat hex (skirmish only — spectator keeps free camera)
        if (!this._aiViewerMode) {
          await new Promise(res => this.cameras.main.pan(x, y, 350, 'Sine.easeInOut', false, (_cam, p) => { if (p >= 1) res(); }));
        }

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

  _simMs(ms) {
    if (this._aiViewerMode && this.aiPlayers?.has?.(1) && this.aiPlayers?.has?.(2)) {
      return Math.max(20, Math.floor(ms / Math.max(1, this._aiSimSpeed || 1)));
    }
    return ms;
  }

  _wait(ms) { return new Promise(r => this.time.delayedCall(this._simMs(ms), r)); }

  _showCombatCard(entry, idx, total) {
    return renderCombatResultPanel(this, entry, idx, total);
  }

  _waitForAdvance(label = '[ SPACE or CLICK → NEXT COMBAT ]') {
    return new Promise(resolve => {
      const hint = this.add.text(this.scale.width / 2, this.scale.height - 56, label, {
        font: 'bold 13px monospace', fill: '#ffffff', backgroundColor: '#333333', padding: { x: 12, y: 6 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(205);
      this._addToUI([hint]);

      let autoTimer = null;
      const done = () => {
        if (autoTimer) { try { autoTimer.remove(false); } catch (e) {} autoTimer = null; }
        try { hint.destroy(); } catch (e) {}
        this.input.keyboard.off('keydown-SPACE', onSpace);
        this.input.off('pointerdown', onClick);
        resolve();
      };
      const onSpace = () => done();
      const onClick = () => done();
      this.input.keyboard.once('keydown-SPACE', onSpace);
      this.input.once('pointerdown', onClick);

      // AI-vs-AI spectator mode: auto-advance combat cards after ~2s.
      if (this._aiViewerMode && this._isSpectatorDuel()) {
        autoTimer = this.time.delayedCall(this._simMs(900), () => done());
      }
    });
  }

  /** Tear down pass/resolution/combat splash without running navigation callbacks. */
  _abortSplashModal() {
    this._splashDismiss = null;
    if (this._gameOverSpaceKey) {
      this.input.keyboard.off('keydown-SPACE', this._gameOverSpaceKey);
      this._gameOverSpaceKey = null;
    }
  }

  // ── Pass / Resolution screens ─────────────────────────────────────────────
  _showSplash(objects, onDismiss) {
    // Defensive: ensure only one splash/modal is ever alive.
    if (this._splashDismiss) {
      try { this._splashDismiss(); } catch (e) {}
      this._splashDismiss = null;
    }
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

  /** Victory / game-over: JSON export + return to menu (no accidental dismiss on download). */
  _showGameOverSplash(resolutionObjects, onMenu) {
    this._cancelAIPendingSteps();
    this._aiTurnInProgress = false;
    this._abortSplashModal();
    if (this._gameOverCleanup) {
      try { this._gameOverCleanup(); } catch (e) {}
      this._gameOverCleanup = null;
    }
    this._gameOverActive = true;
    this._spaceGuardUntil = performance.now() + 3200;
    this.btnSubmit?.setVisible(false);

    const w = this.scale.width, h = this.scale.height;
    const footerY = h - 54;
    const uiObjs = [];

    const hint = this.add.text(w / 2, footerY - 58, 'Export turn history, AI decisions, economy, and combat log', {
      font: '13px monospace', fill: '#778899',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202);
    uiObjs.push(hint);
    const hint2 = this.add.text(w / 2, footerY - 38, 'Use buttons below — SPACE will not leave this screen', {
      font: '11px monospace', fill: '#556677',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202);
    uiObjs.push(hint2);

    const dlBtn = this.add.text(w / 2 - 155, footerY, '📥 DOWNLOAD JSON', {
      font: 'bold 16px monospace', fill: '#ffffff', backgroundColor: '#2a5a8a', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });
    dlBtn.on('pointerdown', () => {
      this._contextMenuClicked = true;
      this._spaceGuardUntil = performance.now() + 800;
      this._downloadRunJson('game-end');
    });
    dlBtn.on('pointerover', () => dlBtn.setAlpha(0.85));
    dlBtn.on('pointerout', () => dlBtn.setAlpha(1));
    uiObjs.push(dlBtn);

    const menuBtn = this.add.text(w / 2 + 155, footerY, 'MAIN MENU →', {
      font: 'bold 16px monospace', fill: '#ffffff', backgroundColor: '#334433', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerover', () => menuBtn.setAlpha(0.85));
    menuBtn.on('pointerout', () => menuBtn.setAlpha(1));
    uiObjs.push(menuBtn);

    const goMenu = () => {
      if (!this._gameOverActive) return;
      this._gameOverActive = false;
      this._gameOverCleanup = null;
      this._abortSplashModal();
      this._spaceGuardUntil = performance.now() + 380;
      [...resolutionObjects, ...uiObjs].forEach(o => { try { o.destroy(); } catch (e) {} });
      onMenu();
    };
    this._gameOverCleanup = goMenu;
    menuBtn.on('pointerdown', goMenu);

    this._addToUI(uiObjs);
  }

  _focusPlayerHQ(player, smooth = true) {
    if (this._aiViewerMode) {
      this._stopCameraMotion();
      return;
    }
    const hq = getPlayerCapital(this.gameState, player);
    if (!hq) return;
    const cam = this.cameras.main;
    const { x, y } = hexToWorld(hq.q, hq.r);

    // Use camera-native centering/pan to avoid manual scroll math drift.
    if (!smooth) {
      cam.centerOn(x, y);
      this._redrawRoads();
      return;
    }

    cam.pan(x, y, 320, 'Sine.easeOut', true, (_cam, progress) => {
      if (progress >= 1) {
        // snap-finalize to exact center (eliminates residual offset)
        cam.centerOn(x, y);
        this._redrawRoads();
      }
    });
  }

  _showPassScreen(msg) {
    // Safety: clear any lingering end-turn confirm state so pass-screen SPACE can't auto-submit.
    this._hideEndTurnConfirm?.();
    this._endTurnPending = false;

    const w = this.scale.width, h = this.scale.height;
    const gs = this.gameState;
    const p = this._playerId(gs.currentPlayer);
    if (this._aiViewerMode && this._isAiControlled(p)) {
      if (!this._aiAutoplayPaused) {
        this.time.delayedCall(50, () => {
          if (this._isAiControlled(this.gameState?.currentPlayer)) this._runAITurn();
        });
      }
      return;
    }
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
      this._splashDismiss = null;
    });
  }

  _showResolution(events, winner) {
    const w = this.scale.width, h = this.scale.height;
    const gs = this.gameState;
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
      this._cancelAIPendingSteps();
      this._aiTurnInProgress = false;
      yPos += 10;
      const label = PLAYER_LABELS[winner] || `Player ${winner}`;
      const vpWin = gs.victoryMode === VICTORY_MODES.POINTS;
      const vtcWin = gs.victoryMode === VICTORY_MODES.VTC_CONTROL;
      const vtcT = gs.vtcControlTurns || 5;
      addLine(vpWin
        ? `🏆  ${label.toUpperCase()} (P${winner}) WINS — ${gs.victoryPoints?.[winner] || 0} VP!`
        : vtcWin
          ? `🏆  ${label.toUpperCase()} (P${winner}) WINS — all settlements held ${vtcT} turns!`
          : `🏆  ${label.toUpperCase()} (P${winner}) WINS!`, '#ffdd44', true);
      yPos += 6;
      addLine(`Game over — thanks for playing Attrition`, '#888888');
      this._addToUI(objects);
      this._showGameOverSplash(objects, () => { this.scene.start('MenuScene'); });
    } else {
      yPos += 6;
      addLine(`Turn ${this.gameState.turn} begins`, '#666666');
      this._addToUI(objects);
      // IGOUGO: after resolution, pass to current player (already set by resolveTurn)
      const nextP = this.gameState.currentPlayer;
      this._showSplash(objects, () => {
        if (this._isAiControlled(nextP)) {
          if (!this._aiAutoplayPaused) this._runAITurn();
        } else {
          this._showPassScreen(`Player ${nextP}'s turn — take the controls`);
        }
      });
    }
  }

  _pushLog(msg) {
    this._log.push(msg);
    if (this._log.length > 5) this._log.shift();
  }

  _showResearchCompletePopup(researchEvents) {
    this._dismissResearchCompletePopup();
    const w = this.scale.width, h = this.scale.height;
    const D = 240;
    const lines = researchEvents.map(e => e.replace(/^P\d+\s+researched:\s*/i, '').replace(/!+$/, ''));
    const title = lines.length === 1 ? 'Research Complete' : `Research Complete (${lines.length})`;
    const body = lines.map(s => `• ${s}`).join('\n');

    this._researchCompletePopup = true;
    this._pushInputBlocker('researchComplete');
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(D).setInteractive();
    overlay.on('pointerdown', () => {});
    const cardW = Math.min(480, w - 40), cardH = lines.length > 1 ? 160 : 130;
    const card = this.add.rectangle(w / 2, h / 2, cardW, cardH, 0x141018, 0.98)
      .setStrokeStyle(3, 0xffcc44).setScrollFactor(0).setDepth(D + 1);
    this.add.rectangle(w / 2, h / 2 - cardH / 2 + 2, cardW, 4, 0xff66cc, 1)
      .setScrollFactor(0).setDepth(D + 2);
    const hdr = this.add.text(w / 2, h / 2 - cardH / 2 + 28, title, {
      font: 'bold 18px monospace', fill: '#ffcc44',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);
    const lbl = this.add.text(w / 2, h / 2 - 8, body, {
      font: '13px monospace', fill: '#d8ead8', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);
    const ok = this.add.text(w / 2, h / 2 + cardH / 2 - 28, 'GOT IT', {
      font: 'bold 14px monospace', fill: '#ffffff', backgroundColor: '#4a2080',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3).setInteractive({ useHandCursor: true });
    ok.on('pointerdown', () => this._dismissResearchCompletePopup());
    ok.on('pointerover', () => ok.setAlpha(0.85));
    ok.on('pointerout', () => ok.setAlpha(1));
    const objs = [overlay, card, hdr, lbl, ok];
    this._researchCompleteObjs = objs;
    this._addToUI(objs);
  }

  _dismissResearchCompletePopup() {
    if (this._researchCompleteObjs) {
      for (const o of this._researchCompleteObjs) { try { o.destroy(); } catch (e) {} }
      this._researchCompleteObjs = null;
    }
    this._researchCompletePopup = false;
    this._popInputBlocker('researchComplete');
  }

  _showResearchToast(researchEvents) {
    this._showResearchCompletePopup(researchEvents);
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

    if (this.scenario === 'combat' || this.scenario === 'combat_test') {
      // Open plains arena
    } else if (this.scenario === 'mortar_test') {
      // Deliberate LOS blockers between mortar and all in-range targets.
      for (const [q, r] of [[6,10], [6,11], [6,9]]) map[`${q},${r}`] = 2; // mountains
    } else if (this.scenario === 'coastal_battery_test') {
      // Fixed coast strip so battery is guaranteed coastal.
      for (let r = 0; r < this.mapSize; r++) {
        map[`7,${r}`] = 4; // shallow water column
        map[`8,${r}`] = 5; // deep water column
      }
    } else if (this.scenario === 'naval') {
      this._genNavalTerrain(map, ms);
    } else if (this.scenario === 'random' || this.scenario === 'custom') {
      if (this.procLandProfile === 'two_continents') {
        this._genTwoContinentsTerrain(map, ms, this.mapSeed);
      } else {
        this._genProcTerrain(map, ms, this.mapSeed, this.procLandProfile || 'islands');
      }
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
    for (const b of gs.buildings.filter(b => isPlayerCapitalBuilding(b))) {
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
      large_islands:  { scale: 0.070, sea: 0.50, edgeFalloff: 1.10, edgeStart: 0.60, islandAmp: 0.42, islandRad: 0.28, centers: [[0.22,0.22],[0.50,0.18],[0.80,0.25],[0.18,0.60],[0.52,0.68],[0.78,0.58]] },
      continent:      { scale: 0.045, sea: 0.36, edgeFalloff: 0.8, edgeStart: 0.70, islandAmp: 0.00, islandRad: 0.0, centers: [] },
      two_continents: { scale: 0.045, sea: 0.34, edgeFalloff: 1.2, edgeStart: 0.60, islandAmp: 0.00, islandRad: 0.0, centers: [] },
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

    // Continent anchor (seed-jittered — avoids same island + center spine every game)
    const contCX = ms * (0.50 + (this._fbm(seed * 0.001, 2.1, seed + 301, 1) - 0.5) * 0.22);
    const contCY = ms * (0.50 + (this._fbm(seed * 0.001, 2.9, seed + 307, 1) - 0.5) * 0.20);
    const contA  = ms * (0.24 + this._fbm(seed * 0.001, 3.7, seed + 313, 1) * 0.12);
    const contB  = ms * (0.18 + this._fbm(seed * 0.001, 4.3, seed + 317, 1) * 0.11);
    const contRot = (this._fbm(seed * 0.001, 7.7, seed + 203, 1) - 0.5) * 1.35;

    // Build height map
    const h = {};

    // World-space normalization helps avoid rhombus/square bias from raw q/r axes.
    const cHex = hexToWorld(Math.floor(ms * 0.5), Math.floor(ms * 0.5));
    const corners = [hexToWorld(0, 0), hexToWorld(ms - 1, 0), hexToWorld(0, ms - 1), hexToWorld(ms - 1, ms - 1)];
    const maxDX = Math.max(...corners.map(p => Math.abs(p.x - cHex.x))) || 1;
    const maxDY = Math.max(...corners.map(p => Math.abs(p.y - cHex.y))) || 1;

    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        const warpQ = q * SCALE + (this._fbm(q * 0.06 + 17, r * 0.06 + 41, seed + 2100, 2) - 0.5) * 2.4;
        const warpR = r * SCALE + (this._fbm(q * 0.06 + 83, r * 0.06 + 29, seed + 2200, 2) - 0.5) * 2.4;
        let v = this._fbm(warpQ, warpR, seed);

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

        // Civ-like continent shaping pass: one main landmass with seed-jittered lobes.
        if (isContinentLike) {
          const d0 = Math.sqrt(((q - contCX) / Math.max(1, contA)) ** 2 + ((r - contCY) / Math.max(1, contB)) ** 2);
          let blob = Math.max(0, 1 - d0);
          for (let li = 0; li < 3; li++) {
            const ang = this._fbm(seed * 0.003, li * 9.3 + 1.1, seed + 320 + li * 17, 2) * Math.PI * 2;
            const dist = ms * (0.10 + this._fbm(seed * 0.003, li * 11.7 + 2.4, seed + 330 + li * 19, 2) * 0.14);
            const lx = contCX + Math.cos(ang) * dist;
            const ly = contCY + Math.sin(ang) * dist;
            const la = contA * (0.52 + this._fbm(seed * 0.003, li * 5.9, seed + 340 + li, 2) * 0.18);
            const lb = contB * (0.56 + this._fbm(seed * 0.003, li * 6.7, seed + 350 + li, 2) * 0.16);
            const dl = Math.sqrt(((q - lx) / Math.max(1, la)) ** 2 + ((r - ly) / Math.max(1, lb)) ** 2);
            blob = Math.max(blob, 1 - dl);
          }

          const coastBreak = this._fbm(q * 0.14 + 911, r * 0.14 + 377, seed + 4040, 3) * 0.26;
          const macro = this._fbm(q * 0.05 + 220, r * 0.05 + 610, seed + 5050, 2) * 0.12;
          v = (v * 0.30) + (blob * 0.98) + coastBreak + macro - 0.22;
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
          const cr = Math.cos(contRot), sr = Math.sin(contRot);
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

        // Two-continent profile: carve central ocean channel + land bridge at top
        if (landProfile === 'two_continents') {
          const center = ms * 0.5;
          const band = Math.abs(q - center) / ms;
          // Carve wide ocean channel down the center (left-right split)
          if (band < 0.15) v -= (0.35 * (1 - band / 0.15)); // strong central carve
          // Land bridge at the TOP: narrow isthmus connecting the two continents
          // r=0 is top edge; bridge is in the top 10% of map, centered at center-q
          const topFraction = r / ms;
          if (topFraction < 0.10 && band < 0.09) {
            const bridgeBoost = (0.10 - topFraction) * 4.5 * (1 - band / 0.09);
            v += bridgeBoost; // pushes land bridge above sea level
          }
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

        // Mountains: rarer; on continents push ranges to coasts/edges, not one center spine.
        const mtnV = isContinentLike ? (MTN_LV + 0.04) : MTN_LV;
        const ridgeMtn = isContinentLike ? 0.64 : 0.60;
        const ridgeMtn2 = isContinentLike ? 0.58 : 0.54;
        let ridgeNeed = ridgeMtn;
        if (isContinentLike) {
          const centerDist = Math.min(1, Math.sqrt(((q - contCX) / ms) ** 2 + ((r - contCY) / ms) ** 2) / 0.52);
          ridgeNeed = ridgeMtn + (1 - centerDist) * 0.26;
        }
        const isMountain = (v > mtnV && ridge > ridgeNeed) || (v > mtnV + 0.05 && ridge > ridgeMtn2 + 0.04);
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

    // Break up continent-scale mountain megablobs (one huge impassable spine).
    {
      const NEI = NEIGHBORS;
      let landCount = 0;
      for (let q = 0; q < ms; q++) {
        for (let r = 0; r < ms; r++) {
          const t = map[`${q},${r}`];
          if (t !== 4 && t !== 5) landCount++;
        }
      }
      const maxBlob = Math.max(22, Math.floor(landCount * 0.045));
      const seenMt = new Set();
      for (let q0 = 0; q0 < ms; q0++) {
        for (let r0 = 0; r0 < ms; r0++) {
          const sk = `${q0},${r0}`;
          if (map[sk] !== 2 || seenMt.has(sk)) continue;
          const comp = [];
          const stack = [{ q: q0, r: r0 }];
          while (stack.length) {
            const { q, r } = stack.pop();
            const k = `${q},${r}`;
            if (seenMt.has(k) || map[k] !== 2) continue;
            seenMt.add(k);
            comp.push({ q, r });
            for (const [dq, dr] of NEI) {
              const nq = q + dq, nr = r + dr;
              if (!isValid(nq, nr, ms)) continue;
              stack.push({ q: nq, r: nr });
            }
          }
          if (comp.length <= maxBlob) continue;
          const interior = (q, r) => {
            let n = 0;
            for (const [dq, dr] of NEI) {
              const k2 = `${q + dq},${r + dr}`;
              if (map[k2] === 2) n++;
            }
            return n;
          };
          comp.sort((a, b) => interior(b.q, b.r) - interior(a.q, a.r));
          const cut = Math.floor(comp.length * 0.38);
          for (let i = 0; i < cut; i++) {
            const { q, r } = comp[i];
            map[`${q},${r}`] = 3;
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

    if (isContinentLike) this._carveInlandLakes(map, ms, seed + 4242);

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

  // Small inland seas / lakes on large continents (adds visual life, breaks monotony).
  _carveInlandLakes(map, ms, seed) {
    const NEIGHBORS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    const isWater = (t) => t === 4 || t === 5;
    const dist = new Map();
    const qv = [];
    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        const t = map[`${q},${r}`];
        if (!isWater(t)) continue;
        const k = `${q},${r}`;
        dist.set(k, 0);
        qv.push({ q, r });
      }
    }
    while (qv.length) {
      const cur = qv.shift();
      const k = `${cur.q},${cur.r}`;
      const d0 = dist.get(k) ?? 0;
      for (const [dq, dr] of NEIGHBORS) {
        const nq = cur.q + dq, nr = cur.r + dr;
        if (!isValid(nq, nr, ms)) continue;
        const nk = `${nq},${nr}`;
        if (dist.has(nk)) continue;
        const t = map[nk];
        if (isWater(t)) {
          dist.set(nk, d0);
          qv.push({ q: nq, r: nr });
        } else if (t !== 2) {
          dist.set(nk, d0 + 1);
          qv.push({ q: nq, r: nr });
        }
      }
    }
    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        const t = map[`${q},${r}`];
        if (t === 2 || t === 4 || t === 5) continue;
        const d = dist.get(`${q},${r}`);
        if (d == null || d < 8 || d > 22) continue;
        const lakeN = this._fbm(q * 0.22 + 60, r * 0.22 + 140, seed, 3);
        if (lakeN > 0.70) map[`${q},${r}`] = 4;
      }
    }
  }

  _pickNSpawnPoints(playerCount, ctx) {
    const {
      ms, map, isWalkable, isLand, isValid, _walkCompSize, _landCompSize,
      minSpawnComp, minLandComp, NEIGHBORS, islandMode,
    } = ctx;
    const center = Math.floor(ms / 2);
    const n = Math.max(2, Math.min(6, playerCount));

    if (islandMode && isLand && isValid) {
      const islandPicked = pickIslandSpawnPoints({
        mapSize: ms,
        playerCount: n,
        isLand,
        isWalkable,
        isValid,
        walkCompSize: _walkCompSize,
        minLandTiles: minLandComp,
      });
      if (islandPicked.length >= n) return islandPicked;
    }

    const candidates = [];
    for (let q = 1; q < ms - 1; q++) {
      for (let r = 1; r < ms - 1; r++) {
        if (!isWalkable(q, r)) continue;
        const compSize = _walkCompSize(q, r);
        const landCompSize = _landCompSize?.(q, r) ?? compSize;
        if (islandMode && landCompSize < minLandComp) continue;
        if (compSize < minSpawnComp) continue;
        const walkNeighbors = NEIGHBORS.filter(([dq, dr]) => isWalkable(q + dq, r + dr)).length;
        if (walkNeighbors < 4) continue;
        candidates.push({ q, r, compSize, landCompSize, walkNeighbors });
      }
    }

    const picked = pickBalancedSpawnPoints({
      mapSize: ms,
      playerCount: n,
      candidates,
      twoPlayerBands: !islandMode,
      isWalkable,
      walkCompSize: _walkCompSize,
      minSpawnComp,
      islandMode,
      minLandComp: minLandComp,
    });

    if (picked.length >= n) return picked;

    // Island fallback: largest qualifying landmasses, never tiny islets.
    if (islandMode && isLand && isValid) {
      const retry = pickIslandSpawnPoints({
        mapSize: ms,
        playerCount: n,
        isLand,
        isWalkable,
        isValid,
        walkCompSize: _walkCompSize,
        minLandTiles: Math.max(10, minLandComp - 4),
        minWalkableTiles: 4,
      });
      if (retry.length >= n) return retry;
    }

    // Last resort: perimeter ring on walkable / cleared plains (non-island or desperate).
    const fallback = [];
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const q = Math.max(2, Math.min(ms - 3, Math.round(center + Math.cos(angle) * ms * 0.38)));
      const r = Math.max(2, Math.min(ms - 3, Math.round(center + Math.sin(angle) * ms * 0.28)));
      map[`${q},${r}`] = 0;
      fallback.push({ q, r });
    }
    return fallback;
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

    const _landCompCache = new Map();
    const _landCompSize = (sq, sr) => {
      const seedK = `${sq},${sr}`;
      if (_landCompCache.has(seedK)) return _landCompCache.get(seedK);
      if (!isLand(sq, sr)) return 0;
      const qv = [{ q: sq, r: sr }];
      const seen = new Set();
      while (qv.length) {
        const cur = qv.pop();
        const k = `${cur.q},${cur.r}`;
        if (seen.has(k)) continue;
        if (!isLand(cur.q, cur.r)) continue;
        seen.add(k);
        for (const [dq, dr] of NEIGHBORS) {
          const nq = cur.q + dq, nr = cur.r + dr;
          if (!isValid(nq, nr, ms)) continue;
          const nk = `${nq},${nr}`;
          if (!seen.has(nk) && isLand(nq, nr)) qv.push({ q: nq, r: nr });
        }
      }
      const size = seen.size;
      for (const k of seen) _landCompCache.set(k, size);
      _landCompCache.set(seedK, size);
      return size;
    };

    const landProfile = this.procLandProfile || 'continent';
    const islandLike = new Set(['islands', 'large_islands', 'archipelago', 'naval_supremacy']);
    const islandMode = islandLike.has(landProfile);
    const minLandComp = MIN_ISLAND_LAND_TILES;
    const minSpawnComp = (() => {
      if (islandMode) return Math.max(8, Math.floor(ms * 0.35));
      if (landProfile === 'continent' || landProfile === 'two_continents') return Math.max(40, Math.floor(ms * ms * 0.08));
      if (landProfile === 'landlocked') return Math.max(36, Math.floor(ms * ms * 0.07));
      return Math.max(16, Math.floor(ms * ms * 0.03));
    })();

    const spawnCtx = {
      ms, map, isWalkable, isLand, isValid, _walkCompSize, _landCompSize,
      minSpawnComp, minLandComp, NEIGHBORS, islandMode,
    };
    const playerCount = this.playerCount || gs.playerCount || 2;
    let spawnPoints = this._pickNSpawnPoints(playerCount, spawnCtx);
    let p1 = spawnPoints[0];
    let p2 = spawnPoints[1] || spawnPoints[0];

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
      if (!p1) { map[`${fb1.q},${fb1.r}`] = 0; p1 = fb1; }
      if (!p2) { map[`${fb2.q},${fb2.r}`] = 0; p2 = fb2; }
      spawnPoints = spawnPoints.length ? spawnPoints : [p1, p2];
      if (spawnPoints.length < playerCount) {
        spawnPoints = this._pickNSpawnPoints(playerCount, spawnCtx);
      }
    }

    // Island spawns handled in _pickNSpawnPoints via pickIslandSpawnPoints (15+ tile landmasses).

    // Force HQ hexes and nearby hexes to walkable plains
    const clearForSpawn = (q, r) => {
      map[`${q},${r}`] = 0;
      NEIGHBORS.forEach(([dq,dr]) => { if (isValid(q+dq,r+dr,ms)) map[`${q+dq},${r+dr}`] = 0; });
    };
    for (const sp of spawnPoints) clearForSpawn(sp.q, sp.r);

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

      // Home capital village + starting dirt road + deploy/supply ring
      const capital = createBuilding('VILLAGE', player, hq.q, hq.r);
      capital.isCapital = true;
      if (adjWater(hq.q, hq.r)) capital.starterNaval = true;
      gs.buildings.push(capital);
      gs.buildings.push(createBuilding('ROAD', player, hq.q, hq.r));
      for (const [dq, dr] of NEIGHBORS) {
        const rq = hq.q + dq, rr = hq.r + dr;
        if (!isValid(rq, rr, ms) || !isWalkable(rq, rr)) continue;
        if (gs.buildings.some(b => b.q === rq && b.r === rr && !ROAD_TYPES.has(b.type))) continue;
        if (!gs.buildings.some(b => b.q === rq && b.r === rr && ROAD_TYPES.has(b.type))) {
          gs.buildings.push(createBuilding('ROAD', player, rq, rr));
        }
      }

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

      const spawnRng = this._seededRng(seed + player * 31337);
      if (spawnRng() < 0.42) {
        const oilHex = findNearby(hq.q, hq.r, new Set([3, 6]), 7) || findNearby(hq.q, hq.r, new Set([0, 7]), 8);
        if (oilHex && !(ironHex && oilHex.q === ironHex.q && oilHex.r === ironHex.r)) {
          gs.resourceHexes[`${oilHex.q},${oilHex.r}`] = { type: 'OIL' };
          if (quickStart) gs.buildings.push(createBuilding('OIL_PUMP', player, oilHex.q, oilHex.r));
        }
      }

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

      // Guarantee >=2 tree/woods tiles within radius 7 of each HQ.
      const treeWithin = [];
      for (let dq = -7; dq <= 7; dq++) {
        for (let dr = -7; dr <= 7; dr++) {
          const q2 = hq.q + dq, r2 = hq.r + dr;
          if (!isValid(q2, r2, ms)) continue;
          if (hexDistance(hq.q, hq.r, q2, r2) > 7) continue;
          const t = map[`${q2},${r2}`];
          if (t === 1 || t === 7) treeWithin.push({ q: q2, r: r2 });
        }
      }
      if (treeWithin.length < 2) {
        let needed = 2 - treeWithin.length;
        for (let d = 2; d <= 7 && needed > 0; d++) {
          for (let dq = -d; dq <= d && needed > 0; dq++) {
            for (let dr = -d; dr <= d && needed > 0; dr++) {
              const q2 = hq.q + dq, r2 = hq.r + dr;
              if (!isValid(q2, r2, ms) || hexDistance(hq.q, hq.r, q2, r2) > 7) continue;
              if (!ownSide(q2, r2)) continue;
              const t = map[`${q2},${r2}`];
              if (t === 4 || t === 5 || t === 2) continue; // avoid water/mountain
              if (t === 1 || t === 7) continue;
              map[`${q2},${r2}`] = 7;
              needed--;
            }
          }
        }
      }

      // 2 engineers + starter combat near HQ (global queue deploys elsewhere; opening needs bodies on map)
      const eng1 = findFreeNear(hq.q, hq.r, 3);
      if (eng1) gs.units.push(createUnit('ENGINEER', player, eng1.q, eng1.r));
      const eng2 = findFreeNear(hq.q, hq.r, 3);
      if (eng2) gs.units.push(createUnit('ENGINEER', player, eng2.q, eng2.r));
      for (const starterType of ['INFANTRY', 'INFANTRY', 'RECON']) {
        const hex = findFreeNear(hq.q, hq.r, 4);
        if (hex) gs.units.push(createUnit(starterType, player, hex.q, hex.r));
      }

      // Optional AI-lab helper: start with one supply truck near HQ for early logistics stability.
      if (this._startSupplyTruck) {
        const t = findFreeNear(hq.q, hq.r, 4);
        if (t) gs.units.push(createUnit('SUPPLY_TRUCK', player, t.q, t.r));
      }
    };

    const nearestEnemyHq = (player, hq) => {
      let best = null, bestD = Infinity;
      for (let i = 0; i < spawnPoints.length; i++) {
        const pNum = i + 1;
        if (pNum === player) continue;
        const sp = spawnPoints[i];
        const d = Math.abs(sp.q - hq.q) + Math.abs(sp.r - hq.r);
        if (d < bestD) { bestD = d; best = sp; }
      }
      return best;
    };

    for (let i = 0; i < spawnPoints.length; i++) {
      const player = i + 1;
      const hq = spawnPoints[i];
      placeSpawns(player, hq, nearestEnemyHq(player, hq));
      recalcPlayerPopulation(gs, player);
    }

    if (gs.victoryMode === VICTORY_MODES.POINTS) {
      gs.victoryZones = pickBalancedVictoryZones({
        mapSize: ms,
        spawns: spawnPoints,
        terrain: map,
        isWalkable,
        isValid,
        isLand: (q, r) => {
          const t = map[`${q},${r}`];
          return t !== 4 && t !== 5;
        },
        islandMode,
      });
    }
    this._drawVictoryZones();

    // Scatter extra iron/oil resources across the map
    this._placeResources(seed);
    // Neutral settlements + connective roads create map-scale territorial objectives.
    this._placeNeutralSettlements(seed);
  }

  _placeNeutralSettlements(seed) {
    const gs = this.gameState;
    const ms = this.mapSize;
    const map = this.terrain;
    const rng = this._seededRng(seed + 44117);
    const isLand = (q, r) => {
      const t = map[`${q},${r}`];
      return t !== 4 && t !== 5;
    };
    const free = (q, r) =>
      isLand(q, r) &&
      !gs.buildings.find(b => b.q === q && b.r === r) &&
      !gs.units.find(u => u.q === q && u.r === r);

    const candidates = [];
    for (let q = 2; q < ms - 2; q++) {
      for (let r = 2; r < ms - 2; r++) {
        if (!free(q, r)) continue;
        const t = map[`${q},${r}`];
        if (!(t === 0 || t === 7 || t === 3)) continue;
        // Avoid immediate HQ overlap; prefer interior territory.
        const nearCap = gs.buildings.some(b =>
          isPlayerCapitalBuilding(b) && hexDistance(q, r, b.q, b.r) <= 8);
        if (nearCap) continue;
        candidates.push({ q, r });
      }
    }
    // Shuffle deterministically
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Scale VTC count with map size (large maps were under-spawning due to old density taper).
    const settlementN = Math.max(6, Math.round(ms * 0.15 + 3));
    const cityN = ms >= 120 ? Math.max(1, Math.floor(settlementN / 9))
      : (ms >= 80 ? 1 : 0);
    const townN = ms >= 50 ? Math.max(1, Math.floor(settlementN / 4)) : 0;
    const villageN = Math.max(0, settlementN - cityN - townN);
    const settlementTypes = [
      ...Array(cityN).fill('CITY'),
      ...Array(townN).fill('TOWN'),
      ...Array(villageN).fill('VILLAGE'),
    ];

    const placed = [];
    const minDist = Math.max(7, Math.floor(ms / 11));
    const spawns = gs.buildings.filter(b => isPlayerCapitalBuilding(b))
      .map(b => ({ q: b.q, r: b.r }));
    const mapCx = (ms - 1) / 2;
    const mapCy = (ms - 1) / 2;
    const maxCenterDist = hexDistance(0, 0, mapCx, mapCy) || 1;

    const scoreCandidate = (q, r, zoneCx, zoneCy) => {
      const centerDist = hexDistance(q, r, mapCx, mapCy);
      const interior = ((maxCenterDist - centerDist) / maxCenterDist) * 42;
      const edgeDist = Math.min(q, r, ms - 1 - q, ms - 1 - r);
      const edgeBonus = Math.min(edgeDist, 12) * 1.1;
      const zonePull = zoneCx != null
        ? Math.max(0, 14 - hexDistance(q, r, zoneCx, zoneCy) * 0.55)
        : 0;
      let capClear = 0;
      if (spawns.length) {
        const dists = spawns.map(s => hexDistance(q, r, s.q, s.r));
        const minCap = Math.min(...dists);
        if (minCap < 9) return -999;
        capClear = Math.min(minCap, 40) * 0.45;
      }
      return interior + edgeBonus + zonePull + capClear + rng() * 3;
    };

    const pickBonus = () => {
      const roll = rng();
      if (roll < 0.25) return { wood: 1 };
      if (roll < 0.5) return { iron: 1 };
      if (roll < 0.75) return { oil: 1 };
      return null;
    };

    const tryPlace = (type, q, r) => {
      if (!free(q, r)) return false;
      if (placed.some(p => hexDistance(p.q, p.r, q, r) < minDist)) return false;
      const b = createBuilding(type, 0, q, r);
      const bonus = pickBonus();
      if (bonus) b.settlementBonus = bonus;
      gs.buildings.push(b);
      placed.push({ q, r, type });
      return true;
    };

    // Stratified grid: one VTC target per map sector so settlements spread through the interior.
    const gridN = Math.max(2, Math.ceil(Math.sqrt(settlementN * 1.25)));
    const margin = 3;
    const cellSpan = (ms - 2 * margin) / gridN;
    const zones = [];
    for (let gy = 0; gy < gridN; gy++) {
      for (let gx = 0; gx < gridN; gx++) {
        zones.push({
          gx, gy,
          zq: margin + (gx + 0.5) * cellSpan,
          zr: margin + (gy + 0.5) * cellSpan,
          mapCenterDist: hexDistance(
            margin + (gx + 0.5) * cellSpan,
            margin + (gy + 0.5) * cellSpan,
            mapCx, mapCy,
          ),
        });
      }
    }
    zones.sort((a, b) => a.mapCenterDist - b.mapCenterDist);

    for (let zi = 0; zi < zones.length && placed.length < settlementN; zi++) {
      const zone = zones[zi];
      const type = settlementTypes[Math.min(zi, settlementTypes.length - 1)] || 'VILLAGE';
      const qLo = margin + zone.gx * cellSpan;
      const qHi = margin + (zone.gx + 1) * cellSpan;
      const rLo = margin + zone.gy * cellSpan;
      const rHi = margin + (zone.gy + 1) * cellSpan;
      const inZone = candidates.filter(c => c.q >= qLo && c.q < qHi && c.r >= rLo && c.r < rHi);
      const pool = inZone.length ? inZone : candidates;
      pool.sort((a, b) =>
        scoreCandidate(b.q, b.r, zone.zq, zone.zr) - scoreCandidate(a.q, a.r, zone.zq, zone.zr));
      for (const c of pool) {
        if (tryPlace(type, c.q, c.r)) break;
      }
    }

    // Global fill if sectors could not satisfy quota (tight terrain / high minDist).
    if (placed.length < settlementN) {
      const ranked = [...candidates].sort((a, b) =>
        scoreCandidate(b.q, b.r, null, null) - scoreCandidate(a.q, a.r, null, null));
      for (const c of ranked) {
        if (placed.length >= settlementN) break;
        const type = settlementTypes[placed.length] || 'VILLAGE';
        tryPlace(type, c.q, c.r);
      }
    }

    // Last resort: relax spacing slightly.
    if (placed.length < settlementN) {
      const relaxDist = Math.max(5, minDist - 3);
      const ranked = [...candidates].sort((a, b) =>
        scoreCandidate(b.q, b.r, null, null) - scoreCandidate(a.q, a.r, null, null));
      for (const c of ranked) {
        if (placed.length >= settlementN) break;
        if (!free(c.q, c.r)) continue;
        if (placed.some(p => hexDistance(p.q, p.r, c.q, c.r) < relaxDist)) continue;
        const type = settlementTypes[placed.length] || 'VILLAGE';
        tryPlace(type, c.q, c.r);
      }
    }

    // Connected neutral road grid: every settlement sits on a road; MST links the network.
    const roadType = (q, r) => (map[`${q},${r}`] === 2 ? null : 'ROAD');
    const addRoad = (q, r) => {
      if (!isLand(q, r)) return;
      const rt = roadType(q, r);
      if (!rt) return;
      if (gs.buildings.some(b => b.q === q && b.r === r && ROAD_TYPES.has(b.type))) return;
      gs.buildings.push(createBuilding(rt, 0, q, r));
    };
    const maxRoadSteps = Math.min(48, Math.max(24, Math.floor(ms / 5)));
    const routeRoad = (from, to, maxSteps = maxRoadSteps) => {
      const path = findRoadPath(map, ms, from.q, from.r, to.q, to.r);
      if (path?.length) {
        for (const h of path.slice(0, maxSteps)) addRoad(h.q, h.r);
        return;
      }
      // Fallback: greedy detour that never steps onto mountains.
      let cq = from.q, cr = from.r;
      let steps = 0;
      const stepCost = (q, r) => {
        const t = map[`${q},${r}`];
        if (t === 2) return 99;
        if (t === 3) return 2;
        if (t === 1) return 3;
        return 0;
      };
      while ((cq !== to.q || cr !== to.r) && steps < maxSteps) {
        steps++;
        const opts = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
          .map(([dq, dr]) => ({ q: cq + dq, r: cr + dr }))
          .filter(h => h.q >= 0 && h.r >= 0 && h.q < ms && h.r < ms && isLand(h.q, h.r) && map[`${h.q},${h.r}`] !== 2)
          .sort((u, v) => {
            const du = hexDistance(u.q, u.r, to.q, to.r);
            const dv = hexDistance(v.q, v.r, to.q, to.r);
            if (du !== dv) return du - dv;
            return stepCost(u.q, u.r) - stepCost(v.q, v.r);
          });
        if (!opts.length) break;
        cq = opts[0].q;
        cr = opts[0].r;
        addRoad(cq, cr);
      }
    };

    for (const s of placed) addRoad(s.q, s.r);

    const roadNodes = [
      ...placed.map(s => ({ q: s.q, r: s.r })),
      ...spawns.map(s => ({ q: s.q, r: s.r })),
    ];
    if (roadNodes.length >= 2) {
      const parent = roadNodes.map((_, i) => i);
      const find = (i) => {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]];
          i = parent[i];
        }
        return i;
      };
      const unite = (a, b) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[rb] = ra;
      };
      const edges = [];
      for (let i = 0; i < roadNodes.length; i++) {
        for (let j = i + 1; j < roadNodes.length; j++) {
          edges.push({
            i, j,
            d: hexDistance(roadNodes[i].q, roadNodes[i].r, roadNodes[j].q, roadNodes[j].r),
          });
        }
      }
      edges.sort((a, b) => a.d - b.d);
      for (const { i, j } of edges) {
        if (find(i) === find(j)) continue;
        unite(i, j);
        routeRoad(roadNodes[i], roadNodes[j]);
      }
    }

    // Highway spurs from the neutral grid toward each capital (stops one hex out).
    let highwaySpurs = 0;
    const maxHighwaySpurs = Math.min(spawns.length, ms >= 100 ? 3 : 2);
    for (const cap of spawns) {
      if (highwaySpurs >= maxHighwaySpurs) break;
      if (!placed.length) continue;
      const hub = placed
        .slice()
        .sort((a, b) => hexDistance(a.q, a.r, cap.q, cap.r) - hexDistance(b.q, b.r, cap.q, cap.r))[0];
      if (!hub || hexDistance(hub.q, hub.r, cap.q, cap.r) <= 4) continue;
      const stop = { q: cap.q, r: cap.r };
      for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        const nq = cap.q + dq, nr = cap.r + dr;
        if (nq < 0 || nr < 0 || nq >= ms || nr >= ms || !isLand(nq, nr)) continue;
        if (hexDistance(nq, nr, hub.q, hub.r) < hexDistance(stop.q, stop.r, hub.q, hub.r)) {
          stop.q = nq;
          stop.r = nr;
        }
      }
      routeRoad(hub, stop, maxRoadSteps);
      highwaySpurs += 1;
    }
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
    const landScale = Math.min(2.4, Math.max(0.45, Math.sqrt(landTiles / 2200)));
    const MIN_IRON = Math.max(12, Math.round(8 + landScale * 6));
    // Oil stays scarce even on 120×120 maps (was scaling to 30+ deposits).
    const MIN_OIL  = Math.max(4,  Math.round(3 + landScale * 2.2));

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
        if (IRON_PREFER.has(t) && rng() < 0.18) {
          gs.resourceHexes[`${q},${r}`] = { type: 'IRON' };
        } else if (OIL_TERRAIN.has(t) && rng() < 0.010) {
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

    // Contested oil: deposits near map center, balanced between all HQs.
    const hqs = gs.buildings.filter(b => isPlayerCapitalBuilding(b));
    if (hqs.length >= 2) {
      const contested = [];
      const midQ = hqs.reduce((s, b) => s + b.q, 0) / hqs.length;
      const midR = hqs.reduce((s, b) => s + b.r, 0) / hqs.length;
      for (let q = 0; q < ms; q++) {
        for (let r = 0; r < ms; r++) {
          if (!free(q, r)) continue;
          const t = map[`${q},${r}`];
          if (!isLandType(t) || !OIL_TERRAIN.has(t)) continue;
          const dists = hqs.map(h => hexDistance(q, r, h.q, h.r));
          const balance = Math.max(...dists) - Math.min(...dists);
          const midness = hexDistance(q, r, midQ, midR);
          if (balance <= 12 && midness <= ms * 0.42) contested.push({ key: `${q},${r}`, score: balance * 2 + midness });
        }
      }
      contested.sort((a, b) => a.score - b.score);
      const want = Math.min(6, Math.max(2, Math.round(MIN_OIL * 0.35)));
      let placed = 0;
      for (const c of contested) {
        if (placed >= want) break;
        if (!gs.resourceHexes[c.key]) {
          gs.resourceHexes[c.key] = { type: 'OIL' };
          placed++;
        }
      }
    }

    // Side-fairness guarantee for iron (prevents one-side starvation).
    if (hqs.length >= 2) {
      const sideOf = (q, r) => {
        let best = hqs[0].owner, bestD = Infinity;
        for (const h of hqs) {
          const d = hexDistance(q, r, h.q, h.r);
          if (d < bestD) { bestD = d; best = Number(h.owner); }
        }
        return best;
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

      const minPerSideIron = Math.max(4, Math.round(MIN_IRON * 0.28));
      for (const h of hqs) {
        const side = Number(h.owner);
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


  _genTwoContinentsTerrain(map, ms, seed) {
    // Fill everything with ocean to start
    for (let q = 0; q < ms; q++)
      for (let r = 0; r < ms; r++) map[`${q},${r}`] = 5; // deep ocean

    const rng = this._seededRng(seed + 77777);
    const rand = () => { const x = rng(); return x; };

    // Helper: hex distance
    const hexDist = (q1, r1, q2, r2) => (Math.abs(q1-q2) + Math.abs(r1-r2) + Math.abs((q1-q2)+(r1-r2))) / 2;

    // Paint terrain on a hex with noise-based variety
    const paintLand = (q, r, distFromEdge) => {
      if (!isValid(q, r, ms)) return;
      const existing = map[`${q},${r}`];
      if (existing === 5 || existing === 4) { // only paint over water
        if (distFromEdge <= 0) { map[`${q},${r}`] = 4; return; } // shallow coast
        const n = rand();
        if (distFromEdge <= 1) map[`${q},${r}`] = n < 0.6 ? 0 : 7;        // coast: plains/woods
        else if (distFromEdge <= 3) map[`${q},${r}`] = n < 0.4 ? 0 : (n < 0.65 ? 7 : (n < 0.78 ? 1 : 3));
        else if (distFromEdge <= 6) map[`${q},${r}`] = n < 0.3 ? 0 : (n < 0.55 ? 7 : (n < 0.75 ? 1 : (n < 0.88 ? 3 : 2)));
        else map[`${q},${r}`] = n < 0.25 ? 0 : (n < 0.5 ? 7 : (n < 0.7 ? 1 : (n < 0.85 ? 3 : 2)));
      }
    };

    // Paint a continent blob centered at (cq, cr) with given radius
    // Use irregular shape by wobbling radius with noise
    const paintContinent = (cq, cr, radius) => {
      const shell = radius + 2;
      for (let dq = -shell; dq <= shell; dq++) {
        for (let dr = -shell; dr <= shell; dr++) {
          const nq = cq+dq, nr = cr+dr;
          if (!isValid(nq, nr, ms)) continue;
          const d = hexDist(nq, nr, cq, cr);
          // Wobble radius with noise for organic shape
          const wobble = (rand() - 0.5) * 4;
          const effectiveR = radius + wobble;
          if (d <= effectiveR + 1) {
            const fromEdge = Math.round(effectiveR - d);
            paintLand(nq, nr, fromEdge);
          }
        }
      }
    };

    // Two main continents: left (P1) and right (P2)
    // Map is ms×ms. Continents are ~35% of width each, ocean channel ~30% in middle.
    // Continent centers: left at q≈22%, right at q≈78%, both vertically centered
    const cRadius = Math.floor(ms * 0.28); // continent radius ≈ 28% of map size
    const leftCQ  = Math.floor(ms * 0.22);
    const rightCQ = Math.floor(ms * 0.78);
    const midR    = Math.floor(ms * 0.55); // slightly south of center for visual interest

    paintContinent(leftCQ,  midR, cRadius);
    paintContinent(rightCQ, midR, cRadius);

    // Add a secondary lobe to each continent for irregular shape
    paintContinent(leftCQ  + Math.floor(ms*0.06), midR - Math.floor(ms*0.15), Math.floor(cRadius * 0.65));
    paintContinent(rightCQ - Math.floor(ms*0.06), midR + Math.floor(ms*0.12), Math.floor(cRadius * 0.60));

    // Land bridge at the TOP connecting the two continents
    // Narrow isthmus: 5-8 hex wide, at r≈5-15% of map height
    const bridgeR   = Math.floor(ms * 0.06); // r row for bridge center
    const bridgeCQ  = Math.floor(ms * 0.5);  // center column
    const bridgeW   = Math.floor(ms * 0.10); // half-width of bridge in q
    for (let bq = bridgeCQ - bridgeW; bq <= bridgeCQ + bridgeW; bq++) {
      for (let br = 0; br <= Math.floor(ms * 0.14); br++) {
        if (!isValid(bq, br, ms)) continue;
        const distFromCenter = Math.abs(bq - bridgeCQ);
        const distFromEdge   = bridgeW - distFromCenter;
        paintLand(bq, br, Math.max(0, distFromEdge - 1));
      }
    }

    // Connect bridge to left continent with a coastal arm going down-left
    const armSteps = Math.floor(ms * 0.12);
    for (let i = 0; i < armSteps; i++) {
      const aq = bridgeCQ - bridgeW - i;
      const ar = Math.floor(ms * 0.08) + Math.floor(i * 0.7);
      if (!isValid(aq, ar, ms)) break;
      for (let dq = -2; dq <= 2; dq++) {
        for (let dr = -2; dr <= 2; dr++) {
          if (!isValid(aq+dq, ar+dr, ms)) continue;
          paintLand(aq+dq, ar+dr, 2 - Math.max(Math.abs(dq),Math.abs(dr)));
        }
      }
    }

    // Connect bridge to right continent with a coastal arm going down-right
    for (let i = 0; i < armSteps; i++) {
      const aq = bridgeCQ + bridgeW + i;
      const ar = Math.floor(ms * 0.08) + Math.floor(i * 0.7);
      if (!isValid(aq, ar, ms)) break;
      for (let dq = -2; dq <= 2; dq++) {
        for (let dr = -2; dr <= 2; dr++) {
          if (!isValid(aq+dq, ar+dr, ms)) continue;
          paintLand(aq+dq, ar+dr, 2 - Math.max(Math.abs(dq),Math.abs(dr)));
        }
      }
    }

    // Add shallow coastal water ring around all land
    const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    const snapshot = { ...map };
    for (let q = 0; q < ms; q++) {
      for (let r = 0; r < ms; r++) {
        if (snapshot[`${q},${r}`] === 5) {
          // If adjacent to land, make shallow
          const adjLand = dirs.some(([dq,dr]) => {
            const t = snapshot[`${q+dq},${r+dr}`];
            return t !== undefined && t !== 5 && t !== 4;
          });
          if (adjLand) map[`${q},${r}`] = 4;
        }
      }
    }

    // Scatter some small neutral islands in the ocean channel
    const channelCQ = Math.floor(ms * 0.5);
    const islandPositions = [
      { q: channelCQ, r: Math.floor(ms * 0.35) },
      { q: channelCQ - Math.floor(ms*0.06), r: Math.floor(ms * 0.55) },
      { q: channelCQ + Math.floor(ms*0.05), r: Math.floor(ms * 0.70) },
    ];
    for (const pos of islandPositions) {
      const iRad = 3 + Math.floor(rand() * 4);
      paintContinent(pos.q, pos.r, iRad);
    }

    // Resource placement is handled by _placeResources(), terrain is done.
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
