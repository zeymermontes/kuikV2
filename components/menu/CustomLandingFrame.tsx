import { customLandingSrc } from '@/lib/landing';
import type { Tenant } from '@/lib/database.types';

/**
 * Full-bleed sandboxed iframe rendering a tenant's uploaded custom landing.
 * The sandbox omits allow-same-origin, so the site runs in an opaque origin and
 * can't reach our session, cookies, or APIs. Shared by the tenant home (when
 * landing_mode = 'custom') and the public `/landing` route.
 */
export function CustomLandingFrame({
  tenant,
  entryPath,
}: {
  tenant: Pick<Tenant, 'id' | 'name' | 'subdomain' | 'custom_domain'>;
  entryPath: string;
}) {
  return (
    <iframe
      title={tenant.name}
      src={customLandingSrc(tenant, entryPath)}
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      className="fixed inset-0 h-full w-full border-0"
    />
  );
}
