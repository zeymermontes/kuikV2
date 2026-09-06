'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { Gift, Phone, Search, Star, UserPlus, UserRound, X } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab } from '@/lib/pos/types';
import type { LoyaltyCustomer, LoyaltyProgram } from '@/lib/database.types';
import { loyaltyPhone, rewardProgress } from '@/lib/loyalty';
import { formatPrice } from '@/lib/utils';
import { searchCustomers, enrollCustomer, redeem } from '@/app/(dashboard)/loyalty/actions';
import { PosModal } from './PosModal';

export interface CustomerPatch {
  customer_name: string | null;
  customer_phone: string | null;
  loyalty_customer_id: string | null;
}

/**
 * The customer on a sale. With a loyalty program the cashier finds the member
 * by phone or name, sees their card and visits, redeems a reward, or enrols
 * them on the spot; the stamp or points for this sale are credited by the
 * database when the sale closes. Without a program it is a name and a phone.
 */
export function CustomerSheet({
  db,
  tab,
  program,
  currency,
  locale,
  canSearch,
  onApply,
  onClose,
}: {
  db: PosDexie;
  tab: PosTab;
  program: LoyaltyProgram | null;
  currency: string;
  locale: string;
  /** Online, signed in, not the demo: the member directory is reachable. */
  canSearch: boolean;
  onApply: (patch: CustomerPatch) => void;
  onClose: () => void;
}) {
  const t = useTranslations('pos');
  const money = (n: number) => formatPrice(n, currency, locale);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LoyaltyCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<LoyaltyCustomer | null>(null);
  const [name, setName] = useState(tab.customer_name ?? '');
  const [phone, setPhone] = useState(tab.customer_phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loyaltyOn = canSearch && !!program?.enabled;

  // Debounced directory search; the input's onChange clears results when the query gets too short.
  const searchable = loyaltyOn && query.trim().length >= 2;
  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await searchCustomers(query);
        if (live) setResults(rows);
      } catch {
        if (live) setError(t('customerOffline'));
      } finally {
        if (live) setSearching(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, searchable, t]);

  // Their last sales on this device (what the offline store holds).
  const recent = useLiveQuery(
    async () => {
      const ph = selected?.phone ?? loyaltyPhone(phone);
      if (!ph) return [];
      const rows = await db.tabs.where('status').equals('paid').toArray();
      return rows
        .filter((x) => x.customer_phone === ph && x.id !== tab.id)
        .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
        .slice(0, 5);
    },
    [db, selected, phone, tab.id],
    [] as PosTab[],
  );

  function pick(c: LoyaltyCustomer) {
    setSelected(c);
    setName(c.name ?? '');
    setPhone(c.phone);
    setQuery('');
    setResults([]);
  }

  async function enrol() {
    const ph = loyaltyPhone(phone);
    if (!ph) return setError(t('customerPhoneInvalid'));
    setBusy(true);
    setError(null);
    try {
      const c = await enrollCustomer(ph, name.trim() || null);
      if (c) pick(c);
      else setError(t('customerOffline'));
    } catch {
      setError(t('customerOffline'));
    } finally {
      setBusy(false);
    }
  }

  async function redeemNow() {
    if (!selected) return;
    setBusy(true);
    try {
      const c = await redeem(selected.id);
      if (c) setSelected(c);
    } catch {
      setError(t('customerOffline'));
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    onApply({
      customer_name: name.trim() || selected?.name || null,
      customer_phone: loyaltyPhone(phone) ?? (phone.replace(/\D/g, '') || null),
      loyalty_customer_id: selected?.id ?? null,
    });
  }

  const progress = selected && program ? rewardProgress(program, selected) : null;
  const INPUT = 'w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-pos-accent focus:outline-none';

  return (
    <PosModal title={t('customer')} onClose={onClose}>
      {loyaltyOn && !selected && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            placeholder={t('customerSearch')}
            className={`${INPUT} pl-9`}
          />
          {(results.length > 0 || (searching && query.length >= 2)) && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
              {results.map((c) => (
                <button key={c.id} onClick={() => pick(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50">
                  <UserRound className="h-4 w-4 shrink-0 text-neutral-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name || c.phone}</span>
                    <span className="block text-xs text-neutral-400">
                      {c.name ? `${c.phone} · ` : ''}
                      {t('customerVisits', { n: c.total_visits })}
                    </span>
                  </span>
                </button>
              ))}
              {searching && results.length === 0 && <p className="px-3 py-2.5 text-sm text-neutral-400">…</p>}
            </div>
          )}
        </div>
      )}

      {selected && program ? (
        <div className="mb-3 rounded-2xl border border-neutral-200 p-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pos-accent/15 text-pos-accent">
              <Star className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{selected.name || selected.phone}</p>
              <p className="text-xs text-neutral-500">
                {selected.phone} · {t('customerVisits', { n: selected.total_visits })}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label={t('customerChange')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {progress && progress.need > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>{progress.type === 'stamps' ? t('stampsProgress', { have: progress.have, need: progress.need }) : t('pointsProgress', { have: progress.have, need: progress.need })}</span>
                {progress.reward && <span className="truncate pl-2">{progress.reward}</span>}
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full bg-pos-accent" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
              </div>
              {progress.eligible && (
                <button onClick={redeemNow} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-100 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-200">
                  <Gift className="h-4 w-4" /> {t('redeemReward')}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3 grid gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('customerPh')} className={INPUT} autoFocus={!loyaltyOn} />
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder={t('customerPhone')} className={`${INPUT} pl-9`} />
          </div>
          {loyaltyOn && (
            <button onClick={enrol} disabled={busy || !loyaltyPhone(phone)} className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40">
              <UserPlus className="h-4 w-4" /> {t('customerEnrol')}
            </button>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-neutral-500">{t('customerRecent')}</p>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 text-sm">
            {recent.map((x) => (
              <li key={x.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-neutral-500">{x.closed_at ? new Date(x.closed_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''}</span>
                <span className="font-medium">{money(x.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        {(tab.customer_name || tab.customer_phone) && (
          <button
            onClick={() => onApply({ customer_name: null, customer_phone: null, loyalty_customer_id: null })}
            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            {t('customerRemove')}
          </button>
        )}
        <button onClick={apply} className="flex-1 rounded-xl bg-pos-accent py-3 font-semibold text-white hover:bg-pos-accent-hover">
          {t('apply')}
        </button>
      </div>
    </PosModal>
  );
}
