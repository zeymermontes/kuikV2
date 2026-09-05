#!/usr/bin/env python3
"""
Validate a business folder's menu.json and pack the zip Kuik imports.

    python3 build_zip.py ../<business>            # validate + write <business>-menu.zip
    python3 build_zip.py ../<business> --check    # validate only
    python3 build_zip.py ../<business> --optimize # re-encode photos ≤1600px JPEG q85 first

Mirrors what the dashboard's ZIP importer does: menu.json at the root, photos
under images/, every "image" in the JSON a bare filename that exists there.
Stdlib only, so it runs with any python3; --optimize needs Pillow.
"""
from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

TAGS = {'new', 'bestseller', 'spicy', 'vegan', 'vegetarian', 'glutenfree', 'house', 'promo'}
FONTS = {'Inter', 'Asap', 'Poppins', 'Playfair Display', 'Lora', 'Montserrat', 'Roboto Slab', 'Outfit', 'Space Mono'}
DESIGN_KEYS = {
    'primary_color', 'secondary_color', 'background_color', 'text_color', 'text_secondary_color',
    'card_color', 'border_color', 'separator_color', 'button_color', 'button_text_color',
    'tab_bar_color', 'tab_selected_color', 'tab_unselected_color', 'tab_font_color',
    'font_family', 'slogan', 'background_image',
}
IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.images: set[str] = set()
        self.categories = 0
        self.products = 0

    def err(self, s: str) -> None:
        self.errors.append(s)

    def warn(self, s: str) -> None:
        self.warnings.append(s)


def is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def image_ref(r: Report, where: str, ref) -> None:
    if ref is None:
        return
    if not isinstance(ref, str) or not ref.strip():
        r.err(f'{where}: "image" must be a filename or URL')
        return
    if ref.lower().startswith(('http://', 'https://')):
        r.warn(f'{where}: image is a URL — Kuik will re-host it on import; bundle it in images/ for a self-contained zip')
        return
    if '/' in ref or '\\' in ref:
        r.warn(f'{where}: image "{ref}" has a path; only the basename is used')
    r.images.add(ref.split('/')[-1].split('\\')[-1].lower())


def check_options(r: Report, where: str, groups) -> None:
    if not isinstance(groups, list):
        r.err(f'{where}: optionGroups must be a list')
        return
    for gi, g in enumerate(groups):
        gw = f'{where} › optionGroups[{gi}]'
        if not isinstance(g, dict) or not str(g.get('name', '')).strip():
            r.err(f'{gw}: needs a "name"')
            continue
        if g.get('kind') not in (None, 'dish', 'drink', 'takeaway'):
            r.err(f'{gw}: kind must be "dish", "drink" or "takeaway"')
        opts = g.get('options')
        if not isinstance(opts, list) or not opts:
            r.err(f'{gw} ({g["name"]}): needs a non-empty "options" list')
            continue
        for oi, o in enumerate(opts):
            if not isinstance(o, dict) or not str(o.get('name', '')).strip():
                r.err(f'{gw} ({g["name"]}) › options[{oi}]: needs a "name"')
            elif 'price' in o and o['price'] is not None and not is_num(o['price']):
                r.err(f'{gw} ({g["name"]}) › {o["name"]}: price must be a number')


def check_products(r: Report, where: str, products) -> None:
    if products is None:
        return
    if not isinstance(products, list):
        r.err(f'{where}: "products" must be a list')
        return
    seen = set()
    for pi, p in enumerate(products):
        pw = f'{where} › products[{pi}]'
        if not isinstance(p, dict) or not str(p.get('name', '')).strip():
            r.err(f'{pw}: needs a "name"')
            continue
        name = p['name'].strip()
        pw = f'{where} › {name}'
        if name.lower() in seen:
            r.warn(f'{pw}: duplicate product name in this section (the importer merges them)')
        seen.add(name.lower())
        r.products += 1
        for k in ('price', 'compareAtPrice', 'cost', 'calories'):
            if k in p and p[k] is not None and not is_num(p[k]):
                r.err(f'{pw}: {k} must be a number (no currency symbols)')
        if p.get('price') is None:
            r.warn(f'{pw}: no price')
        if 'tags' in p and p['tags'] is not None:
            bad = [t for t in p['tags'] if t not in TAGS] if isinstance(p['tags'], list) else ['(not a list)']
            if bad:
                r.err(f'{pw}: unknown tags {bad}; allowed: {sorted(TAGS)}')
        image_ref(r, pw, p.get('image'))
        if 'optionGroups' in p and p['optionGroups'] is not None:
            check_options(r, pw, p['optionGroups'])
        for legacy in ('variants', 'modifiers'):
            if isinstance(p.get(legacy), list):
                for o in p[legacy]:
                    if not isinstance(o, dict) or not o.get('name'):
                        r.err(f'{pw}: every {legacy} entry needs a "name"')


