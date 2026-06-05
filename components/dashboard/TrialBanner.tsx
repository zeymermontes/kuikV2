import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Subscription } from '@/lib/database.types';

/** Shows a status strip when the tenant is on a trial or has a billing problem. */
export async function TrialBanner({ subscription }: { subscription: Subscription }) {
  const t = await getTranslations('billing');

  if (subscription.status === 'active') return null;

  let text: string;
  let tone = 'bg-amber-50 text-amber-800';

  if (subscription.status === 'trialing' && subscription.trial_ends_at) {
    const date = new Date(subscription.trial_ends_at).toLocaleDateString();
    text = t('trialEnds', { date });
  } else if (subscription.status === 'past_due') {
    text = t('pastDue');
    tone = 'bg-red-50 text-red-700';
  } else if (subscription.status === 'canceled') {
    text = t('canceled');
    tone = 'bg-red-50 text-red-700';
  } else {
    return null;
  }

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${tone}`}>
      <span>{text}</span>
      <Link href="/billing" className="shrink-0 font-semibold underline">
        {t('subscribe')}
      </Link>
    </div>
  );
}
