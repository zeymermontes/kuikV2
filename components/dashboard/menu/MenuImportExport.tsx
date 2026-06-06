'use client';

import { useRef, useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import { Download, Upload, FileSpreadsheet, Sparkles, Check, Loader2, FileArchive, Bot } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Category, Product } from '@/lib/database.types';
import { BADGES } from '@/lib/badges';
import { uploadFile } from '@/lib/upload';
import { Button } from '@/components/ui';
import {
  previewFullImport,
  applyFullImport,
} from '@/app/(dashboard)/menu/full-import-actions';
import type { FullImportPayload, ImportCategory, ImportPreview } from '@/lib/menu-import';

const HEADERS = ['Categoría', 'Producto', 'Descripción', 'Precio', 'Precio anterior', 'Disponible', 'Etiquetas'];

const strip = (s: string) => s.toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function headerField(h: string): string | null {
  const k = strip(h);
  if (['categoria', 'category', 'seccion', 'section'].includes(k)) return 'category';
  if (['producto', 'product', 'nombre', 'name', 'platillo'].includes(k)) return 'name';
  if (['descripcion', 'description', 'desc'].includes(k)) return 'description';
  if (['precio', 'price'].includes(k)) return 'price';
  if (['precio anterior', 'compare price', 'precioanterior', 'antes'].includes(k)) return 'compareAt';
  if (['disponible', 'available', 'activo'].includes(k)) return 'available';
  if (['etiquetas', 'tags', 'badges'].includes(k)) return 'tags';
  return null;
}

const TAG_LOOKUP = new Map<string, string>();
for (const b of BADGES) {
  TAG_LOOKUP.set(strip(b.key), b.key);
  TAG_LOOKUP.set(strip(b.es), b.key);
  TAG_LOOKUP.set(strip(b.en), b.key);
}

const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const avail = (v: unknown) => !['no', 'false', '0', 'agotado'].includes(strip(String(v ?? '')));
const tags = (v: unknown) =>
  String(v ?? '').split(/[,;]/).map((t) => strip(t)).filter(Boolean).map((t) => TAG_LOOKUP.get(t) ?? t);

function mime(name: string): string {
  const e = name.split('.').pop()?.toLowerCase();
  return e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : e === 'gif' ? 'image/gif' : 'image/jpeg';
}

