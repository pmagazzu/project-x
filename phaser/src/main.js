import Phaser from 'phaser';
import { MenuScene } from './MenuScene.js';
import { GameScene } from './GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0d0d0d',
  scene: [MenuScene, GameScene],
  input: {
    mouse: { preventDefaultWheel: true }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

window.game = new Phaser.Game(config);
