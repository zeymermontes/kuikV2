'use client';

import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { setLocale } from '@/app/locale-action';
import type { Locale } from '@/lib/config';

export function LocaleSwitch({ current }: { current: string }) {
  const [pending, startTransition] = useTransition();
  const next: Locale = current === 'es' ? 'en' : 'es';

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => setLocale(next))}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
    >
      <Languages className="h-4 w-4" />
      {current === 'es' ? 'English' : 'Español'}
    </button>
  );
}
