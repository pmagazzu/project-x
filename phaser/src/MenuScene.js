import Phaser from 'phaser';
import { GAME_VERSION } from './GameScene.js';

const SCENARIOS = [
  {
    key: 'skirmish',
    label: 'SKIRMISH',
    icon: '⚔',
    sub: 'Proc-gen map · pick size & land profile · play vs AI or human',
    color: 0x3a1f66,
    hoverColor: 0x5a2f99,
    flow: 'skirmish',
  },
  {
    key: 'map_builder',
    label: 'MAP BUILDER',
    icon: '🛠',
    sub: 'Paint terrain & resources · export/import JSON · quick playtest',
    color: 0x1f3b2a,
    hoverColor: 0x2f6a45,
    flow: 'map_builder',
  },
  {
    key: 'ai_vs_ai_endless',
    label: 'AI VS AI · ENDLESS',
    icon: '∞',
    sub: 'Spectator duel on a compact map · pick size before start',
    color: 0x2b5f58,
    hoverColor: 0x46a696,
    flow: 'endless',
  },
  {
    key: 'combat_test',
    label: 'COMBAT TEST',
    icon: '🎯',
    sub: 'Unit lines face off · play both sides · no AI',
    color: 0x4a3020,
    hoverColor: 0x7a5030,
    flow: 'combat_test',
  },
];

const SKIRMISH_SIZE_TIERS = [
  { label: 'Small', size: 25, sub: '25×25 · quick' },
  { label: 'Medium', size: 40, sub: '40×40 · standard' },
  { label: 'Large', size: 60, sub: '60×60 · long' },
  { label: 'Huge', size: 90, sub: '90×90 · epic' },
];

