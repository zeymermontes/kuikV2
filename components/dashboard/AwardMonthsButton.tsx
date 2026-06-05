'use client';

import { useTransition } from 'react';
import { Gift } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { awardFreeMonths } from '@/app/(dashboard)/admin/actions';

export function AwardMonthsButton({ tenantId }: { tenantId: string }) {
  const t = useTranslations('superAdmin');
  const [pending, startTransition] = useTransition();

  function handle() {
    const input = prompt(t('awardMonths'), '1');
    const months = Number(input);
    if (!months || months < 1) return;
    startTransition(() => awardFreeMonths(tenantId, months));
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
    >
      <Gift className="h-3.5 w-3.5" /> {t('awardMonth')}
    </button>
  );
}
