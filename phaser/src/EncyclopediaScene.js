import Phaser from 'phaser';
import { GAME_VERSION } from './GameScene.js';
import { CODEX_TABS, CODEX_PAGES } from './CombatCodexContent.js';

export class EncyclopediaScene extends Phaser.Scene {
  constructor() { super('EncyclopediaScene'); }

  init(data) {
    this._tab = data?.tab || 'combat';
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(w / 2, h / 2, w, h, 0x0a080c, 1);

    const panelW = Math.min(720, w - 40);
    const panelH = Math.min(620, h - 80);
    const px = w / 2;
    const py = h / 2;

    this.add.rectangle(px, py, panelW, panelH, 0x141018, 0.98).setStrokeStyle(3, 0xb8922a);
    this.add.text(px, py - panelH / 2 + 28, '📖  ATTRITION CODEX', {
      font: 'bold 20px monospace', fill: '#f0d060',
    }).setOrigin(0.5);

    const tabY = py - panelH / 2 + 58;
    const tabW = Math.floor((panelW - 40) / CODEX_TABS.length) - 4;
    let tabX = px - panelW / 2 + 20 + tabW / 2;

    const rebuild = () => {
      if (this._bodyObjs) this._bodyObjs.forEach(o => o.destroy());
      this._bodyObjs = [];
      const pages = CODEX_PAGES[this._tab] || [];
      let y = py - panelH / 2 + 100;
      const left = px - panelW / 2 + 24;
      const wrap = panelW - 48;
      for (const pg of pages) {
        const hdr = this.add.text(left, y, pg.title, {
          font: 'bold 12px monospace', fill: '#ffcc66',
        }).setOrigin(0, 0);
        this._bodyObjs.push(hdr);
        y += 18;
        const body = this.add.text(left, y, pg.body, {
          font: '11px monospace', fill: '#c8d0d8', wordWrap: { width: wrap }, lineSpacing: 4,
        }).setOrigin(0, 0);
        this._bodyObjs.push(body);
        y += body.height + 16;
      }
    };

    CODEX_TABS.forEach((tab) => {
      const active = tab.id === this._tab;
      const bg = this.add.rectangle(tabX, tabY, tabW, 32, active ? 0x3a2810 : 0x1a1818, 1)
        .setStrokeStyle(2, active ? 0xffd700 : 0x444444)
        .setInteractive({ useHandCursor: true });
      const lbl = this.add.text(tabX, tabY, `${tab.icon} ${tab.label}`, {
        font: `${active ? 'bold ' : ''}10px monospace`, fill: active ? '#ffe890' : '#888888',
      }).setOrigin(0.5);
      bg.on('pointerdown', () => {
        this._tab = tab.id;
        this.scene.restart({ tab: tab.id });
      });
      bg.on('pointerover', () => bg.setFillStyle(0x4a3818, 1));
      bg.on('pointerout', () => bg.setFillStyle(active ? 0x3a2810 : 0x1a1818, 1));
      tabX += tabW + 6;
    });

    rebuild();

    const back = this.add.text(px - panelW / 2 + 16, py - panelH / 2 + 16, '← Menu', {
      font: 'bold 12px monospace', fill: '#8899aa', backgroundColor: '#0a0c10', padding: { x: 10, y: 6 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('MenuScene'));

    this.add.text(px, py + panelH / 2 + 24, GAME_VERSION, {
      font: '11px monospace', fill: '#556655',
    }).setOrigin(0.5);
  }
}
