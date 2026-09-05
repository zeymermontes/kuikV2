// A printable document, independent of the printer.
//
// The POS describes what to print — lines, two-column rows, rules, a cut —
// and two renderers turn that into output: the print agent (print-agent/,
// Go) emits ESC/POS for the paper width of the target printer, and the
// browser renders the same document to HTML for the print dialog when there
// is no printer. `renderText` here is the reference layout both follow, and
// what the tests check.
//
// Kept free of React and of 'use client' so it runs in node tests and could
// run on the server (a job built from a webhook, say).

import type { KitchenTicket, Payment, PosTab, RegisterShift, TabItem } from './types';

export type PrintAlign = 'left' | 'center' | 'right';

export type PrintLine =
  | { t: 'text'; v: string; align?: PrintAlign; bold?: boolean; size?: 1 | 2 }
  | { t: 'row'; l: string; r: string; bold?: boolean; size?: 1 | 2 }
  | { t: 'hr' }
  | { t: 'feed'; n?: number };

export interface PrintDoc {
  /** Window title in the browser; ignored by the agent. */
  title: string;
  lines: PrintLine[];
  /** Cut the paper at the end (default true). */
  cut?: boolean;
  /** Pulse the cash drawer connected to the printer. */
  drawer?: boolean;
}

// ── Builders ────────────────────────────────────────────────────────────────

type KitchenItem = { name: string; qty: number; selections?: { name: string }[]; note?: string | null };