const ENDLESS_SIZE_TIERS = [
  { label: 'Compact', size: 20, sub: '20×20 · brawl in minutes' },
  { label: 'Skirmish', size: 25, sub: '25×25 · fast action' },
  { label: 'Standard', size: 30, sub: '30×30 · balanced pace' },
  { label: 'Wide', size: 35, sub: '35×35 · more room' },
  { label: 'Roomy', size: 40, sub: '40×40 · still quicker than old 120' },
];

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const w = this.scale.width, h = this.scale.height;
    this._aiP2 = true;

    this._drawArcadeWarBackground(w, h);
    this.add.rectangle(w / 2, 2, w, 4, 0x2a3a1a, 1);

    this.add.text(w / 2, 38, '1 9 3 5', {
      font: '13px monospace', fill: '#3a5530', letterSpacing: 8,
    }).setOrigin(0.5);

    this.add.text(w / 2, 74, 'ATTRITION', {
      font: 'bold 58px monospace', fill: '#b8922a',
    }).setOrigin(0.5);

    this.add.text(w / 2, 120, '──  TURN-BASED MILITARY STRATEGY  ──', {
      font: '12px monospace', fill: '#3a4a2a',
    }).setOrigin(0.5);

    const btnW = 500, btnH = 64, gap = 12;
    const totalH = SCENARIOS.length * (btnH + gap) - gap;
    const startY = h / 2 - totalH / 2 + 20;

    SCENARIOS.forEach((sc, i) => {
      const bx = w / 2, by = startY + i * (btnH + gap);
      const bg = this.add.rectangle(bx, by, btnW, btnH, sc.color, 1)
        .setStrokeStyle(1, 0x2a3a2a)
        .setInteractive({ useHandCursor: true });

      this.add.rectangle(bx - btnW / 2 + 3, by, 5, btnH - 2, sc.hoverColor, 1);
      this.add.text(bx - btnW / 2 + 28, by, sc.icon, { font: '22px monospace' }).setOrigin(0.5);

      const label = this.add.text(bx - btnW / 2 + 55, by - 9, sc.label, {
        font: 'bold 16px monospace', fill: '#d0cbb0',
      }).setOrigin(0, 0.5);

      const sub = this.add.text(bx - btnW / 2 + 55, by + 11, sc.sub, {
        font: '11px monospace', fill: '#556650',
      }).setOrigin(0, 0.5);

      const arrow = this.add.text(bx + btnW / 2 - 18, by, '›', {
        font: 'bold 20px monospace', fill: '#334433',
      }).setOrigin(1, 0.5);

      bg.on('pointerover', () => {
        bg.setFillStyle(sc.hoverColor, 1).setStrokeStyle(1, 0x66aa44);
        label.setStyle({ fill: '#f0e898' });
        arrow.setStyle({ fill: '#88cc44' });
        sub.setStyle({ fill: '#7a9070' });
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(sc.color, 1).setStrokeStyle(1, 0x2a3a2a);
        label.setStyle({ fill: '#d0cbb0' });
        arrow.setStyle({ fill: '#334433' });
        sub.setStyle({ fill: '#556650' });
      });
      bg.on('pointerdown', () => this._onScenarioClick(sc));
    });

    this.add.rectangle(w / 2, h - 24, w, 34, 0x050705, 1);
    this.add.text(w / 2, h - 24, 'Right-click = action menu  ·  WASD/Arrow Keys = pan  ·  Scroll = zoom  ·  ESC = settings', {
      font: '10px monospace', fill: '#2a3a2a',
    }).setOrigin(0.5);

    this.add.text(w / 2, h - 56, `${GAME_VERSION}`, {
      font: 'bold 26px monospace', fill: '#6f8f5a', stroke: '#111611', strokeThickness: 4,
    }).setOrigin(0.5);

    this._aiToggleBtn = this.add.text(w - 14, 14, '[ P2: AI  🤖 ]', {
      font: 'bold 12px monospace', fill: '#556655',
      backgroundColor: '#0d130d', padding: { x: 10, y: 6 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    this._aiToggleBtn.on('pointerover', () => this._aiToggleBtn.setAlpha(0.8));
    this._aiToggleBtn.on('pointerout', () => this._aiToggleBtn.setAlpha(1.0));
    this._aiToggleBtn.on('pointerdown', () => {
      this._aiP2 = !this._aiP2;
      this._aiToggleBtn.setText(this._aiP2 ? '[ P2: AI  🤖 ]' : '[ P2: HUMAN ]');
      this._aiToggleBtn.setStyle({
        fill: this._aiP2 ? '#ffcc44' : '#556655',
        backgroundColor: this._aiP2 ? '#2a1a00' : '#0d130d',
      });
    });
    this.add.text(w - 14, 38, 'Skirmish only', {
      font: '9px monospace', fill: '#445544',
    }).setOrigin(1, 0);
  }

  _onScenarioClick(sc) {
    if (sc.flow === 'combat_test') {
      this.scene.start('GameScene', {
        scenario: 'combat_test',
        aiP1: false,
        aiP2: false,
        debugNoFog: true,
      });
      return;
    }
    if (sc.flow === 'endless') {
      this._showSizePicker(ENDLESS_SIZE_TIERS, 'SELECT ENDLESS MAP SIZE', (size) => {
        this.scene.start('GameScene', {
          scenario: 'custom',
          customSize: size,
          procLandProfile: 'islands',
          procQuickStart: true,
          debugNoFog: true,
          aiP1: true,
          aiP2: true,
          aiStrategy: 'balanced',
          aiViewerMode: true,
          startSupplyTruck: true,
        });
      });
      return;
    }
    if (sc.flow === 'map_builder') {
      this._showSizePicker(SKIRMISH_SIZE_TIERS.slice(0, 3), 'MAP BUILDER SIZE', (size) => {
        this.scene.start('GameScene', {
          scenario: 'custom',
          customSize: size,
          aiP2: false,
          mapBuilder: true,
        });
      });
      return;
    }
    if (sc.flow === 'skirmish') {
      this._showSizePicker(SKIRMISH_SIZE_TIERS, 'SELECT MAP SIZE', (size) => {
        this._showProcOptions('custom', size);
      });
    }
  }

  _drawArcadeWarBackground(w, h) {
    this.add.rectangle(w / 2, h / 2, w, h, 0x0d0d0d, 1);
    const bgGfx = this.add.graphics();
    const tileW = 40, tileH = 40;
    const cols = Math.ceil(w / tileW) + 1;
    const rows = Math.ceil(h / tileH) + 1;
    const palette = [0x111111, 0x131210, 0x141312, 0x111111, 0x161410, 0x121111];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = palette[(r * 3 + c * 7) % palette.length];
        bgGfx.fillStyle(col, 1);
        bgGfx.fillRect(c * tileW, r * tileH, tileW - 1, tileH - 1);
      }
    }
    bgGfx.lineStyle(1, 0x242018, 0.35);
    for (let x = -h; x < w + h; x += 20) {
      bgGfx.beginPath();
      bgGfx.moveTo(x, 0);
      bgGfx.lineTo(x + h, h);
      bgGfx.strokePath();
    }
    const vg = this.add.graphics();
    vg.fillStyle(0x000000, 0.35);
    vg.fillRect(0, 0, w, h);
    vg.fillStyle(0x000000, 0.0);
    vg.fillRect(80, 60, w - 160, h - 120);
  }

  _showSizePicker(tiers, titleText, onPick) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.82)
      .setDepth(100).setInteractive();
    const panelW = 480, panelH = tiers.length * 50 + 96;
    const panelY = h / 2 - panelH / 2;
    const panel = this.add.rectangle(w / 2, h / 2, panelW, panelH, 0x0c110c, 1)
      .setStrokeStyle(2, 0x3a5530).setDepth(101);
    const topLine = this.add.rectangle(w / 2, panelY + 2, panelW, 3, 0x3a5530, 1).setDepth(102);
    const title = this.add.text(w / 2, panelY + 28, titleText, {
      font: 'bold 16px monospace', fill: '#b8922a',
    }).setOrigin(0.5).setDepth(102);

    const created = [overlay, panel, topLine, title];
    const tierW = panelW - 40, tierH = 42, tierGap = 8;
    const tierStartY = panelY + 52;

    tiers.forEach((tier, i) => {
      const tx = w / 2, ty = tierStartY + i * (tierH + tierGap) + tierH / 2;
      const tbg = this.add.rectangle(tx, ty, tierW, tierH, 0x111a11, 1)
        .setStrokeStyle(1, 0x2a3a2a)
        .setInteractive({ useHandCursor: true })
        .setDepth(102);
      const tlabel = this.add.text(tx - tierW / 2 + 16, ty, tier.label, {
        font: 'bold 15px monospace', fill: '#c8c0a0',
      }).setOrigin(0, 0.5).setDepth(103);
      const tsub = this.add.text(tx + tierW / 2 - 14, ty, tier.sub, {
        font: '11px monospace', fill: '#445544',
      }).setOrigin(1, 0.5).setDepth(103);

      tbg.on('pointerover', () => {
        tbg.setFillStyle(0x1e2e1e, 1).setStrokeStyle(1, 0x66aa44);
        tlabel.setStyle({ fill: '#f0e898' });
        tsub.setStyle({ fill: '#7a9a6a' });
      });
      tbg.on('pointerout', () => {
        tbg.setFillStyle(0x111a11, 1).setStrokeStyle(1, 0x2a3a2a);
        tlabel.setStyle({ fill: '#c8c0a0' });
        tsub.setStyle({ fill: '#445544' });
      });
      tbg.on('pointerdown', () => {
        created.forEach(o => o.destroy());
        closeBtn.destroy();
        onPick(tier.size);
      });
      created.push(tbg, tlabel, tsub);
    });

    const closeBtn = this.add.text(w / 2 + panelW / 2 - 10, panelY + 10, '✕', {
      font: 'bold 14px monospace', fill: '#556655',
      backgroundColor: '#0a100a', padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setDepth(104).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { created.forEach(o => o.destroy()); closeBtn.destroy(); });
    overlay.on('pointerdown', () => { created.forEach(o => o.destroy()); closeBtn.destroy(); });
  }

  _showProcOptions(scenarioKey, customSize) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.84)
      .setDepth(120).setInteractive();
    const panelW = 560, panelH = 360;
    const panelY = h / 2 - panelH / 2;
    const panel = this.add.rectangle(w / 2, h / 2, panelW, panelH, 0x0c110c, 1)
      .setStrokeStyle(2, 0x3a5530).setDepth(121);
    const topLine = this.add.rectangle(w / 2, panelY + 2, panelW, 3, 0x3a5530, 1).setDepth(122);
    const title = this.add.text(w / 2, panelY + 24, 'SKIRMISH — GENERATION OPTIONS', {
      font: 'bold 16px monospace', fill: '#b8922a',
    }).setOrigin(0.5).setDepth(123);

    const LAND_PROFILES = [
      { key: 'islands', label: 'Islands' },
      { key: 'large_islands', label: 'Large Islands' },
      { key: 'continent', label: 'Continent' },
      { key: 'two_continents', label: 'Two Continents' },
      { key: 'archipelago', label: 'Archipelago' },
      { key: 'naval_supremacy', label: 'Naval Supremacy' },
      { key: 'landlocked', label: 'Landlocked (No Naval)' },
    ];

    let profile = 'continent';
    let quickStart = true;
    let debugNoFog = false;
    const created = [overlay, panel, topLine, title];

    const rebuild = () => {
      created.forEach(o => { if (o._dynamic) o.destroy(); });

      const y0 = panelY + 76;
      const landLbl = this.add.text(w / 2 - 230, y0, 'Land setting', {
        font: '12px monospace', fill: '#c8c0a0',
      }).setOrigin(0, 0.5).setDepth(123);
      landLbl._dynamic = true; created.push(landLbl);

      const left = this.add.text(w / 2 - 20, y0, '[ < ]', {
        font: 'bold 12px monospace', fill: '#dddddd', backgroundColor: '#222222', padding: { x: 8, y: 5 },
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      left._dynamic = true; created.push(left);

      const profileName = LAND_PROFILES.find(p => p.key === profile)?.label || profile;
      const mid = this.add.text(w / 2 + 120, y0, profileName, {
        font: 'bold 12px monospace', fill: '#88ccff', backgroundColor: '#102030', padding: { x: 10, y: 5 },
      }).setOrigin(0.5).setDepth(123);
      mid._dynamic = true; created.push(mid);

      const right = this.add.text(w / 2 + 260, y0, '[ > ]', {
        font: 'bold 12px monospace', fill: '#dddddd', backgroundColor: '#222222', padding: { x: 8, y: 5 },
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      right._dynamic = true; created.push(right);

      const idx = LAND_PROFILES.findIndex(p => p.key === profile);
      left.on('pointerdown', () => { profile = LAND_PROFILES[(idx - 1 + LAND_PROFILES.length) % LAND_PROFILES.length].key; rebuild(); });
      right.on('pointerdown', () => { profile = LAND_PROFILES[(idx + 1) % LAND_PROFILES.length].key; rebuild(); });

      const qsY = y0 + 60;
      const qsLbl = this.add.text(w / 2 - 230, qsY, 'Quick Start', {
        font: '12px monospace', fill: '#c8c0a0',
      }).setOrigin(0, 0.5).setDepth(123);
      qsLbl._dynamic = true; created.push(qsLbl);

      const qsBtn = this.add.text(w / 2 + 120, qsY, quickStart ? '[ YES ]' : '[ NO ]', {
        font: 'bold 12px monospace',
        fill: quickStart ? '#88ff88' : '#ff8888',
        backgroundColor: quickStart ? '#1b3b1b' : '#3b1b1b',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      qsBtn.on('pointerdown', () => { quickStart = !quickStart; rebuild(); });
      qsBtn._dynamic = true; created.push(qsBtn);

      const note = this.add.text(w / 2, qsY + 50,
        'Quick Start: prebuilt Mine + Oil Pump + Farm + Lumber Camp near each HQ', {
        font: '10px monospace', fill: '#667766',
      }).setOrigin(0.5).setDepth(123);
      note._dynamic = true; created.push(note);

      const fogY = qsY + 84;
      const fogLbl = this.add.text(w / 2 - 230, fogY, 'Fog of War', {
        font: '12px monospace', fill: '#c8c0a0',
      }).setOrigin(0, 0.5).setDepth(123);
      fogLbl._dynamic = true; created.push(fogLbl);

      const fogBtn = this.add.text(w / 2 + 130, fogY, debugNoFog ? '[ OFF (DEBUG) ]' : '[ ON ]', {
        font: 'bold 12px monospace',
        fill: debugNoFog ? '#ffcc88' : '#aaddaa',
        backgroundColor: debugNoFog ? '#3a1f00' : '#153015',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      fogBtn.on('pointerdown', () => { debugNoFog = !debugNoFog; rebuild(); });
      fogBtn._dynamic = true; created.push(fogBtn);

      const startBtn = this.add.text(w / 2, panelY + panelH - 52, '[ START SKIRMISH ]', {
        font: 'bold 14px monospace', fill: '#ffffff', backgroundColor: '#2a5533', padding: { x: 18, y: 8 },
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      startBtn.on('pointerdown', () => {
        this.scene.start('GameScene', {
          scenario: scenarioKey,
          customSize,
          aiP2: this._aiP2,
          aiStrategy: 'balanced',
          procLandProfile: profile,
          procQuickStart: quickStart,
          debugNoFog,
        });
      });
      startBtn._dynamic = true; created.push(startBtn);

      const backBtn = this.add.text(w / 2 - 180, panelY + panelH - 52, '[ BACK ]', {
        font: 'bold 12px monospace', fill: '#dddddd', backgroundColor: '#333333', padding: { x: 12, y: 7 },
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      backBtn.on('pointerdown', () => {
        created.forEach(o => o.destroy());
        this._showSizePicker(SKIRMISH_SIZE_TIERS, 'SELECT MAP SIZE', (size) => this._showProcOptions(scenarioKey, size));
      });
      backBtn._dynamic = true; created.push(backBtn);

      const closeBtn = this.add.text(w / 2 + panelW / 2 - 10, panelY + 10, '✕', {
        font: 'bold 14px monospace', fill: '#556655', backgroundColor: '#0a100a', padding: { x: 6, y: 3 },
      }).setOrigin(1, 0).setDepth(124).setInteractive({ useHandCursor: true });
      closeBtn.on('pointerdown', () => { created.forEach(o => o.destroy()); });
      closeBtn._dynamic = true; created.push(closeBtn);
    };

    rebuild();
    overlay.on('pointerdown', () => { created.forEach(o => o.destroy()); });
  }
}
