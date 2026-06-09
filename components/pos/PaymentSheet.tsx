'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Check, Printer } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab, Payment, PaymentMethod, TabItem } from '@/lib/pos/types';
import { addPayment, closeTab } from '@/lib/pos/payments';
import { printReceipt } from '@/lib/pos/print';
import { formatPrice } from '@/lib/utils';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transfer.',
  other: 'Otro',
};

export function PaymentSheet({
  db,
  tab,
  tenantId,
  userId,
  shiftId,
  restaurantName,
  currency,
  locale,
  onClose,
  onPaid,
}: {
  db: PosDexie;
  tab: PosTab;
  tenantId: string;
  userId: string;
  shiftId: string | null;
  restaurantName: string;
  currency: string;
  locale: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const payments = useLiveQuery(
    () => db.payments.where('tab_id').equals(tab.id).toArray(),
    [db, tab.id],
    [] as Payment[],
  );
  const items = useLiveQuery(
    () => db.tab_items.where('tab_id').equals(tab.id).toArray(),
    [db, tab.id],
    [] as TabItem[],
  );
  const paid = (payments ?? []).reduce((s, p) => s + p.amount, 0);
  const due = Math.max(0, tab.total - paid);

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState<number>(tab.total);
  const [tendered, setTendered] = useState<string>('');

  // Keep the amount aligned with the remaining due as payments come in.
  const [prevDue, setPrevDue] = useState(due);
  if (prevDue !== due) {
    setPrevDue(due);
    setAmount(due);
  }

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tenderedNum = Number(tendered) || 0;
  const change = method === 'cash' && tenderedNum > amount ? tenderedNum - amount : 0;
  const field = 'w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none';

  async function record() {
    if (amount <= 0) return;
    await addPayment(db, {
      tenantId,
      tab,
      method,
      amount,
      tendered: method === 'cash' ? tenderedNum || null : null,
      shiftId,
      userId,
    });
    setTendered('');
  }

  async function finish() {
    await closeTab(db, tab);
    onPaid();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-slide-up relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-neutral-900 sm:rounded-3xl">
        <button onClick={onClose} aria-label="close" className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-neutral-600 shadow">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">Cobrar</h2>
          <button
            onClick={() => printReceipt(tab, items ?? [], payments ?? [], restaurantName, currency, locale)}
            className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
          >
            <Printer className="h-4 w-4" /> Recibo
          </button>
        </div>
        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="text-neutral-500">Total {formatPrice(tab.total, currency, locale)}</span>
          <span className="font-semibold">Falta {formatPrice(due, currency, locale)}</span>
        </div>

        {(payments ?? []).length > 0 && (
          <ul className="mb-4 space-y-1 text-sm">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex justify-between text-neutral-500">
                <span>{METHOD_LABEL[p.method]}</span>
                <span>{formatPrice(p.amount, currency, locale)}</span>
              </li>
            ))}
          </ul>
        )}

        {due > 0 ? (
          <>
            <div className="mb-3 grid grid-cols-4 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`rounded-lg py-2 text-xs font-medium ${
                    method === m ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
                  }`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs text-neutral-500">Monto</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className={`${field} mb-3`}
            />

            {method === 'cash' && (
              <>
                <label className="mb-1 block text-xs text-neutral-500">Recibido</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  placeholder={String(amount)}
                  className={`${field} mb-2`}
                />
                {change > 0 && (
                  <p className="mb-2 text-sm font-semibold text-green-600">
                    Cambio: {formatPrice(change, currency, locale)}
                  </p>
                )}
              </>
            )}

            <button onClick={record} className="mt-2 w-full rounded-full bg-neutral-900 py-3 font-semibold text-white">
              Registrar pago
            </button>
          </>
        ) : (
          <button
            onClick={finish}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-green-600 py-3 font-semibold text-white"
          >
            <Check className="h-5 w-5" /> Cerrar cuenta
          </button>
        )}
      </div>
    </div>
  );
}
