import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/pos/print-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The agent reports how a claimed job went. Failed jobs are retried by the next poll until attempts run out. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: { status?: string; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (body.status !== 'done' && body.status !== 'failed') {
    return NextResponse.json({ error: 'bad_status' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: job } = await supabase.from('print_jobs').select('id, tenant_id, attempts').eq('id', id).maybeSingle();
  if (!job || (job as { tenant_id: string }).tenant_id !== agent.tenant_id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const attempts = (job as { attempts: number }).attempts;
  const now = new Date().toISOString();
  // A failure with attempts left goes back to the queue; the poll picks it up
  // again after a pause. The last failure sticks, with its reason, so the POS
  // can show "no se imprimió: impresora apagada" and offer a retry.
  const status = body.status === 'done' ? 'done' : attempts >= 3 ? 'failed' : 'queued';
  await supabase
    .from('print_jobs')
    .update({
      status,
      error: body.status === 'failed' ? (body.error ?? 'print_failed').slice(0, 300) : null,
      printed_at: status === 'done' ? now : null,
      claimed_at: status === 'queued' ? null : undefined,
      updated_at: now,
    })
    .eq('id', id);

  return NextResponse.json({ ok: true, status });
}
