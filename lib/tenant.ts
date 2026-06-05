import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Tenant,
  TenantTheme,
  TenantContact,
  TenantOrdering,
  Category,
  Product,
  Separator,
  MenuCategory,
  MenuEntry,
  FullTenant,
} from '@/lib/database.types';

/**
 * Resolve a tenant from a host key. The key is either a bare subdomain
 * (e.g. "tacos") or a full custom-domain host (e.g. "menu.tacos.com").
 * Tries subdomain first, then custom_domain. Cached per request.
 */
export const getTenantByHostKey = cache(
  async (hostKey: string): Promise<FullTenant | null> => {
    const supabase = createAdminClient();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .or(`subdomain.eq.${hostKey},custom_domain.eq.${hostKey}`)
      .maybeSingle<Tenant>();

    if (!tenant) return null;

    const [{ data: theme }, { data: contact }, { data: ordering }] =
      await Promise.all([
        supabase
          .from('tenant_theme')
          .select('*')
          .eq('tenant_id', tenant.id)
          .single<TenantTheme>(),
        supabase
          .from('tenant_contact')
          .select('*')
          .eq('tenant_id', tenant.id)
          .single<TenantContact>(),
        supabase
          .from('tenant_ordering')
          .select('*')
          .eq('tenant_id', tenant.id)
          .maybeSingle<TenantOrdering>(),
      ]);

    if (!theme || !contact) return null;

    // Ordering row may be missing for tenants created before this feature.
    const orderingRow: TenantOrdering = ordering ?? {
      tenant_id: tenant.id,
      ordering_enabled: true,
      service_types: ['pickup'],
      order_header: null,
      min_order: null,
      delivery_fee: null,
      free_delivery_over: null,
      tips: [],
      collect_address: false,
      collect_pickup_time: false,
      collect_table: false,
      updated_at: tenant.created_at,
    };

    return { tenant, theme, contact, ordering: orderingRow };
  },
);

/**
 * Load the full visible menu (categories with interleaved products +
 * separators) for a tenant, ready for rendering.
 */
export const getMenu = cache(
  async (tenantId: string): Promise<MenuCategory[]> => {
    const supabase = createAdminClient();

    const [{ data: categories }, { data: products }, { data: separators }] =
      await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_visible', true)
          .order('position'),
        supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('position'),
        supabase
          .from('separators')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('position'),
      ]);

    const cats = (categories ?? []) as Category[];
    const prods = (products ?? []) as Product[];
    const seps = (separators ?? []) as Separator[];

    return cats.map((cat) => {
      const entries: MenuEntry[] = [
        ...prods
          .filter((p) => p.category_id === cat.id)
          .map((p) => ({ kind: 'product' as const, ...p })),
        ...seps
          .filter((s) => s.category_id === cat.id)
          .map((s) => ({ kind: 'separator' as const, ...s })),
      ].sort((a, b) => a.position - b.position);

      return { ...cat, entries };
    });
  },
);
