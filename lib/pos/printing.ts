'use client';

import type { PosDexie } from './db';
import { enqueueUpsert, newId, nowISO } from './sync';
import { createClient } from '@/lib/supabase/client';
import type { PrintJob, PrintJobKind, PrintReceiptMode, Printer, PrinterRole } from '@/lib/database.types';
import { printersFor } from './print-route';
import { drawerDoc, kitchenDoc, receiptDoc, type PrintDoc, type ReceiptOptions } from './print-doc';
import { printDocInBrowser } from './print';
import { renderEscPos, splitPrinterAddress } from './escpos';
import { bytesToBase64, nativePrinter } from '@/lib/native/shell';
import type { KitchenTicket, Payment, PosTab, TabItem } from './types';

// How a document reaches paper, in order of preference:
//
//   0. The Terminal app's own socket (native/terminal). A tablet on the
//      restaurant's Wi-Fi reaches a network printer directly: the WebView
//      renders ESC/POS and the native side writes it to host:9100. No agent,
//      and it works with the internet down.
//   1. The print agent on THIS machine, over loopback. Zero latency and it
//      keeps working with the internet down — the all-in-one register case.
//   2. The cloud queue (print_jobs), drained by whichever agent owns the
//      printer. This is how an iPad prints to the kitchen.
//   3. The browser's print dialog, only when nothing is configured and the
//      cashier pressed a button (never for automatic prints).
//
// The agent's local port is fixed so the POS can find it without setup.

export const LOCAL_AGENT_PORT = 9123;
const LOCAL_BASE = `http://127.0.0.1:${LOCAL_AGENT_PORT}`;

export interface LocalAgent {
  id: string;
  name: string;
  version: string;
}

// Chrome's Local Network Access asks the user once before an https page may
// reach loopback; `targetAddressSpace` is the opt-in that also lifts the
// mixed-content block. Browsers that don't know the option ignore it.
const loopback = { targetAddressSpace: 'loopback' } as unknown as RequestInit;

let probe: { at: number; value: Promise<LocalAgent | null> } | null = null;

/** The agent running on this machine, if any. Cached half a minute; `force` re-checks. */
export function localAgent(force = false): Promise<LocalAgent | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!force && probe && Date.now() - probe.at < 30_000) return probe.value;
  const value = (async () => {
    try {
      const res = await fetch(`${LOCAL_BASE}/status`, { ...loopback, signal: AbortSignal.timeout(1500) });
      if (!res.ok) return null;
      const j = (await res.json()) as { ok?: boolean; agent?: string; name?: string; version?: string };
      return j?.ok && typeof j.agent === 'string' ? { id: j.agent, name: j.name ?? '', version: j.version ?? '' } : null;
    } catch {
      return null;
    }
  })();
  probe = { at: Date.now(), value };
  return value;
}

async function postLocal(printerId: string, kind: PrintJobKind, doc: PrintDoc): Promise<void> {
  const res = await fetch(`${LOCAL_BASE}/print`, {
    ...loopback,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ printerId, kind, doc }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `agent ${res.status}`);
}

/**
 * Print straight from this device over TCP. Only the Terminal app can (a
 * browser has no sockets), and only to network printers; a USB printer on
 * some PC still needs that PC's agent. Resolves false when this path does not
 * apply, rejects when the printer could not be reached.
 */
async function printDirect(printer: Printer, doc: PrintDoc): Promise<boolean> {
  const native = nativePrinter();
  if (!native || printer.kind !== 'network') return false;
  const addr = splitPrinterAddress(printer.address);
  if (!addr) return false;
  const data = renderEscPos(doc, printer.width, printer.cut);
  await native.sendTcp({ host: addr.host, port: addr.port, data: bytesToBase64(data), timeoutMs: 8000 });
  return true;
}

