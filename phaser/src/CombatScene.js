import Phaser from 'phaser';
import { randomCardReward } from './gameData.js';

function makeEnemy(nodeType) {
  if (nodeType === 'boss') return { name: 'Dreadnought AI', hp: 130, maxHp: 130, block: 0, weak: 0, vulnerable: 0 };
  if (nodeType === 'elite') return { name: 'Hunter Frigate', hp: 78, maxHp: 78, block: 0, weak: 0, vulnerable: 0 };
  return { name: 'Raider Skiff', hp: 52, maxHp: 52, block: 0, weak: 0, vulnerable: 0 };
}

export class CombatScene extends Phaser.Scene {
  constructor() {
    super('CombatScene');
  }

  create(data) {
    this.node = data.node;
    this.run = this.game.runState;
    this.player = { hp: this.run.hp, maxHp: this.run.maxHp, block: 0, weak: 0, vulnerable: 0, energy: 3 };
    this.enemy = makeEnemy(this.node.type);
    this.drawPile = Phaser.Utils.Array.Shuffle([...this.run.deck]);
    this.discard = [];
    this.hand = [];

    this.add.rectangle(640, 360, 1280, 720, 0x0a1023);
    this.turnLabel = this.add.text(36, 24, 'Combat', { font: '28px monospace', color: '#bad3ff' });
    this.statusLabel = this.add.text(36, 60, '', { font: '18px monospace', color: '#8fa6d1' });
    this.intentLabel = this.add.text(840, 240, '', { font: '20px monospace', color: '#ffbe8d' });

    this.endTurnBtn = this.add.text(1080, 650, '[ END TURN ]', {
      font: '26px monospace', color: '#e8f1ff', backgroundColor: '#2a426d', padding: { x: 18, y: 10 },
    }).setInteractive({ useHandCursor: true });
    this.endTurnBtn.on('pointerdown', () => this.endTurn());

    this.rollIntent();
    this.startPlayerTurn();
  }

  rollIntent() {
    const r = Math.random();
    if (this.node.type === 'boss') {
      this.enemyIntent = r < 0.5 ? { type: 'attack', amount: 18 } : { type: 'attack', amount: 12, vulnerable: 1 };
    } else if (this.node.type === 'elite') {
      this.enemyIntent = r < 0.55 ? { type: 'attack', amount: 13 } : { type: 'defend', block: 9, weak: 1 };
    } else {
      this.enemyIntent = r < 0.7 ? { type: 'attack', amount: 9 } : { type: 'defend', block: 7 };
    }
  }

  startPlayerTurn() {
    this.player.block = 0;
    this.player.energy = 3;
    this.drawTo(5);
    this.render();
  }

  drawTo(n) {
    while (this.hand.length < n) {
      if (this.drawPile.length === 0) {
        if (this.discard.length === 0) break;
        this.drawPile = Phaser.Utils.Array.Shuffle([...this.discard]);
        this.discard = [];
      }
      this.hand.push(this.drawPile.pop());
    }
  }

  playCard(index) {
    const card = this.hand[index];
    if (!card || card.cost > this.player.energy) return;
    this.player.energy -= card.cost;

    if (card.damage) {
      let dmg = card.damage;
      if (this.player.weak > 0) dmg = Math.max(0, dmg - 2);
      if (this.enemy.vulnerable > 0) dmg = Math.round(dmg * 1.5);
      this.hitTarget(this.enemy, dmg);
    }
    if (card.block) this.player.block += card.block;
    if (card.energy) this.player.energy += card.energy;
    if (card.draw) this.drawTo(this.hand.length + card.draw);
    if (card.weak) this.enemy.weak = Math.max(this.enemy.weak, card.weak);
    if (card.vulnerable) this.enemy.vulnerable = Math.max(this.enemy.vulnerable, card.vulnerable);
    if (card.scrap) this.run.scrap += card.scrap;

    this.discard.push(card);
    this.hand.splice(index, 1);

    if (this.enemy.hp <= 0) {
      this.winCombat();
      return;
    }
    this.render();
  }

