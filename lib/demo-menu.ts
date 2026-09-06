import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getShowcase } from '@/lib/showcase';
import { getTenantByHostKey } from '@/lib/tenant';
import { resolveMenuSettings } from '@/lib/menu-settings';
import type { Category, Product, TenantTheme } from '@/lib/database.types';
import { DEMO_TENANT, DEMO_THEME } from '@/lib/demo-tenant';

export interface DemoRestaurant {
  name: string;
  slogan: string | null;
  logoUrl: string | null;
  currency: string;
  theme: TenantTheme;
  menu: { categories: Category[]; products: Product[] };
}

/**
 * What the public POS demo sells. The first showcase restaurant's real menu
 * — photos, categories, prices and brand colours — so the register on the
 * landing page matches the phone next to it. Falls back to the built-in
 * sample when no showcase restaurant exists. Read-only: the demo's sales live
 * in a throwaway local store and never touch this restaurant.
 */
export async function getDemoRestaurant(): Promise<DemoRestaurant> {
  const fallback: DemoRestaurant = {
    name: DEMO_TENANT.name,
    slogan: DEMO_TENANT.slogan,
    logoUrl: null,
    currency: DEMO_TENANT.currency,
    theme: DEMO_THEME,
    menu: { categories: [], products: [] },
  };
  try {
    const [first] = await getShowcase();
    if (!first) return fallback;
    const data = await getTenantByHostKey(first.subdomain);
    if (!data) return fallback;
    const sb = createAdminClient();
    const [{ data: categories }, { data: products }] = await Promise.all([
      sb.from('categories').select('*').eq('tenant_id', data.tenant.id).is('branch_id', null).eq('is_visible', true).order('position'),
      sb.from('products').select('*').eq('tenant_id', data.tenant.id).eq('is_hidden', false).order('position'),
    ]);
    const cats = (categories ?? []) as Category[];
    const prods = (products ?? []) as Product[];
    if (prods.length === 0) return fallback;
    return {
      name: data.tenant.name,
      slogan: data.theme.slogan,
      logoUrl: data.theme.logo_url,
      currency: resolveMenuSettings(data.theme.settings).currency,
      theme: data.theme,
      menu: { categories: cats, products: prods },
    };
  } catch {
    return fallback;
  }
}