export interface PrintSettings {
  receiptMode: PrintReceiptMode;
  kitchenAuto: boolean;
  drawerCash: boolean;
  footer: string | null;
  /** Where a guest requests their CFDI; the receipt prints it with the sale's id. Null = no invoicing. */
  invoiceUrl?: string | null;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = { receiptMode: 'ask', kitchenAuto: true, drawerCash: true, footer: null, invoiceUrl: null };

export interface PrintContext {
  /** The terminal's store: jobs travel through its outbox. Null (KDS) writes straight to Supabase. */
  db: PosDexie | null;
  tenantId: string;
  userId: string | null;
  printers: Printer[];
  settings: PrintSettings;
  /** The dashboard demo has no printers and must never queue anything. */
  demo?: boolean;
}

export { printersFor } from './print-route';

export type PrintOutcome = 'local' | 'queued' | 'browser' | 'none';

async function record(ctx: PrintContext, job: PrintJob): Promise<void> {
  if (ctx.db) {
    await enqueueUpsert(ctx.db, 'print_jobs', job);
    return;
  }
  await createClient().from('print_jobs').upsert(job, { onConflict: 'id' });
}

/** Hand one document to one printer: locally when its agent is here, else through the queue. */
export async function submitJob(
  ctx: PrintContext,
  printer: Printer,
  kind: PrintJobKind,
  doc: PrintDoc,
  refId: string | null = null,
): Promise<'local' | 'queued'> {
  const t = nowISO();
  const job: PrintJob = {
    id: newId(),
    tenant_id: ctx.tenantId,
    printer_id: printer.id,
    kind,
    doc,
    status: 'queued',
    attempts: 0,
    error: null,
    ref_id: refId,
    created_by: ctx.userId,
    claimed_at: null,
    printed_at: null,
    created_at: t,
    updated_at: t,
  };
  try {
    if (await printDirect(printer, doc)) {
      await record(ctx, { ...job, status: 'done', attempts: 1, claimed_at: t, printed_at: nowISO() });
      return 'local';
    }
  } catch {
    // The tablet could not reach the printer (off, other network): let the
    // agent that owns it try through the queue, if there is one.
  }
  if (printer.agent_id) {
    const agent = await localAgent();
    if (agent && agent.id === printer.agent_id) {
      try {
        await postLocal(printer.id, kind, doc);
        await record(ctx, { ...job, status: 'done', attempts: 1, claimed_at: t, printed_at: nowISO() });
        return 'local';
      } catch {
        // The agent is here but could not print (printer off, cable): let the
        // queue retry it, and the failure will surface with a reason.
      }
    }
  }
  await record(ctx, job);
  return 'queued';
}

interface PrintToOptions {
  kind: PrintJobKind;
  station?: string | null;
  refId?: string | null;
  /** Pulse the drawer on printers that have one. */
  drawer?: boolean;
  /** Open the browser's print dialog when no printer takes the role. */
  fallback?: boolean;
  copies?: boolean;
}

async function printTo(ctx: PrintContext, role: PrinterRole, doc: PrintDoc, o: PrintToOptions): Promise<PrintOutcome> {
  let targets = ctx.demo ? [] : printersFor(ctx.printers, role, o.station);
  // Reports go to the receipt printer unless one is set aside for them.
  if (targets.length === 0 && role === 'report' && !ctx.demo) targets = printersFor(ctx.printers, 'receipt');
  if (targets.length === 0) {
    if (o.fallback) {
      printDocInBrowser(doc);
      return 'browser';
    }
    return 'none';
  }
  let out: PrintOutcome = 'queued';
  for (const p of targets) {
    const perPrinter: PrintDoc = { ...doc, drawer: !!o.drawer && p.has_drawer };
    const n = o.copies ? Math.max(1, p.copies) : 1;
    for (let i = 0; i < n; i++) {
      const r = await submitJob(ctx, p, o.kind, i === 0 ? perPrinter : { ...perPrinter, drawer: false }, o.refId ?? null);
      if (r === 'local') out = 'local';
    }
  }
  return out;
}

export function printKitchenTicket(ctx: PrintContext, ticket: KitchenTicket, locale: string, fallback = false): Promise<PrintOutcome> {
  return printTo(ctx, 'kitchen', kitchenDoc(ticket, locale), {
    kind: 'kitchen',
    station: ticket.station,
    refId: ticket.id,
    fallback,
    copies: true,
  });
}

export function printReceipt(
  ctx: PrintContext,
  tab: PosTab,
  items: TabItem[],
  payments: Payment[],
  o: Omit<ReceiptOptions, 'footer' | 'drawer'> & { drawer?: boolean; fallback?: boolean },
): Promise<PrintOutcome> {
  const doc = receiptDoc(tab, items, payments, { ...o, footer: ctx.settings.footer, invoiceUrl: ctx.settings.invoiceUrl ?? null });
  return printTo(ctx, 'receipt', doc, { kind: 'receipt', refId: tab.id, drawer: o.drawer, fallback: o.fallback, copies: true });
}

/** Open the drawer with no paper (a cash sale the cashier chose not to print). */
export async function kickDrawer(ctx: PrintContext): Promise<PrintOutcome> {
  const targets = ctx.demo ? [] : printersFor(ctx.printers, 'receipt').filter((p) => p.has_drawer);
  if (targets.length === 0) return 'none';
  let out: PrintOutcome = 'queued';
  for (const p of targets) if ((await submitJob(ctx, p, 'drawer', drawerDoc())) === 'local') out = 'local';
  return out;
}

export function printReport(ctx: PrintContext, doc: PrintDoc, refId: string | null, fallback = true): Promise<PrintOutcome> {
  return printTo(ctx, 'report', doc, { kind: 'report', refId, fallback });
}

/** Whether pressing "print" would reach paper somewhere other than the browser dialog. */
export function hasPrinter(ctx: PrintContext, role: PrinterRole): boolean {
  if (ctx.demo) return false;
  if (printersFor(ctx.printers, role).length > 0) return true;
  return role === 'report' && printersFor(ctx.printers, 'receipt').length > 0;
}

/** Send a queued-or-failed job again. */
export async function retryJob(ctx: PrintContext, job: PrintJob): Promise<void> {
  await record(ctx, { ...job, status: 'queued', error: null, claimed_at: null });
}
