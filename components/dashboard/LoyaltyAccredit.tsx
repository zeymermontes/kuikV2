'use client';

import { useState, useTransition } from 'react';
import { Search, Plus, Gift, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LoyaltyProgram, LoyaltyCustomer } from '@/lib/database.types';
import { Card, Label, Input, Button } from '@/components/ui';
import {
  findCustomer,
  awardStamps,
  awardPoints,
  redeem,
} from '@/app/(dashboard)/loyalty/actions';

export function LoyaltyAccredit({ program }: { program: LoyaltyProgram }) {
  const t = useTranslations('loyalty');
  const [query, setQuery] = useState('');
  const [customer, setCustomer] = useState<LoyaltyCustomer | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [amount, setAmount] = useState('');
  const [pending, start] = useTransition();

  function search() {
    setNotFound(false);
    start(async () => {
      const c = await findCustomer(query);
      setCustomer(c);
      setNotFound(!c);
    });
  }

  function clear() {
    setCustomer(null);
    setQuery('');
    setAmount('');
    setNotFound(false);
  }

  const canRedeem = customer
    ? program.type === 'stamps'
      ? customer.stamps >= program.stamps_needed
      : program.points_for_reward != null && Number(customer.points) >= program.points_for_reward
    : false;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="mb-1 font-semibold">{t('accredit')}</h2>
        <p className="text-sm text-neutral-500">{t('accreditHint')}</p>
      </div>

      {!customer ? (
        <>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder={t('searchPlaceholder')}
            />
            <Button onClick={search} disabled={pending || !query.trim()}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {notFound && <p className="text-sm text-red-500">{t('notFound')}</p>}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between rounded-xl bg-neutral-50 p-3">
            <div>
              <p className="font-semibold">{customer.name || customer.phone}</p>
              <p className="text-xs text-neutral-500">
                {t('code')}: <span className="font-mono">{customer.code}</span>
              </p>
            </div>
            <button onClick={clear} className="p-1 text-neutral-400 hover:text-neutral-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Balance */}
          <div className="rounded-xl border border-neutral-200 p-4 text-center">
            {program.type === 'stamps' ? (
              <>
                <div className="text-3xl font-bold">
                  {customer.stamps}
                  <span className="text-lg text-neutral-400">/{program.stamps_needed}</span>
                </div>
                <p className="text-xs text-neutral-500">{t('stampsLabel')}</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold">{Number(customer.points)}</div>
                <p className="text-xs text-neutral-500">{t('pointsLabel')}</p>
              </>
            )}
          </div>

          {/* Award controls */}
          {program.type === 'stamps' ? (
            <Button
              className="w-full"
              disabled={pending}
              onClick={() => start(async () => setCustomer((await awardStamps(customer.id)) ?? customer))}
            >
              <Plus className="h-4 w-4" /> {t('addStamp')}
            </Button>
          ) : (
            <div>
              <Label>{t('saleAmount')}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Button
                  disabled={pending || !(Number(amount) > 0)}
                  onClick={() =>
                    start(async () => {
                      const c = await awardPoints(customer.id, Number(amount));
                      if (c) setCustomer(c);
                      setAmount('');
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> {t('addPoints')}
                </Button>
              </div>
            </div>
          )}

          <Button
            variant={canRedeem ? 'primary' : 'secondary'}
            className="w-full"
            disabled={pending || !canRedeem}
            onClick={() => start(async () => setCustomer((await redeem(customer.id)) ?? customer))}
          >
            <Gift className="h-4 w-4" /> {t('redeem')}
          </Button>
        </div>
      )}
    </Card>
  );
}
