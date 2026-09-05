---
name: menu-images
description: Turn dish/drink photos into menu-ready product images — detect each item in a photo, crop it, remove the background, enhance, and save PNG cutouts + JPGs into a business's menus/<slug>/images folder. Use when the user shares food photos, a tray/spread with several plates, or asks to clean up, cut out or improve product pictures.
---

# Product images from photos

Tool: `menus/.tools/extract_items.py` (Python venv at `menus/.tools/.venv`,
rembg + Pillow). It removes the background, splits the result into one crop
per item, auto-levels and sharpens each, and writes both a transparent PNG and
a JPG on a flat colour. First run downloads the segmentation model once.

## Workflow

1. **Look first.** `Read` the photo and name what is in it, in reading order
   (left→right, top→bottom) — that order is what `--names` follows. Decide
   `--mode single` (one dish fills the frame) or the default `multi` (a spread).
2. **Run** from `menus/.tools/`:
   ```bash
   .venv/bin/python extract_items.py ../<slug>/sources/IMG_1234.jpg \
     --out ../<slug>/images --names "Latte,Croissant de almendra"
   ```
   A folder works too (`../<slug>/sources/`), names then apply per photo.
   It prints a JSON manifest: files written, crop boxes and sizes.
3. **Check the crops** with `Read` on a couple of outputs. Common fixes:
   - Items merged into one blob (touching plates): rerun that photo with
     `--mode single` on a manual crop, or raise `--min-area`.
   - A speck became its own crop: raise `--min-area` (default 0.04).
   - Glass, foam, steam, thin stems eaten away: `--alpha-matting`, or try
     `--model isnet-general-use`.
   - Halo or dark edge: `--pad 0.02`, or `--no-enhance`.
   - Flat, hazy phone shot: `--levels` (tone-preserving auto-levels). Never on
     designed graphics or graded photos — that is how a caramel latte went magenta.
   - Background must stay (plated on a set table): `--no-rembg`.
4. **Reference** the JPG basenames from `menu.json` (`"image": "latte.jpg"`).
   Filenames are slugs of the names you passed; the manifest lists them.

## Options worth knowing

`--bg white|#RRGGBB|transparent` (JPG background; a brand tint looks great on
dark menus) · `--size 1200` (max side; never upscales) · `--no-square` (keep the
natural shape) · `--png-only` / `--jpg-only` · HEIC from iPhones is converted
automatically on macOS.

Quality bar: the item fills the square, edges are clean, colours read true —
not oversaturated. If a photo is too dark/blurry to rescue, say so rather than
shipping a bad crop; ask for a better shot.
