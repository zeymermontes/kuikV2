# Custom landing pages

A **custom landing** is a self-contained static website (HTML + CSS + JS +
assets) that a Kuik **super-admin** uploads for a restaurant. It's an *extra*,
more elaborate alternative to the built-in template landing — the two coexist,
and the super-admin chooses which one (if any) a visitor sees.

This guide explains how to **set up the folder** and package it into the `.zip`
the uploader accepts.

---

## TL;DR

```
my-site/                ← zip the CONTENTS of this folder
├── index.html          ← required entry point
├── styles.css
├── js/
│   └── app.js
└── assets/
    ├── logo.png
    └── hero.jpg
```

```bash
cd my-site
zip -r ../site.zip . -x '.*' '__MACOSX/*'
```

Then in **Super Admin → (restaurant row) → Landing**: click **Upload site**,
choose `site.zip`, then set the mode dropdown to **Custom site**.

---

## 1. Folder structure

There is **one rule**: the zip must contain an `index.html`. Everything else is
up to you.

`index.html` may sit at the root of the zip, or inside a single wrapper folder —
both are accepted. The uploader finds the shallowest `index.html`, treats its
folder as the site root, and strips the wrapper.

```
✅ Root layout                ✅ Wrapper-folder layout
site.zip                      site.zip
├── index.html                └── my-site/
├── styles.css                    ├── index.html
└── assets/logo.png               ├── styles.css
                                  └── assets/logo.png
```

Subfolders (`assets/`, `js/`, `fonts/`, `img/`, …) are preserved exactly.

## 2. Reference assets with RELATIVE paths

The site is served under a path ending in `…/index.html`, so links must be
**relative** to `index.html`:

| Use this (relative)              | Not this (absolute)        |
| -------------------------------- | -------------------------- |
| `<link href="styles.css">`       | `<link href="/styles.css">`|
| `<img src="assets/logo.png">`    | `<img src="/assets/logo.png">` |
| `<script src="./js/app.js">`     | `<script src="/js/app.js">`|

A leading `/` points at the domain root, **not** your site folder, so absolute
paths will break. Always use `styles.css`, `./js/app.js`, `assets/logo.png`,
etc. (Every file in your zip is served from the same folder, so relative links
between them resolve correctly.)

## 3. Supported file types

The uploader sets the correct content-type for these extensions:

```
.html .htm   .js .mjs   .css   .json   .txt   .xml
.svg .png .jpg .jpeg .gif .webp .avif .ico
.mp4 .webm
.woff .woff2 .ttf .otf
```

Other file types still upload, but the browser may download them instead of
rendering them. Stick to the list above for anything the page references.

## 4. What gets stripped automatically

You don't need to clean these out by hand — the uploader drops them:

- Empty files and directory entries
- `__MACOSX/` folders (created by the macOS "Compress" menu)
- **Anything whose name starts with a dot** — `.DS_Store`, `.git/`, `.env`, …
  > Don't rely on dotfiles or dot-folders; they will not be uploaded.
- Any path containing `..` (blocked for security)

## 5. Hard limits & constraints

- **Static files only.** No server-side code runs — no PHP, Node, databases, or
  build step. Ship the *built output* of your site, not its source.
  - From Vite: `npm run build` → zip the `dist/` folder.
  - From Next.js (static export): configure `output: 'export'` → zip `out/`.
  - From a plain HTML/CSS/JS site: zip the folder as-is.
- **Max ~15 MB per zip.** Compress images and avoid bundling large videos; host
  big media externally and link to it.
