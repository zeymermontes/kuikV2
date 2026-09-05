import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';
import { Tutorial } from '@/components/dashboard/Tutorial';

/** Step-by-step guides with a live demo of each screen: the register first, then the door. */
export default async function TutorialPage() {
  const ctx = await requireTenant();
  const t = await getTranslations('tutorial');
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <Tutorial showPos={showDevFeatures(ctx)} />
    </div>
  );
}
