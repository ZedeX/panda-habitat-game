# -*- coding: utf-8 -*-
"""Panda National Park - asset generator (redrawn from the real tile photo).

Prototype rules decoded from the user's photo (15 tiles = one player's full deck):
  1. Square tile cut along ONE diagonal into two large isosceles right triangles.
     Own terrain (the player's own habitat) owns the TOP + RIGHT full edges;
     the "other" terrain owns the BOTTOM + LEFT full edges.
     (The photo shows bamboo on bottom+left; a tile is rotatable, so drawing
      own-on-top+right is the same physical tile turned 180 degrees.)
  2. Numbers 1..5, three tiles each = 15. For every number the three tiles pair
     the own terrain with each of the OTHER THREE terrains exactly once.
  3. Companion (small animal) icons printed only on number 2 and 3 tiles,
     inside the own-terrain triangle.
  4. Number badge = white diamond (square rotated 45 deg) straddling the
     diagonal seam at the tile centre; digit and outline use the own terrain's
     colour (matches the rulebook: "the number is blue -> belongs to river").

Output: web/assets/*.png  (tile faces, backs, start tile, meeples)
"""
import os
import json
import math
import random
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "web", "assets")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- palette
# Sampled from the real photo (edge-midpoint medians on the brighter rows),
# then lifted slightly to undo the photo's light falloff.
TERRAINS = {
    "bamboo": {"name": "竹林", "animal": "panda", "fill": "#8CBE6B", "dark": "#5B8E47", "light": "#B4D894", "num": "#37631F"},
    "forest": {"name": "森林", "animal": "musk",  "fill": "#D9A85C", "dark": "#A5743A", "light": "#F0CE95", "num": "#7E5118"},
    "alpine": {"name": "高山", "animal": "snow",  "fill": "#9A8FC6", "dark": "#685C9A", "light": "#C8C0E1", "num": "#453C7A"},
    "river":  {"name": "水域", "animal": "otter", "fill": "#5E9BD0", "dark": "#33709F", "light": "#A5CCE9", "num": "#1B4E73"},
}
ANIMALS = {
    "panda": {"name": "大熊猫", "body": "#2E2E2E", "accent": "#FFFFFF"},
    "musk":  {"name": "林麝",   "body": "#9A7448", "accent": "#E2CFA9"},
    "snow":  {"name": "雪豹",   "body": "#C3C7CC", "accent": "#5C646B"},
    "otter": {"name": "欧亚水獭", "body": "#7E5630", "accent": "#D2B183"},
}
# companion species printed on number 2 / 3 tiles
SMALL_SPECIES = ["panda_cub", "deer", "monkey", "wildcat", "takin", "pika"]

TILE = 192          # px tile face (board cell is 86px -> ~2.2x, crisp enough)
START = 384
INK = "#3E3A32"
PAPER = "#F7F3E8"

FONT_CANDIDATES = ["C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc",
                   "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/arialbd.ttf"]


def font(sz):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    ra, rb = hex2rgb(a), hex2rgb(b)
    return "#%02X%02X%02X" % tuple(int(ra[i] + (rb[i] - ra[i]) * t) for i in range(3))


# ---------------------------------------------------------------- geometry helpers

def tri_mask(size, pts):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return m


def paste_layer(img, layer, pts):
    img.paste(layer, (0, 0), tri_mask(img.size, pts))


def centroid(pts):
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


# ---------------------------------------------------------------- terrain motifs
# Each motif paints a pattern layer; the layer is clipped to the triangle after.
# Motifs are drawn in a local frame around the triangle centroid with unit u.

