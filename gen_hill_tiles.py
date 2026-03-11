"""
gen_hill_tiles.py  v3 -- Same technique as gen_mountain_tiles.py.

Scan-line approach, 4px cells, transparent RGBA overlay.
Low wide humps (height:width ~1:3) vs tall narrow mountain peaks.
Warm olive-brown palette reads as grassy earthen hills.
Same light source (upper-left), sun/shadow faces, base footprint, dithered scatter.
"""

import random, os
from PIL import Image, ImageDraw

W, H    = 256, 256
CELL    = 4
COLS    = W // CELL   # 64
ROWS    = H // CELL   # 64
OUT_DIR = "phaser/public/user_art"

def rgb(r, g, b): return (r, g, b, 255)

# Warm olive-brown palette — grassy earthen hills, NOT forest green, NOT rocky grey
P_BASE   = [rgb(106,114,60), rgb(114,122,66), rgb(100,108,56), rgb(110,118,62), rgb(118,126,70)]
P_SHADOW = [rgb(72, 80, 38),  rgb(68, 76, 34),  rgb(76, 84, 42),  rgb(80, 88, 44),  rgb(66, 74, 32)]
P_MID    = [rgb(130,128,72),  rgb(136,134,78),  rgb(124,122,68),  rgb(142,140,84),  rgb(128,126,70)]
P_SUN    = [rgb(160,152,90),  rgb(168,160,98),  rgb(152,144,84),  rgb(172,164,102), rgb(156,148,88)]
P_CREST  = [rgb(188,178,110), rgb(196,186,118), rgb(180,170,104), rgb(200,190,122), rgb(184,174,108)]
P_DARK   = [rgb(58, 64, 32),  rgb(54, 60, 28),  rgb(62, 68, 36),  rgb(56, 62, 30)]

def fill_cell(draw, cx, cy, color):
    x0, y0 = cx * CELL, cy * CELL
    draw.rectangle([x0, y0, x0+CELL-1, y0+CELL-1], fill=color)

def pick(rng, palette):
    return rng.choice(palette)

def draw_tile(variant: int) -> Image.Image:
    rng = random.Random(variant * 5381 + 271828182)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Hump configs: (apex_cx, apex_cy, base_lx, base_rx, base_cy)
    # Low and wide -- height 12-18 cells, width 28-48 cells (~1:3 ratio like real hills)
    # base_cy kept in lower 2/3 of tile so humps sit on the ground
    configs = [
        [(32, 20, 10, 54, 36)],                                          # 0: single central
        [(18, 24,  3, 34, 38), (46, 22, 30, 60, 37)],                  # 1: two side humps
        [(32, 17,  6, 58, 36)],                                          # 2: wide single
        [(16, 26,  2, 28, 38), (32, 20, 18, 46, 36), (50, 26, 36, 62, 38)],  # 3: ridge
        [(24, 21,  4, 46, 36)],                                          # 4: left-lean
        [(40, 22, 18, 60, 37)],                                          # 5: right-lean
        [(26, 21,  6, 44, 36), (44, 23, 32, 58, 37)],                  # 6: close pair
        [(32, 16, 12, 52, 36)],                                          # 7: tall central
        [(32, 23,  8, 56, 37)],                                          # 8: shallow wide
        [(20, 20,  3, 38, 36), (46, 22, 32, 62, 37)],                  # 9: wide double
    ]
    peaks = configs[variant % len(configs)]

    # ── Base footprint beneath each hump (drawn first, behind) ─────────────
    for (ax, ay, blx, brx, by) in peaks:
        for cy in range(by - 1, min(by + 4, ROWS)):
            t_base = (cy - (by - 1)) / 4.0
            lx = blx + int(t_base * 4)
            rx = brx - int(t_base * 4)
            for cx in range(max(0, lx), min(COLS, rx + 1)):
                fill_cell(draw, cx, cy, pick(rng, P_BASE))

    # ── Draw humps back-to-front (highest apex_cy drawn last = front) ──────
    for (ax, ay, blx, brx, by) in sorted(peaks, key=lambda p: p[1], reverse=True):
        height = by - ay
        if height <= 0:
            continue

        for cy in range(ay, by + 1):
            t = (cy - ay) / height       # 0=apex, 1=base
            lx = ax + t * (blx - ax)
            rx = ax + t * (brx - ax)

            # Organic edge noise — smaller than mountains (hills are smoother)
            edge_noise = 1.2 * (1 - t * 0.4)
            lxi = max(0, int(lx + rng.uniform(-edge_noise, edge_noise * 0.2)))
            rxi = min(COLS - 1, int(rx + rng.uniform(-edge_noise * 0.2, edge_noise)))

            for cx in range(lxi, rxi + 1):
                # Crest: top ~30% and near apex center
                in_crest = (cy - ay) < int(height * 0.30) and (lxi + rxi) // 2 - 3 < cx < (lxi + rxi) // 2 + 3
                if in_crest:
                    c = pick(rng, P_CREST)
                elif cy - ay < 4:
                    # Near apex
                    c = pick(rng, P_SUN if cx >= ax else P_MID)
                elif cx < ax - 1:
                    # Sun-facing side (upper-left light source) — right of apex is shadow
                    fade = t
                    c = pick(rng, P_SUN if fade < 0.5 else P_MID)
                elif cx > ax + 1:
                    # Shadow side
                    c = pick(rng, P_SHADOW if t > 0.4 else P_MID)
                else:
                    c = pick(rng, P_MID)

                fill_cell(draw, cx, cy, c)

        # ── Dithered edge scatter (within hump horizontal bounds) ───────────
        for cy in range(ay + 3, by):
            t = (cy - ay) / height
            lx = ax + t * (blx - ax)
            rx = ax + t * (brx - ax)
            for _ in range(2):
                scatter_cx = int(lx) - rng.randint(1, 2)
                if blx - 2 <= scatter_cx < COLS:
                    fill_cell(draw, scatter_cx, cy, pick(rng, P_MID if t < 0.5 else P_BASE))
                scatter_cx = int(rx) + rng.randint(1, 2)
                if 0 <= scatter_cx <= brx + 2:
                    fill_cell(draw, scatter_cx, cy, pick(rng, P_SHADOW if t > 0.4 else P_BASE))

        # ── Grass texture flecks across the hump ───────────────────────────
        for _ in range(rng.randint(6, 12)):
            cx = rng.randint(blx, brx)
            cy = rng.randint(ay + 3, by - 1)
            fill_cell(draw, cx, cy, pick(rng, P_MID if rng.random() < 0.6 else P_SUN))

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for i in range(1, 11):
        tile = draw_tile(i - 1)
        path = os.path.join(OUT_DIR, f"hill_tile_{i:02d}.png")
        tile.save(path)
        print(f"  {path}")
    print("Done.")

if __name__ == "__main__":
    main()
