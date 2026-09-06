'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Promotion, PromotionChannel, PromotionKind, PromotionScope } from '@/lib/database.types';
import { Card, Input, Label, Button } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { savePromotion, deletePromotion, type PromotionInput } from '@/app/(dashboard)/promotions/actions';

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const KINDS: PromotionKind[] = ['percent', 'amount', 'bogo'];
const SCOPES: PromotionScope[] = ['order', 'category', 'product'];

type Draft = PromotionInput;

const blank = (): Draft => ({
  name: '',
  kind: 'percent',
  value: 10,
  scope: 'order',
  category_ids: [],
  product_ids: [],
  code: null,
  min_subtotal: null,
  days: [],
  start_time: null,
  end_time: null,
  starts_on: null,
  ends_on: null,
  channels: ['pos', 'menu'],
  stackable: false,
  active: true,
});

const fromRow = (p: Promotion): Draft => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  value: Number(p.value),
  scope: p.scope,
  category_ids: p.category_ids,
  product_ids: p.product_ids,
  code: p.code,
  min_subtotal: p.min_subtotal != null ? Number(p.min_subtotal) : null,
  days: p.days,
  start_time: p.start_time?.slice(0, 5) ?? null,
  end_time: p.end_time?.slice(0, 5) ?? null,
  starts_on: p.starts_on,
  ends_on: p.ends_on,
  channels: p.channels,
  stackable: p.stackable,
  active: p.active,
});

