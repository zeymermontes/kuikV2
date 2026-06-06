'use client';

import { useState } from 'react';
import { Plus, X, Copy, ClipboardPaste, Check, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OptionGroup } from '@/lib/database.types';
import { Input } from '@/components/ui';

const CLIP_GROUP = 'kuik_clip_optiongroup';
const CLIP_ALL = 'kuik_clip_optiongroups';
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

  // setGroups locally; persist=true also writes to the server.
  function apply(next: OptionGroup[], persist = true) {
    setGroups(next);
    if (persist) onSave(next);
  }
  function patchGroup(id: string, patch: Partial<OptionGroup>, persist = true) {
    apply(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)), persist);
  }
  function patchOption(gid: string, idx: number, patch: Partial<{ name: string; price: number }>, persist = true) {
    apply(
      groups.map((g) =>
        g.id === gid ? { ...g, options: g.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) } : g,
      ),
      persist,
    );
  }

  function addGroup() {
    apply([...groups, { id: uid(), name: '', description: '', required: false, multiple: true, options: [] }]);
  }
  function removeGroup(id: string) {
    apply(groups.filter((g) => g.id !== id));
  }
  function addOption(gid: string) {
    patchGroup(gid, { options: [...(groups.find((g) => g.id === gid)?.options ?? []), { name: '', price: 0 }] });
  }
  function removeOption(gid: string, idx: number) {
    const g = groups.find((x) => x.id === gid);
    if (g) patchGroup(gid, { options: g.options.filter((_, i) => i !== idx) });
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
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center gap-2">
              <Input
                value={g.name}
                placeholder={t('groupName')}
                onChange={(e) => patchGroup(g.id, { name: e.target.value }, false)}
                onBlur={() => onSave(groups)}
                className="flex-1 font-medium"
              />
              <Mini onClick={() => copyGroup(g)} title={t('copyOptions')}><Copy className="h-3 w-3" /></Mini>
              <button onClick={() => removeGroup(g.id)} className="p-1 text-neutral-400 hover:text-red-500" title={t('deleteGroup')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <Input
              value={g.description ?? ''}
              placeholder={t('groupDescription')}
              onChange={(e) => patchGroup(g.id, { description: e.target.value }, false)}
              onBlur={() => onSave(groups)}
              className="mt-2 text-sm"
            />

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={g.required} onChange={(e) => patchGroup(g.id, { required: e.target.checked })} className="h-4 w-4 rounded border-neutral-300" />
                {t('groupRequired')}
              </label>
              <div className="flex overflow-hidden rounded-lg border border-neutral-300">
                <button
                  onClick={() => patchGroup(g.id, { multiple: false })}
                  className={`px-2 py-1 text-xs ${!g.multiple ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
                >
                  {t('chooseOne')}
                </button>
                <button
                  onClick={() => patchGroup(g.id, { multiple: true })}
                  className={`px-2 py-1 text-xs ${g.multiple ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
                >
                  {t('chooseMany')}
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {g.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={o.name}
                    placeholder={t('optionName')}
                    onChange={(e) => patchOption(g.id, i, { name: e.target.value }, false)}
                    onBlur={() => onSave(groups)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={o.price === 0 ? '' : o.price}
                    placeholder={t('optionExtra')}
                    onChange={(e) => patchOption(g.id, i, { price: Number(e.target.value) || 0 }, false)}
                    onBlur={() => onSave(groups)}
                    className="w-24"
                  />
                  <button onClick={() => removeOption(g.id, i)} className="p-1 text-neutral-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => addOption(g.id)} className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
                <Plus className="h-4 w-4" /> {t('addOption')}
              </button>
            </div>
          </div>
        ))}

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
