# Art Pipeline (Safe Branch)

This pipeline is intentionally **offline-only** and does **not** affect runtime rendering until explicitly wired.

## Folders

- `public/user_art_raw/` → drop source PNGs here (from PixelLab/manual)
- `public/user_art_clean/` → normalized outputs (generated)

## Normalize step

From `phaser/`:

```bash
npm i -D sharp
node scripts/normalize-user-art.mjs
```

What it does:
- keys out near-white backgrounds
- trims empty space
- fits each sprite to `128x128` transparent canvas
- saves optimized PNG to `user_art_clean`

## Runtime wiring policy

Do **not** wire these assets directly on `main` until:
1. visual QA pass completed (no artifacts)
2. fallback mapping prepared for missing files
3. feature flag added (default off)

## Next safe milestones

1. Generate/clean assets only (this step)
2. Add manifest mapping file only (no rendering changes)
3. Enable unit/building overrides behind flag
4. Enable terrain overrides behind separate flag
