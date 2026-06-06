'use client';

import { ShoppingBag } from 'lucide-react';

export function CartBar({
  count,
  label,
  onOpen,
}: {
  count: number;
  label: string;
  onOpen: () => void;
}) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 px-4 pb-6">
      <button
        onClick={onOpen}
        className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-full px-5 py-4 text-white shadow-lg"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        <span className="flex items-center gap-2 font-semibold">
          <ShoppingBag className="h-5 w-5" />
          {label}
        </span>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/25 px-2 text-sm font-bold">
          {count}
        </span>
      </button>
    </div>
  );
}
