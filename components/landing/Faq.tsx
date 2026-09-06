import { Plus } from 'lucide-react';

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-neutral-200 rounded-3xl border border-neutral-200 bg-white">
      {items.map(({ q, a }) => (
        <details key={q} className="group px-6 py-5 open:bg-neutral-50/60 first:rounded-t-3xl last:rounded-b-3xl">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-neutral-900 [&::-webkit-details-marker]:hidden">
            {q}
            <Plus className="h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-45" />
          </summary>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">{a}</p>
        </details>
      ))}
    </div>
  );
}
