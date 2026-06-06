import { getTranslations } from 'next-intl/server';
import { CheckCircle2, Clock, AlertCircle, Check, Sparkles } from 'lucide-react';
import { requireOwner } from '@/lib/auth';
import { getPlatformSettings } from '@/lib/platform';
import { Card } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { startSubscription } from './actions';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { subscription } = await requireOwner();
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
  const currentTier = subscription.status === 'active' ? subscription.plan : null;

  const fmt = (n: number) => formatPrice(n, plan.plan_currency);

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
          {subscription.status === 'trialing' && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">{t('trialPro')}</span>
          )}
        </div>
        {subscription.status === 'trialing' && subscription.trial_ends_at && (
          <p className="mt-2 text-sm text-neutral-600">
            {t('trialEnds', { date: new Date(subscription.trial_ends_at).toLocaleDateString() })}
          </p>
        )}
        {subscription.free_months_granted > 0 && (
          <p className="mt-2 text-sm text-green-700">
            {t('freeMonths', { count: subscription.free_months_granted })}
          </p>
        )}
      </Card>

      <h2 className="mb-3 font-semibold">{t('choosePlan')}</h2>
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <PlanCard
          name={plan.plan_name}
          price={fmt(plan.plan_amount)}
          features={[t('f_menu'), t('f_whatsapp'), t('f_custom'), t('f_dashboard'), t('f_subdomain')]}
          tier="basic"
          current={currentTier === 'basic'}
          perMonth={t('perMonth')}
          currentLabel={t('currentPlan')}
          ctaLabel={t('subscribe')}
        />
        <PlanCard
          name={plan.pro_name}
          price={fmt(plan.pro_amount)}
          highlight={t('mostPopular')}
          intro={t('everythingInBasic')}
          features={[t('f_domain'), t('f_loyalty'), t('f_branches'), t('f_reports')]}
          tier="pro"
          current={currentTier === 'pro'}
          perMonth={t('perMonth')}
          currentLabel={t('currentPlan')}
          ctaLabel={currentTier === 'basic' ? t('upgrade') : t('subscribe')}
        />
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  perMonth,
  features,
  intro,
  highlight,
  tier,
  current,
  currentLabel,
  ctaLabel,
}: {
  name: string;
  price: string;
  perMonth: string;
  features: string[];
  intro?: string;
  highlight?: string;
  tier: 'basic' | 'pro';
  current: boolean;
  currentLabel: string;
  ctaLabel: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-5 ${
        tier === 'pro' ? 'border-neutral-900' : 'border-neutral-200'
      } bg-white`}
    >
      {highlight && (
        <span className="absolute -top-2 right-4 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white">
          {highlight}
        </span>
      )}
      <div className="text-sm font-semibold text-neutral-500">{name}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-neutral-500">{perMonth}</span>
      </div>

      {intro && <p className="mt-3 text-xs font-medium text-neutral-500">{intro}</p>}
      <ul className="mt-3 flex-1 space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 shrink-0 text-green-600" /> {f}
          </li>
        ))}
      </ul>

      {current ? (
        <div className="mt-5 rounded-full bg-neutral-100 py-2.5 text-center text-sm font-semibold text-neutral-500">
          {currentLabel}
        </div>
      ) : (
        <form action={startSubscription.bind(null, tier)} className="mt-5">
          <button
            type="submit"
            className={`flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold ${
              tier === 'pro' ? 'bg-neutral-900 text-white hover:bg-neutral-700' : 'border border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            {tier === 'pro' && <Sparkles className="h-4 w-4" />}
            {ctaLabel}
          </button>
        </form>
      )}
    </div>
  );
}