def check_category(r: Report, where: str, c, depth: int) -> None:
    if not isinstance(c, dict) or not str(c.get('name', '')).strip():
        r.err(f'{where}: needs a "name"')
        return
    where = f'{where} "{c["name"]}"'
    r.categories += 1
    if 'icon' in c and c['icon'] is not None and (not isinstance(c['icon'], str) or len(c['icon']) > 8):
        r.warn(f'{where}: "icon" should be a single emoji')
    image_ref(r, where, c.get('image'))
    for k in ('color', 'background'):
        v = c.get(k)
        if v is not None and not (isinstance(v, str) and v.startswith('#') and len(v) in (7, 9)):
            r.err(f'{where}: "{k}" must be "#RRGGBB"')
    th = c.get('theme')
    if th is not None:
        if not isinstance(th, dict):
            r.err(f'{where}: "theme" must be an object')
        else:
            for k, v in th.items():
                if k.endswith('_color'):
                    if not (isinstance(v, str) and v.startswith('#') and len(v) in (7, 9)):
                        r.err(f'{where}: theme.{k} must be "#RRGGBB"')
                elif k.startswith('font_'):
                    if v not in FONTS:
                        r.warn(f'{where}: theme.{k} "{v}" is not in the curated font list (Google Fonts will still load it)')
                elif k == 'background_image':
                    image_ref(r, f'{where} theme', v)
                else:
                    r.warn(f'{where}: theme.{k} is not a design key; ignored')
    check_products(r, where, c.get('products'))
    subs = c.get('subcategories')
    if subs:
        if depth > 0:
            r.err(f'{where}: subcategories only go one level deep')
        elif not isinstance(subs, list):
            r.err(f'{where}: "subcategories" must be a list')
        else:
            for si, s in enumerate(subs):
                check_category(r, f'{where} › subcategories[{si}]', s, depth + 1)
    if not c.get('products') and not subs:
        r.warn(f'{where}: empty section')


def validate(payload) -> Report:
    r = Report()
    if not isinstance(payload, dict):
        r.err('menu.json must be an object with "categories"')
        return r
    design = payload.get('design')
    if design is not None:
        if not isinstance(design, dict):
            r.err('"design" must be an object')
        else:
            for k, v in design.items():
                if k not in DESIGN_KEYS:
                    r.warn(f'design.{k}: unknown key, ignored by Kuik')
                elif k.endswith('_color') and v is not None and not (isinstance(v, str) and v.startswith('#') and len(v) in (7, 9)):
                    r.err(f'design.{k}: colours are "#RRGGBB"')
            if design.get('font_family') and design['font_family'] not in FONTS:
                r.warn(f'design.font_family "{design["font_family"]}" is not in the curated list {sorted(FONTS)}; Google Fonts will still load it by name')
            image_ref(r, 'design.background_image', design.get('background_image'))
    ordering = payload.get('ordering')
    if ordering is not None:
        if not isinstance(ordering, dict):
            r.err('"ordering" must be an object')
        elif ordering.get('notePlaceholder') is not None and not isinstance(ordering['notePlaceholder'], str):
            r.err('ordering.notePlaceholder must be a string')
    cats = payload.get('categories')
    if not isinstance(cats, list) or not cats:
        r.err('"categories" must be a non-empty list')
        return r
    for ci, c in enumerate(cats):
        check_category(r, f'categories[{ci}]', c, 0)
    return r


def optimize_images(img_dir: Path) -> None:
    from PIL import Image, ImageOps  # only for --optimize

    for p in sorted(img_dir.iterdir()):
        if p.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp'}:
            continue
        im = ImageOps.exif_transpose(Image.open(p))
        w, h = im.size
        if max(w, h) > 1600:
            k = 1600 / max(w, h)
            im = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
        if p.suffix.lower() == '.png' and im.mode == 'RGBA' and im.getextrema()[3][0] < 255:
            im.save(p, optimize=True)  # keep transparency
        else:
            im.convert('RGB').save(p.with_suffix('.jpg'), quality=85, optimize=True, progressive=True)
            if p.suffix.lower() != '.jpg':
                p.unlink()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folder', help='menus/<business> folder holding menu.json and images/')
    ap.add_argument('--check', action='store_true', help='validate only, write nothing')
    ap.add_argument('--optimize', action='store_true', help='re-encode images/ (≤1600px, JPEG q85) before zipping')
    ap.add_argument('--allow-missing', action='store_true', help='zip even if the JSON names images that are not in images/')
    ap.add_argument('--all-images', action='store_true', help='bundle every file in images/, not only the ones menu.json references')
    ap.add_argument('--out', help='zip path (default <folder>/<folder-name>-menu.zip)')
    args = ap.parse_args()

    folder = Path(args.folder).resolve()
    src = folder / 'menu.json'
    if not src.exists():
        sys.exit(f'no menu.json in {folder}')
    try:
        payload = json.loads(src.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        sys.exit(f'menu.json is not valid JSON: {e}')

    r = validate(payload)
    img_dir = folder / 'images'
    if args.optimize and img_dir.is_dir() and not args.check:
        optimize_images(img_dir)
    on_disk = {p.name.lower(): p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT} if img_dir.is_dir() else {}
    missing = sorted(n for n in r.images if n not in on_disk)
    unused = sorted(n for n in on_disk if n not in r.images)
    for n in missing:
        (r.warn if args.allow_missing else r.err)(f'images/{n} is named in menu.json but not on disk')
    for n in unused:
        r.warn(f'images/{n} is on disk but nothing in menu.json uses it' + (' (bundled anyway)' if args.all_images else ' (left out; --all-images to bundle)'))
    for n, p in on_disk.items():
        if p.stat().st_size > 2_000_000:
            r.warn(f'images/{n} is {p.stat().st_size // 1024} KB — consider --optimize')

    for w in r.warnings:
        print(f'  warn  {w}')
    for e in r.errors:
        print(f'  ERROR {e}')
    print(f'\n{r.categories} sections · {r.products} products · {len(r.images)} images referenced · {len(on_disk)} on disk')
    if r.errors:
        sys.exit(f'\n{len(r.errors)} error(s) — fix menu.json and run again')
    if args.check:
        print('menu.json is valid')
        return

    out = Path(args.out) if args.out else folder / f'{folder.name}-menu.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('menu.json', json.dumps(payload, ensure_ascii=False, indent=2))
        for n, p in sorted(on_disk.items()):
            if args.all_images or n in r.images:
                z.write(p, f'images/{p.name}')
    print(f'wrote {out} ({out.stat().st_size // 1024} KB) → Kuik: Menú → Importar ZIP')


if __name__ == '__main__':
    main()
