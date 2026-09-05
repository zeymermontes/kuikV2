#!/usr/bin/env python3
"""Brand assets a menu import can bundle, drawn from the section palette.

  pattern   full-page backdrop: the base colour with brand motifs scattered at low opacity
            (leaf, bowl, bean, cup, steam) — what makes a section feel alive without
            fighting the cards. Portrait 1440x2560.
  backdrop  soft blurred colour blobs only (no motifs)
  icon      flat transparent PNG for a category tab: leaf | cup | bean | bowl

  python3 brand_assets.py pattern  --base '#dfe4c2' --ink '#2d5a27' --motifs leaf,bowl --out images/bg-matcha.jpg
  python3 brand_assets.py icon leaf --color '#2d5a27' --accent '#eef2dc' --out images/icon-matcha.png
"""
import argparse, math, random
from PIL import Image, ImageDraw, ImageFilter


def hex_rgb(h: str):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ── motifs: each returns an RGBA sprite of side `s`, drawn 4x and downsampled ──

def _sprite(s, draw_fn, *colors, ss=4):
    S = s * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(img), S, *colors)
    return img.resize((s, s), Image.LANCZOS)


def _leaf(d, S, c, a):
    n = 120
    pts = [(i / n, math.sin(math.pi * i / n) * 0.34) for i in range(n + 1)]
    pts += [(i / n, -math.sin(math.pi * i / n) * 0.34) for i in range(n, -1, -1)]
    ang = math.radians(-38)
    def tf(p):
        x, y = (p[0] - 0.5) * 0.86, p[1] * 0.86
        return (S * (0.5 + x * math.cos(ang) - y * math.sin(ang)), S * (0.5 + x * math.sin(ang) + y * math.cos(ang)))
    d.polygon([tf(p) for p in pts], fill=c + (255,))
    d.line([tf((0.04, 0)), tf((0.96, 0))], fill=a + (255,), width=max(1, S // 60))
    for t in (0.3, 0.5, 0.7):
        for sgn in (1, -1):
            d.line([tf((t, 0)), tf((t + 0.14, sgn * math.sin(math.pi * (t + 0.14)) * 0.24))], fill=a + (200,), width=max(1, S // 90))


def _cup(d, S, c, a):
    u = S / 100
    d.rounded_rectangle([22 * u, 40 * u, 70 * u, 82 * u], radius=int(10 * u), fill=c + (255,))
    d.ellipse([62 * u, 46 * u, 86 * u, 72 * u], fill=c + (255,))
    d.ellipse([68 * u, 51 * u, 80 * u, 66 * u], fill=(0, 0, 0, 0))
    d.ellipse([14 * u, 80 * u, 78 * u, 92 * u], fill=c + (255,))
    for x0 in (34, 46, 58):
        pts = [(x0 * u + math.sin(t / 5) * 3 * u, (34 - t * 1.2) * u) for t in range(0, 17)]
        d.line(pts, fill=a + (255,), width=int(3.2 * u), joint='curve')


def _bean(d, S, c, a):
    u = S / 100
    d.ellipse([22 * u, 12 * u, 78 * u, 88 * u], fill=c + (255,))
    # The crease: a gentle S down the middle, cut out.
    pts = [(50 * u + math.sin((t / 40) * math.pi * 2) * 7 * u, (16 + t * 1.7) * u) for t in range(0, 41)]
    d.line(pts, fill=(0, 0, 0, 0), width=int(5 * u), joint='curve')


def _bowl(d, S, c, a):
    u = S / 100
    # Chawan: a wide half-ellipse with a foot, whisk handle rising from it.
    d.pieslice([12 * u, 30 * u, 88 * u, 96 * u], 0, 180, fill=c + (255,))
    d.rectangle([12 * u, 63 * u, 88 * u, 66 * u], fill=c + (255,))
    d.rounded_rectangle([36 * u, 90 * u, 64 * u, 97 * u], radius=int(3 * u), fill=c + (255,))
    d.ellipse([16 * u, 56 * u, 84 * u, 70 * u], fill=a + (255,))  # the matcha surface
    d.rounded_rectangle([56 * u, 6 * u, 62 * u, 60 * u], radius=int(3 * u), fill=c + (255,))  # chasen handle
    for k in range(-3, 4):
        d.line([(59 * u, 30 * u), ((59 + k * 4) * u, 58 * u)], fill=c + (255,), width=int(1.6 * u))


def _steam(d, S, c, a):
    u = S / 100
    for x0 in (30, 50, 70):
        pts = [(x0 * u + math.sin(t / 6) * 6 * u, (90 - t * 3.2) * u) for t in range(0, 25)]
        d.line(pts, fill=c + (255,), width=int(4 * u), joint='curve')


MOTIFS = {'leaf': _leaf, 'cup': _cup, 'bean': _bean, 'bowl': _bowl, 'steam': _steam}


def sprite(name, size, color, accent):
    return _sprite(size, MOTIFS[name], hex_rgb(color), hex_rgb(accent))


# ── outputs ────────────────────────────────────────────────────────────────

def pattern(base, ink, motifs, out, size=(1440, 2560), cell=230, opacity=0.13, seed=3):
    """Base colour + motifs on a staggered grid, each jittered and rotated,
    at low alpha so cards and text stay legible on top."""
    rnd = random.Random(seed)
    w, h = size
    img = Image.new('RGBA', (w, h), hex_rgb(base) + (255,))
    names = motifs
    cols, rows = w // cell + 2, h // cell + 2
    i = 0
    for r in range(rows):
        for c in range(cols):
            name = rnd.choice(names); i += 1
            sz = rnd.randint(int(cell * 0.32), int(cell * 0.5))
            sp = sprite(name, sz, ink, base).rotate(rnd.uniform(-40, 40), resample=Image.BICUBIC, expand=True)
            alpha = sp.getchannel('A').point(lambda v: int(v * opacity * rnd.uniform(0.75, 1.0)))
            sp.putalpha(alpha)
            x = int(c * cell + (cell / 2 if r % 2 else 0) + rnd.randint(-cell // 6, cell // 6) - sp.width / 2)
            y = int(r * cell + rnd.randint(-cell // 6, cell // 6) - sp.height / 2)
            img.alpha_composite(sp, (max(-sp.width + 1, min(x, w - 1)), max(-sp.height + 1, min(y, h - 1))))
    img.convert('RGB').save(out, quality=85, optimize=True, progressive=True)


def backdrop(base, blobs, out, size=(1080, 1920), seed=7):
    rnd = random.Random(seed)
    w, h = size
    img = Image.new('RGB', (w // 4, h // 4), hex_rgb(base))
    d = ImageDraw.Draw(img, 'RGBA')
    cols = [hex_rgb(c) for c in blobs]
    for i in range(14):
        c = cols[i % len(cols)]
        r = rnd.randint(60, 150)
        x, y = rnd.randint(-r, img.width + r), rnd.randint(-r, img.height + r)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (rnd.randint(90, 160),))
    img = img.filter(ImageFilter.GaussianBlur(28)).resize((w, h), Image.LANCZOS)
    noise = Image.effect_noise((w, h), 18).convert('L')
    img = Image.blend(img, Image.merge('RGB', (noise, noise, noise)), 0.035)
    img.save(out, quality=82, optimize=True, progressive=True)


def icon(shape, color, accent, out, size=512):
    sprite(shape, size, color, accent).save(out, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('pattern'); p.add_argument('--base', required=True); p.add_argument('--ink', required=True)
    p.add_argument('--motifs', required=True, help='comma list of ' + ','.join(MOTIFS)); p.add_argument('--out', required=True)
    p.add_argument('--opacity', type=float, default=0.13); p.add_argument('--cell', type=int, default=230); p.add_argument('--seed', type=int, default=3)
    b = sub.add_parser('backdrop'); b.add_argument('--base', required=True); b.add_argument('--blobs', required=True); b.add_argument('--out', required=True); b.add_argument('--seed', type=int, default=7)
    i = sub.add_parser('icon'); i.add_argument('shape', choices=list(MOTIFS)); i.add_argument('--color', required=True); i.add_argument('--accent', required=True); i.add_argument('--out', required=True)
    a = ap.parse_args()
    if a.cmd == 'pattern':
        pattern(a.base, a.ink, a.motifs.split(','), a.out, cell=a.cell, opacity=a.opacity, seed=a.seed)
    elif a.cmd == 'backdrop':
        backdrop(a.base, a.blobs.split(','), a.out, seed=a.seed)
    else:
        icon(a.shape, a.color, a.accent, a.out)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