export function MenuImportExport({
  tenantId,
  branchId,
  categories,
  products,
}: {
  tenantId: string;
  branchId: string | null;
  categories: Category[];
  products: Product[];
}) {
  const t = useTranslations('menuImport');
  const locale = useLocale();
  const xlsxRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<FullImportPayload | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [pending, start] = useTransition();

  function copyText(text: string, which: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(''), 3000);
    });
  }

  async function runPreview(p: FullImportPayload) {
    if (p.categories.length === 0 && !p.design) {
      alert(t('emptyFile'));
      return;
    }
    setPayload(p);
    setPreview(await previewFullImport(p, branchId));
  }

  // ── Excel ───────────────────────────────────────────────────────────────
  async function handleExcel(file: File) {
    setBusy('excel');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const cats = new Map<string, ImportCategory>();
      for (const r of raw) {
        const row: Record<string, unknown> = {};
        for (const [h, v] of Object.entries(r)) {
          const f = headerField(h);
          if (f) row[f] = v;
        }
        const cat = String(row.category ?? '').trim();
        const name = String(row.name ?? '').trim();
        if (!cat || !name) continue;
        if (!cats.has(strip(cat))) cats.set(strip(cat), { name: cat, products: [] });
        cats.get(strip(cat))!.products.push({
          name,
          description: String(row.description ?? '').trim() || null,
          price: num(row.price),
          compareAtPrice: num(row.compareAt),
          available: avail(row.available),
          tags: tags(row.tags),
        });
      }
      await runPreview({ categories: [...cats.values()] });
    } catch {
      alert(t('parseError'));
    } finally {
      setBusy('');
    }
  }

  // ── ZIP (menu.json + images/) ─────────────────────────────────────────────
  async function handleZip(file: File) {
    setBusy('zip');
    try {
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const jsonName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.json'));
      if (!jsonName) {
        alert(t('zipNoJson'));
        return;
      }
      const data = JSON.parse(new TextDecoder().decode(files[jsonName])) as FullImportPayload;

      // Map basename → bytes for the bundled images.
      const byName = new Map<string, Uint8Array>();
      for (const [path, bytes] of Object.entries(files)) {
        if (path.endsWith('/')) continue;
        byName.set(path.split('/').pop()!.toLowerCase(), bytes);
      }
      const cache = new Map<string, string>();
      async function upload(ref: string | null | undefined): Promise<string | null> {
        if (!ref || /^https?:\/\//i.test(ref)) return ref ?? null;
        const base = ref.split('/').pop()!.toLowerCase();
        if (cache.has(base)) return cache.get(base)!;
        const bytes = byName.get(base);
        if (!bytes) return null;
        const url = await uploadFile(new File([bytes as unknown as BlobPart], base, { type: mime(base) }), tenantId, 'imported').catch(() => null);
        if (url) cache.set(base, url);
        return url;
      }

      if (data.design?.background_image) data.design.background_image = await upload(data.design.background_image);
      for (const c of data.categories ?? []) {
        for (const p of c.products ?? []) {
          if (p.image) p.image = await upload(p.image);
        }
      }
      await runPreview(data);
    } catch {
      alert(t('parseError'));
    } finally {
      setBusy('');
    }
  }

  // ── AI JSON (image URLs re-hosted server-side on apply) ───────────────────
  async function handleJson(file: File) {
    setBusy('json');
    try {
      const data = JSON.parse(await file.text()) as FullImportPayload;
      await runPreview(data);
    } catch {
      alert(t('parseError'));
    } finally {
      setBusy('');
    }
  }

  function apply(deleteMissing: boolean) {
    if (!payload) return;
    start(async () => {
      await applyFullImport(payload, branchId, deleteMissing);
      setPayload(null);
      setPreview(null);
    });
  }

  // ── Downloads / AI prompt ─────────────────────────────────────────────────
  function downloadTemplate() {
    const sample = [
      { Categoría: 'Pizzas', Producto: 'Margarita', Descripción: 'Tomate, mozzarella, albahaca', Precio: 180, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: 'Más vendido' },
      { Categoría: 'Bebidas', Producto: 'Limonada', Descripción: '', Precio: 45, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: '' },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, { header: HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Menú');
    XLSX.writeFile(wb, 'plantilla-menu.xlsx');
  }

  function exportMenu() {
    const byCat = new Map<string, Product[]>();
    for (const p of products) (byCat.get(p.category_id) ?? byCat.set(p.category_id, []).get(p.category_id)!).push(p);
    const data: Record<string, unknown>[] = [];
    for (const c of [...categories].sort((a, b) => a.position - b.position)) {
      for (const p of (byCat.get(c.id) ?? []).sort((a, b) => a.position - b.position)) {
        data.push({
          Categoría: c.name, Producto: p.name, Descripción: p.description ?? '',
          Precio: p.price ?? '', 'Precio anterior': p.compare_at_price ?? '',
          Disponible: p.is_available ? 'Sí' : 'No', Etiquetas: (p.tags ?? []).join(', '),
        });
      }
    }
    if (data.length === 0) data.push(Object.fromEntries(HEADERS.map((h) => [h, ''])));
    const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Menú');
    XLSX.writeFile(wb, 'menu.xlsx');
  }

  function copyScrapePrompt() {
    const url = prompt(t('scrapeAskUrl'));
    if (!url) return;
    copyText((locale === 'en' ? PROMPT_EN : PROMPT_ES).replace('{URL}', url.trim()), 'scrape');
  }

  function copyForAI() {
    copyText(locale === 'en' ? TABLE_PROMPT_EN : TABLE_PROMPT_ES, 'table');
  }

  function copyZipPrompt() {
    const url = prompt(t('scrapeAskUrl'));
    if (!url) return;
    copyText((locale === 'en' ? ZIP_PROMPT_EN : ZIP_PROMPT_ES).replace('{URL}', url.trim()), 'zip');
  }

  return (
    <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <FileSpreadsheet className="h-4 w-4" /> {t('title')}
      </h2>
      <p className="mb-3 text-sm text-neutral-500">{t('subtitle')}</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => xlsxRef.current?.click()} disabled={!!busy}>
          {busy === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t('import')}
        </Button>
        <Button variant="secondary" onClick={() => zipRef.current?.click()} disabled={!!busy}>
          {busy === 'zip' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} {t('importZip')}
        </Button>
        <Button variant="secondary" onClick={() => jsonRef.current?.click()} disabled={!!busy}>
          {busy === 'json' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} {t('importJson')}
        </Button>
        <Button variant="secondary" onClick={exportMenu}>
          <Download className="h-4 w-4" /> {t('export')}
        </Button>
        <Button variant="ghost" onClick={downloadTemplate}>
          <FileSpreadsheet className="h-4 w-4" /> {t('template')}
        </Button>
        <Button variant="ghost" onClick={copyForAI}>
          {copied === 'table' ? <Check className="h-4 w-4 text-green-600" /> : <Sparkles className="h-4 w-4" />}
          {copied === 'table' ? t('copied') : t('copyAI')}
        </Button>
        <Button variant="ghost" onClick={copyScrapePrompt}>
          {copied === 'scrape' ? <Check className="h-4 w-4 text-green-600" /> : <Bot className="h-4 w-4" />}
          {copied === 'scrape' ? t('copied') : t('scrapeAI')}
        </Button>
        <Button variant="ghost" onClick={copyZipPrompt}>
          {copied === 'zip' ? <Check className="h-4 w-4 text-green-600" /> : <FileArchive className="h-4 w-4" />}
          {copied === 'zip' ? t('copied') : t('zipAI')}
        </Button>
      </div>

      <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExcel(f); e.target.value = ''; }} />
      <input ref={zipRef} type="file" accept=".zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleZip(f); e.target.value = ''; }} />
      <input ref={jsonRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJson(f); e.target.value = ''; }} />

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !pending && setPreview(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="mb-3 font-semibold">{t('confirmTitle')}</h3>
            <ul className="mb-4 space-y-1 text-sm">
              {preview.hasDesign && <Li label={t('designIncluded')} value="✓" tone="text-blue-600" />}
              <Li label={t('newCategories')} value={preview.newCategories} />
              <Li label={t('newProducts')} value={preview.newProducts} tone="text-green-600" />
              <Li label={t('updatedProducts')} value={preview.updatedProducts} tone="text-blue-600" />
              <Li label={t('missingProducts')} value={preview.missingProducts} tone="text-red-500" />
            </ul>
            {pending ? (
              <div className="flex items-center justify-center py-3 text-sm text-neutral-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('importing')}
              </div>
            ) : (
              <div className="space-y-2">
                <Button className="w-full" onClick={() => apply(false)}>{t('addUpdateOnly')}</Button>
                <Button variant="danger" className="w-full" onClick={() => apply(true)} disabled={preview.missingProducts === 0 && preview.missingCategories === 0}>
                  {t('deleteMissing', { n: preview.missingProducts })}
                </Button>
                <button onClick={() => setPreview(null)} className="w-full py-1 text-center text-sm text-neutral-400 hover:text-neutral-600">
                  {t('cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Li({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className={`font-semibold ${tone ?? ''}`}>{value}</span>
    </li>
  );
}

const SCHEMA_ES = `{
  "design": {
    "primary_color": "#RRGGBB",        // Color de acento: precios, resaltados y badge de precio.
    "secondary_color": "#RRGGBB",      // Color de los títulos de cada categoría/sección.
    "background_color": "#RRGGBB",     // Color de fondo de toda la página del menú.
    "text_color": "#RRGGBB",           // Color del texto principal (nombres de los productos).
    "text_secondary_color": "#RRGGBB", // Color del texto tenue (descripciones de productos).
    "card_color": "#RRGGBB",           // Color de fondo de las tarjetas de cada producto.
    "border_color": "#RRGGBB",         // Color del borde de las tarjetas.
    "separator_color": "#RRGGBB",      // Color de las líneas separadoras entre secciones.
    "button_color": "#RRGGBB",         // Color de fondo del botón "Agregar".
    "button_text_color": "#RRGGBB",    // Color del texto dentro del botón "Agregar".
    "tab_bar_color": "#RRGGBB",        // Color de fondo de la barra de pestañas de categorías (puede ser translúcido).
    "tab_selected_color": "#RRGGBB",   // Color de fondo de la pestaña de categoría ACTIVA.
    "tab_unselected_color": "#RRGGBB", // Color de fondo de las pestañas de categoría INACTIVAS.
    "tab_font_color": "#RRGGBB",       // Color del texto de las pestañas de categoría.
    "font_family": "Poppins",          // Tipografía: un Google Font (p.ej. Poppins, Inter, Montserrat, Playfair Display, Lobster).
    "slogan": "...",                   // Eslogan o lema del restaurante.
    "background_image": "https://..."  // URL absoluta de la imagen de fondo (si la hay).
  },
  "categories": [
    {
      "name": "Pizzas",  // Nombre de la sección/categoría.
      "icon": "🍕",       // Un solo emoji que represente la categoría (opcional).
      "products": [
        {
          "name": "Margarita",
          "description": "Tomate, mozzarella y albahaca",
          "price": 180,              // Número, sin símbolo de moneda.
          "compareAtPrice": null,    // Precio anterior (tachado) si hay descuento; si no, null.
          "available": true,         // false si está agotado.
          "tags": ["bestseller"],    // Solo de: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
          "image": "https://...",    // URL absoluta de la foto del producto en el sitio (si existe).
          "prepTime": "15 min",      // Tiempo de preparación (opcional).
          "calories": 800,           // Calorías (opcional, número).
          "optionGroups": [          // Grupos de opciones (multiselect) que el cliente elige al ordenar.
            { "name":"Tamaño", "description":"", "required":true, "multiple":false,  // required=obligatorio. multiple:false = elige UNO (radio); true = elige VARIOS (checkbox).
              "options":[ {"name":"Chico","price":0}, {"name":"Grande","price":30} ] },  // price = costo EXTRA que se SUMA al precio base (0 si no agrega).
            { "name":"Extras", "required":false, "multiple":true,
              "options":[ {"name":"Queso","price":20}, {"name":"Tocino","price":25} ] },
            { "name":"Quitar ingredientes", "required":false, "multiple":true,
              "options":[ {"name":"Sin cebolla","price":0}, {"name":"Sin chile","price":0} ] }
          ]
        }
      ]
    }
  ]
}`;

const PROMPT_ES = `Eres un asistente con navegación web. Visita esta página de menú de restaurante: {URL}

Extrae TODO el menú y el diseño y devuélvelo EXCLUSIVAMENTE como un JSON válido con esta estructura exacta:
${SCHEMA_ES}

Reglas importantes:
- Las "//" son explicaciones de cada campo; NO las incluyas en tu respuesta. Devuelve JSON puro y válido, sin comentarios ni texto extra.
- TODOS los colores en formato hexadecimal #RRGGBB. Detecta los colores reales del sitio (fondo, tarjetas, botones, pestañas de categorías, textos, acentos). Si un color no aplica, omite ese campo.
- "categories": agrupa los productos por su sección tal como aparece en el sitio, en el mismo orden.
- Precios solo números, sin símbolo de moneda. "available": true salvo que diga agotado.
- "tags": usa SOLO de esta lista cuando aplique: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- "optionGroups": modela tamaños, extras y "quitar" como grupos. "required"=obligatorio, "multiple":false=elige uno / true=elige varios. El "price" de cada opción es el costo EXTRA que se suma al "price" base del producto (0 si no agrega). Si el producto no tiene opciones, omite "optionGroups".
- "image" y "background_image": URLs absolutas de las imágenes del sitio (si existen).
- No inventes datos: si un campo no está, omítelo (o null donde corresponda).

Puedes entregar el resultado como un archivo .json, o dentro de un .zip junto a una carpeta "images/" con las fotos (en ese caso, en "image" y "background_image" pon el nombre del archivo, p.ej. "margarita.jpg").
Devuelve solo el JSON.`;

const ZIP_PROMPT_ES = `Eres un asistente con navegación web y capacidad de ejecutar código (descargar archivos y crear un .zip). A partir de esta página de menú de restaurante: {URL}

Genera un ARCHIVO .ZIP listo para importar, que contenga:
1) "menu.json" en la raíz, con esta estructura exacta:
${SCHEMA_ES}
2) Una carpeta "images/" con TODAS las imágenes (fotos de productos y la imagen de fondo).

Reglas:
- Las "//" son explicaciones; NO las incluyas en menu.json. Debe ser JSON puro y válido.
- En "image" y "background_image" NO uses URLs: usa el NOMBRE de archivo de la imagen ya descargada (p.ej. "margarita.jpg"), y guarda ese archivo dentro de "images/" con ese mismo nombre. Usa nombres únicos y sin espacios.
- Descarga realmente cada imagen del sitio y agrégala a la carpeta "images/" del .zip.
- TODOS los colores en #RRGGBB; detecta los colores reales del sitio (fondo, tarjetas, botones, pestañas de categorías, textos, acentos).
- Precios solo números. "tags" solo de: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- No inventes datos: omite el campo (o null) si no está.

Entrégame el archivo .zip para descargar.`;

const TABLE_PROMPT_ES = `Ayúdame a crear el menú de mi restaurante como una tabla que pueda pegar en Excel/Google Sheets. Usa EXACTAMENTE estas columnas en la primera fila:
Categoría | Producto | Descripción | Precio | Precio anterior | Disponible | Etiquetas

Reglas:
- Una fila por producto; repite la Categoría en cada producto de esa sección.
- Precio: solo números. "Precio anterior" solo si hay descuento (si no, déjalo vacío).
- Disponible: "Sí" o "No".
- Etiquetas (opcional, separadas por coma): Nuevo, Más vendido, Picante, Vegano, Vegetariano, Sin gluten, De la casa, Promo.
- No inventes precios; si no los sé, déjalos vacíos.

Aquí está mi menú (pégalo o descríbelo):`;

const TABLE_PROMPT_EN = `Help me build my restaurant menu as a table I can paste into Excel/Google Sheets. Use EXACTLY these columns in the first row:
Category | Product | Description | Price | Compare price | Available | Tags

Rules:
- One row per product; repeat the Category for each product in that section.
- Price: numbers only. "Compare price" only if discounted (otherwise leave empty).
- Available: "Yes" or "No".
- Tags (optional, comma-separated): New, Bestseller, Spicy, Vegan, Vegetarian, Gluten-free, House, Promo.
- Don't make up prices; leave them empty if unknown.

Here is my menu (paste or describe it):`;

const SCHEMA_EN = `{
  "design": {
    "primary_color": "#RRGGBB",        // Accent color: prices, highlights and the price badge.
    "secondary_color": "#RRGGBB",      // Color of each category/section title.
    "background_color": "#RRGGBB",     // Background color of the whole menu page.
    "text_color": "#RRGGBB",           // Primary text color (product names).
    "text_secondary_color": "#RRGGBB", // Muted text color (product descriptions).
    "card_color": "#RRGGBB",           // Background color of each product card.
    "border_color": "#RRGGBB",         // Color of the card borders.
    "separator_color": "#RRGGBB",      // Color of the divider lines between sections.
    "button_color": "#RRGGBB",         // Background color of the "Add" button.
    "button_text_color": "#RRGGBB",    // Text color inside the "Add" button.
    "tab_bar_color": "#RRGGBB",        // Background color of the category tab bar (may be translucent).
    "tab_selected_color": "#RRGGBB",   // Background color of the ACTIVE category tab.
    "tab_unselected_color": "#RRGGBB", // Background color of INACTIVE category tabs.
    "tab_font_color": "#RRGGBB",       // Text color of the category tabs.
    "font_family": "Poppins",          // Typeface: a Google Font (e.g. Poppins, Inter, Montserrat, Playfair Display, Lobster).
    "slogan": "...",                   // Restaurant slogan/tagline.
    "background_image": "https://..."  // Absolute URL of the background image (if any).
  },
  "categories": [
    {
      "name": "Pizzas",  // Section/category name.
      "icon": "🍕",       // A single emoji representing the category (optional).
      "products": [
        {
          "name": "Margherita",
          "description": "Tomato, mozzarella and basil",
          "price": 180,              // Number, no currency symbol.
          "compareAtPrice": null,    // Previous (struck-through) price if discounted; otherwise null.
          "available": true,         // false if sold out.
          "tags": ["bestseller"],    // Only from: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
          "image": "https://...",    // Absolute URL of the product photo on the site (if any).
          "prepTime": "15 min",      // Prep time (optional).
          "calories": 800,           // Calories (optional, number).
          "optionGroups": [          // Option groups (multiselect) the customer picks when ordering.
            { "name":"Size", "description":"", "required":true, "multiple":false,  // required=mandatory. multiple:false = choose ONE (radio); true = choose MANY (checkbox).
              "options":[ {"name":"Small","price":0}, {"name":"Large","price":30} ] },  // price = EXTRA cost ADDED to the base price (0 if none).
            { "name":"Extras", "required":false, "multiple":true,
              "options":[ {"name":"Cheese","price":20}, {"name":"Bacon","price":25} ] },
            { "name":"Remove", "required":false, "multiple":true,
              "options":[ {"name":"No onion","price":0}, {"name":"No chili","price":0} ] }
          ]
        }
      ]
    }
  ]
}`;

const PROMPT_EN = `You are an assistant with web browsing. Visit this restaurant menu page: {URL}

Extract the ENTIRE menu and design and return it ONLY as valid JSON with this exact structure:
${SCHEMA_EN}

Important rules:
- The "//" are explanations of each field; do NOT include them in your answer. Return pure, valid JSON with no comments or extra text.
- ALL colors in #RRGGBB hex. Detect the site's real colors (background, cards, buttons, category tabs, text, accent). Omit a field if it doesn't apply.
- "categories": group products by their on-page section, in the same order.
- Prices numbers only, no currency symbol. "available": true unless sold out.
- "tags": ONLY from this list when relevant: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- "optionGroups": model sizes, extras and "remove" as groups. "required"=mandatory, "multiple":false=choose one / true=choose many. Each option's "price" is the EXTRA cost added to the product's base "price" (0 if none). Omit "optionGroups" if the product has no options.
- "image" and "background_image": absolute URLs of the site's images (if any).
- Don't invent data: omit a field (or null where appropriate) if it's missing.

You may deliver the result as a .json file, or inside a .zip with an "images/" folder of the photos (in that case put the file name in "image" and "background_image", e.g. "margherita.jpg").
Return only the JSON.`;

const ZIP_PROMPT_EN = `You are an assistant with web browsing and code execution (download files and create a .zip). From this restaurant menu page: {URL}

Produce a ready-to-import .ZIP FILE containing:
1) "menu.json" at the root, with this exact structure:
${SCHEMA_EN}
2) An "images/" folder with ALL images (product photos and the background image).

Rules:
- The "//" are explanations; do NOT include them in menu.json. It must be pure, valid JSON.
- In "image" and "background_image" do NOT use URLs: use the FILE NAME of the downloaded image (e.g. "margherita.jpg"), and save that file inside "images/" with the same name. Use unique names with no spaces.
- Actually download each image from the site and add it to the .zip's "images/" folder.
- ALL colors in #RRGGBB; detect the site's real colors (background, cards, buttons, category tabs, text, accent).
- Prices numbers only. "tags" only from: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- Don't invent data: omit the field (or null) if missing.

Give me the .zip file to download.`;
