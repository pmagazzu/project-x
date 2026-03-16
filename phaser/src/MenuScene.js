import Phaser from 'phaser';
import { GAME_VERSION } from './GameScene.js';

const SCENARIOS = [
  {
    key:   'custom',
    label: 'CUSTOM MAP',
    icon:  '🗺',
    sub:   'Proc-gen · choose size · unique every game',
    color: 0x3a1f66,
    hoverColor: 0x5a2f99,
    customSize: true,
  },
  {
    key:   'mortar_test',
    label: 'MORTAR TEST',
    icon:  '△',
    sub:   'Single mortar vs 3 targets behind mountains (LOS bypass test)',
    color: 0x3a2a1a,
    hoverColor: 0x6a4a1f,
  },
];

const SIZE_TIERS = [
  { label: 'Tiny',    size: 15,  sub: '15×15  · fast game' },
  { label: 'Small',   size: 25,  sub: '25×25  · ~1 hour' },
  { label: 'Medium',  size: 40,  sub: '40×40  · standard' },
  { label: 'Large',   size: 60,  sub: '60×60  · long game' },
  { label: 'Huge',    size: 90,  sub: '90×90  · epic' },
  { label: 'Massive', size: 120, sub: '120×120 · very long' },
  { label: 'Colossal',size: 160, sub: '160×160 · extreme' },
  { label: 'Absurd',  size: 200, sub: '200×200 ⚠ slow' },
];

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const w = this.scale.width, h = this.scale.height;
    this._aiP2 = true;

    // Background — dark field with subtle vignette
    this.add.rectangle(w/2, h/2, w, h, 0x080a08);

    // Top accent line
    this.add.rectangle(w/2, 2, w, 4, 0x2a3a1a, 1);

    // ── Title block ───────────────────────────────────────────────────────
    // Tagline above
    this.add.text(w/2, 38, '1 9 3 5', {
      font: '13px monospace', fill: '#3a5530', letterSpacing: 8
    }).setOrigin(0.5);

    // Main title
    const titleTxt = this.add.text(w/2, 74, 'ATTRITION', {
      font: 'bold 58px monospace', fill: '#b8922a',
    }).setOrigin(0.5);

    // Subtitle rule
    this.add.text(w/2, 120, '──  TURN-BASED MILITARY STRATEGY  ──', {
      font: '12px monospace', fill: '#3a4a2a',
    }).setOrigin(0.5);

    // ── Scenario list ─────────────────────────────────────────────────────
    const btnW = 500, btnH = 64, gap = 10;
    const totalH = SCENARIOS.length * (btnH + gap) - gap;
    const startY = h / 2 - totalH / 2 + 24;

    SCENARIOS.forEach((sc, i) => {
      const bx = w / 2, by = startY + i * (btnH + gap);

      // Card background
      const bg = this.add.rectangle(bx, by, btnW, btnH, sc.color, 1)
        .setStrokeStyle(1, 0x2a3a2a)
        .setInteractive({ useHandCursor: true });

      // Left color accent bar
      this.add.rectangle(bx - btnW/2 + 3, by, 5, btnH - 2, sc.hoverColor, 1);

      // Icon
      this.add.text(bx - btnW/2 + 28, by, sc.icon, {
        font: '22px monospace'
      }).setOrigin(0.5);

      // Label
      const label = this.add.text(bx - btnW/2 + 55, by - 9, sc.label, {
        font: 'bold 16px monospace', fill: '#d0cbb0',
      }).setOrigin(0, 0.5);

      // Sub
      const sub = this.add.text(bx - btnW/2 + 55, by + 11, sc.sub, {
        font: '11px monospace', fill: '#556650',
      }).setOrigin(0, 0.5);

      // Arrow indicator
      const arrow = this.add.text(bx + btnW/2 - 18, by, '›', {
        font: 'bold 20px monospace', fill: '#334433'
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
      bg.on('pointerdown', () => {
        if (sc.customSize) {
          this._showSizePicker(sc.key);
        } else {
          this.scene.start('GameScene', { scenario: sc.key, aiP2: this._aiP2, aiStrategy: 'balanced' });
        }
      });
    });

    // ── Footer hint ───────────────────────────────────────────────────────
    this.add.rectangle(w/2, h - 24, w, 34, 0x050705, 1);
    this.add.text(w/2, h - 24, 'Right-click = action menu  ·  WASD/Arrow Keys = pan  ·  Scroll = zoom  ·  ESC = settings', {
      font: '10px monospace', fill: '#2a3a2a',
    }).setOrigin(0.5);

    // Big version tag at bottom for easy build verification
    this.add.text(w/2, h - 56, `${GAME_VERSION}`, {
      font: 'bold 26px monospace', fill: '#6f8f5a', stroke: '#111611', strokeThickness: 4
    }).setOrigin(0.5);

    // ── AI Toggle — top-right ─────────────────────────────────────────────
    this._aiToggleBtn = this.add.text(w - 14, 14, '[ P2: AI  🤖 ]', {
      font: 'bold 12px monospace', fill: '#556655',
      backgroundColor: '#0d130d', padding: { x: 10, y: 6 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    this._aiToggleBtn.on('pointerover', () => this._aiToggleBtn.setAlpha(0.8));
    this._aiToggleBtn.on('pointerout',  () => this._aiToggleBtn.setAlpha(1.0));
    this._aiToggleBtn.on('pointerdown', () => {
      this._aiP2 = !this._aiP2;
      this._aiToggleBtn.setText(this._aiP2 ? '[ P2: AI  🤖 ]' : '[ P2: HUMAN ]');
      this._aiToggleBtn.setStyle({
        fill:            this._aiP2 ? '#ffcc44' : '#556655',
        backgroundColor: this._aiP2 ? '#2a1a00' : '#0d130d',
      });
    });
  }

  _showSizePicker(scenarioKey) {
    const w = this.scale.width, h = this.scale.height;

    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.82)
      .setDepth(100).setInteractive();

    const panelW = 480, panelH = SIZE_TIERS.length * 50 + 96;
    const panelY = h/2 - panelH/2;

    const panel = this.add.rectangle(w/2, h/2, panelW, panelH, 0x0c110c, 1)
      .setStrokeStyle(2, 0x3a5530).setDepth(101);

    // Top accent
    this.add.rectangle(w/2, panelY + 2, panelW, 3, 0x3a5530, 1).setDepth(102);

    const title = this.add.text(w/2, panelY + 28, 'SELECT MAP SIZE', {
      font: 'bold 16px monospace', fill: '#b8922a',
    }).setOrigin(0.5).setDepth(102);

    const created = [overlay, panel, title];
    // top accent is added directly (not in created), overlay click handles cleanup
    // Actually let's add all to created for cleanup
    const topLine = this.add.rectangle(w/2, panelY + 2, panelW, 3, 0x3a5530, 1).setDepth(103);
    // Already added one above; let's just track the title and use array properly
    // (the duplicate topLine is fine cosmetically, just remove the earlier one approach)

    const tierW = panelW - 40, tierH = 42, tierGap = 8;
    const tierStartY = panelY + 52;

    SIZE_TIERS.forEach((tier, i) => {
      const tx = w/2, ty = tierStartY + i * (tierH + tierGap) + tierH/2;

      const tbg = this.add.rectangle(tx, ty, tierW, tierH, 0x111a11, 1)
        .setStrokeStyle(1, 0x2a3a2a)
        .setInteractive({ useHandCursor: true })
        .setDepth(102);

      // Label left
      const tlabel = this.add.text(tx - tierW/2 + 16, ty, tier.label, {
        font: 'bold 15px monospace', fill: '#c8c0a0',
      }).setOrigin(0, 0.5).setDepth(103);

      // Sub right
      const tsub = this.add.text(tx + tierW/2 - 14, ty, tier.sub, {
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
        // Step 2: proc generation options (land profile + quick start)
        created.forEach(o => o.destroy());
        closeBtn.destroy();
        topLine.destroy();
        this._showProcOptions(scenarioKey, tier.size);
      });

      created.push(tbg, tlabel, tsub);
    });

    // Close button
    const closeBtn = this.add.text(w/2 + panelW/2 - 10, panelY + 10, '✕', {
      font: 'bold 14px monospace', fill: '#556655',
      backgroundColor: '#0a100a', padding: { x: 6, y: 3 }
    }).setOrigin(1, 0).setDepth(104).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { created.forEach(o => o.destroy()); closeBtn.destroy(); topLine.destroy(); });

    overlay.on('pointerdown', () => { created.forEach(o => o.destroy()); closeBtn.destroy(); topLine.destroy(); });
  }

  _showProcOptions(scenarioKey, customSize) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.84)
      .setDepth(120).setInteractive();

    const panelW = 560, panelH = 360;
    const panelY = h/2 - panelH/2;
    const panel = this.add.rectangle(w/2, h/2, panelW, panelH, 0x0c110c, 1)
      .setStrokeStyle(2, 0x3a5530).setDepth(121);
    const topLine = this.add.rectangle(w/2, panelY + 2, panelW, 3, 0x3a5530, 1).setDepth(122);
    const title = this.add.text(w/2, panelY + 24, 'PROCEDURAL GENERATION OPTIONS', {
      font: 'bold 16px monospace', fill: '#b8922a'
    }).setOrigin(0.5).setDepth(123);

    const LAND_PROFILES = [
      { key: 'islands',          label: 'Islands' },
      { key: 'large_islands',    label: 'Large Islands' },
      { key: 'continent',        label: 'Continent' },
      { key: 'two_continents',   label: 'Two Continents' },
      { key: 'archipelago',      label: 'Archipelago' },
      { key: 'naval_supremacy',  label: 'Naval Supremacy' },
      { key: 'landlocked',       label: 'Landlocked (No Naval)' },
    ];

    let profile = 'continent';
    let quickStart = true;
    let debugNoFog = false;
    const created = [overlay, panel, topLine, title];

    const rebuild = () => {
      created.forEach(o => { if (o._dynamic) o.destroy(); });

      const y0 = panelY + 76;
      const landLbl = this.add.text(w/2 - 230, y0, 'Land setting', {
        font: '12px monospace', fill: '#c8c0a0'
      }).setOrigin(0, 0.5).setDepth(123);
      landLbl._dynamic = true; created.push(landLbl);

      const left = this.add.text(w/2 - 20, y0, '[ < ]', {
        font: 'bold 12px monospace', fill: '#dddddd', backgroundColor: '#222222', padding: {x:8,y:5}
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      left._dynamic = true; created.push(left);

      const profileName = LAND_PROFILES.find(p => p.key === profile)?.label || profile;
      const mid = this.add.text(w/2 + 120, y0, profileName, {
        font: 'bold 12px monospace', fill: '#88ccff', backgroundColor: '#102030', padding: {x:10,y:5}
      }).setOrigin(0.5).setDepth(123);
      mid._dynamic = true; created.push(mid);

      const right = this.add.text(w/2 + 260, y0, '[ > ]', {
        font: 'bold 12px monospace', fill: '#dddddd', backgroundColor: '#222222', padding: {x:8,y:5}
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      right._dynamic = true; created.push(right);

      const idx = LAND_PROFILES.findIndex(p => p.key === profile);
      left.on('pointerdown', () => { profile = LAND_PROFILES[(idx - 1 + LAND_PROFILES.length) % LAND_PROFILES.length].key; rebuild(); });
      right.on('pointerdown', () => { profile = LAND_PROFILES[(idx + 1) % LAND_PROFILES.length].key; rebuild(); });

      const qsY = y0 + 60;
      const qsLbl = this.add.text(w/2 - 230, qsY, 'Quick Start', {
        font: '12px monospace', fill: '#c8c0a0'
      }).setOrigin(0,0.5).setDepth(123);
      qsLbl._dynamic = true; created.push(qsLbl);

      const qsBtn = this.add.text(w/2 + 120, qsY, quickStart ? '[ YES ]' : '[ NO ]', {
        font: 'bold 12px monospace',
        fill: quickStart ? '#88ff88' : '#ff8888',
        backgroundColor: quickStart ? '#1b3b1b' : '#3b1b1b',
        padding: {x:10,y:5}
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      qsBtn.on('pointerdown', () => { quickStart = !quickStart; rebuild(); });
      qsBtn._dynamic = true; created.push(qsBtn);

      const note = this.add.text(w/2, qsY + 50,
        'Quick Start: prebuilt Mine + Oil Pump + Farm + Lumber Camp near each HQ', {
        font: '10px monospace', fill: '#667766'
      }).setOrigin(0.5).setDepth(123);
      note._dynamic = true; created.push(note);

      const fogY = qsY + 84;
      const fogLbl = this.add.text(w/2 - 230, fogY, 'Debug Fog of War', {
        font: '12px monospace', fill: '#c8c0a0'
      }).setOrigin(0, 0.5).setDepth(123);
      fogLbl._dynamic = true; created.push(fogLbl);

      const fogBtn = this.add.text(w/2 + 130, fogY, debugNoFog ? '[ OFF (DEBUG) ]' : '[ ON ]', {
        font: 'bold 12px monospace',
        fill: debugNoFog ? '#ffcc88' : '#aaddaa',
        backgroundColor: debugNoFog ? '#3a1f00' : '#153015',
        padding: {x:10,y:5}
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      fogBtn.on('pointerdown', () => { debugNoFog = !debugNoFog; rebuild(); });
      fogBtn._dynamic = true; created.push(fogBtn);

      const startBtn = this.add.text(w/2, panelY + panelH - 52, '[ START GAME ]', {
        font: 'bold 14px monospace', fill: '#ffffff', backgroundColor: '#2a5533', padding: {x:18,y:8}
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

      const backBtn = this.add.text(w/2 - 180, panelY + panelH - 52, '[ BACK ]', {
        font: 'bold 12px monospace', fill: '#dddddd', backgroundColor: '#333333', padding: {x:12,y:7}
      }).setOrigin(0.5).setDepth(123).setInteractive({ useHandCursor: true });
      backBtn.on('pointerdown', () => { created.forEach(o => o.destroy()); this._showSizePicker(scenarioKey); });
      backBtn._dynamic = true; created.push(backBtn);

      const closeBtn = this.add.text(w/2 + panelW/2 - 10, panelY + 10, '✕', {
        font: 'bold 14px monospace', fill: '#556655', backgroundColor: '#0a100a', padding: { x: 6, y: 3 }
      }).setOrigin(1, 0).setDepth(124).setInteractive({ useHandCursor: true });
      closeBtn.on('pointerdown', () => { created.forEach(o => o.destroy()); });
      closeBtn._dynamic = true; created.push(closeBtn);
    };

    rebuild();
    overlay.on('pointerdown', () => { created.forEach(o => o.destroy()); });
  }
}
