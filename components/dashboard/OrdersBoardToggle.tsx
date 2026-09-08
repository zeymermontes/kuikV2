'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setOrdersBoard } from '@/app/(dashboard)/admin/actions';

/** Super admin: whether this restaurant has the Pedidos board (0085). */
export function OrdersBoardToggle({ tenantId, on }: { tenantId: string; on: boolean }) {
  const t = useTranslations('superAdmin');
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600" title={t('ordersBoardHint')}>
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(() => setOrdersBoard(tenantId, next));
        }}
        className="h-3.5 w-3.5 rounded border-neutral-300"
      />
      {t('ordersBoard')}
    </label>
  );
}
