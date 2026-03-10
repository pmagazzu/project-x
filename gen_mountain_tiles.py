"""
gen_mountain_tiles.py  v3 — mountain_tile_01.png .. _10.png
256x256 RGB, 1935 military wargame aesthetic.

Key improvements over v2:
  - Shadow face lightened (not near-black) + 2-tone gradient
  - Organic slopes: 5-point polygons with mid-slope wobble
  - Snow caps: larger, slightly irregular edges
  - Better base: foothills/slope fades into rocky floor
  - Capped peak aspect ratio (no church-spire peaks)
"""

import math, random, os
from PIL import Image, ImageDraw, ImageFilter

W, H = 256, 256
OUT_DIR = "phaser/public/user_art"

# ── Palette ─────────────────────────────────────────────────────────────────
BASE_BG      = ( 92,  85,  72)   # rocky floor
ROCK_MID     = (112, 104,  90)   # mid-tone rock
ROCK_LIGHT   = (152, 144, 128)   # sun-facing slope
ROCK_LIGHTER = (172, 165, 148)   # upper highlight strip
SHADOW_OUTER = ( 78,  70,  58)   # shadow face outer (lighter than v2)
SHADOW_INNER = ( 94,  86,  72)   # shadow face inner (ambient bounce)
STRATA_LT    = (165, 158, 142)   # light strata (sun face alternating)
STRATA_DK    = ( 96,  89,  76)   # dark strata (sun face)
STRATA_SHAD  = ( 68,  62,  52)   # strata on shadow face
SNOW         = (222, 223, 232)   # snow
SNOW_SHADE   = (175, 178, 192)   # snow shadow side
SNOW_EDGE    = (200, 203, 215)   # snow irregular edge
RUBBLE       = ( 80,  73,  62)
SCREE        = (102,  95,  82)
CAST_SHADOW  = ( 58,  52,  42)   # ellipse at peak base


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))


