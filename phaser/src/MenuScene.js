import Phaser from 'phaser';

const SCENARIOS = [
  {
    key:   'custom',
    label: '🗺️  CUSTOM MAP',
    sub:   'Proc-gen • choose your map size • unique every game',
    color: 0x553388,
    customSize: true,
  },
  {
    key:   'air_test',
    label: '✈️  AIR TESTING',
    sub:   '20×20 plains • both airfields within range • test air combat',
    color: 0x445566,
  },
  {
    key:   'scout',
    label: '🌲  SCOUT MAP',
    sub:   '25×25 terrain • 2 engineers each • far apart',
    color: 0x226633,
  },
  {
    key:   'naval',
    label: '🌊  NAVAL THEATER',
    sub:   '35×25 ocean map • island bases • build your force',
    color: 0x114477,
  },
  {
    key:   'combat',
    label: '⚔️  COMBAT DRILL',
    sub:   '20×10 plains • all unit types face-off • pure combat test',
    color: 0x882222,
  },
  {
    key:   'grand',
    label: '🗺️  GRAND CAMPAIGN',
    sub:   '60×40 big map • full armies • performance test',
    color: 0x555522,
  },
];

// Custom map size tiers
const SIZE_TIERS = [
  { label: 'Tiny',       size: 15,  sub: '15×15' },
  { label: 'Small',      size: 25,  sub: '25×25' },
  { label: 'Medium',     size: 40,  sub: '40×40' },
  { label: 'Large',      size: 60,  sub: '60×60' },
  { label: 'Huge',       size: 90,  sub: '90×90' },
  { label: 'Massive',    size: 120, sub: '120×120' },
  { label: 'Colossal',   size: 160, sub: '160×160' },
  { label: 'Absurd',     size: 200, sub: '200×200 ⚠️ slow' },
];

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const w = this.scale.width, h = this.scale.height;

    this.add.rectangle(w/2, h/2, w, h, 0x0d0d0d);

    this.add.text(w/2, 60, 'ATTRITION', {
      font: 'bold 52px monospace', fill: '#cc9900',
    }).setOrigin(0.5);

    this.add.text(w/2, 118, '1935 · Turn-Based Military Strategy', {
      font: '16px monospace', fill: '#667755',
    }).setOrigin(0.5);

    this.add.text(w/2, 148, '— SELECT SCENARIO —', {
      font: 'bold 14px monospace', fill: '#444444',
    }).setOrigin(0.5);

    const btnW = 520, btnH = 72, gap = 14;
    const totalH = SCENARIOS.length * (btnH + gap) - gap;
    const startY = h / 2 - totalH / 2 + 20;

    SCENARIOS.forEach((sc, i) => {
      const bx = w / 2, by = startY + i * (btnH + gap);

      const bg = this.add.rectangle(bx, by, btnW, btnH, sc.color, 0.9)
        .setStrokeStyle(2, 0x888888)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(bx, by - 10, sc.label, {
        font: 'bold 19px monospace', fill: '#ffffff',
      }).setOrigin(0.5);

      const sub = this.add.text(bx, by + 14, sc.sub, {
        font: '11px monospace', fill: '#aaaaaa',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { bg.setFillStyle(sc.color, 1); label.setStyle({ fill: '#ffee88' }); });
      bg.on('pointerout',  () => { bg.setFillStyle(sc.color, 0.9); label.setStyle({ fill: '#ffffff' }); });
      bg.on('pointerdown', () => {
        if (sc.customSize) {
          this._showSizePicker(sc.key);
        } else {
          this.scene.start('GameScene', { scenario: sc.key });
        }
      });
    });

    this.add.text(w/2, h - 28, 'Right-click = action menu  |  WASD = pan  |  Scroll = zoom  |  ESC = settings', {
      font: '11px monospace', fill: '#333333',
    }).setOrigin(0.5);
  }

  _showSizePicker(scenarioKey) {
    const w = this.scale.width, h = this.scale.height;

    // Darken overlay
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.75).setDepth(100).setInteractive();

    const panelW = 460, panelH = SIZE_TIERS.length * 52 + 100;
    const panelX = w/2 - panelW/2, panelY = h/2 - panelH/2;

    const panel = this.add.rectangle(w/2, h/2, panelW, panelH, 0x1a1a2a, 0.98)
      .setStrokeStyle(2, 0x666688).setDepth(101);

    const title = this.add.text(w/2, panelY + 30, 'SELECT MAP SIZE', {
      font: 'bold 18px monospace', fill: '#cc9900',
    }).setOrigin(0.5).setDepth(102);

    const created = [overlay, panel, title];

    const tierW = panelW - 40, tierH = 44, tierGap = 8;
    const tierStartY = panelY + 68;

    SIZE_TIERS.forEach((tier, i) => {
      const tx = w/2, ty = tierStartY + i * (tierH + tierGap) + tierH/2;

      const tbg = this.add.rectangle(tx, ty, tierW, tierH, 0x2a2a44, 0.95)
        .setStrokeStyle(1.5, 0x445566)
        .setInteractive({ useHandCursor: true })
        .setDepth(102);

      const tlabel = this.add.text(tx - tierW*0.3, ty, tier.label, {
        font: 'bold 16px monospace', fill: '#ffffff',
      }).setOrigin(0.5).setDepth(103);

      const tsub = this.add.text(tx + tierW*0.22, ty, tier.sub, {
        font: '13px monospace', fill: '#888899',
      }).setOrigin(0.5).setDepth(103);

      tbg.on('pointerover', () => { tbg.setFillStyle(0x3a3a66, 1); tlabel.setStyle({ fill: '#ffee88' }); tsub.setStyle({ fill: '#ccccdd' }); });
      tbg.on('pointerout',  () => { tbg.setFillStyle(0x2a2a44, 0.95); tlabel.setStyle({ fill: '#ffffff' }); tsub.setStyle({ fill: '#888899' }); });
      tbg.on('pointerdown', () => {
        this.scene.start('GameScene', { scenario: scenarioKey, customSize: tier.size });
      });

      created.push(tbg, tlabel, tsub);
    });

    // Close on overlay click
    overlay.on('pointerdown', () => created.forEach(o => o.destroy()));
  }
}
