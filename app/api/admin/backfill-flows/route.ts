import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { goalToFlow } from '@/lib/whatsapp/flows/templates';
import { seedFlows } from '@/lib/whatsapp/seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-shot: convert every tenant's whatsapp_goals into published flows.
 *
 * Run once after deploying 0057 (`curl -X POST -H "Authorization: Bearer
 * $CRON_SECRET" .../api/admin/backfill-flows`), verify, then delete this file.
 * Idempotent — seedFlows skips keys a tenant already has — so re-running or
 * racing the per-tenant seed on pairing is harmless. Goal runs in progress are
 * not migrated: the old flows were short, and the bot simply re-matches the
 * diner's next message.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Paginate: PostgREST caps un-ranged selects at 1000 rows, and 5 goals ×
  // 200+ tenants blows past that — a silent tail of tenants with no flows.
  const goalRows: (Parameters<typeof goalToFlow>[0] & { tenant_id: string })[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('whatsapp_goals')
      .select('*')
      .order('tenant_id')
      .order('id')
      .range(from, from + PAGE - 1);
    const page = (data ?? []) as typeof goalRows;
    goalRows.push(...page);
    if (page.length < PAGE) break;
  }

  const byTenant = new Map<string, Parameters<typeof goalToFlow>[0][]>();
  for (const row of goalRows) {
    const list = byTenant.get(row.tenant_id) ?? [];
    list.push(row);
    byTenant.set(row.tenant_id, list);
  }

  let tenants = 0;
  let flows = 0;
  for (const [tenantId, goals] of byTenant) {
    const templates = goals.map(goalToFlow);
    await seedFlows(supabase, tenantId, templates);
    tenants++;
    flows += templates.length;
  }

  return NextResponse.json({ ok: true, tenants, flowsConsidered: flows });
}
