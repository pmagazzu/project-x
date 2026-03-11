"""
gen_hill_tiles.py  -- 10 hill tile variants for terrain type 3.

Style:
  - Rolling contours, brownish-green palette
  - Subtle elevation bumps with soft shadowing (no sharp mountain peaks)
  - Organic rounded ridgelines, grainy texture
  - Transparent RGBA background (art layer over terrainGfx base fill)
  - 256x256 px, 4px cell grid

Cell size: 4px (64x64 grid).
"""

import random, os, math
from PIL import Image, ImageDraw, ImageFilter

W, H    = 256, 256
CELL    = 4
COLS    = W // CELL   # 64
ROWS    = H // CELL   # 64
OUT_DIR = "phaser/public/user_art"

def rgb(r, g, b, a=255): return (r, g, b, a)

# Brownish-green hill palette — warmer, lighter, more earthen
P_BASE    = [rgb(112,118,74), rgb(106,112,68), rgb(118,124,78), rgb(102,108,66), rgb(114,120,72)]
P_MID     = [rgb(132,130,86), rgb(124,122,80), rgb(138,136,90), rgb(128,126,83), rgb(134,132,88)]
P_LIGHT   = [rgb(158,150,102),rgb(150,143,96), rgb(164,156,108),rgb(154,147,100),rgb(160,153,104)]
P_SHADOW  = [rgb(80,86,52),   rgb(74,80,48),   rgb(86,92,56),   rgb(78,84,50),   rgb(82,88,54)]
P_CREST   = [rgb(178,168,116),rgb(170,161,110),rgb(184,174,122),rgb(174,165,113),rgb(180,171,118)]
P_DARK    = [rgb(68,74,44),   rgb(62,68,40),   rgb(74,80,48),   rgb(66,72,42),   rgb(70,76,46)]

def fill_cell(draw, cx, cy, color):
    x0, y0 = cx * CELL, cy * CELL
    draw.rectangle([x0, y0, x0 + CELL - 1, y0 + CELL - 1], fill=color)

def pick(rng, palette):
    return rng.choice(palette)

def draw_hill_tile(variant: int) -> Image.Image:
    rng = random.Random(variant * 3571 + 123456789)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Each variant has 1-3 rolling hill humps
    # Format: (center_cx, center_cy, radius_x, radius_y, has_crest)
    configs = [
        # v0: single central hump
        [(32, 28, 22, 14, True)],
        # v1: two side humps
        [(18, 30, 16, 10, True), (46, 28, 17, 11, True)],
        # v2: one tall central with shadow sweep
        [(32, 24, 26, 16, True)],
        # v3: ridge running left-right
        [(16, 30, 13, 9, True), (32, 26, 18, 13, True), (48, 30, 13, 9, True)],
        # v4: off-center large hump
        [(38, 26, 24, 15, True)],
        # v5: two overlapping humps
        [(24, 28, 20, 12, True), (40, 30, 18, 11, False)],
        # v6: wide shallow hill
        [(32, 32, 28, 10, True)],
        # v7: three small bumps
        [(14, 32, 12, 8, False), (32, 26, 16, 12, True), (50, 32, 12, 8, False)],
        # v8: right-leaning hump
        [(40, 25, 22, 14, True)],
        # v9: double ridge
        [(20, 24, 18, 12, True), (44, 26, 20, 13, True)],
    ]

    humps = configs[variant % len(configs)]

    for (cx, cy, rx, ry, has_crest) in humps:
        crest_thresh = 0.35   # top fraction = bright crest
        shadow_side  = 0.55   # cx fraction where shadow starts

        for row in range(ROWS):
            for col in range(COLS):
                # Ellipse distance (0=center, 1=edge)
                dx = (col - cx) / rx
                dy = (row - cy) / ry
                dist = math.sqrt(dx*dx + dy*dy)

                if dist > 1.0:
                    continue

                # Vertical height ratio: 0=bottom of ellipse,1=top
                # cy-ry is top, cy+ry is bottom
                vert_t = (cy - row) / ry if ry > 0 else 0  # positive = upper half

                # Skip lower rim (dist > 0.9 and not top) — makes it look like a hill not a full ellipse
                if dist > 0.88 and vert_t < 0.1:
                    if rng.random() > 0.3:
                        continue

                # Determine color region
                if has_crest and vert_t > crest_thresh and dist < 0.55:
                    # Crest (brightest)
                    c = pick(rng, P_CREST)
                elif vert_t > 0.1 and dist < 0.65:
                    if col > cx + shadow_side * rx * 0.4:
                        # Sun-facing right side — lighter
                        c = pick(rng, P_LIGHT if vert_t > 0.3 else P_MID)
                    else:
                        c = pick(rng, P_MID)
                elif dist < 0.85:
                    # Lower slopes
                    if col < cx - rx * 0.3:
                        c = pick(rng, P_SHADOW)
                    elif col > cx + rx * 0.1:
                        c = pick(rng, P_BASE)
                    else:
                        c = pick(rng, P_MID if rng.random() < 0.5 else P_BASE)
                else:
                    # Rim / edge scatter
                    c = pick(rng, P_DARK if rng.random() < 0.4 else P_BASE)

                # Grain noise: occasionally flip shade
                if rng.random() < 0.12:
                    c = pick(rng, P_SHADOW if rng.random() < 0.5 else P_MID)

                fill_cell(draw, col, row, c)

        # Shadow cast to bottom-right of hump
        shadow_rows = int(ry * 0.35)
        for row in range(cy, cy + ry + shadow_rows):
            for col in range(cx, cx + rx + 4):
                sdx = (col - cx - 2) / (rx * 0.85)
                sdy = (row - cy - 2) / (ry * 0.85)
                if math.sqrt(sdx*sdx + sdy*sdy) > 1.0:
                    continue
                # Only where the base tile is transparent (don't draw on top of existing hump)
                px_val = img.getpixel((col * CELL, row * CELL))
                if px_val[3] == 0 and row > cy + ry * 0.5:
                    if rng.random() < 0.45:
                        fill_cell(draw, col, row, (*P_DARK[0][:3], 140))  # semi-transparent shadow

    # Dithered texture scatter across the whole tile (gives grassy grain)
    for _ in range(rng.randint(80, 140)):
        col = rng.randint(4, COLS - 5)
        row = rng.randint(4, ROWS - 5)
        px_val = img.getpixel((col * CELL, row * CELL))
        if px_val[3] > 0:
            c = pick(rng, P_BASE if rng.random() < 0.5 else P_SHADOW)
            fill_cell(draw, col, row, c)

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for i in range(1, 11):
        tile = draw_hill_tile(i - 1)
        path = os.path.join(OUT_DIR, f"hill_tile_{i:02d}.png")
        tile.save(path)
        print(f"  Saved {path}")
    print("Done — 10 hill tiles generated.")

if __name__ == "__main__":
    main()
