'use client';

import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, X, Copy, ClipboardPaste, Check, Trash2, GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OptionGroup } from '@/lib/database.types';
import { OPTION_CLIPBOARD_ALL as CLIP_ALL, OPTION_CLIPBOARD_GROUP as CLIP_GROUP } from '@/lib/menu-options';
import { Input } from '@/components/ui';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export function OptionGroupsEditor({
  value,
  onSave,
}: {
  value: OptionGroup[];
  onSave: (groups: OptionGroup[]) => void;
}) {
  const t = useTranslations('menuEditor');
  const [groups, setGroups] = useState<OptionGroup[]>(value);
  const [copiedAll, setCopiedAll] = useState(false);
  // A small distance before a drag starts, so a tap on the grip still counts as a click elsewhere.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // setGroups locally; persist=true also writes to the server.
  function apply(next: OptionGroup[], persist = true) {
    setGroups(next);
    if (persist) onSave(next);
  }
  function replaceGroup(next: OptionGroup, persist: boolean) {
    apply(groups.map((g) => (g.id === next.id ? next : g)), persist);
  }

  // Groups are shown in array order, on the menu and here: dragging reorders the array.
  function onGroupDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = groups.findIndex((g) => g.id === active.id);
    const to = groups.findIndex((g) => g.id === over.id);
    if (from < 0 || to < 0) return;
    apply(arrayMove(groups, from, to));
  }

  function addGroup() {
    apply([...groups, { id: uid(), name: '', description: '', kind: 'dish', required: false, multiple: true, options: [] }]);
  }
  function removeGroup(id: string) {
    apply(groups.filter((g) => g.id !== id));
  }

  function copyGroup(g: OptionGroup) {
    localStorage.setItem(CLIP_GROUP, JSON.stringify(g));
  }
  function pasteGroup() {
    const raw = localStorage.getItem(CLIP_GROUP);
    if (!raw) return alert(t('noClipboard'));
    try {
      const g = JSON.parse(raw) as OptionGroup;
      apply([...groups, { ...g, id: uid() }]);
    } catch {
      alert(t('noClipboard'));
    }
  }
  function copyAll() {
    localStorage.setItem(CLIP_ALL, JSON.stringify(groups));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }
  function pasteAll() {
    const raw = localStorage.getItem(CLIP_ALL);
    if (!raw) return alert(t('noClipboard'));
    try {
      const arr = JSON.parse(raw) as OptionGroup[];
      if (Array.isArray(arr)) apply([...groups, ...arr.map((g) => ({ ...g, id: uid() }))]);
    } catch {
      alert(t('noClipboard'));
    }
  }
  function clearAll() {
    if (groups.length && confirm(t('confirmDeleteAll'))) apply([]);
  }

  return (
    <div className="border-t border-neutral-100 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t('optionGroups')}</span>
        <div className="flex flex-wrap gap-1">
          <Mini onClick={copyAll}>{copiedAll ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />} {t('copyAll')}</Mini>
          <Mini onClick={pasteAll}><ClipboardPaste className="h-3 w-3" /> {t('pasteAll')}</Mini>
          {groups.length > 0 && (
            <Mini onClick={clearAll}><Trash2 className="h-3 w-3" /> {t('deleteAll')}</Mini>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onGroupDragEnd}>
          <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            {groups.map((g) => (
              <Sortable key={g.id} id={g.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                {(grip) => (
                  <OptionGroupCard
                    group={g}
                    grip={grip}
                    onChange={replaceGroup}
                    onCopy={() => copyGroup(g)}
                    onRemove={() => removeGroup(g.id)}
                  />
                )}
              </Sortable>
            ))}
          </SortableContext>
        </DndContext>

        <div className="flex gap-2">
          <button onClick={addGroup} className="flex items-center gap-1 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
            <Plus className="h-4 w-4" /> {t('addGroup')}
          </button>
          <Mini onClick={pasteGroup}><ClipboardPaste className="h-3 w-3" /> {t('pasteGroup')}</Mini>
        </div>
      </div>
    </div>
  );
}

/**
 * One group's fields: name, description, required / one-or-many / kind, and
 * its options (draggable). Typing reports the change without persisting;
 * leaving a field, toggling or dragging persists. Used by the product drawer
 * for each group and by the menu's multi-select to edit one group on many
 * products at once.
 */
export function OptionGroupCard({
  group: g,
  grip,
  onChange,
  onCopy,
  onRemove,
}: {
  group: OptionGroup;
  /** The drag handle of the list this card sits in, if any. */
  grip?: React.ReactNode;
  onChange: (next: OptionGroup, persist: boolean) => void;
  onCopy?: () => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('menuEditor');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const patch = (p: Partial<OptionGroup>, persist = true) => onChange({ ...g, ...p }, persist);
  const patchOption = (idx: number, p: Partial<{ name: string; price: number; available: boolean }>, persist = true) =>
    patch({ options: g.options.map((o, i) => (i === idx ? { ...o, ...p } : o)) }, persist);
  const addOption = () => patch({ options: [...g.options, { name: '', price: 0 }] });
  const removeOption = (idx: number) => patch({ options: g.options.filter((_, i) => i !== idx) });
  // Options have no id of their own; they are addressed as "<group>:<index>".
  function onOptionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = Number(String(active.id).split(':').pop());
    const to = Number(String(over.id).split(':').pop());
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    patch({ options: arrayMove(g.options, from, to) });
  }
  const persist = () => onChange(g, true);

  return (
    <>
      <div className="flex items-center gap-2">
        {grip}
        <Input
          value={g.name}
          placeholder={t('groupName')}
          onChange={(e) => patch({ name: e.target.value }, false)}
          onBlur={persist}
          className="flex-1 font-medium"
        />
        {onCopy && (
          <Mini onClick={onCopy} title={t('copyOptions')}><Copy className="h-3 w-3" /></Mini>
        )}
        {onRemove && (
          <button onClick={onRemove} className="p-1 text-neutral-400 hover:text-red-500" title={t('deleteGroup')}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Input
        value={g.description ?? ''}
        placeholder={t('groupDescription')}
        onChange={(e) => patch({ description: e.target.value }, false)}
        onBlur={persist}
        className="mt-2 text-sm"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={g.required} onChange={(e) => patch({ required: e.target.checked })} className="h-4 w-4 rounded border-neutral-300" />
          {t('groupRequired')}
        </label>
        <div className="flex overflow-hidden rounded-lg border border-neutral-300">
          <button onClick={() => patch({ multiple: false })} className={`px-2 py-1 text-xs ${!g.multiple ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
            {t('chooseOne')}
          </button>
          <button onClick={() => patch({ multiple: true })} className={`px-2 py-1 text-xs ${g.multiple ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
            {t('chooseMany')}
          </button>
        </div>
        {/* Is this group about the dish, the drink, or taking it away? */}
        <div className="flex overflow-hidden rounded-lg border border-neutral-300">
          <button onClick={() => patch({ kind: 'dish' })} className={`px-2 py-1 text-xs ${(g.kind ?? 'dish') === 'dish' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
            {t('kindDish')}
          </button>
          <button onClick={() => patch({ kind: 'drink' })} className={`px-2 py-1 text-xs ${g.kind === 'drink' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
            {t('kindDrink')}
          </button>
          <button onClick={() => patch({ kind: 'takeaway' })} className={`px-2 py-1 text-xs ${g.kind === 'takeaway' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
            {t('kindTakeaway')}
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onOptionDragEnd}>
          <SortableContext items={g.options.map((_, i) => `${g.id}:${i}`)} strategy={verticalListSortingStrategy}>
            {g.options.map((o, i) => (
              <Sortable key={`${g.id}:${i}`} id={`${g.id}:${i}`} className="flex items-center gap-2 bg-white">
                {(optionGrip) => (
                  <>
                    {optionGrip}
                    <Input
                      value={o.name}
                      placeholder={t('optionName')}
                      onChange={(e) => patchOption(i, { name: e.target.value }, false)}
                      onBlur={persist}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={o.price === 0 ? '' : o.price}
                      placeholder={t('optionExtra')}
                      onChange={(e) => patchOption(i, { price: Number(e.target.value) || 0 }, false)}
                      onBlur={persist}
                      className="w-24"
                    />
                    <button
                      onClick={() => patchOption(i, { available: o.available === false })}
                      className={`rounded-full px-2 py-1 text-xs font-medium ${o.available === false ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                      title={o.available === false ? t('optionSoldOut') : t('optionInStock')}
                    >
                      {o.available === false ? t('optionSoldOut') : t('optionInStock')}
                    </button>
                    <button onClick={() => removeOption(i)} className="p-1 text-neutral-400 hover:text-red-500" title={t('deleteOption')} aria-label={t('deleteOption')}>
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </Sortable>
            ))}
          </SortableContext>
        </DndContext>
        <button onClick={addOption} className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <Plus className="h-4 w-4" /> {t('addOption')}
        </button>
      </div>
    </>
  );
}

/** A draggable row: the wrapper moves with the pointer, the grip it hands to `children` starts the drag. */
function Sortable({ id, className, children }: { id: string; className: string; children: (grip: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const grip = (
    <button type="button" {...attributes} {...listeners} className="shrink-0 cursor-grab touch-none p-0.5 text-neutral-300 hover:text-neutral-500" aria-label="Mover">
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }} className={className}>
      {children(grip)}
    </div>
  );
}

function Mini({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 rounded-md border border-neutral-300 px-1.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
    >
      {children}
    </button>
  );
}
