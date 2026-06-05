'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Separator, SeparatorStyle } from '@/lib/database.types';
import { updateSeparator, deleteSeparator } from '@/app/(dashboard)/menu/actions';

const STYLES: SeparatorStyle[] = ['line', 'space', 'title'];

export function SeparatorEditor({ separator }: { separator: Separator }) {
  const t = useTranslations('menuEditor');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: separator.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-2.5"
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-neutral-300">
        <GripVertical className="h-4 w-4" />
      </button>

      <input
        defaultValue={separator.label ?? ''}
        placeholder={t('separatorLabel')}
        onBlur={(e) => updateSeparator(separator.id, { label: e.target.value || null })}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
      />

      <select
        defaultValue={separator.style}
        onChange={(e) =>
          updateSeparator(separator.id, { style: e.target.value as SeparatorStyle })
        }
        className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs"
      >
        {STYLES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <button
        onClick={() => deleteSeparator(separator.id)}
        className="p-1 text-neutral-400 hover:text-red-500"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
