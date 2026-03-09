import Phaser from 'phaser';

const SCENARIOS = [
  {
    key:   'random',
    label: '🎲  RANDOM MAP',
    sub:   '40×40 proc-gen • continents • unique every game',
    color: 0x553388,
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

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const w = this.scale.width, h = this.scale.height;

    // Background
    this.add.rectangle(w/2, h/2, w, h, 0x0d0d0d);

    // Title
    this.add.text(w/2, 60, 'ATTRITION', {
      font: 'bold 52px monospace', fill: '#cc9900',
    }).setOrigin(0.5);

    this.add.text(w/2, 118, '1935 · Turn-Based Military Strategy', {
      font: '16px monospace', fill: '#667755',
    }).setOrigin(0.5);

    this.add.text(w/2, 148, '— SELECT SCENARIO —', {
      font: 'bold 14px monospace', fill: '#444444',
    }).setOrigin(0.5);

    // Scenario buttons
    const btnW = 520, btnH = 80, gap = 18;
    const totalH = SCENARIOS.length * (btnH + gap) - gap;
    const startY = h / 2 - totalH / 2 + 10;

    SCENARIOS.forEach((sc, i) => {
      const bx = w / 2, by = startY + i * (btnH + gap);

      const bg = this.add.rectangle(bx, by, btnW, btnH, sc.color, 0.9)
        .setStrokeStyle(2, 0x888888)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(bx, by - 12, sc.label, {
        font: 'bold 20px monospace', fill: '#ffffff',
      }).setOrigin(0.5);

      const sub = this.add.text(bx, by + 16, sc.sub, {
        font: '12px monospace', fill: '#aaaaaa',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { bg.setFillStyle(sc.color, 1); label.setStyle({ fill: '#ffee88' }); });
      bg.on('pointerout',  () => { bg.setFillStyle(sc.color, 0.9); label.setStyle({ fill: '#ffffff' }); });
      bg.on('pointerdown', () => {
        this.scene.start('GameScene', { scenario: sc.key });
      });
    });

    // Footer
    this.add.text(w/2, h - 28, 'Right-click = action menu  |  WASD = pan  |  Scroll = zoom  |  ESC = settings', {
      font: '11px monospace', fill: '#333333',
    }).setOrigin(0.5);
  }
}
