import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { isPro } from '@/lib/plan';
import { posThemeVars } from '@/lib/pos/theme';
import { themeVars } from '@/lib/theme-vars';
import type { Category, Product } from '@/lib/database.types';
import { PosTerminal } from '@/components/pos/PosTerminal';
import { PosLocked } from '@/components/pos/PosLocked';

export const dynamic = 'force-dynamic';

/** The terminal. `?demo=1` runs it against a throwaway local store for the dashboard preview. */
export default async function PosPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { tenant, user, theme, subscription } = await requireTenant();
  if (!isPro(subscription)) return <PosLocked title="POS" />;
  const supabase = await createClient();
  const locale = await getLocale();
  const demo = !!(await searchParams).demo;

  const [{ data: categories }, { data: products }, { data: ordering }, { data: floor }, { data: areas }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant.id)
      .is('branch_id', null)
      .eq('is_visible', true)
      .order('position'),
    supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_hidden', false).order('position'),
    supabase.from('tenant_ordering').select('cash_count_mode, cash_denominations, pos_tables').eq('tenant_id', tenant.id).maybeSingle(),
    // The host stand's plan, when the restaurant drew one: the POS floor map uses its tables.
    supabase.from('floor_tables').select('label, seats, area_id, position').eq('tenant_id', tenant.id).order('position'),
    supabase.from('reservation_areas').select('id, name').eq('tenant_id', tenant.id).order('position'),
  ]);
  const areaName = new Map(((areas ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  const floorTables = ((floor ?? []) as { label: string; seats: number; area_id: string | null }[]).map((x) => ({
    label: x.label,
    seats: x.seats,
    area: x.area_id ? (areaName.get(x.area_id) ?? null) : null,
  }));

  const settings = resolveMenuSettings(theme.settings);
  const currency = settings.currency;
  const cash = (ordering as { cash_count_mode?: 'total' | 'denominations'; cash_denominations?: number[] | null; pos_tables?: number } | null) ?? null;

  return (
    <PosTerminal
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
      menu={{ categories: (categories ?? []) as Category[], products: (products ?? []) as Product[] }}
      // The menu's own variables too: the product sheet (options, notes) is the
      // public menu's and paints itself with `--brand-*`.
      themeStyle={{ ...themeVars(theme, settings), ...posThemeVars(theme) }}
      demo={demo}
    />
  );
}
