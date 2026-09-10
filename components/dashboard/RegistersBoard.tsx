'use client';

import { useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Lock, LockOpen, Plus, RefreshCw, Wallet } from 'lucide-react';
import { createClient, channelName } from '@/lib/supabase/client';
import { formatPrice } from '@/lib/utils';
import { Button, Card, Input, Label } from '@/components/ui';
import { closeShiftRemote, listShifts, openShiftRemote, type ShiftView } from '@/app/(dashboard)/registers/actions';
import { DEFAULT_REGISTER } from '@/lib/pos/customer-screen';

/**
 * The registers from the office: open shifts with what they have taken so
 * far, the last closes, and two remote actions: open a register before the
 * cashier arrives, close one that was left open. Live over Realtime on the
 * same rows the terminals sync, so both sides agree within a second.
 */
export function RegistersBoard({
  initial,
  tenantId,
  currency,
  branches,
}: {
  initial: ShiftView[];
  tenantId: string;
  currency: string;
  branches: { id: string; name: string }[];
}) {
  const t = useTranslations('registers');
  const locale = useLocale();
  const [shifts, setShifts] = useState(initial);
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState(false);
  const [form, setForm] = useState({ register: DEFAULT_REGISTER, branchId: '', openingCash: '' });
  const [error, setError] = useState<string | null>(null);

  const refresh = () => listShifts().then(setShifts).catch(() => {});

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`shifts-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'register_shifts', filter: `tenant_id=eq.${tenantId}` }, () => void refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const money = (n: number) => formatPrice(n, currency);
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? '') : branches.length ? t('mainLocation') : '');
  // Registers seen before, so the open form offers them.
  const known = [...new Set(shifts.map((s) => s.register ?? DEFAULT_REGISTER))];

  function submitOpen() {
    setError(null);
    start(async () => {
      const res = await openShiftRemote({ register: form.register, branchId: form.branchId || null, openingCash: Number(form.openingCash || 0) });
      if (res.error) {
        setError(t(`err_${res.error}`));
        return;
      }
      setOpening(false);
      setForm({ register: DEFAULT_REGISTER, branchId: '', openingCash: '' });
      await refresh();
    });
  }

  function close(s: ShiftView) {
    const expected = s.opening_cash + s.totals.cash;
    const typed = window.prompt(t('closePrompt', { x: money(expected) }), String(expected));
    if (typed === null) return;
    const counted = typed.trim() === '' ? null : Number(typed.replace(/[^0-9.-]/g, ''));
    start(async () => {
      const res = await closeShiftRemote(s.id, Number.isFinite(counted as number) ? counted : null);
      if (res.error) setError(t(`err_${res.error}`));
      await refresh();
    });
  }

  const open = shifts.filter((s) => s.status === 'open');
  const closed = shifts.filter((s) => s.status === 'closed');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">{t('hint')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void refresh()} className="px-3 py-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} /> {t('refresh')}
          </Button>
          <Button onClick={() => setOpening((v) => !v)} className="px-3 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> {t('openRegister')}
          </Button>
        </div>
      </div>

      {opening && (
        <Card className="space-y-3">
          <p className="font-semibold">{t('openTitle')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t('register')}</Label>
              <Input list="known-registers" value={form.register} onChange={(e) => setForm({ ...form, register: e.target.value })} />
              <datalist id="known-registers">
                {known.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </div>
            {branches.length > 0 && (
              <div>
                <Label>{t('branch')}</Label>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm">
                  <option value="">{t('mainLocation')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>{t('openingCash')}</Label>
              <Input type="number" inputMode="decimal" step="0.01" value={form.openingCash} onChange={(e) => setForm({ ...form, openingCash: e.target.value })} placeholder="0" />
            </div>
          </div>
          <p className="text-xs text-neutral-500">{t('openHint')}</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={submitOpen}>
              <LockOpen className="h-4 w-4" /> {t('openConfirm')}
            </Button>
            <Button variant="ghost" onClick={() => setOpening(false)}>
              {t('cancel')}
            </Button>
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-2 font-semibold">{t('openNow', { n: open.length })}</h2>
        {open.length === 0 ? (
          <Card className="text-sm text-neutral-500">{t('noneOpen')}</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {open.map((s) => (
              <Card key={s.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      <Wallet className="h-4 w-4 text-green-600" /> {s.register ?? DEFAULT_REGISTER}
                      {branchName(s.branch_id) && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{branchName(s.branch_id)}</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t('openedAt', { x: when(s.opened_at) })}
                      {s.opened_by_name ? ` · ${s.opened_by_name}` : ''}
                    </p>
                  </div>
                  <Button variant="secondary" disabled={pending} onClick={() => close(s)} className="px-3 py-1.5 text-xs">
                    <Lock className="h-3.5 w-3.5" /> {t('close')}
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <Stat label={t('openingCash')} value={money(s.opening_cash)} />
                  <Stat label={t('cashSales')} value={money(s.totals.cash)} />
                  <Stat label={t('cardSales')} value={money(s.totals.card + s.totals.other)} />
                  <Stat label={t('tips')} value={money(s.totals.tips)} />
                </dl>
                <p className="text-xs text-neutral-500">{t('inDrawer', { x: money(s.opening_cash + s.totals.cash), n: s.totals.payments })}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">{t('recentCloses')}</h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-neutral-100 text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-4 py-2">{t('register')}</th>
                  <th className="px-4 py-2">{t('closedAt')}</th>
                  <th className="px-4 py-2">{t('cashSales')}</th>
                  <th className="px-4 py-2">{t('expected')}</th>
                  <th className="px-4 py-2">{t('counted')}</th>
                  <th className="px-4 py-2">{t('overShort')}</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-50 last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {s.register ?? DEFAULT_REGISTER}
                      {branchName(s.branch_id) && <span className="ml-1 text-xs text-neutral-400">· {branchName(s.branch_id)}</span>}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">
                      {s.closed_at ? when(s.closed_at) : '—'}
                      {s.closed_by_name ? <span className="text-neutral-400"> · {s.closed_by_name}</span> : null}
                    </td>
                    <td className="px-4 py-2">{money(s.totals.cash)}</td>
                    <td className="px-4 py-2">{s.expected_cash != null ? money(s.expected_cash) : '—'}</td>
                    <td className="px-4 py-2">{s.closing_cash != null ? money(s.closing_cash) : '—'}</td>
                    <td className={`px-4 py-2 font-medium ${(s.over_short ?? 0) < 0 ? 'text-red-600' : (s.over_short ?? 0) > 0 ? 'text-amber-600' : 'text-neutral-500'}`}>
                      {s.over_short != null ? money(s.over_short) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
