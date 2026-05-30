/** Static codex copy — expand with more tabs later. */

export const CODEX_TABS = [
  { id: 'combat', label: 'COMBAT', icon: '⚔' },
  { id: 'population', label: 'POPULATION', icon: '👥' },
  { id: 'supply', label: 'SUPPLY', icon: '📦' },
  { id: 'designer', label: 'DESIGNER', icon: '🔧' },
  { id: 'fog', label: 'INTEL', icon: '👁' },
];

export const CODEX_PAGES = {
  combat: [
    { title: 'What is Hit Quality?', body: 'Every attack rolls a Hit Quality score from 0–100. Start at 50, then add/subtract modifiers (accuracy, cover, pierce, supply, blind fire, etc.). A random ±15 roll is applied at the end. Higher score = more damage.' },
    { title: 'Damage Formula', body: 'Tier bands:\n• 0–19 Catastrophic — 0 damage\n• 20–39 Repelled — 0 damage\n• 40–59 Neutral — half damage\n• 60–79 Effective — full damage\n• 80+ Overwhelming — full damage\n\nDamage = (Attack × Pierce ratio) − Defense − Fort DR. Pierce below enemy armor reduces the ratio.' },
    { title: 'Soft vs Hard Attack', body: 'Most units have soft_attack (infantry) and hard_attack (armor). vs armored targets (armor > 2), hard_attack is used. Naval units use naval_attack ×0.6 vs land. Fighters strafing ground halve attack.' },
    { title: 'Fortifications', body: 'Foxholes, trenches, and forts add cover (−hit quality) and sometimes extra DR. Artillery and air get bonus cover against light forts. Breach modules and siege shells reduce enemy fort bonuses.' },
    { title: 'Retaliation', body: 'Defenders strike back if: not blind/indirect, in range, has LOS, not suppressed, and submarine rules allow. Retaliation uses the same hit-quality system.' },
    { title: 'Reading the Combat Card', body: 'Center number = expected damage to defender. Blue/red portraits show HP after the trade. THE MATH lists hit quality, pierce, defense, and roll band. Modifiers list every bonus/penalty applied.' },
  ],
  population: [
    { title: 'Manpower pool', body: 'Shown as available/cap (e.g. 2/10). The number is free manpower — your opening units already count against the cap. "full" means every slot is fielded; capture towns or build housing to grow.' },
    { title: 'VTC base cap', body: 'Village +5, Town +10, City +15 (scaled in setup). Home capital = village +5 HQ bonus (10 at default scale). Capture neutral settlements to add more cap.' },
    { title: 'VTC housing upgrades', body: 'Housing Development (+1, villages). Suburbs (+2, towns & cities). Urban Housing (+4, cities only). Built from the VTC UPGRADE tab; one of each per settlement.' },
    { title: 'Logistics, not a hard cap', body: 'Population is not meant to stop large armies — food, iron, oil, supply, and production queues are the real limits. Scale population up or down in skirmish/endless setup.' },
    { title: 'Unit costs', body: 'Infantry/support ≈1 pop. Tanks/artillery ≈2–3. Destroyers ≈5. Battleships ≈10. Check the recruit panel — each row shows 👥 cost.' },
  ],
  supply: [
    { title: 'Supply Network', body: 'Units need a road path to HQ (or depot on that network). Out of supply: −1 move & attack per turn, stacking to −2. Supply trucks/ships extend range.' },
    { title: 'Disabling Supply', body: 'Skirmish setup can turn Supply OFF — units fight at full strength without network penalties.' },
  ],
  designer: [
    { title: 'Unit Designer', body: 'Start with 5 custom design slots. Research the Industrial design-slot chain (Prototype Workshop → Final Design Hegemony) to unlock up to 30 slots — each step costs more RP. Pick a chassis, bolt on modules, pay registration cost, then train from the matching building.' },
    { title: 'Modules', body: 'Modules change stats and may conflict (e.g. mobility vs siege plating). Industry tier caps design tier. AI opponents also field custom designs mid-game.' },
  ],
  fog: [
    { title: 'Intel Levels', body: 'BLIND — coordinates only. SPOTTED — type unknown. PARTIAL — tier estimate. CONFIRMED — full stats, terrain mods, retaliation preview.' },
    { title: 'Improving Intel', body: 'Direct LOS, recon/obs aircraft within 4 hexes, or prior contact on the hex raises intel. Attack orders without scouting stay low-intel (wider outcomes).' },
  ],
};
