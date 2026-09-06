import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenantUrl } from '@/lib/config';

// Restaurants shown on the landing page, in this order. Their public menus are
// embedded live, so only list businesses that agreed to appear.
export const SHOWCASE_SUBDOMAINS = ['kavaa', 'laseisdos', 'marandsea', 'hirata-rest', 'antesala', 'chi'];

export interface ShowcaseTenant {
  name: string;
  subdomain: string;
  url: string;
  logoUrl: string | null;
  primary: string;
}

/** The showcase restaurants that exist right now; a missing one is skipped, not an error. */
export async function getShowcase(): Promise<ShowcaseTenant[]> {
  try {
    const sb = createAdminClient();
    const { data: tenants } = await sb.from('tenants').select('id, name, subdomain').in('subdomain', SHOWCASE_SUBDOMAINS);
    const rows = (tenants ?? []) as { id: string; name: string; subdomain: string }[];
    if (rows.length === 0) return [];
    const { data: themes } = await sb
      .from('tenant_theme')
      .select('tenant_id, logo_url, primary_color')
      .in('tenant_id', rows.map((r) => r.id));
    const theme = new Map(((themes ?? []) as { tenant_id: string; logo_url: string | null; primary_color: string }[]).map((t) => [t.tenant_id, t]));
    return SHOWCASE_SUBDOMAINS.flatMap((sub) => {
      const t = rows.find((r) => r.subdomain === sub);
      if (!t) return [];
      const th = theme.get(t.id);
      return [{ name: t.name, subdomain: t.subdomain, url: tenantUrl(t.subdomain), logoUrl: th?.logo_url ?? null, primary: th?.primary_color ?? '#171717' }];
    });
  } catch {
    return [];
  }
}
