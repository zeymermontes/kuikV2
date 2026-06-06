import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Tenant,
  TenantTheme,
  TenantContact,
  TenantOrdering,
  TenantLanding,
  LoyaltyProgram,
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

    const [
      { data: theme },
      { data: contact },
      { data: ordering },
      { data: landing },
      { data: loyalty },
    ] = await Promise.all([
      supabase.from('tenant_theme').select('*').eq('tenant_id', tenant.id).single<TenantTheme>(),
      supabase.from('tenant_contact').select('*').eq('tenant_id', tenant.id).single<TenantContact>(),
      supabase.from('tenant_ordering').select('*').eq('tenant_id', tenant.id).maybeSingle<TenantOrdering>(),
      supabase.from('tenant_landing').select('*').eq('tenant_id', tenant.id).maybeSingle<TenantLanding>(),
      supabase.from('loyalty_program').select('*').eq('tenant_id', tenant.id).maybeSingle<LoyaltyProgram>(),
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

    const landingRow: TenantLanding = landing ?? {
      tenant_id: tenant.id,
      enabled: false,
      welcome_title: null,
      tagline: null,
      featured_product_ids: [],
      show_rating: false,
      rating: null,
      reviews_url: null,
      wifi_password: null,
      updated_at: tenant.created_at,
    };

    const loyaltyRow: LoyaltyProgram = loyalty ?? {
      tenant_id: tenant.id,
      enabled: false,
      type: 'stamps',
      stamps_needed: 10,
      reward_description: null,
      points_per_currency: 1,
      points_for_reward: null,
      points_reward_description: null,
      updated_at: tenant.created_at,
    };

    return {
      tenant,
      theme,
      contact,
      ordering: orderingRow,
      landing: landingRow,
      loyalty: loyaltyRow,
    };
  },
);

/** Load specific products by id (for the landing's featured/"most ordered" row). */
export const getProductsByIds = cache(
  async (tenantId: string, ids: string[]): Promise<Product[]> => {
    if (ids.length === 0) return [];
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', ids);
    const rows = (data ?? []) as Product[];
    // Preserve the configured order.
    return ids.map((id) => rows.find((p) => p.id === id)).filter(Boolean) as Product[];
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
