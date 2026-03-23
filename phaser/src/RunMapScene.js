import Phaser from 'phaser';
import { makeRunState } from './gameData.js';

const NODE_TYPES = ['combat', 'combat', 'event', 'repair', 'shop', 'combat', 'elite'];

function generateMap() {
  const rows = 6;
  let id = 1;
  const nodes = [];
  for (let r = 0; r < rows; r++) {
    const count = r === rows - 1 ? 1 : 3;
    for (let c = 0; c < count; c++) {
      const type = r === rows - 1 ? 'boss' : Phaser.Utils.Array.GetRandom(NODE_TYPES);
      nodes.push({ id: id++, row: r, col: c, type, links: [] });
    }
  }
  for (const n of nodes) {
    if (n.row === rows - 1) continue;
    const nextRow = nodes.filter((m) => m.row === n.row + 1);
    const targets = Phaser.Utils.Array.Shuffle([...nextRow]).slice(0, 2);
    n.links = targets.map((t) => t.id);
  }
  return nodes;
}

export class RunMapScene extends Phaser.Scene {
  constructor() {
    super('RunMapScene');
  }

  create(data) {
    if (!this.game.runState) {
      this.game.runState = makeRunState();
      this.game.runState.map = generateMap();
    }
    if (data?.afterCombat) {
      const run = this.game.runState;
      run.completed.push(data.afterCombat.nodeId);
      run.currentNodeId = data.afterCombat.nodeId;
      if (data.afterCombat.victory && run.relics.length > 0) {
        run.hp = Math.min(run.maxHp, run.hp + 4);
      }
      if (data.afterCombat.rewards) run.scrap += data.afterCombat.rewards.scrap || 0;
      if (data.afterCombat.addCard) run.deck.push(data.afterCombat.addCard);
      if (data.afterCombat.victory === false) {
        this.drawLose();
        return;
      }
    }

    const run = this.game.runState;
    this.cameras.main.setBackgroundColor('#060915');
    this.add.text(40, 24, 'STARLANE RUN', { font: '30px monospace', color: '#b9d6ff' });
    this.add.text(40, 66, `Hull ${run.hp}/${run.maxHp}   Scrap ${run.scrap}   Deck ${run.deck.length}`, { font: '20px monospace', color: '#9fb2d9' });
    this.add.text(40, 700 - 30, 'Click highlighted node. Goal: reach and beat the boss.', { font: '16px monospace', color: '#8a95b8' });

    this.drawMap();
  }

  isAvailable(node) {
    const run = this.game.runState;
    if (run.completed.includes(node.id)) return false;
    if (!run.currentNodeId) return node.row === 0;
    const current = run.map.find((n) => n.id === run.currentNodeId);
    return current?.links.includes(node.id);
  }

  drawMap() {
    const run = this.game.runState;
    const rowY = [150, 240, 330, 420, 510, 600];
    const rowX = [320, 640, 960];

    const pos = new Map();
    for (const node of run.map) {
      const x = node.row === 5 ? 640 : rowX[node.col];
      const y = rowY[node.row];
      pos.set(node.id, { x, y });
    }

    for (const node of run.map) {
      const p = pos.get(node.id);
      for (const toId of node.links) {
        const q = pos.get(toId);
        this.add.line(0, 0, p.x, p.y, q.x, q.y, 0x304068).setOrigin(0, 0).setLineWidth(2, 2);
      }
    }

    for (const node of run.map) {
      const { x, y } = pos.get(node.id);
      const completed = run.completed.includes(node.id);
      const available = this.isAvailable(node);
      const color = completed ? 0x37a35f : available ? 0x89b8ff : 0x30364a;
      const r = node.type === 'boss' ? 28 : node.type === 'elite' ? 22 : 18;
      const circle = this.add.circle(x, y, r, color).setStrokeStyle(2, 0xd8e3ff);

      const text = this.add.text(x, y, node.type[0].toUpperCase(), {
        font: '18px monospace',
        color: '#081120',
      }).setOrigin(0.5);

      if (available) {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerdown', () => this.enterNode(node));
        text.setInteractive({ useHandCursor: true });
        text.on('pointerdown', () => this.enterNode(node));
      }
      this.add.text(x, y + 28, node.type.toUpperCase(), { font: '12px monospace', color: '#a8b6da' }).setOrigin(0.5);
    }
  }

  enterNode(node) {
    const run = this.game.runState;
    if (node.type === 'repair') {
      run.hp = Math.min(run.maxHp, run.hp + 14);
      run.completed.push(node.id);
      run.currentNodeId = node.id;
      this.scene.restart();
      return;
    }
    if (node.type === 'shop') {
      if (run.scrap >= 45) {
        run.scrap -= 45;
        run.maxHp += 8;
        run.hp += 8;
      }
      run.completed.push(node.id);
      run.currentNodeId = node.id;
      this.scene.restart();
      return;
    }
    if (node.type === 'event') {
      const heal = Phaser.Math.Between(6, 12);
      run.hp = Math.min(run.maxHp, run.hp + heal);
      run.scrap += 10;
      run.completed.push(node.id);
      run.currentNodeId = node.id;
      this.scene.restart();
      return;
    }

    this.scene.start('CombatScene', { node });
  }

  drawLose() {
    this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);
    this.add.text(640, 300, 'RUN LOST', { font: '72px monospace', color: '#ff7b7b' }).setOrigin(0.5);
    const btn = this.add.text(640, 420, '[ START NEW RUN ]', { font: '28px monospace', backgroundColor: '#243657', color: '#d9e6ff', padding: { x: 20, y: 12 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      this.game.runState = makeRunState();
      this.game.runState.map = generateMap();
      this.scene.restart();
    });
  }
}
