'use client';

import { createContext, useContext, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Printer } from '@/lib/database.types';
import type { PosDexie } from '@/lib/pos/db';
import { DEFAULT_PRINT_SETTINGS, type PrintContext, type PrintSettings } from '@/lib/pos/printing';
import type { ReceiptLabels, ZLabels } from '@/lib/pos/print-doc';

const Ctx = createContext<PrintContext | null>(null);

/** Makes the tenant's printers and print settings available to every POS screen below. */
export function PrintingProvider({
  db,
  tenantId,
  userId,
  printers,
  settings,
  demo,
  children,
}: {
  db: PosDexie | null;
  tenantId: string;
  userId: string | null;
  printers: Printer[];
  settings?: PrintSettings;
  demo?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<PrintContext>(
    () => ({ db, tenantId, userId, printers, settings: settings ?? DEFAULT_PRINT_SETTINGS, demo }),
    [db, tenantId, userId, printers, settings, demo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The print context; screens rendered outside a provider get a no-printer one, so they fall back to the browser. */
export function usePrinting(): PrintContext {
  const ctx = useContext(Ctx);
  return useMemo(
    () => ctx ?? { db: null, tenantId: '', userId: null, printers: [], settings: DEFAULT_PRINT_SETTINGS, demo: true },
    [ctx],
  );
}

/** Receipt wording in the cashier's language. */
export function useReceiptLabels(): ReceiptLabels {
  const t = useTranslations('pos');
  return useMemo(
    () => ({
      subtotal: t('subtotal'),
      discount: t('discount'),
      tip: t('tip'),
      total: t('total'),
      change: t('changeDue'),
      thanks: t('receiptThanks'),
      method: (m: string) => t(`method_${m}` as 'method_cash'),
    }),
    [t],
  );
}

export function useZLabels(): ZLabels {
  const t = useTranslations('pos');
  return useMemo(
    () => ({
      title: t('zTitle'),
      opening: t('opening'),
      tips: t('tips'),
      totalCharged: t('totalCharged'),
      expected: t('zExpected'),
      counted: t('zCounted'),
      diff: t('zDiff'),
      method: (m: string) => t(`method_${m}` as 'method_cash'),
    }),
    [t],
  );
}
