import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { alertStaff } from '@/lib/alerts';
import { cleanSummary, sameSummary } from '@/lib/chats/pendings';

/**
 * Write down that a diner is owed an answer by a person (migration 0102),
 * and tell the people who can give it.
 *
 * Never throws and never blocks the reply: the diner has already been told
 * someone will get back to them. If the table is not there yet the alert
 * still goes out, so the promise is at least heard.
 */
export async function leavePending(
  ctx: { tenantId: string; conversationId: string; customerName?: string | null },
  raw: string,
  createdBy: 'bot' | 'staff' = 'bot',
): Promise<{ ok: boolean; id?: string }> {
  const summary = cleanSummary(raw);
  if (!summary) return { ok: false };
  const supabase = createAdminClient();
  try {
    // The same question asked twice is one thing to answer, and one alert.
    const { data: open } = await supabase
      .from('whatsapp_pendings')
      .select('id, summary')
      .eq('tenant_id', ctx.tenantId)
      .eq('conversation_id', ctx.conversationId)
      .is('done_at', null)
      .limit(20);
    const same = ((open ?? []) as { id: string; summary: string }[]).find((p) => sameSummary(p.summary, summary));
    if (same) return { ok: true, id: same.id };

    const { data } = await supabase
      .from('whatsapp_pendings')
      .insert({ tenant_id: ctx.tenantId, conversation_id: ctx.conversationId, summary, created_by: createdBy })
      .select('id')
      .maybeSingle();

    // The chats app listens to the conversation, not to this table: touching
    // it is what puts the pending on every open screen, and brings a chat
    // somebody took off the list back onto it.
    await supabase
      .from('whatsapp_conversations')
      .update({ updated_at: new Date().toISOString(), status: 'open' })
      .eq('id', ctx.conversationId)
      .eq('tenant_id', ctx.tenantId);

    if (createdBy === 'bot') {
      const who = ctx.customerName || 'Un cliente';
      await alertStaff({
        tenantId: ctx.tenantId,
        roles: ['owner', 'manager', 'cashier', 'host'],
        kind: 'chat_pending',
        es: { title: 'Pregunta por contestar', body: `${who}: ${summary}` },
        en: { title: 'A question to answer', body: `${ctx.customerName || 'A customer'}: ${summary}` },
        tag: `wa-pending-${ctx.conversationId}`,
        url: `/whatsapp/inbox?c=${ctx.conversationId}`,
      });
    }
    return { ok: true, id: (data as { id: string } | null)?.id };
  } catch {
    return { ok: false };
  }
}
