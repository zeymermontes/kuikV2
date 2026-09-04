'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { canUse, effectivePlan } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import {
  flowGraphSchema, validateGraph,
  type FlowGraph, type GraphIssue,
} from '@/lib/whatsapp/flows/schema';
import type { Trigger } from '@/lib/whatsapp/intent';
import { slugify } from '@/lib/utils';

/**
 * Mutations for the flow builder. Every action re-authorizes (server actions
 * are reachable by bare POST) and re-checks the plan: the builder is what Pro
 * pays for, so a downgraded tenant can look but not save.
 */

async function ctx() {
  const c = await requireManager();
  if (!canUse(effectivePlan(c.subscription), 'wa_bots')) {
    throw new Error('pro_required');
  }
  return { ...c, supabase: await createClient() };
}

function revalidate() {
  revalidatePath('/whatsapp/flows');
}

const EMPTY_GRAPH: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
    { id: 'end', type: 'end', position: { x: 600, y: 0 }, data: { outcome: 'completed' } },
  ],
  edges: [],
};

export async function createFlow(input: {
  name: string;
  mode: 'linear' | 'ai';
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { tenant, supabase } = await ctx();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: 'name_required' };

  const key = `${slugify(name, 'flujo').replace(/-/g, '_')}_${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from('whatsapp_flows')
    .insert({
      tenant_id: tenant.id,
      key,
      name,
      mode: input.mode === 'ai' ? 'ai' : 'linear',
      draft_graph: EMPTY_GRAPH,
      enabled: true,
      priority: 50,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: 'insert_failed' };
  revalidate();
  return { ok: true, id: (data as { id: string }).id };
}

export async function saveFlowDraft(input: {
  id: string;
  graph: unknown;
}): Promise<{ ok: boolean }> {
  const { tenant, supabase } = await ctx();
  // Drafts only need the SHAPE to be right; structure is enforced at publish.
  const parsed = flowGraphSchema.safeParse(input.graph);
  if (!parsed.success) return { ok: false };

  const { error } = await supabase
    .from('whatsapp_flows')
    .update({ draft_graph: parsed.data, updated_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('tenant_id', tenant.id);
  return { ok: !error };
}

export async function saveFlowSettings(input: {
  id: string;
  name: string;
  description: string;
  mode: 'linear' | 'ai';
  triggers: Trigger[];
  nudge_after_minutes: number | null;
  max_nudges: number;
  nudge_message: string | null;
  close_after_minutes: number | null;
  close_message: string | null;
}): Promise<{ ok: boolean }> {
  const { tenant, supabase } = await ctx();
  const clean = (n: number | null, max: number) =>
    n && Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), max) : null;

  const { error } = await supabase
    .from('whatsapp_flows')
    .update({
      name: input.name.trim().slice(0, 80) || 'Flujo',
      description: input.description.trim().slice(0, 300) || null,
      mode: input.mode === 'ai' ? 'ai' : 'linear',
      triggers: (Array.isArray(input.triggers) ? input.triggers : [])
        .filter((t) => ['keyword', 'regex', 'interactive_id'].includes(t?.kind) && typeof t.value === 'string' && t.value.trim())
        .slice(0, 20)
        .map((t) => ({ kind: t.kind, value: t.value.trim().slice(0, 80) })),
      nudge_after_minutes: clean(input.nudge_after_minutes, 7 * 24 * 60),
      max_nudges: Math.max(0, Math.min(Math.round(input.max_nudges || 0), 5)),
      nudge_message: input.nudge_message?.trim().slice(0, 500) || null,
      close_after_minutes: clean(input.close_after_minutes, 30 * 24 * 60),
      close_message: input.close_message?.trim().slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .eq('tenant_id', tenant.id);
  if (!error) revalidate();
  return { ok: !error };
}

export async function publishFlow(input: {
  id: string;
  graph: unknown;
}): Promise<{ ok: true; version: number } | { ok: false; issues: GraphIssue[] }> {
  const { tenant, user, supabase } = await ctx();

  const parsed = flowGraphSchema.safeParse(input.graph);
  if (!parsed.success) return { ok: false, issues: [{ code: 'no_start' }] };
  const graph = parsed.data as FlowGraph;

  const issues = validateGraph(graph);
  if (issues.length > 0) return { ok: false, issues };

  const { data: row } = await supabase
    .from('whatsapp_flows')
    .select('published_version')
    .eq('id', input.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!row) return { ok: false, issues: [] };

  const version = ((row as { published_version: number }).published_version ?? 0) + 1;

  // Snapshot first: a flow pointing at a missing version would strand runs.
  const { error: verError } = await supabase.from('whatsapp_flow_versions').insert({
    flow_id: input.id,
    tenant_id: tenant.id,
    version,
    graph,
    published_by: user.id,
  });
  if (verError) return { ok: false, issues: [] };

  const { error } = await supabase
    .from('whatsapp_flows')
    .update({ draft_graph: graph, published_version: version, updated_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('tenant_id', tenant.id);
  if (error) return { ok: false, issues: [] };

  revalidate();
  return { ok: true, version };
}

export async function toggleFlow(input: { id: string; enabled: boolean }): Promise<{ ok: boolean }> {
  const { tenant, supabase } = await ctx();
  const { error } = await supabase
    .from('whatsapp_flows')
    .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('tenant_id', tenant.id);
  if (!error) revalidate();
  return { ok: !error };
}

export async function duplicateFlow(input: { id: string }): Promise<{ ok: true; id: string } | { ok: false }> {
  const { tenant, supabase } = await ctx();
  const { data } = await supabase
    .from('whatsapp_flows')
    .select('*')
    .eq('id', input.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!data) return { ok: false };

  const src = data as Record<string, unknown>;
  const { data: copy, error } = await supabase
    .from('whatsapp_flows')
    .insert({
      tenant_id: tenant.id,
      key: `${String(src.key).slice(0, 40)}_copy_${Date.now().toString(36)}`,
      name: `${String(src.name)} (copia)`.slice(0, 80),
      description: src.description,
      enabled: false,
      priority: src.priority,
      triggers: src.triggers,
      mode: src.mode,
      draft_graph: src.draft_graph,
      nudge_after_minutes: src.nudge_after_minutes,
      max_nudges: src.max_nudges,
      nudge_message: src.nudge_message,
      close_after_minutes: src.close_after_minutes,
      close_message: src.close_message,
    })
    .select('id')
    .single();
  if (error || !copy) return { ok: false };
  revalidate();
  return { ok: true, id: (copy as { id: string }).id };
}

export async function deleteFlow(input: { id: string }): Promise<{ ok: boolean }> {
  const { tenant, supabase } = await ctx();
  const { error } = await supabase
    .from('whatsapp_flows')
    .delete()
    .eq('id', input.id)
    .eq('tenant_id', tenant.id);
  if (!error) revalidate();
  return { ok: !error };
}
