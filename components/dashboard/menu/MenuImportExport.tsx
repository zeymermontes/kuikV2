'use client';

import { useRef, useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, FileSpreadsheet, Sparkles, Check, Loader2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Category, Product } from '@/lib/database.types';
import { BADGES } from '@/lib/badges';
import { Button } from '@/components/ui';
import {
  previewImport,
  applyImport,
  type ImportRow,
  type ImportPreview,
} from '@/app/(dashboard)/menu/import-actions';

const HEADERS = ['Categoría', 'Producto', 'Descripción', 'Precio', 'Precio anterior', 'Disponible', 'Etiquetas'];

const strip = (s: string) =>
  s.toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function headerField(h: string): keyof ImportRow | 'compareAt' | null {
  const k = strip(h);
  if (['categoria', 'category', 'seccion', 'section'].includes(k)) return 'category';
  if (['producto', 'product', 'nombre', 'name', 'platillo'].includes(k)) return 'name';
  if (['descripcion', 'description', 'desc'].includes(k)) return 'description';
  if (['precio', 'price'].includes(k)) return 'price';
  if (['precio anterior', 'compare price', 'precioanterior', 'antes', 'compare'].includes(k)) return 'compareAt';
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

function parsePrice(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseAvailable(v: unknown): boolean {
  const k = strip(String(v ?? ''));
  if (['no', 'false', '0', 'agotado'].includes(k)) return false;
  return true;
}
function parseTags(v: unknown): string[] {
  return String(v ?? '')
    .split(/[,;]/)
    .map((t) => strip(t))
    .filter(Boolean)
    .map((t) => TAG_LOOKUP.get(t) ?? t);
}

export function MenuImportExport({
  branchId,
  categories,
  products,
}: {
  branchId: string | null;
  categories: Category[];
  products: Product[];
}) {
  const t = useTranslations('menuImport');
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  // ── Parse an uploaded file → canonical rows → preview ──────────────────────
  async function handleFile(file: File) {
    setBusy(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const parsed: ImportRow[] = [];
      for (const r of raw) {
        const row: ImportRow = { category: '', name: '' };
        for (const [header, value] of Object.entries(r)) {
          const field = headerField(header);
          if (field === 'category') row.category = String(value).trim();
          else if (field === 'name') row.name = String(value).trim();
          else if (field === 'description') row.description = String(value).trim();
          else if (field === 'price') row.price = parsePrice(value);
          else if (field === 'compareAt') row.compareAt = parsePrice(value);
          else if (field === 'available') row.available = parseAvailable(value);
          else if (field === 'tags') row.tags = parseTags(value);
        }
        if (row.category && row.name) parsed.push(row);
      }

      if (parsed.length === 0) {
        alert(t('emptyFile'));
        return;
      }
      setRows(parsed);
      setPreview(await previewImport(parsed, branchId));
    } catch {
      alert(t('parseError'));
    } finally {
      setBusy(false);
    }
  }

  function apply(deleteMissing: boolean) {
    if (!rows) return;
    start(async () => {
      await applyImport(rows, branchId, deleteMissing);
      setRows(null);
      setPreview(null);
    });
  }

  // ── Downloads ──────────────────────────────────────────────────────────────
  function downloadTemplate() {
    const sample = [
      { Categoría: 'Pizzas', Producto: 'Margarita', Descripción: 'Salsa de tomate, mozzarella y albahaca', Precio: 180, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: 'Más vendido' },
      { Categoría: 'Pizzas', Producto: 'Pepperoni', Descripción: '', Precio: 200, 'Precio anterior': 230, Disponible: 'Sí', Etiquetas: 'Picante' },
      { Categoría: 'Bebidas', Producto: 'Limonada', Descripción: '', Precio: 45, 'Precio anterior': '', Disponible: 'Sí', Etiquetas: '' },
    ];
    writeSheet(sample, 'plantilla-menu.xlsx');
  }

  function exportMenu() {
    const byCat = new Map<string, Product[]>();
    for (const p of products) {
      if (!byCat.has(p.category_id)) byCat.set(p.category_id, []);
      byCat.get(p.category_id)!.push(p);
    }
    const data: Record<string, unknown>[] = [];
    for (const c of [...categories].sort((a, b) => a.position - b.position)) {
      const items = (byCat.get(c.id) ?? []).sort((a, b) => a.position - b.position);
      for (const p of items) {
        data.push({
          Categoría: c.name,
          Producto: p.name,
          Descripción: p.description ?? '',
          Precio: p.price ?? '',
          'Precio anterior': p.compare_at_price ?? '',
          Disponible: p.is_available ? 'Sí' : 'No',
          Etiquetas: (p.tags ?? []).join(', '),
        });
      }
    }
    if (data.length === 0) data.push(Object.fromEntries(HEADERS.map((h) => [h, ''])));
    writeSheet(data, 'menu.xlsx');
  }

  function writeSheet(data: Record<string, unknown>[], filename: string) {
    const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Menú');
    XLSX.writeFile(wb, filename);
  }

  function copyForAI() {
    const prompt =
      locale === 'en'
        ? `Create a restaurant menu as a table (Excel/CSV) with EXACTLY these columns in the first row: Category, Product, Description, Price, Compare price, Available, Tags.
- One row per product. "Category" groups products into sections.
- "Price" and "Compare price": numbers only, no currency symbol. Leave "Compare price" empty unless it's on sale.
- "Available": Yes or No.
- "Tags": comma-separated, choose from: New, Bestseller, Spicy, Vegan, Vegetarian, Gluten-free, House special, On sale. Leave empty if none.
Output it as a clean table ready to paste into Excel. Fill it with my menu below:`
        : `Crea el menú de un restaurante como una tabla (Excel/CSV) con EXACTAMENTE estas columnas en la primera fila: Categoría, Producto, Descripción, Precio, Precio anterior, Disponible, Etiquetas.
- Una fila por producto. "Categoría" agrupa los productos en secciones.
- "Precio" y "Precio anterior": solo números, sin símbolo de moneda. Deja "Precio anterior" vacío salvo que esté en oferta.
- "Disponible": Sí o No.
- "Etiquetas": separadas por coma, elige de: Nuevo, Más vendido, Picante, Vegano, Vegetariano, Sin gluten, De la casa, Promoción. Déjalo vacío si no aplica.
Devuélvelo como una tabla limpia lista para pegar en Excel. Llénalo con mi menú de abajo:`;
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <FileSpreadsheet className="h-4 w-4" /> {t('title')}
      </h2>
      <p className="mb-3 text-sm text-neutral-500">{t('subtitle')}</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t('import')}
        </Button>
        <Button variant="secondary" onClick={exportMenu}>
          <Download className="h-4 w-4" /> {t('export')}
        </Button>
        <Button variant="ghost" onClick={downloadTemplate}>
          <FileSpreadsheet className="h-4 w-4" /> {t('template')}
        </Button>
        <Button variant="ghost" onClick={copyForAI}>
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Sparkles className="h-4 w-4" />}
          {copied ? t('copied') : t('copyAI')}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {/* Import confirmation popup */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !pending && setPreview(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="mb-3 font-semibold">{t('confirmTitle')}</h3>
            <ul className="mb-4 space-y-1 text-sm">
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
                <Button className="w-full" onClick={() => apply(false)}>
                  {t('addUpdateOnly')}
                </Button>
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => apply(true)}
                  disabled={preview.missingProducts === 0 && preview.missingCategories === 0}
                >
                  {t('deleteMissing', { n: preview.missingProducts })}
                </Button>
                <button
                  onClick={() => setPreview(null)}
                  className="w-full py-1 text-center text-sm text-neutral-400 hover:text-neutral-600"
                >
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

function Li({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className={`font-semibold ${tone ?? ''}`}>{value}</span>
    </li>
  );
}
