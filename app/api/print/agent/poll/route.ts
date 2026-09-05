import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/pos/print-agent';
import type { PrintJob, Printer } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How long a poll may hang waiting for work. Long enough that an idle agent
// costs one request every ~20 s, short enough for proxies not to cut it.
const WAIT_MS = 20_000;
const TICK_MS = 1_000;
// A job stuck in `printing` this long belongs to an agent that died mid-print.
const STALE_MS = 90_000;
const MAX_ATTEMPTS = 3;

/**
 * The agent's one loop: "anything for my printers?".
 *
 * Returns the agent's printer list (so it knows addresses and widths without
 * any local setup) and the jobs it just claimed. With `?wait=1` the request
 * holds until a job appears or the window closes, so a kitchen ticket reaches
 * paper about a second after the cashier fires it.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateAgent(req);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: printerRows } = await supabase.from('printers').select('*').eq('agent_id', agent.id).eq('tenant_id', agent.tenant_id);
  const printers = (printerRows ?? []) as Printer[];
  const ids = printers.map((p) => p.id);

  const wait = req.nextUrl.searchParams.get('wait') === '1';
  const deadline = Date.now() + (wait ? WAIT_MS : 0);
  let jobs: PrintJob[] = [];

  while (ids.length > 0) {
    const stale = new Date(Date.now() - STALE_MS).toISOString();
    const { data: candidates } = await supabase
      .from('print_jobs')
      .select('id')
      .in('printer_id', ids)
      .lt('attempts', MAX_ATTEMPTS)
      .or(`status.eq.queued,and(status.eq.printing,claimed_at.lt.${stale})`)
      .order('created_at', { ascending: true })
      .limit(20);
    const found = (candidates ?? []).map((c) => (c as { id: string }).id);
    if (found.length > 0) {
      // Claim atomically enough: one agent per printer, so the only race is a
      // retry of our own stale job, and the status filter keeps it single.
      const { data: claimed } = await supabase
        .from('print_jobs')
        .update({ status: 'printing', claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', found)
        .in('status', ['queued', 'printing'])
        .select('*');
      jobs = (claimed ?? []) as PrintJob[];
      if (jobs.length > 0) {
        // attempts is bumped separately: PostgREST cannot express `attempts + 1`.
        await Promise.all(jobs.map((j) => supabase.from('print_jobs').update({ attempts: j.attempts + 1 }).eq('id', j.id)));
        jobs = jobs.map((j) => ({ ...j, attempts: j.attempts + 1 }));
        break;
      }
    }
    if (Date.now() + TICK_MS > deadline) break;
    await new Promise((r) => setTimeout(r, TICK_MS));
  }

  // Housekeeping rides along on a fraction of polls instead of a cron of its own.
  if (Math.random() < 0.005) await supabase.rpc('prune_print_jobs');

  return NextResponse.json({
    agent: { id: agent.id, name: agent.name, tenantId: agent.tenant_id },
    printers,
    jobs,
  });
}
