/** Map size tiers for setup screens — includes multi-day campaign scales. */

export const MAP_SIZE_SKIRMISH = [
  { label: 'Tiny', size: 20, sub: '20×20 · duel' },
  { label: 'Small', size: 25, sub: '25×25 · quick' },
  { label: 'Medium', size: 40, sub: '40×40 · standard' },
  { label: 'Large', size: 60, sub: '60×60 · long' },
  { label: 'Huge', size: 90, sub: '90×90 · extended' },
  { label: 'Grand', size: 120, sub: '120×120 · war' },
  { label: 'Epic', size: 150, sub: '150×150 · multi-hour' },
  { label: 'Massive', size: 180, sub: '180×180 · marathon' },
  { label: 'Colossal', size: 220, sub: '220×220 · days' },
  { label: 'World', size: 280, sub: '280×280 · campaign' },
  { label: 'Continental', size: 360, sub: '360×360 · epic scale' },
];

export const MAP_SIZE_ENDLESS = [
  { label: 'Compact', size: 20, sub: '20×20' },
  { label: 'Skirmish', size: 25, sub: '25×25' },
  { label: 'Standard', size: 30, sub: '30×30' },
  { label: 'Wide', size: 35, sub: '35×35' },
  { label: 'Roomy', size: 40, sub: '40×40' },
  { label: 'Large', size: 60, sub: '60×60' },
  { label: 'Grand', size: 90, sub: '90×90' },
  { label: 'Epic', size: 120, sub: '120×120' },
  { label: 'Massive', size: 150, sub: '150×150' },
  { label: 'World', size: 200, sub: '200×200' },
];

export const MAP_SIZE_BUILDER = MAP_SIZE_SKIRMISH.slice(0, 6);