def draw_mountain_tile(variant_idx):
    rng = random.Random(variant_idx * 7919 + 12345)

    img = Image.new('RGB', (W, H), BASE_BG)
    draw = ImageDraw.Draw(img)

    # ── 1. Base texture ──────────────────────────────────────────────────────
    for _ in range(2500):
        px = rng.randint(0, W-1)
        py = rng.randint(0, H-1)
        y_darken = 0.14 * (1.0 - py / H)
        jitter = rng.randint(-16, 16)
        c = tuple(clamp(ROCK_MID[i] * (1.0 - y_darken) + jitter) for i in range(3))
        sz = rng.choice([1, 1, 2])
        draw.point((px, py), fill=c)
        if sz == 2:
            draw.point((min(px+1, W-1), py), fill=c)

    # ── 2. Peak configs ──────────────────────────────────────────────────────
    # (cx_frac, base_y_frac, half_width, peak_height, snow_frac)
    # half_width capped to 0.6*peak_height (no spires)
    def mk(cxf, byf, hw, ph, sf):
        hw = min(hw, int(ph * 0.62))   # cap aspect ratio
        return (cxf, byf, hw, ph, sf)

    peak_defs = [
        [mk(0.50, 0.83, 78, 148, 0.44)],
        [mk(0.34, 0.85, 60, 112, 0.30), mk(0.66, 0.80, 66, 132, 0.38)],
        [mk(0.22, 0.87, 48,  88, 0.18), mk(0.52, 0.78, 72, 142, 0.44), mk(0.78, 0.85, 50, 94, 0.22)],
        [mk(0.40, 0.83, 62, 122, 0.34), mk(0.63, 0.80, 56, 108, 0.28)],
        [mk(0.32, 0.86, 78,  94, 0.16), mk(0.68, 0.79, 56, 132, 0.44)],
        [mk(0.22, 0.85, 46,  86, 0.12), mk(0.50, 0.82, 54, 104, 0.26), mk(0.78, 0.85, 46, 84, 0.12)],
        [mk(0.40, 0.80, 80, 144, 0.40)],
        [mk(0.43, 0.82, 68, 124, 0.32), mk(0.59, 0.80, 64, 116, 0.28)],
        [mk(0.28, 0.88, 52,  74, 0.08), mk(0.62, 0.77, 76, 150, 0.48)],
        [mk(0.18, 0.88, 40,  72, 0.0),  mk(0.38, 0.83, 55, 108, 0.22),
         mk(0.60, 0.80, 60, 122, 0.30), mk(0.80, 0.85, 42,  80, 0.06)],
    ]
    peaks = peak_defs[variant_idx % len(peak_defs)]

    # ── 3. Cast shadows ──────────────────────────────────────────────────────
    for (cxf, byf, hw, ph, sf) in sorted(peaks, key=lambda p: p[1], reverse=True):
        cx  = int(cxf * W)
        by  = int(byf * H)
        sx  = cx + int(hw * 0.45)
        ew  = int(hw * 1.3)
        eh  = int(hw * 0.26)
        draw.ellipse([sx - ew, by - eh, sx + ew, by + eh], fill=CAST_SHADOW)

    # ── 4. Foothills base: soft blended mound beneath each peak ─────────────
    for (cxf, byf, hw, ph, sf) in sorted(peaks, key=lambda p: p[1]):
        cx = int(cxf * W)
        by = int(byf * H)
        # Wide gentle mound at base (blends peak into floor)
        hill_pts = [
            (cx - int(hw * 1.5), by + 8),
            (cx - int(hw * 0.8), by - int(ph * 0.14)),
            (cx,                 by - int(ph * 0.18)),
            (cx + int(hw * 0.8), by - int(ph * 0.12)),
            (cx + int(hw * 1.5), by + 8),
        ]
        draw.polygon(hill_pts, fill=ROCK_MID)

    # ── 5. Draw peaks back-to-front ──────────────────────────────────────────
    for (cxf, byf, hw, ph, sf) in sorted(peaks, key=lambda p: p[1]):
        cx     = int(cxf * W)
        by     = int(byf * H)
        apex_x = cx + rng.randint(-int(hw * 0.15), int(hw * 0.15))
        apex_y = (by - ph) + rng.randint(-int(ph * 0.04), int(ph * 0.04))

        # Organic slope wobble (mid-slope point displaced inward/outward)
        sun_mid_t  = rng.uniform(0.40, 0.60)
        sun_mid_y  = int(apex_y + sun_mid_t * (by - apex_y))
        sun_mid_x  = int(apex_x + sun_mid_t * (cx - hw - apex_x))
        sun_mid_x += rng.randint(-int(hw * 0.12), int(hw * 0.12))  # wobble

        shad_mid_t = rng.uniform(0.40, 0.60)
        shad_mid_y = int(apex_y + shad_mid_t * (by - apex_y))
        shad_mid_x = int(apex_x + shad_mid_t * (cx + hw - apex_x))
        shad_mid_x += rng.randint(-int(hw * 0.10), int(hw * 0.10))

        left_base  = (cx - hw, by)
        right_base = (cx + hw, by)
        base_ctr   = (cx, by)

        # Shadow face — outer dark band
        shad_outer = [
            (apex_x, apex_y),
            (shad_mid_x + int(hw * 0.18), shad_mid_y),
            right_base,
            base_ctr,
        ]
        draw.polygon(shad_outer, fill=SHADOW_OUTER)
        # Shadow face — inner slightly lighter ambient strip
        shad_inner = [
            (apex_x, apex_y),
            (shad_mid_x - int(hw * 0.05), shad_mid_y),
            (cx + hw//3, by),
            base_ctr,
        ]
        draw.polygon(shad_inner, fill=SHADOW_INNER)

        # Sun face — 5-point organic polygon
        sun_pts = [
            (apex_x,   apex_y),
            (sun_mid_x, sun_mid_y),
            left_base,
            base_ctr,
        ]
        draw.polygon(sun_pts, fill=ROCK_LIGHT)

        # Strata on sun face
        n_strata = rng.randint(4, 7)
        for si in range(1, n_strata + 1):
            t   = si / (n_strata + 1)
            # Vary spacing: tighter near top (more elevation lines at altitude)
            tt  = t * t  # quadratic spacing
            sy  = int(apex_y + tt * (by - apex_y))
            slx = int(sun_mid_x + (tt - sun_mid_t) / (1.0 - sun_mid_t + 0.001) * (cx - hw - sun_mid_x)) if tt > sun_mid_t else int(apex_x + tt/sun_mid_t * (sun_mid_x - apex_x))
            srx = int(apex_x + tt * (cx - apex_x))
            sc  = STRATA_LT if si % 2 == 0 else STRATA_DK
            draw.line([(min(slx,srx), sy), (max(slx,srx), sy)], fill=sc, width=1)

        # Strata on shadow face
        for si in range(1, n_strata + 1):
            t   = si / (n_strata + 1)
            tt  = t * t
            sy  = int(apex_y + tt * (by - apex_y))
            slx = int(apex_x + tt * (cx - apex_x))
            srx = int(shad_mid_x + (tt - shad_mid_t) / (1.0 - shad_mid_t + 0.001) * (cx + hw - shad_mid_x)) if tt > shad_mid_t else int(apex_x + tt/shad_mid_t * (shad_mid_x - apex_x))
            draw.line([(min(slx,srx), sy), (max(slx,srx), sy)], fill=STRATA_SHAD, width=1)

        # Ridge edges
        draw.line([(apex_x, apex_y), left_base],  fill=CAST_SHADOW, width=1)
        draw.line([(apex_x, apex_y), right_base], fill=CAST_SHADOW, width=2)

        # Snow cap — bigger, irregular, extends onto shadow side slightly
        if sf > 0:
            snow_h = int(ph * sf)
            # Jagged snow line: add a few mid-points
            snow_l  = (apex_x - int(hw * sf * 0.68), apex_y + snow_h)
            snow_r  = (apex_x + int(hw * sf * 0.28), apex_y + snow_h)
            snow_m  = (apex_x - int(hw * sf * 0.18) + rng.randint(-6, 6),
                       apex_y + int(snow_h * rng.uniform(0.55, 0.75)))
            snow_pts = [
                (apex_x, apex_y),
                snow_m,
                snow_l,
                snow_r,
            ]
            draw.polygon(snow_pts, fill=SNOW)
            # Shadow snow sliver (right of apex, darker)
            snow_shd = [
                (apex_x, apex_y),
                (apex_x + int(hw * sf * 0.28), apex_y + snow_h),
                (apex_x + int(hw * sf * 0.10), apex_y + snow_h),
            ]
            draw.polygon(snow_shd, fill=SNOW_SHADE)
            # Tiny irregular edge dots along snow boundary
            for ei in range(rng.randint(3, 6)):
                t = ei / 5.0
                ex = int(snow_l[0] + t * (snow_r[0] - snow_l[0])) + rng.randint(-4, 4)
                ey = int(snow_l[1] + t * (snow_r[1] - snow_l[1])) + rng.randint(-3, 3)
                draw.ellipse([ex-2, ey-1, ex+2, ey+1], fill=SNOW_EDGE)

        # Upper highlight strip (just below apex)
        strip_h = int(ph * 0.18)
        slx = int(apex_x + 0.18 * (cx - hw - apex_x))
        srx = int(apex_x + 0.18 * (cx - apex_x))
        draw.polygon([
            (apex_x, apex_y + 1),
            (slx,    apex_y + strip_h),
            (srx,    apex_y + strip_h),
        ], fill=ROCK_LIGHTER)

    # ── 6. Foreground rubble ─────────────────────────────────────────────────
    for _ in range(rng.randint(10, 18)):
        rx = rng.randint(16, W - 16)
        ry = rng.randint(int(H * 0.74), H - 8)
        rs = rng.randint(2, 5)
        c  = rng.choice([RUBBLE, SCREE, ROCK_MID])
        draw.ellipse([rx - rs, ry - rs//2, rx + rs, ry + rs//2], fill=c)

    # ── 7. Light blur to smooth stipple ─────────────────────────────────────
    img = img.filter(ImageFilter.GaussianBlur(radius=0.45))

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for i in range(1, 11):
        tile = draw_mountain_tile(i - 1)
        out_path = os.path.join(OUT_DIR, f"mountain_tile_{i:02d}.png")
        tile.save(out_path)
        print(f"  Saved {out_path}")
    print("Done.")


if __name__ == "__main__":
    main()
