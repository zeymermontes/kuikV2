'use client';

import { useState } from 'react';
import { Stamp, Percent } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LoyaltyProgram, LoyaltyType } from '@/lib/database.types';
import { Card, Label, Input } from '@/components/ui';
import { updateLoyalty } from '@/app/(dashboard)/settings-actions';

export function LoyaltyForm({ program }: { program: LoyaltyProgram }) {
  const t = useTranslations('loyalty');
  const [p, setP] = useState(program);

  function set<K extends keyof LoyaltyProgram>(key: K, value: LoyaltyProgram[K]) {
    setP((s) => ({ ...s, [key]: value }));
    updateLoyalty({ [key]: value });
  }

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="mb-1 font-semibold">{t('program')}</h2>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm text-neutral-600">{t('enable')}</span>
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
            className="h-5 w-5 rounded border-neutral-300"
          />
        </label>
      </div>

      {p.enabled && (
        <>
          {/* Type */}
          <div className="grid grid-cols-2 gap-2">
            <TypeCard
              active={p.type === 'stamps'}
              icon={Stamp}
              title={t('stamps')}
              hint={t('stampsHint')}
              onClick={() => set('type', 'stamps' as LoyaltyType)}
            />
            <TypeCard
              active={p.type === 'points'}
              icon={Percent}
              title={t('points')}
              hint={t('pointsHint')}
              onClick={() => set('type', 'points' as LoyaltyType)}
            />
          </div>

          {p.type === 'stamps' ? (
            <div className="space-y-4">
              <div>
                <Label>{t('stampsNeeded')}</Label>
                <Input
                  type="number"
                  min="2"
                  inputMode="numeric"
                  defaultValue={p.stamps_needed}
                  onBlur={(e) => set('stamps_needed', Math.max(2, Number(e.target.value) || 10))}
                />
              </div>
              <div>
                <Label>{t('reward')}</Label>
                <Input
                  defaultValue={p.reward_description ?? ''}
                  placeholder={t('rewardPlaceholder')}
                  onBlur={(e) => set('reward_description', e.target.value || null)}
                />
              </div>
              <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
                {t('stampsSummary', { n: p.stamps_needed, reward: p.reward_description || '…' })}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>{t('pointsPerCurrency')}</Label>
                <Input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  defaultValue={p.points_per_currency}
                  onBlur={(e) => set('points_per_currency', Number(e.target.value) || 1)}
                />
                <p className="mt-1 text-xs text-neutral-400">{t('pointsPerCurrencyHint')}</p>
              </div>
              <div>
                <Label>{t('pointsForReward')}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  defaultValue={p.points_for_reward ?? ''}
                  onBlur={(e) =>
                    set('points_for_reward', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <Label>{t('reward')}</Label>
                <Input
                  defaultValue={p.points_reward_description ?? ''}
                  placeholder={t('rewardPlaceholder')}
                  onBlur={(e) => set('points_reward_description', e.target.value || null)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function TypeCard({
  active,
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  icon: typeof Stamp;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
        active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs opacity-70">{hint}</span>
    </button>
  );
}