/** The restaurant's promotions: what they take off, where, when, and by which code. */
export function PromotionsManager({
  promotions,
  categories,
  products,
  currency,
}: {
  promotions: Promotion[];
  categories: { id: string; name: string }[];
  products: { id: string; name: string; category_id: string }[];
  currency: string;
}) {
  const t = useTranslations('promotions');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  function submit() {
    if (!draft) return;
    start(async () => {
      const res = await savePromotion(draft);
      if (res.error) return setError(t.has(`err_${res.error}`) ? t(`err_${res.error}`) : res.error);
      setDraft(null);
      setError(null);
    });
  }

  const describe = (p: Promotion) => {
    const what = p.kind === 'percent' ? `${Number(p.value)}%` : p.kind === 'amount' ? formatPrice(Number(p.value), currency) : t('kind_bogo');
    const where = p.scope === 'order' ? t('scope_order') : p.scope === 'category' ? categories.filter((c) => p.category_ids.includes(c.id)).map((c) => c.name).join(', ') : products.filter((x) => p.product_ids.includes(x.id)).map((x) => x.name).join(', ');
    const when = [
      p.days.length ? p.days.map((d) => t(`day_${d}`)).join(' ') : null,
      p.start_time || p.end_time ? `${p.start_time?.slice(0, 5) ?? '00:00'}–${p.end_time?.slice(0, 5) ?? '23:59'}` : null,
      p.starts_on || p.ends_on ? `${p.starts_on ?? '…'} → ${p.ends_on ?? '…'}` : null,
    ].filter(Boolean);
    return { what, where, when: when.join(' · ') };
  };

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const check = 'flex items-center gap-2 text-sm';
  const select = 'w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm';

  return (
    <div className="max-w-3xl space-y-5">
      {!draft && (
        <Button onClick={() => setDraft(blank())}>
          <Plus className="h-4 w-4" /> {t('add')}
        </Button>
      )}

      {draft && (
        <Card className="space-y-4">
          <h2 className="font-semibold">{draft.id ? t('edit') : t('add')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t('name')}</Label>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder={t('namePh')} autoFocus />
            </div>
            <div>
              <Label>{t('kind')}</Label>
              <select value={draft.kind} onChange={(e) => set('kind', e.target.value as PromotionKind)} className={select}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind_${k}`)}
                  </option>
                ))}
              </select>
            </div>
            {draft.kind !== 'bogo' && (
              <div>
                <Label>{draft.kind === 'percent' ? t('valuePct') : t('valueAmount', { c: currency })}</Label>
                <Input type="number" min={0} max={draft.kind === 'percent' ? 100 : undefined} step="0.01" value={draft.value} onChange={(e) => set('value', Number(e.target.value))} />
              </div>
            )}
            <div>
              <Label>{t('scope')}</Label>
              <select value={draft.scope} onChange={(e) => set('scope', e.target.value as PromotionScope)} className={select}>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`scope_${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('minSubtotal')}</Label>
              <Input type="number" min={0} step="0.01" value={draft.min_subtotal ?? ''} onChange={(e) => set('min_subtotal', e.target.value === '' ? null : Number(e.target.value))} placeholder="0" />
            </div>
          </div>

          {draft.scope === 'category' && (
            <div>
              <Label>{t('pickCategories')}</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set('category_ids', toggleIn(draft.category_ids, c.id))}
                    className={`rounded-full border px-3 py-1.5 text-sm ${draft.category_ids.includes(c.id) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {draft.scope === 'product' && (
            <div>
              <Label>{t('pickProducts')}</Label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                {products.map((p) => (
                  <label key={p.id} className={check}>
                    <input type="checkbox" checked={draft.product_ids.includes(p.id)} onChange={() => set('product_ids', toggleIn(draft.product_ids, p.id))} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('code')}</Label>
              <Input value={draft.code ?? ''} onChange={(e) => set('code', e.target.value.toUpperCase() || null)} placeholder={t('codePh')} className="uppercase" />
              <p className="mt-1 text-xs text-neutral-500">{t('codeHint')}</p>
            </div>
            <div>
              <Label>{t('channels')}</Label>
              <div className="flex gap-4 pt-2">
                {(['pos', 'menu'] as PromotionChannel[]).map((c) => (
                  <label key={c} className={check}>
                    <input type="checkbox" checked={draft.channels.includes(c)} onChange={() => set('channels', toggleIn(draft.channels, c) as PromotionChannel[])} />
                    {t(`channel_${c}`)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label>{t('days')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('days', draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort())}
                  className={`h-9 w-11 rounded-lg border text-sm font-medium ${draft.days.includes(d) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'}`}
                >
                  {t(`day_${d}`)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-neutral-500">{t('daysHint')}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>{t('from')}</Label>
              <Input type="time" value={draft.start_time ?? ''} onChange={(e) => set('start_time', e.target.value || null)} />
            </div>
            <div>
              <Label>{t('to')}</Label>
              <Input type="time" value={draft.end_time ?? ''} onChange={(e) => set('end_time', e.target.value || null)} />
            </div>
            <div>
              <Label>{t('startsOn')}</Label>
              <Input type="date" value={draft.starts_on ?? ''} onChange={(e) => set('starts_on', e.target.value || null)} />
            </div>
            <div>
              <Label>{t('endsOn')}</Label>
              <Input type="date" value={draft.ends_on ?? ''} onChange={(e) => set('ends_on', e.target.value || null)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className={check}>
              <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} /> {t('active')}
            </label>
            <label className={check}>
              <input type="checkbox" checked={draft.stackable} onChange={(e) => set('stackable', e.target.checked)} /> {t('stackable')}
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {t('save')}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={pending}>
              {t('cancel')}
            </Button>
            {draft.id && (
              <button
                onClick={() => start(async () => {
                  await deletePromotion(draft.id!);
                  setDraft(null);
                })}
                className="ml-auto flex items-center gap-1 text-sm text-red-600 hover:underline"
                disabled={pending}
              >
                <Trash2 className="h-4 w-4" /> {t('delete')}
              </button>
            )}
          </div>
        </Card>
      )}

      <Card>
        {promotions.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">{t('empty')}</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {promotions.map((p) => {
              const d = describe(p);
              return (
                <div key={p.id} className={`flex items-center gap-3 py-3 ${p.active ? '' : 'opacity-50'}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                    <Tag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.name} <span className="text-neutral-400">· {d.what}</span>
                      {p.code && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{p.code}</span>}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {d.where}
                      {d.when ? ` · ${d.when}` : ''} · {p.channels.map((c) => t(`channel_${c}`)).join(' + ')}
                    </p>
                  </div>
                  <button onClick={() => setDraft(fromRow(p))} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" aria-label={t('edit')}>
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
