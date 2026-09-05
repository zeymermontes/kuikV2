'use client';

import { useRef, useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { unzipSync, zipSync } from 'fflate';
import { Download, Upload, FileSpreadsheet, Sparkles, Check, Loader2, FileArchive, Bot, FileJson } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Category, Product, TenantTheme } from '@/lib/database.types';
import { BADGES } from '@/lib/badges';
import { resolveOptionGroups } from '@/lib/menu-options';
import { uploadFile } from '@/lib/upload';
import { Button } from '@/components/ui';
import {
  previewFullImport,
  applyFullImport,
} from '@/app/(dashboard)/menu/full-import-actions';
import {
  IMPORT_DESIGN_KEYS,
  type FullImportPayload,
  type ImportCategory,
  type ImportDesign,
  type ImportPreview,
  type ImportProduct,
} from '@/lib/menu-import';

const HEADERS = ['Categoría', 'Subcategoría', 'Producto', 'Descripción', 'Precio', 'Precio anterior', 'Disponible', 'Etiquetas'];

const strip = (s: string) => s.toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function headerField(h: string): string | null {
  const k = strip(h);
  if (['categoria', 'category', 'seccion', 'section'].includes(k)) return 'category';
  if (['subcategoria', 'subcategory', 'subseccion', 'subsection'].includes(k)) return 'subcategory';
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

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  // Category icons are usually line-art SVGs. Uploading these as image/jpeg
  // makes the browser refuse to draw them, which is what happened before.
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function mime(name: string): string {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[e] ?? 'image/jpeg';
}

export function MenuImportExport({
  tenantId,
  branchId,
  categories,
  products,
  theme,
}: {
  tenantId: string;
  branchId: string | null;
  categories: Category[];
  products: Product[];
  theme: TenantTheme;
}) {
  const t = useTranslations('menuImport');
  const locale = useLocale();
  const xlsxRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<FullImportPayload | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [pending, start] = useTransition();

  function copyText(text: string, which: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(''), 3000);
    });
  }

  /**
   * Why a file could not be read, in the user's words. The raw error is also
   * logged, so "no se pudo leer el archivo" is never the whole story.
   */
  function fail(stage: string, e: unknown) {
    console.error(`[import:${stage}]`, e);
    const detail =
      e instanceof SyntaxError
        ? `${t('errSyntax')} ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e);
    setError(`${stage} — ${detail}`);
  }

  /** Shape problems we can name precisely instead of throwing a generic error. */
  function whatsWrong(data: unknown): string | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return t('errNotObject');
    const d = data as Partial<FullImportPayload>;
    if (d.categories == null && d.design == null) return t('errNoKeys');
    if (d.categories != null && !Array.isArray(d.categories)) return t('errCategoriesNotArray');
    for (const [i, c] of (d.categories ?? []).entries()) {
      const where = `${t('errCategoryAt')} ${i + 1}`;
      if (!c || typeof c !== 'object') return `${where}: ${t('errNotObject')}`;
      if (typeof c.name !== 'string' || !c.name.trim()) return `${where}: ${t('errNoName')}`;
      if (c.products != null && !Array.isArray(c.products)) {
        return `${where} (${c.name}): ${t('errProductsNotArray')}`;
      }
      if (c.subcategories != null && !Array.isArray(c.subcategories)) {
        return `${where} (${c.name}): ${t('errSubcatsNotArray')}`;
      }
      for (const [j, prod] of (c.products ?? []).entries()) {
        if (!prod || typeof prod !== 'object' || typeof prod.name !== 'string' || !prod.name.trim()) {
          return `${where} (${c.name}), ${t('errProductAt')} ${j + 1}: ${t('errNoName')}`;
        }
      }
    }
    return null;
  }

  async function runPreview(p: FullImportPayload) {
    const problem = whatsWrong(p);
    if (problem) {
      setError(problem);
      return;
    }
    if ((p.categories?.length ?? 0) === 0 && !p.design) {
      setError(t('emptyFile'));
      return;
    }
    setPayload(p);
    try {
      setPreview(await previewFullImport(p, branchId));
    } catch (e) {
      fail(t('stageServer'), e);
    }
  }

  // ── Excel ───────────────────────────────────────────────────────────────
  async function handleExcel(file: File) {
    setBusy('excel');
    setError(null);
    setNotice(null);
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
        const sub = String(row.subcategory ?? '').trim();
        const name = String(row.name ?? '').trim();
        if (!cat || !name) continue;
        if (!cats.has(strip(cat))) cats.set(strip(cat), { name: cat, products: [], subcategories: [] });
        const parent = cats.get(strip(cat))!;
        const product = {
          name,
          description: String(row.description ?? '').trim() || null,
          price: num(row.price),
          compareAtPrice: num(row.compareAt),
          available: avail(row.available),
          tags: tags(row.tags),
        };
        // A row with a Subcategoría lands in that nested section instead.
        if (sub) {
          let child = parent.subcategories!.find((x) => strip(x.name) === strip(sub));
          if (!child) {
            child = { name: sub, products: [] };
            parent.subcategories!.push(child);
          }
          child.products!.push(product);
        } else {
          parent.products!.push(product);
        }
      }
      if (cats.size === 0) {
        setError(t('errExcelNoRows'));
        return;
      }
      await runPreview({ categories: [...cats.values()] });
    } catch (e) {
      fail(t('stageExcel'), e);
    } finally {
      setBusy('');
    }
  }

  // ── ZIP (menu.json + images/) ─────────────────────────────────────────────
  async function handleZip(file: File) {
    setBusy('zip');
    setError(null);
    setNotice(null);
    try {
      let files: Record<string, Uint8Array>;
      try {
        files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      } catch (e) {
        fail(t('stageUnzip'), e);
        return;
      }

      const jsonName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.json'));
      if (!jsonName) {
        // Name what the zip does hold, so the fix is obvious.
        const listed = Object.keys(files).filter((n) => !n.endsWith('/')).slice(0, 8);
        setError(`${t('zipNoJson')} ${t('errZipHas')}: ${listed.join(', ') || '—'}`);
        return;
      }

      let data: FullImportPayload;
      try {
        data = JSON.parse(new TextDecoder().decode(files[jsonName])) as FullImportPayload;
      } catch (e) {
        fail(`${t('stageJson')} (${jsonName})`, e);
        return;
      }

      // Map basename → bytes for the bundled images.
      const byName = new Map<string, Uint8Array>();
      for (const [path, bytes] of Object.entries(files)) {
        if (path.endsWith('/')) continue;
        byName.set(path.split('/').pop()!.toLowerCase(), bytes);
      }
      const cache = new Map<string, string>();
      const missingImages: string[] = [];
      async function upload(ref: string | null | undefined): Promise<string | null> {
        if (!ref || /^https?:\/\//i.test(ref)) return ref ?? null;
        const base = ref.split('/').pop()!.toLowerCase();
        if (cache.has(base)) return cache.get(base)!;
        const bytes = byName.get(base);
        if (!bytes) {
          if (!missingImages.includes(base)) missingImages.push(base);
          return null;
        }
        const url = await uploadFile(new File([bytes as unknown as BlobPart], base, { type: mime(base) }), tenantId, 'imported').catch(() => null);
        if (url) cache.set(base, url);
        return url;
      }

      if (data.design?.background_image) data.design.background_image = await upload(data.design.background_image);
      for (const c of data.categories ?? []) {
        if (c.image) c.image = await upload(c.image);
        for (const p of c.products ?? []) {
          if (p.image) p.image = await upload(p.image);
        }
        for (const sub of c.subcategories ?? []) {
          if (sub.image) sub.image = await upload(sub.image);
          for (const p of sub.products ?? []) {
            if (p.image) p.image = await upload(p.image);
          }
        }
      }
      // Images that the json names but the zip doesn't carry: worth saying,
      // but not worth failing the whole import over.
      if (missingImages.length) {
        setNotice(
          `${t('errMissingImages')}: ${missingImages.slice(0, 6).join(', ')}${missingImages.length > 6 ? '…' : ''}`,
        );
      }
      await runPreview(data);
    } catch (e) {
      fail(t('stageZip'), e);
    } finally {
      setBusy('');
    }
  }

  // ── AI JSON (image URLs re-hosted server-side on apply) ───────────────────
  async function handleJson(file: File) {
    setBusy('json');
    setError(null);
    setNotice(null);
    try {
      let data: FullImportPayload;
      try {
        data = JSON.parse(await file.text()) as FullImportPayload;
      } catch (e) {
        fail(t('stageJson'), e);
        return;
      }
      await runPreview(data);
    } catch (e) {
      fail(t('stageJson'), e);
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
      { Categoría: 'Pizzas', Subcategoría: '', Producto: 'Margarita', Descripción: 'Tomate, mozzarella, albahaca', Precio: 180, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: 'Más vendido' },
      { Categoría: 'Desayunos', Subcategoría: 'Para comenzar', Producto: 'Hot cakes', Descripción: 'Tres piezas con frutos rojos', Precio: 183, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: '' },
      { Categoría: 'Desayunos', Subcategoría: 'Omelettes', Producto: 'Omelette veggie', Descripción: '', Precio: 197, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: '' },
      { Categoría: 'Bebidas', Subcategoría: '', Producto: 'Limonada', Descripción: '', Precio: 45, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: '' },
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
    const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position;
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    // Parents in order, each followed by its subcategories, so an export can be
    // edited and re-imported without losing the nesting.
    const rowsFor = (c: (typeof categories)[number]) => {
      const parentName = c.parent_id ? (nameById.get(c.parent_id) ?? '') : c.name;
      const subName = c.parent_id ? c.name : '';
      for (const p of (byCat.get(c.id) ?? []).sort(byPos)) {
        data.push({
          Categoría: parentName, Subcategoría: subName,
          Producto: p.name, Descripción: p.description ?? '',
          Precio: p.price ?? '', 'Precio anterior': p.compare_at_price ?? '',
          Disponible: p.is_available ? 'Sí' : 'No', Etiquetas: (p.tags ?? []).join(', '),
        });
      }
    };
    for (const c of categories.filter((x) => !x.parent_id).sort(byPos)) {
      rowsFor(c);
      for (const sub of categories.filter((x) => x.parent_id === c.id).sort(byPos)) rowsFor(sub);
    }
    if (data.length === 0) data.push(Object.fromEntries(HEADERS.map((h) => [h, ''])));
    const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Menú');
    XLSX.writeFile(wb, 'menu.xlsx');
  }

  // Build the full import payload from the current menu (round-trips with import).
  function buildPayload(): FullImportPayload {
    const design: ImportDesign = {};
    for (const k of IMPORT_DESIGN_KEYS) {
      const v = theme[k];
      if (v != null) (design as Record<string, unknown>)[k] = v;
    }
    if (theme.background_image_url) design.background_image = theme.background_image_url;

    const byCat = new Map<string, Product[]>();
    for (const p of products) (byCat.get(p.category_id) ?? byCat.set(p.category_id, []).get(p.category_id)!).push(p);

    const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position;
    const productsOf = (catId: string): ImportProduct[] =>
      (byCat.get(catId) ?? []).sort(byPos).map((p): ImportProduct => {
        const groups = resolveOptionGroups(p).map((g) => ({
          name: g.name,
          description: g.description,
          kind: g.kind,
          required: g.required,
          multiple: g.multiple,
          options: g.options.map((o) => ({ name: o.name, price: o.price })),
        }));
        return {
          name: p.name,
          description: p.description ?? undefined,
          price: p.price,
          compareAtPrice: p.compare_at_price,
          cost: p.cost,
          available: p.is_available,
          hidden: p.is_hidden,
          tags: p.tags ?? [],
          image: p.image_url ?? undefined,
          prepTime: p.prep_time ?? undefined,
          calories: p.calories ?? undefined,
          ...(groups.length ? { optionGroups: groups } : {}),
        };
      });

    const cats: ImportCategory[] = categories
      .filter((c) => !c.parent_id)
      .sort(byPos)
      .map((c) => {
        const subs = categories.filter((x) => x.parent_id === c.id).sort(byPos);
        return {
          name: c.name,
          icon: c.icon ?? undefined,
          image: c.icon_image_url ?? undefined,
          theme: c.theme ?? undefined,
          products: productsOf(c.id),
          ...(subs.length
            ? {
                subcategories: subs.map((sub) => ({
                  name: sub.name,
                  icon: sub.icon ?? undefined,
                  image: sub.icon_image_url ?? undefined,
                  theme: sub.theme ?? undefined,
                  products: productsOf(sub.id),
                })),
              }
            : {}),
        };
      });

    return { design, categories: cats };
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    download(new Blob([JSON.stringify(buildPayload(), null, 2)], { type: 'application/json' }), 'menu.json');
  }

  async function exportZip() {
    setBusy('exportzip');
    try {
      const payload = buildPayload();
      const files: Record<string, Uint8Array> = {};
      let n = 0;
      const localize = async (url: string | null | undefined, hint: string): Promise<string | null | undefined> => {
        if (!url) return url;
        try {
          const res = await fetch(url);
          if (!res.ok) return url;
          const bytes = new Uint8Array(await res.arrayBuffer());
          const ext = (url.split('.').pop()?.split('?')[0] || 'jpg').slice(0, 4);
          const name = `${hint.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'img'}-${n++}.${ext}`;
          files[`images/${name}`] = bytes;
          return name;
        } catch {
          return url;
        }
      };
      if (payload.design?.background_image) payload.design.background_image = await localize(payload.design.background_image, 'background');
      // Category icons and subcategories travel in the zip too, so an export
      // round-trips through import without losing them.
      for (const c of payload.categories) {
        if (c.image) c.image = await localize(c.image, `cat-${c.name}`);
        for (const p of c.products ?? []) if (p.image) p.image = await localize(p.image, p.name);
        for (const sub of c.subcategories ?? []) {
          if (sub.image) sub.image = await localize(sub.image, `cat-${sub.name}`);
          for (const p of sub.products ?? []) if (p.image) p.image = await localize(p.image, p.name);
        }
      }
      files['menu.json'] = new TextEncoder().encode(JSON.stringify(payload, null, 2));
      download(new Blob([zipSync(files) as unknown as BlobPart]), 'menu.zip');
    } finally {
      setBusy('');
    }
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
        <Button variant="secondary" onClick={exportJson}>
          <FileJson className="h-4 w-4" /> {t('exportJson')}
        </Button>
        <Button variant="secondary" onClick={exportZip} disabled={!!busy}>
          {busy === 'exportzip' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} {t('exportZip')}
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

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">{t('errTitle')}</p>
          <p className="mt-1 break-words text-sm text-red-700">{error}</p>
          <p className="mt-2 text-xs text-red-600">{t('errHint')}</p>
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="break-words text-sm text-amber-800">{notice}</p>
        </div>
      )}
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
      "name": "Pizzas",  // Nombre de la sección/categoría. Aparece en la barra de categorías.
      "icon": "🍕",       // Un solo emoji que represente la categoría (opcional).
      "image": "https://...", // Icono/ilustración de la categoría para la barra: URL absoluta
                              // si el sitio usa iconos propios (SVG/PNG) por categoría. Si lo
                              // pones, se usa en lugar del emoji. Omítelo si no hay.
      // "subcategories" (opcional, UN solo nivel): si en la carta impresa una sección
      // tiene varios títulos dentro (p.ej. "Desayunos" con "Para comenzar",
      // "Omelettes y huevos", "Chilaquiles"), pon "Desayunos" como categoría y
      // cada título como subcategoría. Solo las categorías aparecen en la barra;
      // las subcategorías se muestran como títulos DENTRO de esa sección.
      // "theme" (opcional): el diseño PROPIO de esta sección. Úsalo cuando la carta cambia
      // de look por sección (p.ej. la sección de matcha en verde salvia y la de café en crema):
      // la página se desvanece a estos colores cuando esa sección está en pantalla.
      // Acepta las mismas llaves que "design" (colores #RRGGBB y fuentes), todas opcionales;
      // lo que no pongas hereda del menú. Omite "theme" si la sección no tiene look propio.
      "theme": { "primary_color": "#RRGGBB", "secondary_color": "#RRGGBB", "background_color": "#RRGGBB",
                 "text_color": "#RRGGBB", "card_color": "#RRGGBB", "button_color": "#RRGGBB",
                 "tab_selected_color": "#RRGGBB", "font_category": "Playfair Display", "font_product": "Outfit" },
      "subcategories": [
        { "name": "Para comenzar", "icon": "🥞", "image": "https://...", "products": [ /* mismos campos que abajo */ ] }
      ],
      "products": [
        {
          "name": "Margarita",
          "description": "Tomate, mozzarella y albahaca",
          "price": 180,              // Número, sin símbolo de moneda.
          "compareAtPrice": null,    // Precio anterior (tachado) si hay descuento; si no, null.
          "available": true,         // false si está AGOTADO (se muestra como no disponible).
          "hidden": false,           // true si el producto está OCULTO (no se muestra en el menú).
          "tags": ["bestseller"],    // Solo de: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
          "image": "https://...",    // URL absoluta de la foto del producto en el sitio (si existe).
          "prepTime": "15 min",      // Tiempo de preparación (opcional).
          "calories": 800,           // Calorías (opcional, número).
          "optionGroups": [          // Grupos de opciones que el cliente elige al ordenar.
            // "kind": "dish" = opción del platillo (por defecto); "takeaway" = opción para llevar
            // (empaque, cubiertos, salsas aparte). Se le muestra al cliente para distinguirlas.
            { "name":"Tamaño", "description":"", "kind":"dish", "required":true, "multiple":false,  // required=obligatorio. multiple:false = elige UNO (radio); true = elige VARIOS (checkbox).
              "options":[ {"name":"Chico","price":0}, {"name":"Grande","price":30} ] },  // price = costo EXTRA que se SUMA al precio base (0 si no agrega).
            // Cuando la carta dice "a su elección" (p.ej. "PROTEÍNA A SU ELECCIÓN" con
            // una lista debajo), eso es un optionGroup: el nombre es ese título y cada
            // ítem de la lista es una opción con price 0.
            { "name":"Proteína a su elección", "kind":"dish", "required":true, "multiple":false,
              "options":[ {"name":"Chilorio","price":0}, {"name":"Chorizo","price":0} ] },
            { "name":"Extras", "kind":"dish", "required":false, "multiple":true,
              "options":[ {"name":"Queso","price":20}, {"name":"Tocino","price":25} ] },
            { "name":"Para llevar", "kind":"takeaway", "required":false, "multiple":true,
              "options":[ {"name":"Cubiertos","price":0}, {"name":"Salsa aparte","price":0} ] },
            { "name":"Quitar ingredientes", "kind":"dish", "required":false, "multiple":true,
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
- "subcategories": si una sección tiene varios títulos internos, usa el nombre de la pestaña/menú como "name" de la categoría y cada título interno como subcategoría. NO concatenes nombres ("Desayunos · Para comenzar" está mal): son "Desayunos" con la subcategoría "Para comenzar". Máximo un nivel.
- Precios solo números, sin símbolo de moneda. "available": true salvo que diga agotado.
- "tags": usa SOLO de esta lista cuando aplique: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- "optionGroups": modela tamaños, extras y "quitar" como grupos. "required"=obligatorio, "multiple":false=elige uno / true=elige varios. El "price" de cada opción es el costo EXTRA que se suma al "price" base del producto (0 si no agrega). Si el producto no tiene opciones, omite "optionGroups".
- Toda lista del tipo "A SU ELECCIÓN" / "A ELEGIR" que aparezca bajo un platillo es un optionGroup de ese platillo (título = "name", cada renglón = una opción con price 0), NO productos sueltos ni una subcategoría.
- "kind" en cada optionGroup: "dish" para opciones del platillo, "takeaway" para opciones de para llevar (empaque, cubiertos, salsa aparte). Si no estás seguro, usa "dish".
- "image" y "background_image": URLs absolutas de las imágenes del sitio (si existen).
- Iconos de categoría: si la barra de categorías del sitio usa ilustraciones o iconos propios (no emojis), pon esa URL en el "image" de cada categoría. Si son emojis o no hay iconos, usa solo "icon" con un emoji representativo.
- No inventes datos: si un campo no está, omítelo (o null donde corresponda).

Puedes entregar el resultado como un archivo .json, o dentro de un .zip junto a una carpeta "images/" con las fotos (en ese caso, en "image" y "background_image" pon el nombre del archivo, p.ej. "margarita.jpg").
Devuelve solo el JSON.`;

const ZIP_PROMPT_ES = `Eres un asistente con navegación web y capacidad de ejecutar código (descargar archivos y crear un .zip). A partir de esta página de menú de restaurante: {URL}

Genera un ARCHIVO .ZIP listo para importar, que contenga:
1) "menu.json" en la raíz, con esta estructura exacta:
${SCHEMA_ES}
2) Una carpeta "images/" con TODAS las imágenes (fotos de productos, iconos de categoría y la imagen de fondo).

Reglas:
- Las "//" son explicaciones; NO las incluyas en menu.json. Debe ser JSON puro y válido.
- En "image" (de productos Y de categorías) y "background_image" NO uses URLs: usa el NOMBRE de archivo de la imagen ya descargada (p.ej. "margarita.jpg", "icono-pizzas.svg"), y guarda ese archivo dentro de "images/" con ese mismo nombre. Usa nombres únicos y sin espacios.
- Descarga realmente cada imagen del sitio y agrégala a la carpeta "images/" del .zip.
- TODOS los colores en #RRGGBB; detecta los colores reales del sitio (fondo, tarjetas, botones, pestañas de categorías, textos, acentos).
- Precios solo números. "tags" solo de: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- Usa "subcategories" cuando una sección tenga títulos internos; no concatenes nombres.
- Las listas "A SU ELECCIÓN" bajo un platillo son "optionGroups" de ese platillo, con "kind":"dish" (o "takeaway" si es para llevar).
- No inventes datos: omite el campo (o null) si no está.

Entrégame el archivo .zip para descargar.`;

const TABLE_PROMPT_ES = `Ayúdame a crear el menú de mi restaurante como una tabla que pueda pegar en Excel/Google Sheets. Usa EXACTAMENTE estas columnas en la primera fila:
Categoría | Subcategoría | Producto | Descripción | Precio | Precio anterior | Disponible | Etiquetas

Reglas:
- Una fila por producto; repite la Categoría en cada producto de esa sección.
- Subcategoría: déjala VACÍA salvo que la sección tenga títulos internos. Si en la carta
  "Desayunos" agrupa "Para comenzar", "Omelettes y huevos", "Chilaquiles", entonces
  Categoría = Desayunos y Subcategoría = el título que corresponda. Solo la Categoría
  aparece en la barra de categorías; la Subcategoría es un título dentro de esa sección.
- Precio: solo números. "Precio anterior" solo si hay descuento (si no, déjalo vacío).
- Disponible: "Sí" o "No".
- Etiquetas (opcional, separadas por coma): Nuevo, Más vendido, Picante, Vegano, Vegetariano, Sin gluten, De la casa, Promo.
- No inventes precios; si no los sé, déjalos vacíos.

Aquí está mi menú (pégalo o descríbelo):`;

const TABLE_PROMPT_EN = `Help me build my restaurant menu as a table I can paste into Excel/Google Sheets. Use EXACTLY these columns in the first row:
Category | Subcategory | Product | Description | Price | Compare price | Available | Tags

Rules:
- One row per product; repeat the Category for each product in that section.
- Subcategory: leave it EMPTY unless the section has headings inside it. If the printed
  menu groups "Breakfast" into "To start", "Omelettes and eggs", "Chilaquiles", then
  Category = Breakfast and Subcategory = the matching heading. Only the Category shows
  in the category bar; the Subcategory is a heading inside that section.
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
      "name": "Pizzas",  // Section/category name. Appears in the category bar.
      "icon": "🍕",       // A single emoji representing the category (optional).
      "image": "https://...", // Category icon/illustration for the bar: absolute URL when the
                              // site uses its own per-category icons (SVG/PNG). When present it
                              // is used instead of the emoji. Omit if there is none.
      // "subcategories" (optional, ONE level only): when a printed section holds
      // several headings inside it (e.g. "Breakfast" with "To start", "Omelettes
      // and eggs", "Chilaquiles"), make "Breakfast" the category and each heading
      // a subcategory. Only categories appear in the bar; subcategories render as
      // headings INSIDE that section.
      // "theme" (optional): this section's OWN design. Use it when the menu changes look per
      // section (e.g. the matcha section on sage green, the coffee section on cream): the page
      // fades to these colours while that section is on screen. Same keys as "design"
      // (#RRGGBB colours and fonts), all optional; anything left out inherits from the menu.
      // Omit "theme" when the section has no look of its own.
      "theme": { "primary_color": "#RRGGBB", "secondary_color": "#RRGGBB", "background_color": "#RRGGBB",
                 "text_color": "#RRGGBB", "card_color": "#RRGGBB", "button_color": "#RRGGBB",
                 "tab_selected_color": "#RRGGBB", "font_category": "Playfair Display", "font_product": "Outfit" },
      "subcategories": [
        { "name": "To start", "icon": "🥞", "image": "https://...", "products": [ /* same fields as below */ ] }
      ],
      "products": [
        {
          "name": "Margherita",
          "description": "Tomato, mozzarella and basil",
          "price": 180,              // Number, no currency symbol.
          "compareAtPrice": null,    // Previous (struck-through) price if discounted; otherwise null.
          "available": true,         // false if SOLD OUT (shown as unavailable).
          "hidden": false,           // true if the product is HIDDEN (not shown on the menu).
          "tags": ["bestseller"],    // Only from: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
          "image": "https://...",    // Absolute URL of the product photo on the site (if any).
          "prepTime": "15 min",      // Prep time (optional).
          "calories": 800,           // Calories (optional, number).
          "optionGroups": [          // Option groups the customer picks when ordering.
            // "kind": "dish" = part of the dish (default); "takeaway" = to-go option
            // (packaging, cutlery, sauce on the side). Shown to the guest so they can tell them apart.
            { "name":"Size", "description":"", "kind":"dish", "required":true, "multiple":false,  // required=mandatory. multiple:false = choose ONE (radio); true = choose MANY (checkbox).
              "options":[ {"name":"Small","price":0}, {"name":"Large","price":30} ] },  // price = EXTRA cost ADDED to the base price (0 if none).
            // When the menu says "your choice of" (e.g. "CHOICE OF PROTEIN" with a
            // list underneath), that is an optionGroup: the heading is the name and
            // each listed item is an option with price 0.
            { "name":"Choice of protein", "kind":"dish", "required":true, "multiple":false,
              "options":[ {"name":"Chicken","price":0}, {"name":"Beef","price":0} ] },
            { "name":"Extras", "kind":"dish", "required":false, "multiple":true,
              "options":[ {"name":"Cheese","price":20}, {"name":"Bacon","price":25} ] },
            { "name":"To go", "kind":"takeaway", "required":false, "multiple":true,
              "options":[ {"name":"Cutlery","price":0}, {"name":"Sauce on the side","price":0} ] },
            { "name":"Remove", "kind":"dish", "required":false, "multiple":true,
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
- "subcategories": when a section has several headings inside it, use the tab/menu name as the category "name" and each inner heading as a subcategory. Do NOT concatenate names ("Breakfast · To start" is wrong): that is "Breakfast" with the subcategory "To start". One level maximum.
- Prices numbers only, no currency symbol. "available": true unless sold out.
- "tags": ONLY from this list when relevant: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- "optionGroups": model sizes, extras and "remove" as groups. "required"=mandatory, "multiple":false=choose one / true=choose many. Each option's "price" is the EXTRA cost added to the product's base "price" (0 if none). Omit "optionGroups" if the product has no options.
- Any "YOUR CHOICE OF" / "CHOICE OF" list printed under a dish is an optionGroup of that dish (heading = "name", each line = an option with price 0), NOT separate products and NOT a subcategory.
- "kind" on each optionGroup: "dish" for options of the dish itself, "takeaway" for to-go options (packaging, cutlery, sauce on the side). Use "dish" when unsure.
- "image" and "background_image": absolute URLs of the site's images (if any).
- Category icons: if the site's category bar uses its own illustrations or icons (not emoji), put that URL in each category's "image". If they are emoji or there are none, just use "icon" with a representative emoji.
- Don't invent data: omit a field (or null where appropriate) if it's missing.

You may deliver the result as a .json file, or inside a .zip with an "images/" folder of the photos (in that case put the file name in "image" and "background_image", e.g. "margherita.jpg").
Return only the JSON.`;

const ZIP_PROMPT_EN = `You are an assistant with web browsing and code execution (download files and create a .zip). From this restaurant menu page: {URL}

Produce a ready-to-import .ZIP FILE containing:
1) "menu.json" at the root, with this exact structure:
${SCHEMA_EN}
2) An "images/" folder with ALL images (product photos, category icons and the background image).

Rules:
- The "//" are explanations; do NOT include them in menu.json. It must be pure, valid JSON.
- In "image" and "background_image" do NOT use URLs: use the FILE NAME of the downloaded image (e.g. "margherita.jpg"), and save that file inside "images/" with the same name. Use unique names with no spaces.
- Actually download each image from the site and add it to the .zip's "images/" folder.
- ALL colors in #RRGGBB; detect the site's real colors (background, cards, buttons, category tabs, text, accent).
- Prices numbers only. "tags" only from: new, bestseller, spicy, vegan, vegetarian, glutenfree, house, promo.
- Use "subcategories" when a section has inner headings; never concatenate names.
- "YOUR CHOICE OF" lists under a dish are "optionGroups" of that dish, with "kind":"dish" (or "takeaway" for to-go).
- Don't invent data: omit the field (or null) if missing.

Give me the .zip file to download.`;
