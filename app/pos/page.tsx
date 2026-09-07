import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { canUsePos, isPro } from '@/lib/plan';
import { posThemeVars } from '@/lib/pos/theme';
import { themeVars } from '@/lib/theme-vars';
import type { Category, FloorTable, LoyaltyProgram, Printer, Product, TenantOrdering } from '@/lib/database.types';
import { PosTerminal } from '@/components/pos/PosTerminal';
import { PosLocked } from '@/components/pos/PosLocked';
import { demoAreas, demoTables } from '@/lib/host/demo';
import { getCfdiSettings, cfdiReady } from '@/lib/cfdi';
import { tenantBaseUrl } from '@/lib/config';
import { branchFilter, resolveBranch } from '@/lib/branches';
import { DeviceBranchSync } from '@/components/pos/DeviceBranchSync';

export const dynamic = 'force-dynamic';

/** The terminal. `?demo=1` runs it against a throwaway local store for the dashboard preview. */
export default async function PosPage({ searchParams }: { searchParams: Promise<{ demo?: string; explain?: string; branch?: string }> }) {
  const { tenant, user, theme, subscription } = await requireTenant();
  if (!canUsePos(subscription)) return <PosLocked title="POS" />;
  const supabase = await createClient();
  const locale = await getLocale();
  const params = await searchParams;
  const demo = !!params.demo;
  const explain = demo && !!params.explain;
  // `?branch=`: this register's branch (lib/pos/branch.ts). Its menu when it
  // has its own, its floor plan, its printers plus the unassigned ones.
  const branch = demo ? null : await resolveBranch(supabase, tenant.id, params.branch);
  const menuBranchId = branch?.menu_mode === 'independent' ? branch.id : null;

  const [{ data: categories }, { data: products }, { data: ordering }, { data: floor }, { data: areas }, { data: printers }, { data: loyalty }] = await Promise.all([
    branchFilter(supabase.from('categories').select('*').eq('tenant_id', tenant.id), menuBranchId).eq('is_visible', true).order('position'),
    supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_hidden', false).order('position'),
    // `*` rather than a column list: a deploy that lands before migration 0065
    // is applied must still get the cash settings, with the print ones defaulting.
    supabase.from('tenant_ordering').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    // The host stand's plan, when the restaurant drew one: the POS floor map uses its tables.
    branchFilter(supabase.from('floor_tables').select('*').eq('tenant_id', tenant.id), branch?.id ?? null).order('position'),
    branchFilter(supabase.from('reservation_areas').select('id, name').eq('tenant_id', tenant.id), branch?.id ?? null).order('position'),
    (branch
      ? supabase.from('printers').select('*').eq('tenant_id', tenant.id).or(`branch_id.eq.${branch.id},branch_id.is.null`)
      : supabase.from('printers').select('*').eq('tenant_id', tenant.id)
    )
      .eq('enabled', true)
      .order('position'),
    supabase.from('loyalty_program').select('*').eq('tenant_id', tenant.id).maybeSingle(),
  ]);
  // Receipts print the self-invoice link once the restaurant can stamp CFDIs.
  const cfdi = demo ? null : await getCfdiSettings(tenant.id);
  const invoiceUrl = cfdiReady(cfdi) && cfdi.self_invoice ? `${tenantBaseUrl(tenant.subdomain, tenant.custom_domain)}/factura` : null;
  // Members can be put on a sale only where the plan includes loyalty.
  const program = isPro(subscription) && (loyalty as LoyaltyProgram | null)?.enabled ? (loyalty as LoyaltyProgram) : null;
  const areaName = new Map(((areas ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  let planTables = (floor ?? []) as FloorTable[];
  let planAreas = ((areas ?? []) as { id: string; name: string }[]).map((a) => ({ id: a.id, name: a.name }));
  // The demo shows the floor bridge even before the restaurant draws a plan.
  if (demo && planTables.length === 0) {
    planTables = demoTables(tenant.id);
    planAreas = demoAreas(tenant.id).map((a) => ({ id: a.id, name: a.name }));
    for (const a of planAreas) areaName.set(a.id, a.name);
  }
  const floorTables = planTables.map((x) => ({
    label: x.label,
    seats: x.seats,
    area: x.area_id ? (areaName.get(x.area_id) ?? null) : null,
  }));

  // A branch with its own menu has its own products; keep the ones in the categories shown.
  const categoryIds = new Set(((categories ?? []) as Category[]).map((c) => c.id));
  const menuProducts = ((products ?? []) as Product[]).filter((p) => categoryIds.has(p.category_id));

  const settings = resolveMenuSettings(theme.settings);
  const currency = settings.currency;
  const cash =
    (ordering as Pick<
      TenantOrdering,
      'cash_count_mode' | 'cash_denominations' | 'pos_tables' | 'print_receipt_mode' | 'print_kitchen_auto' | 'print_drawer_cash' | 'receipt_footer' | 'note_placeholder' | 'pos_lock_after_sale'
    > | null) ?? null;

  return (
    <>
    <DeviceBranchSync branch={branch ? { id: branch.id, name: branch.name, slug: branch.slug } : null} />
    <PosTerminal
      branch={branch ? { id: branch.id, name: branch.name, slug: branch.slug } : null}
      tenantId={tenant.id}
      userId={user.id}
      restaurantName={tenant.name}
      brand={{ name: tenant.name, logoUrl: theme.logo_url, slogan: theme.slogan, currency, locale }}
      currency={currency}
      locale={locale}
      cashCountMode={cash?.cash_count_mode ?? 'total'}
      cashDenominations={cash?.cash_denominations ?? null}
      posTables={cash?.pos_tables ?? 0}
      floorTables={floorTables}
      floorPlan={{ tables: planTables, areas: planAreas }}
      printers={(printers ?? []) as Printer[]}
      printSettings={{
        receiptMode: cash?.print_receipt_mode ?? 'ask',
        kitchenAuto: cash?.print_kitchen_auto ?? true,
        drawerCash: cash?.print_drawer_cash ?? true,
        footer: cash?.receipt_footer ?? null,
        invoiceUrl,
      }}
      notePlaceholder={cash?.note_placeholder ?? null}
      lockAfterSale={cash?.pos_lock_after_sale ?? false}
      loyalty={program}
      menu={{ categories: (categories ?? []) as Category[], products: menuProducts }}
      // The menu's own variables too: the product sheet (options, notes) is the
      // public menu's and paints itself with `--brand-*`.
      themeStyle={{ ...themeVars(theme, settings), ...posThemeVars(theme) }}
      demo={demo}
      explain={explain}
    />
    </>
  );
}
