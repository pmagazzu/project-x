#!/usr/bin/env node
/**
 * Attrition — PixelLab sprite generator
 * Uses the PixelLab v1 pixflux API with strict prompts + style anchor images.
 *
 * Usage:
 *   node pixellab-generate.mjs                  # generate all
 *   node pixellab-generate.mjs <key>            # generate one
 *   node pixellab-generate.mjs --skip-existing  # skip already-generated
 *   node pixellab-generate.mjs <key> --skip-existing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHASER_DIR = path.resolve(__dirname, '..');
const REPO_DIR  = path.resolve(PHASER_DIR, '..');
const OUT_DIR   = path.resolve(PHASER_DIR, 'public', 'user_art');
const KEY_PATH  = path.resolve(REPO_DIR, '.pixellab_key');
const ENDPOINT  = 'https://api.pixellab.ai/v1/generate-image-pixflux';

// ─── Style anchors ────────────────────────────────────────────────────────────
// These are existing approved sprites we pass as style_image to lock the look.
const ANCHORS = {
  ground:   path.resolve(OUT_DIR, 'infantry.png'),
  naval:    path.resolve(OUT_DIR, 'destroyer_t1.png'),
  building: path.resolve(OUT_DIR, 'barracks.png'),
  terrain:  path.resolve(OUT_DIR, 'grass_tile.png'),
};

function loadAnchor(key) {
  const p = ANCHORS[key];
  if (!fs.existsSync(p)) {
    console.warn(`⚠  Anchor missing: ${p} — generating without style reference`);
    return null;
  }
  return { type: 'base64', base64: fs.readFileSync(p).toString('base64') };
}

// ─── Shared prefix strings ────────────────────────────────────────────────────
const BASE = [
  'isometric top-down pixel art sprite',
  '128x128 pixels',
  'transparent background with no background color',
  'sprite is centered in the canvas',
  'pixel art style with hard edges and limited color palette',
  'muted military color palette: olive drab, steel grey, khaki tan, dark brown',
  'no anti-aliasing, no soft gradients, no photorealism',
  'consistent lighting from top-left',
  'shadow beneath the unit',
].join(', ');

const ERA = '1930s World War 2 era technology, pre-1940 design aesthetic';

const GROUND_BASE = [BASE, ERA,
  'viewed from roughly 45-degree isometric angle looking down',
  'unit fits within a hex tile footprint',
  'infantry wear steel helmets and military uniforms',
].join(', ');

const NAVAL_BASE = [BASE, ERA,
  'warship viewed from above at isometric angle, bow pointing upper-right',
  'hull detail visible from top-down perspective',
  'ocean not visible — transparent background only',
  'ship proportional to a hex tile, not zoomed in',
].join(', ');

const BLDG_BASE = [BASE, ERA,
  'isometric building viewed from above-right at 45 degrees',
  'three visible faces: roof, front wall, right wall',
  'fits within a hex tile footprint',
  'industrial or military architecture',
].join(', ');

const TERRAIN_BASE = [BASE,
  'hex terrain tile viewed exactly from above, flat slab shape',
  'no units or figures on tile',
  'tile fills most of the canvas',
].join(', ');

// ─── Asset definitions ────────────────────────────────────────────────────────
// Each entry: [anchor_key, prompt_string]
const ASSETS = {
  // ── Ground units ─────────────────────────────────────────────────────────
  infantry: ['ground',
    `${GROUND_BASE}, squad of 3 WW2 infantry soldiers with bolt-action rifles, wearing steel pot helmets, olive drab uniforms, one prone one kneeling one standing`],

  recon: ['ground',
    `${GROUND_BASE}, two crouching recon scouts with binoculars and submachine guns, lightweight gear, no heavy weapons, low-profile pose indicating stealth`],

  engineer: ['ground',
    `${GROUND_BASE}, two military combat engineers in WW2 uniforms, one holding wire cutters and one with a shovel, tool belt visible, steel helmets`],

  medic: ['ground',
    `${GROUND_BASE}, two WW2 field medics tending to a wounded soldier, white armband with red cross clearly visible, medic bag, kneeling pose`],

  mortar: ['ground',
    `${GROUND_BASE}, two-man mortar crew with a bipod tube mortar emplaced on the ground, stack of mortar shells beside them, crew in firing position`],

  anti_tank: ['ground',
    `${GROUND_BASE}, three-man anti-tank gun crew with a wheeled 37mm or 47mm anti-tank gun, gunner at breech, loader beside, WW2 towed AT gun`],

  truck: ['ground',
    `${GROUND_BASE}, WW2 military cargo truck with canvas tarp over bed, cab visible from isometric angle, olive drab paint, large rubber tires`],

  tank: ['ground',
    `${GROUND_BASE}, WW2 light tank such as M3 Stuart or T-26, visible turret with short gun barrel, riveted hull, tracks visible on both sides, olive drab`],

  artillery: ['ground',
    `${GROUND_BASE}, WW2 towed field artillery piece such as 105mm howitzer with four-man crew, gun shield visible, large spoked or disc wheels, barrel pointed upper-right`],

  // ── Naval units ────────────────────────────────────────────────────────────
  patrol_boat: ['naval',
    `${NAVAL_BASE}, small 1930s patrol boat or motor torpedo boat, one deck gun at bow, single funnel, torpedo tubes on deck, fast hull shape`],

  destroyer_t1: ['naval',
    `${NAVAL_BASE}, WW2 destroyer with two gun turrets fore and aft, single funnel, mast amidships, torpedo launchers midship, narrow hull`],

  submarine: ['naval',
    `${NAVAL_BASE}, 1930s submarine surfaced showing elongated hull, conning tower visible from above, deck gun forward of conning tower, ballast tanks visible at hull sides`],

  cruiser_light: ['naval',
    `${NAVAL_BASE}, WW2 light cruiser warship, three gun turrets, two funnels, longer hull than destroyer, rangefinder atop bridge, tripod mast`],

  cruiser_heavy: ['naval',
    `${NAVAL_BASE}, WW2 heavy cruiser warship, four gun turrets with large caliber twin guns, two funnels, reinforced bow, heavier wider hull than light cruiser`],

  battleship: ['naval',
    `${NAVAL_BASE}, WW2 battleship, massive warship with four large twin-gun turrets, three funnels, pagoda mast superstructure, broad armored hull, flagship scale`],

  landing_craft: ['naval',
    `${NAVAL_BASE}, WW2 Higgins boat or landing craft with flat bow ramp, shallow draft rectangular hull, open top showing troop benches, small outboard motor stern`],

  // ── Buildings ──────────────────────────────────────────────────────────────
  hq: ['building',
    `${BLDG_BASE}, military headquarters building, two-story brick or stone structure with antenna mast on roof, flag pole, arched entrance, command post look`],

  barracks: ['building',
    `${BLDG_BASE}, military barracks long rectangular single-story building, row of windows, plain concrete or wood construction, double door entrance`],

  vehicle_depot: ['building',
    `${BLDG_BASE}, military vehicle depot or motor pool, large garage with wide rollup doors, corrugated metal roof, fuel drums stacked outside`],

  naval_yard: ['building',
    `${BLDG_BASE}, naval shipyard with dry dock visible, crane arm over empty dock, stone or concrete walls, quayside with bollards and rope`],

  harbor: ['building',
    `${BLDG_BASE}, naval harbor dock facility, wooden or stone pier with bollards, harbormaster shack, crane, coiled rope and anchor on dock`],

  dry_dock: ['building',
    `${BLDG_BASE}, large industrial dry dock with stone walls, metal gangway rails on sides, water gate at one end, structural iron framework`],

  naval_base: ['building',
    `${BLDG_BASE}, naval base command building, two-story stone structure with signal tower on roof, naval pennant flag, radio antenna, stone walls`],

  bunker: ['building',
    `${BLDG_BASE}, WW2 reinforced concrete bunker, thick sloped walls, embrasure gun slit facing front, earth banked against sides, camouflage netting on roof`],

  obs_post: ['building',
    `${BLDG_BASE}, military observation post wooden tower, three-story ladder structure, enclosed crow's nest at top, sandbags at base, telescope visible in crow's nest`],

  mine: ['building',
    `${BLDG_BASE}, 1930s iron ore mine head frame, wooden or steel shaft frame with pulley wheel at top, ore cart track exiting mine entrance, spoil heap beside`],

  oil_pump: ['building',
    `${BLDG_BASE}, 1930s oil pump jack with walking beam arm, engine house beside derrick, small oil storage tank nearby, piping on ground`],

  // ── Terrain tiles ─────────────────────────────────────────────────────────
  grass_tile: ['terrain',
    `${TERRAIN_BASE}, green grass hex tile, flat grassy ground with subtle texture variation, light green and dark green pixel art pattern, hexagonal slab shape`],

  grass_hill: ['terrain',
    `${TERRAIN_BASE}, grassy hill hex tile, elevated mound of earth with grass cover, slight shadow on right side indicating height, hexagonal shape`],

  mountain_tile: ['terrain',
    `${TERRAIN_BASE}, mountain peak hex tile, grey rocky peak with snow cap at top, dark shadow on eastern face, rugged pixel art rock texture`],

  sand_hill: ['terrain',
    `${TERRAIN_BASE}, sandy hill hex tile, tan and ochre earthen mound, arid desert sand texture, subtle shadow on right side, hexagonal slab`],

  water_shallow_tile: ['terrain',
    `${TERRAIN_BASE}, shallow coastal water hex tile, light cyan and pale blue with visible sandy bottom texture beneath water, wave ripple pattern`],

  ocean_deep_tile: ['terrain',
    `${TERRAIN_BASE}, deep ocean hex tile, dark navy blue and dark teal, no visible bottom, subtle wave pattern, deep sea look`],
};

// ─── API ─────────────────────────────────────────────────────────────────────
function readKey() {
  if (process.env.PIXELLAB_KEY) return process.env.PIXELLAB_KEY.trim();
  if (fs.existsSync(KEY_PATH)) return fs.readFileSync(KEY_PATH, 'utf8').trim();
  throw new Error('Missing API key. Set PIXELLAB_KEY or create .pixellab_key in repo root.');
}

async function generateOne(name, anchorKey, description, apiKey) {
  const styleImage = loadAnchor(anchorKey);

  const body = {
    description,
    image_size: { width: 128, height: 128 },
    ...(styleImage ? { style_image: styleImage } : {}),
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${name} failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  const b64 = json.image?.base64;
  if (!b64) throw new Error(`${name}: no image.base64 in response`);

  const outPath = path.resolve(OUT_DIR, `${name}.png`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`✓ ${name}.png [${anchorKey}]`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = readKey();
  const args   = process.argv.slice(2);
  const skip   = args.includes('--skip-existing');
  const only   = args.find(a => !a.startsWith('--'));

  const entries = only
    ? Object.entries(ASSETS).filter(([k]) => k === only)
    : Object.entries(ASSETS);

  if (!entries.length) throw new Error(`Unknown asset key: ${only}`);

  console.log(`Generating ${entries.length} sprite(s)${skip ? ' (skip existing)' : ''}…\n`);

  for (const [name, [anchorKey, description]] of entries) {
    const outPath = path.resolve(OUT_DIR, `${name}.png`);
    if (skip && fs.existsSync(outPath)) {
      console.log(`  skip ${name}.png`);
      continue;
    }
    try {
      await generateOne(name, anchorKey, description, apiKey);
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
