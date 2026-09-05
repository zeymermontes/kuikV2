import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { isPro } from '@/lib/plan';
import { posThemeVars } from '@/lib/pos/theme';
import { demoScope } from '@/lib/pos/types';
import { CustomerDisplay } from '@/components/pos/CustomerDisplay';
import { PosLocked } from '@/components/pos/PosLocked';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kuik POS — Pantalla del cliente',
};

/** The customer-facing screen. Opened from the terminal onto a second display; `?demo=1` mirrors the demo terminal. */
export default async function CustomerScreenPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { tenant, theme, subscription } = await requireTenant();
  if (!isPro(subscription)) return <PosLocked title="POS" />;
  const locale = await getLocale();
  const demo = !!(await searchParams).demo;
  return (
    <CustomerDisplay
      scope={demo ? demoScope(tenant.id) : tenant.id}
      brand={{
        name: tenant.name,
        logoUrl: theme.logo_url,
        slogan: theme.slogan,
        currency: resolveMenuSettings(theme.settings).currency,
        locale,
      }}
      themeStyle={posThemeVars(theme)}
    />
  );
}