def motif_bamboo(d, cx, cy, u, t, rnd):
    """Pale bamboo culms with nodes + deep-green leaf clusters."""
    for k in range(3):
        x0 = cx + (-0.62 + rnd.uniform(-0.08, 0.08) + k * 0.62) * u * 1.5
        top, bot = cy - 1.25 * u, cy + 1.25 * u
        d.line([(x0, top), (x0 + u * 0.10, bot)], fill=t["light"], width=max(3, int(u * 0.19)))
        for j in range(3):
            yy = top + (j + 0.75) * (bot - top) / 3.4
            d.line([(x0 - u * 0.13, yy), (x0 + u * 0.13, yy)], fill=t["dark"], width=max(2, int(u * 0.08)))
    for k in range(5):
        bx = cx + rnd.uniform(-1.15, 1.15) * u
        by = cy + rnd.uniform(-0.95, 0.95) * u
        base = rnd.uniform(-0.5, 0.5)
        for i in range(4):
            ang = base + i * (math.pi / 7) - math.pi / 5
            ln = u * rnd.uniform(0.42, 0.66)
            d.line([(bx, by), (bx + math.cos(ang) * ln * 1.5, by + math.sin(ang) * ln)],
                   fill=t["dark"], width=max(2, int(u * 0.10)))


def motif_forest(d, cx, cy, u, t, rnd):
    """Orange woodland: radiating white sun-bursts + notched pale leaves."""
    for k in range(3):
        ox = cx + rnd.uniform(-0.95, 0.95) * u
        oy = cy + rnd.uniform(-0.85, 0.85) * u
        for i in range(9):
            ang = i * (2 * math.pi / 9) + rnd.uniform(-0.12, 0.12)
            ln = u * rnd.uniform(0.34, 0.58)
            d.line([(ox, oy), (ox + math.cos(ang) * ln, oy + math.sin(ang) * ln)],
                   fill="#FFF6E2", width=max(2, int(u * 0.09)))
    for k in range(2):
        ox = cx + rnd.uniform(-0.9, 0.9) * u
        oy = cy + rnd.uniform(-0.7, 0.7) * u
        rr = u * rnd.uniform(0.30, 0.44)
        pts = []
        for i in range(14):
            ang = i * (2 * math.pi / 14)
            rr2 = rr * (1.25 if i % 2 == 0 else 0.72)
            pts.append((ox + math.cos(ang) * rr2 * 1.4, oy + math.sin(ang) * rr2))
        d.polygon(pts, fill=t["light"])


def motif_alpine(d, cx, cy, u, t, rnd):
    """Purple alpine: six-point snowflakes + chevron rows + fan dot groups."""
    def flake(x, y, r, w):
        for i in range(6):
            ang = i * math.pi / 3
            d.line([(x, y), (x + math.cos(ang) * r, y + math.sin(ang) * r)], fill="#FFFFFF", width=w)
            for s in (-0.45, 0.45):
                bx, by = x + math.cos(ang) * r * 0.55, y + math.sin(ang) * r * 0.55
                d.line([(bx, by), (bx + math.cos(ang + s) * r * 0.34, by + math.sin(ang + s) * r * 0.34)],
                       fill="#FFFFFF", width=w)
    for k in range(3):
        flake(cx + rnd.uniform(-1.0, 1.0) * u, cy + rnd.uniform(-0.9, 0.9) * u,
              u * rnd.uniform(0.34, 0.50), max(2, int(u * 0.075)))
    for k in range(2):
        y0 = cy + rnd.uniform(-1.0, 1.0) * u
        x0 = cx - u * 1.0
        for i in range(5):
            xx = x0 + i * u * 0.46
            d.polygon([(xx, y0 + u * 0.16), (xx + u * 0.17, y0 - u * 0.10), (xx + u * 0.34, y0 + u * 0.16)],
                      fill="#FFFFFF")
    for k in range(2):
        ox = cx + rnd.uniform(-0.9, 0.9) * u
        oy = cy + rnd.uniform(-0.8, 0.8) * u
        for i in range(5):
            ang = -1.9 + i * 0.42
            rr = u * 0.46
            d.ellipse([ox + math.cos(ang) * rr - u * 0.05, oy + math.sin(ang) * rr - u * 0.05,
                       ox + math.cos(ang) * rr + u * 0.05, oy + math.sin(ang) * rr + u * 0.05],
                      fill="#FFFFFF")


def motif_river(d, cx, cy, u, t, rnd):
    """Blue water: overlapping concentric arc rings woven into a net."""
    for k in range(4):
        ox = cx + rnd.uniform(-0.85, 0.85) * u
        oy = cy + rnd.uniform(-0.8, 0.8) * u
        for rr in (0.30, 0.55, 0.80):
            rr = rr * u * rnd.uniform(0.9, 1.15)
            bb = [ox - rr, oy - rr * 0.78, ox + rr, oy + rr * 0.78]
            a0 = rnd.uniform(0, 360)
            d.arc(bb, a0, a0 + rnd.uniform(150, 240), fill="#F2FBFF", width=max(2, int(u * 0.085)))


