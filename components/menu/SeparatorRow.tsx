'use client';

import type { Separator } from '@/lib/database.types';

export function SeparatorRow({ separator }: { separator: Separator }) {
  if (separator.style === 'space') {
    return <div className="h-6" aria-hidden />;
  }

  if (separator.style === 'title') {
    return (
      <h3
        className="pt-3 pb-1 text-lg font-bold tracking-tight"
        style={{ color: 'var(--brand-separator)' }}
      >
        {separator.label}
      </h3>
    );
  }

  // 'line' — a divider with optional centered label.
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-px flex-1" style={{ backgroundColor: 'var(--brand-separator)' }} />
      {separator.label && (
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-secondary)' }}>
          {separator.label}
        </span>
      )}
      <span className="h-px flex-1" style={{ backgroundColor: 'var(--brand-separator)' }} />
    </div>
  );
}
