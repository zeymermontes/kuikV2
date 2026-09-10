import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';
import { canUsePos } from '@/lib/plan';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { createClient } from '@/lib/supabase/server';
import { RegistersBoard } from '@/components/dashboard/RegistersBoard';
import { PosLocked } from '@/components/pos/PosLocked';
import { listShifts } from './actions';

export const dynamic = 'force-dynamic';

/** The registers from the office: open shifts, their takings, and remote open / close. */
export default async function RegistersPage() {
  const ctx = await requireManager();
  const { tenant, theme, subscription } = ctx;
  // Same gates as the register itself: in development, and the POS add-on.
  if (!showDevFeatures(ctx)) redirect('/menu');
  if (!canUsePos(subscription)) return <PosLocked title="Cajas" />;
  const t = await getTranslations('registers');
  const supabase = await createClient();
  const [initial, { data: branches }] = await Promise.all([listShifts(), supabase.from('branches').select('id, name').eq('tenant_id', tenant.id).order('position')]);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <RegistersBoard initial={initial} tenantId={tenant.id} currency={resolveMenuSettings(theme.settings).currency} branches={(branches ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
