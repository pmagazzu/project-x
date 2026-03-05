import Phaser from 'phaser';
import {
  hexToWorld, worldToHex, hexVertices, isValid,
  MAP_SIZE, HEX_SIZE, ISO_SQUISH, getMapBounds
} from './HexGrid.js';
import {
  createGameState, unitAt, buildingAt, createBuilding,
  getReachableHexes, getAttackableHexes,
  resolveTurn, checkWinner, calcIncome,
  UNIT_TYPES, PLAYER_COLORS, BUILDING_TYPES, MINE_COST
} from './GameState.js';

const TERRAIN = { PLAINS: 0, FOREST: 1, MOUNTAIN: 2 };
const TERRAIN_COLORS = {
  [TERRAIN.PLAINS]:   { fill: 0x6b8c3e, stroke: 0x4a6128 },
  [TERRAIN.FOREST]:   { fill: 0x2d5a1b, stroke: 0x1a3a0a },
  [TERRAIN.MOUNTAIN]: { fill: 0x7a6a5a, stroke: 0x5a4a3a },
};

const SELECTED_STROKE  = 0xffe066;
const HOVER_STROKE     = 0xaaddff;
const MOVE_HIGHLIGHT   = 0x00ffcc;
const ATTACK_HIGHLIGHT = 0xff6600;

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.terrain   = this._generateTerrain();
    this.gameState = createGameState();

    // Interaction state
    this.hoveredHex    = null;
    this.selectedUnit  = null;   // currently selected unit object
    this.selectedHex   = null;   // selected hex (for inspection)
    this.reachable     = [];     // {q,r} array of moveable hexes
    this.attackable    = [];     // {q,r,targetId} array
    this.mode          = 'select'; // 'select' | 'move' | 'attack'
    this._isDragging   = false;
    this._dragStart    = { x: 0, y: 0 };
    this._dragStartScroll = { x: 0, y: 0 };

    // Build terrain render texture
    const bounds  = getMapBounds();
    this._bounds  = bounds;
    const padding = HEX_SIZE * 2;
    const rtW = Math.ceil(bounds.width  + padding * 2);
    const rtH = Math.ceil(bounds.height + padding * 2);

    this.terrainRT = this.add.renderTexture(0, 0, rtW, rtH);
    this.terrainRT.setOrigin(0, 0);
    this.terrainRT.setPosition(bounds.minX - padding, bounds.minY - padding);
    this._drawTerrainToRT();

    // Highlight layer (world space, scrolls with camera)
    this.highlightGfx = this.add.graphics().setDepth(10);

    // Resource + building layer (world space)
    this.resourceGfx = this.add.graphics().setDepth(12);
    this.buildingGfx = this.add.graphics().setDepth(15);

    // Unit layer (world space)
    this.unitGfx = this.add.graphics().setDepth(20);

    // HUD (screen space)
    this.hudText = this.add.text(12, 8, '', {
      font: '14px monospace', fill: '#cccccc',
      backgroundColor: '#00000099', padding: { x: 8, y: 4 }
    }).setScrollFactor(0).setDepth(100);

    // Action buttons
    this._createButtons();

    // Event log (bottom of screen)
    this.logText = this.add.text(12, 0, '', {
      font: '12px monospace', fill: '#aaaaaa',
      backgroundColor: '#00000099', padding: { x: 6, y: 4 }
    }).setScrollFactor(0).setDepth(100);

    // Center camera on map
    const cam = this.cameras.main;
    cam.centerOn((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    cam.setZoom(1.0);
    const pad = padding;
    cam.setBounds(bounds.minX - pad, bounds.minY - pad, rtW, rtH);

    this._setupInput();
    this._drawResources();
    this._refresh();
  }

  // ── Terrain ──────────────────────────────────────────────────────────────
  _drawTerrainToRT() {
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    for (let q = 0; q < MAP_SIZE; q++) {
      for (let r = 0; r < MAP_SIZE; r++) {
        const { x, y } = hexToWorld(q, r);
        this._drawHex(gfx, x, y, this.terrain[`${q},${r}`], false, false);
      }
    }
    this.terrainRT.draw(gfx, 0, 0);
    gfx.destroy();
  }

  // Resource deposits — drawn once (static markers on terrain)
  _drawResources() {
    this.resourceGfx.clear();
    const gs = this.gameState;
    for (const [key] of Object.entries(gs.resourceHexes)) {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToWorld(q, r);
      // Small grey diamond to indicate iron deposit
      const s = HEX_SIZE * 0.22;
      this.resourceGfx.fillStyle(0xbbbbcc, 0.75);
      this.resourceGfx.fillTriangle(x, y - s, x - s, y, x + s, y);
      this.resourceGfx.fillTriangle(x, y + s, x - s, y, x + s, y);
    }
  }

  // Buildings — redraw each turn (ownership can change)
  _redrawBuildings() {
    this.buildingGfx.clear();
    const gs = this.gameState;
    for (const b of gs.buildings) {
      const { x, y } = hexToWorld(b.q, b.r);
      const color = b.owner ? PLAYER_COLORS[b.owner] : 0x888888;

      if (b.type === 'HQ') {
        const s = HEX_SIZE * 0.36;
        // Dark outline
        this.buildingGfx.fillStyle(0x000000, 1);
        this.buildingGfx.fillRect(x - s - 2, y - s * 0.6 - 2, s * 2 + 4, s * 1.6 + 4);
        // Body
        this.buildingGfx.fillStyle(color, 1);
        this.buildingGfx.fillRect(x - s, y - s * 0.6, s * 2, s * 1.4);
        // Roof triangle
        this.buildingGfx.fillStyle(color, 1);
        this.buildingGfx.fillTriangle(x - s - 2, y - s * 0.6, x + s + 2, y - s * 0.6, x, y - s * 1.7);
        // White "HQ" outline
        this.buildingGfx.lineStyle(2, 0xffffff, 0.9);
        this.buildingGfx.strokeRect(x - s, y - s * 0.6, s * 2, s * 1.4);
      } else if (b.type === 'MINE') {
        const s = HEX_SIZE * 0.25;
        // Dark outline circle
        this.buildingGfx.fillStyle(0x000000, 1);
        this.buildingGfx.fillCircle(x, y, s + 3);
        // Colored fill
        this.buildingGfx.fillStyle(color, 1);
        this.buildingGfx.fillCircle(x, y, s);
        // ⚙ cross inside
        this.buildingGfx.fillStyle(0x000000, 0.7);
        this.buildingGfx.fillRect(x - s * 0.2, y - s * 0.8, s * 0.4, s * 1.6);
        this.buildingGfx.fillRect(x - s * 0.8, y - s * 0.2, s * 1.6, s * 0.4);
      }
    }
  }

  _drawHex(gfx, cx, cy, terrain, isSelected, isHovered) {
    const colors = TERRAIN_COLORS[terrain];
    const strokeColor = isSelected ? SELECTED_STROKE : isHovered ? HOVER_STROKE : colors.stroke;
    const strokeW = (isSelected || isHovered) ? 2.5 : 1;
    const verts = hexVertices(cx, cy);

    gfx.fillStyle(colors.fill);
    gfx.beginPath();
    gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath();
    gfx.fillPath();

    gfx.lineStyle(strokeW, strokeColor);
    gfx.beginPath();
    gfx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) gfx.lineTo(verts[i].x, verts[i].y);
    gfx.closePath();
    gfx.strokePath();
  }

  // ── Full redraw (highlights + units) ─────────────────────────────────────
  _refresh() {
    this._redrawHighlights();
    this._redrawBuildings();
    this._redrawUnits();
    this._updateHUD();
    this._updateButtons();
    this._updateLogPosition();
  }

  _redrawHighlights() {
    this.highlightGfx.clear();

    // Move range
    for (const { q, r } of this.reachable) {
      const { x, y } = hexToWorld(q, r);
      const verts = hexVertices(x, y);
      this.highlightGfx.fillStyle(MOVE_HIGHLIGHT, 0.25);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath();
      this.highlightGfx.fillPath();
      this.highlightGfx.lineStyle(1.5, MOVE_HIGHLIGHT, 0.8);
      this.highlightGfx.strokePath();
    }

    // Attack range
    for (const { q, r } of this.attackable) {
      const { x, y } = hexToWorld(q, r);
      const verts = hexVertices(x, y);
      this.highlightGfx.fillStyle(ATTACK_HIGHLIGHT, 0.3);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath();
      this.highlightGfx.fillPath();
      this.highlightGfx.lineStyle(1.5, ATTACK_HIGHLIGHT, 0.9);
      this.highlightGfx.strokePath();
    }

    // Hover
    if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r)) {
      const { x, y } = hexToWorld(this.hoveredHex.q, this.hoveredHex.r);
      const terrain = this.terrain[`${this.hoveredHex.q},${this.hoveredHex.r}`];
      this._drawHex(this.highlightGfx, x, y, terrain, false, true);
    }

    // Selected unit hex
    if (this.selectedUnit) {
      const u = this.selectedUnit;
      const { x, y } = hexToWorld(u.q, u.r);
      this.highlightGfx.lineStyle(3, SELECTED_STROKE);
      const verts = hexVertices(x, y);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) this.highlightGfx.lineTo(verts[i].x, verts[i].y);
      this.highlightGfx.closePath();
      this.highlightGfx.strokePath();
    }
  }

  _redrawUnits() {
    this.unitGfx.clear();
    const gs = this.gameState;

    for (const unit of gs.units) {
      const { x, y } = hexToWorld(unit.q, unit.r);
      const color = PLAYER_COLORS[unit.owner];
      const dim = (unit.moved && unit.attacked) || (unit.owner !== gs.currentPlayer);
      const alpha = dim ? 0.45 : 1.0;
      const def = UNIT_TYPES[unit.type];
      const r = HEX_SIZE * 0.38;

      this.unitGfx.fillStyle(color, alpha);
      this.unitGfx.lineStyle(2, 0x000000, alpha);

      if (def.shape === 'circle') {
        this.unitGfx.fillCircle(x, y, r);
        this.unitGfx.strokeCircle(x, y, r);
      } else if (def.shape === 'square') {
        this.unitGfx.fillRect(x - r, y - r * 0.7, r * 2, r * 1.4);
        this.unitGfx.strokeRect(x - r, y - r * 0.7, r * 2, r * 1.4);
      } else if (def.shape === 'triangle') {
        const th = r * 1.2;
        this.unitGfx.fillTriangle(x, y - th, x - r, y + th * 0.5, x + r, y + th * 0.5);
        this.unitGfx.strokeTriangle(x, y - th, x - r, y + th * 0.5, x + r, y + th * 0.5);
      }

      // Health bar below unit
      const barW = HEX_SIZE * 0.9;
      const barH = 5;
      const bx   = x - barW / 2;
      const by   = y + r + 5;
      const pct  = unit.health / unit.maxHealth;
      // Background
      this.unitGfx.fillStyle(0x222222, alpha);
      this.unitGfx.fillRect(bx, by, barW, barH);
      // Fill (green → yellow → red based on health %)
      const barColor = pct > 0.6 ? 0x44ff44 : pct > 0.3 ? 0xffcc00 : 0xff3333;
      this.unitGfx.fillStyle(barColor, alpha);
      this.unitGfx.fillRect(bx, by, barW * pct, barH);
      // HP text
      this.unitGfx.lineStyle(1, 0x000000, alpha * 0.5);
      this.unitGfx.strokeRect(bx, by, barW, barH);
    }
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  _createButtons() {
    const w = this.scale.width;
    this.btnSubmit = this._makeButton(w - 140, 12, 'SUBMIT TURN', 0x226622, () => this._onSubmit());
    this.btnAttack = this._makeButton(w - 290, 12, 'ATTACK',      0x882222, () => this._onAttackMode());
    this.btnBuild  = this._makeButton(w - 420, 12, `BUILD MINE (${MINE_COST}⚙)`, 0x557755, () => this._onBuildMine());
    this.btnCancel = this._makeButton(w - 570, 12, 'CANCEL',      0x444444, () => this._onCancel());
  }

  _makeButton(x, y, label, color, cb) {
    const btn = this.add.text(x, y, label, {
      font: 'bold 13px monospace', fill: '#ffffff',
      backgroundColor: `#${color.toString(16).padStart(6,'0')}`,
      padding: { x: 10, y: 6 }
    }).setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', cb);
    btn.on('pointerover',  () => btn.setAlpha(0.8));
    btn.on('pointerout',   () => btn.setAlpha(1.0));
    return btn;
  }

  _updateButtons() {
    const gs      = this.gameState;
    const hasUnit = !!this.selectedUnit;
    const canAct  = hasUnit && this.selectedUnit.owner === gs.currentPlayer;

    this.btnCancel.setVisible(hasUnit || this.mode !== 'select');

    // Show Build Mine if: unit on a resource hex, no building there, enough iron
    this.btnAttack.setVisible(canAct && !this.selectedUnit.attacked && this.mode !== 'attack');

    if (canAct) {
      const u   = this.selectedUnit;
      const key = `${u.q},${u.r}`;
      const onResource = !!gs.resourceHexes[key];
      const noBuilding = !buildingAt(gs, u.q, u.r);
      const canAfford  = gs.players[gs.currentPlayer].iron >= MINE_COST;
      this.btnBuild.setVisible(onResource && noBuilding && canAfford);
    } else {
      this.btnBuild.setVisible(false);
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _setupInput() {
    const cam = this.cameras.main;

    this.input.on('pointerdown', (ptr) => {
      if (ptr.button === 0) {
        this._isDragging = false;
        this._dragStart = { x: ptr.x, y: ptr.y };
        this._dragStartScroll = { x: cam.scrollX, y: cam.scrollY };
      }
    });

    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 0) {
        const dx = ptr.x - this._dragStart.x;
        const dy = ptr.y - this._dragStart.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this._isDragging = true;
        if (this._isDragging) {
          cam.setScroll(
            this._dragStartScroll.x - dx / cam.zoom,
            this._dragStartScroll.y - dy / cam.zoom
          );
        }
      } else {
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex   = worldToHex(world.x, world.y);
        if (isValid(hex.q, hex.r)) {
          if (!this.hoveredHex || this.hoveredHex.q !== hex.q || this.hoveredHex.r !== hex.r) {
            this.hoveredHex = hex;
            this._redrawHighlights();
          }
        } else if (this.hoveredHex) {
          this.hoveredHex = null;
          this._redrawHighlights();
        }
      }
    });

    this.input.on('pointerup', (ptr) => {
      if (ptr.button === 0 && !this._isDragging) {
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        const hex   = worldToHex(world.x, world.y);
        if (isValid(hex.q, hex.r)) this._onHexClick(hex.q, hex.r);
      }
      this._isDragging = false;
    });

    this.input.on('wheel', (ptr, _o, _dx, dy) => {
      const factor    = dy > 0 ? 0.85 : 1.18;
      const newZoom   = Phaser.Math.Clamp(cam.zoom * factor, 0.2, 4.0);
      const wBefore   = cam.getWorldPoint(ptr.x, ptr.y);
      cam.setZoom(newZoom);
      const wAfter    = cam.getWorldPoint(ptr.x, ptr.y);
      cam.scrollX    += wBefore.x - wAfter.x;
      cam.scrollY    += wBefore.y - wAfter.y;
    });

    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
  }

  update() {
    const cam = this.cameras.main;
    const speed = 6 / cam.zoom;
    if (this.wasd.W.isDown) cam.scrollY -= speed;
    if (this.wasd.S.isDown) cam.scrollY += speed;
    if (this.wasd.A.isDown) cam.scrollX -= speed;
    if (this.wasd.D.isDown) cam.scrollX += speed;
  }

  // ── Click logic ───────────────────────────────────────────────────────────
  _onHexClick(q, r) {
    const gs = this.gameState;
    const clickedUnit = unitAt(gs, q, r);

    if (this.mode === 'move') {
      // Is this a valid move target?
      const isReachable = this.reachable.some(h => h.q === q && h.r === r);
      if (isReachable && !clickedUnit) {
        // Move unit
        gs.pendingMoves[this.selectedUnit.id] = { q, r };
        this.selectedUnit.q = q;
        this.selectedUnit.r = r;
        this.selectedUnit.moved = true;
        this._onCancel();
        return;
      }
      this._onCancel();
    }

    if (this.mode === 'attack') {
      const target = this.attackable.find(h => h.q === q && h.r === r);
      if (target) {
        gs.pendingAttacks[this.selectedUnit.id] = target.targetId;
        this.selectedUnit.attacked = true;
        this._onCancel();
        return;
      }
      this._onCancel();
    }

    // Select mode — click a unit or a hex
    if (clickedUnit && clickedUnit.owner === gs.currentPlayer) {
      this._selectUnit(clickedUnit);
    } else {
      this._clearSelection();
    }
  }

  _selectUnit(unit) {
    this.selectedUnit = unit;
    this.mode = 'select';

    if (!unit.moved) {
      this.reachable = getReachableHexes(this.gameState, unit, MAP_SIZE);
      this.mode = 'move';
    } else {
      this.reachable = [];
    }

    this.attackable = unit.attacked
      ? []
      : getAttackableHexes(this.gameState, unit, unit.q, unit.r);

    this._refresh();
  }

  _clearSelection() {
    this.selectedUnit = null;
    this.reachable    = [];
    this.attackable   = [];
    this.mode         = 'select';
    this._refresh();
  }

  _onCancel() {
    this._clearSelection();
  }

  _onAttackMode() {
    if (!this.selectedUnit || this.selectedUnit.attacked) return;
    this.mode = 'attack';
    this.reachable  = [];
    this.attackable = getAttackableHexes(
      this.gameState, this.selectedUnit,
      this.selectedUnit.q, this.selectedUnit.r
    );
    this._refresh();
  }

  _onBuildMine() {
    const gs = this.gameState;
    const u  = this.selectedUnit;
    if (!u) return;
    const key = `${u.q},${u.r}`;
    if (!gs.resourceHexes[key] || buildingAt(gs, u.q, u.r)) return;
    if (gs.players[gs.currentPlayer].iron < MINE_COST) return;
    gs.players[gs.currentPlayer].iron -= MINE_COST;
    gs.buildings.push(createBuilding('MINE', gs.currentPlayer, u.q, u.r));
    this._clearSelection();
  }

  _onSubmit() {
    const gs = this.gameState;

    if (gs.currentPlayer === 1) {
      gs.players[1].submitted = true;
      gs.currentPlayer = 2;
      this._clearSelection();
      this._showPassScreen('Player 2, it\'s your turn!');
    } else {
      gs.players[2].submitted = true;
      // Both submitted — resolve
      const events = resolveTurn(gs);
      const winner = checkWinner(gs);
      this._showResolution(events, winner);
    }
  }

  // ── Pass screen (hotseat handoff) ─────────────────────────────────────────
  _showPassScreen(msg) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(200);
    const txt = this.add.text(w/2, h/2 - 20, msg, {
      font: 'bold 28px monospace', fill: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    const sub = this.add.text(w/2, h/2 + 30, 'Click anywhere to continue', {
      font: '16px monospace', fill: '#aaaaaa'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    this.input.once('pointerdown', () => {
      overlay.destroy(); txt.destroy(); sub.destroy();
      this._refresh();
    });
  }

  _showResolution(events, winner) {
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.88)
      .setScrollFactor(0).setDepth(200);

    let text = `── Turn ${this.gameState.turn - 1} Resolution ──\n\n`;
    text += events.join('\n') || '(No actions)';

    if (winner) {
      text += `\n\n🏆 PLAYER ${winner} WINS!`;
    } else {
      text += `\n\nTurn ${this.gameState.turn} begins`;
    }

    const txt = this.add.text(w/2, h/2, text, {
      font: '14px monospace', fill: '#ffffff',
      align: 'center', wordWrap: { width: w - 80 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    if (!winner) {
      const sub = this.add.text(w/2, h - 60, 'Click anywhere to continue', {
        font: '14px monospace', fill: '#aaaaaa'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

      this.input.once('pointerdown', () => {
        overlay.destroy(); txt.destroy(); sub.destroy();
        this._refresh();
      });
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  _updateHUD() {
    const gs  = this.gameState;
    const p   = gs.currentPlayer;
    const iron = gs.players[p].iron;
    let info  = '';

    if (this.selectedUnit) {
      const u   = this.selectedUnit;
      const def = UNIT_TYPES[u.type];
      info = ` | Selected: ${def.name} HP:${u.health}/${u.maxHealth}`;
      info += u.moved ? ' [moved]' : ' [can move]';
      const pendingAtk = gs.pendingAttacks[u.id];
      info += pendingAtk ? ' [⚔ attack queued]' : u.attacked ? ' [attacked]' : ' [can attack]';
    } else if (this.hoveredHex && isValid(this.hoveredHex.q, this.hoveredHex.r)) {
      const t = ['Plains','Forest','Mountain'][this.terrain[`${this.hoveredHex.q},${this.hoveredHex.r}`]];
      const u = unitAt(gs, this.hoveredHex.q, this.hoveredHex.r);
      info = ` | (${this.hoveredHex.q},${this.hoveredHex.r}) ${t}`;
      if (u) info += ` — P${u.owner} ${UNIT_TYPES[u.type].name} HP:${u.health}`;
    }

    const income  = calcIncome(gs, p);
    const modeStr = this.mode === 'move' ? 'MOVING' : this.mode === 'attack' ? 'ATTACKING' : 'SELECT';
    this.hudText.setText(
      `Attrition | Player ${p} | Iron: ${iron} (+${income}/turn) | Turn: ${gs.turn} | ${modeStr}${info}`
    );
  }

  _updateLogPosition() {
    this.logText.setPosition(12, this.scale.height - this.logText.height - 8);
  }

  _pushLog(msg) {
    this._log = this._log || [];
    this._log.push(msg);
    if (this._log.length > 4) this._log.shift();
    this.logText.setText(this._log.join('\n'));
    this._updateLogPosition();
  }

  // ── Terrain gen ───────────────────────────────────────────────────────────
  _generateTerrain() {
    const map = {}, rng = this._seededRng(12345);
    for (let q = 0; q < MAP_SIZE; q++)
      for (let r = 0; r < MAP_SIZE; r++)
        map[`${q},${r}`] = 0;

    for (let i = 0; i < 30; i++) {
      const cq = Math.floor(rng() * MAP_SIZE), cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -2; dq <= 2; dq++)
        for (let dr = -2; dr <= 2; dr++)
          if (isValid(cq+dq, cr+dr) && rng() > 0.4) map[`${cq+dq},${cr+dr}`] = 1;
    }
    for (let i = 0; i < 15; i++) {
      const cq = Math.floor(rng() * MAP_SIZE), cr = Math.floor(rng() * MAP_SIZE);
      for (let dq = -1; dq <= 1; dq++)
        for (let dr = -1; dr <= 1; dr++)
          if (isValid(cq+dq, cr+dr) && rng() > 0.5) map[`${cq+dq},${cr+dr}`] = 2;
    }
    return map;
  }

  _seededRng(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  }
}