MOTIFS = {"bamboo": motif_bamboo, "forest": motif_forest, "alpine": motif_alpine, "river": motif_river}


def tri_cell(img, pts, tkey, seed, density=1.0):
    """Fill triangle pts with the terrain colour + its motif, clipped."""
    t = TERRAINS[tkey]
    cx, cy = centroid(pts)
    span = max(max(p[0] for p in pts) - min(p[0] for p in pts),
               max(p[1] for p in pts) - min(p[1] for p in pts))
    u = span / 4.4 * density
    layer = Image.new("RGB", img.size, t["fill"])
    d = ImageDraw.Draw(layer)
    rnd = random.Random(seed)
    MOTIFS[tkey](d, cx, cy, u, t, rnd)
    paste_layer(img, layer, pts)


# ---------------------------------------------------------------- companion icon

def companion_icon(d, cx, cy, kind, size):
    """Small animal silhouette printed on number 2 / 3 tiles."""
    body = {"panda_cub": "#B4593A", "deer": "#9A6A38", "monkey": "#8E9299",
            "wildcat": "#C79A48", "takin": "#D8C08A", "pika": "#9B8C74"}[kind]
    dark = mix(body, "#241A12", 0.42)
    s = size
    d.ellipse([cx - s * 0.52, cy - s * 0.30, cx + s * 0.30, cy + s * 0.34], fill=body)      # body
    d.ellipse([cx + s * 0.12, cy - s * 0.52, cx + s * 0.56, cy - s * 0.10], fill=body)      # head
    d.polygon([(cx + s * 0.16, cy - s * 0.48), (cx + s * 0.06, cy - s * 0.78),
               (cx + s * 0.30, cy - s * 0.56)], fill=body)                                   # ear
    d.polygon([(cx + s * 0.44, cy - s * 0.50), (cx + s * 0.40, cy - s * 0.82),
               (cx + s * 0.58, cy - s * 0.58)], fill=body)                                   # ear
    for i in (-0.34, -0.10, 0.14):
        d.rectangle([cx + s * i, cy + s * 0.22, cx + s * (i + 0.11), cy + s * 0.42], fill=dark)
    d.ellipse([cx - s * 0.52, cy - s * 0.26, cx - s * 0.36, cy - s * 0.02], fill=dark)      # tail
    d.ellipse([cx + s * 0.40, cy - s * 0.30, cx + s * 0.48, cy - s * 0.22], fill="#1A1A1A")  # eye


# ---------------------------------------------------------------- tiles

def number_diamond(d, W, own, number):
    """White diamond badge straddling the diagonal, digit in own-terrain colour."""
    t = TERRAINS[own]
    r = W * 0.215
    c = W / 2
    d.polygon([(c, c - r), (c + r, c), (c, c + r), (c - r, c)], fill=PAPER, outline=t["fill"])
    d.polygon([(c, c - r * 0.82), (c + r * 0.82, c), (c, c + r * 0.82), (c - r * 0.82, c)],
              outline=t["fill"])
    d.text((c, c - W * 0.012), str(number), font=font(int(W * 0.26)), fill=t["num"], anchor="mm")


def make_tile_face(own, other, number, companion, path):
    """Own terrain = top+right triangle; other terrain = bottom+left triangle."""
    W = TILE
    img = Image.new("RGB", (W, W), PAPER)
    d = ImageDraw.Draw(img)
    m = 3
    own_pts = [(m, m), (W - m, m), (W - m, W - m)]
    oth_pts = [(m, m), (W - m, W - m), (m, W - m)]
    tri_cell(img, own_pts, own, seed=(hash((own, other, number, 1)) & 0xffff))
    tri_cell(img, oth_pts, other, seed=(hash((own, other, number, 2)) & 0xffff))
    d.line([(m, m), (W - m, W - m)], fill=mix(INK, PAPER, 0.45), width=max(2, int(W * 0.018)))
    if companion:
        # photo: the animal sits inside the OWN (bamboo) half, off to one side
        companion_icon(d, W * 0.685, W * 0.275, companion, int(W * 0.20))
    number_diamond(d, W, own, number)
    d.rounded_rectangle([1, 1, W - 2, W - 2], radius=int(W * 0.09),
                        outline=INK, width=max(2, int(W * 0.022)))
    img.save(path, optimize=True)


