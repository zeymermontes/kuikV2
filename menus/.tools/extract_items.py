#!/usr/bin/env python3
"""
Cut dishes and drinks out of photos for a Kuik menu.

    .venv/bin/python extract_items.py photo.jpg --out ../<business>/images --names "Latte,Croissant"

One photo may hold one item (--mode single) or a spread of several (--mode
multi, the default): the background is removed with rembg, the remaining
alpha is split into connected blobs, each blob becomes its own crop, and each
crop is auto-levelled, gently sharpened and saved twice — a transparent PNG
(reusable anywhere) and a JPG on a flat colour (what the menu zip wants).

Crops come out in reading order (left→right, top→bottom), so --names can label
them in one go. Every run prints a JSON manifest of what it produced.
"""
from __future__ import annotations

import argparse
import json
import platform
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff', '.bmp'}
_SESSION = None


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def to_jpeg_if_heic(path: Path) -> Path:
    """iPhone photos arrive as HEIC; macOS can convert them without extra deps."""
    if path.suffix.lower() not in {'.heic', '.heif'}:
        return path
    if platform.system() != 'Darwin':
        sys.exit(f'{path.name}: HEIC needs macOS `sips` or a manual conversion first')
    out = Path(tempfile.mkdtemp()) / (path.stem + '.jpg')
    subprocess.run(['sips', '-s', 'format', 'jpeg', str(path), '--out', str(out)], check=True, capture_output=True)
    return out


def load(path: Path) -> Image.Image:
    im = Image.open(to_jpeg_if_heic(path))
    im = ImageOps.exif_transpose(im)
    return im.convert('RGBA')


def remove_bg(im: Image.Image, model: str, matting: bool) -> Image.Image:
    global _SESSION
    from rembg import new_session, remove  # imported lazily: slow, and --no-rembg skips it

    if _SESSION is None:
        _SESSION = new_session(model)
    return remove(im, session=_SESSION, alpha_matting=matting, alpha_matting_erode_size=10)


