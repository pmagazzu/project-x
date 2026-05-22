/**
 * Casino-style combat preview & result panels — clear breakdowns, punchy layout.
 */
import {
  getCombatIntel, analyzeCombat, buildResolveSteps,
  COMBAT_GLYPH, TIER_COL, TIER_BG,
} from './CombatUI.js';

const D_BASE = 210;

function mkText(scene, objs, txt, x, y, opts = {}) {
  const {
    col = '#e8eef4', sz = 11, bold = false, ox = 0.5, oy = 0.5, wrap = null, depth = D_BASE + 1,
  } = opts;
  const style = { font: `${bold ? 'bold ' : ''}${sz}px monospace`, fill: col };
  if (wrap) style.wordWrap = { width: wrap };
  const t = scene.add.text(x, y, txt, style).setOrigin(ox, oy).setScrollFactor(0).setDepth(depth);
  objs.push(t);
  return t;
}

function mkBox(scene, objs, x, y, w, h, fill, alpha = 1, stroke = null, depth = D_BASE) {
  const r = scene.add.rectangle(x, y, w, h, fill, alpha).setScrollFactor(0).setDepth(depth);
  if (stroke != null) r.setStrokeStyle(2, stroke);
  objs.push(r);
  return r;
}

function popIn(scene, objs) {
  const targets = objs.filter(o => o.setAlpha);
  targets.forEach(o => { o.setAlpha(0); o.setScale?.(0.94); });
  scene.tweens.add({ targets, alpha: 1, scaleX: 1, scaleY: 1, duration: 150, ease: 'Back.easeOut' });
}

function hpBar(scene, objs, x, y, w, hp, max, proj, depth = D_BASE + 1) {
  mkBox(scene, objs, x, y, w, 12, 0x111111, 1, 0x334455, depth);
  const f = Math.max(0, hp) / Math.max(1, max);
  if (f > 0) {
    const col = f > 0.6 ? 0x44bb44 : f > 0.3 ? 0xddaa00 : 0xcc2222;
    mkBox(scene, objs, x - w / 2 + (w * f) / 2, y, w * f, 12, col, 1, null, depth);
  }
  if (proj > 0) {
    const af = Math.max(0, hp - proj) / Math.max(1, max);
    const lw = w * (f - af);
    if (lw > 0) mkBox(scene, objs, x - w / 2 + w * af + lw / 2, y, lw, 12, 0x882222, 0.75, null, depth);
  }
}

