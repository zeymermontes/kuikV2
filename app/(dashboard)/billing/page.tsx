import { getTranslations } from 'next-intl/server';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { requireTenant } from '@/lib/auth';
import { getPlatformSettings } from '@/lib/platform';
import { Card, Button } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { startSubscription } from './actions';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { subscription } = await requireTenant();
  const t = await getTranslations('billing');
  const plan = await getPlatformSettings();
  const { error } = await searchParams;

  const statusMeta = {
    trialing: { icon: Clock, tone: 'text-amber-600', label: t('trial') },
    active: { icon: CheckCircle2, tone: 'text-green-600', label: t('active') },
    past_due: { icon: AlertCircle, tone: 'text-red-600', label: t('pastDue') },
    canceled: { icon: AlertCircle, tone: 'text-neutral-500', label: t('canceled') },
  }[subscription.status];

  const Icon = statusMeta.icon;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      {error === 'mp' && (
        <div className="mb-5 max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t('subscribeError')}
        </div>
      )}

      <Card className="mb-5 max-w-md">
        <div className={`flex items-center gap-2 font-semibold ${statusMeta.tone}`}>
          <Icon className="h-5 w-5" />
          {statusMeta.label}
        </div>

        {subscription.status === 'trialing' && subscription.trial_ends_at && (
          <p className="mt-2 text-sm text-neutral-600">
            {t('trialEnds', {
              date: new Date(subscription.trial_ends_at).toLocaleDateString(),
            })}
          </p>
        )}

        {subscription.status === 'active' && subscription.current_period_end && (
          <p className="mt-2 text-sm text-neutral-600">
            {new Date(subscription.current_period_end).toLocaleDateString()}
          </p>
        )}

        {subscription.free_months_granted > 0 && (
          <p className="mt-2 text-sm text-green-700">
            {t('freeMonths', { count: subscription.free_months_granted })}
          </p>
        )}
      </Card>

      <Card className="max-w-md">
        <div className="mb-1 text-sm font-medium text-neutral-500">{plan.plan_name}</div>
        <div className="mb-4 flex items-baseline gap-1">
          <span className="text-3xl font-bold">
            {formatPrice(plan.plan_amount, plan.plan_currency)}
          </span>
          <span className="text-neutral-500">{t('perMonth')}</span>
        </div>

        {subscription.status !== 'active' ? (
          <form action={startSubscription}>
            <Button type="submit" className="w-full">
              {t('subscribe')}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-neutral-500">{t('active')}</p>
        )}
      </Card>
    </div>
  );
}
