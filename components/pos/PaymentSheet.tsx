'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { X, Check, Printer, ChefHat } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab, Payment, PaymentMethod, TabItem } from '@/lib/pos/types';
import { addPayment, closeTab } from '@/lib/pos/payments';
import { printReceipt } from '@/lib/pos/print';
import { formatPrice } from '@/lib/utils';
import { NumPad } from './NumPad';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];
const BILLS = [50, 100, 200, 500, 1000];
const TIP_PCTS = [0, 10, 15, 20];

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
  onFire,
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
  onFire: () => void | Promise<void>;
}) {
  const t = useTranslations('pos');
  const methodLabel = (m: PaymentMethod) => t(`method_${m}`);
  const money = (n: number) => formatPrice(n, currency, locale);

  const payments = useLiveQuery(() => db.payments.where('tab_id').equals(tab.id).toArray(), [db, tab.id], [] as Payment[]);
  const items = useLiveQuery(() => db.tab_items.where('tab_id').equals(tab.id).toArray(), [db, tab.id], [] as TabItem[]);

  const [tipPct, setTipPct] = useState(0);
  const [tipMode, setTipMode] = useState<'pct' | 'custom'>('pct');
  const [tipCustom, setTipCustom] = useState('');
  const [tipCustomPct, setTipCustomPct] = useState(false);
  const tip =
    tipMode === 'custom'
      ? tipCustomPct
        ? Math.round(tab.total * (Number(tipCustom) || 0)) / 100
        : Number(tipCustom) || 0
      : Math.round(tab.total * tipPct) / 100;
  const grandTotal = tab.total + tip;
  const paid = (payments ?? []).reduce((s, p) => s + p.amount, 0);
  const due = Math.max(0, grandTotal - paid);
  const unfired = (items ?? []).filter((i) => !i.voided_at && !i.fired_at);

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState<number>(grandTotal);
  const [tendered, setTendered] = useState<string>('');
  const [done, setDone] = useState(false);

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
  const field = 'w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-neutral-400 focus:outline-none';

  async function record() {
    if (amount <= 0) return;
    const covers = amount >= due;
    await addPayment(db, {
      tenantId,
      tab,
      method,
      amount,
      tip: covers ? tip : 0,
      tendered: method === 'cash' ? tenderedNum || null : null,
      shiftId,
      userId,
    });
    setTendered('');
    if (covers) {
      await closeTab(db, tab, tip);
      setDone(true);
    }
  }

  // ── Success screen: print / send to kitchen / close ───────────────────────
  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div className="absolute inset-0 bg-black/50" />
        <div className="animate-slide-up relative w-full max-w-md rounded-t-3xl bg-white p-6 text-center text-neutral-900 sm:rounded-3xl">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Check className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold">{t('paidTitle')}</h2>
          <p className="mt-1 text-sm text-neutral-500">{t('paidSubtitle', { x: money(grandTotal) })}</p>

          <div className="mt-6 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => printReceipt(tab, items ?? [], payments ?? [], restaurantName, currency, locale)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-neutral-300 py-3 font-semibold text-neutral-700"
              >
                <Printer className="h-5 w-5" /> {t('printTicket')}
              </button>
              {unfired.length > 0 && (
                <button
                  onClick={() => onFire()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-neutral-300 py-3 font-semibold text-neutral-700"
                >
                  <ChefHat className="h-5 w-5" /> {t('sendKitchen')}
                </button>
              )}
            </div>
            <button onClick={onPaid} className="w-full rounded-full bg-neutral-900 py-3 font-semibold text-white">
              {t('close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Charge screen ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-slide-up relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-neutral-900 sm:rounded-3xl">
        <button onClick={onClose} aria-label="close" className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-neutral-600 shadow">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('charge')}</h2>
          <button
            onClick={() => printReceipt(tab, items ?? [], payments ?? [], restaurantName, currency, locale)}
            className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
          >
            <Printer className="h-4 w-4" /> {t('receipt')}
          </button>
        </div>

        {/* Big amount due */}
        <div className="mb-3 rounded-2xl bg-neutral-50 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-neutral-400">{paid > 0 ? t('due') : t('total')}</p>
          <p className="text-3xl font-extrabold">{money(due)}</p>
          {tip > 0 && (
            <p className="mt-1 text-xs text-neutral-400">
              {t('total')} {money(tab.total)} · {t('tip')} {money(tip)}
            </p>
          )}
        </div>

        {/* Tip */}
        <div className="mb-3">
          <label className="mb-1 block text-xs text-neutral-500">{t('tip')}</label>
          <div className="grid grid-cols-5 gap-2">
            {TIP_PCTS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setTipMode('pct');
                  setTipPct(p);
                }}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  tipMode === 'pct' && tipPct === p ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
                }`}
              >
                {p === 0 ? t('noTip') : `${p}%`}
              </button>
            ))}
            <button
              onClick={() => setTipMode('custom')}
              className={`rounded-xl py-2 text-sm font-semibold ${
                tipMode === 'custom' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
              }`}
            >
              {t('other')}
            </button>
          </div>
          {tipMode === 'custom' && (
            <div className="mt-2 flex gap-2">
              <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-sm">
                <button onClick={() => setTipCustomPct(false)} className={`px-3 ${!tipCustomPct ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
                  {currency}
                </button>
                <button onClick={() => setTipCustomPct(true)} className={`px-3 ${tipCustomPct ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
                  %
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={tipCustom}
                onChange={(e) => setTipCustom(e.target.value)}
                placeholder="0"
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              />
            </div>
          )}
        </div>

        {(payments ?? []).length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex justify-between text-neutral-500">
                <span>{methodLabel(p.method)}</span>
                <span>{money(p.amount)}</span>
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
                  className={`rounded-xl py-2.5 text-xs font-semibold ${
                    method === m ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
                  }`}
                >
                  {methodLabel(m)}
                </button>
              ))}
            </div>

            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-neutral-500">{t('amount')}</label>
              {tab.guests > 1 && (
                <button
                  onClick={() => setAmount(Math.round((grandTotal / tab.guests) * 100) / 100)}
                  className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium"
                >
                  {t('splitGuests')} ({tab.guests})
                </button>
              )}
            </div>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className={`${field} mb-2`}
            />
            <div className="mb-3">
              <NumPad value={amount ? String(amount) : ''} onChange={(v) => setAmount(Number(v) || 0)} />
            </div>

            {method === 'cash' && (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button onClick={() => setTendered(String(amount))} className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium">
                    {t('exact')}
                  </button>
                  {BILLS.filter((b) => b >= amount)
                    .slice(0, 4)
                    .map((b) => (
                      <button key={b} onClick={() => setTendered(String(b))} className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium">
                        {money(b)}
                      </button>
                    ))}
                </div>
                <label className="mb-1 block text-xs text-neutral-500">{t('received')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  placeholder={String(amount)}
                  className={`${field} mb-2`}
                />
                {change > 0 && (
                  <p className="mb-2 text-center text-lg font-bold text-green-600">{t('change', { x: money(change) })}</p>
                )}
              </>
            )}

            <button onClick={record} className="mt-2 w-full rounded-full bg-neutral-900 py-3.5 font-semibold text-white">
              {amount >= due ? t('chargeClose') : t('recordPayment')}
            </button>
          </>
        ) : (
          <button
            onClick={async () => {
              await closeTab(db, tab, tip);
              setDone(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-green-600 py-3.5 font-semibold text-white"
          >
            <Check className="h-5 w-5" /> {t('closeTab')}
          </button>
        )}
      </div>
    </div>
  );
}
