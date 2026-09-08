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
  CornerDownRight,
  ListPlus,
  CheckSquare,
  ClipboardPaste,
  Square,
  ArrowUpDown,
  PencilLine,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Category, OptionGroup, Product, Separator } from '@/lib/database.types';
import { OPTION_CLIPBOARD_ALL, OPTION_CLIPBOARD_GROUP, groupSignature, hasGroupNamed, hasRepeatedGroups, mergeOptionGroups, moveGroupByName, resolveOptionGroups } from '@/lib/menu-options';
import {
  addCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  addProduct,
  addSeparator,
  reorderEntries,
  updateProduct,
  setProductsOptionGroups,
} from '@/app/(dashboard)/menu/actions';
import { ProductDrawer } from './ProductDrawer';
import { OptionGroupCard } from './OptionGroupsEditor';
import { CategoryDrawer } from './CategoryDrawer';
import { SeparatorEditor } from './SeparatorEditor';

/** Ids for pasted groups; only ever called from event handlers. */
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

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
  branchId = null,
  showPosSettings = false,
}: {
  tenantId: string;
  categories: Category[];
  products: Product[];
  separators: Separator[];
  branchId?: string | null;
  /** KDS station routing is still in development — see lib/features.ts. */
  showPosSettings?: boolean;
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

  // Multi-select: tick products (across categories) and paste option groups
  // onto all of them, from what the drawer copied to the clipboard.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pasteAsk, setPasteAsk] = useState<{ groups: OptionGroup[]; repeats: number } | null>(null);
  const [pasteDone, setPasteDone] = useState<number | null>(null);
  // "Move the Tamaño group to the top on every product": pick a name, pick an end.
  const [moveAsk, setMoveAsk] = useState<{ name: string; to: 'first' | 'last' } | null>(null);
  const pickedProducts = prods.filter((p) => picked.has(p.id));
  // Group names across the ticked products, most common first.
  const pickedGroupNames = (() => {
    const count = new Map<string, { name: string; n: number }>();
    for (const p of pickedProducts)
      for (const g of resolveOptionGroups(p)) {
        const key = g.name.trim().toLowerCase();
        if (!key) continue;
        const cur = count.get(key) ?? { name: g.name.trim(), n: 0 };
        cur.n += 1;
        count.set(key, cur);
      }
    return [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  })();
  // "Change the price of Grande on every product": edit one version of the
  // group and write it over the group of that name on each product that has it.
  const [editAsk, setEditAsk] = useState<{ name: string; draft: OptionGroup; have: number; versions: number } | null>(null);
  function beginEditGroup(name: string) {
    const holders = pickedProducts.filter((p) => hasGroupNamed(resolveOptionGroups(p), name));
    // The most common version is the starting point.
    const count = new Map<string, { g: OptionGroup; n: number }>();
    for (const p of holders) {
      const g = resolveOptionGroups(p).find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (!g) continue;
      const sig = groupSignature(g);
      const cur = count.get(sig) ?? { g, n: 0 };
      cur.n += 1;
      count.set(sig, cur);
    }
    const best = [...count.values()].sort((a, b) => b.n - a.n)[0];
    if (!best) return;
    const draft: OptionGroup = { ...best.g, id: uid(), options: best.g.options.map((o) => ({ ...o })) };
    setEditAsk({ name, draft, have: holders.length, versions: count.size });
  }
  async function applyEdit(name: string, draft: OptionGroup) {
    setEditAsk(null);
    const items = pickedProducts
      .filter((p) => hasGroupNamed(resolveOptionGroups(p), name))
      .map((p) => ({ id: p.id, option_groups: mergeOptionGroups(resolveOptionGroups(p), [{ ...draft, name: draft.name.trim() || name }], 'overwrite', uid, name) }));
    if (items.length === 0) return;
    const byId = new Map(items.map((it) => [it.id, it.option_groups]));
    setProds((ps) => ps.map((p) => (byId.has(p.id) ? { ...p, option_groups: byId.get(p.id)!, variants: [], modifiers: [], removables: [] } : p)));
    await setProductsOptionGroups(items);
    setPasteDone(items.length);
    setTimeout(() => setPasteDone(null), 3000);
    stopSelecting();
  }
  async function applyMove(name: string, to: 'first' | 'last') {
    setMoveAsk(null);
    const items = pickedProducts
      .map((p) => {
        const groups = resolveOptionGroups(p);
        const next = moveGroupByName(groups, name, to);
        return next === groups ? null : { id: p.id, option_groups: next };
      })
      .filter((x): x is { id: string; option_groups: OptionGroup[] } => x !== null);
    if (items.length === 0) return;
    const byId = new Map(items.map((it) => [it.id, it.option_groups]));
    setProds((ps) => ps.map((p) => (byId.has(p.id) ? { ...p, option_groups: byId.get(p.id)!, variants: [], modifiers: [], removables: [] } : p)));
    await setProductsOptionGroups(items);
    setPasteDone(items.length);
    setTimeout(() => setPasteDone(null), 3000);
    stopSelecting();
  }

  function togglePick(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }
  function readClipboard(key: string): OptionGroup[] | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const v = JSON.parse(raw) as OptionGroup | OptionGroup[];
      const arr = Array.isArray(v) ? v : [v];
      return arr.length && arr.every((g) => g && typeof g.name === 'string' && Array.isArray(g.options)) ? arr : null;
    } catch {
      return null;
    }
  }
  /** Paste starts here: with a repeat anywhere, ask how; otherwise just append. */
  function beginPaste(key: string) {
    const groups = readClipboard(key);
    if (!groups) return alert(t('pasteHint'));
    const targets = prods.filter((p) => picked.has(p.id));
    const repeats = targets.filter((p) => hasRepeatedGroups(resolveOptionGroups(p), groups)).length;
    if (repeats > 0) setPasteAsk({ groups, repeats });
    else void applyPaste(groups, 'duplicate');
  }
  async function applyPaste(groups: OptionGroup[], mode: 'overwrite' | 'duplicate') {
    setPasteAsk(null);
    const items = prods.filter((p) => picked.has(p.id)).map((p) => ({ id: p.id, option_groups: mergeOptionGroups(resolveOptionGroups(p), groups, mode, uid) }));
    const byId = new Map(items.map((it) => [it.id, it.option_groups]));
    setProds((ps) => ps.map((p) => (byId.has(p.id) ? { ...p, option_groups: byId.get(p.id)!, variants: [], modifiers: [], removables: [] } : p)));
    await setProductsOptionGroups(items);
    setPasteDone(items.length);
    setTimeout(() => setPasteDone(null), 3000);
    stopSelecting();
  }

  // The sidebar shows parents in order, each followed by its subcategories.
  // Order comes from `position`, not from the array: a drag updates positions
  // optimistically and the list has to follow before the server answers.
  const byPos = (a: Category, b: Category) => a.position - b.position;
  const parents = cats.filter((c) => !c.parent_id).sort(byPos);
  const childrenOf = (id: string) => cats.filter((c) => c.parent_id === id).sort(byPos);
  const orderedCats = parents.flatMap((p) => [p, ...childrenOf(p.id)]);

  const selectedCat = cats.find((c) => c.id === selectedId) ?? orderedCats[0];

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
    const from = cats.find((c) => c.id === active.id);
    const to = cats.find((c) => c.id === over.id);
    if (!from || !to) return;
    // Dragging only reorders within one sibling group; re-parenting is an
    // explicit choice in the category's settings drawer.
    if ((from.parent_id ?? null) !== (to.parent_id ?? null)) return;

    // Sorted, so the indices arrayMove works on match what the user sees.
    const group = cats.filter((c) => (c.parent_id ?? null) === (from.parent_id ?? null)).sort(byPos);
    const next = arrayMove(
      group,
      group.findIndex((c) => c.id === active.id),
      group.findIndex((c) => c.id === over.id),
    );
    const posById = new Map(next.map((c, i) => [c.id, i]));
    setCats((cs) => cs.map((c) => (posById.has(c.id) ? { ...c, position: posById.get(c.id)! } : c)));
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
            onClick={() => startTransition(() => addCategory(t('newCategory'), branchId))}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
          >
            <Plus className="h-3.5 w-3.5" /> {t('addCategory')}
          </button>
        </div>

        {cats.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-neutral-400">{t('noCategories')}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
            <SortableContext items={orderedCats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="max-h-[60vh] overflow-y-auto p-1.5 md:max-h-none">
                {orderedCats.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    count={countFor(c.id)}
                    selected={selectedCat?.id === c.id}
                    isChild={Boolean(c.parent_id)}
                    onSelect={() => setSelectedId(c.id)}
                    onEdit={() => setDrawer({ kind: 'category', id: c.id })}
                    onToggleVisible={() => updateCategory(c.id, { is_visible: !c.is_visible })}
                    onDelete={() => confirm(t('confirmDeleteCategory')) && deleteCategory(c.id)}
                    onAddSub={
                      c.parent_id
                        ? undefined
                        : () => startTransition(() => addCategory(t('newSubcategory'), branchId, c.id))
                    }
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
                  onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
                  className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    selecting ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <CheckSquare className="h-3.5 w-3.5" /> {selecting ? t('selectDone') : t('select')}
                </button>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      // Add the product, then auto-open its config drawer.
                      const id = await addProduct(selectedCat.id, t('newProduct'));
                      if (id) setDrawer({ kind: 'product', id });
                    })
                  }
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

            {selecting && (
              <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs">
                <span className="font-semibold">{t('selectedCount', { n: picked.size })}</span>
                <button
                  disabled={picked.size === 0}
                  onClick={() => beginPaste(OPTION_CLIPBOARD_ALL)}
                  className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" /> {t('pasteAllTo')}
                </button>
                <button
                  disabled={picked.size === 0}
                  onClick={() => beginPaste(OPTION_CLIPBOARD_GROUP)}
                  className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" /> {t('pasteGroupTo')}
                </button>
                <button
                  disabled={picked.size === 0}
                  onClick={() => setMoveAsk({ name: pickedGroupNames[0]?.name ?? '', to: 'first' })}
                  className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" /> {t('moveGroup')}
                </button>
                <button
                  disabled={picked.size === 0 || pickedGroupNames.length === 0}
                  onClick={() => beginEditGroup(pickedGroupNames[0].name)}
                  className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                >
                  <PencilLine className="h-3.5 w-3.5" /> {t('editGroup')}
                </button>
                <span className="text-neutral-500">{t('pasteHint')}</span>
              </div>
            )}
            {pasteDone != null && <p className="border-b border-green-100 bg-green-50 px-4 py-2 text-xs text-green-700">{t('pasted', { n: pasteDone })}</p>}

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
                          onEdit={() => (selecting ? togglePick(e.id) : setDrawer({ kind: 'product', id: e.id }))}
                          onToggleAvailable={() => updateProduct(e.data.id, { is_available: !e.data.is_available })}
                          picked={selecting ? picked.has(e.id) : null}
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

      {pasteAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPasteAsk(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">{t('repeatTitle')}</p>
            <p className="mt-1 text-sm text-neutral-600">{t('repeatBody', { n: pasteAsk.repeats })}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={() => void applyPaste(pasteAsk.groups, 'overwrite')} className="rounded-xl bg-neutral-900 px-3 py-2.5 text-left text-white">
                <span className="block text-sm font-semibold">{t('overwrite')}</span>
                <span className="block text-xs text-neutral-300">{t('overwriteHint')}</span>
              </button>
              <button onClick={() => void applyPaste(pasteAsk.groups, 'duplicate')} className="rounded-xl border border-neutral-300 px-3 py-2.5 text-left">
                <span className="block text-sm font-semibold">{t('duplicate')}</span>
                <span className="block text-xs text-neutral-500">{t('duplicateHint')}</span>
              </button>
            </div>
            <button onClick={() => setPasteAsk(null)} className="mt-3 text-sm text-neutral-500 hover:text-neutral-900">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {moveAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMoveAsk(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">{t('moveGroupTitle')}</p>
            <p className="mt-1 text-sm text-neutral-600">{t('moveGroupBody', { n: pickedProducts.length })}</p>
            {pickedGroupNames.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">{t('moveGroupNone')}</p>
            ) : (
              <>
                <select
                  value={moveAsk.name}
                  onChange={(e) => setMoveAsk({ ...moveAsk, name: e.target.value })}
                  className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                >
                  {pickedGroupNames.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.name} · {g.n}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex overflow-hidden rounded-lg border border-neutral-300 text-sm">
                  {(['first', 'last'] as const).map((to) => (
                    <button
                      key={to}
                      onClick={() => setMoveAsk({ ...moveAsk, to })}
                      className={`flex-1 px-3 py-2 ${moveAsk.to === to ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
                    >
                      {to === 'first' ? t('moveFirst') : t('moveLast')}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void applyMove(moveAsk.name, moveAsk.to)}
                  className="mt-4 w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-semibold text-white"
                >
                  {t('moveApply')}
                </button>
              </>
            )}
            <button onClick={() => setMoveAsk(null)} className="mt-3 text-sm text-neutral-500 hover:text-neutral-900">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {editAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditAsk(null)}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-neutral-100 px-5 py-4">
              <p className="font-semibold">{t('editGroupTitle')}</p>
              <select
                value={editAsk.name}
                onChange={(e) => beginEditGroup(e.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {pickedGroupNames.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name} · {g.n}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-neutral-500">{t('editGroupBody', { have: editAsk.have, n: pickedProducts.length })}</p>
              {editAsk.versions > 1 && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t('editGroupDiffers', { k: editAsk.versions })}</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <OptionGroupCard group={editAsk.draft} onChange={(next) => setEditAsk({ ...editAsk, draft: next })} />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-5 py-3">
              <button onClick={() => setEditAsk(null)} className="text-sm text-neutral-500 hover:text-neutral-900">
                {t('cancel')}
              </button>
              <button
                onClick={() => void applyEdit(editAsk.name, editAsk.draft)}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('editGroupApply', { n: editAsk.have })}
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerProduct && <ProductDrawer tenantId={tenantId} product={drawerProduct} onClose={() => setDrawer(null)} />}
      {drawerCategory && (
        <CategoryDrawer
          tenantId={tenantId}
          category={drawerCategory}
          onClose={() => setDrawer(null)}
          showPosSettings={showPosSettings}
          parentOptions={parents.map((p) => ({ id: p.id, name: p.name }))}
          hasSubcategories={childrenOf(drawerCategory.id).length > 0}
        />
      )}
    </div>
  );
}

// ── Category row (sortable) ───────────────────────────────────────────────
function CategoryRow({
  category,
  count,
  selected,
  isChild,
  onSelect,
  onEdit,
  onToggleVisible,
  onDelete,
  onAddSub,
}: {
  category: Category;
  count: number;
  selected: boolean;
  isChild: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  /** Only top-level categories can gain a subcategory (one level deep). */
  onAddSub?: () => void;
}) {
  const t = useTranslations('menuEditor');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 rounded-xl py-1.5 pr-1.5 ${isChild ? 'ml-4 pl-1.5' : 'pl-1.5'} ${selected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}
    >
      {isChild && (
        <span className={`shrink-0 ${selected ? 'text-white/40' : 'text-neutral-300'}`} aria-hidden>
          <CornerDownRight className="h-3.5 w-3.5" />
        </span>
      )}
      <button {...attributes} {...listeners} className={`cursor-grab touch-none ${selected ? 'text-white/50' : 'text-neutral-300'}`}>
        <GripVertical className="h-4 w-4" />
      </button>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {category.icon && <span className="text-base leading-none">{category.icon}</span>}
        <span className="truncate text-sm font-medium">{category.name}</span>
        <span className={`shrink-0 rounded-full px-1.5 text-[10px] ${selected ? 'bg-white/20' : 'bg-neutral-200 text-neutral-600'}`}>{count}</span>
      </button>
      <div className={`flex shrink-0 items-center ${selected ? '' : 'opacity-0 group-hover:opacity-100'}`}>
        <IconBtn onClick={onToggleVisible} selected={selected} label={category.is_visible ? t('catHide') : t('catShow')}>
          {category.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconBtn>
        {onAddSub && (
          <IconBtn onClick={onAddSub} selected={selected} label={t('catAddSub')}>
            <ListPlus className="h-3.5 w-3.5" />
          </IconBtn>
        )}
        <IconBtn onClick={onEdit} selected={selected} label={t('catSettings')}>
          <Settings2 className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={onDelete} selected={selected} danger label={t('catDelete')}>
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
  picked = null,
}: {
  product: Product;
  onEdit: () => void;
  onToggleAvailable: () => void;
  /** In select mode: whether this row is ticked; null outside it. */
  picked?: boolean | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border bg-white p-1.5 ${picked ? 'border-neutral-900' : 'border-neutral-200'} ${product.is_available ? '' : 'opacity-60'}`}
    >
      {picked === null ? (
        <button {...attributes} {...listeners} className="cursor-grab touch-none text-neutral-300">
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <button onClick={onEdit} className="text-neutral-700" aria-pressed={picked}>
          {picked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-neutral-400" />}
        </button>
      )}

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

/** An icon-only button: `label` is its tooltip and its name for screen readers. */
function IconBtn({
  onClick,
  selected,
  danger,
  label,
  children,
}: {
  onClick: () => void;
  selected: boolean;
  danger?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-md p-1 ${
        selected ? 'text-white/70 hover:text-white' : danger ? 'text-neutral-400 hover:text-red-500' : 'text-neutral-400 hover:text-neutral-700'
      }`}
    >
      {children}
    </button>
  );
}