export function kitchenDoc(ticket: KitchenTicket, locale: string): PrintDoc {
  const items = (Array.isArray(ticket.items) ? ticket.items : []) as KitchenItem[];
  const when = new Date(ticket.fired_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const lines: PrintLine[] = [
    { t: 'text', v: ticket.station || 'Cocina', align: 'center', bold: true, size: 2 },
    { t: 'row', l: ticket.table_label || '', r: when, bold: true },
    { t: 'hr' },
  ];
  for (const it of items) {
    lines.push({ t: 'text', v: `${it.qty}x ${it.name}`, bold: true, size: 2 });
    const opts = (it.selections ?? []).map((s) => s.name).filter(Boolean);
    if (opts.length) lines.push({ t: 'text', v: `   ${opts.join(', ')}` });
    if (it.note) lines.push({ t: 'text', v: `   * ${it.note}`, bold: true });
  }
  lines.push({ t: 'feed', n: 1 });
  return { title: 'Comanda', lines };
}

export interface ReceiptLabels {
  subtotal: string;
  discount: string;
  tip: string;
  total: string;
  change: string;
  thanks: string;
  /** Payment method names by key: cash, card, transfer, other. */
  method: (m: string) => string;
}

export interface ReceiptOptions {
  restaurant: string;
  locale: string;
  money: (n: number) => string;
  labels: ReceiptLabels;
  /** Extra lines under the total: RFC, address… one per line. */
  footer?: string | null;
  /** Pulse the drawer with this print (cash sale). */
  drawer?: boolean;
}

export function receiptDoc(tab: PosTab, items: TabItem[], payments: Payment[], o: ReceiptOptions): PrintDoc {
  const { money, labels } = o;
  const when = new Date(tab.closed_at ?? tab.opened_at).toLocaleString(o.locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const lines: PrintLine[] = [{ t: 'text', v: o.restaurant, align: 'center', bold: true, size: 2 }];
  const sub = [tab.table_label, tab.customer_name].filter(Boolean).join(' · ');
  if (sub) lines.push({ t: 'text', v: sub, align: 'center' });
  lines.push({ t: 'text', v: when, align: 'center' }, { t: 'hr' });

  for (const i of items) {
    if (i.voided_at) continue;
    lines.push({ t: 'row', l: `${i.qty}x ${i.name}`, r: money(i.line_total) });
    const opts = i.selections.map((s) => s.name).filter(Boolean);
    if (opts.length) lines.push({ t: 'text', v: `   ${opts.join(', ')}` });
  }
  lines.push({ t: 'hr' });

  const discount = tab.discount ?? 0;
  if (discount > 0 || tab.tip > 0) lines.push({ t: 'row', l: labels.subtotal, r: money(tab.subtotal) });
  if (discount > 0) lines.push({ t: 'row', l: labels.discount, r: `-${money(discount)}` });
  if (tab.tip > 0) lines.push({ t: 'row', l: labels.tip, r: money(tab.tip) });
  lines.push({ t: 'row', l: labels.total, r: money(tab.total), bold: true, size: 2 });

  let change = 0;
  for (const p of payments) {
    lines.push({ t: 'row', l: labels.method(p.method), r: money(p.amount) });
    change += p.change ?? 0;
  }
  if (change > 0) lines.push({ t: 'row', l: labels.change, r: money(change) });

  lines.push({ t: 'hr' });
  for (const f of (o.footer ?? '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    lines.push({ t: 'text', v: f, align: 'center' });
  }
  lines.push({ t: 'text', v: labels.thanks, align: 'center', bold: true }, { t: 'feed', n: 1 });
  return { title: 'Recibo', lines, drawer: o.drawer };
}

export interface ZLabels {
  title: string;
  opening: string;
  tips: string;
  totalCharged: string;
  expected: string;
  counted: string;
  diff: string;
  method: (m: string) => string;
}

export function zReportDoc(
  shift: RegisterShift,
  payments: Payment[],
  o: { restaurant: string; locale: string; money: (n: number) => string; labels: ZLabels },
): PrintDoc {
  const { money, labels } = o;
  const by = new Map<string, { count: number; amount: number }>();
  let tips = 0;
  let total = 0;
  for (const p of payments) {
    const cur = by.get(p.method) ?? { count: 0, amount: 0 };
    cur.count++;
    cur.amount += p.amount;
    by.set(p.method, cur);
    tips += p.tip;
    total += p.amount;
  }
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString(o.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const lines: PrintLine[] = [
    { t: 'text', v: o.restaurant, align: 'center', bold: true },
    { t: 'text', v: labels.title, align: 'center', bold: true, size: 2 },
    { t: 'text', v: `${fmt(shift.opened_at)} → ${fmt(shift.closed_at)}`, align: 'center' },
    { t: 'hr' },
    { t: 'row', l: labels.opening, r: money(shift.opening_cash) },
    { t: 'hr' },
  ];
  for (const m of ['cash', 'card', 'transfer', 'other']) {
    const v = by.get(m);
    if (v) lines.push({ t: 'row', l: `${labels.method(m)} (${v.count})`, r: money(v.amount) });
  }
  if (tips > 0) lines.push({ t: 'row', l: labels.tips, r: money(tips) });
  lines.push(
    { t: 'hr' },
    { t: 'row', l: `${labels.totalCharged} (${payments.length})`, r: money(total), bold: true },
    { t: 'hr' },
    { t: 'row', l: labels.expected, r: money(shift.expected_cash ?? 0) },
    { t: 'row', l: labels.counted, r: money(shift.closing_cash ?? 0) },
    { t: 'row', l: labels.diff, r: money(shift.over_short ?? 0), bold: true, size: 2 },
    { t: 'feed', n: 1 },
  );
  return { title: labels.title, lines };
}

/** What "Probar" prints: enough to see alignment, width and accents at a glance. */
export function testDoc(printerName: string, restaurant: string): PrintDoc {
  return {
    title: 'Prueba',
    lines: [
      { t: 'text', v: restaurant, align: 'center', bold: true, size: 2 },
      { t: 'text', v: 'Kuik · prueba de impresión', align: 'center' },
      { t: 'hr' },
      { t: 'row', l: 'Impresora', r: printerName },
      { t: 'row', l: 'Acentos', r: 'áéíóú ñ ¿? ¡!' },
      { t: 'row', l: 'Ancho', r: '$1,234.50' },
      { t: 'hr' },
      { t: 'text', v: 'Si esto se lee completo, la impresora está lista.', align: 'center' },
      { t: 'feed', n: 1 },
    ],
  };
}

/** A drawer kick with no paper. */
export function drawerDoc(): PrintDoc {
  return { title: 'Cajón', lines: [], cut: false, drawer: true };
}

// ── Reference renderer ──────────────────────────────────────────────────────

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const w of words) {
      if (cur.length === 0) cur = w;
      else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
      else {
        out.push(cur);
        cur = w;
      }
      while (cur.length > width) {
        out.push(cur.slice(0, width));
        cur = cur.slice(width);
      }
    }
    out.push(cur);
  }
  return out;
}

function align(s: string, width: number, a: PrintAlign): string {
  const pad = Math.max(0, width - s.length);
  if (a === 'right') return ' '.repeat(pad) + s;
  if (a === 'center') return ' '.repeat(Math.floor(pad / 2)) + s;
  return s;
}

/**
 * Lay a document out as fixed-width text. `width` is characters per line for
 * size-1 text; size-2 lines get half of it. Rows put the right column flush
 * right and trim the left one to fit, with at least one space between them.
 */
export function renderText(doc: PrintDoc, width: number): string[] {
  const out: string[] = [];
  for (const line of doc.lines) {
    switch (line.t) {
      case 'hr':
        out.push('-'.repeat(width));
        break;
      case 'feed':
        for (let i = 0; i < (line.n ?? 1); i++) out.push('');
        break;
      case 'text': {
        const w = line.size === 2 ? Math.floor(width / 2) : width;
        for (const s of wrap(line.v, w)) out.push(align(s, w, line.align ?? 'left'));
        break;
      }
      case 'row': {
        const w = line.size === 2 ? Math.floor(width / 2) : width;
        const r = line.r.slice(0, w);
        const room = Math.max(0, w - r.length - 1);
        let l = line.l;
        if (l.length > room) l = l.slice(0, room);
        out.push(l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r);
        break;
      }
    }
  }
  return out;
}

// ── HTML renderer (browser print dialog) ────────────────────────────────────

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

export function docToHtml(doc: PrintDoc): string {
  const parts: string[] = [];
  for (const line of doc.lines) {
    switch (line.t) {
      case 'hr':
        parts.push('<hr/>');
        break;
      case 'feed':
        parts.push(`<div style="height:${(line.n ?? 1) * 12}px"></div>`);
        break;
      case 'text': {
        const cls = [line.bold ? 'b' : '', line.size === 2 ? 'lg' : ''].filter(Boolean).join(' ');
        parts.push(`<div class="${cls}" style="text-align:${line.align ?? 'left'};white-space:pre-wrap">${esc(line.v)}</div>`);
        break;
      }
      case 'row': {
        const cls = ['row', line.bold ? 'b' : '', line.size === 2 ? 'lg' : ''].filter(Boolean).join(' ');
        parts.push(`<div class="${cls}"><span>${esc(line.l)}</span><span>${esc(line.r)}</span></div>`);
        break;
      }
    }
  }
  return parts.join('');
}
