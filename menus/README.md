# menus/ — menu workspaces per business

One sub-folder per restaurant. Claude fills it from whatever you hand over — a
website URL, photos of the printed menu, dish photos, a PDF — and the result is
the zip you upload in Kuik (**Menú → Importar ZIP**).

```
menus/
  .tools/                      scripts + a Python venv (ignored by git)
  <business-slug>/             ignored by git: restaurant data, not code
    sources/                   what you gave: html, pdf, photos, screenshots
    images/                    finished product photos (cutouts, enhanced)
    menu.json                  the Kuik import payload
    <business-slug>-menu.zip   menu.json + images/ — upload this
```

Say "haz el menú de <negocio> con <url|fotos|pdf>" and the `menu-builder` skill
takes it from there; dish photos go through the `menu-images` skill (detect,
crop, remove background, enhance). The scripts can also be run by hand:

```bash
cd menus/.tools
.venv/bin/python extract_items.py ../<slug>/sources/*.jpg --out ../<slug>/images --names "Latte,Croissant"
python3 build_zip.py ../<slug>              # validates, writes the zip
```

First run of the image tool downloads the segmentation model (~170 MB) once.
