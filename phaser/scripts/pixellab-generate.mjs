#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), '..');
const REPO = path.resolve(ROOT, '..');
const OUT_DIR = path.resolve(ROOT, 'public', 'user_art');
const BEARER_PATH = path.resolve(REPO, '.pixellab_bearer');

const ENDPOINT = 'https://api.pixellab.ai/creator/images';

const COMMON = {
  model: 'pixflux',
  width: 128,
  height: 128,
  no_background: true,
  spritesheet_data: null,
};

const ASSETS = {
  recon: 'isometric pixel 1935 military recon scout squad, gritty tactical style, transparent background, centered sprite',
  medic: 'isometric pixel 1935 military field medic squad with red cross armband, gritty tactical style, transparent background, centered sprite',
  mortar: 'isometric pixel 1935 mortar team with tube and shells, gritty tactical style, transparent background, centered sprite',
  anti_tank: 'isometric pixel 1935 anti tank gun crew, gritty tactical style, transparent background, centered sprite',
  tank: 'isometric pixel 1935 light tank, gritty tactical style, transparent background, centered sprite',
  artillery: 'isometric pixel 1935 towed artillery piece, gritty tactical style, transparent background, centered sprite',
  landing_craft: 'isometric pixel ww2 landing craft boat, gritty tactical style, transparent background, centered sprite',
  cruiser_heavy: 'isometric pixel ww2 heavy cruiser ship, gritty tactical style, transparent background, centered sprite',
  battleship: 'isometric pixel ww2 battleship, gritty tactical style, transparent background, centered sprite',
  harbor: 'isometric pixel naval harbor building with dock details, gritty tactical style, transparent background, centered sprite',
  dry_dock: 'isometric pixel dry dock industrial building, gritty tactical style, transparent background, centered sprite',
  naval_base: 'isometric pixel naval base command building, gritty tactical style, transparent background, centered sprite',
  bunker: 'isometric pixel ww2 bunker fortification, gritty tactical style, transparent background, centered sprite',
  obs_post: 'isometric pixel observation post tower, gritty tactical style, transparent background, centered sprite',
  mine: 'isometric pixel iron mine industrial extractor, gritty tactical style, transparent background, centered sprite',
  oil_pump: 'isometric pixel oil pump industrial rig, gritty tactical style, transparent background, centered sprite',
  sand_tile: 'isometric pixel hex sand terrain tile, top-down isometric slab, transparent background, centered',
  forest_tile: 'isometric pixel hex forest terrain tile, top-down isometric slab, transparent background, centered',
};

function readBearer() {
  if (process.env.PIXELLAB_BEARER) return process.env.PIXELLAB_BEARER.trim();
  if (fs.existsSync(BEARER_PATH)) return fs.readFileSync(BEARER_PATH, 'utf8').trim();
  throw new Error('Missing bearer token. Set PIXELLAB_BEARER or create .pixellab_bearer');
}

async function generateOne(name, prompt, bearer) {
  const id = `${Date.now()}-${name}`;
  const body = {
    id,
    prompt,
    ...COMMON,
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${bearer}`,
      'origin': 'https://www.pixellab.ai',
      'referer': 'https://www.pixellab.ai/',
      'accept': '*/*',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${name} failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  if (!json.image_data) throw new Error(`${name} response missing image_data`);

  const outPath = path.resolve(OUT_DIR, `${name}.png`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(json.image_data, 'base64'));
  console.log(`wrote ${path.relative(REPO, outPath)}`);
}

async function main() {
  const bearer = readBearer();
  const only = process.argv[2];
  const entries = only ? Object.entries(ASSETS).filter(([k]) => k === only) : Object.entries(ASSETS);
  if (!entries.length) throw new Error(`Unknown asset key: ${only}`);

  for (const [name, prompt] of entries) {
    await generateOne(name, prompt, bearer);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
