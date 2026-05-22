import Phaser from 'phaser';
import { GAME_VERSION } from './GameScene.js';

const SCENARIOS = [
  {
    key: 'skirmish',
    label: 'SKIRMISH',
    icon: '⚔',
    sub: 'Proc-gen map · configure size, land, fog & supply',
    color: 0x3a1f66,
    hoverColor: 0x5a2f99,
    flow: 'skirmish',
  },
  {
    key: 'map_builder',
    label: 'MAP BUILDER',
    icon: '🛠',
    sub: 'Paint terrain & resources · export/import JSON',
    color: 0x1f3b2a,
    hoverColor: 0x2f6a45,
    flow: 'map_builder',
  },
  {
    key: 'ai_vs_ai_endless',
    label: 'AI VS AI · ENDLESS',
    icon: '∞',
    sub: 'Spectator duel · tune map & rules before launch',
    color: 0x2b5f58,
    hoverColor: 0x46a696,
    flow: 'endless',
  },
  {
    key: 'combat_test',
    label: 'COMBAT TEST',
    icon: '🎯',
    sub: 'Unit lines face off · spacing, supply & fog options',
    color: 0x4a3020,
    hoverColor: 0x7a5030,
    flow: 'combat_test',
  },
];

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const w = this.scale.width, h = this.scale.height;

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
      bg.on('pointerdown', () => {
        this.tweens.add({ targets: bg, scaleX: 0.98, scaleY: 0.98, duration: 60, yoyo: true });
        this.scene.start('SetupScene', { mode: sc.flow });
      });
    });

    this.add.rectangle(w / 2, h - 24, w, 34, 0x050705, 1);
    this.add.text(w / 2, h - 24, 'Right-click = action menu  ·  WASD/Arrow Keys = pan  ·  Scroll = zoom  ·  ESC = settings', {
      font: '10px monospace', fill: '#2a3a2a',
    }).setOrigin(0.5);

    const codex = this.add.text(w / 2, h - 88, '📖  ATTRITION CODEX  (combat rules & systems)', {
      font: 'bold 13px monospace', fill: '#8899cc',
      backgroundColor: '#141820', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    codex.on('pointerover', () => codex.setStyle({ fill: '#ccddee' }));
    codex.on('pointerout', () => codex.setStyle({ fill: '#8899cc' }));
    codex.on('pointerdown', () => this.scene.start('EncyclopediaScene', { tab: 'combat' }));

    this.add.text(w / 2, h - 56, `${GAME_VERSION}`, {
      font: 'bold 26px monospace', fill: '#6f8f5a', stroke: '#111611', strokeThickness: 4,
    }).setOrigin(0.5);
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
}
