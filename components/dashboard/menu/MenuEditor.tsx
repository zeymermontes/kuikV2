'use client';

import { useState, useTransition } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Settings2,
  SeparatorHorizontal,
  ChevronRight,
  ImageIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Category, Product, Separator } from '@/lib/database.types';
import {
  addCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  addProduct,
  addSeparator,
  reorderEntries,
  updateProduct,
} from '@/app/(dashboard)/menu/actions';
import { ProductDrawer } from './ProductDrawer';
import { CategoryDrawer } from './CategoryDrawer';
import { SeparatorEditor } from './SeparatorEditor';

type Entry =
  | { kind: 'product'; id: string; data: Product }
  | { kind: 'separator'; id: string; data: Separator };

type DrawerState =
  | { kind: 'product'; id: string }
  | { kind: 'category'; id: string }
  | null;

export function MenuEditor({
  tenantId,
  categories,
  products,
  separators,
}: {
  tenantId: string;
  categories: Category[];
  products: Product[];
  separators: Separator[];
}) {
  const t = useTranslations('menuEditor');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [, startTransition] = useTransition();

  // Local mirror of server data; re-synced whenever the server sends fresh props.
  const [cats, setCats] = useState(categories);
  const [prods, setProds] = useState(products);
  const [seps, setSeps] = useState(separators);
  const [prev, setPrev] = useState({ categories, products, separators });
  if (prev.categories !== categories || prev.products !== products || prev.separators !== separators) {
    setPrev({ categories, products, separators });
    setCats(categories);
    setProds(products);
    setSeps(separators);
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const selectedCat = cats.find((c) => c.id === selectedId) ?? cats[0];

  function countFor(catId: string) {
    return prods.filter((p) => p.category_id === catId).length;
  }

  // Entries (products + separators) of the selected category, ordered.
  const entries: Entry[] = selectedCat
    ? [
        ...prods
          .filter((p) => p.category_id === selectedCat.id)
          .map((p) => ({ kind: 'product' as const, id: p.id, data: p })),
        ...seps
          .filter((s) => s.category_id === selectedCat.id)
          .map((s) => ({ kind: 'separator' as const, id: s.id, data: s })),
      ].sort((a, b) => a.data.position - b.data.position)
    : [];

  function handleCatDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = cats.findIndex((c) => c.id === active.id);
    const newI = cats.findIndex((c) => c.id === over.id);
    const next = arrayMove(cats, oldI, newI);
    setCats(next);
    startTransition(() => reorderCategories(next.map((c) => c.id)));
  }

  function handleEntryDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = entries.findIndex((x) => x.id === active.id);
    const newI = entries.findIndex((x) => x.id === over.id);
    const next = arrayMove(entries, oldI, newI);
    const posById = new Map(next.map((x, i) => [x.id, i]));
    setProds((ps) => ps.map((p) => (posById.has(p.id) ? { ...p, position: posById.get(p.id)! } : p)));
    setSeps((ss) => ss.map((s) => (posById.has(s.id) ? { ...s, position: posById.get(s.id)! } : s)));
    startTransition(() => reorderEntries(next.map((x) => ({ kind: x.kind, id: x.id }))));
  }

  const drawerProduct = drawer?.kind === 'product' ? prods.find((p) => p.id === drawer.id) : undefined;
  const drawerCategory = drawer?.kind === 'category' ? cats.find((c) => c.id === drawer.id) : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {/* ── Categories panel ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2.5">
          <span className="text-sm font-semibold">{t('categories')}</span>
          <button
            onClick={() => startTransition(() => addCategory(t('newCategory')))}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
          >
            <Plus className="h-3.5 w-3.5" /> {t('addCategory')}
          </button>
        </div>

        {cats.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-neutral-400">{t('noCategories')}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
            <SortableContext items={cats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="max-h-[60vh] overflow-y-auto p-1.5 md:max-h-none">
                {cats.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    count={countFor(c.id)}
                    selected={selectedCat?.id === c.id}
                    onSelect={() => setSelectedId(c.id)}
                    onEdit={() => setDrawer({ kind: 'category', id: c.id })}
                    onToggleVisible={() => updateCategory(c.id, { is_visible: !c.is_visible })}
                    onDelete={() => confirm(t('confirmDeleteCategory')) && deleteCategory(c.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ── Products panel ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        {!selectedCat ? (
          <p className="px-4 py-10 text-center text-sm text-neutral-400">{t('selectCategory')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
              <span className="font-semibold">{selectedCat.name}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => startTransition(() => addProduct(selectedCat.id, t('newProduct')))}
                  className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('addProduct')}
                </button>
                <button
                  onClick={() => startTransition(() => addSeparator(selectedCat.id, 'line', null))}
                  className="flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <SeparatorHorizontal className="h-3.5 w-3.5" /> {t('addSeparator')}
                </button>
              </div>
            </div>

            {entries.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutral-400">{t('empty')}</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEntryDragEnd}>
                <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5 p-2">
                    {entries.map((e) =>
                      e.kind === 'product' ? (
                        <ProductRow
                          key={e.id}
                          product={e.data}
                          onEdit={() => setDrawer({ kind: 'product', id: e.id })}
                          onToggleAvailable={() => updateProduct(e.data.id, { is_available: !e.data.is_available })}
                        />
                      ) : (
                        <SeparatorEditor key={e.id} separator={e.data} />
                      ),
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </>
        )}
      </div>

      {drawerProduct && <ProductDrawer tenantId={tenantId} product={drawerProduct} onClose={() => setDrawer(null)} />}
      {drawerCategory && <CategoryDrawer tenantId={tenantId} category={drawerCategory} onClose={() => setDrawer(null)} />}
    </div>
  );
}

// ── Category row (sortable) ───────────────────────────────────────────────
function CategoryRow({
  category,
  count,
  selected,
  onSelect,
  onEdit,
  onToggleVisible,
  onDelete,
}: {
  category: Category;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 rounded-xl px-1.5 py-1.5 ${selected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}
    >
      <button {...attributes} {...listeners} className={`cursor-grab touch-none ${selected ? 'text-white/50' : 'text-neutral-300'}`}>
        <GripVertical className="h-4 w-4" />
      </button>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {category.icon && <span className="text-base leading-none">{category.icon}</span>}
        <span className="truncate text-sm font-medium">{category.name}</span>
        <span className={`shrink-0 rounded-full px-1.5 text-[10px] ${selected ? 'bg-white/20' : 'bg-neutral-200 text-neutral-600'}`}>{count}</span>
      </button>
      <div className={`flex shrink-0 items-center ${selected ? '' : 'opacity-0 group-hover:opacity-100'}`}>
        <IconBtn onClick={onToggleVisible} selected={selected}>
          {category.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconBtn>
        <IconBtn onClick={onEdit} selected={selected}>
          <Settings2 className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={onDelete} selected={selected} danger>
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
    </div>
  );
}

// ── Product row (sortable) ────────────────────────────────────────────────
function ProductRow({
  product,
  onEdit,
  onToggleAvailable,
}: {
  product: Product;
  onEdit: () => void;
  onToggleAvailable: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 ${product.is_available ? '' : 'opacity-60'}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-neutral-300">
        <GripVertical className="h-4 w-4" />
      </button>

      {product.image_url ? (
        <Image src={product.image_url} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
          <ImageIcon className="h-4 w-4" />
        </span>
      )}

      <button onClick={onEdit} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-medium">{product.name}</span>
        {product.price != null && <span className="text-xs text-neutral-500">{product.price}</span>}
      </button>

      <button
        onClick={onToggleAvailable}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          product.is_available ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-500'
        }`}
      >
        {product.is_available ? '●' : '○'}
      </button>
      <button onClick={onEdit} className="shrink-0 p-1 text-neutral-400 hover:text-neutral-700">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function IconBtn({
  onClick,
  selected,
  danger,
  children,
}: {
  onClick: () => void;
  selected: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md p-1 ${
        selected ? 'text-white/70 hover:text-white' : danger ? 'text-neutral-400 hover:text-red-500' : 'text-neutral-400 hover:text-neutral-700'
      }`}
    >
      {children}
    </button>
  );
}