def components(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    """Connected blobs of a boolean mask → (x0, y0, x1, y1, area), 8-connected."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        x0 = x1 = sx
        y0 = y1 = sy
        area = 0
        while stack:
            y, x = stack.pop()
            area += 1
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        out.append((x0, y0, x1, y1, area))
    return out


def reading_order(boxes):
    """Group into rows by vertical overlap, then left→right — how a person names a spread."""
    rows: list[dict] = []
    for b in sorted(boxes, key=lambda b: (b[1], b[0])):
        cy = (b[1] + b[3]) / 2
        for row in rows:
            if row['y0'] <= cy <= row['y1']:
                row['items'].append(b)
                row['y0'], row['y1'] = min(row['y0'], b[1]), max(row['y1'], b[3])
                break
        else:
            rows.append({'y0': b[1], 'y1': b[3], 'items': [b]})
    out = []
    for row in sorted(rows, key=lambda r: r['y0']):
        out += sorted(row['items'], key=lambda b: b[0])
    return out


def split_boxes(cut: Image.Image, min_frac: float, pad: float) -> list[tuple[int, int, int, int]]:
    """Blob boxes at full resolution, padded and clamped; tiny specks dropped."""
    alpha = np.asarray(cut.split()[3])
    full_h, full_w = alpha.shape
    scale = max(1, max(full_w, full_h) // 400)
    small = alpha[::scale, ::scale] > 40
    blobs = components(small)
    total = sum(b[4] for b in blobs) or 1
    keep = [b for b in blobs if b[4] / total >= min_frac]
    boxes = []
    for x0, y0, x1, y1, _ in reading_order(keep):
        x0, y0, x1, y1 = x0 * scale, y0 * scale, (x1 + 1) * scale, (y1 + 1) * scale
        px, py = int((x1 - x0) * pad), int((y1 - y0) * pad)
        boxes.append((int(max(0, x0 - px)), int(max(0, y0 - py)), int(min(full_w, x1 + px)), int(min(full_h, y1 + py))))
    return boxes


def enhance(rgba: Image.Image, levels: bool = False) -> Image.Image:
    """
    Sharpen a little and lift contrast a hair — never touch the hue.

    Levels are opt-in: a designed graphic or a graded photo already sits where
    its maker wanted it, and per-channel stretching turned a caramel latte
    magenta once. When asked for, they run tone-preserving (one stretch for all
    channels, measured on the item only) with a gentle cutoff.
    """
    rgb = rgba.convert('RGB')
    a = rgba.split()[3]
    if levels:
        mask = a.point(lambda v: 255 if v > 128 else 0)
        rgb = ImageOps.autocontrast(rgb, cutoff=0.5, mask=mask, preserve_tone=True)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.03)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.2, percent=50, threshold=3))
    out = rgb.convert('RGBA')
    out.putalpha(a)
    return out


def fit(im: Image.Image, size: int, square: bool) -> Image.Image:
    """Shrink to `size` on the long side (never upscale); optionally pad to a square."""
    w, h = im.size
    if max(w, h) > size:
        r = size / max(w, h)
        im = im.resize((max(1, round(w * r)), max(1, round(h * r))), Image.LANCZOS)
        w, h = im.size
    if square:
        side = max(w, h)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(im, ((side - w) // 2, (side - h) // 2))
        im = canvas
    return im


def parse_color(s: str) -> tuple[int, int, int, int]:
    if s == 'transparent':
        return (0, 0, 0, 0)
    if s == 'white':
        return (255, 255, 255, 255)
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def flatten(im: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    bg = Image.new('RGBA', im.size, color)
    bg.alpha_composite(im)
    return bg.convert('RGB')


def slug(s: str) -> str:
    import re
    import unicodedata

    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or 'item'


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('inputs', nargs='+', help='photos, or a folder of photos')
    ap.add_argument('--out', required=True, help='folder for the crops (the business images/ dir)')
    ap.add_argument('--mode', choices=['multi', 'single'], default='multi', help='split blobs, or treat the photo as one item')
    ap.add_argument('--names', default='', help='comma-separated names, applied in reading order (per photo)')
    ap.add_argument('--model', default='u2net', help='rembg model: u2net (default), isnet-general-use, u2netp (fast)')
    ap.add_argument('--alpha-matting', action='store_true', help='softer edges on glass, foam, steam (slower)')
    ap.add_argument('--no-rembg', action='store_true', help='skip background removal; crop only')
    ap.add_argument('--min-area', type=float, default=0.04, help='drop blobs under this fraction of the total (default 0.04)')
    ap.add_argument('--pad', type=float, default=0.06, help='padding around each crop, as a fraction (default 0.06)')
    ap.add_argument('--size', type=int, default=1200, help='max side in px (default 1200)')
    ap.add_argument('--bg', default='white', help='JPG background: white, transparent (PNG only) or #RRGGBB')
    ap.add_argument('--no-square', action='store_true', help='keep the natural crop instead of padding to a square')
    ap.add_argument('--no-enhance', action='store_true', help='skip sharpening/contrast entirely')
    ap.add_argument('--levels', action='store_true', help='also auto-level (tone-preserving) — for flat, hazy phone shots; never for graded images')
    ap.add_argument('--png-only', action='store_true')
    ap.add_argument('--jpg-only', action='store_true')
    args = ap.parse_args()

    files: list[Path] = []
    for raw in args.inputs:
        p = Path(raw)
        if p.is_dir():
            files += sorted(q for q in p.iterdir() if q.suffix.lower() in IMG_EXT)
        elif p.exists():
            files.append(p)
        else:
            sys.exit(f'not found: {p}')
    if not files:
        sys.exit('no images given')

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    names = [n.strip() for n in args.names.split(',') if n.strip()]
    bg = parse_color(args.bg)
    manifest = []

    for path in files:
        log(f'→ {path.name}')
        im = load(path)
        cut = im if args.no_rembg else remove_bg(im, args.model, args.alpha_matting)
        if args.mode == 'single':
            bbox = cut.split()[3].getbbox() or (0, 0, *cut.size)
            boxes = [bbox]
        else:
            boxes = split_boxes(cut, args.min_area, args.pad) or [cut.split()[3].getbbox() or (0, 0, *cut.size)]
        log(f'  {len(boxes)} item(s)')

        for i, box in enumerate(boxes):
            crop = cut.crop(box)
            tight = crop.split()[3].getbbox()
            if tight:
                crop = crop.crop(tight)
            if not args.no_enhance:
                crop = enhance(crop, args.levels)
            crop = fit(crop, args.size, not args.no_square)

            base = slug(names[i]) if i < len(names) else f'{slug(path.stem)}-{i + 1:02d}'
            written = []
            if not args.jpg_only:
                png = out_dir / f'{base}.png'
                crop.save(png, optimize=True)
                written.append(png.name)
            if not args.png_only and bg[3] == 255:
                jpg = out_dir / f'{base}.jpg'
                flatten(crop, bg).save(jpg, quality=88, optimize=True, progressive=True)
                written.append(jpg.name)
            manifest.append({'source': path.name, 'index': i + 1, 'box': [int(v) for v in box], 'size': list(crop.size), 'files': written})
            log(f'  · {", ".join(written)}  {crop.size[0]}×{crop.size[1]}')

    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
