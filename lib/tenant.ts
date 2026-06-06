import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { effectivePlan } from '@/lib/plan';
import type {
  Tenant,
  TenantTheme,
  TenantContact,
  TenantOrdering,
  TenantLanding,
  LoyaltyProgram,
  SubscriptionStatus,
  Branch,
  BranchLite,
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
      { data: sub },
    ] = await Promise.all([
      supabase.from('tenant_theme').select('*').eq('tenant_id', tenant.id).single<TenantTheme>(),
      supabase.from('tenant_contact').select('*').eq('tenant_id', tenant.id).single<TenantContact>(),
      supabase.from('tenant_ordering').select('*').eq('tenant_id', tenant.id).maybeSingle<TenantOrdering>(),
      supabase.from('tenant_landing').select('*').eq('tenant_id', tenant.id).maybeSingle<TenantLanding>(),
      supabase.from('loyalty_program').select('*').eq('tenant_id', tenant.id).maybeSingle<LoyaltyProgram>(),
      supabase.from('subscriptions').select('status, plan').eq('tenant_id', tenant.id).maybeSingle<{ status: SubscriptionStatus; plan: 'basic' | 'pro' }>(),
    ]);

    const { data: branchRows } = await supabase
      .from('branches')
      .select('id, name, slug, menu_mode')
      .eq('tenant_id', tenant.id)
      .eq('is_visible', true)
      .order('position');

    if (!theme || !contact) return null;

    const plan = effectivePlan(sub ?? { status: 'trialing', plan: 'basic' });

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
      plan,
      branches: (branchRows ?? []) as BranchLite[],
    };
  },
);

/** Load a single visible branch by slug. */
export const getBranch = cache(
  async (tenantId: string, slug: string): Promise<Branch | null> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .maybeSingle<Branch>();
    return data ?? null;
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
    const rows = ((data ?? []) as Product[]).filter((p) => !p.is_hidden);
    // Preserve the configured order.
    return ids.map((id) => rows.find((p) => p.id === id)).filter(Boolean) as Product[];
  },
);

/**
 * Load the full visible menu (categories with interleaved products +
 * separators) for a tenant, ready for rendering.
 */
export const getMenu = cache(
  async (tenantId: string, branchId: string | null = null): Promise<MenuCategory[]> => {
    const supabase = createAdminClient();

    // branchId NULL → the main menu; a branch id → that branch's independent menu.
    let catQuery = supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_visible', true)
      .order('position');
    catQuery = branchId ? catQuery.eq('branch_id', branchId) : catQuery.is('branch_id', null);

    const [{ data: categories }, { data: products }, { data: separators }] =
      await Promise.all([
        catQuery,
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
    // Hidden products never render on the public menu.
    const prods = ((products ?? []) as Product[]).filter((p) => !p.is_hidden);
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
