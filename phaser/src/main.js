import Phaser from 'phaser';
import { RunMapScene } from './RunMapScene.js';
import { CombatScene } from './CombatScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#060915',
  scene: [RunMapScene, CombatScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
