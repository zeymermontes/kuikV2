import { getLocale } from 'next-intl/server';
import { posThemeVars } from '@/lib/pos/theme';
import { demoScope } from '@/lib/pos/types';
import { DEMO_TENANT, DEMO_THEME } from '@/lib/demo-tenant';
import { CustomerDisplay } from '@/components/pos/CustomerDisplay';

export const dynamic = 'force-dynamic';

/** The guest-facing screen, mirroring the demo register in the same browser. */
export default async function DemoCustomerPage() {
  const locale = await getLocale();
  return (
    <CustomerDisplay
      scope={demoScope(DEMO_TENANT.id)}
      remote={null}
      brand={{ name: DEMO_TENANT.name, logoUrl: null, slogan: DEMO_TENANT.slogan, currency: DEMO_TENANT.currency, locale }}
      themeStyle={posThemeVars(DEMO_THEME)}
    />
  );
}
