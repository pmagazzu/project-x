import Phaser from 'phaser';
import { GAME_VERSION } from './GameScene.js';
import { MAP_SIZE_SKIRMISH, MAP_SIZE_ENDLESS, MAP_SIZE_BUILDER } from './MapSizePresets.js';
import { VICTORY_MODES } from './GameConfig.js';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6].map((n) => ({
  label: `${n} players`,
  count: n,
  sub: n === 2 ? 'duel' : `${n}-way FFA`,
}));

const VICTORY_MODE_OPTIONS = [
  { key: VICTORY_MODES.VTC_CONTROL, label: 'VTC Control', sub: 'all settlements 5 turns' },
  { key: VICTORY_MODES.ELIMINATION, label: 'Elimination', sub: 'destroy all HQs' },
  { key: VICTORY_MODES.POINTS, label: 'Victory Points', sub: 'hold zones on map' },
];

const VP_TARGET_OPTIONS = [
  { label: '50 VP', target: 50 },
  { label: '75 VP', target: 75 },
  { label: '100 VP', target: 100 },
  { label: '150 VP', target: 150 },
];

const PLAYER_LABELS_SHORT = { 1: 'Blue', 2: 'Red', 3: 'Green', 4: 'Gold', 5: 'Purple', 6: 'Orange' };

export const LAND_PROFILES = [
  { key: 'islands', label: 'Islands' },
  { key: 'large_islands', label: 'Large Islands' },
  { key: 'continent', label: 'Continent' },
  { key: 'two_continents', label: 'Two Continents' },
  { key: 'archipelago', label: 'Archipelago' },
  { key: 'naval_supremacy', label: 'Naval Supremacy' },
  { key: 'landlocked', label: 'Landlocked' },
];

const GAP_OPTIONS = [
  { label: 'Close', gap: 6, sub: '6 hex' },
  { label: 'Tight', gap: 8, sub: '8 hex' },
  { label: 'Standard', gap: 10, sub: '10 hex' },
  { label: 'Wide', gap: 12, sub: '12 hex' },
  { label: 'Far', gap: 15, sub: '15 hex' },
];

const MODE_META = {
  skirmish: {
    title: 'SKIRMISH',
    icon: '⚔',
    accent: 0xb8922a,
    accentHi: 0xf0d060,
    panel: 0x1a1430,
  },
  map_builder: {
    title: 'MAP BUILDER',
    icon: '🛠',
    accent: 0x6fcf97,
    accentHi: 0xa8ffcc,
    panel: 0x122018,
  },
  endless: {
    title: 'AI VS AI · ENDLESS',
    icon: '∞',
    accent: 0x5ecfc4,
    accentHi: 0x9ffff0,
    panel: 0x142828,
  },
  combat_test: {
    title: 'COMBAT TEST',
    icon: '🎯',
    accent: 0xe8a050,
    accentHi: 0xffcc88,
    panel: 0x281c10,
  },
};

function defaultConfig(mode, aiP2Default = true) {
  const base = {
    mapSize: 50,
    procLandProfile: 'continent',
    procQuickStart: true,
    debugNoFog: false,
    supplyEnabled: true,
    combatLineGap: 10,
    aiP1: false,
    aiP2: false,
    opponentAiEnabled: false,
    aiStrategy: 'balanced',
    aiViewerMode: false,
    startSupplyTruck: false,
    mapBuilder: false,
    playerCount: 2,
    humanPlayer: 1,
    victoryMode: VICTORY_MODES.VTC_CONTROL,
    victoryPointTarget: 100,
  };
  if (mode === 'skirmish') {
    return {
      ...base, mapSize: 50, procLandProfile: 'continent', debugNoFog: false, supplyEnabled: true,
      aiP1: false, aiP2: aiP2Default,
      opponentAiEnabled: aiP2Default,
    };
  }
  if (mode === 'endless') {
    return {
      ...base, mapSize: 50, procLandProfile: 'islands', debugNoFog: true, supplyEnabled: true,
      procQuickStart: true, aiP1: true, aiP2: true, aiViewerMode: true, startSupplyTruck: true,
    };
  }
  if (mode === 'combat_test') {
    return {
      ...base, combatLineGap: 10, debugNoFog: true, supplyEnabled: false, procQuickStart: false,
    };
  }
  if (mode === 'map_builder') {
    return { ...base, mapSize: 50, debugNoFog: true, supplyEnabled: true, mapBuilder: true, procQuickStart: false };
  }
  return base;
}

