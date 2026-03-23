export const CARD_LIBRARY = [
  { id: 'laser_burst', name: 'Laser Burst', cost: 1, type: 'attack', text: 'Deal 7 damage.', damage: 7 },
  { id: 'barrage', name: 'Barrage', cost: 2, type: 'attack', text: 'Deal 13 damage.', damage: 13 },
  { id: 'brace', name: 'Brace', cost: 1, type: 'skill', text: 'Gain 7 block.', block: 7 },
  { id: 'hard_shields', name: 'Hard Shields', cost: 2, type: 'skill', text: 'Gain 13 block.', block: 13 },
  { id: 'overclock', name: 'Overclock', cost: 0, type: 'skill', text: 'Gain 1 energy. Draw 1.', energy: 1, draw: 1 },
  { id: 'ion_jam', name: 'Ion Jam', cost: 1, type: 'skill', text: 'Apply 1 Weak.', weak: 1 },
  { id: 'target_lock', name: 'Target Lock', cost: 1, type: 'skill', text: 'Apply 1 Vulnerable.', vulnerable: 1 },
  { id: 'salvage', name: 'Salvage', cost: 1, type: 'skill', text: 'Gain 12 scrap.', scrap: 12 },
];

export function makeCard(id) {
  const base = CARD_LIBRARY.find((c) => c.id === id);
  return JSON.parse(JSON.stringify(base));
}

export function starterDeck() {
  return [
    makeCard('laser_burst'),
    makeCard('laser_burst'),
    makeCard('laser_burst'),
    makeCard('laser_burst'),
    makeCard('brace'),
    makeCard('brace'),
    makeCard('brace'),
    makeCard('overclock'),
    makeCard('ion_jam'),
    makeCard('target_lock'),
  ];
}

export function randomCardReward() {
  const pool = ['laser_burst', 'barrage', 'brace', 'hard_shields', 'overclock', 'ion_jam', 'target_lock', 'salvage'];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(makeCard);
}

export function makeRunState() {
  return {
    sector: 1,
    hp: 72,
    maxHp: 72,
    scrap: 50,
    deck: starterDeck(),
    relics: ['Emergency Hull Patch (heal 4 after combat)'],
    map: null,
    currentNodeId: null,
    completed: [],
  };
}