- **The JS is sandboxed** (iframe with `allow-scripts allow-forms allow-popups
  allow-top-navigation-by-user-activation`, **no** `allow-same-origin`). That means:
  - ✅ Animations, interactivity, forms, external `fetch()`, analytics/pixels,
    CDN scripts, embeds — all work.
  - ❌ It **cannot** read cookies or the Kuik session, and cannot call Kuik's
    ordering/reservation APIs. `localStorage` is partitioned to an opaque
    origin (don't rely on it persisting).

### Linking to the menu (important)

The page runs inside a sandboxed iframe (an **opaque origin**), so its scripts
can't read the parent page's address to discover the restaurant's domain — and
you can't hardcode it either, because the same site may be reused across
restaurants.

Instead, Kuik passes the restaurant's own URLs into the page as query
parameters on load:

| Param  | Value                                   |
| ------ | --------------------------------------- |
| `menu` | Full URL of the restaurant's menu       |
| `home` | Full URL of the restaurant's home/root  |

Read them and wire up your links. The simplest pattern: mark links with a
`data-kuik` attribute and drop in this snippet once, before `</body>`:

```html
<a data-kuik="menu" href="#">Ver el menú</a>
<a data-kuik="home" href="#">Inicio</a>

<script>
  const p = new URLSearchParams(location.search);
  const urls = { menu: p.get('menu'), home: p.get('home') };
  for (const el of document.querySelectorAll('[data-kuik]')) {
    const url = urls[el.getAttribute('data-kuik')];
    if (url) { el.href = url; el.target = '_top'; } // _top breaks out of the iframe
  }
</script>
```

`target="_top"` makes the whole page navigate to the menu (allowed on a real
click). Use `target="_blank"` instead if you'd rather open it in a new tab.

## 6. Packaging the zip

**macOS / Linux (terminal — recommended):**

```bash
cd my-site                              # folder that holds index.html
zip -r ../site.zip . -x '.*' '__MACOSX/*'
```

**macOS Finder:** select the *files inside* the folder (not the folder), then
right-click → **Compress**. (Compressing the folder itself is fine too — the
wrapper folder is handled — but it adds a `__MACOSX/` entry, which is stripped
anyway.)

**Windows:** select the files inside the folder → right-click → **Send to →
Compressed (zipped) folder**.

## 7. Uploading & choosing what shows

1. Go to **Super Admin** (`/admin`).
2. Find the restaurant's row → **Landing** column.
3. Click **Upload site** and pick the `.zip`.
   - Uploading only *stores* the site. It does **not** change what visitors see.
4. Set the mode dropdown:
   - **Custom site** — show the uploaded site on the QR/home.
   - **Template** — defer to the owner's built-in template landing.
   - **No landing (menu)** — send visitors straight to the menu.
5. Re-uploading replaces the stored site (old files are wiped first). The **✕**
   button removes the custom site entirely.

### The `/landing` URL & previewing

Every uploaded site also gets a **clean, permanent URL** on the restaurant's own
domain: **`<restaurant>.kuik.mx/landing`** (e.g. `laseisdos.kuik.mx/landing`).
The **Preview** link in the Landing column just opens this URL.

It renders the site **exactly as a visitor sees it** — same sandboxed iframe,
with the `menu`/`home` params filled in — and works **regardless of the mode
dropdown**. So you can upload, open `/landing` to confirm it looks and behaves
right, and only switch the dropdown to **Custom site** (which changes what the
QR/home shows) once you're happy.

The difference between the two URLs:

| URL                          | Shows                                            |
| ---------------------------- | ------------------------------------------------ |
| `<restaurant>.kuik.mx/`      | Follows the mode dropdown (template / custom / menu) |
| `<restaurant>.kuik.mx/landing` | Always the uploaded custom site (if one exists) |

> `/landing` is a **public** URL — anyone with the link can open it, like any
> page on the site. Fine for a marketing page; just don't put secrets in there.

## 8. Minimal working example

`index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mi Restaurante</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header>
      <img src="assets/logo.png" alt="Logo" width="120" />
      <h1>Bienvenidos</h1>
    </header>
    <a class="cta" data-kuik="menu" href="#">Ver el menú</a>
    <script>
      // Point the menu link at this restaurant's real URL (injected by Kuik).
      const menu = new URLSearchParams(location.search).get('menu');
      for (const el of document.querySelectorAll('[data-kuik="menu"]')) {
        if (menu) { el.href = menu; el.target = '_top'; }
      }
    </script>
    <script src="js/app.js"></script>
  </body>
</html>
```

Folder:

```
my-site/
├── index.html
├── styles.css
├── js/app.js
└── assets/logo.png
```

Zip it (`zip -r ../site.zip . -x '.*' '__MACOSX/*'`), upload, set mode to
**Custom site**, and visit the restaurant's domain.
