import Phaser from 'phaser';

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
    key:   'scout',
    label: 'SCOUT MAP',
    icon:  '🌲',
    sub:   '25×25 terrain · engineers · explore & build',
    color: 0x1a3a22,
    hoverColor: 0x2a5533,
  },
  {
    key:   'naval',
    label: 'NAVAL THEATER',
    icon:  '🌊',
    sub:   'Island bases · build your fleet · amphibious warfare',
    color: 0x0d2a44,
    hoverColor: 0x1a3d66,
  },
  {
    key:   'combat',
    label: 'COMBAT DRILL',
    icon:  '⚔',
    sub:   'Plains · all units · pure combat test',
    color: 0x3a1111,
    hoverColor: 0x5a1a1a,
  },
  {
    key:   'grand',
    label: 'GRAND CAMPAIGN',
    icon:  '🏔',
    sub:   'Big map · full armies · long game',
    color: 0x2a2a11,
    hoverColor: 0x3d3d1a,
  },
  {
    key:   'air_test',
    label: 'AIR TESTING',
    icon:  '✈',
    sub:   'Plains · both airfields in range · test air combat',
    color: 0x1a2233,
    hoverColor: 0x2a3350,
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
    this._aiP2 = false;

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
          this.scene.start('GameScene', { scenario: sc.key, aiP2: this._aiP2 });
        }
      });
    });

    // ── Footer hint ───────────────────────────────────────────────────────
    this.add.rectangle(w/2, h - 24, w, 34, 0x050705, 1);
    this.add.text(w/2, h - 24, 'Right-click = action menu  ·  WASD/Arrow Keys = pan  ·  Scroll = zoom  ·  ESC = settings', {
      font: '10px monospace', fill: '#2a3a2a',
    }).setOrigin(0.5);

    // ── AI Toggle — top-right ─────────────────────────────────────────────
    this._aiToggleBtn = this.add.text(w - 14, 14, '[ P2: HUMAN ]', {
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
        this.scene.start('GameScene', { scenario: scenarioKey, customSize: tier.size, aiP2: this._aiP2 });
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
}