/** Pre-attack briefing panel. Returns cleanup fn. */
export function renderCombatPreviewPanel(scene, attacker, target, blindFire, { onAttack, onCancel }) {
  const gs = scene.gameState;
  const intel = getCombatIntel(scene, gs, attacker, target, blindFire);
  const analysis = analyzeCombat(gs, scene.terrain, scene.mapSize, attacker, target, blindFire, intel);
  const {
    aDef, tDef, expDmg, expRetDmg, canRet, noRetReason, tier, tierLo, tierHi,
    preRollScore, scoreMin, scoreMax, baseAtk, verdict, verdictColor, verdictAdvice,
    atkProfile, defProfile, tips, modRows, clarity,
  } = analysis;

  const defName = intel.showDefenderType ? (target.designName || tDef.name) : 'Unknown hostile';
  const defType = intel.showDefenderType ? target.type : '???';
  const defHp = intel.showDefenderHP ? target.health : '?';
  const defMaxHp = intel.showDefenderHP ? (target.maxHealth || tDef.health) : '?';
  const defProj = intel.showDefenderHP ? expDmg : 0;

  const sw = scene.scale.width;
  const sh = scene.scale.height;
  const cx = sw * 0.5;
  const cy = sh * 0.5;
  const objs = [];
  const cW = Math.min(940, sw - 32);
  const cH = Math.min(680, sh - 48);

  mkBox(scene, objs, cx, cy, sw, sh, 0x000000, 0.72);
  mkBox(scene, objs, cx, cy, cW, cH, 0x120a18, 0.98, 0xffc040);
  mkBox(scene, objs, cx, cy - cH / 2 + 28, cW, 52, 0x2a1020, 1, 0xffd700);

  mkText(scene, objs, '◆ COMBAT ODDS ◆', cx, cy - cH / 2 + 22, { col: '#ffd700', sz: 16, bold: true });
  mkText(scene, objs, `INTEL ${intel.label}`, cx + cW / 2 - 24, cy - cH / 2 + 22, { col: '#bb99ee', sz: 10, bold: true, ox: 1 });
  mkText(scene, objs, intel.reasons.join(' · '), cx, cy - cH / 2 + 42, { col: '#8899aa', sz: 9, wrap: cW - 48 });

  const pW = (cW - 60) * 0.34;
  const pY = cy - cH / 2 + 118;
  const lX = cx - cW * 0.28;
  const rX = cx + cW * 0.28;
  const PC = [null, 0x3366cc, 0xcc3333];

  const portrait = (pcx, role, type, owner, name, hp, maxHp, proj, profile) => {
    mkBox(scene, objs, pcx, pY, pW, 130, 0x0a1018, 1, PC[owner] || 0x445566);
    mkText(scene, objs, role, pcx, pY - 54, { col: role === 'ATTACKER' ? '#77a9ff' : '#ff8888', sz: 9, bold: true });
    mkText(scene, objs, COMBAT_GLYPH[type] || '◌', pcx, pY - 28, { col: '#fff', sz: 32, bold: true });
    mkText(scene, objs, name, pcx, pY + 4, { col: '#eef6ff', sz: 11, bold: true, wrap: pW - 12 });
    if (typeof hp === 'number') {
      hpBar(scene, objs, pcx, pY + 38, pW - 16, hp, maxHp, proj);
      mkText(scene, objs, `HP ${hp}/${maxHp}  →  ${Math.max(0, hp - proj)}`, pcx, pY + 54, {
        col: proj > 0 ? '#ff9999' : '#99dd99', sz: 9, bold: true,
      });
    } else {
      mkText(scene, objs, `HP ${hp}/${maxHp}`, pcx, pY + 38, { col: '#aa88cc', sz: 10, bold: true });
    }
    mkText(scene, objs, profile.role, pcx, pY + 68, { col: '#99aabb', sz: 8, wrap: pW - 10 });
    mkText(scene, objs, profile.lines[0] || '', pcx, pY + 82, { col: '#778899', sz: 8, wrap: pW - 10 });
  };

  portrait(lX, 'ATTACKER', attacker.type, attacker.owner, attacker.designName || aDef.name,
    attacker.health, attacker.maxHealth || aDef.health, expRetDmg, atkProfile);
  portrait(rX, 'DEFENDER', intel.showDefenderType ? target.type : '???', target.owner, defName,
    defHp, defMaxHp, defProj, intel.showDefenderStats ? defProfile : { role: '???', lines: ['Need better intel'] });

  // Center jackpot readout
  mkBox(scene, objs, cx, pY - 6, 140, 100, 0x1a0810, 0.95, 0xff4444);
  mkText(scene, objs, verdict, cx, pY - 32, { col: verdictColor, sz: 13, bold: true });
  mkText(scene, objs, `−${expDmg}`, cx, pY - 4, { col: '#ffeedd', sz: 36, bold: true });
  mkText(scene, objs, 'expected dmg', cx, pY + 18, { col: '#aa9988', sz: 8 });
  mkText(scene, objs, canRet ? `↩ ${expRetDmg} back` : `no ret · ${noRetReason}`, cx, pY + 34, {
    col: canRet ? '#ffaa66' : '#778899', sz: 9, bold: true, wrap: 120,
  });

  let y = pY + 78;
  mkBox(scene, objs, cx, y + 52, cW - 24, 108, 0x080c14, 0.96, 0x3a4a5a);
  mkText(scene, objs, '── THE MATH (plain English) ──', cx - cW / 2 + 20, y + 8, { col: '#88aacc', sz: 9, bold: true, ox: 0, oy: 0 });
  clarity.forEach((row, i) => {
    mkText(scene, objs, row.k, cx - cW / 2 + 20, y + 24 + i * 14, { col: '#667788', sz: 8, ox: 0, oy: 0 });
    mkText(scene, objs, row.v, cx + cW / 2 - 20, y + 24 + i * 14, { col: row.c, sz: 8, bold: true, ox: 1, oy: 0 });
  });
  y += 118;

  if (intel.showScoreDetail) {
    mkBox(scene, objs, cx, y + 40, cW - 24, 88, 0x0a0e12, 0.95, 0x2e3d50);
    mkText(scene, objs, 'MODIFIERS', cx - cW / 2 + 20, y + 6, { col: '#6688aa', sz: 9, bold: true, ox: 0, oy: 0 });
    modRows.slice(0, 5).forEach((row, i) => {
      mkText(scene, objs, row[0], cx - cW / 2 + 20, y + 22 + i * 13, { col: '#667788', sz: 8, ox: 0, oy: 0 });
      mkText(scene, objs, row[1], cx + cW / 2 - 20, y + 22 + i * 13, { col: row[2], sz: 8, bold: true, ox: 1, oy: 0 });
    });
    mkText(scene, objs, `Roll band: ${tierLo} … ${tier} … ${tierHi}  ·  ATK ${baseAtk}`, cx, y + 76, {
      col: TIER_COL[tier] || '#ccc', sz: 9, bold: true, wrap: cW - 40,
    });
    y += 96;
  }

  if (tips.length) {
    mkText(scene, objs, verdictAdvice, cx, y + 8, { col: '#c8b8d8', sz: 9, wrap: cW - 48 });
    tips.slice(0, 2).forEach((t, i) => mkText(scene, objs, `• ${t}`, cx - cW / 2 + 20, y + 26 + i * 12, { col: '#9988aa', sz: 8, ox: 0, oy: 0, wrap: cW - 40 }));
    y += 52;
  }

  const btnY = cy + cH / 2 - 28;
  mkBox(scene, objs, cx, btnY, cW, 48, 0x080c10, 1, 0x2e3d50);
  const atkBtn = mkText(scene, objs, '  ▶ STRIKE  ', cx - 100, btnY, {
    col: '#fff', sz: 13, bold: true, depth: D_BASE + 3,
  });
  atkBtn.setBackgroundColor('#aa2211').setPadding(16, 10);
  atkBtn.setInteractive({ useHandCursor: true });
  const canLabel = verdict === 'RETREAT ADVISED' ? '  BACK OUT  ' : '  PASS  ';
  const canBtn = mkText(scene, objs, canLabel, cx + 100, btnY, {
    col: '#ddd', sz: 13, bold: true, depth: D_BASE + 3,
  });
  canBtn.setBackgroundColor('#2a2244').setPadding(16, 10);
  canBtn.setInteractive({ useHandCursor: true });

  scene._addToUI([...objs, atkBtn, canBtn]);
  popIn(scene, [...objs, atkBtn, canBtn]);

  const cleanup = () => objs.concat([atkBtn, canBtn]).forEach(o => { try { o.destroy(); } catch (e) {} });

  atkBtn.on('pointerdown', () => {
    scene._contextMenuClicked = true;
    const slash = scene.add.graphics().setScrollFactor(0).setDepth(D_BASE + 4);
    slash.lineStyle(6, 0xff4444, 0.95);
    slash.beginPath();
    slash.moveTo(lX + 20, pY - 12);
    slash.lineTo(rX - 20, pY - 12);
    slash.strokePath();
    scene.tweens.add({ targets: slash, alpha: 0, duration: 140, onComplete: () => slash.destroy() });
    scene.time.delayedCall(120, () => { cleanup(); onAttack?.(); });
  });
  canBtn.on('pointerdown', () => { scene._contextMenuClicked = true; cleanup(); onCancel?.(); });

  if (scene._aiViewerMode && scene.aiPlayers?.has(1) && scene.aiPlayers?.has(2)) {
    scene.time.delayedCall(2000, () => cleanup());
  }

  return cleanup;
}

