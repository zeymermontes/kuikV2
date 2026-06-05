'use client';

import { useMemo, useState, useTransition } from 'react';
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
} from '@dnd-kit/sortable';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  SeparatorHorizontal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category, Product, Separator } from '@/lib/database.types';
import { Input } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import {
  updateCategory,
  deleteCategory,
  addProduct,
  addSeparator,
  reorderEntries,
} from '@/app/(dashboard)/menu/actions';
import { ProductEditor } from './ProductEditor';
import { SeparatorEditor } from './SeparatorEditor';

type Entry =
  | { kind: 'product'; id: string; data: Product }
  | { kind: 'separator'; id: string; data: Separator };

export function CategoryEditor({
  tenantId,
  category,
  products,
  separators,
}: {
  tenantId: string;
  category: Category;
  products: Product[];
  separators: Separator[];
}) {
  const t = useTranslations('menuEditor');
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const initialEntries = useMemo<Entry[]>(
    () =>
      [
        ...products.map((p) => ({ kind: 'product' as const, id: p.id, data: p })),
        ...separators.map((s) => ({ kind: 'separator' as const, id: s.id, data: s })),
      ].sort((a, b) => a.data.position - b.data.position),
    [products, separators],
  );
  const [entries, setEntries] = useState<Entry[]>(initialEntries);

  // Re-sync with the server after add/delete/save revalidates the page. React's
  // recommended "adjust state during render" pattern: when the server data
  // (initialEntries) changes identity, adopt it. Without this the list looks stale.
  const [prevInitial, setPrevInitial] = useState(initialEntries);
  if (prevInitial !== initialEntries) {
    setPrevInitial(initialEntries);
    setEntries(initialEntries);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((x) => x.id === active.id);
    const newIndex = entries.findIndex((x) => x.id === over.id);
    const next = arrayMove(entries, oldIndex, newIndex);
    setEntries(next);
    startTransition(() =>
      reorderEntries(next.map((x) => ({ kind: x.kind, id: x.id }))),
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => setOpen((o) => !o)} className="text-neutral-400">
          {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
        <Input
          key={category.name}
          defaultValue={category.name}
          onBlur={(e) =>
            e.target.value !== category.name &&
            updateCategory(category.id, { name: e.target.value })
          }
          className="flex-1 font-semibold"
        />
        <button
          onClick={() => updateCategory(category.id, { is_visible: !category.is_visible })}
          title={t('visible')}
          className="p-2 text-neutral-400 hover:text-neutral-700"
        >
          {category.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          onClick={() => confirm('¿Eliminar categoría?') && deleteCategory(category.id)}
          className="p-2 text-neutral-400 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="border-t border-neutral-100 p-3">
          {/* Tab icon / image */}
          <div className="mb-4 rounded-xl bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-500">{t('tabIcon')}</p>
            <div className="flex items-start gap-3">
              <div className="w-20">
                <Input
                  defaultValue={category.icon ?? ''}
                  placeholder="🌮"
                  maxLength={4}
                  onBlur={(e) => updateCategory(category.id, { icon: e.target.value || null })}
                  className="text-center text-xl"
                />
                <p className="mt-1 text-center text-[10px] text-neutral-400">{t('emoji')}</p>
              </div>
              <div className="flex-1">
                <ImageUploader
                  value={category.icon_image_url}
                  tenantId={tenantId}
                  folder="icons"
                  shape="square"
                  onChange={(url) => updateCategory(category.id, { icon_image_url: url })}
                />
                <p className="mt-1 text-[10px] text-neutral-400">{t('tabIconHint')}</p>
              </div>
            </div>
          </div>

          {/* Section banner */}
          <div className="mb-4 rounded-xl bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-500">{t('banner')}</p>
            <Input
              defaultValue={category.banner_name ?? ''}
              placeholder={t('bannerName')}
              onBlur={(e) =>
                updateCategory(category.id, { banner_name: e.target.value || null })
              }
              className="mb-3"
            />
            <ImageUploader
              value={category.banner_image_url}
              tenantId={tenantId}
              folder="banners"
              shape="wide"
              onChange={(url) => updateCategory(category.id, { banner_image_url: url })}
            />
          </div>

          {/* Entries */}
          {entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">{t('empty')}</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {entries.map((e) =>
                    e.kind === 'product' ? (
                      <ProductEditor key={e.id} tenantId={tenantId} product={e.data} />
                    ) : (
                      <SeparatorEditor key={e.id} separator={e.data} />
                    ),
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Add buttons */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => startTransition(() => addProduct(category.id, t('productName')))}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Plus className="h-4 w-4" /> {t('addProduct')}
            </button>
            <button
              onClick={() => startTransition(() => addSeparator(category.id, 'line', null))}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <SeparatorHorizontal className="h-4 w-4" /> {t('addSeparator')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
