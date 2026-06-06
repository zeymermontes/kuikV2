import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TenantLanding, Product } from '@/lib/database.types';
import { LandingForm } from '@/components/dashboard/LandingForm';

export default async function LandingPage() {
  const { tenant } = await requireOwner();
  const t = await getTranslations('landing');
  const supabase = await createClient();

  const [{ data: landingRow }, { data: products }] = await Promise.all([
    supabase
      .from('tenant_landing')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle<TenantLanding>(),
    supabase
      .from('products')
      .select('id, name, image_url')
      .eq('tenant_id', tenant.id)
      .order('position'),
  ]);

  const landing: TenantLanding = landingRow ?? {
    tenant_id: tenant.id,
    enabled: false,
    welcome_title: null,
    tagline: null,
    featured_product_ids: [],
    show_rating: false,
    rating: null,
    reviews_url: null,
    wifi_password: null,
    updated_at: new Date(0).toISOString(),
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <LandingForm
        landing={landing}
        products={(products ?? []) as Pick<Product, 'id' | 'name' | 'image_url'>[]}
      />
    </div>
  );
}
