import { getLocale } from 'next-intl/server';
import { posThemeVars } from '@/lib/pos/theme';
import { demoScope } from '@/lib/pos/types';
import { DEMO_TENANT } from '@/lib/demo-tenant';
import { getDemoRestaurant } from '@/lib/demo-menu';
import { CustomerDisplay } from '@/components/pos/CustomerDisplay';

export const dynamic = 'force-dynamic';

/** The guest-facing screen, mirroring the demo register in the same browser. */
export default async function DemoCustomerPage() {
  const [locale, r] = await Promise.all([getLocale(), getDemoRestaurant()]);
  return (
    <CustomerDisplay
      scope={demoScope(DEMO_TENANT.id)}
      remote={null}
      brand={{ name: r.name, logoUrl: r.logoUrl, slogan: r.slogan, currency: r.currency, locale }}
      themeStyle={posThemeVars(r.theme)}
    />
  );
}
