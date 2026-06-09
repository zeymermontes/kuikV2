import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { isPro } from '@/lib/plan';
import type { Category, Product } from '@/lib/database.types';
import { PosTerminal } from '@/components/pos/PosTerminal';
import { PosLocked } from '@/components/pos/PosLocked';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  const { tenant, user, theme, subscription } = await requireTenant();
  if (!isPro(subscription)) return <PosLocked title="POS" />;
  const supabase = await createClient();
  const locale = await getLocale();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant.id)
      .is('branch_id', null)
      .eq('is_visible', true)
      .order('position'),
    supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_hidden', false).order('position'),
  ]);

  const currency = resolveMenuSettings(theme.settings).currency;

  return (
    <PosTerminal
      tenantId={tenant.id}
      userId={user.id}
      restaurantName={tenant.name}
      currency={currency}
      locale={locale}
      menu={{ categories: (categories ?? []) as Category[], products: (products ?? []) as Product[] }}
    />
  );
}
