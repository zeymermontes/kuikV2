#!/usr/bin/env python3
"""Brand assets a menu import can bundle, drawn from the section palette.

  backdrop  soft full-page background (blurred colour blobs + fine grain), portrait 1080x1920
  icon      flat transparent PNG for a category tab: leaf | cup | bean | bowl

  python3 brand_assets.py backdrop --base '#dfe4c2' --blobs '#eef2dc,#c9d4ad' --out images/bg-matcha.jpg
  python3 brand_assets.py icon leaf --color '#2d5a27' --accent '#eef2dc' --out images/icon-matcha.png
"""
import argparse, math, random
from PIL import Image, ImageDraw, ImageFilter


def hex_rgb(h: str):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


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
    # A whisper of grain so flat areas do not band on OLED screens.
    noise = Image.effect_noise((w, h), 18).convert('L')
    grain = Image.merge('RGB', (noise, noise, noise))
    img = Image.blend(img, grain, 0.035)
    img.save(out, quality=82, optimize=True, progressive=True)


def _canvas(s=512, ss=4):
    return Image.new('RGBA', (s * ss, s * ss), (0, 0, 0, 0)), s * ss


def _finish(img, out, ss=4):
    img.resize((img.width // ss, img.height // ss), Image.LANCZOS).save(out, optimize=True)


def leaf(color, accent, out):
    img, S = _canvas(); d = ImageDraw.Draw(img)
    c, a = hex_rgb(color), hex_rgb(accent)
    # Leaf outline: two mirrored quadratic arcs, tilted.
    pts = []
    n = 120
    for i in range(n + 1):
        t = i / n
        pts.append((t, math.sin(math.pi * t) * 0.34))
    for i in range(n, -1, -1):
        t = i / n
        pts.append((t, -math.sin(math.pi * t) * 0.34))
    ang = math.radians(-38)
    def tf(p):
        x, y = (p[0] - 0.5) * 0.86, p[1] * 0.86
        return (S * (0.5 + x * math.cos(ang) - y * math.sin(ang)), S * (0.5 + x * math.sin(ang) + y * math.cos(ang)))
    d.polygon([tf(p) for p in pts], fill=c + (255,))
    # Midrib and veins in the accent.
    d.line([tf((0.04, 0)), tf((0.96, 0))], fill=a + (255,), width=S // 60)
    for t in (0.3, 0.5, 0.7):
        for sgn in (1, -1):
            d.line([tf((t, 0)), tf((t + 0.14, sgn * math.sin(math.pi * (t + 0.14)) * 0.24))], fill=a + (200,), width=S // 90)
    _finish(img, out)


def cup(color, accent, out):
    img, S = _canvas(); d = ImageDraw.Draw(img)
    c, a = hex_rgb(color), hex_rgb(accent)
    u = S / 100
    # Body: a rounded trapezoid, drawn as rounded rect + tapered polygon.
    d.rounded_rectangle([22 * u, 40 * u, 70 * u, 82 * u], radius=int(10 * u), fill=c + (255,))
    # Handle: ring on the right.
    d.ellipse([62 * u, 46 * u, 86 * u, 72 * u], fill=c + (255,))
    d.ellipse([68 * u, 51 * u, 80 * u, 66 * u], fill=(0, 0, 0, 0))
    # Saucer.
    d.ellipse([14 * u, 80 * u, 78 * u, 92 * u], fill=c + (255,))
    # Steam: three soft curves in the accent.
    for x0 in (34, 46, 58):
        pts = [(x0 * u + math.sin(t / 5) * 3 * u, (34 - t * 1.2) * u) for t in range(0, 17)]
        d.line(pts, fill=a + (255,), width=int(3.2 * u), joint='curve')
    _finish(img, out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    b = sub.add_parser('backdrop'); b.add_argument('--base', required=True); b.add_argument('--blobs', required=True); b.add_argument('--out', required=True); b.add_argument('--seed', type=int, default=7)
    i = sub.add_parser('icon'); i.add_argument('shape', choices=['leaf', 'cup']); i.add_argument('--color', required=True); i.add_argument('--accent', required=True); i.add_argument('--out', required=True)
    a = ap.parse_args()
    if a.cmd == 'backdrop':
        backdrop(a.base, a.blobs.split(','), a.out, seed=a.seed)
    else:
        {'leaf': leaf, 'cup': cup}[a.shape](a.color, a.accent, a.out)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
