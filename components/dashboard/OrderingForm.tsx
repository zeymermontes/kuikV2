'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantOrdering, ServiceType } from '@/lib/database.types';
import { Card, Label, Input, Textarea } from '@/components/ui';
import { updateOrdering } from '@/app/(dashboard)/settings-actions';

const SERVICE_TYPES: ServiceType[] = ['pickup', 'delivery', 'dinein'];

export function OrderingForm({ ordering }: { ordering: TenantOrdering }) {
  const t = useTranslations('ordering');
  const [o, setO] = useState(ordering);

  function set<K extends keyof TenantOrdering>(key: K, value: TenantOrdering[K]) {
    setO((s) => ({ ...s, [key]: value }));
    updateOrdering({ [key]: value });
  }

  function toggleService(s: ServiceType) {
    const next = o.service_types.includes(s)
      ? o.service_types.filter((x) => x !== s)
      : [...o.service_types, s];
    if (next.length === 0) return; // keep at least one
    set('service_types', next);
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Online ordering vs. showcase mode */}
      <Card>
        <h2 className="mb-1 font-semibold">{t('mode')}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t('modeHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => set('ordering_enabled', true)}
            className={`rounded-xl border p-3 text-left transition ${
              o.ordering_enabled ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
            }`}
          >
            <span className="block text-sm font-semibold">{t('modeOrder')}</span>
            <span className="block text-xs opacity-70">{t('modeOrderHint')}</span>
          </button>
          <button
            onClick={() => set('ordering_enabled', false)}
            className={`rounded-xl border p-3 text-left transition ${
              !o.ordering_enabled ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
            }`}
          >
            <span className="block text-sm font-semibold">{t('modeShowcase')}</span>
            <span className="block text-xs opacity-70">{t('modeShowcaseHint')}</span>
          </button>
        </div>
      </Card>

      {/* The rest only applies when online ordering is on. */}
      {!o.ordering_enabled ? null : (
      <>
      {/* Service types */}
      <Card>
        <h2 className="mb-1 font-semibold">{t('serviceTypes')}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t('serviceTypesHint')}</p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_TYPES.map((s) => {
            const on = o.service_types.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleService(s)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  on
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {t(`service_${s}`)}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Order message header */}
      <Card>
        <Label>{t('orderHeader')}</Label>
        <Textarea
          rows={2}
          defaultValue={o.order_header ?? ''}
          placeholder={t('orderHeaderHint')}
          onBlur={(e) => set('order_header', e.target.value || null)}
        />
      </Card>

      {/* Money rules */}
      <Card className="space-y-4">
        <h2 className="font-semibold">{t('rules')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>{t('minOrder')}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={o.min_order ?? ''}
              onBlur={(e) =>
                set('min_order', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label>{t('deliveryFee')}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={o.delivery_fee ?? ''}
              onBlur={(e) =>
                set('delivery_fee', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label>{t('freeDeliveryOver')}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={o.free_delivery_over ?? ''}
              onBlur={(e) =>
                set('free_delivery_over', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
        </div>
        <div>
          <Label>{t('tips')}</Label>
          <Input
            defaultValue={o.tips.join(', ')}
            placeholder="10, 15, 20"
            onBlur={(e) =>
              set(
                'tips',
                e.target.value
                  .split(',')
                  .map((x) => parseInt(x.trim(), 10))
                  .filter((n) => Number.isFinite(n) && n > 0),
              )
            }
          />
          <p className="mt-1 text-xs text-neutral-400">{t('tipsHint')}</p>
        </div>
      </Card>

      {/* Customer fields */}
      <Card className="space-y-3">
        <h2 className="font-semibold">{t('customerFields')}</h2>
        <ToggleRow label={t('collectAddress')} checked={o.collect_address} onChange={(v) => set('collect_address', v)} />
        <ToggleRow label={t('collectPickupTime')} checked={o.collect_pickup_time} onChange={(v) => set('collect_pickup_time', v)} />
        <ToggleRow label={t('collectTable')} checked={o.collect_table} onChange={(v) => set('collect_table', v)} />
      </Card>

      {/* POS cash count */}
      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">{t('cashCount')}</h2>
          <p className="text-sm text-neutral-500">{t('cashCountHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => set('cash_count_mode', 'total')}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              o.cash_count_mode !== 'denominations' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'
            }`}
          >
            {t('cashTotal')}
          </button>
          <button
            onClick={() => set('cash_count_mode', 'denominations')}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              o.cash_count_mode === 'denominations' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'
            }`}
          >
            {t('cashDenoms')}
          </button>
        </div>
        {o.cash_count_mode === 'denominations' && (
          <div>
            <Label>{t('cashDenomList')}</Label>
            <Input
              defaultValue={(o.cash_denominations ?? []).join(', ')}
              placeholder="1000, 500, 200, 100, 50, 20, 10, 5, 2, 1"
              onBlur={(e) => {
                const list = e.target.value
                  .split(',')
                  .map((x) => parseFloat(x.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0);
                set('cash_denominations', list.length ? list : null);
              }}
            />
            <p className="mt-1 text-xs text-neutral-400">{t('cashDenomListHint')}</p>
          </div>
        )}
      </Card>

      {/* POS floor map */}
      <Card className="space-y-2">
        <div>
          <h2 className="font-semibold">{t('posTables')}</h2>
          <p className="text-sm text-neutral-500">{t('posTablesHint')}</p>
        </div>
        <Input
          type="number"
          min={0}
          max={200}
          defaultValue={o.pos_tables}
          onBlur={(e) => set('pos_tables', Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0)))}
        />
      </Card>
      </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded border-neutral-300"
      />
    </label>
  );
}