export class SetupScene extends Phaser.Scene {
  constructor() { super('SetupScene'); }

  init(data) {
    this.mode = data?.mode || 'skirmish';
    this.cfg = defaultConfig(this.mode, data?.aiP2Default !== false);
    const sizeOptions = this.mode === 'endless' ? MAP_SIZE_ENDLESS
      : (this.mode === 'map_builder' ? MAP_SIZE_BUILDER : (this.mode === 'combat_test' ? [] : MAP_SIZE_SKIRMISH));
    const idxBySize = sizeOptions.findIndex(s => s.size === this.cfg.mapSize);
    this._sizeIdx = idxBySize >= 0 ? idxBySize : Math.min(1, Math.max(0, sizeOptions.length - 1));
    this._landIdx = LAND_PROFILES.findIndex(p => p.key === this.cfg.procLandProfile) || 0;
    this._gapIdx = GAP_OPTIONS.findIndex(g => g.gap === this.cfg.combatLineGap) || 2;
    this._playerCountIdx = PLAYER_COUNT_OPTIONS.findIndex(o => o.count === this.cfg.playerCount) || 0;
    this._victoryModeIdx = VICTORY_MODE_OPTIONS.findIndex(o => o.key === this.cfg.victoryMode) || 0;
    this._vpTargetIdx = VP_TARGET_OPTIONS.findIndex(o => o.target === this.cfg.victoryPointTarget) || 2;
    this._humanIdx = 0;
    if (this.mode === 'endless' && idxBySize < 0) this._sizeIdx = 1;
  }

