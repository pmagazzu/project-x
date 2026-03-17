import {
  createGameState,
  computeSupply,
  resolveTurn,
  queueRecruit,
  registerDesign,
  resolveImmediateAttack,
  BUILDING_TYPES,
  UNIT_TYPES,
  createBuilding,
  roadAt,
  buildingAt,
} from './src/GameState.js';
import { planAITurn } from './src/AIPlayer.js';

function makeTerrain(ms, t = 0) {
  const out = {};
  for (let q = 0; q < ms; q++) for (let r = 0; r < ms; r++) out[`${q},${r}`] = t;
  return out;
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) / 4294967296);
  };
}

function runSupplyChecks() {
  const ms = 25;
  const gs = createGameState('default');
  gs._mapSize = ms;
  gs._terrain = makeTerrain(ms, 0);
  // Reset buildings to controlled setup
  gs.buildings = [];
  gs.units = [];
  gs.buildings.push(createBuilding('HQ', 1, 5, 5));
  gs.buildings.push(createBuilding('ROAD', 1, 6, 5));
  gs.buildings.push(createBuilding('ROAD', 1, 7, 5));
  gs.buildings.push(createBuilding('ROAD', 1, 8, 5));
  gs.buildings.push(createBuilding('ROAD', 1, 9, 5));
  // gap then road should not continue
  gs.buildings.push(createBuilding('ROAD', 1, 11, 5));

  const s = computeSupply(gs, 1, ms);
  const checks = [
    ['HQ source', '5,5'],
    ['Road near source', '7,5'],
    ['Road tail before gap', '9,5'],
    ['Gap hex', '10,5'],
    ['Road after gap', '11,5'],
  ];
  return checks.map(([name, k]) => ({ name, key: k, supplied: s.has(k) }));
}

function applyAction(gs, action) {
  const p = gs.currentPlayer;
  if (action.type === 'recruit') {
    queueRecruit(gs, p, action.unitType, action.buildingId);
    return;
  }
  if (action.type === 'design') {
    registerDesign(gs, p, action.chassis, action.modules, action.name);
    return;
  }
  if (action.type === 'build') {
    const u = gs.units.find(x => x.id === action.unitId);
    if (!u || u.owner !== p) return;
    const bt = action.buildingType;
    const cost = BUILDING_TYPES[bt]?.buildCost || {};
    const pl = gs.players[p];
    if ((pl.iron||0) < (cost.iron||0) || (pl.oil||0) < (cost.oil||0) || (pl.wood||0) < (cost.wood||0) || (pl.components||0) < (cost.components||0)) return;
    const onRoad = !!roadAt(gs, u.q, u.r);
    const hasNonRoadBuilding = !!(buildingAt(gs, u.q, u.r) && !onRoad);
    if (bt !== 'ROAD' && hasNonRoadBuilding) return;
    if (bt === 'ROAD' && onRoad) return;
    pl.iron = (pl.iron||0) - (cost.iron||0);
    pl.oil = (pl.oil||0) - (cost.oil||0);
    pl.wood = (pl.wood||0) - (cost.wood||0);
    pl.components = (pl.components||0) - (cost.components||0);
    const b = createBuilding(bt, p, u.q, u.r);
    const turns = BUILDING_TYPES[bt]?.buildTurns || 0;
    if (turns > 0 && bt !== 'ROAD') {
      b.underConstruction = true;
      b.buildProgress = 0;
      b.buildTurnsRequired = turns;
      u.constructing = b.id;
    }
    gs.buildings.push(b);
    u.moved = true;
    u.building = true;
    return;
  }
  if (action.type === 'move') {
    const u = gs.units.find(x => x.id === action.unitId);
    if (!u) return;
    u.q = action.toQ; u.r = action.toR;
    u.moved = true;
    u.movesLeft = 0;
    return;
  }
  if (action.type === 'attack') {
    resolveImmediateAttack(gs, action.attackerId, action.targetId, false);
    return;
  }
  if (action.type === 'digin') {
    const u = gs.units.find(x => x.id === action.unitId);
    if (u && UNIT_TYPES[u.type]?.canDigIn) u.dugIn = true;
  }
}

function aiAudit(seedVal = 12345, rounds = 20) {
  const rand = seeded(seedVal);
  const prevRand = Math.random;
  Math.random = rand;

  try {
    const ms = 25;
    const gs = createGameState('default');
    gs._mapSize = ms;
    gs._terrain = makeTerrain(ms, 0);
    // Add extra resources for economy behavior
    for (const [q, r, t] of [[11,11,'IRON'], [12,11,'OIL'], [10,12,'IRON'], [13,10,'OIL']]) gs.resourceHexes[`${q},${r}`] = { type: t };

    const turnRows = [];
    while (gs.turn <= rounds) {
      if (gs.currentPlayer === 2) {
        const actions = planAITurn(gs, gs._terrain, ms, 'balanced');
        const counts = actions.reduce((a, x) => (a[x.type] = (a[x.type]||0)+1, a), {});
        for (const a of actions) applyAction(gs, a);
        const bOwn = gs.buildings.filter(b => b.owner === 2 && !b.underConstruction);
        const roads = bOwn.filter(b => b.type === 'ROAD').length;
        const econ = bOwn.filter(b => ['MINE','OIL_PUMP','FARM','LUMBER_CAMP','SCIENCE_LAB','FACTORY'].includes(b.type)).length;
        const military = bOwn.filter(b => ['BARRACKS','AIRFIELD','HARBOR','VEHICLE_DEPOT','ADV_BARRACKS','ARMOR_WORKS','ADV_AIRFIELD','NAVAL_DOCKYARD'].includes(b.type)).length;
        const unsup = gs.units.filter(u => u.owner === 2 && !u.embarked && (u.outOfSupply||0) > 0).length;
        turnRows.push({
          round: gs.turn,
          actions: counts,
          roads, econ, military,
          units: gs.units.filter(u => u.owner===2 && !u.embarked).length,
          unsup,
          res: { iron: gs.players[2].iron, oil: gs.players[2].oil, wood: gs.players[2].wood, food: gs.players[2].food, comp: gs.players[2].components },
        });
      }
      resolveTurn(gs, gs._terrain);
    }

    return turnRows;
  } finally {
    Math.random = prevRand;
  }
}

const supply = runSupplyChecks();
console.log('SUPPLY_CHECKS');
for (const row of supply) console.log(JSON.stringify(row));

for (const seed of [101, 202, 303]) {
  const rows = aiAudit(seed, 20);
  console.log(`AI_AUDIT seed=${seed}`);
  for (const r of rows) console.log(JSON.stringify(r));
}
