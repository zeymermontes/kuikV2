---
name: menu-builder
description: Build a Kuik menu import (menu.json + images → zip) for a business from a website URL, printed-menu photos, dish photos or a PDF. Use when the user says "haz el menú de X", hands over a restaurant site/photos/PDF, or wants a zip to upload in Menú → Importar ZIP.
---

# Build a Kuik menu from a website, photos or a PDF

Output lives in `menus/<slug>/` (one folder per business, git-ignored) and ends
as `menus/<slug>/<slug>-menu.zip`, uploaded in **Menú → Importar ZIP**. The
importer merges by name, so re-running with a corrected zip updates in place.

## 1. Workspace

```bash
mkdir -p menus/<slug>/sources menus/<slug>/images
```
`<slug>` = business name, lowercase, hyphens (`la-seis-dos`). Put every input
you were given in `sources/` (curl the HTML, copy photos/PDF) so the run is
reproducible.

Images pasted into the chat are visible to you but are NOT files on disk: you
can transcribe text from them, but cropping needs the originals. Ask the user
to drop them into `sources/` (Finder → the folder), then continue.

## 2. Extract the menu — by source type

- **Website** — `curl -sL <url> -o sources/site.html`, then read it. Menus
  are often in a JS array or a JSON blob (grep for `price`, `precio`, `items`,
  `menu`); if the page is app-rendered, use the chrome-devtools MCP to load it
  and `take_snapshot`, or WebFetch as a fallback. Pull colours/fonts from the
  CSS for `design`. Product image URLs may be used directly (Kuik re-hosts
  them) — prefer downloading into `images/` for a self-contained zip.
- **Photos of the printed menu / screenshots** — `Read` each image and
  transcribe section by section. Keep the card's own order and wording.
  Lists under a dish like "A SU ELECCIÓN" are an `optionGroup`, not products.
- **PDF** — `Read` with `pages`; long PDFs 10–20 pages at a time. If text
  extraction is garbled, screenshot pages instead.
- **Dish photos** — hand them to the `menu-images` skill; it produces the
  cutouts in `images/` and tells you the filenames to reference.

Never invent prices, descriptions or items. Missing → omit the field.

## 3. Write `menus/<slug>/menu.json`

```jsonc
{
  "design": {                       // all optional
    "primary_color": "#RRGGBB", "secondary_color": "#RRGGBB", "background_color": "#RRGGBB",
    "text_color": "#RRGGBB", "text_secondary_color": "#RRGGBB", "card_color": "#RRGGBB",
    "border_color": "#RRGGBB", "separator_color": "#RRGGBB",
    "button_color": "#RRGGBB", "button_text_color": "#RRGGBB",
    "tab_bar_color": "#RRGGBB", "tab_selected_color": "#RRGGBB", "tab_unselected_color": "#RRGGBB", "tab_font_color": "#RRGGBB",
    "font_family": "Poppins",       // curated: Inter, Asap, Poppins, Playfair Display, Lora, Montserrat, Roboto Slab, Outfit, Space Mono (any Google Font loads)
    "slogan": "…",
    "background_image": "fondo.jpg" // filename in images/ or URL
  },
  "categories": [
    {
      "name": "Desayunos", "icon": "🥞",  // icon = ONE emoji; or "image": "cat-desayunos.png" for a custom tab icon
      "color": "#2d5a27", "background": "#dfe4c2",   // shorthands: section accent + background
      "theme": { "primary_color": "#…", "background_color": "#…", "text_color": "#…", "card_color": "#…",
                 "font_category": "Playfair Display", "font_product": "Outfit" },   // or the full section design (any design colour/font key); the page fades to it on scroll
      "subcategories": [                    // optional, ONE level; only categories show in the tab bar
        { "name": "Para comenzar", "products": [ /* same shape */ ] }
      ],
      "products": [
        {
          "name": "Chilaquiles", "description": "…", "price": 145,     // numbers, no currency symbol
          "compareAtPrice": null, "available": true, "hidden": false,
          "tags": ["bestseller"],          // only: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo
          "image": "chilaquiles.jpg",      // basename in images/ (or URL)
          "prepTime": "15 min", "calories": 800,
          "optionGroups": [
            { "name": "Proteína a su elección", "kind": "dish", "required": true, "multiple": false,
              "options": [ { "name": "Pollo", "price": 0 }, { "name": "Arrachera", "price": 40 } ] },
            { "name": "Extras", "kind": "dish", "required": false, "multiple": true,
              "options": [ { "name": "Queso", "price": 20 } ] },
            { "name": "Para llevar", "kind": "takeaway", "required": false, "multiple": true,
              "options": [ { "name": "Cubiertos", "price": 0 } ] }
          ]
        }
      ]
    }
  ]
}
```
Rules: option `price` is the EXTRA added to the base; `multiple:false` =
choose one; a parent that only holds subcategories has no `products`; don't
concatenate names ("Desayunos · Para comenzar" is wrong — that's a subcategory).

## 4. Images

Everything in `images/` ships in the zip; `"image"` values are bare basenames
(case-insensitive). Keep photos ≤1600px — the dashboard compresses uploads to
~0.6 MB anyway. `python3 menus/.tools/build_zip.py menus/<slug> --optimize`
re-encodes them for you.

## 5. Validate and pack

```bash
python3 menus/.tools/build_zip.py menus/<slug> --check   # schema + image cross-check
python3 menus/.tools/build_zip.py menus/<slug>           # writes <slug>-menu.zip
```
Fix every ERROR; read the warnings. Then tell the user the zip path and the
counts (sections · products · images), plus anything you could not extract.