  create() {
    const w = this.scale.width, h = this.scale.height;
    const meta = MODE_META[this.mode] || MODE_META.skirmish;
    this._meta = meta;
    this._objs = [];

    this._drawBg(w, h);
    this.add.rectangle(w / 2, 2, w, 4, meta.accent, 0.85);

    const panelW = Math.min(620, w - 48);
    const panelH = Math.min(this.mode === 'skirmish' || this.mode === 'endless' ? 620 : 560, h - 88);
    const px = w / 2, py = h / 2 + 8;

    const panel = this.add.rectangle(px, py, panelW, panelH, meta.panel, 0.98)
      .setStrokeStyle(3, meta.accent);
    this._objs.push(panel);
    this.add.rectangle(px, py - panelH / 2 + 2, panelW, 5, meta.accentHi, 1);

    this._titleTxt = this.add.text(px, py - panelH / 2 + 36, `${meta.icon}  ${meta.title}`, {
      font: 'bold 22px monospace', fill: '#f0e8d0',
    }).setOrigin(0.5);
    this._objs.push(this._titleTxt);

    this._summaryTxt = this.add.text(px, py - panelH / 2 + 62, '', {
      font: '11px monospace', fill: '#8899aa', align: 'center', wordWrap: { width: panelW - 40 },
    }).setOrigin(0.5);
    this._objs.push(this._summaryTxt);

    const rowLeft = px - panelW / 2 + 28;
    const rowW = panelW - 56;
    let y = py - panelH / 2 + 96;
    const rowGap = 52;

    const sizes = this.mode === 'endless' ? MAP_SIZE_ENDLESS
      : (this.mode === 'map_builder' ? MAP_SIZE_BUILDER : (this.mode === 'combat_test' ? null : MAP_SIZE_SKIRMISH));

    if (sizes) {
      this._addCycleRow(rowLeft, y, rowW, 'Map size', sizes, () => this._sizeIdx, (i) => {
        this._sizeIdx = i;
        this.cfg.mapSize = sizes[i].size;
        this._refreshSummary();
      });
      y += rowGap;
    }

    if (this.mode === 'combat_test') {
      this._addCycleRow(rowLeft, y, rowW, 'Line spacing', GAP_OPTIONS, () => this._gapIdx, (i) => {
        this._gapIdx = i;
        this.cfg.combatLineGap = GAP_OPTIONS[i].gap;
        this._refreshSummary();
      });
      y += rowGap;
    } else if (this.mode !== 'map_builder') {
      this._addCycleRow(rowLeft, y, rowW, 'Land profile', LAND_PROFILES, () => this._landIdx, (i) => {
        this._landIdx = i;
        this.cfg.procLandProfile = LAND_PROFILES[i].key;
        this._refreshSummary();
      });
      y += rowGap;
    }

    if (this.mode === 'skirmish' || this.mode === 'endless') {
      this._addToggle(rowLeft, y, rowW, 'Quick start economy', () => this.cfg.procQuickStart, (v) => {
        this.cfg.procQuickStart = v;
        this._refreshSummary();
      });
      y += rowGap;
    }

    this._addToggle(rowLeft, y, rowW, 'Fog of war', () => !this.cfg.debugNoFog, (v) => {
      this.cfg.debugNoFog = !v;
      this._refreshSummary();
    });
    y += rowGap;

    this._addToggle(rowLeft, y, rowW, 'Supply system', () => this.cfg.supplyEnabled, (v) => {
      this.cfg.supplyEnabled = v;
      this._refreshSummary();
    });
    y += rowGap;

    if (this.mode === 'skirmish' || this.mode === 'endless') {
      this._addCycleRow(rowLeft, y, rowW, 'Players', PLAYER_COUNT_OPTIONS, () => this._playerCountIdx, (i) => {
        this._playerCountIdx = i;
        this.cfg.playerCount = PLAYER_COUNT_OPTIONS[i].count;
        if (this._humanIdx >= this.cfg.playerCount) this._humanIdx = 0;
        this.cfg.humanPlayer = this._humanIdx + 1;
        this._refreshSummary();
      });
      y += rowGap;
    }

    if (this.mode === 'skirmish') {
      this._addCycleRow(rowLeft, y, rowW, 'Your team', () => Array.from({ length: this.cfg.playerCount }, (_, i) => ({
        label: `You are P${i + 1}`,
        player: i + 1,
        sub: PLAYER_LABELS_SHORT[i + 1] || `P${i + 1}`,
      })), () => this._humanIdx, (i) => {
        this._humanIdx = i;
        this.cfg.humanPlayer = i + 1;
        this._refreshOpponentAiToggleLabel?.();
        this._refreshOpponentAiToggle?.();
        this._refreshSummary();
      });
      y += rowGap;

      this._opponentAiLabel = this.add.text(rowLeft, y - 12, '', { font: '11px monospace', fill: '#99aa88' });
      this._objs.push(this._opponentAiLabel);
      this._addOpponentAiToggle(rowLeft, y, rowW);
      y += rowGap;

      this._addCycleRow(rowLeft, y, rowW, 'Win condition', VICTORY_MODE_OPTIONS, () => this._victoryModeIdx, (i) => {
        this._victoryModeIdx = i;
        this.cfg.victoryMode = VICTORY_MODE_OPTIONS[i].key;
        this._refreshSummary();
      });
      y += rowGap;

      if (this.cfg.victoryMode === VICTORY_MODES.POINTS) {
        this._vpTargetRow = this._addCycleRow(rowLeft, y, rowW, 'VP target', VP_TARGET_OPTIONS, () => this._vpTargetIdx, (i) => {
          this._vpTargetIdx = i;
          this.cfg.victoryPointTarget = VP_TARGET_OPTIONS[i].target;
          this._refreshSummary();
        });
        y += rowGap;
      }
    }

    if (this.mode === 'endless') {
      this._addCycleRow(rowLeft, y, rowW, 'Win condition', VICTORY_MODE_OPTIONS, () => this._victoryModeIdx, (i) => {
        this._victoryModeIdx = i;
        this.cfg.victoryMode = VICTORY_MODE_OPTIONS[i].key;
        this._refreshSummary();
      });
      y += rowGap;
      if (this.cfg.victoryMode === VICTORY_MODES.POINTS) {
        this._addCycleRow(rowLeft, y, rowW, 'VP target', VP_TARGET_OPTIONS, () => this._vpTargetIdx, (i) => {
          this._vpTargetIdx = i;
          this.cfg.victoryPointTarget = VP_TARGET_OPTIONS[i].target;
          this._refreshSummary();
        });
        y += rowGap;
      }
      this._addToggle(rowLeft, y, rowW, 'Start supply trucks', () => this.cfg.startSupplyTruck, (v) => {
        this.cfg.startSupplyTruck = v;
        this._refreshSummary();
      });
      y += rowGap;
    }

    const launchY = py + panelH / 2 - 44;
    const launch = this.add.text(px, launchY, '▶  LAUNCH', {
      font: 'bold 20px monospace', fill: '#1a1208',
      backgroundColor: `#${meta.accentHi.toString(16).padStart(6, '0')}`, padding: { x: 36, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this._objs.push(launch);

    launch.on('pointerover', () => {
      launch.setScale(1.04);
      this.tweens.add({ targets: panel, alpha: 1, duration: 80 });
    });
    launch.on('pointerout', () => launch.setScale(1));
    launch.on('pointerdown', () => {
      this.tweens.add({
        targets: launch, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true,
        onComplete: () => this._launch(),
      });
      this._burst(px, launchY, meta.accentHi);
    });

    const back = this.add.text(px - panelW / 2 + 20, py - panelH / 2 + 18, '← Menu', {
      font: 'bold 12px monospace', fill: '#778899', backgroundColor: '#0a0c10', padding: { x: 10, y: 6 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('MenuScene'));
    this._objs.push(back);

    this.add.text(px, py + panelH / 2 + 28, GAME_VERSION, {
      font: 'bold 14px monospace', fill: '#556655',
    }).setOrigin(0.5);

    this._refreshSummary();
  }

  _addCycleRow(x, y, w, label, options, getIdx, onPick) {
    this.add.text(x, y - 14, label, { font: 'bold 11px monospace', fill: '#99aa88' }).setOrigin(0, 0.5);

    const card = this.add.rectangle(x + w / 2, y + 10, w, 40, 0x0e1210, 1)
      .setStrokeStyle(1, 0x334433);
    this._objs.push(card);

    const left = this.add.text(x + 18, y + 10, '◀', {
      font: 'bold 16px monospace', fill: '#aabb99', backgroundColor: '#1a2218', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const right = this.add.text(x + w - 18, y + 10, '▶', {
      font: 'bold 16px monospace', fill: '#aabb99', backgroundColor: '#1a2218', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const nameTxt = this.add.text(x + w / 2, y + 4, '', { font: 'bold 15px monospace', fill: '#f0e898' }).setOrigin(0.5);
    const subTxt = this.add.text(x + w / 2, y + 18, '', { font: '10px monospace', fill: '#667766' }).setOrigin(0.5);

    const getOptions = () => (typeof options === 'function' ? options() : options);

    const refresh = () => {
      const opts = getOptions();
      if (!opts.length) return;
      const i = Math.min(getIdx(), opts.length - 1);
      const o = opts[i];
      nameTxt.setText(o.label);
      subTxt.setText(o.sub || o.key || '');
    };
    refresh();

    const pick = (delta) => {
      const opts = getOptions();
      if (!opts.length) return;
      const n = (Math.min(getIdx(), opts.length - 1) + delta + opts.length) % opts.length;
      onPick(n);
      refresh();
      this.tweens.add({ targets: [nameTxt], scaleX: 1.08, scaleY: 1.08, duration: 70, yoyo: true });
      card.setFillStyle(0x1a2820, 1);
      this.time.delayedCall(120, () => card.setFillStyle(0x0e1210, 1));
    };
    left.on('pointerdown', () => pick(-1));
    right.on('pointerdown', () => pick(1));
    card.on('pointerdown', () => pick(1));

    this._objs.push(left, right, nameTxt, subTxt);
  }

  _addToggle(x, y, w, label, getVal, setVal) {
    this.add.text(x, y - 12, label, { font: '11px monospace', fill: '#99aa88' }).setOrigin(0, 0.5);

    const pillW = 108, pillH = 34;
    const pillX = x + w - pillW / 2;
    const pill = this.add.rectangle(pillX, y + 8, pillW, pillH, 0x1a2218, 1)
      .setStrokeStyle(2, 0x334433).setInteractive({ useHandCursor: true });
    const txt = this.add.text(pillX, y + 8, '', { font: 'bold 13px monospace', fill: '#ffffff' }).setOrigin(0.5);

    const paint = () => {
      const on = getVal();
      pill.setFillStyle(on ? 0x2a5533 : 0x3a2020, 1);
      pill.setStrokeStyle(2, on ? 0x88ee66 : 0xaa5544);
      txt.setText(on ? 'ON' : 'OFF');
      txt.setColor(on ? '#ccffaa' : '#ffaa99');
    };
    paint();

    pill.on('pointerdown', () => {
      setVal(!getVal());
      paint();
      this.tweens.add({ targets: pill, scaleX: 1.12, scaleY: 1.12, duration: 80, yoyo: true });
      this._refreshSummary();
    });

    this._objs.push(pill, txt);
  }

  _refreshSummary() {
    const parts = [];
    if (this.mode === 'combat_test') {
      const ms = Math.max(28, this.cfg.combatLineGap + 26);
      parts.push(`${ms}×${ms} arena`, `${this.cfg.combatLineGap} hex gap`);
    } else {
      parts.push(`${this.cfg.mapSize}×${this.cfg.mapSize}`);
      if (this.mode !== 'map_builder') parts.push(LAND_PROFILES[this._landIdx]?.label || '');
    }
    parts.push(this.cfg.supplyEnabled ? 'Supply ON' : 'Supply OFF');
    parts.push(this.cfg.debugNoFog ? 'Fog OFF' : 'Fog ON');
    if (this.mode === 'skirmish' || this.mode === 'endless') {
      parts.push(`${this.cfg.playerCount}P`);
      if (this.cfg.victoryMode === VICTORY_MODES.POINTS) {
        parts.push(`VP ${this.cfg.victoryPointTarget}`);
      } else {
        parts.push('Elimination');
      }
    }
    if (this.mode === 'skirmish') {
      const opponents = [];
      for (let p = 1; p <= this.cfg.playerCount; p++) {
        if (p === this.cfg.humanPlayer) continue;
        opponents.push(p);
      }
      const aiList = opponents.filter(p => this._isOpponentAiEnabled(p));
      const humanList = opponents.filter(p => !this._isOpponentAiEnabled(p));
      parts.push(`You: P${this.cfg.humanPlayer}`);
      if (aiList.length) parts.push(`AI: P${aiList.join(', P')}`);
      if (humanList.length) parts.push(`Human: P${humanList.join(', P')}`);
    }
    if (this.mode === 'endless') parts.push(`${this.cfg.playerCount}-AI spectator`);
    this._summaryTxt.setText(parts.join('  ·  '));
  }

  _isOpponentAiEnabled(player) {
    if (player !== this._primaryOpponentPlayer()) return false;
    if (this.mode === 'skirmish') return !!this.cfg.opponentAiEnabled;
    if (player === 1) return !!this.cfg.aiP1;
    if (player === 2) return !!this.cfg.aiP2;
    return false;
  }

  _primaryOpponentPlayer() {
    const c = this.cfg;
    for (let p = 1; p <= c.playerCount; p++) {
      if (p !== c.humanPlayer) return p;
    }
    return c.humanPlayer === 1 ? 2 : 1;
  }

  _refreshOpponentAiToggleLabel() {
    const opp = this._primaryOpponentPlayer();
    this._opponentAiLabel?.setText(`Player ${opp}: AI opponent`);
  }

  _addOpponentAiToggle(x, y, w) {
    const pillW = 108, pillH = 34;
    const pillX = x + w - pillW / 2;
    const pill = this.add.rectangle(pillX, y + 8, pillW, pillH, 0x1a2218, 1)
      .setStrokeStyle(2, 0x334433).setInteractive({ useHandCursor: true });
    const txt = this.add.text(pillX, y + 8, '', { font: 'bold 13px monospace', fill: '#ffffff' }).setOrigin(0.5);

    const paint = () => {
      const on = this._isOpponentAiEnabled(this._primaryOpponentPlayer());
      pill.setFillStyle(on ? 0x2a5533 : 0x3a2020, 1);
      pill.setStrokeStyle(2, on ? 0x88ee66 : 0xaa5544);
      txt.setText(on ? 'ON' : 'OFF');
      txt.setColor(on ? '#ccffaa' : '#ffaa99');
    };
    this._refreshOpponentAiToggle = paint;
    paint();

    pill.on('pointerdown', () => {
      const opp = this._primaryOpponentPlayer();
      if (this.mode === 'skirmish') {
        this.cfg.opponentAiEnabled = !this.cfg.opponentAiEnabled;
      } else if (opp === 1) {
        this.cfg.aiP1 = !this.cfg.aiP1;
      } else if (opp === 2) {
        this.cfg.aiP2 = !this.cfg.aiP2;
      }
      paint();
      this.tweens.add({ targets: pill, scaleX: 1.12, scaleY: 1.12, duration: 80, yoyo: true });
      this._refreshSummary();
    });

    this._objs.push(pill, txt);
    this._refreshOpponentAiToggleLabel();
  }

  _buildAiPlayers() {
    const c = this.cfg;
    const aiPlayers = [];
    if (this.mode === 'endless') {
      for (let p = 1; p <= c.playerCount; p++) aiPlayers.push(p);
      return aiPlayers;
    }
    if (this.mode === 'skirmish') {
      for (let p = 1; p <= c.playerCount; p++) {
        if (p === c.humanPlayer) continue;
        if (this._isOpponentAiEnabled(p)) aiPlayers.push(p);
      }
      return aiPlayers;
    }
    if (c.aiP1) aiPlayers.push(1);
    if (c.aiP2) aiPlayers.push(2);
    return aiPlayers;
  }

  _sharedLaunchData() {
    const c = this.cfg;
    return {
      playerCount: c.playerCount,
      humanPlayer: c.humanPlayer,
      victoryMode: c.victoryMode,
      victoryPointTarget: c.victoryPointTarget,
      aiPlayers: this._buildAiPlayers(),
      ...(this.mode === 'skirmish' ? { opponentAiEnabled: !!c.opponentAiEnabled } : {}),
      ...(this.mode === 'endless' ? { aiViewerMode: true, spectatorMode: true } : {}),
      aiP1: !!c.aiP1,
      aiP2: !!c.aiP2,
    };
  }

  _burst(x, y, color) {
    const g = this.add.graphics();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = 20 + Math.random() * 28;
      g.lineStyle(2, color, 0.9);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.strokePath();
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 400, onComplete: () => g.destroy() });
  }

  _launch() {
    const c = this.cfg;
    if (this.mode === 'combat_test') {
      const mapSize = Math.max(28, c.combatLineGap + 26);
      this.scene.start('GameScene', {
        scenario: 'combat_test',
        customSize: mapSize,
        combatLineGap: c.combatLineGap,
        supplyEnabled: c.supplyEnabled,
        debugNoFog: c.debugNoFog,
        aiP1: false,
        aiP2: false,
      });
      return;
    }
    if (this.mode === 'map_builder') {
      this.scene.start('GameScene', {
        scenario: 'custom',
        customSize: c.mapSize,
        mapBuilder: true,
        supplyEnabled: c.supplyEnabled,
        debugNoFog: c.debugNoFog,
        aiP2: false,
      });
      return;
    }
    if (this.mode === 'endless') {
      this.scene.start('GameScene', {
        ...this._sharedLaunchData(),
        scenario: 'custom',
        customSize: c.mapSize,
        procLandProfile: c.procLandProfile,
        procQuickStart: c.procQuickStart,
        supplyEnabled: c.supplyEnabled,
        debugNoFog: c.debugNoFog,
        aiStrategy: c.aiStrategy,
        startSupplyTruck: c.startSupplyTruck,
        aiP1: true,
        aiP2: true,
        aiViewerMode: true,
        spectatorMode: true,
      });
      return;
    }
    this.scene.start('GameScene', {
      scenario: 'custom',
      customSize: c.mapSize,
      procLandProfile: c.procLandProfile,
      procQuickStart: c.procQuickStart,
      supplyEnabled: c.supplyEnabled,
      debugNoFog: c.debugNoFog,
      aiStrategy: c.aiStrategy,
      ...this._sharedLaunchData(),
    });
  }

  _drawBg(w, h) {
    this.add.rectangle(w / 2, h / 2, w, h, 0x080808, 1);
    const g = this.add.graphics();
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0xb8922a, 0.03 + Math.random() * 0.04);
      g.fillCircle(Math.random() * w, Math.random() * h, 2 + Math.random() * 4);
    }
  }
}
