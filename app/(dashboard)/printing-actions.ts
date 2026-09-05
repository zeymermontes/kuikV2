'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager } from '@/lib/auth';
import { hashToken, newAgentToken } from '@/lib/pos/print-agent';
import { testDoc } from '@/lib/pos/print-doc';
import type { Printer, PrintJobStatus, PrinterKind, PrinterRole, PrinterWidth } from '@/lib/database.types';

// Printers and agents are set up by a manager; the terminal only reads them.
// Everything here goes through the user's own client, so RLS (0065) is the
// authority — the role check is for a clear redirect, not for safety.

/** Mint an agent. The token is returned exactly once; only its hash is stored. */
export async function createPrintAgent(name: string): Promise<{ id: string; token: string }> {
  const { tenant, user } = await requireManager();
  const supabase = await createClient();
  const token = newAgentToken();
  const { data, error } = await supabase
    .from('print_agents')
    .insert({ tenant_id: tenant.id, name: name.trim() || 'Agente', token_hash: hashToken(token), created_by: user.id })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/ordering');
  return { id: (data as { id: string }).id, token };
}

export async function deletePrintAgent(id: string): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('print_agents').delete().eq('id', id).eq('tenant_id', tenant.id);
  revalidatePath('/ordering');
}

export interface PrinterInput {
  id?: string;
  name: string;
  kind: PrinterKind;
  address: string;
  width: PrinterWidth;
  roles: PrinterRole[];
  stations: string[];
  has_drawer: boolean;
  cut: boolean;
  copies: number;
  enabled: boolean;
  agent_id: string | null;
}

export async function savePrinter(input: PrinterInput): Promise<Printer> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const row = {
    id: input.id ?? randomUUID(),
    tenant_id: tenant.id,
    name: input.name.trim() || 'Impresora',
    kind: input.kind,
    address: input.address.trim(),
    width: input.width,
    roles: input.roles,
    stations: input.stations.map((s) => s.trim()).filter(Boolean),
    has_drawer: input.has_drawer,
    cut: input.cut,
    copies: Math.min(3, Math.max(1, Math.round(input.copies) || 1)),
    enabled: input.enabled,
    agent_id: input.agent_id,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('printers').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw new Error(error.message);
  revalidatePath('/ordering');
  return data as Printer;
}

export async function deletePrinter(id: string): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('printers').delete().eq('id', id).eq('tenant_id', tenant.id);
  revalidatePath('/ordering');
}

/** Queue a test page; the UI polls `printJobStatus` to show whether it came out. */
export async function sendTestPrint(printerId: string): Promise<string> {
  const { tenant, user } = await requireManager();
  const supabase = await createClient();
  const { data: printer } = await supabase.from('printers').select('name').eq('id', printerId).eq('tenant_id', tenant.id).maybeSingle();
  if (!printer) throw new Error('printer_not_found');
  const id = randomUUID();
  const { error } = await supabase.from('print_jobs').insert({
    id,
    tenant_id: tenant.id,
    printer_id: printerId,
    kind: 'test',
    doc: testDoc((printer as { name: string }).name, tenant.name),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function printJobStatus(id: string): Promise<{ status: PrintJobStatus; error: string | null } | null> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('print_jobs').select('status, error').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  return (data as { status: PrintJobStatus; error: string | null } | null) ?? null;
}
