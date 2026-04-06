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
// Ensure canvas is keyboard-focusable (needed for WASD after click events)
window.game.events.once('ready', () => {
  if (window.game.canvas) window.game.canvas.setAttribute('tabindex', '0');
});
