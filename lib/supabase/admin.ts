import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. BYPASSES RLS — only ever import from server
 * code (route handlers, server actions, server components). Used for:
 *   - public menu reads (no signed-in user)
 *   - logging product views / orders from anonymous visitors
 *   - MercadoPago webhook updates
 *   - super-admin operations that must span all tenants
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
