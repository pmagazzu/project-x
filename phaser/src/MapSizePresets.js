/** Map size tiers for setup screens — includes multi-day campaign scales. */

export const MAP_SIZE_SKIRMISH = [
  { label: 'Compact', size: 40, sub: '40×40 · quick duel' },
  { label: 'Small', size: 50, sub: '50×50 · new baseline' },
  { label: 'Medium', size: 70, sub: '70×70 · standard' },
  { label: 'Large', size: 90, sub: '90×90 · long' },
  { label: 'Huge', size: 120, sub: '120×120 · extended' },
  { label: 'Grand', size: 150, sub: '150×150 · war' },
  { label: 'Epic', size: 180, sub: '180×180 · multi-hour' },
  { label: 'Massive', size: 220, sub: '220×220 · marathon' },
  { label: 'Colossal', size: 280, sub: '280×280 · days' },
  { label: 'World', size: 360, sub: '360×360 · campaign' },
  { label: 'Continental', size: 420, sub: '420×420 · epic scale' },
];

export const MAP_SIZE_ENDLESS = [
  { label: 'Compact', size: 40, sub: '40×40' },
  { label: 'Small', size: 50, sub: '50×50' },
  { label: 'Standard', size: 60, sub: '60×60' },
  { label: 'Wide', size: 75, sub: '75×75' },
  { label: 'Roomy', size: 90, sub: '90×90' },
  { label: 'Large', size: 120, sub: '120×120' },
  { label: 'Grand', size: 150, sub: '150×150' },
  { label: 'Epic', size: 180, sub: '180×180' },
  { label: 'Massive', size: 220, sub: '220×220' },
  { label: 'World', size: 280, sub: '280×280' },
];

export const MAP_SIZE_BUILDER = MAP_SIZE_SKIRMISH.slice(0, 6);