/** Post-resolve result card. Returns array of objs (for dismiss). */
export function renderCombatResultPanel(scene, entry, idx = 1, total = 1) {
  const objs = [];
  const sw = scene.scale.width;
  const sh = scene.scale.height;
  const cx = sw * 0.5;
  const cW = Math.min(920, sw - 24);
  const cH = Math.min(520, sh - 80);
  const cY = Math.min(sh * 0.72, sh - cH / 2 - 8);
  const steps = buildResolveSteps(entry);
  const g = (t) => COMBAT_GLYPH[t] || '◌';
  const PC = [null, 0x3366cc, 0xcc3333];

  mkBox(scene, objs, cx, cY, cW, cH, 0x120a18, 0.98, 0xff6688);
  mkBox(scene, objs, cx, cY - cH / 2 + 24, cW, 46, 0x2a1020, 1, 0xffd700);
  mkText(scene, objs, '◆ COMBAT RESOLVED ◆', cx - 40, cY - cH / 2 + 22, { col: '#ffd700', sz: 14, bold: true });
  if (total > 1) mkText(scene, objs, `${idx}/${total}`, cx + cW / 2 - 20, cY - cH / 2 + 22, { col: '#8ea5bc', sz: 10, ox: 1 });

  const pW = Math.floor(cW * 0.36);
  const pY = cY - cH / 2 + 118;
  const lCX = cx - cW * 0.28;
  const rCX = cx + cW * 0.28;
  const atkHP0 = entry.attackerHPBefore ?? 0;
  const defHP0 = entry.targetHPBefore ?? 0;
  const atkHP1 = Math.max(0, atkHP0 - (entry.attackerDmg || 0));
  const defHP1 = Math.max(0, defHP0 - (entry.dmg || 0));

  const portrait = (pcx, role, type, owner, name, hp0, hp1, dmg) => {
    mkBox(scene, objs, pcx, pY, pW, 128, 0x0a1018, 1, PC[owner] || 0x445566);
    mkText(scene, objs, role, pcx, pY - 52, { col: role === 'ATTACKER' ? '#77a9ff' : '#ff8888', sz: 9, bold: true });
    mkText(scene, objs, g(type), pcx, pY - 26, { col: '#fff', sz: 30, bold: true });
    mkText(scene, objs, name || '?', pcx, pY + 6, { col: '#eef6ff', sz: 11, bold: true, wrap: pW - 12 });
    hpBar(scene, objs, pcx, pY + 40, pW - 20, hp1, hp0, 0);
    mkText(scene, objs, dmg > 0 ? `−${dmg} HP` : 'no hit', pcx, pY + 56, { col: dmg > 0 ? '#ffaaaa' : '#99dd99', sz: 10, bold: true });
  };
  portrait(lCX, 'ATTACKER', entry.attackerType, entry.attackerOwner, entry.attackerName, atkHP0, atkHP1, entry.attackerDmg || 0);
  portrait(rCX, 'DEFENDER', entry.targetType, entry.targetOwner, entry.targetName, defHP0, defHP1, entry.dmg || 0);

  mkBox(scene, objs, cx, pY - 8, 150, 90, TIER_BG[entry.tier] || 0x2a2200, 1, 0xffc040);
  mkText(scene, objs, entry.tier || '?', cx, pY - 28, { col: TIER_COL[entry.tier] || '#fff', sz: 14, bold: true });
  mkText(scene, objs, `−${entry.dmg || 0}`, cx, pY - 2, { col: '#ffeedd', sz: 34, bold: true });
  mkText(scene, objs, `score ${entry.score ?? '?'}/100`, cx, pY + 28, { col: '#ddccaa', sz: 9 });

  const outY = pY + 72;
  const net = (entry.dmg || 0) - (entry.attackerDmg || 0);
  const outcome = net > 0 ? 'YOU WIN THE TRADE' : net < 0 ? 'DEFENDER WINS TRADE' : 'EVEN TRADE';
  mkText(scene, objs, outcome, cx, outY, { col: net > 0 ? '#88ee88' : net < 0 ? '#ff8888' : '#ddbb66', sz: 11, bold: true });

  const stepY = outY + 22;
  mkBox(scene, objs, cx, stepY + 70, cW - 24, 150, 0x080c10, 0.96, 0x2e3d50);
  mkText(scene, objs, 'RESOLUTION STEPS', cx - cW / 2 + 18, stepY + 6, { col: '#88aacc', sz: 9, bold: true, ox: 0, oy: 0 });
  steps.slice(0, 7).forEach((s, i) => {
    mkText(scene, objs, s, cx - cW / 2 + 18, stepY + 22 + i * 16, { col: '#b8c8d8', sz: 8, ox: 0, oy: 0, wrap: cW - 44 });
  });

  const ret = (entry.defenderCanRetaliate && (entry.retaliationDmg || 0) > 0)
    ? `Retaliation: ${entry.retaliationTier || '?'} for −${entry.retaliationDmg}`
    : 'Retaliation: none';
  mkText(scene, objs, ret, cx, cY + cH / 2 - 52, { col: '#ffcf95', sz: 9, bold: true, wrap: cW - 40 });

  mkText(scene, objs, 'CLICK or SPACE to continue', cx, cY + cH / 2 - 20, { col: '#dbe8f5', sz: 10, bold: true });

  scene._addToUI(objs);
  popIn(scene, objs);
  return objs;
}
