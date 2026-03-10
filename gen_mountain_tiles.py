"""
gen_mountain_tiles.py  v6 -- RGBA with transparent background.

Technique:
  - Background is fully transparent so unclipped peak sprites don't bleed
    over neighbouring hex terrain when rendered in the overflow layer.
  - Mountain BODY drawn with sun/shadow faces, organic edge perturbation.
  - Snow caps on taller peaks.
  - Rocky base footprint fill beneath each peak for a grounded look.
  - Dithered edge scatter stays within each peak's horizontal bounds.
  - No full-tile base noise -- the terrainGfx hex fill provides the floor.

Cell size: 4px (64x64 grid).
"""

import random, os
from PIL import Image, ImageDraw

W, H   = 256, 256
CELL   = 4
COLS   = W // CELL   # 64
ROWS   = H // CELL   # 64
OUT_DIR = "phaser/public/user_art"

# All palette entries are RGBA (alpha=255)
def rgb(r, g, b): return (r, g, b, 255)

P_BASE   = [rgb(60,55,48), rgb(70,65,58), rgb(78,73,65), rgb(56,52,46),
            rgb(75,70,62), rgb(65,60,53), rgb(82,76,68)]
P_SHADOW = [rgb(42,42,52), rgb(52,52,62), rgb(60,60,70), rgb(44,45,54),
            rgb(56,56,66), rgb(46,47,57), rgb(38,40,50)]
P_MID    = [rgb(80,76,70), rgb(94,90,83), rgb(88,84,76), rgb(76,72,66),
            rgb(98,93,86), rgb(84,80,73), rgb(92,88,80)]
P_SUN    = [rgb(108,103,94), rgb(126,120,110), rgb(118,113,104), rgb(104,100,91),
            rgb(132,126,116), rgb(114,108,100), rgb(122,117,107)]
P_SNOW   = [rgb(198,200,210), rgb(215,217,225), rgb(205,208,216), rgb(190,193,203),
            rgb(222,224,232), rgb(208,210,220), rgb(195,198,208)]
P_SNOW_S = [rgb(162,165,178), rgb(180,183,196), rgb(170,173,186), rgb(155,158,172),
            rgb(185,188,200), rgb(168,171,184), rgb(175,178,190)]
P_PEAK   = [rgb(132,127,118), rgb(146,141,132), rgb(138,133,124), rgb(128,123,115),
            rgb(150,144,135)]

def fill_cell(draw, cx, cy, color):
    x0, y0 = cx * CELL, cy * CELL
    draw.rectangle([x0, y0, x0 + CELL - 1, y0 + CELL - 1], fill=color)

def pick(rng, palette):
    return rng.choice(palette)

def draw_tile(variant: int) -> Image.Image:
    rng = random.Random(variant * 6271 + 998244353)
    # Transparent RGBA background -- no base fill
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Peak configurations (cell coords 0-63):
    # (apex_cx, apex_cy, base_lx, base_rx, base_cy, has_snow)
    configs = [
        [(32, 7,  14, 50, 48, True)],
        [(20, 9,  4,  36, 48, True),  (44, 8,  28, 62, 49, True)],
        [(14, 12, 2,  27, 49, False), (33, 6,  16, 50, 47, True), (52, 11, 37, 62, 49, False)],
        [(24, 8,  6,  43, 48, True),  (46, 9,  30, 62, 50, True)],
        [(20, 9,  2,  40, 49, True),  (48, 7,  34, 62, 47, True)],
        [(14, 11, 1,  26, 49, False), (32, 8,  18, 46, 48, True), (50, 11, 36, 62, 49, False)],
        [(30, 5,  8,  54, 47, True)],
        [(26, 8,  8,  44, 47, True),  (40, 7,  22, 58, 46, True)],
        [(38, 5,  16, 58, 47, True),  (18, 12, 2,  32, 50, False)],
        [(10, 12, 1,  20, 50, False), (24, 7,  10, 38, 48, True),
         (40, 6,  26, 54, 47, True),  (54, 11, 42, 63, 50, False)],
    ]
    peaks = configs[variant % len(configs)]

    # ── Rocky base footprint beneath each peak (drawn first, behind peaks) ──
    for (ax, ay, blx, brx, by, snow) in peaks:
        # Fill a few rows of base-rock texture at the foot of each peak
        for cy in range(by - 2, min(by + 6, ROWS)):
            t_base = (cy - (by - 2)) / 7.0
            lx = blx + int(t_base * 3)   # taper slightly inward
            rx = brx - int(t_base * 3)
            for cx in range(max(0, lx), min(COLS, rx + 1)):
                fill_cell(draw, cx, cy, pick(rng, P_BASE))

    # ── Draw peaks back-to-front (highest apex_cy = furthest back) ──────────
    for (ax, ay, blx, brx, by, snow) in sorted(peaks, key=lambda p: p[1], reverse=True):
        height = by - ay
        if height <= 0: continue
        snow_rows = int(height * 0.32) if snow else 0

        for cy in range(ay, by + 1):
            t = (cy - ay) / height   # 0=apex, 1=base
            lx = ax + t * (blx - ax)
            rx = ax + t * (brx - ax)
            edge_noise = 1.5 * (1 - t * 0.5)
            lxi = max(0, int(lx + rng.uniform(-edge_noise, edge_noise * 0.3)))
            rxi = min(COLS - 1, int(rx + rng.uniform(-edge_noise * 0.3, edge_noise)))

            for cx in range(lxi, rxi + 1):
                in_snow = (cy - ay) < snow_rows
                if in_snow:
                    c = pick(rng, P_SNOW if cx <= ax else P_SNOW_S)
                elif cy - ay < 3:
                    c = pick(rng, P_PEAK)
                elif cx < ax - 1:
                    fade = t
                    c = pick(rng, P_SUN if fade < 0.45 else P_MID)
                elif cx > ax + 1:
                    c = pick(rng, P_SHADOW)
                else:
                    c = pick(rng, P_MID)
                fill_cell(draw, cx, cy, c)

        # ── Dithered edge scatter (constrained to peak horizontal range) ───
        for cy in range(ay + 2, by):
            t = (cy - ay) / height
            lx = ax + t * (blx - ax)
            rx = ax + t * (brx - ax)
            for _ in range(2):
                scatter_cx = int(lx) - rng.randint(1, 2)
                if blx - 2 <= scatter_cx < COLS:
                    c = pick(rng, P_MID if t < 0.5 else P_BASE)
                    fill_cell(draw, scatter_cx, cy, c)
                scatter_cx = int(rx) + rng.randint(1, 2)
                if 0 <= scatter_cx <= brx + 2:
                    fill_cell(draw, scatter_cx, cy, pick(rng, P_SHADOW if t > 0.3 else P_BASE))

        # ── Rock detail flecks -- constrained to within peak bounds ─────────
        for _ in range(rng.randint(8, 16)):
            cx = rng.randint(blx, brx)
            cy = rng.randint(ay + 2, by - 1)
            fill_cell(draw, cx, cy, pick(rng, P_MID if rng.random() < 0.6 else P_SHADOW))

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for i in range(1, 11):
        tile = draw_tile(i - 1)
        path = os.path.join(OUT_DIR, f"mountain_tile_{i:02d}.png")
        tile.save(path)
        print(f"  {path}")
    print("Done.")

if __name__ == "__main__":
    main()