def make_start_tile(path):
    """Start tile: 4 small isosceles right triangles with apexes at the centre."""
    S = START
    img = Image.new("RGB", (S, S), PAPER)
    d = ImageDraw.Draw(img)
    C = S / 2
    m = 4
    tris = {"bamboo": [(m, m), (S - m, m), (C, C)],
            "alpine": [(S - m, m), (S - m, S - m), (C, C)],
            "forest": [(m, S - m), (S - m, S - m), (C, C)],
            "river":  [(m, m), (C, C), (m, S - m)]}
    sd = 7
    for k in ("bamboo", "alpine", "forest", "river"):
        tri_cell(img, tris[k], k, seed=sd, density=0.72)
        sd += 13
    for px, py in [(m, m), (S - m, m), (S - m, S - m), (m, S - m)]:
        d.line([(px, py), (C, C)], fill=mix(INK, PAPER, 0.35), width=max(2, int(S * 0.011)))
    r = S * 0.118
    d.polygon([(C, C - r), (C + r, C), (C, C + r), (C - r, C)], fill=PAPER, outline=INK)
    d.text((C, C - S * 0.006), "始", font=font(int(S * 0.115)), fill=INK, anchor="mm")
    d.rounded_rectangle([1, 1, S - 2, S - 2], radius=int(S * 0.05),
                        outline=INK, width=max(3, int(S * 0.018)))
    img.save(path, optimize=True)


def make_tile_back(own, path):
    W = TILE
    t = TERRAINS[own]
    img = Image.new("RGB", (W, W), t["dark"])
    d = ImageDraw.Draw(img)
    step = int(W * 0.16)
    for i in range(-W, W, step):
        d.line([(i, W), (i + W, 0)], fill=t["fill"], width=int(W * 0.055))
    r = W * 0.30
    c = W / 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=PAPER, outline=t["dark"], width=max(2, int(W * 0.02)))
    an = ANIMALS[t["animal"]]
    d.ellipse([c - r * 0.62, c - r * 0.48, c + r * 0.62, c + r * 0.78], fill=an["body"])
    d.ellipse([c - r * 0.44, c - r * 0.82, c + r * 0.44, c - r * 0.05], fill=an["body"])
    d.polygon([(c - r * 0.46, c - r * 0.74), (c - r * 0.30, c - r * 1.12), (c - r * 0.08, c - r * 0.80)], fill=an["body"])
    d.polygon([(c + r * 0.46, c - r * 0.74), (c + r * 0.30, c - r * 1.12), (c + r * 0.08, c - r * 0.80)], fill=an["body"])
    d.ellipse([c - r * 0.26, c - r * 0.36, c - r * 0.06, c - r * 0.16], fill="#FFFFFF")
    d.ellipse([c + r * 0.06, c - r * 0.36, c + r * 0.26, c - r * 0.16], fill="#FFFFFF")
    d.ellipse([c - r * 0.21, c - r * 0.31, c - r * 0.11, c - r * 0.21], fill="#1A1A1A")
    d.ellipse([c + r * 0.11, c - r * 0.31, c + r * 0.21, c - r * 0.21], fill="#1A1A1A")
    d.ellipse([c - r * 0.12, c + r * 0.16, c + r * 0.12, c + r * 0.42], fill=an["accent"])
    d.rounded_rectangle([1, 1, W - 2, W - 2], radius=int(W * 0.09),
                        outline="#2C2822", width=max(2, int(W * 0.022)))
    img.save(path, optimize=True)


# ---------------------------------------------------------------- meeples

