import { NextResponse, type NextRequest } from 'next/server';
import { tryTenant } from '@/lib/auth';
import { APP_URL } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, tenantFromState } from '@/lib/payments/mercadopago';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where Mercado Pago sends the manager back after they authorise Kuik on
 * their account. The signed `state` names the tenant that started the flow
 * and must match the session's tenant; then the code becomes the seller's
 * tokens and the account row is written. The manager lands on the ordering
 * settings with the connection shown.
 */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${APP_URL}/ordering?mp=${q}`);
  const code = req.nextUrl.searchParams.get('code');
  const tenantId = tenantFromState(req.nextUrl.searchParams.get('state'));
  if (!code || !tenantId) return back('error');

  const ctx = await tryTenant();
  if (!ctx || ctx.tenant.id !== tenantId) return back('error');
  if (ctx.role !== 'owner' && ctx.role !== 'manager' && !ctx.support) return back('error');

  try {
    const { accountId, credentials } = await exchangeCode(code);
    const now = new Date().toISOString();
    await createAdminClient()
      .from('payment_accounts')
      .upsert(
        { tenant_id: tenantId, provider: 'mercadopago', account_id: accountId, charges_enabled: true, details_submitted: true, credentials, updated_at: now },
        { onConflict: 'tenant_id' },
      );
    return back('return');
  } catch (e) {
    console.error('[mercadopago] oauth exchange failed:', e instanceof Error ? e.message : e);
    return back('error');
  }
}