  endTurn() {
    for (const card of this.hand) this.discard.push(card);
    this.hand = [];

    if (this.enemyIntent.type === 'attack') {
      let dmg = this.enemyIntent.amount;
      if (this.enemy.weak > 0) dmg = Math.max(0, dmg - 2);
      if (this.player.vulnerable > 0) dmg = Math.round(dmg * 1.5);
      this.hitTarget(this.player, dmg);
      if (this.enemyIntent.vulnerable) this.player.vulnerable = Math.max(this.player.vulnerable, this.enemyIntent.vulnerable);
    } else {
      this.enemy.block += this.enemyIntent.block || 0;
      if (this.enemyIntent.weak) this.player.weak = Math.max(this.player.weak, this.enemyIntent.weak);
    }

    this.tickStatus(this.player);
    this.tickStatus(this.enemy);

    if (this.player.hp <= 0) {
      this.loseCombat();
      return;
    }

    this.enemy.block = 0;
    this.rollIntent();
    this.startPlayerTurn();
  }

  tickStatus(unit) {
    unit.weak = Math.max(0, unit.weak - 1);
    unit.vulnerable = Math.max(0, unit.vulnerable - 1);
  }

  hitTarget(target, amount) {
    const blocked = Math.min(target.block, amount);
    target.block -= blocked;
    target.hp -= (amount - blocked);
  }

  winCombat() {
    this.run.hp = this.player.hp;
    const rewards = randomCardReward();
    this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.65);
    this.add.text(640, 120, 'Victory - Choose 1 card', { font: '36px monospace', color: '#b5ffd9' }).setOrigin(0.5);
    rewards.forEach((card, i) => {
      const x = 300 + i * 340;
      const cardBox = this.add.rectangle(x, 360, 280, 320, 0x202840).setStrokeStyle(3, 0x9cb7ff).setInteractive({ useHandCursor: true });
      this.add.text(x, 260, card.name, { font: '24px monospace', color: '#eff4ff', align: 'center', wordWrap: { width: 250 } }).setOrigin(0.5);
      this.add.text(x, 320, `Cost ${card.cost}`, { font: '20px monospace', color: '#ffd57d' }).setOrigin(0.5);
      this.add.text(x, 380, card.text, { font: '18px monospace', color: '#b9c8f0', align: 'center', wordWrap: { width: 240 } }).setOrigin(0.5);
      cardBox.on('pointerdown', () => {
        const scrap = this.node.type === 'boss' ? 80 : this.node.type === 'elite' ? 45 : 25;
        this.scene.start('RunMapScene', {
          afterCombat: { nodeId: this.node.id, victory: true, addCard: card, rewards: { scrap } },
        });
      });
    });
  }

  loseCombat() {
    this.scene.start('RunMapScene', { afterCombat: { nodeId: this.node.id, victory: false } });
  }

  render() {
    this.children.list.filter((o) => o.getData && o.getData('hand')).forEach((o) => o.destroy());

    this.turnLabel.setText(`Encounter: ${this.node.type.toUpperCase()}  |  Energy ${this.player.energy}`);
    this.statusLabel.setText(
      `You ${this.player.hp}/${this.player.maxHp} [Block ${this.player.block}]   ` +
      `Enemy ${this.enemy.name} ${this.enemy.hp}/${this.enemy.maxHp} [Block ${this.enemy.block}]`
    );

    let intentText = '';
    if (this.enemyIntent.type === 'attack') intentText = `Enemy intent: Attack ${this.enemyIntent.amount}`;
    else intentText = `Enemy intent: Defend ${this.enemyIntent.block}`;
    this.intentLabel.setText(intentText);

    this.hand.forEach((card, i) => {
      const x = 180 + i * 210;
      const y = 600;
      const canPlay = this.player.energy >= card.cost;
      const fill = canPlay ? 0x273863 : 0x2d2d2d;
      const box = this.add.rectangle(x, y, 180, 180, fill).setStrokeStyle(2, 0xb9cbff).setData('hand', true).setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => this.playCard(i));
      this.add.text(x, y - 58, card.name, { font: '18px monospace', color: '#f2f6ff', align: 'center', wordWrap: { width: 160 } }).setOrigin(0.5).setData('hand', true);
      this.add.text(x, y - 14, `Cost ${card.cost}`, { font: '16px monospace', color: '#ffcf7c' }).setOrigin(0.5).setData('hand', true);
      this.add.text(x, y + 34, card.text, { font: '14px monospace', color: '#b8c8ef', align: 'center', wordWrap: { width: 160 } }).setOrigin(0.5).setData('hand', true);
    });
  }
}