def make_meeple(animal_key, terrain_key, path, size=128):
    """Animal meeple: terrain-coloured round base + animal head silhouette."""
    an = ANIMALS[animal_key]
    t = TERRAINS[terrain_key]
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size / 2
    d.ellipse([c - size * 0.46, c - size * 0.46, c + size * 0.46, c + size * 0.46],
              fill=t["fill"], outline=t["dark"], width=max(2, int(size * 0.035)))
    r = size * 0.33
    d.ellipse([c - r, c - r * 0.86, c + r, c + r * 1.02], fill=an["body"])          # head
    d.polygon([(c - r * 0.92, c - r * 0.72), (c - r * 0.74, c - r * 1.46), (c - r * 0.16, c - r * 0.92)], fill=an["body"])
    d.polygon([(c + r * 0.92, c - r * 0.72), (c + r * 0.74, c - r * 1.46), (c + r * 0.16, c - r * 0.92)], fill=an["body"])
    if animal_key == "panda":
        d.ellipse([c - r * 0.72, c - r * 0.34, c - r * 0.18, c + r * 0.24], fill="#141414")
        d.ellipse([c + r * 0.18, c - r * 0.34, c + r * 0.72, c + r * 0.24], fill="#141414")
    elif animal_key == "snow":
        for i in range(6):
            yy = c - r * 0.6 + i * r * 0.26
            d.line([(c - r * 0.78, yy), (c + r * 0.78, yy - r * 0.06)],
                   fill=an["accent"], width=max(1, int(size * 0.018)))
    d.ellipse([c - r * 0.52, c - r * 0.10, c - r * 0.14, c + r * 0.28], fill=an["accent"])
    d.ellipse([c + r * 0.14, c - r * 0.10, c + r * 0.52, c + r * 0.28], fill=an["accent"])
    d.ellipse([c - r * 0.40, c + r * 0.02, c - r * 0.20, c + r * 0.22], fill="#1A1A1A")
    d.ellipse([c + r * 0.20, c + r * 0.02, c + r * 0.40, c + r * 0.22], fill="#1A1A1A")
    d.ellipse([c - r * 0.14, c + r * 0.42, c + r * 0.14, c + r * 0.66], fill="#2A2A2A")
    img.save(path, optimize=True)


# ---------------------------------------------------------------- deck composition

def build_manifest():
    """15 tiles per player:
       numbers 1..5 x3, and for every number the own terrain is paired with
       each of the other three terrains exactly once (photo rule).
       Companion icons only on number 2 and 3."""
    keys = ["bamboo", "forest", "alpine", "river"]
    manifest = {"terrains": {}, "animals": {}, "players": {}, "startTile": "start.png", "tile": TILE}
    for k, v in TERRAINS.items():
        manifest["terrains"][k] = {"name": v["name"], "fill": v["fill"], "dark": v["dark"],
                                   "light": v["light"], "num": v["num"], "animal": v["animal"]}
    for k, v in ANIMALS.items():
        manifest["animals"][k] = {"name": v["name"], "body": v["body"]}

    rng = random.Random(2026)
    for pi, own in enumerate(keys):
        others = [k for k in keys if k != own]
        tiles = []
        idx = 0
        for n in range(1, 6):
            comps = rng.sample(SMALL_SPECIES, 3) if n in (2, 3) else [None] * 3
            order = others[:]
            rng.shuffle(order)
            for j, oth in enumerate(order):
                tiles.append({
                    "id": f"t{pi}_{idx:02d}", "player": pi, "number": n,
                    "own": own, "other": oth, "companion": comps[j],
                    "face": f"tile_{own}_{oth}_{n}.png",
                })
                idx += 1
        manifest["players"][own] = {"index": pi, "tiles": tiles}
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    return manifest


def main():
    manifest = build_manifest()
    made = 0
    for own, pdata in manifest["players"].items():
        for t in pdata["tiles"]:
            make_tile_face(t["own"], t["other"], t["number"], t["companion"],
                           os.path.join(OUT, t["face"]))
            made += 1
        make_tile_back(own, os.path.join(OUT, f"back_{own}.png"))
    make_start_tile(os.path.join(OUT, "start.png"))
    for tk, tv in TERRAINS.items():
        make_meeple(tv["animal"], tk, os.path.join(OUT, f"meeple_{tv['animal']}.png"))
    print(f"generated {made} tile faces + 4 backs + start + 4 meeples -> {OUT}")


if __name__ == "__main__":
    main()
